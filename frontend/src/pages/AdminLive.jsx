import { useEffect, useRef, useState, useCallback } from "react";
import {
  Radio, Music2, Play, Pause,
  Users, Square, ArrowLeft, ListMusic, Volume2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { connectSocket } from "../services/socket";
import { liveAudio } from "../services/liveAudio";
import api from "../services/api";

export default function AdminLive() {
  const navigate        = useNavigate();
  const socketRef       = useRef(null);

  const [session,            setSession]            = useState(null);
  const [songs,              setSongs]              = useState([]);
  const [loading,            setLoading]            = useState(true);
  const [starting,           setStarting]           = useState(false);
  const [currentSong,        setCurrentSong]        = useState(null);
  const [currentSongIndex,   setCurrentSongIndex]   = useState(0);
  const [isPlaying,          setIsPlaying]          = useState(false);
  const [currentTime,        setCurrentTime]        = useState(0);
  const [duration,           setDuration]           = useState(0);
  const [progress,           setProgress]           = useState(0);
  const [volume,             setVolume]             = useState(0.8);
  const [listenerCount,      setListenerCount]      = useState(0);
  const [sessionName,        setSessionName]        = useState("Live Session");
  const [error,              setError]              = useState("");

  const pad2 = (n) => String(Math.floor(Math.max(0, n))).padStart(2, "0");
  const fmt  = (s) => `${pad2(s / 60)}:${pad2(s % 60)}`;

  // Sync liveAudio LIVE state into React
  useEffect(() => {
    const unsub = liveAudio.subscribeLive(() => {
      setIsPlaying(liveAudio.liveIsPlaying);
      setCurrentTime(liveAudio.liveCurrentTime);
      setDuration(liveAudio.liveDuration);
      if (liveAudio.liveDuration > 0) {
        setProgress((liveAudio.liveCurrentTime / liveAudio.liveDuration) * 100);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    liveAudio.setLiveVolume(volume);
  }, [volume]);

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        // ✅ Load ALL songs (admin sees everything including live-only)
        const [sessionRes, songsRes] = await Promise.all([
          api.get("/api/live/session"),
          api.get("/api/songs/all"),
        ]);

        setSongs(songsRes.data || []);

        if (sessionRes.data.isActive) {
          setSession(sessionRes.data);
          setCurrentSong(sessionRes.data.currentSong);
          setCurrentSongIndex(sessionRes.data.songIndex || 0);
          setListenerCount(sessionRes.data.listeners || 0);

          if (sessionRes.data.currentSong) {
            const seekTo = sessionRes.data.positionInSong || 0;
            try {
              await liveAudio.loadLiveAndPlay(sessionRes.data.currentSong, seekTo);
            } catch {
              // Autoplay blocked
            }
          }
        }
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Socket
  useEffect(() => {
    if (!session?.isActive) return;

    const token  = localStorage.getItem("token");
    const socket = connectSocket(token);
    socketRef.current = socket;

    socket.emit("join_live");
    socket.on("listener_count", (count) => setListenerCount(Number(count) || 0));

    socket.on("song_changed", ({ song, currentSongIndex: idx, currentTime: ct }) => {
      if (song) {
        setCurrentSong(song);
        setCurrentSongIndex(idx || 0);
        liveAudio.loadLiveAndPlay(song, ct || 0).catch(() => {});
      }
    });

    socket.on("time_sync", ({ currentTime: ct, songIndex }) => {
      if (Math.abs(liveAudio.liveCurrentTime - ct) > 3) {
        liveAudio.syncLivePosition(ct);
      }
      if (typeof songIndex === "number") {
        setCurrentSongIndex(songIndex);
      }
    });

    return () => {
      socket.emit("leave_live");
      socket.off("listener_count");
      socket.off("song_changed");
      socket.off("time_sync");
    };
  }, [session?.isActive]);

  const startSession = async () => {
    if (!songs.length) { setError("No songs available"); return; }
    setStarting(true);
    setError("");
    try {
      const res = await api.post("/api/live/start", {
        playlistName: sessionName,
      });

      setSession(res.data);
      setCurrentSong(res.data.currentSong);
      setCurrentSongIndex(res.data.songIndex || 0);

      if (res.data.currentSong) {
        const seekTo = res.data.positionInSong || 0;
        try {
          await liveAudio.loadLiveAndPlay(res.data.currentSong, seekTo);
        } catch {
          // Autoplay blocked
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to start session");
    } finally {
      setStarting(false);
    }
  };

  const endSession = async () => {
    if (!window.confirm("End the live session? All listeners will be disconnected.")) return;
    try {
      await api.post("/api/live/end");
      socketRef.current?.emit("admin_end_session");
      liveAudio.stopLive();
      setSession(null);
      setCurrentSong(null);
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    } catch {
      setError("Failed to end session");
    }
  };

  const togglePlay = async () => {
    if (liveAudio.liveIsPlaying) {
      liveAudio.pauseLive();
    } else {
      try {
        await liveAudio.resumeLive();
      } catch {
        if (currentSong) {
          try {
            await liveAudio.loadLiveAndPlay(currentSong, liveAudio.liveCurrentTime);
          } catch { /* ignore */ }
        }
      }
    }
  };

  const seek = (e) => {
    if (!liveAudio.liveDuration) return;
    const rect    = e.currentTarget.getBoundingClientRect();
    const newTime = ((e.clientX - rect.left) / rect.width) * liveAudio.liveDuration;
    liveAudio.syncLivePosition(newTime);
  };

  // ✅ FIXED: Radio queue shows ALL songs (regular + live-only)
  // This matches what the radio scheduler actually plays
  const radioQueue = songs;

  // Stats for the setup panel
  const regularCount  = songs.filter(s => !s.isLiveOnly).length;
  const liveOnlyCount = songs.filter(s => s.isLiveOnly).length;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0B0F1A] text-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0F1A] text-white px-4 sm:px-6 md:px-8 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => navigate("/admin")}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shadow-lg shadow-red-500/50 flex-shrink-0">
          <Radio className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Live Stream Control</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Broadcast music to all listeners in real-time
          </p>
        </div>
        {session?.isActive && (
          <div className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-500/10 rounded-full border border-red-500/30">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-sm font-semibold text-red-400">LIVE</span>
            <span className="text-sm text-gray-400 ml-1 hidden sm:inline">
              {listenerCount} listeners
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="px-5 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* ── Setup Panel (no active session) ── */}
      {!session?.isActive ? (
        <div className="max-w-xl">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">

            <div className="px-6 py-5 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">Start a Live Stream</h2>
              <p className="text-gray-400 text-sm mt-1">
                The radio scheduler plays all songs (regular + live-only) in sequence.
              </p>
            </div>

            <div className="px-6 py-6 space-y-5">

              {/* Session name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Session Name
                </label>
                <input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. Friday Night Vibes"
                  className="w-full px-4 py-3 bg-[#0B0F1A] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 transition-all text-sm"
                />
              </div>

              {/* Stats row — shows both regular and live-only counts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="px-3 py-3 bg-white/5 rounded-xl border border-white/10 text-center">
                  <p className="text-lg font-bold text-white">{regularCount}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Regular Songs</p>
                  <p className="text-xs text-gray-600 mt-0.5">Dashboard + Live</p>
                </div>
                <div className="px-3 py-3 bg-red-500/10 rounded-xl border border-red-500/20 text-center">
                  <p className="text-lg font-bold text-red-400">{liveOnlyCount}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Live-Only Songs</p>
                  <p className="text-xs text-gray-600 mt-0.5">Live Stream Only</p>
                </div>
              </div>

              {/* Song separation legend */}
              <div className="space-y-2">
                <div className="flex items-start gap-3 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <Music2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-300">
                    <strong>Regular songs</strong> — available in the dashboard for users to browse &amp; play, and also included in the live radio stream.
                  </p>
                </div>
                <div className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <Radio className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">
                    <strong>Live-only songs</strong> — hidden from the dashboard, exclusive to the live radio stream. Perfect for premieres or special content.
                  </p>
                </div>
              </div>

              {/* Go live button */}
              <button
                onClick={startSession}
                disabled={starting || !songs.length}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold shadow-lg shadow-red-500/40 hover:shadow-red-500/60 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm"
              >
                {starting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Radio className="w-5 h-5" />
                )}
                {starting ? "Starting..." : `Go Live (${songs.length} songs)`}
              </button>
            </div>
          </div>
        </div>

      ) : (

        /* ── Active session ── */
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">

          {/* Player */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 sm:p-8">

            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-xl font-bold">Now Playing</h2>
                <p className="text-sm text-gray-400 mt-0.5">{session.playlistName}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Radio scheduler — auto-advancing through all songs
                </p>
              </div>
              <button
                onClick={endSession}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-medium transition-all text-sm"
              >
                <Square className="w-4 h-4" />
                End Stream
              </button>
            </div>

            {/* Album art */}
            <div className="relative w-48 h-48 mx-auto rounded-2xl bg-gradient-to-br from-red-500/20 via-pink-500/20 to-indigo-500/20 flex items-center justify-center mb-6 border border-white/10">
              <Music2 className="w-16 h-16 text-white/10" />
              {/* Live-only badge on the album art */}
              {currentSong?.isLiveOnly && (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-red-500 rounded-lg text-xs text-white font-bold">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE ONLY
                </div>
              )}
              {isPlaying && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-1">
                  {[3, 5, 8, 5, 3].map((h, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-red-400/70 rounded-full animate-pulse"
                      style={{ height: `${h * 3}px`, animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Song info */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-white">
                  {currentSong?.name || "Loading..."}
                </h3>
                {currentSong?.isLiveOnly && (
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30">
                    LIVE ONLY
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-sm">{currentSong?.artist}</p>
              <p className="text-xs text-gray-600 mt-1">
                Track {currentSongIndex + 1} of {radioQueue.length} · Auto-advancing
              </p>
            </div>

            {/* Seekbar */}
            <div className="mb-1">
              <div
                className="w-full h-2 bg-white/10 rounded-full cursor-pointer relative group"
                onClick={seek}
              >
                <div
                  className="h-2 bg-gradient-to-r from-red-500 to-pink-500 rounded-full"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${progress}%`, marginLeft: "-8px" }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                <span>{fmt(currentTime)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            {/* Play/pause toggle */}
            <div className="flex items-center justify-center gap-4 mt-6 mb-5">
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-xl shadow-red-500/40 hover:shadow-red-500/60 transition-all hover:scale-105 flex items-center justify-center"
              >
                {isPlaying
                  ? <Pause className="w-7 h-7" />
                  : <Play  className="w-7 h-7 ml-0.5" />}
              </button>
            </div>

            <p className="text-center text-xs text-gray-500 mb-5">
              Admin preview — listeners follow the radio scheduler automatically
            </p>

            {/* Volume */}
            <div className="flex items-center gap-3 mb-8">
              <Volume2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="flex-1 accent-red-500"
              />
              <span className="text-xs text-gray-400 w-9 text-right">
                {Math.round(volume * 100)}%
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10">
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">{listenerCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">Listeners</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{radioQueue.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Songs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{currentSongIndex + 1}</p>
                <p className="text-xs text-gray-500 mt-0.5">Current Track</p>
              </div>
            </div>
          </div>

          {/* Radio queue sidebar — shows ALL songs including live-only */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[680px]">
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2 flex-shrink-0">
              <ListMusic className="w-4 h-4 text-gray-400" />
              <h3 className="font-semibold text-white text-sm">Radio Queue</h3>
              <span className="text-xs text-gray-500 ml-auto">
                {radioQueue.length} songs
              </span>
            </div>

            {/* Legend */}
            <div className="px-5 py-2 border-b border-white/5 flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-400" />
                <span className="text-xs text-gray-500">Regular</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-xs text-gray-500">Live-only</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {radioQueue.map((song, index) => {
                const active = index === currentSongIndex;
                return (
                  <div
                    key={song._id || index}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 transition-all text-left ${
                      active ? "bg-red-500/10" : ""
                    }`}
                  >
                    {/* Index / playing indicator */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        active
                          ? "bg-red-500/20 text-red-400"
                          : "bg-white/5 text-gray-600"
                      }`}
                    >
                      {active && isPlaying ? (
                        <div className="flex items-end gap-px">
                          {[2, 3, 2].map((h, i) => (
                            <div
                              key={i}
                              className="w-0.5 bg-red-400 rounded-full animate-pulse"
                              style={{ height: `${h * 3}px` }}
                            />
                          ))}
                        </div>
                      ) : (
                        index + 1
                      )}
                    </div>

                    {/* Song type dot */}
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        song.isLiveOnly ? "bg-red-400" : "bg-indigo-400/50"
                      }`}
                    />

                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          active ? "text-red-300" : "text-white"
                        }`}
                      >
                        {song.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{song.artist}</p>
                    </div>

                    {song.isLiveOnly && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full border border-red-500/30 flex-shrink-0">
                        LIVE
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}