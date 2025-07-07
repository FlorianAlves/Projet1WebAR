document.addEventListener('DOMContentLoaded', () => {
  const sceneEl = document.querySelector('a-scene');

  // Prépare un tableau pour retrouver vite le PNG et son component
  const sequences = [
    { el: document.querySelector('#png-0'), comp: null },
    { el: document.querySelector('#png-1'), comp: null },
    // { el: document.querySelector('#png-2'), comp: null }, etc.
  ];

  sceneEl.addEventListener('renderstart', () => {
    // Récupère ici les components, après que la scène soit prête
    sequences.forEach(seq => {
      if (seq.el) {
        seq.comp = seq.el.components['png-sequence'];
      }
    });
  });

  sceneEl.addEventListener('targetFound', (e) => {
    const idx = e.detail.targetIndex;
    console.log(`🎯 Target ${idx} détectée`);
    const seq = sequences[idx];
    if (seq && seq.el && seq.comp) {
      seq.el.setAttribute('visible', 'true');
      seq.comp.start();
    }
  });

  sceneEl.addEventListener('targetLost', (e) => {
    const idx = e.detail.targetIndex;
    console.log(`🚫 Target ${idx} perdue`);
    const seq = sequences[idx];
    if (seq && seq.el && seq.comp) {
      seq.comp.stop();
      seq.el.setAttribute('visible', 'false');
    }
  });
});