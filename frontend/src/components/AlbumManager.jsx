import { useEffect, useState, useRef } from "react";
import {
  Disc3, Plus, Pencil, Trash2, X, Save, Camera,
  ChevronDown, Music2, Search, Check, Radio,
  ImagePlus,
} from "lucide-react";
import api from "../services/api";

const BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/uploads`;

export default function AlbumManager({ artists, onAlbumsChange, reloadTrigger }) {
  const [albums,  setAlbums]  = useState([]);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  // Create / Edit modal
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState({ name: "", artist: "", artistId: "", year: String(new Date().getFullYear()) });
  const [coverFile,   setCoverFile]   = useState(null);
  const [coverPrev,   setCoverPrev]   = useState(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [formErr,     setFormErr]     = useState("");
  const coverRef = useRef(null);

  // Manage Songs modal
  const [songsModal,   setSongsModal]   = useState(null);
  const [allSongs,     setAllSongs]     = useState([]);
  const [selected,     setSelected]     = useState(new Set());
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsSaving,  setSongsSaving]  = useState(false);
  const [songsError,   setSongsError]   = useState("");
  const [songsSearch,  setSongsSearch]  = useState("");

  const load = async () => {
    try {
      const r = await api.get("/api/albums");
      setAlbums(r.data || []);
      onAlbumsChange?.(r.data || []);
    } catch { setError("Failed to load albums"); }
  };

  useEffect(() => { load(); }, [reloadTrigger]);

  // ── Create / Edit ────────────────────────────────────────
  const openCreate = () => {
    setForm({ name: "", artist: "", artistId: "", year: String(new Date().getFullYear()) });
    setCoverFile(null); setCoverPrev(null); setRemoveCover(false); setFormErr("");
    setModal("create");
  };
  const openEdit = (album) => {
    setForm({ name: album.name, artist: album.artist, artistId: album.artistId ? String(album.artistId) : "", year: String(album.year || "") });
    setCoverFile(null); setCoverPrev(null); setRemoveCover(false); setFormErr("");
    setModal(album);
  };

  const handleArtistSelect = (e) => {
    const val   = e.target.value;
    const found = artists.find((a) => a._id === val);
    setForm((p) => ({ ...p, artistId: val, artist: found?.name || p.artist }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())   { setFormErr("Album name is required"); return; }
    if (!form.artist.trim()) { setFormErr("Artist name is required"); return; }
    setSaving(true); setFormErr("");
    try {
      const data = new FormData();
      data.append("name",        form.name.trim());
      data.append("artist",      form.artist.trim());
      data.append("artistId",    form.artistId);
      data.append("year",        form.year);
      data.append("removeCover", String(removeCover && !coverFile));
      if (coverFile) data.append("cover", coverFile);
      modal === "create" ? await api.post("/api/albums", data) : await api.put(`/api/albums/${modal._id}`, data);
      setModal(null);
      setSuccess(modal === "create" ? "Album created!" : "Album updated!");
      setTimeout(() => setSuccess(""), 3000);
      await load();
    } catch (err) {
      setFormErr(err?.response?.data?.message || "Failed to save album");
    } finally { setSaving(false); }
  };

  const handleDelete = async (album) => {
    if (!window.confirm(`Delete "${album.name}"? Songs will be unlinked but kept.`)) return;
    try {
      await api.delete(`/api/albums/${album._id}`);
      setSuccess("Album deleted"); setTimeout(() => setSuccess(""), 3000);
      await load();
    } catch { setError("Failed to delete album"); }
  };

  // ── Manage Songs ─────────────────────────────────────────
  const openSongsModal = async (album) => {
    setSongsModal(album); setSongsLoading(true); setSongsError(""); setSongsSearch("");
    try {
      const r = await api.get("/api/songs/all");
      const songs = r.data || [];
      setAllSongs(songs);
      setSelected(new Set(
        songs.filter((s) => {
          const id = (s.albumId?._id || s.albumId)?.toString();
          return id === album._id.toString();
        }).map((s) => s._id)
      ));
    } catch { setSongsError("Failed to load songs"); }
    finally { setSongsLoading(false); }
  };

  const toggleSong = (id) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleSongsSave = async () => {
    setSongsSaving(true); setSongsError("");
    try {
      const changed = allSongs.filter((s) => {
        const wasIn = (s.albumId?._id || s.albumId)?.toString() === songsModal._id.toString();
        return wasIn !== selected.has(s._id);
      });
      await Promise.all(changed.map((s) => {
        const d = new FormData();
        d.append("name", s.name); d.append("artist", s.artist);
        d.append("genre", s.genre); d.append("year", String(s.year));
        d.append("isLiveOnly", String(!!s.isLiveOnly));
        d.append("albumId", selected.has(s._id) ? songsModal._id : "");
        return api.put(`/api/songs/${s._id}`, d);
      }));
      setSongsModal(null);
      setSuccess(`"${songsModal.name}" — ${selected.size} song${selected.size !== 1 ? "s" : ""} saved!`);
      setTimeout(() => setSuccess(""), 4000);
      await load();
    } catch { setSongsError("Failed to update songs"); }
    finally { setSongsSaving(false); }
  };

  const filteredSongs = allSongs.filter((s) => {
    const q = songsSearch.toLowerCase();
    return !q || s.name?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q);
  });

  const currentCover = modal && modal !== "create" && modal.cover && !removeCover
    ? `${BASE}/${modal.cover}` : null;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Albums</h2>
            <p className="text-xs text-gray-500">{albums.length} album{albums.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:-translate-y-0.5 transition-all"
        >
          <Plus className="w-4 h-4" />New Album
        </button>
      </div>

      {error   && <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">{error}</div>}
      {success && <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-300 text-sm flex items-center gap-2"><Check className="w-4 h-4" />{success}</div>}

      {/* Album grid */}
      {albums.length === 0 ? (
        <div
          onClick={openCreate}
          className="cursor-pointer group flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Disc3 className="w-8 h-8 text-purple-400" />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold">No albums yet</p>
            <p className="text-gray-500 text-sm mt-1">Click to create your first album</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-medium group-hover:bg-purple-500/20 transition-all">
            <Plus className="w-4 h-4" />Create Album
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {albums.map((album) => (
            <div
              key={album._id}
              className="group flex flex-col bg-white/5 rounded-2xl border border-white/10 hover:border-purple-500/40 hover:bg-white/8 transition-all overflow-hidden"
            >
              {/* Cover */}
              <div className="relative aspect-square overflow-hidden">
                {album.cover ? (
                  <img src={`${BASE}/${album.cover}`} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-900/50 via-purple-800/30 to-pink-900/50 flex items-center justify-center">
                    <Disc3 className="w-12 h-12 text-purple-400/40" />
                  </div>
                )}
                {/* Song count badge */}
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-full text-xs text-gray-300 border border-white/10">
                  {album.songCount || 0} songs
                </div>
              </div>

              {/* Info */}
              <div className="p-3 flex-1">
                <p className="font-semibold text-white text-sm truncate leading-tight">{album.name}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{album.artist}</p>
                <p className="text-xs text-gray-600 mt-1">{album.year}</p>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-3 border-t border-white/10">
                <button
                  onClick={() => openSongsModal(album)}
                  className="flex flex-col items-center gap-0.5 py-2.5 text-purple-400 hover:bg-purple-500/10 transition-colors"
                  title="Manage songs"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Songs</span>
                </button>
                <button
                  onClick={() => openEdit(album)}
                  className="flex flex-col items-center gap-0.5 py-2.5 text-indigo-400 hover:bg-indigo-500/10 transition-colors border-x border-white/10"
                  title="Edit album"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Edit</span>
                </button>
                <button
                  onClick={() => handleDelete(album)}
                  className="flex flex-col items-center gap-0.5 py-2.5 text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete album"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Manage Songs Modal ─────────────────────────────── */}
      {songsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1120] rounded-2xl w-full max-w-xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Music2 className="w-5 h-5 text-purple-400" />Manage Songs
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="text-purple-300 font-medium">{songsModal.name}</span>
                  {" · "}<span className="text-white font-semibold">{selected.size}</span> selected
                </p>
              </div>
              <button onClick={() => setSongsModal(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="px-6 pt-4 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input value={songsSearch} onChange={(e) => setSongsSearch(e.target.value)}
                  placeholder="Search songs or artists..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50 transition-all" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5 min-h-0">
              {songsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                </div>
              ) : filteredSongs.length === 0 ? (
                <p className="text-center text-gray-500 py-10">No songs found</p>
              ) : filteredSongs.map((song) => {
                const checked = selected.has(song._id);
                return (
                  <button key={song._id} type="button" onClick={() => toggleSong(song._id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                      checked
                        ? "bg-purple-500/10 border-purple-500/30"
                        : "bg-white/3 border-transparent hover:bg-white/6 hover:border-white/10"
                    }`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      checked ? "bg-purple-500 border-purple-500" : "border-gray-600"
                    }`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                      {song.cover
                        ? <img src={`${BASE}/${song.cover}`} alt="" className="w-full h-full object-cover" />
                        : song.isLiveOnly
                          ? <Radio className="w-4 h-4 text-red-400" />
                          : <Music2 className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{song.name}</p>
                      <p className="text-xs text-gray-500 truncate">{song.artist} · {song.genre}</p>
                    </div>
                    {song.isLiveOnly && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full border border-red-500/20 flex-shrink-0">LIVE</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3">
              {songsError && <p className="text-xs text-red-400 self-center mr-auto">{songsError}</p>}
              <button onClick={() => setSongsModal(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all font-medium">
                Cancel
              </button>
              <button onClick={handleSongsSave} disabled={songsSaving}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg shadow-purple-500/30 transition-all disabled:opacity-50">
                {songsSaving
                  ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Save className="w-4 h-4" />Save · {selected.size} songs</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ────────────────────────────── */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1120] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 flex items-center justify-center">
                  <Disc3 className="w-4.5 h-4.5 text-purple-400" />
                </div>
                <h2 className="text-lg font-bold text-white">
                  {modal === "create" ? "Create New Album" : "Edit Album"}
                </h2>
              </div>
              <button onClick={() => setModal(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">

                {/* Cover + name side by side */}
                <div className="flex gap-5 items-start">
                  {/* Cover upload */}
                  <div className="flex-shrink-0">
                    <div
                      onClick={() => coverRef.current?.click()}
                      className="relative w-28 h-28 rounded-2xl overflow-hidden cursor-pointer group border-2 border-dashed border-purple-500/30 hover:border-purple-500/60 transition-all"
                    >
                      {coverPrev || currentCover ? (
                        <img src={coverPrev || currentCover} alt="cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-900/60 to-pink-900/40 flex flex-col items-center justify-center gap-1.5">
                          <ImagePlus className="w-7 h-7 text-purple-400 group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] text-purple-400/80 font-medium">Cover</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <input ref={coverRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setCoverFile(f); setCoverPrev(f ? URL.createObjectURL(f) : null);
                        if (f) setRemoveCover(false);
                      }} />
                    {(coverPrev || currentCover) && (
                      <button type="button"
                        onClick={() => { setCoverFile(null); setCoverPrev(null); setRemoveCover(true); if (coverRef.current) coverRef.current.value = ""; }}
                        className="mt-2 w-full text-[10px] text-red-400 hover:text-red-300 transition-colors text-center">
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Name + year */}
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Album Name *</label>
                      <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        required autoFocus placeholder="e.g. Greatest Hits"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/60 focus:bg-white/8 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Release Year</label>
                      <input type="number" value={form.year} onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                        placeholder={String(new Date().getFullYear())} min="1900" max={new Date().getFullYear() + 1}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/60 focus:bg-white/8 transition-all text-sm" />
                    </div>
                  </div>
                </div>

                {/* Artist */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Artist *</label>
                  <div className="relative">
                    <select value={form.artistId} onChange={handleArtistSelect}
                      className="w-full appearance-none px-4 py-3 pr-10 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/60 transition-all cursor-pointer text-sm">
                      <option value="">— Link to an artist profile —</option>
                      {artists.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                  <input value={form.artist} onChange={(e) => setForm((p) => ({ ...p, artist: e.target.value }))}
                    required placeholder="Artist display name (shown on album)"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/60 focus:bg-white/8 transition-all text-sm" />
                </div>

                {formErr && (
                  <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">{formErr}</div>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-5 border-t border-white/10">
                <button type="button" onClick={() => setModal(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all font-medium text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg shadow-purple-500/40 hover:shadow-purple-500/60 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none text-sm">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><Save className="w-4 h-4" />{modal === "create" ? "Create Album" : "Save Changes"}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
