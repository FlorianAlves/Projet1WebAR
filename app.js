document.addEventListener('DOMContentLoaded', () => {
  const sceneEl = document.querySelector('a-scene');
  const pngEl   = document.querySelector('#png-on-target');

  if (!pngEl) {
    console.error('❌ #png-on-target introuvable dans le DOM');
    return;
  }

  const pngSeq = pngEl.components['png-sequence'];
  if (!pngSeq) {
    console.error('❌ Component png-sequence non trouvé sur #png-on-target');
    return;
  }

  sceneEl.addEventListener('arReady', () => {
    console.log('✅ MindAR prêt');
  });

  sceneEl.addEventListener('renderstart', () => {
    console.log('▶️ A-Frame rendu démarré');
    // Applique le style vidéo si besoin :
    const vid = document.querySelector('video');
    if (vid) {
      Object.assign(vid.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        objectFit: 'cover',
        zIndex: '0'
      });
    }
  });

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
