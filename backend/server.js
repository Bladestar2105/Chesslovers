const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Chess } = require('chess.js');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');

const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');
const pkg = require('./package.json');
const {
  parseTimeControl,
  authenticateAdmin: createAuthenticateAdmin,
  normalizeSessionId,
  isSessionParticipant
} = require('./utils');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || db.jwtSecret;
const VERSION = pkg.version;

// In-memory game state
const activeGames = new Map();
const matchmakingQueue = new Map();
const pendingRematches = new Map(); // gameId -> Set(playerKey)
const activeSeries = new Map(); // seriesId -> { players: [a,b], score: {a,b}, gamesPlayed }
let federationExchangeCodes = new Map();
const federationStatus = new Map(); // id -> { isActive: boolean, version: string, lastSeen: number }
const adminLoginAttempts = new Map(); // ip -> { count, firstAttemptAt, blockedUntil }

const authenticateAdmin = createAuthenticateAdmin(JWT_SECRET, jwt);

const DEFAULT_RATING = 1200;
const K_FACTOR = 24;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_BLOCK_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;

const normalizePlayerKey = (playerKey) => (playerKey && String(playerKey).trim() ? String(playerKey).trim() : null);

function getOrCreateRating(playerKey, displayName) {
  const normalized = normalizePlayerKey(playerKey);
  if (!normalized) return null;
  db.upsertPlayerDisplayName(normalized, displayName);
  return db.getRating(normalized) || {
    player_key: normalized,
    display_name: displayName || null,
    rating: DEFAULT_RATING,
    games_played: 0,
    wins: 0,
    draws: 0,
    losses: 0
  };
}

function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

function updateRatingsForGame(game) {
  if (!game.whitePlayerKey || !game.blackPlayerKey) return;

  const white = getOrCreateRating(game.whitePlayerKey, game.whiteName || 'White');
  const black = getOrCreateRating(game.blackPlayerKey, game.blackName || 'Black');
  if (!white || !black) return;

  let whiteScore = 0.5;
  let blackScore = 0.5;
  if (game.status === 'mate' || game.status === 'resign' || game.status === 'timeout') {
    if (game.resultWinner === 'w' || game.resultWinner === 'white') {
      whiteScore = 1;
      blackScore = 0;
    } else if (game.resultWinner === 'b' || game.resultWinner === 'black') {
      whiteScore = 0;
      blackScore = 1;
    }
  }

  const expectedWhite = expectedScore(white.rating, black.rating);
  const expectedBlack = expectedScore(black.rating, white.rating);
  const whiteRating = Math.round(white.rating + K_FACTOR * (whiteScore - expectedWhite));
  const blackRating = Math.round(black.rating + K_FACTOR * (blackScore - expectedBlack));

  db.saveRating({
    player_key: white.player_key,
    display_name: game.whiteName || white.display_name || 'White',
    rating: whiteRating,
    games_played: white.games_played + 1,
    wins: white.wins + (whiteScore === 1 ? 1 : 0),
    draws: white.draws + (whiteScore === 0.5 ? 1 : 0),
    losses: white.losses + (whiteScore === 0 ? 1 : 0)
  });

  db.saveRating({
    player_key: black.player_key,
    display_name: game.blackName || black.display_name || 'Black',
    rating: blackRating,
    games_played: black.games_played + 1,
    wins: black.wins + (blackScore === 1 ? 1 : 0),
    draws: black.draws + (blackScore === 0.5 ? 1 : 0),
    losses: black.losses + (blackScore === 0 ? 1 : 0)
  });
}

function buildLeaderboardRows(rows, sourceLabel) {
  return rows.map((row) => ({
    playerKey: row.player_key,
    name: row.display_name || 'Anonymous',
    rating: row.rating,
    gamesPlayed: row.games_played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    source: sourceLabel
  }));
}

app.post('/api/admin/login', (req, res) => {
  const now = Date.now();
  for (const [key, entry] of adminLoginAttempts.entries()) {
    const isExpiredBlock = entry.blockedUntil && entry.blockedUntil <= now;
    const isExpiredWindow = !entry.blockedUntil && now - entry.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS;
    if (isExpiredBlock || isExpiredWindow) adminLoginAttempts.delete(key);
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const state = adminLoginAttempts.get(ip);
  if (state?.blockedUntil && state.blockedUntil > now) {
    const retryAfter = Math.ceil((state.blockedUntil - now) / 1000);
    return res.status(429).json({ error: 'Too many login attempts. Try again later.', retryAfter });
  }

  const { password } = req.body;
  if (db.verifyAdminPassword(password)) {
    adminLoginAttempts.delete(ip);
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } else {
    if (!state || now - state.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS) {
      adminLoginAttempts.set(ip, { count: 1, firstAttemptAt: now, blockedUntil: null });
    } else {
      const nextCount = state.count + 1;
      if (nextCount >= ADMIN_LOGIN_MAX_ATTEMPTS) {
        adminLoginAttempts.set(ip, { count: nextCount, firstAttemptAt: state.firstAttemptAt, blockedUntil: now + ADMIN_LOGIN_BLOCK_MS });
      } else {
        adminLoginAttempts.set(ip, { count: nextCount, firstAttemptAt: state.firstAttemptAt, blockedUntil: null });
      }
    }
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.get('/api/admin/info', authenticateAdmin, (req, res) => {
  const links = db.getFederationLinks().map(link => {
    const status = federationStatus.get(link.id) || { isActive: false, version: 'unknown', lastSeen: null };
    return {
      ...link,
      isActive: status.isActive,
      version: status.version,
      lastSeen: status.lastSeen
    };
  });

  res.json({
    instanceId: db.instanceId,
    version: VERSION,
    links
  });
});

app.post('/api/admin/password', authenticateAdmin, (req, res) => {
  const { newPassword } = req.body;
  const strongEnough = typeof newPassword === 'string'
    && newPassword.length >= 10
    && /[A-Z]/.test(newPassword)
    && /[a-z]/.test(newPassword)
    && /[0-9]/.test(newPassword);
  if (!strongEnough) {
    return res.status(400).json({ error: 'Password must be at least 10 chars and include upper/lowercase letters and a number' });
  }
  db.updateAdminPassword(newPassword);
  res.json({ success: true });
});

app.delete('/api/admin/replays/:id', authenticateAdmin, (req, res) => {
  db.deleteGame(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/replays', authenticateAdmin, (req, res) => {
  db.deleteAllReplays();
  res.json({ success: true });
});

app.delete('/api/admin/federation/link/:id', authenticateAdmin, (req, res) => {
  db.deleteFederationLink(req.params.id);
  federationStatus.delete(req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/federation/link', authenticateAdmin, async (req, res) => {
  const { partnerUrl, partnerId } = req.body;

  if (!partnerUrl || !partnerId) {
    return res.status(400).json({ error: 'partnerUrl and partnerId are required' });
  }

  try {
    // Simply save the link locally since both admins will do this manually
    db.saveFederationLink(partnerId, partnerUrl);
    res.json({ success: true, partnerInstanceId: partnerId });
  } catch (e) {
    res.status(500).json({ error: 'Error saving partner link' });
  }
});

app.post('/api/admin/federation/sync', authenticateAdmin, async (req, res) => {
  const links = db.getFederationLinks();

  const results = await Promise.all(links.map(async (link) => {
    try {
      // Fetch replays from partner
      const response = await fetch(`${link.partner_url}/api/replays`);
      if (response.ok) {
        const games = await response.json();
        return db.saveGames(games);
      }
    } catch (e) {
      console.error(`Failed to sync with ${link.partner_url}`, e);
    }
    return 0;
  }));

  const totalSyncCount = results.reduce((acc, count) => acc + count, 0);
  res.json({ success: true, synced: totalSyncCount });
});

app.get('/api/info', (req, res) => {
  res.json({ instanceId: db.instanceId, version: VERSION });
});

app.get('/api/federation/leaderboard', (req, res) => {
  const initiatorInstanceId = req.query.initiatorInstanceId;
  if (!initiatorInstanceId || !db.getFederationLink(initiatorInstanceId)) {
    return res.status(401).json({ error: 'Unauthorized federation partner' });
  }
  const top = db.getTopRatings(50);
  res.json({ instanceId: db.instanceId, players: buildLeaderboardRows(top, db.instanceId) });
});

app.get('/api/leaderboard', async (req, res) => {
  const includeFederated = String(req.query.federated || '1') === '1';
  const localRows = buildLeaderboardRows(db.getTopRatings(100), db.instanceId);
  const byKey = new Map(localRows.map((r) => [r.playerKey, r]));

  if (includeFederated) {
    const links = db.getFederationLinks();
    await Promise.all(links.map(async (link) => {
      const status = federationStatus.get(link.id);
      if (!status || !status.isActive || status.version !== VERSION) return;
      try {
        const response = await fetch(`${link.partner_url}/api/federation/leaderboard?initiatorInstanceId=${encodeURIComponent(db.instanceId)}`);
        if (!response.ok) return;
        const data = await response.json();
        (data.players || []).forEach((p) => {
          const existing = byKey.get(p.playerKey);
          if (!existing || p.rating > existing.rating) {
            byKey.set(p.playerKey, { ...p, source: data.instanceId || link.id });
          }
        });
      } catch (err) {
        console.error('Failed to fetch federated leaderboard', err.message);
      }
    }));
  }

  const players = [...byKey.values()]
    .sort((a, b) => b.rating - a.rating || b.gamesPlayed - a.gamesPlayed)
    .slice(0, 100)
    .map((p, idx) => ({ ...p, rank: idx + 1 }));

  res.json({ players, generatedAt: new Date().toISOString() });
});

app.post('/api/analyze/hint', async (req, res) => {
  const { fen, level = 3 } = req.body || {};
  if (!fen) return res.status(400).json({ error: 'fen is required' });
  try {
    const enginePath = path.join(__dirname, 'node_modules', 'stockfish', 'bin', 'stockfish-18-single.js');
    const engine = spawn('node', [enginePath]);
    let answered = false;
    let buffer = '';
    const timeout = setTimeout(() => {
      if (!answered) {
        answered = true;
        engine.kill();
        res.status(504).json({ error: 'analysis timeout' });
      }
    }, 4000);

    engine.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('bestmove') && !answered) {
          answered = true;
          clearTimeout(timeout);
          const move = line.split(' ')[1];
          engine.kill();
          return res.json({ bestmove: move });
        }
      }
    });

    engine.stdin.write('uci\n');
    engine.stdin.write(`setoption name Skill Level value ${Math.max(1, Math.min(20, Number(level) * 2))}\n`);
    engine.stdin.write(`position fen ${fen}\n`);
    engine.stdin.write(`go depth ${Math.max(6, Math.min(14, Number(level) + 6))}\n`);
  } catch (err) {
    res.status(500).json({ error: 'analysis failed' });
  }
});

const evaluateFen = async (fen, level = 4) => new Promise((resolve, reject) => {
  const enginePath = path.join(__dirname, 'node_modules', 'stockfish', 'bin', 'stockfish-18-single.js');
  const engine = spawn('node', [enginePath]);
  let done = false;
  let buffer = '';
  let currentCp = null;

  const finish = (result, error = null) => {
    if (done) return;
    done = true;
    engine.kill();
    if (error) reject(error);
    else resolve(result);
  };

  const timeout = setTimeout(() => finish(null, new Error('analysis timeout')), 3500);

  engine.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.includes(' score cp ')) {
        const m = line.match(/score cp (-?\d+)/);
        if (m) currentCp = Number.parseInt(m[1], 10);
      }
      if (line.includes(' score mate ')) {
        const m = line.match(/score mate (-?\d+)/);
        if (m) {
          const mateIn = Number.parseInt(m[1], 10);
          currentCp = mateIn > 0 ? 10000 : -10000;
        }
      }
      if (line.startsWith('bestmove')) {
        clearTimeout(timeout);
        const move = line.split(' ')[1];
        finish({ cp: currentCp, bestmove: move });
        return;
      }
    }
  });

  engine.stderr.on('data', () => {});
  engine.on('error', (err) => {
    clearTimeout(timeout);
    finish(null, err);
  });

  engine.stdin.write('uci\n');
  engine.stdin.write(`setoption name Skill Level value ${Math.max(1, Math.min(20, Number(level) * 2))}\n`);
  engine.stdin.write(`position fen ${fen}\n`);
  engine.stdin.write(`go depth ${Math.max(8, Math.min(14, Number(level) + 7))}\n`);
});

app.post('/api/analyze/replay', async (req, res) => {
  const { pgn, maxPlies = 30, level = 4 } = req.body || {};
  if (!pgn || typeof pgn !== 'string') return res.status(400).json({ error: 'pgn is required' });
  const parsed = new Chess();
  try {
    parsed.loadPgn(pgn);
  } catch (err) {
    return res.status(400).json({ error: 'invalid pgn' });
  }

  const moves = parsed.history({ verbose: true });
  const limit = Math.max(1, Math.min(Number(maxPlies) || 30, moves.length));
  const marks = [];
  const board = new Chess();
  const evalCache = new Map();

  const evaluateCached = async (fen) => {
    if (evalCache.has(fen)) return evalCache.get(fen);
    const evaluation = await evaluateFen(fen, level);
    evalCache.set(fen, evaluation);
    return evaluation;
  };

  for (let idx = 0; idx < limit; idx += 1) {
    const beforeFen = board.fen();
    const move = moves[idx];
    board.move(move);
    const afterFen = board.fen();
    try {
      const before = await evaluateCached(beforeFen);
      const after = await evaluateCached(afterFen);
      const cpBefore = Number.isFinite(before?.cp) ? before.cp : 0;
      const cpAfter = Number.isFinite(after?.cp) ? after.cp : 0;
      const afterFromMoverPerspective = -cpAfter;
      const loss = Math.max(0, cpBefore - afterFromMoverPerspective);
      let label = '';
      if (loss >= 180) label = 'Blunder';
      else if (loss >= 90) label = 'Mistake';
      else if (loss >= 45) label = 'Inaccuracy';
      marks.push({ idx, label, loss, bestmove: before?.bestmove || null });
    } catch (err) {
      marks.push({ idx, label: '', loss: 0, bestmove: null });
    }
  }

  res.json({ marks, analyzedPlies: limit, totalPlies: moves.length });
});

// Heartbeat interval to check federation partners
setInterval(async () => {
  const links = db.getFederationLinks();
  await Promise.all(links.map(async (link) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${link.partner_url}/api/info`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        // Verify they are who they say they are
        if (data.instanceId === link.id) {
          federationStatus.set(link.id, {
            isActive: true,
            version: data.version,
            lastSeen: Date.now()
          });
        } else {
          // ID mismatch! Mark offline.
          federationStatus.set(link.id, {
            isActive: false,
            version: 'id_mismatch',
            lastSeen: federationStatus.get(link.id)?.lastSeen || null
          });
        }
      } else {
        throw new Error('Not OK');
      }
    } catch (e) {
      federationStatus.set(link.id, {
        isActive: false,
        version: federationStatus.get(link.id)?.version || 'unknown',
        lastSeen: federationStatus.get(link.id)?.lastSeen || null
      });
    }
  }));
}, 10000); // Check every 10 seconds

app.get('/api/replays', (req, res) => {
  const games = db.getFinishedGames();
  res.json(games);
});

function emitMoveMade(game) {
  io.to(game.id).emit('move_made', {
    fen: game.chess.fen(),
    pgn: game.chess.pgn(),
    whiteTime: game.whiteTime,
    blackTime: game.blackTime,
    lastMoveTime: game.lastMoveTime
  });
}

app.post('/api/federation/sync-event', (req, res) => {
  const { initiatorInstanceId, event, data } = req.body;

  if (!initiatorInstanceId || !db.getFederationLink(initiatorInstanceId)) {
    return res.status(401).json({ error: 'Unauthorized federation partner' });
  }

  const game = activeGames.get(data.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found locally' });
  }

  if (event === 'move') {
    try {
      const result = game.chess.move(data.move);
      if (result) {
        // Sync time variables exact from partner if they sent them, else compute
        if (data.whiteTime !== undefined) game.whiteTime = data.whiteTime;
        if (data.blackTime !== undefined) game.blackTime = data.blackTime;
        if (data.lastMoveTime !== undefined) game.lastMoveTime = data.lastMoveTime;
        else updateGameTime(game);

        emitMoveMade(game);
        checkGameEnd(game, true); // true = avoid sending back federation event
        saveToDb(game);
      }
    } catch (e) {
      console.error('Invalid federated move received', e);
    }
  } else if (event === 'resign') {
    game.status = 'resign';
    game.resultWinner = data.winner;
    io.to(game.id).emit('game_over', { reason: 'resign', winner: data.winner });
    saveAndRemoveGame(game);
  } else if (event === 'offer_draw') {
    io.to(game.id).emit('draw_offered');
  } else if (event === 'accept_draw') {
    game.status = 'draw';
    game.resultWinner = null;
    io.to(game.id).emit('game_over', { reason: 'draw' });
    saveAndRemoveGame(game);
  } else if (event === 'timeout') {
    game.status = 'timeout';
    game.resultWinner = data.winner;
    io.to(game.id).emit('game_over', { reason: 'timeout', winner: data.winner });
    saveAndRemoveGame(game);
  }

  res.json({ success: true });
});

function saveToDb(game) {
  db.saveGame({
      id: game.id,
      pgn: game.chess.pgn(),
      status: game.status,
      timeControl: game.timeControl,
      white: game.white,
      black: game.black,
      whitePlayerKey: game.whitePlayerKey,
      blackPlayerKey: game.blackPlayerKey,
      isCpu: game.isCpu,
      cpuLevel: game.cpuLevel,
      learningMode: game.learningMode
  });
}

function sendFederationEvent(game, event, data) {
  if (game.federationPartnerUrl) {
    fetch(`${game.federationPartnerUrl}/api/federation/sync-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initiatorInstanceId: db.instanceId,
        event,
        data: { gameId: game.id, ...data }
      })
    }).catch(e => console.error(`Failed to send federation event ${event}`, e));
  }
}

app.post('/api/federation/matchmaking', (req, res) => {
  const { timeControl, sessionId, playerName, playerKey, initiatorInstanceId } = req.body;

  if (!initiatorInstanceId || !db.getFederationLink(initiatorInstanceId)) {
    return res.status(401).json({ error: 'Unauthorized federation partner' });
  }

  let opponent = null;
  for (const p of matchmakingQueue.values()) {
    if (p.timeControl === timeControl) {
      opponent = p;
      break;
    }
  }

  if (opponent) {
    // Remove from queue
    matchmakingQueue.delete(opponent.socketId);

    const gameId = uuidv4();
    const chess = new Chess();
    const tc = parseTimeControl(timeControl);
    const time = tc.base;

    // Remote player will be black, local player white
    const gameData = {
      id: gameId,
      chess,
      white: opponent.sessionId,
      whiteName: opponent.playerName,
      whitePlayerKey: opponent.playerKey,
      black: sessionId,
      blackName: playerName,
      blackPlayerKey: normalizePlayerKey(playerKey),
      isCpu: false,
      timeControl,
      status: 'active',
      whiteTime: time,
      blackTime: time,
      lastMoveTime: null
    };
    activeGames.set(gameId, gameData);

    // Notify local player
    io.to(opponent.socketId).emit('game_started', { gameId, side: 'w' });

    // Join local player to room
    io.sockets.sockets.get(opponent.socketId)?.join(gameId);

    db.saveGame({
      id: gameData.id,
      pgn: gameData.chess.pgn(),
      status: gameData.status,
      timeControl: gameData.timeControl,
      white: gameData.white,
      black: gameData.black,
      whitePlayerKey: gameData.whitePlayerKey,
      blackPlayerKey: gameData.blackPlayerKey,
      isCpu: false
    });

    // Update local gameData to be aware of federation
    const link = db.getFederationLink(initiatorInstanceId);
    if (link) {
      gameData.federationPartnerUrl = link.partner_url;
      gameData.federationPartnerId = initiatorInstanceId;
    }

    // Return success to the federated instance
    res.json({ matchFound: true, gameId, side: 'b', gameData: { ...gameData, chess: undefined } });
  } else {
    res.json({ matchFound: false });
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get(/^(?!\/api).+/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Helper for sending stockfish command
const sendStockfishCmd = (engine, cmd) => {
  engine.postMessage(cmd);
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Resume a disconnected game
  socket.on('rejoin', ({ sessionId }) => {
    let rejoined = false;
    for (const [gameId, game] of activeGames.entries()) {
      if (isSessionParticipant(game, sessionId)) {
        socket.join(gameId);
        const normalizedSessionId = normalizeSessionId(sessionId);
        socket.emit('game_rejoined', { gameId, side: game.white === normalizedSessionId ? 'w' : 'b', fen: game.chess.fen(), pgn: game.chess.pgn(), timeControl: game.timeControl });
        rejoined = true;
        break;
      }
    }
    if (!rejoined) {
      socket.emit('rejoin_failed');
    }
  });

  socket.on('create_game', ({ isCpu, cpuLevel, timeControl, sessionId, customGameId, playerName, playerKey, learningMode = false, seriesId = null }) => {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      socket.emit('error', 'Invalid session');
      return;
    }

    const safeCpuLevel = Math.max(1, Math.min(10, Number.parseInt(cpuLevel, 10) || 3));
    // Generate an 8-character ID if it's a friend game and no customGameId was provided
    // This makes it easy to share. Keep uuid for cpu games or random if desired.
    const gameId = customGameId ? customGameId : (isCpu ? uuidv4() : crypto.randomBytes(4).toString('hex'));
    const chess = new Chess();

    const tc = parseTimeControl(timeControl);
    const time = tc.base;

    const gameData = {
      id: gameId,
      chess,
      white: normalizedSessionId,
      whiteName: playerName,
      whitePlayerKey: normalizePlayerKey(playerKey),
      black: isCpu ? 'cpu' : null,
      blackName: isCpu ? 'CPU' : null,
      blackPlayerKey: isCpu ? 'cpu' : null,
      isCpu,
      cpuLevel: safeCpuLevel,
      learningMode: Boolean(learningMode),
      seriesId,
      timeControl,
      status: 'active',
      whiteTime: time,
      blackTime: time,
      lastMoveTime: null
    };

    activeGames.set(gameId, gameData);
    socket.join(gameId);

    if (isCpu) {
      const enginePath = path.join(__dirname, 'node_modules', 'stockfish', 'bin', 'stockfish-18-single.js');
      const engine = spawn('node', [enginePath]);
      engine.stdin.write('uci\n');
      engine.stdin.write(`setoption name Skill Level value ${safeCpuLevel * 2}\n`); // Scale 1-10 to 1-20
      gameData.engine = engine;
      engine.on('error', (err) => {
        console.error('CPU engine failed to start', err.message);
      });

      let buffer = '';
      engine.stdout.on('data', (data) => {
        buffer += data.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
            if (line.startsWith('bestmove')) {
              const move = line.split(' ')[1];
              if (move) {
                try {
                  const moveObj = {
                    from: move.slice(0, 2),
                    to: move.slice(2, 4),
                    promotion: move[4] ? move[4] : undefined
                  };
                  gameData.chess.move(moveObj);
                  updateGameTime(gameData);
                  emitMoveMade(gameData);
                  checkGameEnd(gameData);
                } catch (err) {
                  console.error('CPU illegal move:', move, err);
                }
              }
            }
        }
      });
    }

    db.saveGame({
      id: gameId,
      pgn: chess.pgn(),
      status: 'active',
      timeControl,
      white: normalizedSessionId,
      black: gameData.black,
      whitePlayerKey: gameData.whitePlayerKey,
      blackPlayerKey: gameData.blackPlayerKey,
      isCpu,
      cpuLevel: safeCpuLevel,
      learningMode: gameData.learningMode
    });

    socket.emit('game_created', { gameId, side: 'w' });
  });

  socket.on('join_friend_game', ({ gameId, timeControl, sessionId, playerName, playerKey }) => {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      socket.emit('error', 'Invalid session');
      return;
    }

    // Treat joining via explicit ID like creating or joining if exists
    const existing = activeGames.get(gameId);
    if (existing) {
       // If game exists, just have them join it
       socket.emit('game_created', { gameId }); // Directs them to /game/:id
    } else {
       // Have to do the same logic as create_game but using customGameId
       // We can't just emit 'create_game' to ourselves in socket.io, so we must extract the logic
       const chess = new Chess();
       const tc = parseTimeControl(timeControl);
       const time = tc.base;
       const gameData = {
         id: gameId,
         chess,
         white: normalizedSessionId,
         whiteName: playerName,
         whitePlayerKey: normalizePlayerKey(playerKey),
         black: null,
         blackPlayerKey: null,
         isCpu: false,
         timeControl,
         status: 'active',
         whiteTime: time,
         blackTime: time,
         lastMoveTime: null
       };
       activeGames.set(gameId, gameData);
       socket.join(gameId);
       db.saveGame({
         id: gameId,
         pgn: chess.pgn(),
         status: 'active',
         timeControl,
         white: normalizedSessionId,
         black: null,
         whitePlayerKey: gameData.whitePlayerKey,
         blackPlayerKey: null,
         isCpu: false
       });
       socket.emit('game_created', { gameId, side: 'w' });
    }
  });

  socket.on('join_game', ({ gameId, sessionId, playerName, playerKey }) => {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      socket.emit('error', 'Invalid session');
      return;
    }

    const game = activeGames.get(gameId);
    if (!game) {
      return socket.emit('error', 'Game not found');
    }

    socket.join(gameId);

    if (game.white === normalizedSessionId) {
      socket.emit('game_joined', { gameId, side: 'w', fen: game.chess.fen(), pgn: game.chess.pgn(), isCpu: game.isCpu, timeControl: game.timeControl, whiteTime: game.whiteTime, blackTime: game.blackTime, lastMoveTime: game.lastMoveTime, whiteName: game.whiteName, blackName: game.blackName, learningMode: game.learningMode, seriesState: game.seriesState || null });
      if (game.black) {
        socket.emit('player_joined', { message: 'Opponent is here', blackName: game.blackName, whiteName: game.whiteName });
      }
      return;
    }

    if (game.black === normalizedSessionId) {
      socket.emit('game_joined', { gameId, side: 'b', fen: game.chess.fen(), pgn: game.chess.pgn(), isCpu: game.isCpu, timeControl: game.timeControl, whiteTime: game.whiteTime, blackTime: game.blackTime, lastMoveTime: game.lastMoveTime, whiteName: game.whiteName, blackName: game.blackName, learningMode: game.learningMode, seriesState: game.seriesState || null });
      return;
    }

    if (game.black) {
      return socket.emit('error', 'Game is full');
    }

    game.black = normalizedSessionId;
    if (playerName) {
      game.blackName = playerName;
    }
    game.blackPlayerKey = normalizePlayerKey(playerKey);

    // Ensure timer doesn't start until the first move is made
    game.lastMoveTime = null;
    socket.emit('game_joined', { gameId, side: 'b', fen: game.chess.fen(), pgn: game.chess.pgn(), isCpu: game.isCpu, timeControl: game.timeControl, whiteTime: game.whiteTime, blackTime: game.blackTime, lastMoveTime: game.lastMoveTime, whiteName: game.whiteName, blackName: game.blackName, learningMode: game.learningMode, seriesState: game.seriesState || null });
    io.to(gameId).emit('player_joined', { message: 'Black has joined', blackName: game.blackName, whiteName: game.whiteName });

    db.saveGame({
        id: game.id,
        pgn: game.chess.pgn(),
        status: game.status,
        timeControl: game.timeControl,
        white: game.white,
        black: game.black,
        whitePlayerKey: game.whitePlayerKey,
        blackPlayerKey: game.blackPlayerKey,
        isCpu: game.isCpu,
        cpuLevel: game.cpuLevel
    });
  });

  socket.on('find_random', async ({ timeControl, sessionId, playerName, playerKey }) => {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      socket.emit('error', 'Invalid session');
      return;
    }

    // Gather all possible targets: local queue + active, compatible federation links
    const targets = ['local'];
    const links = db.getFederationLinks();

    for (const link of links) {
      const status = federationStatus.get(link.id);
      // Ensure the partner is online and on the same version
      if (status && status.isActive && status.version === VERSION) {
        targets.push(link);
      }
    }

    // Fisher-Yates Shuffle to randomize the order of targets
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }

    // Pre-calculate local opponent to avoid nested loop
    let localOpponent = null;
    for (const p of matchmakingQueue.values()) {
      if (p.timeControl === timeControl && p.sessionId !== normalizedSessionId) {
        localOpponent = p;
        break;
      }
    }

    for (const target of targets) {
      if (target === 'local') {
        let opponent = localOpponent;

        if (opponent && matchmakingQueue.has(opponent.socketId)) {
          // Remove from queue
          matchmakingQueue.delete(opponent.socketId);

          const gameId = uuidv4();
          const chess = new Chess();
          const tc = parseTimeControl(timeControl);
          const time = tc.base;
          const gameData = {
            id: gameId,
            chess,
            white: opponent.sessionId,
            whiteName: opponent.playerName,
            whitePlayerKey: opponent.playerKey,
            black: normalizedSessionId,
            blackName: playerName,
            blackPlayerKey: normalizePlayerKey(playerKey),
            isCpu: false,
            timeControl,
            status: 'active',
            whiteTime: time,
            blackTime: time,
            lastMoveTime: null
          };
          activeGames.set(gameId, gameData);

          // Notify both
          io.to(opponent.socketId).emit('game_started', { gameId, side: 'w' });
          socket.emit('game_started', { gameId, side: 'b' });

          // Join rooms
          socket.join(gameId);
          io.sockets.sockets.get(opponent.socketId)?.join(gameId);

          db.saveGame({
            id: gameData.id,
            pgn: gameData.chess.pgn(),
            status: gameData.status,
            timeControl: gameData.timeControl,
            white: gameData.white,
            black: gameData.black,
            whitePlayerKey: gameData.whitePlayerKey,
            blackPlayerKey: gameData.blackPlayerKey,
            isCpu: false
          });
          return; // Match found and started, exit completely
        }
      } else {
        // Target is a federation link
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          const response = await fetch(`${target.partner_url}/api/federation/matchmaking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeControl, sessionId: normalizedSessionId, playerName, playerKey: normalizePlayerKey(playerKey), initiatorInstanceId: db.instanceId }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            if (data.matchFound) {
              const partnerGameId = data.gameId;
              const gameId = partnerGameId; // Use the exact same game ID locally

              const chess = new Chess();

              const gameData = {
                 id: gameId,
                 chess,
                 white: data.gameData.white,
                 whiteName: data.gameData.whiteName,
                 black: data.gameData.black,
                 blackName: data.gameData.blackName,
                 isCpu: false,
                 timeControl: data.gameData.timeControl,
                 status: 'active',
                 whiteTime: data.gameData.whiteTime,
                 blackTime: data.gameData.blackTime,
                 lastMoveTime: null,
                 federationPartnerUrl: target.partner_url,
                 federationPartnerId: target.id
              };

              activeGames.set(gameId, gameData);
              socket.join(gameId);

              db.saveGame({
                 id: gameData.id,
                 pgn: gameData.chess.pgn(),
                 status: gameData.status,
                 timeControl: gameData.timeControl,
                 white: gameData.white,
                 black: gameData.black,
                 whitePlayerKey: gameData.whitePlayerKey,
                 blackPlayerKey: gameData.blackPlayerKey,
                 isCpu: false
              });

              socket.emit('game_started', { gameId, side: 'b' });
              return; // Match found and started, exit completely
            }
          }
        } catch (e) {
          console.error(`Failed to check matchmaking with ${target.partner_url}`, e.message);
        }
      }
    }

    // Still no match across ANY target, wait locally
    matchmakingQueue.set(socket.id, { socketId: socket.id, sessionId: normalizedSessionId, timeControl, playerName, playerKey: normalizePlayerKey(playerKey) });
    socket.emit('waiting_for_opponent');
  });

  socket.on('make_move', ({ gameId, move, sessionId }) => {
    const normalizedSessionId = normalizeSessionId(sessionId);
    const game = activeGames.get(gameId);
    if (!game || !normalizedSessionId || !isSessionParticipant(game, normalizedSessionId)) return;

    // Determine whose turn it is
    const turn = game.chess.turn() === 'w' ? game.white : game.black;
    if (turn !== normalizedSessionId) {
        return; // Not their turn
    }

    try {
      const result = game.chess.move(move);
      if (result) {
        updateGameTime(game);
        emitMoveMade(game);
        checkGameEnd(game);
        saveToDb(game);

        sendFederationEvent(game, 'move', { move, whiteTime: game.whiteTime, blackTime: game.blackTime, lastMoveTime: game.lastMoveTime });

        // If playing against CPU, trigger CPU move
        if (game.isCpu && game.status === 'active' && game.chess.turn() === 'b') {
          if (!game.engine || !game.engine.stdin) {
            socket.emit('error', 'CPU engine unavailable');
            return;
          }
          game.engine.stdin.write(`position fen ${game.chess.fen()}\n`);
          // Simple depth calculation based on level
          game.engine.stdin.write(`go depth ${game.cpuLevel + 2}\n`);
        }
      }
    } catch (e) {
      // Invalid move
      socket.emit('error', 'Invalid move');
    }
  });

  socket.on('resign', ({ gameId, sessionId }) => {
    const game = activeGames.get(gameId);
    if (!game) return;

    if (isSessionParticipant(game, sessionId)) {
        const normalizedSessionId = normalizeSessionId(sessionId);
        game.status = 'resign';
        const winner = game.white === normalizedSessionId ? 'b' : 'w';
        game.resultWinner = winner;
        io.to(gameId).emit('game_over', { reason: 'resign', winner });
        saveAndRemoveGame(game);

        sendFederationEvent(game, 'resign', { winner });
    }
  });

  socket.on('offer_draw', ({ gameId, sessionId }) => {
      const game = activeGames.get(gameId);
      if (!game || game.isCpu) return; // Cannot draw with CPU simply
      if (!isSessionParticipant(game, sessionId)) return;

      socket.to(gameId).emit('draw_offered');

      sendFederationEvent(game, 'offer_draw', {});
  });

  socket.on('accept_draw', ({ gameId, sessionId }) => {
      const game = activeGames.get(gameId);
      if (!game || !sessionId) return;
      if (!isSessionParticipant(game, sessionId)) return;
      game.status = 'draw';
      game.resultWinner = null;
      io.to(gameId).emit('game_over', { reason: 'draw' });
      saveAndRemoveGame(game);

      sendFederationEvent(game, 'accept_draw', {});
  });

  socket.on('timeout', ({ gameId, sessionId }) => {
      const game = activeGames.get(gameId);
      if (!game || !sessionId || game.status !== 'active' || game.timeControl === 'unlimited' || !game.lastMoveTime) return;
      if (!isSessionParticipant(game, sessionId)) return;

      const now = Date.now();
      const elapsed = (now - game.lastMoveTime) / 1000;
      const turn = game.chess.turn();

      if (turn === 'w' && game.whiteTime - elapsed <= 1) { // 1 second grace
          game.whiteTime = 0;
          game.status = 'timeout';
          game.resultWinner = 'b';
          io.to(gameId).emit('game_over', { reason: 'timeout', winner: 'b' });
          saveAndRemoveGame(game);
          sendFederationEvent(game, 'timeout', { winner: 'b' });
      } else if (turn === 'b' && game.blackTime - elapsed <= 1) {
          game.blackTime = 0;
          game.status = 'timeout';
          game.resultWinner = 'w';
          io.to(gameId).emit('game_over', { reason: 'timeout', winner: 'w' });
          saveAndRemoveGame(game);
          sendFederationEvent(game, 'timeout', { winner: 'w' });
      }
  });

  socket.on('request_takeback', ({ gameId, sessionId }) => {
    const game = activeGames.get(gameId);
    if (!game || !game.learningMode || !game.isCpu) return;
    if (game.white !== sessionId) return;

    try {
      // Undo CPU move + player move if possible
      const undoneCpu = game.chess.undo();
      const undonePlayer = game.chess.undo();
      if (undoneCpu || undonePlayer) {
        game.lastMoveTime = Date.now();
        emitMoveMade(game);
        saveToDb(game);
      }
    } catch (err) {
      console.error('Takeback failed', err.message);
    }
  });

  socket.on('request_rematch', ({ gameId, sessionId, playerKey }) => {
    const game = activeGames.get(gameId);
    if (game) return; // only allow rematch once game is over

    const storedGame = db.getGame(gameId);
    if (!storedGame) return;

    const whiteSession = storedGame.white_player_id;
    const blackSession = storedGame.black_player_id;
    const whiteKey = storedGame.white_player_key;
    const blackKey = storedGame.black_player_key;
    const normalizedPlayerKey = normalizePlayerKey(playerKey);

    const isAllowedBySession = sessionId === whiteSession || sessionId === blackSession;
    const isAllowedByKey = normalizedPlayerKey && (normalizedPlayerKey === whiteKey || normalizedPlayerKey === blackKey);
    if (!isAllowedBySession && !isAllowedByKey) return;

    let set = pendingRematches.get(gameId);
    if (!set) {
      set = new Set();
      pendingRematches.set(gameId, set);
    }
    set.add(normalizedPlayerKey || sessionId);

    const expectedPlayers = new Set([whiteKey || whiteSession, blackKey || blackSession].filter(Boolean));
    if (expectedPlayers.size < 2 || set.size < 2) {
      socket.emit('rematch_waiting');
      return;
    }

    pendingRematches.delete(gameId);
    const newGameId = uuidv4();
    const chess = new Chess();

    const parsedTc = parseTimeControl(storedGame.time_control);
    const isEven = (Date.now() % 2) === 0;
    const white = isEven ? whiteSession : blackSession;
    const black = isEven ? blackSession : whiteSession;
    const whitePlayerKey = isEven ? storedGame.white_player_key : storedGame.black_player_key;
    const blackPlayerKey = isEven ? storedGame.black_player_key : storedGame.white_player_key;

    const seriesId = `series:${[storedGame.white_player_key || whiteSession, storedGame.black_player_key || blackSession].sort().join(':')}`;
    const series = activeSeries.get(seriesId) || {
      players: [storedGame.white_player_key || whiteSession, storedGame.black_player_key || blackSession],
      score: {},
      gamesPlayed: 0
    };

    if (storedGame.status === 'mate' || storedGame.status === 'resign' || storedGame.status === 'timeout') {
      const winnerKey = storedGame.status && storedGame.black_player_id && storedGame.white_player_id
        ? (storedGame.pgn?.includes('1-0') ? (storedGame.white_player_key || storedGame.white_player_id) : storedGame.pgn?.includes('0-1') ? (storedGame.black_player_key || storedGame.black_player_id) : null)
        : null;
      if (winnerKey) {
        series.score[winnerKey] = (series.score[winnerKey] || 0) + 1;
      }
    }
    series.gamesPlayed += 1;
    activeSeries.set(seriesId, series);

    const gameData = {
      id: newGameId,
      chess,
      white,
      black,
      whitePlayerKey,
      blackPlayerKey,
      whiteName: null,
      blackName: null,
      isCpu: false,
      timeControl: storedGame.time_control || '10|0',
      status: 'active',
      whiteTime: parsedTc.base,
      blackTime: parsedTc.base,
      lastMoveTime: null,
      seriesId,
      seriesState: {
        seriesId,
        score: series.score,
        bestOf: 3,
        gamesPlayed: series.gamesPlayed
      }
    };
    activeGames.set(newGameId, gameData);
    db.saveGame({
      id: gameData.id,
      pgn: chess.pgn(),
      status: gameData.status,
      timeControl: gameData.timeControl,
      white: gameData.white,
      black: gameData.black,
      whitePlayerKey: gameData.whitePlayerKey,
      blackPlayerKey: gameData.blackPlayerKey,
      isCpu: false
    });

    io.to(gameId).emit('rematch_started', { previousGameId: gameId, gameId: newGameId });
  });

  socket.on('disconnect', () => {
    matchmakingQueue.delete(socket.id);
  });
});

function updateGameTime(game) {
    if (game.timeControl === 'unlimited') return;

    const now = Date.now();
    if (game.lastMoveTime) {
        const elapsed = (now - game.lastMoveTime) / 1000;
        const tc = parseTimeControl(game.timeControl);

        // The player who JUST moved was the one whose turn it was previously
        const justMoved = game.chess.turn() === 'w' ? 'b' : 'w';

        if (justMoved === 'w') {
            game.whiteTime -= elapsed;
            game.whiteTime += tc.inc;
        } else {
            game.blackTime -= elapsed;
            game.blackTime += tc.inc;
        }
    }

    game.lastMoveTime = now;
}

// Timeout checker
setInterval(() => {
    const now = Date.now();
    for (const [gameId, game] of activeGames.entries()) {
        if (game.status !== 'active' || game.timeControl === 'unlimited' || !game.lastMoveTime || (!game.isCpu && !game.black)) continue;

        const elapsed = (now - game.lastMoveTime) / 1000;
        const turn = game.chess.turn();

        if (turn === 'w' && game.whiteTime - elapsed <= 0) {
            game.whiteTime = 0;
            game.status = 'timeout';
            game.resultWinner = 'b';
            io.to(gameId).emit('game_over', { reason: 'timeout', winner: 'b' });
            saveAndRemoveGame(game);
            sendFederationEvent(game, 'timeout', { winner: 'b' });
        } else if (turn === 'b' && game.blackTime - elapsed <= 0) {
            game.blackTime = 0;
            game.status = 'timeout';
            game.resultWinner = 'w';
            io.to(gameId).emit('game_over', { reason: 'timeout', winner: 'w' });
            saveAndRemoveGame(game);
            sendFederationEvent(game, 'timeout', { winner: 'w' });
        }
    }
}, 1000);

function saveAndRemoveGame(game) {
    if (game.engine) {
        try {
            game.engine.kill();
        } catch (e) {
            console.error('Failed to kill engine', e);
        }
    }
    db.saveGame({
        id: game.id,
        pgn: game.chess.pgn(),
        status: game.status,
        timeControl: game.timeControl,
        white: game.white,
        black: game.black,
        whitePlayerKey: game.whitePlayerKey,
        blackPlayerKey: game.blackPlayerKey,
        isCpu: game.isCpu,
        cpuLevel: game.cpuLevel,
        learningMode: game.learningMode
    });
    updateRatingsForGame(game);
    activeGames.delete(game.id);
}

function checkGameEnd(game, suppressFederationEvent = false) {
  if (game.chess.isGameOver()) {
    let reason = 'draw';
    if (game.chess.isCheckmate()) reason = 'mate';
    if (game.chess.isStalemate()) reason = 'stalemate';
    game.status = reason;
    const winner = reason === 'mate' ? (game.chess.turn() === 'w' ? 'b' : 'w') : null;
    game.resultWinner = winner;
    io.to(game.id).emit('game_over', { reason, winner });
    saveAndRemoveGame(game);
    // Move handles mate inside chess logic, no explicit send event here needed usually
    // because it relies purely on FEN sync.
  }
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Instance ID: ${db.instanceId}`);
  if (db.generatedAdminPassword && process.env.NODE_ENV !== 'production') {
    console.log(`Initial admin password: ${db.generatedAdminPassword}`);
  }
});
