const Album  = require("../models/Album");
const Artist = require("../models/Artist");
const Song   = require("../models/Song");
const fs     = require("fs").promises;
const path   = require("path");

const uploadsDir = path.resolve(__dirname, "../uploads");

const safeDel = async (filePath) => {
  if (!filePath) return;
  const full = path.resolve(path.join(uploadsDir, "covers", path.basename(filePath)));
  if (full.startsWith(uploadsDir)) { try { await fs.unlink(full); } catch {} }
};

/* GET ALL ALBUMS */
exports.getAlbums = async (req, res) => {
  try {
    const albums = await Album.find().sort({ createdAt: -1 });
    const result = await Promise.all(
      albums.map(async (a) => {
        const count = await Song.countDocuments({ albumId: a._id });
        return { ...a.toObject(), songCount: count };
      })
    );
    res.json(result);
  } catch {
    res.status(500).json({ message: "Failed to fetch albums" });
  }
};

/* GET ALBUM + ITS SONGS */
exports.getAlbumById = async (req, res) => {
  try {
    const album = await Album.findById(req.params.id);
    if (!album) return res.status(404).json({ message: "Album not found" });
    const songs = await Song.find({ albumId: album._id, isLiveOnly: { $ne: true } }).sort({ createdAt: 1 });
    res.json({ ...album.toObject(), songs });
  } catch {
    res.status(500).json({ message: "Failed to fetch album" });
  }
};

/* CREATE ALBUM */
exports.createAlbum = async (req, res) => {
  try {
    const { name, artist, artistId, year } = req.body;
    if (!name?.trim() || !artist?.trim()) {
      return res.status(400).json({ message: "Name and artist are required" });
    }

    let resolvedArtistId = null;
    if (artistId) {
      try {
        const found = await Artist.findById(artistId);
        if (found) resolvedArtistId = found._id;
      } catch {}
    }

    const coverFile = req.files?.cover?.[0];
    const album = await Album.create({
      name:      name.trim(),
      artist:    artist.trim(),
      artistId:  resolvedArtistId,
      cover:     coverFile ? `covers/${coverFile.filename}` : "",
      year:      year || new Date().getFullYear(),
      createdBy: req.user.id,
    });

    res.status(201).json({ ...album.toObject(), songCount: 0 });
  } catch (err) {
    console.error("Create album error:", err);
    res.status(500).json({ message: "Failed to create album" });
  }
};

/* UPDATE ALBUM */
exports.updateAlbum = async (req, res) => {
  try {
    const album = await Album.findById(req.params.id);
    if (!album) return res.status(404).json({ message: "Album not found" });

    const { name, artist, artistId, year, removeCover } = req.body;
    if (name?.trim())   album.name   = name.trim();
    if (artist?.trim()) album.artist = artist.trim();
    if (year)           album.year   = Number(year);

    if (artistId !== undefined) {
      if (artistId) {
        try {
          const found = await Artist.findById(artistId);
          album.artistId = found ? found._id : null;
        } catch { album.artistId = null; }
      } else {
        album.artistId = null;
      }
    }

    const coverFile = req.files?.cover?.[0];
    if (coverFile) {
      await safeDel(album.cover);
      album.cover = `covers/${coverFile.filename}`;
    } else if (removeCover === "true" && album.cover) {
      await safeDel(album.cover);
      album.cover = "";
    }

    await album.save();
    const songCount = await Song.countDocuments({ albumId: album._id });
    res.json({ ...album.toObject(), songCount });
  } catch (err) {
    console.error("Update album error:", err);
    res.status(500).json({ message: "Failed to update album" });
  }
};

/* DELETE ALBUM */
exports.deleteAlbum = async (req, res) => {
  try {
    const album = await Album.findById(req.params.id);
    if (!album) return res.status(404).json({ message: "Album not found" });

    await Song.updateMany({ albumId: album._id }, { $set: { albumId: null } });
    await safeDel(album.cover);
    await Album.findByIdAndDelete(req.params.id);
    res.json({ message: "Album deleted" });
  } catch {
    res.status(500).json({ message: "Failed to delete album" });
  }
};
