require("dotenv").config();
const path          = require("path");
const { execFile }  = require("child_process");
const util          = require("util");
const execFileAsync = util.promisify(execFile);
const connectDB     = require("./config/db");
const Song          = require("./models/Song");
const fs            = require("fs").promises;

async function getDuration(filePath) {
  // Try ffprobe
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const d = parseFloat(stdout.trim());
    if (!isNaN(d) && d > 0) return d;
  } catch {}

  // Fallback: size-based estimate at 192kbps
  try {
    const { size } = await fs.stat(filePath);
    const estimated = size / (192 * 1024 / 8);
    return Math.max(estimated, 30);
  } catch {
    return 0;
  }
}

async function run() {
  await connectDB();

  const songs = await Song.find({
    $or: [
      { duration: 0 },
      { duration: null },
      { duration: { $exists: false } },
    ],
  });

  console.log(`Found ${songs.length} songs with missing/zero duration\n`);

  let fixed = 0;
  let failed = 0;

  for (const song of songs) {
    const filePath = path.join(__dirname, "uploads", song.file);
    const duration = await getDuration(filePath);

    if (duration > 0) {
      song.duration = duration;
      await song.save();
      console.log(`✅  ${song.name} — ${duration.toFixed(1)}s (${(duration/60).toFixed(2)} min)`);
      fixed++;
    } else {
      console.warn(`❌  ${song.name} — could not extract duration (file missing or corrupt?)`);
      failed++;
    }
  }

  console.log(`\nDone! Fixed: ${fixed}, Failed: ${failed}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});