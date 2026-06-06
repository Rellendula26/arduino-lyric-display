# Arduino LCD Lyric Display

Search a song on Spotify, fetch a short chorus-style lyric snippet from legitimate lyric sources, format it for a **16×2 character LCD**, and export ready-to-flash Arduino C++ using the **LiquidCrystal** library.

## Architecture

```
Browser UI  →  Local Node server  →  Spotify API (search/metadata)
                              ↘  LRCLIB / Musixmatch / manual lyrics
                              ↘  LCD formatter + Arduino codegen
Arduino Uno ← copy/paste or download .ino (no OAuth on device)
```

- **Spotify** is used only for track search and metadata (Client Credentials flow).
- **Lyrics** come from LRCLIB (open database), optional Musixmatch API, or manual paste — never from unofficial Spotify lyric scraping.
- **Arduino** stays simple: a `Lyric lyrics[]` array and page rotation loop.

## Quick start

### 1. Spotify credentials

1. Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Copy Client ID and Client Secret.

### 2. Run the local server

```bash
cd server
cp .env.example .env
# Edit .env with your Spotify credentials

npm install
npm start
```

Open **http://localhost:3847**

### 3. Optional: Musixmatch

Add `MUSIXMATCH_API_KEY` to `.env` if you have a [Musixmatch developer key](https://developer.musixmatch.com/). LRCLIB and manual input work without it.

### 4. Generate & flash Arduino

1. Search and select a song.
2. If lyrics aren't found, paste a chorus into **Manual lyrics**.
3. Click **Generate Arduino code**.
4. Copy or download the `.ino` file.
5. Flash to Arduino Uno with the wiring below.

## LCD wiring

| LCD pin | Arduino |
|---------|---------|
| RS      | 12      |
| EN      | 11      |
| D4      | 5       |
| D5      | 4       |
| D6      | 3       |
| D7      | 2       |
| VSS     | GND     |
| VDD     | 5V      |
| V0      | pot (contrast) |
| A/K     | backlight (optional resistor) |

```cpp
#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
```

## How lyrics play on the LCD

Lyrics scroll automatically when the Arduino boots — no button, no Serial, no song sync.

```cpp
struct Lyric {
  char line1[17];
  char line2[17];
  unsigned long holdMs;  // how long this page stays up
};

Lyric lyrics[] = {
  {"On the highway  ", "and I'm thinkin'", 3000},
  {"that I love her ", "                ", 3000},
};
```

Set **Seconds per page** in the web UI to control scroll speed (default 3s).

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Config status |
| `/api/search?q=...` | GET | Spotify track search |
| `/api/generate` | POST | Fetch lyrics, format LCD pages, return sketch |

**POST /api/generate** body:

```json
{
  "title": "Hello",
  "artist": "Adele",
  "manualLyrics": "optional fallback text",
  "holdMs": 3000,
  "maxPages": 6
}
```

## Lyric sources (in priority order)

1. **Manual paste** — always wins if provided.
2. **Musixmatch** — if `MUSIXMATCH_API_KEY` is set.
3. **LRCLIB** — free community lyrics DB; chorus tags extracted when available.

## Project layout

```
arduino-lyric-display/
  server/          # Express middleware (OAuth + lyrics + codegen)
  public/          # Web UI
  arduino/         # Reference sketch template
```

## Notes

- LCD text is sanitized to printable ASCII for reliable `LiquidCrystal` rendering.
- Long lines are word-wrapped to 16 columns; pairs form one LCD "page".
- For copyrighted lyrics you don't have rights to, use manual input of short excerpts for personal/educational use.
