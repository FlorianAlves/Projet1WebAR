// -- Petit helper de log
const dbg = (msg, ...rest) => console.log(`[png-seq] ${msg}`, ...rest);

// -- Charge une image et renvoie {width, height}
function loadImageMeta(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload  = () => resolve({ width: im.naturalWidth || im.width, height: im.naturalHeight || im.height, src: url });
    im.onerror = () => reject(new Error('IMAGE_NOT_FOUND'));
    im.src = url;
  });
}

// ======================================================================
// Composant A-Frame : png-sequence (auto-count)
// ======================================================================
if (!AFRAME.components['png-sequence']) {
  AFRAME.registerComponent('png-sequence', {
    schema: {
      prefix:    { type: 'string' },       // ex: ./animations/target0/frame_
      fps:       { type: 'number', default: 12 },
      pad:       { type: 'int',    default: 3 },   // zéros : 000, 001…
      start:     { type: 'int',    default: 0 },   // index de départ
      max:       { type: 'int',    default: 300 }, // garde-fou
      unitWidth: { type: 'number', default: 1 },   // largeur (en unités AR)
      fit:       { type: 'string', default: 'width' } // 'width' | 'height'
    },

    async init() {
      this.playing  = false;
      this.frame    = 0;
      this.elapsed  = 0;
      this.duration = 1000 / this.data.fps;
      this.frames   = [];
      this.ready    = false;
      this.deferStart = false;

      // Attendre que l'entité <a-image> soit prête
      await new Promise(res => (this.el.hasLoaded ? res() : this.el.addEventListener('loaded', res, { once: true })));

      // Découverte automatique des frames
      const pad = n => n.toString().padStart(this.data.pad, '0');
      let i = this.data.start;
      dbg('Découverte des frames…');
      try {
        // Charger au moins 1 frame, puis s'arrêter au 1er trou
        while (i < this.data.max) {
          const url = `${this.data.prefix}${pad(i)}.png`;
          try {
            const meta = await loadImageMeta(url);
            if (this.frames.length === 0) {
              // Dimensionner l'élément avec le BON ratio dès la 1ère image
              const ratio = meta.height / meta.width; // h/w
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
              // Matériau: transparence PNG & double face
              this.el.setAttribute('material', 'transparent: true; alphaTest: 0.01; side: double');
              // Mettre tout de suite le 1er visuel (évite le flash blanc)
              this.el.setAttribute('src', meta.src);
              dbg('1ère image OK → dimensions appliquées', { w: this.el.getAttribute('width'), h: this.el.getAttribute('height') });
            }
            this.frames.push(meta.src); // garde l’URL
            i++;
          } catch {
            // trou détecté : on s'arrête une fois qu'on a au moins 1 image
            if (this.frames.length > 0) break;
            // sinon, rien trouvé dès le départ → on avance et on continue d'essayer
            i++;
          }
        }
      } catch (e) {
        console.error('[png-seq] Erreur durant la découverte:', e);
      }

      if (this.frames.length === 0) {
        console.error('[png-seq] Aucune image trouvée pour le prefix:', this.data.prefix);
        // Fallback pour ne pas rester invisible
        this.el.setAttribute('width',  this.data.unitWidth || 1);
        this.el.setAttribute('height', this.data.unitWidth || 1);
        return;
      }

      // Pré-charger le reste (non bloquant)
      this.frames.forEach(u => { const im = new Image(); im.src = u; });

      this.ready = true;
      dbg(`Découverte terminée : ${this.frames.length} frame(s)`);
      if (this.deferStart) this._reallyStart();
    },

    _reallyStart() {
      if (!this.ready) { this.deferStart = true; return; }
      this.deferStart = false;
      this.playing  = true;
      this.frame    = 0;
      this.elapsed  = 0;
      this.el.setAttribute('src', this.frames[0]);
      dbg('Animation START');
    },

    start() { this._reallyStart(); },

    stop() {
      this.playing = false;
      this.frame   = 0;
      if (this.frames.length) this.el.setAttribute('src', this.frames[0]);
      dbg('Animation STOP');
    },

    tick(t, dt) {
      if (!this.playing || !this.frames.length) return;
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.elapsed = 0;
        this.frame = (this.frame + 1) % this.frames.length;
        this.el.setAttribute('src', this.frames[this.frame]);
      }
    }
  });
}

// ======================================================================
// Logique multi-cibles : chaque entity contrôle sa propre séquence
// ======================================================================
document.addEventListener('DOMContentLoaded', () => {
  const sceneEl = document.querySelector('a-scene');

  sceneEl.addEventListener('renderstart', () => {
    const targets = sceneEl.querySelectorAll('[mindar-image-target]');

    targets.forEach(targetEl => {
      const attr = targetEl.getAttribute('mindar-image-target') || {};
      const targetIndex = (typeof attr === 'object') ? attr.targetIndex : attr;
      const imgEl = targetEl.querySelector('a-image');

      if (!imgEl) {
        console.warn(`⚠️ Pas d'<a-image> pour targetIndex ${targetIndex}`);
        return;
      }

      const seq = imgEl.components['png-sequence'];
      if (!seq) {
        console.error(`❌ png-sequence non attaché à ${imgEl.id ? '#'+imgEl.id : '<a-image>'}. Ajoute l’attribut png-sequence="prefix: …"`);
        return;
      }

      targetEl.addEventListener('targetFound', () => {
        dbg(`Target ${targetIndex} FOUND`);
        imgEl.setAttribute('visible', 'true');
        seq.start();
      });

      targetEl.addEventListener('targetLost', () => {
        dbg(`Target ${targetIndex} LOST`);
        seq.stop();
        imgEl.setAttribute('visible', 'false');
      });
    });
  });
});