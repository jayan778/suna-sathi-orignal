const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

// Ensure directories exist
const audioDir   = path.join(__dirname, "../uploads/audio");
const artistDir  = path.join(__dirname, "../uploads/artists");
const coversDir  = path.join(__dirname, "../uploads/covers");
const avatarsDir = path.join(__dirname, "../uploads/avatars");
[audioDir, artistDir, coversDir, avatarsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Audio storage ────────────────────────────────────────
const audioStorage = multer.diskStorage({
  destination: audioDir,
  filename: (req, file, cb) => {
    cb(null, `audio_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

const audioFilter = (req, file, cb) => {
  const allowed = [
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/flac", "audio/x-flac", "audio/aac",
    "audio/ogg",  "audio/mp4",  "audio/x-m4a",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only audio files are allowed"), false);
  }
};

const uploadAudio = multer({
  storage:  audioStorage,
  fileFilter: audioFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1 GB
    files:    1,
  },
});

// ── Artist photo storage ─────────────────────────────────
const artistStorage = multer.diskStorage({
  destination: artistDir,
  filename: (req, file, cb) => {
    cb(null, `artist_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const uploadArtistPhoto = multer({
  storage:    artistStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files:    1,
  },
});

// ── Song cover storage ───────────────────────────────────
const coverStorage = multer.diskStorage({
  destination: coversDir,
  filename: (req, file, cb) => {
    cb(null, `cover_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

const uploadSong = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, file.fieldname === "cover" ? coversDir : audioDir);
    },
    filename: (req, file, cb) => {
      const prefix = file.fieldname === "cover" ? "cover" : "audio";
      cb(null, `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "cover") return imageFilter(req, file, cb);
    return audioFilter(req, file, cb);
  },
  limits: { fileSize: 1024 * 1024 * 1024 },
});

// ── User avatar storage ──────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: avatarsDir,
  filename: (req, file, cb) => {
    cb(null, `avatar_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

const uploadUserAvatar = multer({
  storage:    avatarStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files:    1,
  },
});

module.exports = { uploadAudio, uploadArtistPhoto, uploadSong, uploadUserAvatar };