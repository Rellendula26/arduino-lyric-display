const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const selectedPanel = document.getElementById("selected-panel");
const selectedTrackEl = document.getElementById("selected-track");
const manualLyricsEl = document.getElementById("manual-lyrics");
const holdMsEl = document.getElementById("hold-ms");
const maxPagesEl = document.getElementById("max-pages");
const generateBtn = document.getElementById("generate-btn");
const outputPanel = document.getElementById("output-panel");
const lyricNoteEl = document.getElementById("lyric-note");
const lcdPreviewEl = document.getElementById("lcd-preview");
const sketchOutputEl = document.getElementById("sketch-output");
const copyBtn = document.getElementById("copy-btn");
const downloadBtn = document.getElementById("download-btn");

let selectedTrack = null;
let lastSketch = "";

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const parts = [];
    parts.push(
      data.spotifyConfigured
        ? "Spotify: configured"
        : "Spotify: missing credentials (.env)"
    );
    parts.push(
      data.musixmatchConfigured
        ? "Musixmatch: configured"
        : "Musixmatch: optional (using LRCLIB + manual)"
    );
    statusEl.textContent = parts.join(" · ");
    statusEl.classList.toggle("error", !data.spotifyConfigured);
  } catch {
    statusEl.textContent = "Server offline — run npm start in server/";
    statusEl.classList.add("error");
  }
}

function renderResults(tracks) {
  resultsEl.innerHTML = "";
  if (!tracks.length) {
    resultsEl.innerHTML =
      '<li class="note">No tracks found. Try a different query.</li>';
    return;
  }

  for (const track of tracks) {
    const li = document.createElement("li");
    li.className = "result-item";
    li.innerHTML = `
      ${track.imageUrl ? `<img src="${track.imageUrl}" alt="" />` : ""}
      <div class="result-meta">
        <strong>${escapeHtml(track.name)}</strong>
        <span>${escapeHtml(track.artist)} · ${escapeHtml(track.album)}</span>
      </div>
    `;
    li.addEventListener("click", () => selectTrack(track, li));
    resultsEl.appendChild(li);
  }
}

function selectTrack(track, element) {
  selectedTrack = track;
  document.querySelectorAll(".result-item").forEach((el) => {
    el.classList.toggle("selected", el === element);
  });

  selectedTrackEl.innerHTML = `
    <strong>${escapeHtml(track.name)}</strong><br />
    <span class="note">${escapeHtml(track.artist)}</span>
  `;
  selectedPanel.hidden = false;
  outputPanel.hidden = true;
}

function renderLcdPreview(pages) {
  lcdPreviewEl.innerHTML = pages
    .map(
      (page, i) => `
      <div class="lcd-screen" aria-label="LCD page ${i + 1}">
        <div class="lcd-meta">Page ${i + 1} · holds ${(page.holdMs / 1000).toFixed(1)}s until next line</div>
        <div class="lcd-line">${escapeHtml(page.line1)}</div>
        <div class="lcd-line">${escapeHtml(page.line2)}</div>
      </div>
    `
    )
    .join("");
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;

  resultsEl.innerHTML = '<li class="note">Searching…</li>';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed");
    renderResults(data.tracks);
  } catch (error) {
    resultsEl.innerHTML = "";
    statusEl.textContent = error.message;
    statusEl.classList.add("error");
  }
});

generateBtn.addEventListener("click", async () => {
  if (!selectedTrack) return;

  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: selectedTrack.name,
        artist: selectedTrack.artist,
        manualLyrics: manualLyricsEl.value,
        holdMs: Math.round((Number(holdMsEl.value) || 3) * 1000),
        maxPages: Number(maxPagesEl.value) || 6,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generate failed");

    lyricNoteEl.textContent = `${data.lyrics.source}: ${data.lyrics.note}`;
    renderLcdPreview(data.pages);
    lastSketch = data.sketch;
    sketchOutputEl.textContent = lastSketch;
    outputPanel.hidden = false;
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.classList.add("error");
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate Arduino code";
  }
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(lastSketch);
  copyBtn.textContent = "Copied!";
  setTimeout(() => {
    copyBtn.textContent = "Copy sketch";
  }, 1500);
});

downloadBtn.addEventListener("click", () => {
  const title = selectedTrack?.name ?? "lyric_display";
  const blob = new Blob([lastSketch], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(title)}_lcd.ino`;
  a.click();
  URL.revokeObjectURL(url);
});

checkHealth();
