import { useEffect, useState, useRef } from "react";
import api from "../services/api";
import {
  Upload, Music2, Trash2, Plus, Search,
  AlertTriangle, Info, Radio, User, X, Check,
  ChevronDown, Camera, LayoutList,
} from "lucide-react";

const AUDIOBASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/uploads`;
const MAX_AUDIO_SIZE = 1024 * 1024 * 1024; // 1 GB
const WARN_SIZE      = 100 * 1024 * 1024;  // warn above 100 MB

export default function AddMusic() {
  const [songs,         setSongs]         = useState([]);
  const [filteredSongs, setFilteredSongs] = useState([]);
  const [artists,       setArtists]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [success,       setSuccess]       = useState("");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [genreFilter,   setGenreFilter]   = useState("all");
  const [liveFilter,    setLiveFilter]    = useState("all");
  const [fileWarning,   setFileWarning]   = useState("");

  // New artist modal
  const [showArtistModal, setShowArtistModal] = useState(false);
  const [newArtist,        setNewArtist]       = useState({ name: "", bio: "", genre: "" });
  const [artistPhoto,      setArtistPhoto]     = useState(null);
  const [artistLoading,    setArtistLoading]   = useState(false);
  const [artistError,      setArtistError]     = useState("");
  const artistPhotoRef = useRef(null);

  const [coverPreview, setCoverPreview] = useState(null);
  const coverInputRef = useRef(null);

  const [availableGenres, setAvailableGenres] = useState([]);
  const [customGenre,     setCustomGenre]     = useState(false);

  const [form, setForm] = useState({
    name: "", artistId: "", artistName: "",
    genre: "", year: "", isLiveOnly: false, audio: null, cover: null,
  });

  const isValid = form.name.trim() && form.artistName.trim() && form.genre.trim() && String(form.year).trim() && form.audio;

  const loadSongs   = async () => { const r = await api.get("/api/songs/all");     setSongs(r.data); };
  const loadArtists = async () => { const r = await api.get("/api/songs/artists"); setArtists(r.data); };
  const loadGenres  = async () => { const r = await api.get("/api/songs/genres");  setAvailableGenres(r.data || []); };

  useEffect(() => {
    Promise.all([
      loadSongs().catch(() => setError("Failed to load songs")),
      loadArtists().catch(console.error),
      loadGenres().catch(console.error),
    ]);
  }, []);

  useEffect(() => {
    let filtered = [...songs];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) =>
        s.name?.toLowerCase().includes(q) ||
        s.artist?.toLowerCase().includes(q) ||
        s.genre?.toLowerCase().includes(q)
      );
    }
    if (genreFilter !== "all")  filtered = filtered.filter((s) => s.genre === genreFilter);
    if (liveFilter  === "live") filtered = filtered.filter((s) => s.isLiveOnly);
    else if (liveFilter === "regular") filtered = filtered.filter((s) => !s.isLiveOnly);
    setFilteredSongs(filtered);
  }, [searchQuery, genreFilter, liveFilter, songs]);

  const handleArtistSelect = (e) => {
    const val = e.target.value;
    if (val === "__new__") { setShowArtistModal(true); return; }
    const found = artists.find((a) => a._id === val);
    setForm((p) => ({ ...p, artistId: val, artistName: found?.name || "" }));
  };

  const handleCreateArtist = async () => {
    if (!newArtist.name.trim()) { setArtistError("Artist name is required"); return; }
    setArtistLoading(true);
    setArtistError("");
    try {
      const fd = new FormData();
      fd.append("name",  newArtist.name.trim());
      fd.append("bio",   newArtist.bio.trim());
      fd.append("genre", newArtist.genre.trim());
      if (artistPhoto) fd.append("photo", artistPhoto);

      const res = await api.post("/api/songs/artists", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadArtists();
      setForm((p) => ({ ...p, artistId: res.data._id, artistName: res.data.name }));
      setNewArtist({ name: "", bio: "", genre: "" });
      setArtistPhoto(null);
      setShowArtistModal(false);
    } catch (err) {
      if (err.response?.data?.artist) {
        const existing = err.response.data.artist;
        setForm((p) => ({ ...p, artistId: existing._id, artistName: existing.name }));
        await loadArtists();
        setShowArtistModal(false);
      } else {
        setArtistError(err.response?.data?.message || "Failed to create artist");
      }
    } finally {
      setArtistLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setFileWarning("");
    if (file) {
      if (file.size > MAX_AUDIO_SIZE) {
        setFileWarning("File exceeds 1GB limit.");
        setForm((p) => ({ ...p, audio: null }));
        e.target.value = "";
        return;
      }
      if (file.size > WARN_SIZE) {
        setFileWarning(
          `Large file (${(file.size / 1024 / 1024).toFixed(0)}MB). ` +
          `Compress for faster upload: ffmpeg -i input.mp3 -b:a 192k output.mp3`
        );
      }
    }
    setForm((p) => ({ ...p, audio: file }));
  };

  const addSongHandler = async (e) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = new FormData();
      data.append("name",       form.name);
      data.append("artist",     form.artistName);
      data.append("artistId",   form.artistId);
      data.append("genre",      form.genre);
      data.append("year",       form.year);
      data.append("isLiveOnly", form.isLiveOnly);
      data.append("audio",      form.audio);
      if (form.cover) data.append("cover", form.cover);

      await api.post("/api/songs", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setForm({ name: "", artistId: "", artistName: "", genre: "", year: "", isLiveOnly: false, audio: null, cover: null });
      setCoverPreview(null);
      setCustomGenre(false);
      setFileWarning("");
      document.querySelector('input[type="file"]')?.value && (document.querySelector('input[type="file"]').value = "");
      setSuccess("Song uploaded successfully!");
      setTimeout(() => setSuccess(""), 3000);
      await Promise.all([loadSongs(), loadGenres()]);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to add song");
    } finally {
      setLoading(false);
    }
  };

  const deleteSong = async (id) => {
    if (!window.confirm("Delete this song?")) return;
    try {
      await api.delete(`/api/songs/${id}`);
      setSongs((prev) => prev.filter((s) => (s._id || s.id) !== id));
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete song");
    }
  };

  const genres = ["all", ...new Set(songs.map((s) => s.genre).filter(Boolean))];
  const regularCount  = songs.filter(s => !s.isLiveOnly).length;
  const liveOnlyCount = songs.filter(s =>  s.isLiveOnly).length;

  return (
    <main className="min-h-screen bg-[#0B0F1A] text-white px-4 sm:px-6 md:px-8 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/50">
          <Plus className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold">Add Music</h1>
          <p className="text-gray-400 mt-1">Upload and manage your music library</p>
        </div>
      </div>

      {/* Song type explanation banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-start gap-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Music2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Regular Songs</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Appear in the Dashboard for users to browse and play freely. Also included in the live radio stream.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Live-Only Songs</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Hidden from the Dashboard — exclusive to the live radio stream. Perfect for premieres, exclusives, or special content.
            </p>
          </div>
        </div>
      </div>

      {error   && <div className="px-5 py-4 rounded-xl bg-red-500/10   border border-red-500/20   text-red-300">{error}</div>}
      {success && (
        <div className="px-5 py-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 flex items-center gap-2">
          <Check className="w-5 h-5" />{success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Upload Form */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Upload className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold">Upload New Song</h2>
          </div>

          <form onSubmit={addSongHandler} className="space-y-5">

            {/* Song name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Song Name</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required placeholder="Enter song name"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all" />
            </div>

            {/* Artist dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-400" />Artist
              </label>
              <div className="relative">
                <select value={form.artistId || ""} onChange={handleArtistSelect} required
                  className="w-full appearance-none px-4 py-3 pr-10 bg-[#0B0F1A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer">
                  <option value="" disabled>Select an artist...</option>
                  {artists.map((a) => (
                    <option key={a._id} value={a._id}>{a.name}{a.genre ? ` — ${a.genre}` : ""}</option>
                  ))}
                  <option value="__new__">➕ Add New Artist</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
              {form.artistName && (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                  <Check className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm text-indigo-300">Selected: <strong>{form.artistName}</strong></span>
                </div>
              )}
            </div>

            {/* Genre + Year */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Genre</label>
                {!customGenre ? (
                  <div className="relative">
                    <select
                      value={form.genre}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setCustomGenre(true);
                          setForm((p) => ({ ...p, genre: "" }));
                        } else {
                          setForm((p) => ({ ...p, genre: e.target.value }));
                        }
                      }}
                      required
                      className="w-full appearance-none px-4 py-3 pr-10 bg-[#0B0F1A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer">
                      <option value="" disabled>Select genre...</option>
                      {availableGenres.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value="__new__">➕ Add New Genre</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      value={form.genre}
                      onChange={(e) => setForm((p) => ({ ...p, genre: e.target.value }))}
                      required autoFocus placeholder="e.g. Jazz, Classical..."
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all" />
                    <button type="button" onClick={() => { setCustomGenre(false); setForm((p) => ({ ...p, genre: "" })); }}
                      className="text-xs text-gray-500 hover:text-indigo-400 transition-colors">
                      ← Back to existing genres
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Release Year</label>
                <input type="number" value={form.year}
                  onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                  required placeholder="2024" min="1900" max={new Date().getFullYear() + 1}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all" />
              </div>
            </div>

            {/* Live Only toggle — redesigned with clear consequence text */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Song Visibility</label>

              <div className="grid grid-cols-2 gap-3">
                {/* Regular option */}
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, isLiveOnly: false }))}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                    !form.isLiveOnly
                      ? "bg-indigo-500/10 border-indigo-500/50"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      !form.isLiveOnly ? "border-indigo-400 bg-indigo-500" : "border-gray-500"
                    }`}>
                      {!form.isLiveOnly && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <Music2 className={`w-4 h-4 ${!form.isLiveOnly ? "text-indigo-400" : "text-gray-500"}`} />
                    <span className={`text-sm font-semibold ${!form.isLiveOnly ? "text-white" : "text-gray-400"}`}>
                      Regular
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed pl-6">
                    Dashboard only
                  </p>
                </button>

                {/* Live-only option */}
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, isLiveOnly: true }))}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                    form.isLiveOnly
                      ? "bg-red-500/10 border-red-500/50"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      form.isLiveOnly ? "border-red-400 bg-red-500" : "border-gray-500"
                    }`}>
                      {form.isLiveOnly && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <Radio className={`w-4 h-4 ${form.isLiveOnly ? "text-red-400" : "text-gray-500"}`} />
                    <span className={`text-sm font-semibold ${form.isLiveOnly ? "text-red-300" : "text-gray-400"}`}>
                      Live Only
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed pl-6">
                    Live stream only — hidden from dashboard
                  </p>
                </button>
              </div>

              {/* Consequence callout */}
              {form.isLiveOnly ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <Radio className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300">
                    This song will <strong>not appear</strong> in the user dashboard. It will only play during a live stream session.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                  <Music2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <p className="text-xs text-indigo-300">
                    This song will appear in the user dashboard only. It will <strong>not</strong> be included in live streams unless you select it manually in Live Control.
                  </p>
                </div>
              )}
            </div>

            {/* Cover image */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Cover Image <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => coverInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center cursor-pointer hover:border-indigo-500/60 transition-all overflow-hidden flex-shrink-0 group">
                  {coverPreview ? (
                    <img src={coverPreview} alt="cover preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-7 h-7 text-indigo-400 group-hover:scale-110 transition-transform" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {coverPreview ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-300 truncate">{form.cover?.name}</span>
                      <button type="button"
                        onClick={() => { setForm((p) => ({ ...p, cover: null })); setCoverPreview(null); if (coverInputRef.current) coverInputRef.current.value = ""; }}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Click the square to upload a cover image. JPG, PNG, WEBP supported.</p>
                  )}
                </div>
              </div>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setForm((p) => ({ ...p, cover: file }));
                  setCoverPreview(file ? URL.createObjectURL(file) : null);
                }} />
            </div>

            {/* Audio file */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Audio File <span className="text-gray-500 font-normal">(max 1GB)</span>
              </label>
              <input type="file" accept="audio/*" onChange={handleFileChange} required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white
                  file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                  file:bg-gradient-to-r file:from-indigo-500 file:to-purple-500
                  file:text-white file:font-medium file:cursor-pointer
                  hover:file:shadow-lg hover:file:shadow-indigo-500/50
                  focus:outline-none focus:border-indigo-500/50 transition-all" />
              {fileWarning && (
                <div className="flex gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">{fileWarning}</p>
                </div>
              )}
              <div className="flex gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300/80">MP3, WAV, FLAC, AAC supported · Max 1GB</p>
              </div>
            </div>

            <button disabled={!isValid || loading}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl
                bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold
                shadow-lg shadow-indigo-500/50 hover:shadow-indigo-500/70
                transition-all hover:-translate-y-0.5
                disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
              {loading
                ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading...</>
                : <><Upload className="w-5 h-5" />Upload Song</>}
            </button>
          </form>
        </div>

        {/* Songs List */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <LayoutList className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold">All Songs ({songs.length})</h2>
          </div>

          {/* Filters */}
          <div className="space-y-3 mb-5">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input type="text" placeholder="Search songs, artists..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}
                  className="w-full appearance-none bg-[#0B0F1A] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50 cursor-pointer">
                  {genres.map((g) => (
                    <option key={g} value={g}>{g === "all" ? "All Genres" : g}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
              <div className="relative">
                <select value={liveFilter} onChange={(e) => setLiveFilter(e.target.value)}
                  className="w-full appearance-none bg-[#0B0F1A] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50 cursor-pointer">
                  <option value="all">All Songs</option>
                  <option value="regular">Regular Only</option>
                  <option value="live">Live-Only</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Stats — clearer labels */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="px-4 py-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Music2 className="w-3.5 h-3.5 text-indigo-400" />
                <p className="text-xl font-bold text-white">{regularCount}</p>
              </div>
              <p className="text-xs text-gray-400">Regular</p>
              <p className="text-xs text-gray-600">Dashboard only</p>
            </div>
            <div className="px-4 py-3 bg-red-500/10 rounded-xl border border-red-500/20 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Radio className="w-3.5 h-3.5 text-red-400" />
                <p className="text-xl font-bold text-red-400">{liveOnlyCount}</p>
              </div>
              <p className="text-xs text-gray-400">Live-Only</p>
              <p className="text-xs text-gray-600">Live Stream Only</p>
            </div>
          </div>

          {/* Song list */}
          <div className="space-y-3 max-h-[480px] overflow-y-auto">
            {filteredSongs.length === 0 ? (
              <div className="text-center py-12">
                <Music2 className="w-16 h-16 mx-auto text-gray-700 mb-4" />
                <p className="text-gray-500">
                  {songs.length === 0 ? "No songs uploaded yet" : "No songs match your search"}
                </p>
              </div>
            ) : filteredSongs.map((song) => {
              const id = song._id || song.id;
              return (
                <div key={id}
                  className="flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all group">
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    song.isLiveOnly
                      ? "bg-red-500/20 border border-red-500/20"
                      : "bg-gradient-to-br from-indigo-500/20 to-purple-500/20"
                  }`}>
                    {song.isLiveOnly
                      ? <Radio className="w-5 h-5 text-red-400" />
                      : <Music2 className="w-5 h-5 text-indigo-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white truncate text-sm">{song.name}</p>
                      {song.isLiveOnly && (
                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30 flex-shrink-0 whitespace-nowrap">
                          LIVE ONLY
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {song.artist} · {song.genre} · {song.year}
                    </p>
                    <p className="text-xs mt-0.5">
                      {song.isLiveOnly
                        ? <span className="text-red-400/70">Live stream only · hidden from dashboard</span>
                        : <span className="text-indigo-400/70">Dashboard only</span>
                      }
                    </p>
                  </div>
                  <button onClick={() => deleteSong(id)}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100"
                    title="Delete song">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Artists Panel */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold">Artists ({artists.length})</h2>
          </div>
          <button onClick={() => setShowArtistModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all">
            <Plus className="w-4 h-4" />New Artist
          </button>
        </div>

        {artists.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No artists yet. Add one when uploading a song.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {artists.map((a) => (
              <div key={a._id}
                className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl border border-white/10 hover:border-indigo-500/30 transition-all text-center">
                {a.photo ? (
                  <img
                    src={`${AUDIOBASE}/${a.photo}`}
                    alt={a.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500/30"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300">
                    {a.name[0]?.toUpperCase()}
                  </div>
                )}
                <p className="text-sm font-medium text-white truncate w-full">{a.name}</p>
                {a.genre && <p className="text-xs text-gray-500 truncate w-full">{a.genre}</p>}
                <p className="text-xs text-gray-600">{a.songCount || 0} songs</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Artist Modal */}
      {showArtistModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1120] rounded-2xl p-6 w-full max-w-md border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Add New Artist</h2>
              <button
                onClick={() => { setShowArtistModal(false); setArtistError(""); setNewArtist({ name: "", bio: "", genre: "" }); setArtistPhoto(null); }}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {artistError && (
              <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
                {artistError}
              </div>
            )}

            <div className="space-y-4">
              {/* Photo upload */}
              <div className="flex flex-col items-center gap-3">
                <div
                  onClick={() => artistPhotoRef.current?.click()}
                  className="relative w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center cursor-pointer hover:border-indigo-500/60 transition-all overflow-hidden group">
                  {artistPhoto ? (
                    <img src={URL.createObjectURL(artistPhoto)} alt="preview"
                      className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-indigo-400 group-hover:scale-110 transition-transform" />
                  )}
                </div>
                <input ref={artistPhotoRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => setArtistPhoto(e.target.files?.[0] || null)} />
                <p className="text-xs text-gray-500">Click to upload artist photo</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">Artist Name *</label>
                <input value={newArtist.name} onChange={(e) => setNewArtist((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Arijit Singh" autoFocus
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">Genre</label>
                <input value={newArtist.genre} onChange={(e) => setNewArtist((p) => ({ ...p, genre: e.target.value }))}
                  placeholder="e.g. Bollywood, Pop"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">Bio (optional)</label>
                <textarea value={newArtist.bio} onChange={(e) => setNewArtist((p) => ({ ...p, bio: e.target.value }))}
                  placeholder="Short artist description..." rows={3}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all resize-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowArtistModal(false); setArtistError(""); setNewArtist({ name: "", bio: "", genre: "" }); setArtistPhoto(null); }}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all">
                Cancel
              </button>
              <button onClick={handleCreateArtist}
                disabled={artistLoading || !newArtist.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {artistLoading
                  ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Plus className="w-4 h-4" />Add Artist</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}