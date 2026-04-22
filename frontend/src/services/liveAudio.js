const AUDIOBASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/uploads`;

// 3 minutes in seconds — matches server-side cap
const SONG_CAP_SECONDS = 3 * 60;

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

    // Track when current live song started (client side) for 3-min UI cap
    this._liveSongStartedAt = null;
  }

  // ── Lazy element creation ──────────────────────────────
  _getLive() {
    if (!this._live) {
      this._live = new Audio();
      this._live.preload = "auto";
      this._live.setAttribute("playsinline", "");
      this._live.setAttribute("webkit-playsinline", "");

      this._live.addEventListener("timeupdate", () => {
        // Cap reported currentTime to SONG_CAP_SECONDS for the UI
        this._notifyLive();
      });
      this._live.addEventListener("play",           () => { this._notifyLive("play"); });
      this._live.addEventListener("pause",          () => { this._notifyLive("pause"); });
      this._live.addEventListener("ended",          () => { this._notifyLive("ended"); });
      this._live.addEventListener("loadedmetadata", () => { this._notifyLive("meta"); });
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

  /**
   * Load and play a live stream song, seeking to `seekTo` seconds.
   * seekTo is already capped at 3 min by the server.
   */
  async loadLiveAndPlay(song, seekTo = 0) {
    if (!song?.file) return;

    // Pause normal audio — do NOT destroy it
    const normal = this._getNormal();
    if (!normal.paused) {
      normal.pause();
      this._notifyNormal("pause");
    }

    const live = this._getLive();
    const url  = `${AUDIOBASE}/${encodeURIComponent(song.file)}`;

    this._liveSong   = song;
    this._liveActive = true;

    // Clamp seekTo to the 3-min cap
    const clampedSeek = Math.min(seekTo, SONG_CAP_SECONDS);

    // Only change src if song is different
    if (this._liveSrc !== url) {
      this._liveSrc  = url;
      live.src       = url;
      live.load();
    }

    // Seek on metadata load
    await new Promise((resolve) => {
      if (live.readyState >= 1) {
        if (clampedSeek > 0 && Math.abs(live.currentTime - clampedSeek) > 0.5) {
          live.currentTime = clampedSeek;
        }
        resolve();
      } else {
        live.addEventListener("loadedmetadata", () => {
          if (clampedSeek > 0 && Math.abs(live.currentTime - clampedSeek) > 0.5) {
            live.currentTime = clampedSeek;
          }
          resolve();
        }, { once: true });
      }
    });

    this._liveSongStartedAt = Date.now() - (clampedSeek * 1000);

    try {
      await live.play();
      this._notifyLive("play");
    } catch (err) {
      console.warn("Live play blocked:", err.message);
      throw err;
    }
  }

  /**
   * Re-sync live position without reloading the file.
   * Only corrects if drift > 1.5 seconds.
   * Clamps to SONG_CAP_SECONDS.
   */
  syncLivePosition(seekTo) {
    const live   = this._getLive();
    const clamped = Math.min(seekTo, SONG_CAP_SECONDS);
    if (live.readyState >= 1 && Math.abs(live.currentTime - clamped) > 1.5) {
      live.currentTime = clamped;
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
      console.warn("Resume live failed:", err.message);
      throw err;
    }
  }

  stopLive() {
    if (this._live) {
      this._live.pause();
      this._live.src = "";
      this._live.load();
    }
    this._liveSrc           = null;
    this._liveSong          = null;
    this._liveActive        = false;
    this._liveSongStartedAt = null;
    this._notifyLive("stopped");
  }

  setLiveVolume(v) {
    this._getLive().volume = Math.max(0, Math.min(1, v));
  }

  /**
   * liveCurrentTime — capped at SONG_CAP_SECONDS for the UI progress bar.
   * The actual audio element may play beyond 3 min, but we don't show it.
   */
  get liveCurrentTime() {
    const raw = this._live?.currentTime || 0;
    return Math.min(raw, SONG_CAP_SECONDS);
  }

  /**
   * liveDuration — always returns SONG_CAP_SECONDS (3 min) so the progress
   * bar fills at exactly 3 minutes regardless of the actual audio length.
   */
  get liveDuration() {
    return SONG_CAP_SECONDS;
  }

  get liveIsPlaying()   { return this._live ? !this._live.paused : false; }
  get liveSong()        { return this._liveSong; }
  get liveActive()      { return this._liveActive; }
  get livePaused()      { return this._live ? this._live.paused : true; }

  // ── NORMAL controls ────────────────────────────────────

  async loadNormalAndPlay(song, seekTo = 0) {
    if (!song?.file) return;

    // Pause live locally
    this.pauseLive();

    const normal = this._getNormal();
    const url    = `${AUDIOBASE}/${encodeURIComponent(song.file)}`;

    if (this._normalSong?._id !== song._id) {
      this._normalSong = song;
      normal.src       = url;
      normal.load();
    }

    const doPlay = async () => {
      if (seekTo > 0 && Math.abs(normal.currentTime - seekTo) > 1) {
        normal.currentTime = seekTo;
      }
      await normal.play();
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
    try {
      await this._getNormal().play();
    } catch (err) {
      console.warn("Resume normal failed:", err.message);
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
}

export const liveAudio = new LiveAudioManager();