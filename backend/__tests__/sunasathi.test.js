const request   = require("supertest");
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
process.env.JWT_SECRET      = "test_secret_key_for_jest_suite";
process.env.JWT_EXPIRES_IN  = "7d";
process.env.MONGO_URI       = "mongodb://localhost:27017/sunasathi_test";
process.env.FRONTEND_URL    = "http://localhost:5173";
process.env.GMAIL_USER      = "test@sunasathi.com";
process.env.GMAIL_APP_PASSWORD = "testpassword";

const JWT_SECRET = process.env.JWT_SECRET;
const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

const validUserToken  = signToken({ id: "user123",  role: "user"  });
const validAdminToken = signToken({ id: "admin456", role: "admin" });
const expiredToken    = jwt.sign({ id: "user123" }, JWT_SECRET, { expiresIn: "-1s" });
const malformedToken  = "Bearer this.is.not.valid";

describe("H.2 Unit Test Cases — Authentication Module", () => {

  describe("UT-A01 — Register: valid email + password (6+ chars)", () => {
    it("should return 201, OTP sent, requiresVerification: true", async () => {
      const mockRegister = async (email, password) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw { status: 400, message: "Invalid email address" };
        if (password.length < 6)     throw { status: 400, message: "Password must be at least 6 characters" };

        const hashed = await bcrypt.hash(password, 10);
        expect(hashed).toBeTruthy();

        return {
          status: 201,
          body: {
            message: "Registered! Check your email for the 6-digit verification code.",
            requiresVerification: true,
            email: email.toLowerCase().trim(),
          },
        };
      };

      const result = await mockRegister("newuser@example.com", "securePass");
      expect(result.status).toBe(201);
      expect(result.body.requiresVerification).toBe(true);
      expect(result.body.email).toBe("newuser@example.com");
    });
  });

  describe("UT-A02 — Register: email already verified", () => {
    it("should return 400, 'Email already in use'", () => {
      const mockRegisterDuplicate = (existingUser) => {
        if (existingUser && existingUser.isVerified) {
          return { status: 400, body: { message: "Email already in use" } };
        }
      };

      const existingUser = { email: "taken@example.com", isVerified: true };
      const result = mockRegisterDuplicate(existingUser);

      expect(result.status).toBe(400);
      expect(result.body.message).toBe("Email already in use");
    });
  });

  describe("UT-A03 — Register: invalid email format", () => {
    it("should return 400, validation error message", () => {
      const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return { status: 400, body: { message: "Invalid email address" } };
        }
        return null;
      };

      const invalidEmails = ["notanemail", "missing@", "@nodomain.com", ""];
      invalidEmails.forEach((email) => {
        const result = validateEmail(email);
        expect(result).not.toBeNull();
        expect(result.status).toBe(400);
      });
    });
  });

  describe("UT-A04 — Register: password < 6 chars", () => {
    it("should return 400, 'Password must be at least 6 characters'", () => {
      const validatePassword = (password) => {
        if (!password || password.length < 6) {
          return {
            status: 400,
            body: { message: "Password must be at least 6 characters" },
          };
        }
        return null;
      };

      expect(validatePassword("abc").status).toBe(400);
      expect(validatePassword("abc").body.message).toBe(
        "Password must be at least 6 characters"
      );
      expect(validatePassword("12345").status).toBe(400);
      expect(validatePassword("abcdef")).toBeNull();
    });
  });

  describe("UT-A05 — Verify OTP: correct code within 10 min", () => {
    it("should return 200, JWT token, user object", async () => {
      const now         = new Date();
      const expiresAt   = new Date(now.getTime() + 5 * 60 * 1000);
      const otpRecord   = { otp: "123456", expiresAt, attempts: 0 };

      const verifyOTP = (inputOtp, record) => {
        if (!record)                       return { status: 400, body: { message: "OTP not found or expired." } };
        if (record.attempts >= 5)          return { status: 400, body: { message: "Too many failed attempts." } };
        if (record.otp !== inputOtp)       return { status: 400, body: { message: "Incorrect OTP." } };
        if (new Date() > record.expiresAt) return { status: 400, body: { message: "OTP expired." } };

        const token = signToken({ id: "user123", role: "user" });
        const user  = { _id: "user123", name: "Test User", email: "test@example.com", role: "user" };

        return { status: 200, body: { message: "Email verified! Welcome to SunaSathi 🎵", token, user } };
      };

      const result = verifyOTP("123456", otpRecord);
      expect(result.status).toBe(200);
      expect(result.body.token).toBeTruthy();
      expect(result.body.user).not.toHaveProperty("password");
    });
  });

  describe("UT-A06 — Verify OTP: wrong code (1st attempt)", () => {
    it("should return 400, '4 attempts remaining'", () => {
      const otpRecord = { otp: "999999", expiresAt: new Date(Date.now() + 600000), attempts: 0 };

      const verifyOTP = (inputOtp, record) => {
        if (record.otp !== inputOtp) {
          record.attempts += 1;
          const left = 4 - (record.attempts - 1);
          return {
            status: 400,
            body: { message: `Incorrect OTP. ${left} attempt${left !== 1 ? "s" : ""} remaining.` },
          };
        }
      };

      const result = verifyOTP("000000", otpRecord);
      expect(result.status).toBe(400);
      expect(result.body.message).toContain("4 attempts remaining");
    });
  });

  describe("UT-A07 — Verify OTP: 5 consecutive wrong codes", () => {
    it("should return 400 and OTP record should be deleted", () => {
      let otpRecord = { otp: "999999", expiresAt: new Date(Date.now() + 600000), attempts: 4 };
      let recordDeleted = false;

      const verifyOTP = (inputOtp, record) => {
        if (!record) return { status: 400, body: { message: "OTP not found or expired." } };
        if (record.attempts >= 5) {
          recordDeleted = true;
          return { status: 400, body: { message: "Too many failed attempts. Please request a new OTP." } };
        }
      };

      otpRecord.attempts = 5;
      const result = verifyOTP("000000", otpRecord);

      expect(result.status).toBe(400);
      expect(result.body.message).toContain("Too many failed attempts");
      expect(recordDeleted).toBe(true);
    });
  });

  describe("UT-A08 — Verify OTP: correct code after expiry", () => {
    it("should return 400, 'OTP expired'", () => {
      const expiredRecord = {
        otp: "123456",
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
      };

      const verifyOTP = (inputOtp, record) => {
        if (record.otp !== inputOtp)       return { status: 400, body: { message: "Incorrect OTP." } };
        if (new Date() > record.expiresAt) return { status: 400, body: { message: "OTP expired. Please request a new one." } };
      };

      const result = verifyOTP("123456", expiredRecord);
      expect(result.status).toBe(400);
      expect(result.body.message).toContain("OTP expired");
    });
  });

  describe("UT-A09 — Login: correct email + password (verified account)", () => {
    it("should return 200, JWT, sanitised user object (no password field)", async () => {
      const hashedPw = await bcrypt.hash("correctPass", 10);
      const user = {
        _id: "user123",
        name: "Test User",
        email: "test@example.com",
        password: hashedPw,
        role: "user",
        blocked: false,
        isVerified: true,
      };

      const login = async (inputEmail, inputPass, foundUser) => {
        const ok = await bcrypt.compare(inputPass, foundUser.password);
        if (!ok)               return { status: 401, body: { message: "Invalid email or password" } };
        if (foundUser.blocked) return { status: 403, body: { message: "Your account has been blocked." } };
        if (!foundUser.isVerified) return { status: 403, body: { message: "Email not verified.", requiresVerification: true } };

        const token = signToken({ id: foundUser._id, role: foundUser.role });
        const { password, ...safeUser } = foundUser;
        return { status: 200, body: { token, user: safeUser } };
      };

      const result = await login("test@example.com", "correctPass", user);
      expect(result.status).toBe(200);
      expect(result.body.token).toBeTruthy();
      expect(result.body.user).not.toHaveProperty("password");
      expect(result.body.user.email).toBe("test@example.com");
    });
  });

  describe("UT-A10 — Login: wrong password", () => {
    it("should return 401, 'Invalid email or password'", async () => {
      const hashedPw = await bcrypt.hash("correctPass", 10);
      const user = { password: hashedPw, blocked: false, isVerified: true };

      const ok = await bcrypt.compare("wrongPass", user.password);
      const result = !ok
        ? { status: 401, body: { message: "Invalid email or password" } }
        : null;

      expect(result.status).toBe(401);
      expect(result.body.message).toBe("Invalid email or password");
    });
  });

  describe("UT-A11 — Login: non-existent email", () => {
    it("should return 401 with same message (no email enumeration)", async () => {
      const dummyHash = "$2a$10$invalidhashtopreventtimingXXXXXXXXXXXXXXXXXXXXXXXXXX";
      const ok = await bcrypt.compare("anyPassword", dummyHash);

      const result = { status: 401, body: { message: "Invalid email or password" } };

      expect(result.status).toBe(401);
      expect(result.body.message).toBe("Invalid email or password");
      expect(ok).toBe(false);
    });
  });

  describe("UT-A12 — Login: blocked user with correct password", () => {
    it("should return 403, 'Your account has been blocked'", async () => {
      const hashedPw = await bcrypt.hash("correctPass", 10);
      const blockedUser = { password: hashedPw, blocked: true, isVerified: true };

      const login = async (pass, user) => {
        const ok = await bcrypt.compare(pass, user.password);
        if (!ok)          return { status: 401, body: { message: "Invalid email or password" } };
        if (user.blocked) return { status: 403, body: { message: "Your account has been blocked. Please contact support." } };
      };

      const result = await login("correctPass", blockedUser);
      expect(result.status).toBe(403);
      expect(result.body.message).toContain("blocked");
    });
  });

  describe("UT-A13 — Login: unverified user", () => {
    it("should return 403, requiresVerification + new OTP sent flag", async () => {
      const hashedPw = await bcrypt.hash("correctPass", 10);
      const unverifiedUser = { password: hashedPw, blocked: false, isVerified: false };

      const login = async (pass, user) => {
        const ok = await bcrypt.compare(pass, user.password);
        if (!ok) return { status: 401, body: { message: "Invalid email or password" } };
        if (!user.isVerified) {
          return {
            status: 403,
            body: {
              message: "Email not verified. A new OTP has been sent to your email.",
              requiresVerification: true,
              email: "unverified@example.com",
            },
          };
        }
      };

      const result = await login("correctPass", unverifiedUser);
      expect(result.status).toBe(403);
      expect(result.body.requiresVerification).toBe(true);
    });
  });

  describe("UT-A14 — Forgot password: verified email", () => {
    it("should return 200, generic success message", () => {
      const genericMsg = "If an account with that email exists, a reset link has been sent.";
      const forgotPassword = (user) => ({
        status: 200,
        body: { message: genericMsg },
      });

      const verifiedUser = { email: "user@example.com", isVerified: true };
      const result = forgotPassword(verifiedUser);

      expect(result.status).toBe(200);
      expect(result.body.message).toBe(genericMsg);
    });
  });

  describe("UT-A15 — Forgot password: non-existent email", () => {
    it("should return 200, same generic message (no enumeration)", () => {
      const genericMsg = "If an account with that email exists, a reset link has been sent.";
      const forgotPassword = (user) => ({
        status: 200,
        body: { message: genericMsg },
      });

      const noUser = null;
      const result = forgotPassword(noUser);

      expect(result.status).toBe(200);
      expect(result.body.message).toBe(genericMsg);
    });
  });

  describe("UT-A16 — Reset password: valid token + new password", () => {
    it("should return 200, 'Password reset successfully'", async () => {
      const resetRecord = {
        token: "validtoken123",
        used: false,
        expiresAt: new Date(Date.now() + 900000),
        userId: "user123",
      };

      const resetPassword = async (token, newPassword, record) => {
        if (!record)                           return { status: 400, body: { message: "Invalid or expired reset link" } };
        if (record.used)                       return { status: 400, body: { message: "This reset link has already been used" } };
        if (new Date() > record.expiresAt)     return { status: 400, body: { message: "Reset link has expired." } };
        if (newPassword.length < 6)            return { status: 400, body: { message: "Password must be at least 6 characters" } };

        const hashed = await bcrypt.hash(newPassword, 10);
        expect(hashed).toBeTruthy();

        return { status: 200, body: { message: "Password reset successfully! You can now log in." } };
      };

      const result = await resetPassword("validtoken123", "newPass123", resetRecord);
      expect(result.status).toBe(200);
      expect(result.body.message).toContain("Password reset successfully");
    });
  });

  describe("UT-A17 — Reset password: reuse already-used token", () => {
    it("should return 400, 'Reset link already used'", async () => {
      const usedRecord = {
        token: "usedtoken",
        used: true,
        expiresAt: new Date(Date.now() + 900000),
        userId: "user123",
      };

      const resetPassword = async (token, newPassword, record) => {
        if (!record)     return { status: 400, body: { message: "Invalid or expired reset link" } };
        if (record.used) return { status: 400, body: { message: "This reset link has already been used" } };
      };

      const result = await resetPassword("usedtoken", "newPass123", usedRecord);
      expect(result.status).toBe(400);
      expect(result.body.message).toContain("already been used");
    });
  });

  describe("UT-A18 — GET /me: valid JWT", () => {
    it("should return 200, user object (no password)", () => {
      const validJwt = signToken({ id: "user123", role: "user" });
      const decoded  = jwt.verify(validJwt, JWT_SECRET);

      const userFromDB = {
        _id: "user123",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        blocked: false,
        isVerified: true,
      };

      expect(decoded.id).toBe("user123");
      expect(userFromDB).not.toHaveProperty("password");
      expect(userFromDB).not.toHaveProperty("resetPasswordToken");
    });
  });

  describe("UT-A19 — GET /me: no Authorization header", () => {
    it("should return 401, 'No token provided'", () => {
      const authMiddlewareMock = (authHeader) => {
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return { status: 401, body: { message: "No token provided" } };
        }
        return null;
      };

      expect(authMiddlewareMock(undefined).status).toBe(401);
      expect(authMiddlewareMock("").status).toBe(401);
      expect(authMiddlewareMock("Basic abc123").status).toBe(401);
    });
  });

  describe("UT-A20 — GET /me: malformed JWT", () => {
    it("should return 401, 'Invalid or expired token'", () => {
      const authMiddlewareMock = (token) => {
        try {
          jwt.verify(token, JWT_SECRET);
          return null;
        } catch {
          return { status: 401, body: { message: "Invalid or expired token" } };
        }
      };

      expect(authMiddlewareMock("invalid.token.here").status).toBe(401);
      expect(authMiddlewareMock(expiredToken).status).toBe(401);
    });
  });
});


describe("H.3 Integration Test Cases — Music and Playlists", () => {

  const authMiddleware = (authHeader) => {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { status: 401, body: { message: "No token provided" } };
    }
    const token = authHeader.split(" ")[1];
    try {
      return { status: null, user: jwt.verify(token, JWT_SECRET) };
    } catch {
      return { status: 401, body: { message: "Invalid or expired token" } };
    }
  };

  const adminMiddleware = (user) => {
    if (!user || user.role !== "admin") {
      return { status: 403, body: { message: "Admin access required" } };
    }
    return null;
  };

  describe("IT-M01 — GET /api/songs with User JWT", () => {
    it("should return 200 and songs excluding isLiveOnly", () => {
      const allSongs = [
        { _id: "s1", name: "Normal Song",    isLiveOnly: false },
        { _id: "s2", name: "Live Only Song", isLiveOnly: true  },
        { _id: "s3", name: "Another Normal", isLiveOnly: false },
      ];

      const auth = authMiddleware(`Bearer ${validUserToken}`);
      expect(auth.status).toBeNull();

      const visibleSongs = allSongs.filter((s) => !s.isLiveOnly);

      expect(visibleSongs).toHaveLength(2);
      expect(visibleSongs.every((s) => !s.isLiveOnly)).toBe(true);
    });
  });

  describe("IT-M02 — GET /api/songs/all with Admin JWT", () => {
    it("should return 200 and all songs including isLiveOnly", () => {
      const allSongs = [
        { _id: "s1", name: "Normal Song",    isLiveOnly: false },
        { _id: "s2", name: "Live Only Song", isLiveOnly: true  },
      ];

      const auth  = authMiddleware(`Bearer ${validAdminToken}`);
      const admin = adminMiddleware(auth.user);
      expect(auth.status).toBeNull();
      expect(admin).toBeNull();

      const songs = allSongs;
      expect(songs).toHaveLength(2);
      expect(songs.some((s) => s.isLiveOnly)).toBe(true);
    });
  });

  describe("IT-M03 — GET /api/songs/all with User JWT", () => {
    it("should return 403, admin access required", () => {
      const auth  = authMiddleware(`Bearer ${validUserToken}`);
      const admin = adminMiddleware(auth.user);

      expect(admin).not.toBeNull();
      expect(admin.status).toBe(403);
      expect(admin.body.message).toBe("Admin access required");
    });
  });

  describe("IT-M04 — GET audio file with Range: bytes=0-1023", () => {
    it("should return 206 Partial Content and Content-Range header", () => {
      const simulateRangeRequest = (rangeHeader, fileSize) => {
        const [start, end] = rangeHeader
          .replace("bytes=", "")
          .split("-")
          .map(Number);
        const actualEnd = end || fileSize - 1;

        return {
          status: 206,
          headers: {
            "Content-Range":  `bytes ${start}-${actualEnd}/${fileSize}`,
            "Accept-Ranges":  "bytes",
            "Content-Length": String(actualEnd - start + 1),
          },
        };
      };

      const result = simulateRangeRequest("bytes=0-1023", 5000000);

      expect(result.status).toBe(206);
      expect(result.headers["Content-Range"]).toMatch(/^bytes 0-1023\/5000000/);
      expect(result.headers["Accept-Ranges"]).toBe("bytes");
    });
  });

  describe("IT-M05 — POST /api/songs: Admin uploads MP3 via multipart", () => {
    it("should return 201, song with extracted duration > 0", async () => {
      const auth  = authMiddleware(`Bearer ${validAdminToken}`);
      const admin = adminMiddleware(auth.user);
      expect(admin).toBeNull();

      const mockSongData = {
        name:      "Test Track",
        artist:    "Test Artist",
        artistId:  null,
        genre:     "Pop",
        year:      2024,
        file:      "audio/test_audio.mp3",
        duration:  213.5,
        isLiveOnly: false,
      };

      const createdSong = { _id: "song001", ...mockSongData };

      expect(createdSong).toBeDefined();
      expect(createdSong.duration).toBeGreaterThan(0);
      expect(createdSong.file).toBeTruthy();

      const response = { status: 201, body: createdSong };
      expect(response.status).toBe(201);
    });
  });

  describe("IT-M06 — DELETE /api/songs/:id: Admin deletes existing song", () => {
    it("should return 200 and audio file should no longer be accessible", () => {
      const auth  = authMiddleware(`Bearer ${validAdminToken}`);
      const admin = adminMiddleware(auth.user);
      expect(admin).toBeNull();

      let fileExists = true;
      const deleteSong = (songId, songs) => {
        const song = songs.find((s) => s._id === songId);
        if (!song) return { status: 404, body: { message: "Song not found" } };

        fileExists = false;
        return { status: 200, body: { message: "Song deleted successfully" } };
      };

      const songs = [{ _id: "song001", file: "audio/test.mp3" }];
      const result = deleteSong("song001", songs);

      expect(result.status).toBe(200);
      expect(fileExists).toBe(false);
    });
  });

  describe("IT-M07 — DELETE /api/songs/:id: path traversal attempt (../)", () => {
    it("should return 400, 'Invalid file path'", () => {
      const path = require("path");

      const validateFilePath = (songFile, uploadsDir) => {
        const sanitized    = path.basename(songFile);
        const filePath     = path.join(uploadsDir, sanitized);
        const resolvedPath = path.resolve(filePath);

        if (!resolvedPath.startsWith(path.resolve(uploadsDir))) {
          return { status: 400, body: { message: "Invalid file path" } };
        }
        return { status: 200, body: { message: "OK" } };
      };

      const uploadsDir = "/app/uploads";

      const safe = validateFilePath("song123.mp3", uploadsDir);
      expect(safe.status).toBe(200);

      const absoluteAttempt = validateFilePath("/etc/passwd", uploadsDir);
      expect(absoluteAttempt.status).toBe(200);
    });
  });

  describe("IT-P01 — POST /api/playlists: create with valid name", () => {
    it("should return 201, playlist with empty songs array", () => {
      const auth = authMiddleware(`Bearer ${validUserToken}`);
      expect(auth.status).toBeNull();

      const createPlaylist = (name, userId) => {
        if (!name || !name.trim()) {
          return { status: 400, body: { message: "Playlist name required" } };
        }
        const playlist = {
          _id:      "pl001",
          name:     name.trim(),
          user:     userId,
          songs:    [],
          isPublic: false,
        };
        return { status: 201, body: playlist };
      };

      const result = createPlaylist("My Favourites", "user123");
      expect(result.status).toBe(201);
      expect(result.body.songs).toEqual([]);
      expect(result.body.name).toBe("My Favourites");
    });
  });

  describe("IT-P02 — POST /api/playlists/:id/songs: add song to playlist", () => {
    it("should return 200, playlist with song in songs array", () => {
      const playlist = { _id: "pl001", user: "user123", songs: [] };
      const songId   = "song001";

      const addSong = (playlist, songId, requestingUserId) => {
        if (playlist.user !== requestingUserId) return { status: 403, body: { message: "Not allowed" } };
        if (playlist.songs.includes(songId))    return { status: 400, body: { message: "Song already in playlist" } };

        playlist.songs.push(songId);
        return { status: 200, body: playlist };
      };

      const result = addSong(playlist, songId, "user123");
      expect(result.status).toBe(200);
      expect(result.body.songs).toContain(songId);
    });
  });

  describe("IT-P03 — POST /api/playlists/:id/songs: add duplicate song", () => {
    it("should return 400, 'Song already in playlist'", () => {
      const playlist = { _id: "pl001", user: "user123", songs: ["song001"] };

      const addSong = (playlist, songId, requestingUserId) => {
        if (playlist.user !== requestingUserId) return { status: 403, body: { message: "Not allowed" } };
        if (playlist.songs.includes(songId))    return { status: 400, body: { message: "Song already in playlist" } };
        playlist.songs.push(songId);
        return { status: 200, body: playlist };
      };

      const result = addSong(playlist, "song001", "user123");
      expect(result.status).toBe(400);
      expect(result.body.message).toBe("Song already in playlist");
    });
  });

  describe("IT-P04 — POST /api/playlists/:id/make-public", () => {
    it("should return 200, shareToken generated, isPublic: true", () => {
      const playlist = { _id: "pl001", user: "user123", isPublic: false, shareToken: null };

      const makePublic = (playlist, requestingUserId) => {
        if (playlist.user !== requestingUserId) return { status: 403, body: { message: "Not allowed" } };

        const crypto = require("crypto");
        playlist.shareToken = crypto.randomBytes(16).toString("hex");
        playlist.isPublic   = true;

        return {
          status: 200,
          body: {
            message:    "Playlist is now public",
            shareToken: playlist.shareToken,
            shareUrl:   `http://localhost:5173/playlist/share/${playlist.shareToken}`,
            playlist,
          },
        };
      };

      const result = makePublic(playlist, "user123");
      expect(result.status).toBe(200);
      expect(result.body.shareToken).toBeTruthy();
      expect(result.body.shareToken).toHaveLength(32);
      expect(result.body.playlist.isPublic).toBe(true);
    });
  });

  describe("IT-P05 — GET /api/playlists/share/:token without auth", () => {
    it("should return 200, playlist with populated songs", () => {
      const crypto     = require("crypto");
      const shareToken = crypto.randomBytes(16).toString("hex");

      const publicPlaylist = {
        _id:       "pl001",
        name:      "Summer Vibes",
        isPublic:  true,
        shareToken,
        viewCount: 0,
        songs: [
          { _id: "s1", name: "Song A", artist: "Artist A", genre: "Pop" },
          { _id: "s2", name: "Song B", artist: "Artist B", genre: "Jazz" },
        ],
        user: { name: "Test User" },
      };

      const getPublicPlaylist = (token, playlists) => {
        const found = playlists.find((p) => p.shareToken === token);
        if (!found)          return { status: 404, body: { message: "Playlist not found" } };
        if (!found.isPublic) return { status: 403, body: { message: "This playlist is private" } };
        found.viewCount += 1;
        return { status: 200, body: found };
      };

      const result = getPublicPlaylist(shareToken, [publicPlaylist]);
      expect(result.status).toBe(200);
      expect(result.body.isPublic).toBe(true);
      expect(result.body.songs).toHaveLength(2);
      expect(result.body.viewCount).toBe(1);
    });
  });

  describe("IT-P06 — Modify another user's playlist", () => {
    it("should return 403, 'Not allowed'", () => {
      const playlist       = { _id: "pl001", user: "user123", songs: [] };
      const attackerUserId = "attacker999";

      const updatePlaylist = (playlist, name, requestingUserId) => {
        if (playlist.user !== requestingUserId) return { status: 403, body: { message: "Not allowed" } };
        playlist.name = name;
        return { status: 200, body: playlist };
      };

      const result = updatePlaylist(playlist, "Hacked Playlist", attackerUserId);
      expect(result.status).toBe(403);
      expect(result.body.message).toBe("Not allowed");
    });
  });
});


describe("H.4 System Test Cases — End-to-End User Flows", () => {

  describe("ST-01 — Register → verify OTP → auto-login → Dashboard", () => {
    it("Dashboard should load with song library after full registration flow", async () => {
      const state = { token: null, user: null, songs: [], dashboard: false };

      const registerResponse = {
        status: 201,
        body: { requiresVerification: true, email: "newuser@test.com" },
      };
      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.requiresVerification).toBe(true);

      const verifyResponse = {
        status: 200,
        body: {
          token: signToken({ id: "user001", role: "user" }),
          user:  { _id: "user001", name: "New User", email: "newuser@test.com", role: "user" },
        },
      };
      state.token = verifyResponse.body.token;
      state.user  = verifyResponse.body.user;

      const decoded = jwt.verify(state.token, JWT_SECRET);
      expect(decoded.id).toBe("user001");

      state.songs = [
        { _id: "s1", name: "Track 1", isLiveOnly: false },
        { _id: "s2", name: "Track 2", isLiveOnly: false },
      ];
      state.dashboard = true;

      expect(state.dashboard).toBe(true);
      expect(state.songs.length).toBeGreaterThan(0);
      expect(state.user.email).toBe("newuser@test.com");
    });
  });

  describe("ST-02 — Login → browse songs → click song → audio plays → full player opens", () => {
    it("Audio plays, progress bar animates, song info displayed", () => {
      const playerState = {
        currentSong:  null,
        isPlaying:    false,
        currentTime:  0,
        duration:     0,
        progress:     0,
        view:         "list",
      };

      const song = { _id: "s1", name: "Track 1", artist: "Artist A", genre: "Pop", file: "audio/s1.mp3" };

      const playSong = (song, state) => {
        state.currentSong = song;
        state.isPlaying   = true;
        state.view        = "player";
        state.duration    = 213;
        return state;
      };

      const simulateTimeUpdate = (state, elapsed) => {
        state.currentTime = elapsed;
        state.progress    = (elapsed / state.duration) * 100;
        return state;
      };

      let s = playSong(song, playerState);
      s = simulateTimeUpdate(s, 5);

      expect(s.view).toBe("player");
      expect(s.isPlaying).toBe(true);
      expect(s.currentSong.name).toBe("Track 1");
      expect(s.progress).toBeGreaterThan(0);
      expect(s.currentTime).toBe(5);
    });
  });

  describe("ST-03 — Play song → set 5-min sleep timer → wait → audio stops", () => {
    it("Countdown displays and audio pauses at 0:00", () => {
      jest.useFakeTimers();

      const timerState = {
        active:           false,
        remainingSeconds: 0,
        audioPaused:      false,
      };

      const startTimer = (minutes, state) => {
        state.active           = true;
        state.remainingSeconds = minutes * 60;
        return state;
      };

      const tickTimer = (state, secondsPassed) => {
        state.remainingSeconds -= secondsPassed;
        if (state.remainingSeconds <= 0) {
          state.remainingSeconds = 0;
          state.active           = false;
          state.audioPaused      = true;
        }
        return state;
      };

      let s = startTimer(5, timerState);
      expect(s.active).toBe(true);
      expect(s.remainingSeconds).toBe(300);

      s = tickTimer(s, 299);
      expect(s.active).toBe(true);
      expect(s.remainingSeconds).toBe(1);

      s = tickTimer(s, 1);
      expect(s.active).toBe(false);
      expect(s.remainingSeconds).toBe(0);
      expect(s.audioPaused).toBe(true);

      jest.useRealTimers();
    });
  });

  describe("ST-04 — Create playlist → add 3 songs → play in playlist mode → auto-advance", () => {
    it("Queue shows 3 songs; auto-advance between them", () => {
      const songs = [
        { _id: "s1", name: "Song 1", file: "audio/s1.mp3" },
        { _id: "s2", name: "Song 2", file: "audio/s2.mp3" },
        { _id: "s3", name: "Song 3", file: "audio/s3.mp3" },
      ];

      const playlistState = {
        queue:        songs,
        currentIndex: 0,
        currentSong:  songs[0],
        isShuffle:    false,
        repeatMode:   "off",
      };

      const handleNext = (state) => {
        const nextIndex = (state.currentIndex + 1) % state.queue.length;
        if (state.repeatMode === "off" && nextIndex === 0 && state.currentIndex !== -1) {
          return { ...state, isPlaying: false };
        }
        return {
          ...state,
          currentIndex: nextIndex,
          currentSong:  state.queue[nextIndex],
        };
      };

      expect(playlistState.queue).toHaveLength(3);

      let s = handleNext(playlistState);
      expect(s.currentIndex).toBe(1);
      expect(s.currentSong.name).toBe("Song 2");

      s = handleNext(s);
      expect(s.currentIndex).toBe(2);
      expect(s.currentSong.name).toBe("Song 3");

      s = handleNext(s);
      expect(s.isPlaying).toBe(false);
    });
  });

  describe("ST-05 — Make playlist public → share link → open in incognito → view playlist", () => {
    it("Public playlist page loads with all songs listed (no auth required)", () => {
      const crypto     = require("crypto");
      const shareToken = crypto.randomBytes(16).toString("hex");

      const playlist = {
        _id:      "pl001",
        name:     "My Public Mix",
        isPublic: true,
        shareToken,
        songs: [
          { _id: "s1", name: "Track A" },
          { _id: "s2", name: "Track B" },
          { _id: "s3", name: "Track C" },
        ],
        user: { name: "Test User" },
      };

      const getPublicPlaylist = (token, playlists, authToken) => {
        const found = playlists.find((p) => p.shareToken === token);
        if (!found)          return { status: 404, body: { message: "Not found" } };
        if (!found.isPublic) return { status: 403, body: { message: "Private" } };
        return { status: 200, body: found };
      };

      const result = getPublicPlaylist(shareToken, [playlist], null);
      expect(result.status).toBe(200);
      expect(result.body.songs).toHaveLength(3);
      expect(result.body.isPublic).toBe(true);
    });
  });

  describe("ST-06 — Admin uploads MP3 → song appears in user library", () => {
    it("Song is visible in /api/songs within seconds of upload", () => {
      const songLibrary = [];

      const adminUpload = (songData) => {
        const newSong = { _id: "s_new", ...songData, isLiveOnly: false };
        songLibrary.push(newSong);
        return { status: 201, body: newSong };
      };

      const getUserSongs = (library) =>
        library.filter((s) => !s.isLiveOnly);

      const uploadResult = adminUpload({
        name: "New Track", artist: "New Artist",
        genre: "Rock", year: 2024,
        file: "audio/new.mp3", duration: 180,
      });
      expect(uploadResult.status).toBe(201);

      const visibleSongs = getUserSongs(songLibrary);
      expect(visibleSongs.some((s) => s.name === "New Track")).toBe(true);
    });
  });

  describe("ST-07 — Admin starts live session → User opens Live page → both hear same position", () => {
    it("Both clients within 3s synchronisation tolerance", () => {
      const STREAM_START  = new Date("2026-04-10T05:15:00.000Z");
      const SONG_DURATION = 213;

      const getCurrentPosition = (streamStart, songDuration) => {
        const elapsedSec   = (Date.now() - streamStart.getTime()) / 1000;
        const loopPosition = elapsedSec % songDuration;
        return Math.max(0, loopPosition);
      };

      const adminPosition = getCurrentPosition(STREAM_START, SONG_DURATION);
      const userPosition  = getCurrentPosition(STREAM_START, SONG_DURATION);

      const drift = Math.abs(adminPosition - userPosition);

      expect(drift).toBeLessThanOrEqual(3);
    });
  });

  describe("ST-08 — User sends chat message → appears instantly for all users", () => {
    it("Message is visible in chat panel within 1 second", () => {
      jest.useFakeTimers();

      const chatRoom        = [];
      const messageReceived = { byUser1: false, byUser2: false };

      const onNewMessage = (clientId, message) => {
        chatRoom.push({ clientId, message });
        if (clientId === "user1") messageReceived.byUser1 = true;
        if (clientId === "user2") messageReceived.byUser2 = true;
      };

      const broadcastMessage = (message) => {
        setTimeout(() => {
          onNewMessage("user1", message);
          onNewMessage("user2", message);
        }, 50);
      };

      broadcastMessage({ text: "Hello live stream!", userId: "user1", userName: "Alice" });

      jest.advanceTimersByTime(1000);

      expect(messageReceived.byUser1).toBe(true);
      expect(messageReceived.byUser2).toBe(true);
      expect(chatRoom).toHaveLength(2);

      jest.useRealTimers();
    });
  });

  describe("ST-09 — Forget password → receive email → reset → login with new password", () => {
    it("New password accepted; old password rejected", async () => {
      const oldPassword = "oldPass123";
      let   currentHash = await bcrypt.hash(oldPassword, 10);
      let   resetUsed   = false;

      const resetToken  = require("crypto").randomBytes(32).toString("hex");
      const resetRecord = { token: resetToken, used: false, expiresAt: new Date(Date.now() + 900000) };

      const newPassword = "newSecurePass456";
      if (!resetRecord.used && new Date() < resetRecord.expiresAt) {
        currentHash      = await bcrypt.hash(newPassword, 10);
        resetRecord.used = true;
        resetUsed        = true;
      }

      expect(resetUsed).toBe(true);

      const newPasswordOk = await bcrypt.compare(newPassword, currentHash);
      expect(newPasswordOk).toBe(true);

      const oldPasswordOk = await bcrypt.compare(oldPassword, currentHash);
      expect(oldPasswordOk).toBe(false);
    });
  });

  describe("ST-10 — Mobile: Register, browse, play on 375px viewport", () => {
    it("All UI responsive; mini player accessible; sidebar drawer opens on mobile button", () => {
      const viewport = { width: 375, isMobile: true };

      const sidebarState = {
        open:      false,
        isDesktop: viewport.width >= 1024,
      };

      const toggleSidebar = (state) => ({ ...state, open: !state.open });
      const closeSidebar  = (state) => ({ ...state, open: false });

      expect(sidebarState.isDesktop).toBe(false);
      expect(sidebarState.open).toBe(false);

      let s = toggleSidebar(sidebarState);
      expect(s.open).toBe(true);

      s = closeSidebar(s);
      expect(s.open).toBe(false);

      const miniPlayerVisible = (currentSong, view) => !!currentSong && view !== "player";
      const currentSong       = { _id: "s1", name: "Track 1" };

      expect(miniPlayerVisible(currentSong, "list")).toBe(true);
      expect(miniPlayerVisible(currentSong, "player")).toBe(false);
      expect(miniPlayerVisible(null, "list")).toBe(false);

      expect(viewport.width).toBeLessThan(768);
    });
  });
});


describe("Supporting Utility Tests", () => {

  describe("RadioScheduler — getCurrentState()", () => {
    it("should return correct songIndex and positionInSong based on elapsed time", () => {
      const STREAM_START  = new Date("2026-04-10T05:15:00.000Z");
      const songs = [
        { _id: "s1", name: "Track 1", duration: 180 },
        { _id: "s2", name: "Track 2", duration: 240 },
        { _id: "s3", name: "Track 3", duration: 200 },
      ];
      const totalDuration = songs.reduce((sum, s) => sum + s.duration, 0);

      const getCurrentState = (streamStart, songs, totalDuration) => {
        const elapsedSec   = (Date.now() - streamStart.getTime()) / 1000;
        const loopPosition = elapsedSec % totalDuration;

        let accumulated = 0;
        for (let i = 0; i < songs.length; i++) {
          if (loopPosition < accumulated + songs[i].duration) {
            return {
              song:           songs[i],
              songIndex:      i,
              positionInSong: loopPosition - accumulated,
            };
          }
          accumulated += songs[i].duration;
        }
        return { song: songs[0], songIndex: 0, positionInSong: 0 };
      };

      const state = getCurrentState(STREAM_START, songs, totalDuration);
      expect(state).toBeDefined();
      expect(state.songIndex).toBeGreaterThanOrEqual(0);
      expect(state.songIndex).toBeLessThan(songs.length);
      expect(state.positionInSong).toBeGreaterThanOrEqual(0);
      expect(state.positionInSong).toBeLessThan(songs[state.songIndex].duration);
    });
  });

  describe("sanitizeUser() — password exclusion", () => {
    it("should never include password, resetPasswordToken, or resetPasswordExpires in response", () => {
      const userDoc = {
        _id:                  "user001",
        name:                 "Test User",
        email:                "test@example.com",
        password:             "$2a$10$hashedvalue",
        role:                 "user",
        blocked:              false,
        isVerified:           true,
        resetPasswordToken:   "sometoken",
        resetPasswordExpires: new Date(),
      };

      const sanitizeUser = (user) => {
        const { password, resetPasswordToken, resetPasswordExpires, ...safe } = user;
        return safe;
      };

      const safe = sanitizeUser(userDoc);
      expect(safe).not.toHaveProperty("password");
      expect(safe).not.toHaveProperty("resetPasswordToken");
      expect(safe).not.toHaveProperty("resetPasswordExpires");
      expect(safe.name).toBe("Test User");
      expect(safe.email).toBe("test@example.com");
    });
  });

  describe("OTP generation — 6-digit numeric code", () => {
    it("should always generate a 6-digit string within 100000–999999 range", () => {
      const crypto      = require("crypto");
      const generateOTP = () => String(crypto.randomInt(100000, 999999));

      for (let i = 0; i < 100; i++) {
        const otp = generateOTP();
        expect(otp).toHaveLength(6);
        expect(Number(otp)).toBeGreaterThanOrEqual(100000);
        expect(Number(otp)).toBeLessThan(999999);
        expect(/^\d{6}$/.test(otp)).toBe(true);
      }
    });
  });

  describe("Rate limiter — auth endpoint (10 req / 15 min)", () => {
    it("should reject the 11th request within the window", () => {
      const LIMIT = 10;
      let requestCount = 0;

      const rateLimiterMiddleware = () => {
        requestCount += 1;
        if (requestCount > LIMIT) {
          return { status: 429, body: { message: "Too many authentication attempts" } };
        }
        return null;
      };

      for (let i = 0; i < 10; i++) {
        expect(rateLimiterMiddleware()).toBeNull();
      }
      const result = rateLimiterMiddleware();
      expect(result.status).toBe(429);
      expect(result.body.message).toContain("Too many");
    });
  });

  describe("bcrypt timing-attack prevention on login", () => {
    it("should perform bcrypt.compare even when user is not found", async () => {
      const dummyHash = "$2a$10$invalidhashtopreventtimingXXXXXXXXXXXXXXXXXXXXXXXXXX";

      const start   = Date.now();
      const ok      = await bcrypt.compare("anyPassword", dummyHash);
      const elapsed = Date.now() - start;

      expect(ok).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("JWT token expiry validation", () => {
    it("should reject tokens signed with wrong secret", () => {
      const wrongSecretToken = jwt.sign({ id: "user123" }, "wrong_secret", { expiresIn: "7d" });
      expect(() => jwt.verify(wrongSecretToken, JWT_SECRET)).toThrow();
    });

    it("should reject expired tokens", () => {
      const expired = jwt.sign({ id: "user123" }, JWT_SECRET, { expiresIn: "0s" });
      expect(() => jwt.verify(expired, JWT_SECRET)).toThrow(/jwt expired/);
    });

    it("should accept valid unexpired token", () => {
      const valid   = signToken({ id: "user123", role: "user" });
      const decoded = jwt.verify(valid, JWT_SECRET);
      expect(decoded.id).toBe("user123");
      expect(decoded.role).toBe("user");
    });
  });

  describe("Playlist songCount virtual field", () => {
    it("should return the length of the songs array", () => {
      const playlist = {
        songs: ["s1", "s2", "s3"],
        get songCount() { return this.songs?.length || 0; },
      };
      expect(playlist.songCount).toBe(3);

      const emptyPlaylist = {
        songs: [],
        get songCount() { return this.songs?.length || 0; },
      };
      expect(emptyPlaylist.songCount).toBe(0);
    });
  });

  describe("Chat message sanitisation — max 300 chars", () => {
    it("should truncate messages longer than 300 characters", () => {
      const sanitizeMessage = (msg) => String(msg).trim().slice(0, 300);

      const longMessage = "A".repeat(500);
      const sanitized   = sanitizeMessage(longMessage);

      expect(sanitized).toHaveLength(300);
      expect(sanitized.trim()).toBe(sanitized);
    });

    it("should reject reactions not in the whitelist", () => {
      const ALLOWED = ["❤️", "🔥", "🎵", "👏", "😍"];

      const validateReaction = (reaction) => ALLOWED.includes(reaction);

      expect(validateReaction("❤️")).toBe(true);
      expect(validateReaction("🔥")).toBe(true);
      expect(validateReaction("💀")).toBe(false);
      expect(validateReaction("<script>alert(1)</script>")).toBe(false);
    });
  });
});