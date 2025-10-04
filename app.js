/************
 * Helpers
 ************/
const log = (m, ...r) => console.log(`[ar] ${m}`, ...r);

/********************************************
 * Composant : png-sequence (auto-count)
 * - détecte frame_000.png → …
 * - calcule le ratio réel et dimensionne l’<a-image>
 * - affiche la 1ère frame immédiatement (anti flash blanc)
 ********************************************/
if (!AFRAME.components['png-sequence']) {
  AFRAME.registerComponent('png-sequence', {
    schema: {
      prefix:    { type: 'string' },        // ./animations/targetX/frame_
      fps:       { type: 'number', default: 12 },
      pad:       { type: 'int',    default: 3 },   // 000-999
      start:     { type: 'int',    default: 0 },
      max:       { type: 'int',    default: 300 }, // garde-fou
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
            // charge la 1ère pour connaître le ratio
            const im = new Image();
            await new Promise(resolve => { im.onload = resolve; im.src = url; });
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

      // précharge non bloquant
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
 * - pngPrefix : séquence PNG auto
 * - modelsDir : cherche un modèle 3D (model.glb/scene.glb/index.glb ou .gltf)
 *               ou model_000.glb(gltf) comme séquence simple
 * - joue / met en pause les animations GLB via animation-mixer
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
      modelMax:    { type: 'int',     default: 30 },
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

      // 2) 3D : crée des entités candidates ; celles qui 404 n’empêchent pas le reste
      if (this.data.modelsDir) {
        const dir = this.data.modelsDir.endsWith('/') ? this.data.modelsDir : this.data.modelsDir + '/';

        const preferred = this.data.preferNames.split(',').map(s => s.trim()).filter(Boolean);
        let created = false;

        // a) Essayer des noms “classiques” (on garde le premier qui charge)
        for (const name of preferred) {
          const url = dir + name;
          const ent = this._createModelEntity(url);
          root.appendChild(ent);
          this.assets.models.push(ent);
          created = true;
          break; // on laisse A-Frame gérer; si 404, model-error sera logué mais le reste continue
        }

        // b) Si rien trouvé, tenter une séquence model_000 → model_0xx
        if (!created) {
          const pad = n => n.toString().padStart(this.data.modelPad, '0');
          let any = false;
          for (let i = this.data.modelStart; i < this.data.modelMax; i++) {
            const urls = [dir + `model_${pad(i)}.glb`, dir + `model_${pad(i)}.gltf`];
            urls.forEach(url => {
              const ent = this._createModelEntity(url);
              root.appendChild(ent);
              this.assets.models.push(ent);
              any = true;
            });
            if (any) break;
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
          // IMPORTANT : piloter le mixer via setAttribute
          ent.setAttribute('animation-mixer', 'timeScale: 1');  // PLAY
        });
      });

      root.addEventListener('targetLost', () => {
        if (this.assets.png) {
          const comp = this.assets.png.components['png-sequence'];
          if (comp) comp.stop();
          this.assets.png.setAttribute('visible', 'false');
        }
        this.assets.models.forEach(ent => {
          ent.setAttribute('animation-mixer', 'timeScale: 0');  // PAUSE
          ent.setAttribute('visible', 'false');
        });
      });
    },

    // Crée une entité modèle 3D et câble le démarrage d’animation au bon moment
    _createModelEntity(url) {
      const ent = document.createElement('a-entity');
      ent.setAttribute('visible', 'false');
      ent.setAttribute('gltf-model', `url(${url})`);
      ent.setAttribute('position', this.data.modelPos);
      ent.setAttribute('rotation', this.data.modelRot);
      ent.setAttribute('scale',    this.data.modelScale);
      // Mixer en pause au départ
      ent.setAttribute('animation-mixer', `clip: ${this.data.animClip}; loop: ${this.data.animLoop}; timeScale: 0`);

      // Quand le modèle est prêt : (ré)appliquer mixer + jouer si cible déjà visible
      ent.addEventListener('model-loaded', () => {
        const mesh = ent.getObject3D('mesh');
        const clips = (mesh && mesh.animations) ? mesh.animations : [];
        if (!clips.length) {
          console.warn('[3D] Aucun clip d’animation trouvé dans', url);
          return;
        }
        // (re)poser le mixer après le load
        ent.setAttribute('animation-mixer', `clip: ${this.data.animClip}; loop: ${this.data.animLoop}; timeScale: 0`);
        console.log('[3D] Clips dispos:', clips.map(c => c.name));

        // Si la cible est déjà visible, lancer immédiatement
        if (this.el.getAttribute('visible')) {
          ent.setAttribute('animation-mixer', 'timeScale: 1');  // PLAY
        }
      });

      ent.addEventListener('model-error', (err) => {
        console.error('[3D] model-error pour', url, err);
      });

      return ent;
    }
  });
}