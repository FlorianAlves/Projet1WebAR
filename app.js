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
  const sceneEl = document.querySelector("a-scene");

  sceneEl.addEventListener("arReady", () => console.log("✅ MindAR prêt"));
  sceneEl.addEventListener("renderstart", () => {
    console.log("▶️ A-Frame rendu démarré");

    // Style vidéo au cas où le CSS natif ne s'applique pas
    const vid = document.querySelector("video");
    if (vid) {
      Object.assign(vid.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        objectFit: "cover",
        zIndex: "0",
      });
    }
  });

  sceneEl.addEventListener("targetFound", () => {
    console.log("🎯 Cible détectée !");
    document.querySelector("#png-on-target").setAttribute("visible", true);
  });

  sceneEl.addEventListener("targetLost", () => {
    console.log("❌ Cible perdue !");
    document.querySelector("#png-on-target").setAttribute("visible", false);
  });
});