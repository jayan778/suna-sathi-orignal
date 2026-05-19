const AUDIOBASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/uploads`;


function buildAudioUrl(file) {
  if (!file) return "";
  const slashIdx = file.indexOf("/");
  if (slashIdx === -1) {
    return `${AUDIOBASE}/${encodeURIComponent(file)}`;
  }
  const dir      = file.slice(0, slashIdx);       // e.g. "audio"
  const filename = file.slice(slashIdx + 1);      // e.g. "track.mp3"
  return `${AUDIOBASE}/${dir}/${encodeURIComponent(filename)}`;
}

class LiveAudioManager {
  constructor() {
    this._live   = null;
    this._normal = null;

    this._liveListeners   = new Set();
    this._normalListeners = new Set();

    this._liveSong    = null;
    this._normalSong  = null;
    this._liveActive  = false;
    this._liveSrc     = null;
    this._normalSrc   = null;

    // Strict mode: "live" | "normal" | null
    this._activeMode = null;
  }

  // ── Lazy element creation ──────────────────────────────
  _getLive() {
    if (!this._live) {
      this._live = new Audio();
      this._live.preload = "auto";
      this._live.setAttribute("playsinline", "");
      this._live.setAttribute("webkit-playsinline", "");

      this._live.addEventListener("timeupdate",     () => { this._notifyLive(); });
      this._live.addEventListener("play",           () => { this._notifyLive("play"); });
      this._live.addEventListener("pause",          () => { this._notifyLive("pause"); });
      this._live.addEventListener("ended",          () => { this._notifyLive("ended"); });
      this._live.addEventListener("loadedmetadata", () => { this._notifyLive("meta"); });
      this._live.addEventListener("error",          () => {
        console.error("[LiveAudio] Live element error. src:", this._live?.src);
      });
    }
    return this._live;
  }

  _getNormal() {
    if (!this._normal) {
      this._normal = new Audio();
      this._normal.preload = "auto";

      this._normal.addEventListener("timeupdate",     () => this._notifyNormal());
      this._normal.addEventListener("play",           () => { this._notifyNormal("play"); });
      this._normal.addEventListener("pause",          () => { this._notifyNormal("pause"); });
      this._normal.addEventListener("ended",          () => { this._notifyNormal("ended"); });
      this._normal.addEventListener("loadedmetadata", () => { this._notifyNormal("meta"); });
      this._normal.addEventListener("error",          () => {
        console.error("[LiveAudio] Normal element error. src:", this._normal?.src);
      });
    }
    return this._normal;
  }

  _notifyLive(e)   { this._liveListeners.forEach((fn)   => fn(e)); }
  _notifyNormal(e) { this._normalListeners.forEach((fn) => fn(e)); }

  // ── Subscribe ──────────────────────────────────────────
  subscribeLive(fn) {
    this._liveListeners.add(fn);
    return () => this._liveListeners.delete(fn);
  }

  subscribeNormal(fn) {
    this._normalListeners.add(fn);
    return () => this._normalListeners.delete(fn);
  }

  // ── LIVE controls ──────────────────────────────────────

  async loadLiveAndPlay(song, seekTo = 0) {
    if (!song?.file) return;

    // Strictly stop normal audio
    const normal = this._getNormal();
    if (!normal.paused) normal.pause();
    if (this._activeMode === "normal") {
      normal.src = "";
      normal.load();
      this._normalSrc  = null;
      this._normalSong = null;
    }

    this._activeMode = "live";

    const live = this._getLive();
    const url  = buildAudioUrl(song.file);

    console.log(`[LiveAudio] LIVE → "${song.name}" | url: ${url} | seek: ${seekTo.toFixed(1)}s`);

    this._liveSong   = song;
    this._liveActive = true;

    if (this._liveSrc !== url) {
      this._liveSrc = url;
      live.src      = url;
      live.load();
    }

    await new Promise((resolve) => {
      if (live.readyState >= 1) {
        if (seekTo > 0 && Math.abs(live.currentTime - seekTo) > 0.5) {
          live.currentTime = seekTo;
        }
        resolve();
      } else {
        live.addEventListener("loadedmetadata", () => {
          if (seekTo > 0 && Math.abs(live.currentTime - seekTo) > 0.5) {
            live.currentTime = seekTo;
          }
          resolve();
        }, { once: true });
      }
    });

    try {
      await live.play();
      this._notifyLive("play");
    } catch (err) {
      console.warn("[LiveAudio] Live play blocked:", err.message);
      throw err;
    }
  }

  syncLivePosition(seekTo) {
    const live = this._getLive();
    if (live.readyState >= 1 && Math.abs(live.currentTime - seekTo) > 1.5) {
      live.currentTime = seekTo;
    }
  }

  pauseLive() {
    const live = this._getLive();
    if (!live.paused) {
      live.pause();
      this._notifyLive("pause");
    }
  }

  async resumeLive() {
    try {
      await this._getLive().play();
      this._notifyLive("play");
    } catch (err) {
      console.warn("[LiveAudio] Resume live failed:", err.message);
      throw err;
    }
  }

  stopLive() {
    if (this._live) {
      this._live.pause();
      this._live.src = "";
      this._live.load();
    }
    this._liveSrc    = null;
    this._liveSong   = null;
    this._liveActive = false;
    if (this._activeMode === "live") this._activeMode = null;
    this._notifyLive("stopped");
  }

  setLiveVolume(v) {
    this._getLive().volume = Math.max(0, Math.min(1, v));
  }

  get liveCurrentTime() { return this._live?.currentTime || 0; }
  get liveDuration()    { return this._live?.duration    || 0; }
  get liveIsPlaying()   { return this._live ? !this._live.paused : false; }
  get liveSong()        { return this._liveSong; }
  get liveActive()      { return this._liveActive; }
  get livePaused()      { return this._live ? this._live.paused : true; }

  // ── NORMAL controls ────────────────────────────────────

  async loadNormalAndPlay(song, seekTo = 0) {
    if (!song?.file) return;

    // Strictly stop live audio
    const live = this._getLive();
    if (!live.paused) live.pause();
    if (this._activeMode === "live") {
      live.src = "";
      live.load();
      this._liveSrc    = null;
      this._liveSong   = null;
      this._liveActive = false;
    }

    this._activeMode = "normal";

    const normal = this._getNormal();
    const url    = buildAudioUrl(song.file);

    console.log(`[LiveAudio] NORMAL → "${song.name}" | url: ${url}`);

    if (this._normalSrc !== url) {
      this._normalSong = song;
      this._normalSrc  = url;
      normal.src       = url;
      normal.load();
    }

    const doPlay = async () => {
      if (seekTo > 0 && Math.abs(normal.currentTime - seekTo) > 1) {
        normal.currentTime = seekTo;
      }
      await normal.play();
      this._notifyNormal("play");
    };

    if (normal.readyState >= 1) {
      await doPlay();
    } else {
      await new Promise((resolve, reject) => {
        normal.addEventListener("loadedmetadata", async () => {
          try { await doPlay(); resolve(); } catch (e) { reject(e); }
        }, { once: true });
        normal.addEventListener("error", reject, { once: true });
      });
    }
  }

  pauseNormal() {
    const n = this._getNormal();
    if (!n.paused) {
      n.pause();
      this._notifyNormal("pause");
    }
  }

  async resumeNormal() {
    if (this._activeMode === "live" && this._liveActive) {
      console.warn("[LiveAudio] resumeNormal blocked: live mode is active");
      return;
    }
    this._activeMode = "normal";
    try {
      await this._getNormal().play();
      this._notifyNormal("play");
    } catch (err) {
      console.warn("[LiveAudio] Resume normal failed:", err.message);
      throw err;
    }
  }

  seekNormal(time) {
    const n = this._getNormal();
    if (n.readyState >= 1) n.currentTime = time;
  }

  stopNormal() {
    if (this._normal) {
      this._normal.pause();
      this._normal.src = "";
      this._normal.load();
    }
    this._normalSong = null;
    this._normalSrc  = null;
    if (this._activeMode === "normal") this._activeMode = null;
    this._notifyNormal("stopped");
  }

  setNormalVolume(v) {
    this._getNormal().volume = Math.max(0, Math.min(1, v));
  }

  get normalCurrentTime() { return this._normal?.currentTime || 0; }
  get normalDuration()    { return this._normal?.duration    || 0; }
  get normalIsPlaying()   { return this._normal ? !this._normal.paused : false; }
  get normalSong()        { return this._normalSong; }
  get normalPaused()      { return this._normal ? this._normal.paused : true; }

  get activeMode() { return this._activeMode; }
}

export const liveAudio = new LiveAudioManager();