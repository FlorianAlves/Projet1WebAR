/* ============================================================================
 *  Composant A-Frame : png-sequence
 *  Gère une séquence d’images préchargées et animées en boucle.
 *  Props :
 *    - prefix : chemin + préfixe du fichier (string)
 *    - count  : nombre total d’images     (int)
 *    - fps    : images par seconde        (number, default 12)
 * --------------------------------------------------------------------------*/
AFRAME.registerComponent('png-sequence', {
  schema: {
    prefix: { type: 'string' },
    count:  { type: 'int',    default: 20 },
    fps:    { type: 'number', default: 12 }
  },

  init() {
    // Pré-charger toutes les images dans le cache navigateur
    const pad = n => n.toString().padStart(3, '0');
    this.frames = Array.from({ length: this.data.count }, (_, i) =>
      `${this.data.prefix}${pad(i)}.png`
    ).map(src => {
      const img = new Image();
      img.src = src;
      return src;
    });

    // Afficher immédiatement le premier frame pour éviter le carré blanc
    this.frame    = 0;
    this.el.setAttribute('src', this.frames[0]);

    // Initialiser les timers
    this.elapsed  = 0;
    this.duration = 1000 / this.data.fps;
    this.playing  = false;
  },

  start() {
    // Remise à zéro et affichage du premier frame avant de démarrer
    this.frame   = 0;
    this.elapsed = 0;
    this.el.setAttribute('src', this.frames[0]);
    this.playing = true;
  },

  stop() {
    this.playing = false;
    this.frame   = 0;
    // Remettre en option le premier frame
    this.el.setAttribute('src', this.frames[0]);
  },

  tick(time, delta) {
    if (!this.playing) return;
    this.elapsed += delta;
    if (this.elapsed >= this.duration) {
      this.elapsed = 0;
      this.frame = (this.frame + 1) % this.frames.length;
      this.el.setAttribute('src', this.frames[this.frame]);
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const sceneEl = document.querySelector('a-scene');

  // Attendre que la scène ait fini de charger tous les components
  sceneEl.addEventListener('renderstart', () => {
    // Sélectionne toutes les entités trackées
    const targets = sceneEl.querySelectorAll('[mindar-image-target]');

    targets.forEach(targetEl => {
      // Récupère l’index de cette cible
      const { targetIndex } = targetEl.getAttribute('mindar-image-target');
      // Récupère l’image associée
      const imgEl = targetEl.querySelector('a-image');

      if (!imgEl) {
        console.warn(`⚠️ Aucune <a-image> trouvée pour targetIndex ${targetIndex}`);
        return;
      }

      // Récupère le component png-sequence sur cette image
      const pngSeq = imgEl.components['png-sequence'];
      if (!pngSeq) {
        console.error(`❌ Le component png-sequence n’est pas attaché à #${imgEl.id}`);
        return;
      }

      // Quand cette cible est détectée, affiche et démarre l’animation
      targetEl.addEventListener('targetFound', () => {
        console.log(`🎯 Cible ${targetIndex} détectée !`);
        imgEl.setAttribute('visible', 'true');
        pngSeq.start();
      });

      // Quand cette cible est perdue, stoppe et cache l’animation
      targetEl.addEventListener('targetLost', () => {
        console.log(`🚫 Cible ${targetIndex} perdue !`);
        pngSeq.stop();
        imgEl.setAttribute('visible', 'false');
      });
    });
  });
});
