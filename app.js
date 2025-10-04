/************
 * Helpers
 ************/
const log = (m, ...r) => console.log(`[ar] ${m}`, ...r);

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
      max:       { type: 'int',    default: 300 },
      unitWidth: { type: 'number', default: 1 },
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

      // Découverte des frames par essai
      const pad = n => n.toString().padStart(this.data.pad, '0');
      let i = this.data.start;
      while (i < this.data.max) {
        const url = `${this.data.prefix}${pad(i)}.png`;
        const ok = await new Promise(resolve => {
          const im = new Image();
          im.onload  = () => resolve(true);
          im.onerror = () => resolve(false);
          im.src = url;
        });
        if (ok) {
          if (this.frames.length === 0) {
            // Charger la première pour ratio
            const im = new Image();
            await new Promise((resolve) => { im.onload = resolve; im.src = url; });
            const iw = im.naturalWidth  || im.width  || 1;
            const ih = im.naturalHeight || im.height || 1;
            const ratio = ih / iw;
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
            this.el.setAttribute('src', url); // anti flash blanc
          }
          this.frames.push(url);
          i++;
        } else {
          if (this.frames.length > 0) break;
          i++;
        }
      }

      if (!this.frames.length) {
        log('[png] aucune image trouvée pour', this.data.prefix);
        return;
      }

      // Précharge non bloquant
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
 * Composant : ar-target-loader (PNG + 3D par dossiers)
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
      modelPad:    { type: 'int',     default: 3 },    // model_000.glb
      modelStart:  { type: 'int',     default: 0 },
      modelMax:    { type: 'int',     default: 30 },   // limite raisonnable
      // Noms “classiques” essayés en premier
      preferNames: { type: 'string',  default: 'model.glb,scene.glb,index.glb,model.gltf,scene.gltf,index.gltf' },

      // Placement 3D par défaut
      modelPos:    { type: 'string',  default: '0 0 0' },
      modelRot:    { type: 'string',  default: '0 0 0' },
      modelScale:  { type: 'string',  default: '1 1 1' },

      // Animation 3D
      animClip:    { type: 'string',  default: '*' },  // * = toutes
      animLoop:    { type: 'string',  default: 'repeat' }
    },

    async init() {
      const root = this.el;
      this.assets = { png: null, models: [] };

      // 1) PNG
      if (this.data.pngPrefix) {
        const img = document.createElement('a-image');
        img.setAttribute('visible', 'false');
        img.setAttribute('png-sequence',
          `prefix: ${this.data.pngPrefix}; fps: ${this.data.fps}; unitWidth: ${this.data.unitWidth}; fit: ${this.data.fit}`);
        root.appendChild(img);
        this.assets.png = img;
      }

      // 2) 3D : ESSAIS SANS HEAD — on crée les entités directement.
      if (this.data.modelsDir) {
        const dir = this.data.modelsDir.endsWith('/') ? this.data.modelsDir : this.data.modelsDir + '/';

        // a) Noms “classiques”
        const preferred = this.data.preferNames.split(',').map(s => s.trim()).filter(Boolean);
        let created = false;
        for (const name of preferred) {
          const url = dir + name;
          const ent = document.createElement('a-entity');
          ent.setAttribute('visible', 'false');
          ent.setAttribute('gltf-model', `url(${url})`);
          ent.setAttribute('position', this.data.modelPos);
          ent.setAttribute('rotation', this.data.modelRot);
          ent.setAttribute('scale',    this.data.modelScale);
          ent.setAttribute('animation-mixer', `clip: ${this.data.animClip}; loop: ${this.data.animLoop}; timeScale: 0`);
          root.appendChild(ent);
          this.assets.models.push(ent);
          created = true;
          // on s’arrête au premier réussi (si les autres 404, ça n’empêche rien)
          break;
        }

        // b) Séquence model_000.glb → model_0xx.glb si rien en “classique”
        if (!created) {
          const pad = n => n.toString().padStart(this.data.modelPad, '0');
          let any = false;
          for (let i = this.data.modelStart; i < this.data.modelMax; i++) {
            const glb = dir + `model_${pad(i)}.glb`;
            const gltf = dir + `model_${pad(i)}.gltf`;
            // on crée l'entité pour glb puis gltf (l’un des deux peut exister)
            [glb, gltf].forEach(url => {
              const ent = document.createElement('a-entity');
              ent.setAttribute('visible', 'false');
              ent.setAttribute('gltf-model', `url(${url})`);
              ent.setAttribute('position', this.data.modelPos);
              ent.setAttribute('rotation', this.data.modelRot);
              ent.setAttribute('scale',    this.data.modelScale);
              ent.setAttribute('animation-mixer', `clip: ${this.data.animClip}; loop: ${this.data.animLoop}; timeScale: 0`);
              root.appendChild(ent);
              this.assets.models.push(ent);
              any = true;
            });
            if (any) break; // on arrête à la 1ère index valide potentielle
          }
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
          if (am) am.data.timeScale = 1;  // play
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
          if (am) am.data.timeScale = 0;  // pause
          ent.setAttribute('visible', 'false');
        });
      });
    }
  });
}