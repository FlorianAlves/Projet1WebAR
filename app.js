document.addEventListener('DOMContentLoaded', () => {
  const sceneEl = document.querySelector('a-scene');

  sceneEl.addEventListener('renderstart', () => {
    // À CE MOMENT LÀ, A-Frame a monté tous les components
    const pngEl = document.querySelector('#png-on-target');
    if (!pngEl) {
      console.error('❌ #png-on-target introuvable');
      return;
    }
    const pngSeq = pngEl.components['png-sequence'];
    if (!pngSeq) {
      console.error('❌ png-sequence non attaché à #png-on-target');
      return;
    }

    // Maintenant que tout est prêt, on branche targetFound / Lost
    sceneEl.addEventListener('targetFound', () => {
      console.log('🎯 Cible détectée !');
      pngEl.setAttribute('visible', 'true');
      pngSeq.start();
    });
    sceneEl.addEventListener('targetLost', () => {
      console.log('🚫 Cible perdue !');
      pngSeq.stop();
      pngEl.setAttribute('visible', 'false');
    });
  });
});
