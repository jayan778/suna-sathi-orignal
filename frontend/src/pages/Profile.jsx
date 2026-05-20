import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { User, Mail, Lock, Save, Heart, Music2, Library, Camera, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../services/api";

const APIBASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/uploads`;

export default function Profile() {
  const { user, booting, updateProfile, updateProfilePhoto, refreshMe, likedSongIds } = useAuth();

  const initial = useMemo(() => {
    const full  = user?.name || "";
    const parts = full.split(" ").filter(Boolean);
    return {
      firstName:          parts.slice(0, -1).join(" ") || parts[0] || "",
      lastName:           parts.length > 1 ? parts[parts.length - 1] : "",
      email:              user?.email || "",
      currentPassword:    "",
      newPassword:        "",
      confirmNewPassword: "",
    };
  }, [user?.name, user?.email]);

  const [form,    setForm]    = useState(initial);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [likedSongs, setLikedSongs] = useState([]);
  const [loadingLiked, setLoadingLiked] = useState(false);

  // Profile photo state
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [savingPhoto,  setSavingPhoto]  = useState(false);
  const [photoError,   setPhotoError]   = useState("");
  const photoInputRef = useRef(null);

  useEffect(() => { setForm(initial); }, [initial]);

  useEffect(() => {
    if (!user && !booting) refreshMe?.().catch(() => {});
  }, [booting, user, refreshMe]);

  useEffect(() => {
    if (likedSongIds.length > 0) loadLikedSongs();
  }, [likedSongIds]);

  const loadLikedSongs = async () => {
    setLoadingLiked(true);
    try {
      const res = await api.get("/api/songs");
      const all = res.data || [];
      setLikedSongs(all.filter((s) => likedSongIds.includes(s._id)));
    } catch {
      setLikedSongs([]);
    } finally {
      setLoadingLiked(false);
    }
  };

  const handlePhotoSave = async () => {
    setPhotoError("");
    setSavingPhoto(true);
    try {
      const fd = new FormData();
      if (photoFile) {
        fd.append("photo", photoFile);
      } else {
        fd.append("removePhoto", "true");
      }
      await updateProfilePhoto(fd);
      setPhotoFile(null);
      setPhotoPreview(null);
      setSuccess("Profile photo updated!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setPhotoError(err?.response?.data?.message || "Failed to update photo");
    } finally {
      setSavingPhoto(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const wantsPasswordChange = Boolean(form.newPassword || form.confirmNewPassword);

    if (wantsPasswordChange) {
      if (form.newPassword !== form.confirmNewPassword) { setError("New passwords do not match"); return; }
      if (!form.currentPassword)                        { setError("Current password is required"); return; }
      if (form.newPassword.length < 6)                  { setError("New password must be at least 6 characters"); return; }
    }

    const payload = {
      firstName: form.firstName.trim(),
      lastName:  form.lastName.trim(),
      email:     form.email.trim(),
    };
    if (wantsPasswordChange) {
      payload.currentPassword = form.currentPassword;
      payload.newPassword     = form.newPassword;
    }

    try {
      setSaving(true);
      await updateProfile(payload);
      setSuccess("Profile updated successfully");
      setForm((p) => ({ ...p, currentPassword: "", newPassword: "", confirmNewPassword: "" }));
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (booting) {
    return (
      <main className="min-h-screen bg-[#0B0F1A] text-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-gray-400">Loading profile...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0F1A] text-white px-4 sm:px-6 md:px-8 py-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl font-bold">Profile Settings</h1>
            <p className="text-gray-400 mt-1">Manage your account details</p>
          </div>
          <Link to="/dashboard"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 hover:border-indigo-500/50 transition-all">
            <Library className="w-4 h-4" />
            <span className="hidden sm:inline">Library</span>
          </Link>
        </div>

        {/* Profile Photo */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Camera className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold">Profile Photo</h2>
          </div>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar display */}
            <div className="relative group flex-shrink-0">
              <div
                onClick={() => photoInputRef.current?.click()}
                className="w-28 h-28 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-indigo-500/40 hover:border-indigo-500 transition-all relative">
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                ) : user?.photo ? (
                  <img src={`${APIBASE}/${user.photo}`} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center text-3xl font-bold text-indigo-300">
                    {user?.name?.[0]?.toUpperCase() || <User className="w-10 h-10 text-indigo-300" />}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <Camera className="w-7 h-7 text-white" />
                </div>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setPhotoFile(file);
                  setPhotoPreview(file ? URL.createObjectURL(file) : null);
                  setPhotoError("");
                }}
              />
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-3 w-full sm:w-auto">
              <p className="text-sm text-gray-400">Click the avatar or use the button below to upload a new photo. Max 5 MB.</p>
              {photoError && <p className="text-sm text-red-400">{photoError}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-all text-sm font-medium">
                  <Camera className="w-4 h-4" />
                  {user?.photo || photoPreview ? "Change Photo" : "Upload Photo"}
                </button>
                {user?.photo && !photoFile && (
                  <button
                    type="button"
                    onClick={async () => {
                      setPhotoError("");
                      setSavingPhoto(true);
                      try {
                        const fd = new FormData();
                        fd.append("removePhoto", "true");
                        await updateProfilePhoto(fd);
                        setSuccess("Profile photo removed.");
                        setTimeout(() => setSuccess(""), 3000);
                      } catch (err) {
                        setPhotoError(err?.response?.data?.message || "Failed to remove photo");
                      } finally {
                        setSavingPhoto(false);
                      }
                    }}
                    disabled={savingPhoto}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />Remove Photo
                  </button>
                )}
                {photoFile && (
                  <>
                    <button
                      type="button"
                      onClick={handlePhotoSave}
                      disabled={savingPhoto}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50">
                      {savingPhoto
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />}
                      {savingPhoto ? "Saving..." : "Save Photo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (photoInputRef.current) photoInputRef.current.value = ""; }}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white text-sm transition-all">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className={`px-5 py-4 rounded-xl border backdrop-blur-xl ${
            error
              ? "text-red-300 bg-red-500/10 border-red-500/20"
              : "text-green-300 bg-green-500/10 border-green-500/20"
          }`}>
            {error || success}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-8">
          {/* Personal Info */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold">Personal Information</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">First Name</label>
                <input value={form.firstName}
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="John" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Last Name</label>
                <input value={form.lastName}
                  onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="Doe" />
              </div>
            </div>
            <div className="space-y-2 mt-5">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" />Email Address
              </label>
              <input type="email" required value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all"
                placeholder="john@example.com" />
            </div>

            {/* Account info */}
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Account Role</p>
                <p className="text-sm font-medium text-white capitalize">{user?.role || "user"}</p>
              </div>
              <div className="px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Email Status</p>
                <p className={`text-sm font-medium ${user?.isVerified ? "text-green-400" : "text-yellow-400"}`}>
                  {user?.isVerified ? "Verified" : "Unverified"}
                </p>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-2">
              <Lock className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-bold">Change Password</h2>
            </div>
            <p className="text-sm text-gray-400 mb-6">Leave blank to keep your current password</p>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Current Password</label>
                <input type="password" value={form.currentPassword}
                  onChange={(e) => setForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
                  placeholder="Enter current password" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">New Password</label>
                  <input type="password" value={form.newPassword}
                    onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
                    placeholder="New password" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Confirm New Password</label>
                  <input type="password" value={form.confirmNewPassword}
                    onChange={(e) => setForm((p) => ({ ...p, confirmNewPassword: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
                    placeholder="Confirm new password" />
                </div>
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center justify-end gap-4">
            <button type="button" onClick={() => setForm(initial)}
              className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all">
              Reset
            </button>
            <button disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500
                text-white font-semibold shadow-lg shadow-indigo-500/50 hover:shadow-indigo-500/70
                transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
              <Save className="w-5 h-5" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>

        {/* Liked Songs */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Heart className="w-5 h-5 text-red-400 fill-red-400" />
            <h2 className="text-xl font-bold">Liked Songs</h2>
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-gray-400">
              {likedSongIds.length}
            </span>
          </div>

          {loadingLiked ? (
            <div className="text-center py-8">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
            </div>
          ) : likedSongs.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="w-12 h-12 mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">No liked songs yet. Like songs from the dashboard.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {likedSongs.map((song) => (
                <div key={song._id}
                  className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Music2 className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate text-sm">{song.name}</p>
                    <p className="text-xs text-gray-400 truncate">{song.artist} · {song.genre}</p>
                  </div>
                  <Heart className="w-4 h-4 text-red-400 fill-red-400 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}