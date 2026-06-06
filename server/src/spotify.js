let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env"
    );
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify auth failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export async function searchTracks(query, limit = 10) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(limit),
  });

  const response = await fetch(
    `https://api.spotify.com/v1/search?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify search failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return (data.tracks?.items ?? []).map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artists.map((a) => a.name).join(", "),
    album: track.album.name,
    durationMs: track.duration_ms,
    imageUrl: track.album.images?.[2]?.url ?? track.album.images?.[0]?.url,
  }));
}
