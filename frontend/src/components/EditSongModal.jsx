import { useState, useRef } from "react";
import {
  X, Pencil, Save, User, Music2, Radio,
  Camera, AlertTriangle, ChevronDown, Disc3,
} from "lucide-react";
import api from "../services/api";

const AUDIOBASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/uploads`;

export default function EditSongModal({ song, artists, availableGenres, albums = [], onSave, onClose }) {
  const [form, setForm] = useState({
    name:       song.name       || "",
    artistId:   song.artistId ? String(song.artistId) : "",
    artistName: song.artist     || "",
    albumId:    song.albumId?._id ? String(song.albumId._id) : (song.albumId ? String(song.albumId) : ""),
    genre:      song.genre      || "",
    year:       String(song.year || ""),
    isLiveOnly: !!song.isLiveOnly,
  });

  const [audioFile,    setAudioFile]    = useState(null);
  const [coverFile,    setCoverFile]    = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [removeCover,  setRemoveCover]  = useState(false);
  const [customGenre,  setCustomGenre]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  // Artist photo editing
  const [artistPhotoFile,    setArtistPhotoFile]    = useState(null);
  const [artistPhotoPreview, setArtistPhotoPreview] = useState(null);
  const [artistPhotoLoading, setArtistPhotoLoading] = useState(false);
  const [artistPhotoError,   setArtistPhotoError]   = useState("");
  const [artistPhotoSuccess, setArtistPhotoSuccess] = useState(false);

  const coverRef       = useRef(null);
  const artistPhotoRef = useRef(null);


  const handleArtistSelect = (e) => {
    const val   = e.target.value;
    const found = artists.find((a) => a._id === val);
    setForm((p) => ({ ...p, artistId: val, artistName: found?.name || p.artistName }));
    // Reset artist photo state when switching artists
    setArtistPhotoFile(null);
    setArtistPhotoPreview(null);
    setArtistPhotoError("");
    setArtistPhotoSuccess(false);
    if (artistPhotoRef.current) artistPhotoRef.current.value = "";
  };

  const handleArtistPhotoSave = async () => {
    if (!form.artistId || !artistPhotoFile) return;
    setArtistPhotoLoading(true);
    setArtistPhotoError("");
    setArtistPhotoSuccess(false);
    try {
      const fd = new FormData();
      fd.append("photo", artistPhotoFile);
      await api.put(`/api/songs/artists/${form.artistId}/photo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setArtistPhotoSuccess(true);
      setArtistPhotoFile(null);
      // Keep preview to show updated photo
    } catch (err) {
      setArtistPhotoError(err?.response?.data?.message || "Failed to update artist photo");
    } finally {
      setArtistPhotoLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Song name is required"); return; }
    if (!form.artistName.trim()) { setError("Artist name is required"); return; }
    if (!form.genre.trim()) { setError("Genre is required"); return; }
    if (!form.year.trim()) { setError("Release year is required"); return; }
    setLoading(true);
    setError("");
    try {
      const data = new FormData();
      data.append("name",        form.name.trim());
      data.append("artist",      form.artistName.trim());
      data.append("artistId",    form.artistId);
      data.append("albumId",     form.albumId);
      data.append("genre",       form.genre.trim());
      data.append("year",        form.year);
      data.append("isLiveOnly",  String(form.isLiveOnly));
      data.append("removeCover", String(removeCover && !coverFile));
      if (audioFile) data.append("audio", audioFile);
      if (coverFile) data.append("cover", coverFile);

      await api.put(`/api/songs/${song._id}`, data);
      onSave();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update song");
    } finally {
      setLoading(false);
    }
  };

  const currentCoverUrl = song.cover ? `${AUDIOBASE}/${song.cover}` : null;
  const showCurrentCover = currentCoverUrl && !removeCover && !coverPreview;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1120] rounded-2xl p-6 w-full max-w-lg border border-white/10 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Pencil className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Edit Song</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* error shown at bottom too — see near Save button */}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Song name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Song Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              placeholder="Enter song name"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>

          {/* Artist */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />Artist
            </label>
            <div className="relative">
              <select
                value={form.artistId}
                onChange={handleArtistSelect}
                className="w-full appearance-none px-4 py-3 pr-10 bg-[#0B0F1A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
              >
                <option value="">— No linked profile —</option>
                {artists.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}{a.genre ? ` — ${a.genre}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Artist display name (shown to users)</label>
              <input
                value={form.artistName}
                onChange={(e) => setForm((p) => ({ ...p, artistName: e.target.value }))}
                required
                placeholder="Artist name"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
          </div>

          {/* Artist photo — shown when an artist profile is linked */}
          {form.artistId && (() => {
            const linked = artists.find((a) => a._id === form.artistId);
            if (!linked) return null;
            const currentPhoto = artistPhotoPreview
              || (linked.photo ? `${AUDIOBASE}/${linked.photo}` : null);
            return (
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Artist Photo</p>
                <div className="flex items-center gap-4">
                  {/* Clickable avatar */}
                  <div
                    onClick={() => artistPhotoRef.current?.click()}
                    className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-indigo-500/40 hover:border-indigo-500 cursor-pointer transition-all group flex-shrink-0">
                    {currentPhoto ? (
                      <img src={currentPhoto} alt={linked.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-xl font-bold text-indigo-300">
                        {linked.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => artistPhotoRef.current?.click()}
                        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors">
                        {currentPhoto ? "Change Photo" : "Upload Photo"}
                      </button>
                      {artistPhotoFile && (
                        <>
                          <button
                            type="button"
                            onClick={handleArtistPhotoSave}
                            disabled={artistPhotoLoading}
                            className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-1">
                            {artistPhotoLoading
                              ? <div className="w-3 h-3 border border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                              : null}
                            {artistPhotoLoading ? "Saving…" : "Save Photo"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setArtistPhotoFile(null); setArtistPhotoPreview(null); if (artistPhotoRef.current) artistPhotoRef.current.value = ""; }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors">
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                    {artistPhotoError && <p className="text-xs text-red-400">{artistPhotoError}</p>}
                    {artistPhotoSuccess && <p className="text-xs text-green-400">Photo updated!</p>}
                  </div>
                </div>
                <input
                  ref={artistPhotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setArtistPhotoFile(file);
                    setArtistPhotoPreview(file ? URL.createObjectURL(file) : null);
                    setArtistPhotoError("");
                    setArtistPhotoSuccess(false);
                  }}
                />
              </div>
            );
          })()}

          {/* Album */}
          {albums.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Disc3 className="w-4 h-4 text-purple-400" />Album
              </label>
              <div className="relative">
                <select
                  value={form.albumId}
                  onChange={(e) => setForm((p) => ({ ...p, albumId: e.target.value }))}
                  className="w-full appearance-none px-4 py-3 pr-10 bg-[#0B0F1A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all cursor-pointer"
                >
                  <option value="">— No album —</option>
                  {albums.map((a) => (
                    <option key={a._id} value={a._id}>{a.name} ({a.artist})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>
          )}

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
                    className="w-full appearance-none px-4 py-3 pr-10 bg-[#0B0F1A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
                  >
                    <option value="" disabled>Select genre...</option>
                    {availableGenres.map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value="__new__">➕ Add New Genre</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    value={form.genre}
                    onChange={(e) => setForm((p) => ({ ...p, genre: e.target.value }))}
                    required
                    autoFocus
                    placeholder="e.g. Jazz, Classical..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => { setCustomGenre(false); setForm((p) => ({ ...p, genre: "" })); }}
                    className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
                  >
                    ← Back to existing genres
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Release Year</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                required
                placeholder="2024"
                min="1900"
                max={new Date().getFullYear() + 1}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Song Visibility</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, isLiveOnly: false }))}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                  !form.isLiveOnly ? "bg-indigo-500/10 border-indigo-500/50" : "bg-white/5 border-white/10 hover:bg-white/10"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${!form.isLiveOnly ? "border-indigo-400 bg-indigo-500" : "border-gray-500"}`}>
                  {!form.isLiveOnly && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <Music2 className={`w-4 h-4 ${!form.isLiveOnly ? "text-indigo-400" : "text-gray-500"}`} />
                <span className={`text-sm font-semibold ${!form.isLiveOnly ? "text-white" : "text-gray-400"}`}>Regular</span>
              </button>

              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, isLiveOnly: true }))}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                  form.isLiveOnly ? "bg-red-500/10 border-red-500/50" : "bg-white/5 border-white/10 hover:bg-white/10"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${form.isLiveOnly ? "border-red-400 bg-red-500" : "border-gray-500"}`}>
                  {form.isLiveOnly && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <Radio className={`w-4 h-4 ${form.isLiveOnly ? "text-red-400" : "text-gray-500"}`} />
                <span className={`text-sm font-semibold ${form.isLiveOnly ? "text-red-300" : "text-gray-400"}`}>Live Only</span>
              </button>
            </div>
          </div>

          {/* Cover image */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              Cover Image <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-4">
              <div
                onClick={() => coverRef.current?.click()}
                className="relative w-20 h-20 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center cursor-pointer hover:border-indigo-500/60 transition-all overflow-hidden flex-shrink-0 group"
              >
                {coverPreview ? (
                  <img src={coverPreview} alt="new cover" className="w-full h-full object-cover" />
                ) : showCurrentCover ? (
                  <img src={currentCoverUrl} alt="current cover" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-7 h-7 text-indigo-400 group-hover:scale-110 transition-transform" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                {(coverPreview || showCurrentCover) ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => coverRef.current?.click()}
                      className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCoverFile(null);
                        setCoverPreview(null);
                        setRemoveCover(true);
                        if (coverRef.current) coverRef.current.value = "";
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Click the square to upload a cover image.</p>
                )}
                {removeCover && !coverPreview && (
                  <button
                    type="button"
                    onClick={() => setRemoveCover(false)}
                    className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
                  >
                    ↩ Keep existing cover
                  </button>
                )}
              </div>
            </div>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setCoverFile(file);
                setCoverPreview(file ? URL.createObjectURL(file) : null);
                if (file) setRemoveCover(false);
              }}
            />
          </div>

          {/* Audio replacement */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              Replace Audio{" "}
              <span className="text-gray-500 font-normal">(optional — leave empty to keep current)</span>
            </label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white
                file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:bg-gradient-to-r file:from-indigo-500 file:to-purple-500
                file:text-white file:font-medium file:cursor-pointer
                focus:outline-none focus:border-indigo-500/50 transition-all"
            />
            {audioFile && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-300">The existing audio file will be replaced and permanently deleted.</p>
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><Save className="w-4 h-4" />Save Changes</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
