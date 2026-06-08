const LCD_WIDTH = 16;
const MIN_HOLD_MS = 600;
const MAX_HOLD_MS = 30_000;

/** Collapse to LCD-safe ASCII; strip chars LiquidCrystal can't render cleanly. */
export function sanitizeForLcd(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-wrap a single lyric line to LCD width chunks. */
export function wrapLine(text, width = LCD_WIDTH) {
  const clean = sanitizeForLcd(text);
  if (!clean) return [];

  const words = clean.split(" ");
  const chunks = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= width) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (word.length > width) {
      for (let i = 0; i < word.length; i += width) {
        chunks.push(word.slice(i, i + width));
      }
      current = "";
    } else {
      current = word;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function padRow(text) {
  return text.padEnd(LCD_WIDTH).slice(0, LCD_WIDTH);
}

function clampHold(ms) {
  return Math.min(Math.max(ms, MIN_HOLD_MS), MAX_HOLD_MS);
}

export function formatTimestamp(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const centisec = Math.floor((ms % 1000) / 10);
  return `${min}:${String(sec).padStart(2, "0")}.${String(centisec).padStart(2, "0")}`;
}

/** When the first excerpt lyric is sung — seek the song here. */
export function getChorusStart(timedLines) {
  const first = timedLines.find((line) => line.startMs != null);
  if (!first) {
    return { ms: null, label: null, seconds: null, openingLine: null };
  }

  return {
    ms: first.startMs,
    label: formatTimestamp(first.startMs),
    seconds: Math.floor(first.startMs / 1000),
    openingLine: first.text,
  };
}

/**
 * Build LCD pages with holdMs from LRC gaps — time until the next lyric line starts.
 * Pages from the same sung line split that gap evenly.
 */
export function formatLyricsForLcd(timedLines, maxPages = 6, defaultHoldMs = 3000) {
  const pages = [];
  const hasTiming = timedLines.some((line) => line.startMs != null);

  for (let lineIndex = 0; lineIndex < timedLines.length; lineIndex++) {
    if (pages.length >= maxPages) break;

    const { text, startMs, nextStartMs } = timedLines[lineIndex];
    const chunks = wrapLine(text);
    if (!chunks.length) continue;

    const linePages = [];
    for (let i = 0; i < chunks.length; i += 2) {
      linePages.push({
        line1: padRow(chunks[i]),
        line2: padRow(chunks[i + 1] ?? ""),
        anchorMs: startMs ?? null,
      });
    }

    let totalMs = defaultHoldMs * linePages.length;
    if (hasTiming && startMs != null) {
      const nextStart =
        nextStartMs ??
        timedLines
          .slice(lineIndex + 1)
          .find((line) => line.startMs != null)?.startMs;

      totalMs =
        nextStart != null
          ? nextStart - startMs
          : defaultHoldMs * linePages.length;
      totalMs = Math.max(totalMs, MIN_HOLD_MS * linePages.length);
    }

    const perPage = clampHold(Math.round(totalMs / linePages.length));
    for (const page of linePages) {
      page.holdMs = perPage;
      pages.push(page);
      if (pages.length >= maxPages) break;
    }
  }

  if (!pages.length) return { pages, hasTiming: false, leadInMs: 0 };

  if (!hasTiming) {
    for (const page of pages) page.holdMs = defaultHoldMs;
  }

  const leadInMs = hasTiming && pages[0].anchorMs != null ? pages[0].anchorMs : 0;

  return { pages, hasTiming, leadInMs };
}
