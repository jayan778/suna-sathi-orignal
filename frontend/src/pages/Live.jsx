import { useEffect, useRef, useState, useCallback } from "react";
import {
  Radio, Music2, Users, Send, Volume2, ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { connectSocket } from "../services/socket";
import { liveAudio } from "../services/liveAudio";
import api from "../services/api";

const REACTIONS = ["❤️", "🔥", "🎵", "👏", "😍"];

const pad2 = (n) => String(Math.floor(Math.max(0, n))).padStart(2, "0");
const fmt  = (s) => `${pad2(s / 60)}:${pad2(s % 60)}`;

export default function Live() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const socketRef  = useRef(null);
  const chatEndRef = useRef(null);
  const hasJoinedRef = useRef(false);

  const [session,           setSession]           = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [currentSong,       setCurrentSong]       = useState(null);
  const [isPlaying,         setIsPlaying]         = useState(false);
  const [currentTime,       setCurrentTime]       = useState(0);
  const [duration,          setDuration]          = useState(0);
  const [progress,          setProgress]          = useState(0);
  const [volume,            setVolume]            = useState(0.8);
  const [listenerCount,     setListenerCount]     = useState(0);
  const [messages,          setMessages]          = useState([]);
  const [messageInput,      setMessageInput]      = useState("");
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [sessionEnded,      setSessionEnded]      = useState(false);
  const [needsInteraction,  setNeedsInteraction]  = useState(false);
  const [loadError,         setLoadError]         = useState("");

  // Ref to current song so socket handlers can access latest value
  const currentSongRef = useRef(null);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);

  // ── Stop normal audio the moment Live mounts ───────────
  useEffect(() => {
    liveAudio.pauseNormal();

    // On unmount: stop live audio, leave it clean for dashboard
    return () => {
      liveAudio.stopLive();
    };
  }, []);

  // ── Sync liveAudio LIVE state → React ─────────────────
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

  useEffect(() => { liveAudio.setLiveVolume(volume); }, [volume]);

  // ── Helper: load and play with autoplay fallback ───────
  const tryLoadAndPlay = useCallback(async (song, seekTo = 0) => {
    if (!song) return;
    // Always kill normal audio before starting live
    liveAudio.pauseNormal();
    try {
      await liveAudio.loadLiveAndPlay(song, seekTo);
      setNeedsInteraction(false);
    } catch (err) {
      console.warn("Autoplay blocked:", err.message);
      setNeedsInteraction(true);
    }
  }, []);

  // ── Load initial session ───────────────────────────────
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/api/live/session");
        if (!mounted) return;

        if (!res.data.isActive) {
          setLoading(false);
          return;
        }

        setSession(res.data);
        setCurrentSong(res.data.currentSong);
        setListenerCount(Number(res.data.listeners) || 0);

        // Load chat history
        try {
          const chatRes = await api.get("/api/live/chat");
          if (mounted) setMessages(chatRes.data || []);
        } catch { /* ignore */ }

        // Start playing from the correct position reported by server
        const seekTo = res.data.positionInSong || 0;
        if (res.data.currentSong && mounted) {
          try {
            await Promise.race([
              tryLoadAndPlay(res.data.currentSong, seekTo),
              new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
            ]);
          } catch {
            // Autoplay blocked or timeout — still show the page
          }
        }

      } catch (err) {
        if (!mounted) return;
        console.error("Failed to load session:", err);
        setLoadError("Failed to connect to the live stream.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();

    return () => {
      mounted = false;
      liveAudio.stopLive();
    };
  }, [tryLoadAndPlay]);

  // ── Socket events ──────────────────────────────────────
  useEffect(() => {
    if (!session?.isActive) return;

    const token  = localStorage.getItem("token");
    const socket = connectSocket(token);
    socketRef.current = socket;

    if (!hasJoinedRef.current) {
      socket.emit("join_live");
      hasJoinedRef.current = true;
    }

    socket.on("listener_count", (count) => {
      setListenerCount(Number(count) || 0);
    });

    // Server sends this when we first join with current song + position
    socket.on("sync_on_join", async ({ currentTime: ct, song }) => {
      if (!song) return;
      setCurrentSong(song);
      await tryLoadAndPlay(song, ct || 0);
    });

    // Server sends this when the radio scheduler advances to next song
    socket.on("song_changed", async ({ song, currentTime: ct }) => {
      if (!song) return;
      setCurrentSong(song);
      setProgress(0);
      setCurrentTime(0);
      await tryLoadAndPlay(song, ct || 0);
    });

    // Periodic drift correction from server
    socket.on("time_sync", ({ currentTime: ct }) => {
      if (Math.abs(liveAudio.liveCurrentTime - ct) > 3) {
        liveAudio.syncLivePosition(ct);
      }
    });

    socket.on("new_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("new_reaction", ({ reaction }) => {
      const id = Date.now() + Math.random();
      setFloatingReactions((prev) => [...prev, { id, reaction }]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, 3000);
    });

    socket.on("session_ended", () => {
      setSessionEnded(true);
      liveAudio.stopLive();
    });

    return () => {
      socket.emit("leave_live");
      socket.off("listener_count");
      socket.off("sync_on_join");
      socket.off("song_changed");
      socket.off("time_sync");
      socket.off("new_message");
      socket.off("new_reaction");
      socket.off("session_ended");
      hasJoinedRef.current = false;
    };
  }, [session?.isActive, tryLoadAndPlay]);

  // ── Media Session API ──────────────────────────────────
  useEffect(() => {
    if (!currentSong || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentSong.name   || "Live Stream",
      artist: currentSong.artist || "SunaSathi Radio",
      album:  session?.playlistName || "Live Session",
    });
  }, [currentSong, session]);

  // ── Chat auto-scroll ───────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Tap to start (autoplay blocked) ───────────────────
  const handleUserPlay = async () => {
    liveAudio.pauseNormal();
    try {
      // Re-fetch current position from server to ensure accuracy
      const res    = await api.get("/api/live/session");
      const song   = res.data.currentSong || currentSongRef.current;
      const seekTo = res.data.positionInSong || liveAudio.liveCurrentTime;

      if (!song) return;
      setCurrentSong(song);
      await liveAudio.loadLiveAndPlay(song, seekTo);
      setNeedsInteraction(false);
    } catch (err) {
      console.error("User play failed:", err);
    }
  };

  const sendMessage = () => {
    const msg = messageInput.trim();
    if (!msg || !socketRef.current) return;
    socketRef.current.emit("send_message", { message: msg });
    setMessageInput("");
  };

  const sendReaction = (reaction) => {
    socketRef.current?.emit("send_reaction", { reaction });
  };

  // ── Loading ────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-[#0B0F1A] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin" />
          <p className="text-gray-400 text-sm">Tuning in to the live stream...</p>
        </div>
      </main>
    );
  }

  // ── No session / ended ─────────────────────────────────
  if (!session?.isActive || sessionEnded || loadError) {
    return (
      <main className="min-h-screen bg-[#0B0F1A] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
            <Radio className="w-12 h-12 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold mb-3">
            {sessionEnded ? "Stream Ended"
              : loadError  ? "Connection Error"
              : "No Live Stream"}
          </h1>
          <p className="text-gray-400 mb-8">
            {sessionEnded
              ? "The admin has ended the live stream. Thanks for listening!"
              : loadError
              ? loadError
              : "There's no active live stream right now. Check back later or enjoy music from your dashboard."}
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-lg shadow-indigo-500/50 hover:shadow-indigo-500/70 transition-all hover:-translate-y-0.5"
          >
            Go to Dashboard
          </button>
        </div>
      </main>
    );
  }

  // ── Main UI ────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0B0F1A] text-white flex flex-col">

      {/* Header */}
      <div className="bg-[#0B0F1A]/80 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 rounded-full border border-red-500/30">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-sm font-semibold text-red-400 uppercase tracking-widest">
              Live Radio
            </span>
          </div>
          <span className="text-white font-semibold hidden sm:block">
            {session.playlistName}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Users className="w-4 h-4" />
          <span>{listenerCount} listening</span>
        </div>
      </div>

      {/* Autoplay blocked banner */}
      {needsInteraction && (
        <div
          className="bg-indigo-500/10 border-b border-indigo-500/20 px-4 py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-indigo-500/20 transition-colors"
          onClick={handleUserPlay}
        >
          <p className="text-sm text-indigo-300">
            👆 Tap here to start listening to the live stream
          </p>
          <div className="px-4 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-semibold flex-shrink-0">
            Start
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Player */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative overflow-hidden">

          {/* Floating reactions */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {floatingReactions.map((r) => (
              <div
                key={r.id}
                className="absolute bottom-24 text-3xl animate-bounce"
                style={{
                  left:              `${15 + Math.random() * 70}%`,
                  animationDuration: "0.8s",
                }}
              >
                {r.reaction}
              </div>
            ))}
          </div>

          {/* Album art */}
          <div className="relative w-56 h-56 sm:w-72 sm:h-72 rounded-3xl bg-gradient-to-br from-red-500/20 via-pink-500/20 to-indigo-500/20 flex items-center justify-center mb-8 border border-white/10 shadow-2xl shadow-red-500/10">
            <Music2 className="w-20 h-20 text-white/10" />
            {isPlaying && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-end gap-1">
                {[3, 5, 8, 6, 4, 7, 5, 3].map((h, i) => (
                  <div
                    key={i}
                    className="w-1.5 bg-red-400/70 rounded-full animate-pulse"
                    style={{ height: `${h * 3}px`, animationDelay: `${i * 0.08}s` }}
                  />
                ))}
              </div>
            )}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-[#0B0F1A] border border-white/10 rounded-full text-xs text-gray-400 whitespace-nowrap">
              Hosted by{" "}
              <span className="text-white font-medium">{session.hostedBy?.name}</span>
            </div>
          </div>

          {/* Song info */}
          <div className="text-center mb-5 mt-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {currentSong?.name || "Connecting..."}
            </h2>
            <p className="text-gray-400 text-lg">{currentSong?.artist || ""}</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              {currentSong?.genre && (
                <span className="px-3 py-1 bg-white/5 rounded-full text-xs text-gray-400 border border-white/10">
                  {currentSong.genre}
                </span>
              )}
              {currentSong?.year && (
                <span className="px-3 py-1 bg-white/5 rounded-full text-xs text-gray-400 border border-white/10">
                  {currentSong.year}
                </span>
              )}
            </div>
          </div>

          {/* Progress bar — read-only for users */}
          <div className="w-full max-w-md mb-1">
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-1.5 bg-gradient-to-r from-red-500 to-pink-500 rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1.5">
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 w-full max-w-md mb-8">
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

          {/* Status */}
          <div className="mb-8">
            {needsInteraction ? (
              <button
                onClick={handleUserPlay}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-400 rounded-full text-white font-semibold transition-all shadow-lg shadow-indigo-500/40"
              >
                <Radio className="w-5 h-5" />
                Tap to Listen
              </button>
            ) : isPlaying ? (
              <div className="flex items-center gap-2 px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-full">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-sm font-medium text-red-400">Broadcasting Live</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-full">
                <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
                <span className="text-sm text-gray-400">Buffering...</span>
              </div>
            )}
          </div>

          {/* Reactions */}
          <div className="flex items-center gap-3">
            {REACTIONS.map((r) => (
              <button
                key={r}
                onClick={() => sendReaction(r)}
                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-500/50 flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95"
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col bg-[#0B0F1A]/50 h-[380px] lg:h-auto">
          <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
            <h3 className="font-semibold text-white">Live Chat</h3>
            <p className="text-xs text-gray-500">{messages.length} messages</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-gray-600 text-sm py-8">
                No messages yet. Be the first!
              </p>
            ) : (
              messages.map((msg) => (
                <div key={msg._id || Math.random()} className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/20 to-pink-500/20 border border-red-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-red-300">
                    {msg.userName?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-xs font-semibold ${msg.userId === user?._id ? "text-red-400" : "text-gray-300"}`}>
                        {msg.userId === user?._id ? "You" : msg.userName}
                      </span>
                      <span className="text-xs text-gray-600">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 break-words">{msg.message}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Say something..."
                maxLength={300}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500/50 transition-all"
              />
              <button
                onClick={sendMessage}
                disabled={!messageInput.trim()}
                className="w-10 h-10 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 flex items-center justify-center text-white transition-all hover:shadow-lg hover:shadow-red-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}