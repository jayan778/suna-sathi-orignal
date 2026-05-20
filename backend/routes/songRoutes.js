const express              = require("express");
const auth                 = require("../middleware/authMiddleware");
const admin                = require("../middleware/adminMiddleware");
const { uploadAudio, uploadArtistPhoto, uploadSong } = require("../middleware/uploadMiddleware");
const { validateSong }     = require("../middleware/validation");
const {
  addSong,
  updateSong,
  getSongs,
  getAllSongs,
  getGenres,
  getSongsByArtist,
  deleteSong,
  getArtists,
  createArtist,
  updateArtist,
  updateArtistPhoto,
} = require("../controllers/songController");

const router = express.Router();
router.get("/genres",               auth,         getGenres);
router.get("/",                     auth,         getSongs);
router.get("/all",                  auth, admin,  getAllSongs);
router.get ("/artists",             auth,         getArtists);
router.post("/artists",             auth, admin,
  uploadArtistPhoto.single("photo"), createArtist);
router.put ("/artists/:id",         auth, admin,
  uploadArtistPhoto.single("photo"), updateArtist);
router.put ("/artists/:id/photo",   auth, admin,
  uploadArtistPhoto.single("photo"), updateArtistPhoto);

router.get("/by-artist/:artistId",  auth,         getSongsByArtist);
router.post(
  "/",
  auth, admin,
  uploadSong.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
  validateSong,
  addSong
);

router.put(
  "/:id",
  auth, admin,
  uploadSong.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
  updateSong
);
router.delete("/:id",               auth, admin,  deleteSong);

module.exports = router;