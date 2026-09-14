const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

const PLAYERS = {
  love: { id: "4036378", name: "Jordan Love", team: "Green Bay Packers" },
  caleb: { id: "4431611", name: "Caleb Williams", team: "Chicago Bears" },
};

async function fetchPlayer(id, apiKey) {
  const url = `https://${RAPIDAPI_HOST}/getNFLPlayerInfo?playerID=${id}&getStats=true`;
  const res = await fetch(url, {
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Tank01 API returned ${res.status} for player ${id}`);
  }

  const data = await res.json();
  const stats = data?.body?.stats;
  const passYds = Number(stats?.Passing?.passYds ?? 0);
  const gamesPlayed = Number(stats?.gamesPlayed ?? 0);

  return {
    seasonYards: passYds,
    gamesPlayed,
    avg: gamesPlayed > 0 ? passYds / gamesPlayed : 0,
  };
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "RAPIDAPI_KEY is not configured" });
    return;
  }

  try {
    const [loveStats, calebStats] = await Promise.all([
      fetchPlayer(PLAYERS.love.id, apiKey),
      fetchPlayer(PLAYERS.caleb.id, apiKey),
    ]);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      players: {
        love: { name: PLAYERS.love.name, team: PLAYERS.love.team, ...loveStats },
        caleb: { name: PLAYERS.caleb.name, team: PLAYERS.caleb.team, ...calebStats },
      },
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch live stats", detail: err.message });
  }
};
