document.addEventListener('DOMContentLoaded', () => {
  const sceneEl = document.querySelector('a-scene');

  sceneEl.addEventListener('renderstart', () => {
    // On récupère tous les entities de tracking
    const targets = sceneEl.querySelectorAll('[mindar-image-target]');

    targets.forEach(targetEl => {
      // Récupère l'index et l'image associée
      const { targetIndex } = targetEl.getAttribute('mindar-image-target');
      const imgEl = targetEl.querySelector('a-image');

      if (!imgEl) {
        console.warn(`⚠️ Pas d'<a-image> trouvé pour targetIndex ${targetIndex}`);
        return;
      }

      // Récupère le component png-sequence
      const pngSeq = imgEl.components['png-sequence'];
      if (!pngSeq) {
        console.error(`❌ png-sequence non attaché à #${imgEl.id}`);
        return;
      }

      // Quand cette cible est détectée
      targetEl.addEventListener('targetFound', () => {
        console.log(`🎯 Target ${targetIndex} détectée`);
        imgEl.setAttribute('visible', 'true');
        pngSeq.start();
      });

      // Quand cette cible est perdue
      targetEl.addEventListener('targetLost', () => {
        console.log(`🚫 Target ${targetIndex} perdue`);
        pngSeq.stop();
        imgEl.setAttribute('visible', 'false');
      });
    });
  });
});