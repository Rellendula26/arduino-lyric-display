import { pickChorusExcerpt } from "./chorus-picker.js";

/**
 * Fetch plain lyrics from LRCLIB (open lyrics database, no Spotify scraping).
 * https://lrclib.net/docs
 */
async function fetchFromLrcLib(title, artist) {
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
  });

  const response = await fetch(
    `https://lrclib.net/api/get?${params.toString()}`,
    { headers: { "User-Agent": "arduino-lyric-display/1.0" } }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LRCLIB failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return {
    source: "lrclib",
    plain: data.plainLyrics ?? "",
    synced: data.syncedLyrics ?? "",
    instrumental: data.instrumental ?? false,
  };
}

/**
 * Optional Musixmatch snippet (requires API key; returns short excerpt only).
 */
async function fetchFromMusixmatch(title, artist) {
  const apiKey = process.env.MUSIXMATCH_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    apikey: apiKey,
    q_track: title,
    q_artist: artist,
    s_track_rating: "desc",
    page_size: "1",
    page: "1",
  });

  const response = await fetch(
    `https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?${params.toString()}`
  );

  if (!response.ok) return null;

  const data = await response.json();
  const body = data.message?.body;
  if (!body || body.lyrics?.lyrics_body?.includes("***")) return null;

  return {
    source: "musixmatch",
    plain: body.lyrics.lyrics_body,
    synced: "",
    instrumental: false,
  };
}

function stripTags(line) {
  return line.replace(/\[.*?\]/g, "").trim();
}

/** Parse [mm:ss.xx] or [mm:ss.xxx] into milliseconds. */
export function parseLrcTimestamp(tag) {
  const match = tag.match(/^(\d{2}):(\d{2})(?:\.(\d{2,3}))?$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] ? Number(match[3]) : 0;
  const fractionMs = match[3]?.length === 3 ? fraction : fraction * 10;

  return minutes * 60_000 + seconds * 1000 + fractionMs;
}

/** Parse full synced LRC into timed lines with section tags. */
export function parseSyncedTimedLines(synced) {
  if (!synced) return [];

  const result = [];
  let currentTag = "verse";

  for (const raw of synced.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const sectionOnly = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionOnly && !sectionOnly[1].match(/^\d{2}:/)) {
      currentTag = sectionOnly[1].toLowerCase();
      continue;
    }

    const timed = trimmed.match(/^\[(\d{2}:\d{2}(?:\.\d{2,3})?)\](.*)$/);
    if (!timed) continue;

    const startMs = parseLrcTimestamp(timed[1]);
    const text = stripTags(timed[2]);
    if (!text || startMs === null) continue;

    result.push({ text, startMs, tag: currentTag });
  }

  return result;
}

/** Extract chorus/hook lines; attach LRC timestamps when available. */
export function extractTimedSnippet(plain, synced, maxLines = 8) {
  const timedLines = synced ? parseSyncedTimedLines(synced) : [];
  return pickChorusExcerpt({ timedLines, plain, maxLines });
}

export async function fetchLyrics({ title, artist, manualText }) {
  if (manualText?.trim()) {
    const timedLines = manualText
      .split("\n")
      .map(stripTags)
      .filter(Boolean)
      .slice(0, 8)
      .map((text) => ({ text, startMs: null, tag: "manual" }));

    return {
      source: "manual",
      timedLines,
      hasTiming: false,
      lines: timedLines.map((l) => l.text),
      raw: manualText,
      note: "Using manually entered lyrics (fixed hold time per page).",
    };
  }

  const musixmatch = await fetchFromMusixmatch(title, artist);
  if (musixmatch?.plain) {
    const excerpt = extractTimedSnippet(musixmatch.plain, musixmatch.synced, 8);
    if (excerpt.timedLines.length) {
      return {
        source: musixmatch.source,
        timedLines: excerpt.timedLines,
        hasTiming: excerpt.hasTiming,
        lines: excerpt.timedLines.map((l) => l.text),
        raw: musixmatch.plain,
        note: excerpt.note,
        method: excerpt.method,
      };
    }
  }

  const lrc = await fetchFromLrcLib(title, artist);
  if (lrc?.instrumental) {
    return {
      source: "lrclib",
      timedLines: [],
      hasTiming: false,
      lines: [],
      raw: "",
      note: "Track marked instrumental on LRCLIB.",
    };
  }

  if (lrc?.plain || lrc?.synced) {
    const excerpt = extractTimedSnippet(lrc.plain, lrc.synced, 8);
    if (excerpt.timedLines.length) {
      return {
        source: lrc.source,
        timedLines: excerpt.timedLines,
        hasTiming: excerpt.hasTiming,
        lines: excerpt.timedLines.map((l) => l.text),
        raw: lrc.plain || lrc.synced,
        note: excerpt.note,
        method: excerpt.method,
      };
    }
  }

  return {
    source: "none",
    timedLines: [],
    hasTiming: false,
    lines: [],
    raw: "",
    note: "No lyrics found. Paste lyrics manually in the UI.",
  };
}
