const mongoose = require("mongoose");

const albumSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    artist:    { type: String, required: true },
    artistId:  { type: mongoose.Schema.Types.ObjectId, ref: "Artist", default: null },
    cover:     { type: String, default: "" },
    year:      { type: Number, default: () => new Date().getFullYear() },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

albumSchema.index({ artistId: 1 });

module.exports = mongoose.model("Album", albumSchema);
