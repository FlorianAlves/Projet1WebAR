// ===== Débug helper
const dbg = (msg, ...rest) => console.log(`[png-seq] ${msg}`, ...rest);

// ===== Déclaration unique du composant
if (!AFRAME.components['png-sequence']) {
  AFRAME.registerComponent('png-sequence', {
    schema: {
      prefix:    { type: 'string' },       // ex: ./animations/target0/frame_
      count:     { type: 'int', default: 20 },
      fps:       { type: 'number', default: 12 },
      unitWidth: { type: 'number', default: 1 },   // largeur en unités AR
      fit:       { type: 'string', default: 'width' } // 'width' | 'height'
    },

    async init() {
      this.playing  = false;
      this.frame    = 0;
      this.elapsed  = 0;
      this.duration = 1000 / this.data.fps;

      // Génère la liste des URLs
      const pad = n => n.toString().padStart(3, '0');
      this.frames = Array.from({ length: this.data.count }, (_, i) => `${this.data.prefix}${pad(i)}.png`);

      // Attendre que l'entité <a-image> soit prête
      await new Promise(res => {
        if (this.el.hasLoaded) return res();
        this.el.addEventListener('loaded', res, { once: true });
      });

      // Charger la 1ʳᵉ image pour récupérer les dimensions
      const firstURL = this.frames[0];
      dbg('Chargement de la 1ʳᵉ image', firstURL);
      try {
        const { width: iw, height: ih } = await loadImage(firstURL);
        dbg('1ʳᵉ image chargée', { iw, ih });

        if (!iw || !ih) throw new Error('Dimensions invalides de la 1ʳᵉ image');

        const ratio = ih / iw; // h/w
        if (this.data.fit === 'width') {
          const w = this.data.unitWidth;
          const h = w * ratio;
          this.el.setAttribute('width', w);
          this.el.setAttribute('height', h);
          dbg('Dimensions appliquées (fit=width)', { w, h, ratio });
        } else {
          const h = this.data.unitWidth;
          const w = h / ratio;
          this.el.setAttribute('width', w);
          this.el.setAttribute('height', h);
          dbg('Dimensions appliquées (fit=height)', { w, h, ratio });
        }

        // Matériau : transparence PNG & double face
        this.el.setAttribute('material', 'transparent: true; alphaTest: 0.01; side: double');

        // Met immédiatement la première frame pour éviter le flash blanc
        this.el.setAttribute('src', firstURL);

        // Précharge silencieusement toutes les frames (sans bloquer)
        this.frames.forEach(u => { const im = new Image(); im.src = u; });
        dbg('Préchargement déclenché', this.frames.length);

      } catch (err) {
        console.error('[png-seq] Échec de chargement de la 1ʳᵉ image:', firstURL, err);
        // Fallback : taille par défaut pour ne pas rester invisible
        this.el.setAttribute('width',  this.data.unitWidth || 1);
        this.el.setAttribute('height', this.data.unitWidth || 1);
        this.el.setAttribute('material', 'transparent: true; alphaTest: 0.01; side: double');
        this.el.setAttribute('src', firstURL);
      }
    },

    start() {
      this.playing  = true;
      this.frame    = 0;
      this.elapsed  = 0;
      // on re-met le frame 0 pour assurer l’affichage instantané
      this.el.setAttribute('src', this.frames[0]);
      dbg('Animation START');
    },

    stop() {
      this.playing = false;
      this.frame   = 0;
      this.el.setAttribute('src', this.frames[0]);
      dbg('Animation STOP');
    },

    tick(t, dt) {
      if (!this.playing || !this.frames || !this.frames.length) return;
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.elapsed = 0;
        this.frame = (this.frame + 1) % this.frames.length;
        this.el.setAttribute('src', this.frames[this.frame]);
      }
    }
  });
}

// --- util: charge une image et renvoie ses dimensions
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload  = () => resolve({ width: im.naturalWidth || im.width, height: im.naturalHeight || im.height });
    im.onerror = (e) => reject(e);
    im.src = url;
  });
}

// =======================
// Logique multi-cibles : start/stop par entité
// =======================
document.addEventListener('DOMContentLoaded', () => {
  const sceneEl = document.querySelector('a-scene');

  sceneEl.addEventListener('renderstart', () => {
    const targets = sceneEl.querySelectorAll('[mindar-image-target]');

    targets.forEach(targetEl => {
      const attr = targetEl.getAttribute('mindar-image-target') || {};
      const targetIndex = (typeof attr === 'object') ? attr.targetIndex : attr; // compat
      const imgEl = targetEl.querySelector('a-image');

      if (!imgEl) {
        console.warn(`⚠️ Pas d'<a-image> enfant pour targetIndex ${targetIndex}`);
        return;
      }

      const pngSeq = imgEl.components['png-sequence'];
      if (!pngSeq) {
        console.error(`❌ png-sequence non attaché à ${imgEl.id ? '#'+imgEl.id : '<a-image>'}. As-tu bien mis l’attribut png-sequence="..." ?`);
        return;
      }

      targetEl.addEventListener('targetFound', () => {
        dbg(`Target ${targetIndex} FOUND`);
        imgEl.setAttribute('visible', 'true');
        pngSeq.start();
      });

      targetEl.addEventListener('targetLost', () => {
        dbg(`Target ${targetIndex} LOST`);
        pngSeq.stop();
        imgEl.setAttribute('visible', 'false');
      });
    });
  });
});