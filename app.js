/***********************
 * Helpers
 ***********************/
const log = (m, ...r) => console.log(`[ar] ${m}`, ...r);

// HEAD pour éviter de tout télécharger (GitHub Pages ok)
async function urlExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch { return false; }
}

function loadImageMeta(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload  = () => resolve({ width: im.naturalWidth || im.width, height: im.naturalHeight || im.height, src: url });
    im.onerror = () => reject(new Error('IMAGE_NOT_FOUND'));
    im.src = url;
  });
}

/********************************************
 * Composant : png-sequence (auto-count)
 ********************************************/
if (!AFRAME.components['png-sequence']) {
  AFRAME.registerComponent('png-sequence', {
    schema: {
      prefix:    { type: 'string' },        // ./animations/targetX/frame_
      fps:       { type: 'number', default: 12 },
      pad:       { type: 'int',    default: 3 },   // 000-999
      start:     { type: 'int',    default: 0 },
      max:       { type: 'int',    default: 300 }, // garde-fou
      unitWidth: { type: 'number', default: 1 },   // largeur en unités AR
      fit:       { type: 'string', default: 'width' } // 'width' | 'height'
    },

    async init() {
      this.playing = false;
      this.frame = 0;
      this.elapsed = 0;
      this.duration = 1000 / this.data.fps;
      this.frames = [];
      this.ready = false;
      this.deferStart = false;

      await new Promise(res => (this.el.hasLoaded ? res() : this.el.addEventListener('loaded', res, { once: true })));

      // Découverte des frames
      const pad = n => n.toString().padStart(this.data.pad, '0');
      let i = this.data.start;
      while (i < this.data.max) {
        const url = `${this.data.prefix}${pad(i)}.png`;
        try {
          const meta = await loadImageMeta(url);
          if (this.frames.length === 0) {
            const ratio = meta.height / meta.width; // h/w
            if (this.data.fit === 'width') {
              const w = this.data.unitWidth, h = w * ratio;
              this.el.setAttribute('width', w);
              this.el.setAttribute('height', h);
            } else {
              const h = this.data.unitWidth, w = h / ratio;
              this.el.setAttribute('width', w);
              this.el.setAttribute('height', h);
            }
            this.el.setAttribute('material', 'transparent: true; alphaTest: 0.01; side: double');
            this.el.setAttribute('src', meta.src); // anti flash blanc
          }
          this.frames.push(meta.src);
          i++;
        } catch {
          if (this.frames.length > 0) break;
          i++;
        }
      }

      if (!this.frames.length) {
        console.warn('[png-sequence] Aucune image trouvée pour', this.data.prefix);
        return;
      }

      // Précharge (non bloquant)
      this.frames.forEach(u => { const im = new Image(); im.src = u; });

      this.ready = true;
      if (this.deferStart) this._reallyStart();
    },

    _reallyStart() {
      if (!this.ready) { this.deferStart = true; return; }
      this.deferStart = false;
      this.playing = true;
      this.frame = 0;
      this.elapsed = 0;
      this.el.setAttribute('src', this.frames[0]);
    },

    start() { this._reallyStart(); },

    stop() {
      this.playing = false;
      this.frame = 0;
      if (this.frames.length) this.el.setAttribute('src', this.frames[0]);
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

/******************************************************
 * Composant : ar-target-loader (PNG + 3D via dossiers)
 ******************************************************/
if (!AFRAME.components['ar-target-loader']) {
  AFRAME.registerComponent('ar-target-loader', {
    schema: {
      // Séquence PNG (facultatif)
      pngPrefix:   { type: 'string', default: '' },
      fps:         { type: 'number', default: 12 },
      unitWidth:   { type: 'number', default: 1 },
      fit:         { type: 'string',  default: 'width' },

      // Dossier modèles 3D (facultatif)
      modelsDir:   { type: 'string',  default: '' },

      // Options scan 3D
      modelPad:    { type: 'int',     default: 3 },   // model_000.glb
      modelStart:  { type: 'int',     default: 0 },
      modelMax:    { type: 'int',     default: 50 },  // limite de sondes
      // Noms “classiques” essayés en premier
      preferNames: { type: 'string',  default: 'model.glb,scene.glb,model.gltf,scene.gltf,index.glb,index.gltf' },

      // Placement 3D par défaut
      modelPos:    { type: 'string',  default: '0 0 0' },
      modelRot:    { type: 'string',  default: '0 0 0' },
      modelScale:  { type: 'string',  default: '1 1 1' },

      // Animation 3D
      animClip:    { type: 'string',  default: '*' }, // * = toutes
      animLoop:    { type: 'string',  default: 'repeat' }
    },

    async init() {
      const root = this.el;
      this.assets = { png: null, models: [] };

      // 1) PNG (si demandé)
      if (this.data.pngPrefix) {
        const img = document.createElement('a-image');
        img.setAttribute('visible', 'false');
        img.setAttribute('png-sequence', `
          prefix: ${this.data.pngPrefix};
          fps: ${this.data.fps};
          unitWidth: ${this.data.unitWidth};
          fit: ${this.data.fit}
        `);
        root.appendChild(img);
        this.assets.png = img;
      }

      // 2) Scan dossier 3D (si fourni)
      if (this.data.modelsDir) {
        const dir = this.data.modelsDir.endsWith('/') ? this.data.modelsDir : this.data.modelsDir + '/';

        // a) Noms “classiques” en priorité
        const preferred = this.data.preferNames.split(',').map(s => s.trim()).filter(Boolean);
        const found = [];
        for (const name of preferred) {
          const url = dir + name;
          // eslint-disable-next-line no-await-in-loop
          if (await urlExists(url)) { found.push(url); break; } // on prend le premier trouvé
        }

        // b) Si rien trouvé, tenter une séquence : model_000.glb → …
        if (found.length === 0) {
          const pad = n => n.toString().padStart(this.data.modelPad, '0');
          let i = this.data.modelStart;
          while (i < this.data.modelMax) {
            const glb = dir + `model_${pad(i)}.glb`;
            const gltf = dir + `model_${pad(i)}.gltf`;
            // eslint-disable-next-line no-await-in-loop
            if (await urlExists(glb)) { found.push(glb); i++; continue; }
            // eslint-disable-next-line no-await-in-loop
            if (await urlExists(gltf)) { found.push(gltf); i++; continue; }
            // trou : si on a déjà au moins un modèle, on s'arrête
            if (found.length > 0) break;
            i++;
          }
        }

        // c) Instancier chaque modèle trouvé
        for (const src of found) {
          const ent = document.createElement('a-entity');
          ent.setAttribute('visible', 'false');
          ent.setAttribute('gltf-model', `url(${src})`);
          ent.setAttribute('position', this.data.modelPos);
          ent.setAttribute('rotation', this.data.modelRot);
          ent.setAttribute('scale',    this.data.modelScale);
          ent.setAttribute('animation-mixer', `clip: ${this.data.animClip}; loop: ${this.data.animLoop}; timeScale: 0`);
          root.appendChild(ent);
          this.assets.models.push(ent);
        }

        if (!this.assets.models.length) {
          log('Aucun modèle 3D trouvé dans', dir);
        }
      }

      // 3) targetFound / targetLost
      root.addEventListener('targetFound', () => {
        if (this.assets.png) {
          this.assets.png.setAttribute('visible', 'true');
          const comp = this.assets.png.components['png-sequence'];
          if (comp) comp.start();
        }
        this.assets.models.forEach(ent => {
          ent.setAttribute('visible', 'true');
          const am = ent.components['animation-mixer'];
          if (am) { am.data.timeScale = 1; } // play
        });
      });

      root.addEventListener('targetLost', () => {
        if (this.assets.png) {
          const comp = this.assets.png.components['png-sequence'];
          if (comp) comp.stop();
          this.assets.png.setAttribute('visible', 'false');
        }
        this.assets.models.forEach(ent => {
          const am = ent.components['animation-mixer'];
          if (am) { am.data.timeScale = 0; } // pause
          ent.setAttribute('visible', 'false');
        });
      });
    }
  });
}