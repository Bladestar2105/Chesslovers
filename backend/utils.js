
const normalizeSessionId = (sessionId) => (typeof sessionId === 'string' ? sessionId.trim() : '');

const isSessionParticipant = (game, sessionId) => {
  const normalizedSessionId = normalizeSessionId(sessionId);
  return Boolean(game && normalizedSessionId && (game.white === normalizedSessionId || game.black === normalizedSessionId));
};

const buildLeaderboardRows = (rows, sourceLabel) => rows.map((row) => ({
    playerKey: row.player_key,
    name: row.display_name || 'Anonymous',
    rating: row.rating,
    gamesPlayed: row.games_played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    source: sourceLabel
  }));

const parseTimeControl = (tc) => {
  if (tc === 'unlimited') return { base: null, inc: null };

  const safeTc = typeof tc === 'string' ? tc : '';
  const [basePart = '', incPart = '0'] = safeTc.split('|');
  const parsedBaseMinutes = Number.parseInt(basePart, 10);
  const parsedIncrement = Number.parseInt(incPart, 10);

  const baseMinutes = Number.isFinite(parsedBaseMinutes) && parsedBaseMinutes >= 0 ? parsedBaseMinutes : 10;
  const increment = Number.isFinite(parsedIncrement) && parsedIncrement >= 0 ? parsedIncrement : 0;

  return { base: baseMinutes * 60, inc: increment };
};

const authenticateAdmin = (jwtSecret, jwt) => (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing authorization header' });

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (payload.admin) {
      next();
    } else {
      res.status(403).json({ error: 'Not an admin' });
    }
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = {
  parseTimeControl,
  authenticateAdmin,
  normalizeSessionId,
  isSessionParticipant,
  buildLeaderboardRows
};
