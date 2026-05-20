const express = require("express");
const auth    = require("../middleware/authMiddleware");
const admin   = require("../middleware/adminMiddleware");
const { uploadSong } = require("../middleware/uploadMiddleware");
const {
  getAlbums, getAlbumById, createAlbum, updateAlbum, deleteAlbum,
} = require("../controllers/albumController");

const router = express.Router();

const coverUpload = uploadSong.fields([{ name: "cover", maxCount: 1 }]);

router.get("/",    auth,        getAlbums);
router.get("/:id", auth,        getAlbumById);
router.post("/",   auth, admin, coverUpload, createAlbum);
router.put("/:id", auth, admin, coverUpload, updateAlbum);
router.delete("/:id", auth, admin, deleteAlbum);

module.exports = router;
