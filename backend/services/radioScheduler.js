const Song = require("../models/Song");

class RadioScheduler {
  constructor() {
    this._songs         = [];
    this._durations     = [];
    this._totalDuration = 0;
    this._loaded        = false;
    this._loadPromise   = null;
    this._streamStart   = null;
  }

  async load() {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._doLoad();
    return this._loadPromise;
  }

  async _doLoad() {
    try {
      // Only load songs explicitly marked as live-only for the default radio queue.
      // Regular (dashboard) songs are excluded — they play on live only when admin
      // manually selects them via loadSingle().
      const songs = await Song.find({ isLiveOnly: true })
        .sort({ createdAt: 1 })
        .lean();

      if (!songs.length) {
        this._songs         = [];
        this._durations     = [];
        this._totalDuration = 0;
        this._loaded        = true;
        console.warn("RadioScheduler: no songs found");
        return;
      }

      this._songs     = songs;
      this._durations = songs.map((s) => {
        const d = Number(s.duration);
        if (!d || d <= 0) {
          console.warn(`"${s.name}" has no duration — using 240s fallback`);
          return 240;
        }
        return d;
      });

      this._totalDuration = this._durations.reduce((a, b) => a + b, 0);
      this._loaded        = true;

      console.log(
        `RadioScheduler loaded: ${songs.length} live-only songs, ` +
        `total ${(this._totalDuration / 60).toFixed(1)} min`
      );

      songs.forEach((s, i) => {
        console.log(
          `  [${i}] "${s.name}" — ` +
          `${this._durations[i].toFixed(1)}s`
        );
      });
    } catch (err) {
      console.error("RadioScheduler load error:", err);
      this._loadPromise = null;
      throw err;
    }
  }

  async reload() {
    this._loaded      = false;
    this._loadPromise = null;
    await this.load();
  }

  async loadSingle(songId) {
    const song = await Song.findById(songId).lean();
    if (!song) throw new Error("Song not found");

    const duration = Number(song.duration) > 0 ? Number(song.duration) : 240;
    this._songs         = [song];
    this._durations     = [duration];
    this._totalDuration = duration;
    this._loaded        = true;
    this._loadPromise   = Promise.resolve();

    console.log(`RadioScheduler: single-song mode — "${song.name}" (${duration.toFixed(1)}s)`);
  }

  startStream() {
    this._streamStart = new Date();
    console.log(`Stream clock started at ${this._streamStart.toISOString()}`);
    console.log(
      `Play order: ${this._songs
        .map((s, i) => `"${s.name}" (${this._durations[i].toFixed(0)}s)`)
        .join(" → ")}`
    );
  }

  stopStream() {
    this._streamStart = null;
    console.log("Stream clock stopped");
  }

  getCurrentState() {
    if (!this._loaded || !this._songs.length || this._totalDuration === 0) {
      return null;
    }

    if (!this._streamStart) {
      return {
        song:           this._songs[0],
        songIndex:      0,
        positionInSong: 0,
        totalElapsed:   0,
      };
    }

    const nowMs      = Date.now();
    const startMs    = this._streamStart.getTime();
    const elapsedSec = Math.max(0, (nowMs - startMs) / 1000);

    const loopPosition = elapsedSec % this._totalDuration;

    let accumulated = 0;
    for (let i = 0; i < this._songs.length; i++) {
      const songDur = this._durations[i];
      if (loopPosition < accumulated + songDur) {
        return {
          song:           this._songs[i],
          songIndex:      i,
          positionInSong: loopPosition - accumulated,
          totalElapsed:   elapsedSec,
        };
      }
      accumulated += songDur;
    }

    return {
      song:           this._songs[0],
      songIndex:      0,
      positionInSong: 0,
      totalElapsed:   elapsedSec,
    };
  }

  get songs()         { return this._songs; }
  get durations()     { return this._durations; }
  get totalDuration() { return this._totalDuration; }
  get loaded()        { return this._loaded; }
  get streamStart()   { return this._streamStart; }
  get isStreaming()   { return this._streamStart !== null; }
}

const radioScheduler = new RadioScheduler();
module.exports = radioScheduler;