/* ============================================================================
 *  Composant A-Frame : png-sequence
 *  Rejoue une séquence d’images nommées  prefix + XXX + .png   (XXX = 000,001…)
 *  Props :
 *    - prefix : chemin + préfixe du fichier (string)
 *    - count  : nombre total d’images     (int)
 *    - fps    : images par seconde        (number, default 12)
 * --------------------------------------------------------------------------*/
AFRAME.registerComponent('png-sequence', {
  schema: {
    prefix: {type: 'string'},
    count : {type: 'int'},
    fps   : {type: 'number', default: 12}
  },

  init() {
    this.frame = 0;
    this.elapsed = 0;
    this.duration = 1000 / this.data.fps;
    this.playing = false;

    // Pré-charge léger : crée un objet Image pour chaque frame
    const pad = n => n.toString().padStart(3, '0');
    this.frames = [...Array(this.data.count).keys()]
      .map(i => `${this.data.prefix}${pad(i)}.png`)
      .map(src => { const img = new Image(); img.src = src; return src; });
  },

  /* Démarre / stop l’animation (appelé depuis le script AR) */
  start() { this.playing = true; }
  ,
  stop()  { this.playing = false; this.frame = 0; }
  ,

  tick(time, delta) {
    if (!this.playing) return;

    this.elapsed += delta;
    if (this.elapsed >= this.duration) {
      this.elapsed = 0;
      this.frame = (this.frame + 1) % this.data.count;
      this.el.setAttribute('src', this.frames[this.frame]);
    }
  }
});

/* ============================================================================
 *  Gestion de la détection MindAR
 * --------------------------------------------------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  const pngEl = document.querySelector("#png-on-target");

  if (!pngEl) {
    console.error("❌ Impossible de trouver #png-on-target dans le DOM");
    return;
  }

  // Récupérer le component png-sequence si tu l’utilises
  const pngSeq = pngEl.components["png-sequence"];

  scene.addEventListener("targetFound", () => {
    console.log("🎯 Cible détectée !");
    pngEl.setAttribute("visible", "true");
    if (pngSeq) pngSeq.start();  // démarre l’animation si tu utilises le component
  });

  scene.addEventListener("targetLost", () => {
    console.log("🚫 Cible perdue !");
    if (pngSeq) pngSeq.stop();
    pngEl.setAttribute("visible", "false");
  });
});