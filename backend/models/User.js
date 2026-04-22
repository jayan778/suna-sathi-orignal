const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name:       { type: String,  required: true },
    email:      { type: String,  required: true, unique: true },
    password:   { type: String,  required: true },
    role:       { type: String,  enum: ["user", "admin"], default: "user" },
    blocked:    { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    resetPasswordToken:   { type: String, default: null },
    resetPasswordExpires: { type: Date,   default: null },
    likedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }],

    // Failed login tracking
    loginAttempts: { type: Number, default: 0 },
    lockUntil:     { type: Date,   default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);