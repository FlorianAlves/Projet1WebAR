// Composant unique (protéger contre double-déclaration si besoin)
if (!AFRAME.components['png-sequence']) {
  AFRAME.registerComponent('png-sequence', {
    schema: {
      prefix:    { type: 'string' },      // ex: ./animations/target0/frame_
      count:     { type: 'int', default: 20 },
      fps:       { type: 'number', default: 12 },
      unitWidth: { type: 'number', default: 1 }, // largeur en unités AR (1 = largeur de la target MindAR)
      fit:       { type: 'string', default: 'width' } 
      // 'width' -> fixe la largeur à unitWidth et calcule la hauteur avec le ratio (recommandé)
      // 'height' -> fixe la hauteur à unitWidth et calcule la largeur avec le ratio inverse
    },

    init() {
      this.playing  = false;
      this.frame    = 0;
      this.elapsed  = 0;
      this.duration = 1000 / this.data.fps;

      // Prépare la liste des URLs
      const pad = n => n.toString().padStart(3,'0');
      this.frames = Array.from({ length: this.data.count }, (_, i) =>
        `${this.data.prefix}${pad(i)}.png`
      );

      // Pré-charge tout + récupère la 1ère image pour la taille
      const first = new Image();
      first.onload = () => {
        // Ratio de la première frame
        const iw = first.naturalWidth  || first.width  || 1;
        const ih = first.naturalHeight || first.height || 1;
        const ratio = ih / iw; // h/w

        // Dimensionne le plan en conservant le ratio
        if (this.data.fit === 'width') {
          const w = this.data.unitWidth;
          const h = w * ratio;
          this.el.setAttribute('width',  w);
          this.el.setAttribute('height', h);
        } else {
          const h = this.data.unitWidth;
          const w = h / ratio;
          this.el.setAttribute('width',  w);
          this.el.setAttribute('height', h);
        }

        // Propriétés matérielles utiles (alpha PNG, éviter les artefacts)
        this.el.setAttribute('material', 'transparent: true; alphaTest: 0.01; side: double');

        // Définir immédiatement le premier visuel (évite le carré blanc)
        this.el.setAttribute('src', this.frames[0]);

        // Pré-charge silencieuse de toutes les frames
        this.frames.forEach(src => { const img = new Image(); img.src = src; });
      };
      first.src = this.frames[0];
    },

    start() {
      this.playing  = true;
      this.frame    = 0;
      this.elapsed  = 0;
      this.el.setAttribute('src', this.frames[0]);
    },

    stop() {
      this.playing = false;
      this.frame   = 0;
      this.el.setAttribute('src', this.frames[0]);
    },

    tick(t, dt) {
      if (!this.playing) return;
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.elapsed = 0;
        this.frame = (this.frame + 1) % this.frames.length;
        this.el.setAttribute('src', this.frames[this.frame]);
      }
    }
  });
}