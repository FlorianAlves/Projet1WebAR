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
    stop()  {
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
 * Composant : ar-target-loader (PNG + 3D + AUDIO)
 * - pngPrefix : séquence PNG auto
 * - modelsDir : 3D auto (model.glb/scene.glb/index.glb ou model_000.glb)
 * - audioPrefix : audio auto (audio_000.mp3/ogg/wav … ou audio.mp3)
 *   * playlist simple avec loop optionnel
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
      modelPad:    { type: 'int',     default: 3 },
      modelStart:  { type: 'int',     default: 0 },
      modelMax:    { type: 'int',     default: 30 },
      preferNames: { type: 'string',  default: 'model.glb,scene.glb,index.glb,model.gltf,scene.gltf,index.gltf' },
      modelPos:    { type: 'string',  default: '0 0 0' },
      modelRot:    { type: 'string',  default: '0 0 0' },
      modelScale:  { type: 'string',  default: '1 1 1' },
      animClip:    { type: 'string',  default: '*' },
      animLoop:    { type: 'string',  default: 'repeat' },

      // AUDIO (facultatif) — même logique "prefix auto" que PNG
      audioPrefix: { type: 'string',  default: '' },     // ex: ./audio/target0/audio_
      audioPad:    { type: 'int',     default: 3 },      // 000…
      audioStart:  { type: 'int',     default: 0 },
      audioMax:    { type: 'int',     default: 50 },
      audioLoop:   { type: 'string',  default: 'all' },  // 'none' | 'all'
      audioVolume: { type: 'number',  default: 1 },
      audioPos:    { type: 'string',  default: '0 0 0' },// optionnel si tu veux du positionnel
      audioNonPos: { type: 'boolean', default: true }    // true = non-positionnel (plus fiable)
    },

    async init() {
      const root = this.el;
      this.assets = { png: null, models: [], audio: null, tracks: [], trackIndex: 0, unlocked: false };

      // Déverrouillage audio (politiques autoplay iOS/Android)
      const unlock = () => { this.assets.unlocked = true; window.removeEventListener('touchstart', unlock); window.removeEventListener('click', unlock); };
      window.addEventListener('touchstart', unlock, { passive: true, once: true });
      window.addEventListener('click', unlock, { passive: true, once: true });

      // 1) PNG
      if (this.data.pngPrefix) {
        const img = document.createElement('a-image');
        img.setAttribute('visible', 'false');
        img.setAttribute('png-sequence',
          `prefix: ${this.data.pngPrefix}; fps: ${this.data.fps}; unitWidth: ${this.data.unitWidth}; fit: ${this.data.fit}`);
        root.appendChild(img);
        this.assets.png = img;
      }

      // 2) 3D
      if (this.data.modelsDir) {
        const dir = this.data.modelsDir.endsWith('/') ? this.data.modelsDir : this.data.modelsDir + '/';
        const preferred = this.data.preferNames.split(',').map(s => s.trim()).filter(Boolean);

        let created = false;
        for (const name of preferred) {
          const url = dir + name;
          const ent = this._createModelEntity(url);
          root.appendChild(ent);
          this.assets.models.push(ent);
          created = true;
          break;
        }

        if (!created) {
          const pad = n => n.toString().padStart(this.data.modelPad, '0');
          let any = false;
          for (let i = this.data.modelStart; i < this.data.modelMax; i++) {
            [dir + `model_${pad(i)}.glb`, dir + `model_${pad(i)}.gltf`].forEach(url => {
              const ent = this._createModelEntity(url);
              root.appendChild(ent);
              this.assets.models.push(ent);
              any = true;
            });
            if (any) break;
          }
        }
      }

      // 3) AUDIO — auto-détection par prefix
      if (this.data.audioPrefix) {
        const audioEnt = document.createElement('a-entity');
        audioEnt.setAttribute('visible', 'false');

        // on prépare le sound component (src sera défini dynamiquement)
        const soundBase = [
          `autoplay: false`,
          `loop: false`,
          `volume: ${this.data.audioVolume}`,
          `positional: ${!this.data.audioNonPos}`, // si non-positionnel, positional:false
        ].join('; ');
        audioEnt.setAttribute('sound', soundBase);
        audioEnt.setAttribute('position', this.data.audioPos);

        // Découverte des pistes : d’abord noms classiques, puis sequence audio_000.ext
        const exts = ['mp3','ogg','wav'];
        const classic = exts.map(ext => `${this.data.audioPrefix.replace(/[_-]?$/, '')}.${ext}`); // ex: ./audio/target0/audio.mp3
        const tracks = [];

        // Tester noms classiques
        for (const url of classic) {
          const ok = await headExists(url);
          if (ok) { tracks.push(url); break; }
        }
        // Tester séquence si rien trouvé
        if (tracks.length === 0) {
          const pad = n => n.toString().padStart(this.data.audioPad, '0');
          for (let i = this.data.audioStart; i < this.data.audioMax; i++) {
            let foundForThisIndex = false;
            for (const ext of exts) {
              const url = `${this.data.audioPrefix}${pad(i)}.${ext}`;
              // eslint-disable-next-line no-await-in-loop
              const ok = await headExists(url);
              if (ok) { tracks.push(url); foundForThisIndex = true; break; }
            }
            if (!foundForThisIndex) {
              if (tracks.length > 0) break; // on stoppe à la 1ère “coupure”
            }
          }
        }

        if (tracks.length) {
          root.appendChild(audioEnt);
          this.assets.audio = audioEnt;
          this.assets.tracks = tracks;
          this.assets.trackIndex = 0;

          // Gestion de fin de piste → piste suivante / boucle
          audioEnt.addEventListener('sound-ended', () => {
            if (!this.assets.tracks.length) return;
            if (this.data.audioLoop === 'all') {
              this.assets.trackIndex = (this.assets.trackIndex + 1) % this.assets.tracks.length;
              this._playCurrentTrack();
            }
          });
        } else {
          log('[audio] aucune piste trouvée pour', this.data.audioPrefix);
        }
      }

      // 4) targetFound / targetLost
      root.addEventListener('targetFound', () => {
        // PNG
        if (this.assets.png) {
          this.assets.png.setAttribute('visible', 'true');
          const comp = this.assets.png.components['png-sequence'];
          if (comp) comp.start();
        }

        // 3D
        this.assets.models.forEach(ent => {
          ent.setAttribute('visible', 'true');
          ent.setAttribute('animation-mixer', 'timeScale: 1'); // PLAY
        });

        // AUDIO
        if (this.assets.audio && this.assets.tracks.length) {
          this.assets.audio.setAttribute('visible', 'true');
          // sur mobile, il faut souvent un geste utilisateur préalable
          if (this.assets.unlocked) this._playCurrentTrack();
          else log('[audio] en attente d’un tap/click pour commencer (autoplay policy)');
        }
      });

      root.addEventListener('targetLost', () => {
        // PNG
        if (this.assets.png) {
          const comp = this.assets.png.components['png-sequence'];
          if (comp) comp.stop();
          this.assets.png.setAttribute('visible', 'false');
        }

        // 3D
        this.assets.models.forEach(ent => {
          ent.setAttribute('animation-mixer', 'timeScale: 0'); // PAUSE
          ent.setAttribute('visible', 'false');
        });

        // AUDIO
        if (this.assets.audio) {
          this._stopAudio();
          this.assets.audio.setAttribute('visible', 'false');
        }
      });
    },

    _createModelEntity(url) {
      const ent = document.createElement('a-entity');
      ent.setAttribute('visible', 'false');
      ent.setAttribute('gltf-model', `url(${url})`);
      ent.setAttribute('position', this.data.modelPos);
      ent.setAttribute('rotation', this.data.modelRot);
      ent.setAttribute('scale',    this.data.modelScale);
      ent.setAttribute('animation-mixer', `clip: ${this.data.animClip}; loop: ${this.data.animLoop}; timeScale: 0`);

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
        if (this.el.getAttribute('visible')) {
          ent.setAttribute('animation-mixer', 'timeScale: 1');  // PLAY si déjà visible
        }
      });
      ent.addEventListener('model-error', (err) => {
        console.error('[3D] model-error pour', url, err);
      });
      return ent;
    },

    _playCurrentTrack() {
      if (!this.assets.audio || !this.assets.tracks.length) return;
      const url = this.assets.tracks[this.assets.trackIndex];
      // Appliquer la source et jouer
      this.assets.audio.setAttribute('sound', `src: url(${url}); autoplay: false; loop: false; volume: ${this.data.audioVolume}; positional: ${!this.data.audioNonPos}`);
      const snd = this.assets.audio.components.sound;
      if (snd) {
        try {
          snd.stopSound();
        } catch {}
        // Sur certains navigateurs, il faut un setTimeout court pour que la source se (re)prenne
        setTimeout(() => {
          snd.playSound();
          log('[audio] PLAY →', url);
        }, 0);
      }
    },

    _stopAudio() {
      if (!this.assets.audio) return;
      const snd = this.assets.audio.components.sound;
      if (snd) {
        try { snd.stopSound(); } catch {}
      }
      this.assets.trackIndex = 0; // on repart du début à la prochaine détection
    }
  });
}

/* Utilitaire HEAD (teste existence d’un fichier) */
async function headExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}