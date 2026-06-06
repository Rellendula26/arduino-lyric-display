import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { searchTracks } from "./spotify.js";
import { fetchLyrics } from "./lyrics.js";
import { formatLyricsForLcd } from "./formatter.js";
import { generateArduinoSketch } from "./codegen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3847;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../../public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    spotifyConfigured: Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
    ),
    musixmatchConfigured: Boolean(process.env.MUSIXMATCH_API_KEY),
  });
});

app.get("/api/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      return res.status(400).json({ error: "Query parameter q is required." });
    }

    const tracks = await searchTracks(q);
    res.json({ tracks });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const { title, artist, manualLyrics, holdMs = 3000, maxPages = 6 } =
      req.body ?? {};

    if (!title?.trim()) {
      return res.status(400).json({ error: "title is required." });
    }

    const lyricResult = await fetchLyrics({
      title: title.trim(),
      artist: (artist ?? "").trim(),
      manualText: manualLyrics,
    });

    const { pages, hasTiming, leadInMs } = formatLyricsForLcd(
      lyricResult.timedLines,
      maxPages,
      holdMs
    );
    const sketch = generateArduinoSketch({
      songTitle: title.trim(),
      artist: (artist ?? "").trim(),
      pages,
      defaultHoldMs: holdMs,
      hasTiming: hasTiming && lyricResult.hasTiming,
    });

    res.json({
      song: { title: title.trim(), artist: (artist ?? "").trim() },
      lyrics: lyricResult,
      pages,
      hasTiming: hasTiming && lyricResult.hasTiming,
      sketch,
    });
  } catch (error) {
    console.error("Generate error:", error);
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`arduino-lyric-display server running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Either stop the other process:\n` +
        `  lsof -i :${PORT}   # find PID\n` +
        `  kill <PID>\n` +
        `Or set a different PORT in server/.env`
    );
    process.exit(1);
  }
  throw error;
});
