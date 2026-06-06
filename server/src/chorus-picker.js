const CHORUS_TAGS = ["chorus", "refrain", "hook", "refren", "estribillo"];
const SKIP_TAGS = ["intro", "outro", "instrumental", "skit", "spoken"];
const SECONDARY_TAGS = ["pre-chorus", "bridge"];

function stripTags(line) {
  return line.replace(/\[.*?\]/g, "").trim();
}

export function normalizeForCompare(text) {
  return stripTags(text)
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\w\s']/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Parenthetical vocal ad-libs like "(I love, I lo-)" or "(I've been tryin'...)". */
export function isAdLibLine(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;

  if (/^\([^)]*\)$/.test(trimmed)) return true;
  if (/^\(.*(tryin|cryin|woo|yeah|uh|oh|lo-)/i.test(trimmed)) return true;

  const withoutParens = trimmed.replace(/\([^)]*\)/g, "").trim();
  if (!withoutParens || withoutParens.length < 4) return true;

  return false;
}

export function isSubstantiveLine(text) {
  return !isAdLibLine(text) && normalizeForCompare(text).length >= 8;
}

function filterAdLibs(lines) {
  return lines.filter((line) => isSubstantiveLine(line.text ?? line));
}

function toTimedLines(lines, tag = "detected") {
  return lines.map((line) =>
    typeof line === "string"
      ? { text: line, startMs: null, tag }
      : { ...line, tag: line.tag ?? tag }
  );
}

/**
 * Find the most-repeated consecutive block of substantive lines.
 * Choruses repeat; intros and ad-libs usually don't.
 */
export function findRepeatedBlock(timedLines, { minBlock = 2, maxBlock = 8, minOccurrences = 2 } = {}) {
  const lines = timedLines.filter((line) => isSubstantiveLine(line.text));
  if (lines.length < minBlock) return null;

  let best = null;

  for (let blockLen = Math.min(maxBlock, lines.length); blockLen >= minBlock; blockLen--) {
    for (let start = 0; start <= lines.length - blockLen; start++) {
      const block = lines.slice(start, start + blockLen);
      const key = block.map((line) => normalizeForCompare(line.text)).join("|");
      if (key.length < 16) continue;

      const occurrenceStarts = [];
      for (let i = 0; i <= lines.length - blockLen; i++) {
        const candidateKey = lines
          .slice(i, i + blockLen)
          .map((line) => normalizeForCompare(line.text))
          .join("|");
        if (candidateKey === key) occurrenceStarts.push(i);
      }

      if (occurrenceStarts.length < minOccurrences) continue;

      const firstIndex = occurrenceStarts[0];
      const firstBlock = lines.slice(firstIndex, firstIndex + blockLen);
      const score =
        occurrenceStarts.length * 1000 +
        blockLen * 5 +
        block.reduce((sum, line) => sum + normalizeForCompare(line.text).length, 0);

      const firstStartMs = firstBlock[0]?.startMs ?? Infinity;

      if (
        !best ||
        score > best.score ||
        (score === best.score && firstStartMs < best.firstStartMs)
      ) {
        best = {
          block: firstBlock,
          score,
          occurrences: occurrenceStarts.length,
          firstStartMs,
          method: "repetition",
        };
      }
    }
  }

  return best;
}

function groupTaggedRuns(timedLines) {
  const runs = [];
  let current = null;

  for (const line of timedLines) {
    const tag = line.tag ?? "verse";
    if (!current || current.tag !== tag) {
      current = { tag, lines: [] };
      runs.push(current);
    }
    current.lines.push(line);
  }

  return runs;
}

function scoreTaggedRun(run) {
  const tag = run.tag.toLowerCase();
  if (SKIP_TAGS.some((t) => tag.includes(t))) return -1;
  if (CHORUS_TAGS.some((t) => tag.includes(t))) return 100;
  if (SECONDARY_TAGS.some((t) => tag.includes(t))) return 40;
  return 0;
}

function pickFromTaggedSections(timedLines, maxLines) {
  const runs = groupTaggedRuns(timedLines)
    .map((run) => ({
      ...run,
      substantive: filterAdLibs(run.lines),
      tagScore: scoreTaggedRun(run),
    }))
    .filter((run) => run.tagScore > 0 && run.substantive.length >= 2);

  if (!runs.length) return null;

  runs.sort((a, b) => {
    if (b.tagScore !== a.tagScore) return b.tagScore - a.tagScore;
    return b.substantive.length - a.substantive.length;
  });

  const best = runs[0].substantive.slice(0, maxLines);
  return {
    timedLines: best,
    method: "tag",
    tag: runs[0].tag,
  };
}

function parsePlainSections(plain) {
  const sections = [];
  let currentTag = "verse";
  let currentLines = [];

  for (const line of plain.split("\n")) {
    const tagMatch = line.match(/^\[([^\]]+)\]\s*$/i);
    if (tagMatch) {
      if (currentLines.length) {
        sections.push({ tag: currentTag, lines: currentLines });
        currentLines = [];
      }
      currentTag = tagMatch[1].toLowerCase();
      continue;
    }
    const text = stripTags(line);
    if (text) currentLines.push(text);
  }

  if (currentLines.length) {
    sections.push({ tag: currentTag, lines: currentLines });
  }

  return sections;
}

function pickFromPlainSections(plain, maxLines) {
  const sections = parsePlainSections(plain)
    .map((section) => ({
      ...section,
      substantive: section.lines.filter(isSubstantiveLine),
      tagScore: scoreTaggedRun({ tag: section.tag }),
    }))
    .filter((section) => section.tagScore > 0 && section.substantive.length >= 2);

  if (!sections.length) return null;

  sections.sort((a, b) => b.tagScore - a.tagScore);
  const lines = sections[0].substantive.slice(0, maxLines);
  return {
    timedLines: toTimedLines(lines, sections[0].tag),
    method: "plain-tag",
    tag: sections[0].tag,
  };
}

/**
 * Best-effort chorus/hook selection with fallbacks.
 */
export function pickChorusExcerpt({ timedLines, plain, maxLines = 8 }) {
  if (timedLines.length) {
    const tagged = pickFromTaggedSections(timedLines, maxLines);
    if (tagged) {
      return {
        ...tagged,
        hasTiming: tagged.timedLines.some((line) => line.startMs != null),
        note: `Chorus from [${tagged.tag}] section in synced lyrics.`,
      };
    }

    const repeated = findRepeatedBlock(timedLines);
    if (repeated) {
      return {
        timedLines: repeated.block.slice(0, maxLines),
        hasTiming: repeated.block.some((line) => line.startMs != null),
        method: "repetition",
        note: `Hook detected by repetition (${repeated.occurrences}× in song).`,
      };
    }

    const substantive = filterAdLibs(timedLines).slice(0, maxLines);
    if (substantive.length) {
      return {
        timedLines: substantive,
        hasTiming: substantive.some((line) => line.startMs != null),
        method: "substantive",
        note: "No chorus tags found — using first substantive lyrics (ad-libs skipped).",
      };
    }
  }

  if (plain) {
    const plainTagged = pickFromPlainSections(plain, maxLines);
    if (plainTagged) {
      return {
        ...plainTagged,
        hasTiming: false,
        note: `Chorus from [${plainTagged.tag}] in plain lyrics.`,
      };
    }

    const plainLines = plain
      .split("\n")
      .map(stripTags)
      .filter(isSubstantiveLine)
      .slice(0, maxLines);

    if (plainLines.length) {
      return {
        timedLines: toTimedLines(plainLines),
        hasTiming: false,
        method: "plain",
        note: "Opening substantive lines from plain lyrics.",
      };
    }
  }

  return {
    timedLines: [],
    hasTiming: false,
    method: "none",
    note: "No lyrics found. Paste lyrics manually in the UI.",
  };
}
