const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Chess } = require('chess.js');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');

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
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_chess_key';

// In-memory game state
const activeGames = new Map();
let matchmakingQueue = [];
let federationExchangeCodes = new Map();

// Admin Auth Middleware
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.admin) {
      next();
    } else {
      res.status(403).json({ error: 'Not an admin' });
    }
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === db.adminPassword) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.get('/api/admin/info', authenticateAdmin, (req, res) => {
  res.json({
    instanceId: db.instanceId,
    links: db.getFederationLinks()
  });
});

app.delete('/api/admin/replays/:id', authenticateAdmin, (req, res) => {
  db.deleteGame(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/replays', authenticateAdmin, (req, res) => {
  db.deleteAllReplays();
  res.json({ success: true });
});

app.post('/api/admin/federation/code', authenticateAdmin, (req, res) => {
  const code = uuidv4().substring(0, 8);
  federationExchangeCodes.set(code, Date.now());
  res.json({ code });
});

app.post('/api/admin/federation/link', authenticateAdmin, async (req, res) => {
  const { partnerUrl, exchangeCode } = req.body;
  try {
    // Basic verification of partner instance and code
    // In a real implementation this would verify cryptographically
    const response = await fetch(`${partnerUrl}/api/federation/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: exchangeCode, instanceId: db.instanceId })
    });

    if (response.ok) {
      const data = await response.json();
      db.saveFederationLink(data.partnerInstanceId, partnerUrl);
      res.json({ success: true, partnerInstanceId: data.partnerInstanceId });
    } else {
      res.status(400).json({ error: 'Failed to link with partner' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Error connecting to partner' });
  }
});

app.post('/api/federation/verify', (req, res) => {
  const { code, instanceId } = req.body;
  if (federationExchangeCodes.has(code)) {
    // Code valid
    federationExchangeCodes.delete(code); // One time use
    // If we wanted 2-way link, we could save the partner here too,
    // but the partnerUrl isn't provided in this simple flow unless passed.
    res.json({ success: true, partnerInstanceId: db.instanceId });
  } else {
    res.status(400).json({ error: 'Invalid or expired exchange code' });
  }
});

app.post('/api/admin/federation/sync', authenticateAdmin, async (req, res) => {
  const links = db.getFederationLinks();
  let syncCount = 0;

  for (const link of links) {
    try {
      // Fetch replays from partner
      const response = await fetch(`${link.partner_url}/api/replays`);
      if (response.ok) {
        const games = await response.json();
        for (const game of games) {
          // Check if we already have it. If not, save.
          const existing = db.getGame(game.id);
          if (!existing) {
            db.saveGame({
              id: game.id,
              pgn: game.pgn,
              status: game.status,
              timeControl: game.time_control,
              white: game.white_player_id,
              black: game.black_player_id,
              isCpu: game.is_cpu === 1,
              cpuLevel: game.cpu_level
            });
            syncCount++;
          }
        }
      }
    } catch (e) {
      console.error(`Failed to sync with ${link.partner_url}`, e);
    }
  }

  res.json({ success: true, synced: syncCount });
});

app.get('/api/info', (req, res) => {
  res.json({ instanceId: db.instanceId });
});

app.get('/api/replays', (req, res) => {
  const games = db.getFinishedGames();
  res.json(games);
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
      if (game.white === sessionId || game.black === sessionId) {
        socket.join(gameId);
        socket.emit('game_rejoined', { gameId, side: game.white === sessionId ? 'w' : 'b', fen: game.chess.fen(), pgn: game.chess.pgn(), timeControl: game.timeControl });
        rejoined = true;
        break;
      }
    }
    if (!rejoined) {
      socket.emit('rejoin_failed');
    }
  });

  const parseTimeControl = (tc) => {
    if (tc === 'unlimited') return { base: null, inc: null };
    const parts = tc.split('|');
    return { base: parseInt(parts[0]) * 60, inc: parseInt(parts[1]) };
  };

  socket.on('create_game', ({ isCpu, cpuLevel, timeControl, sessionId }) => {
    const gameId = uuidv4();
    const chess = new Chess();

    const tc = parseTimeControl(timeControl);
    const time = tc.base;

    const gameData = {
      id: gameId,
      chess,
      white: sessionId,
      black: isCpu ? 'cpu' : null,
      isCpu,
      cpuLevel,
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
      engine.stdin.write(`setoption name Skill Level value ${cpuLevel * 2}\n`); // Scale 1-10 to 1-20
      gameData.engine = engine;

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
                  io.to(gameId).emit('move_made', {
                      fen: gameData.chess.fen(),
                      pgn: gameData.chess.pgn(),
                      whiteTime: gameData.whiteTime,
                      blackTime: gameData.blackTime,
                      lastMoveTime: gameData.lastMoveTime
                  });
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
      white: sessionId,
      black: gameData.black,
      isCpu,
      cpuLevel
    });

    socket.emit('game_created', { gameId, side: 'w' });
  });

  socket.on('join_game', ({ gameId, sessionId }) => {
    const game = activeGames.get(gameId);
    if (!game) {
      return socket.emit('error', 'Game not found');
    }

    socket.join(gameId);

    if (game.white === sessionId) {
      socket.emit('game_joined', { gameId, side: 'w', fen: game.chess.fen(), pgn: game.chess.pgn(), isCpu: game.isCpu, timeControl: game.timeControl, whiteTime: game.whiteTime, blackTime: game.blackTime, lastMoveTime: game.lastMoveTime });
      if (game.black) {
        socket.emit('player_joined', { message: 'Opponent is here' });
      }
      return;
    }

    if (game.black === sessionId) {
      socket.emit('game_joined', { gameId, side: 'b', fen: game.chess.fen(), pgn: game.chess.pgn(), isCpu: game.isCpu, timeControl: game.timeControl, whiteTime: game.whiteTime, blackTime: game.blackTime, lastMoveTime: game.lastMoveTime });
      return;
    }

    if (game.black) {
      return socket.emit('error', 'Game is full');
    }

    game.black = sessionId;
    // Set start time for first move if game starts now
    if (game.timeControl !== 'unlimited') {
        game.lastMoveTime = Date.now();
    }
    socket.emit('game_joined', { gameId, side: 'b', fen: game.chess.fen(), pgn: game.chess.pgn(), isCpu: game.isCpu, timeControl: game.timeControl, whiteTime: game.whiteTime, blackTime: game.blackTime, lastMoveTime: game.lastMoveTime });
    io.to(gameId).emit('player_joined', { message: 'Black has joined' });

    db.saveGame({
        id: game.id,
        pgn: game.chess.pgn(),
        status: game.status,
        timeControl: game.timeControl,
        white: game.white,
        black: game.black,
        isCpu: game.isCpu,
        cpuLevel: game.cpuLevel
    });
  });

  socket.on('find_random', ({ timeControl, sessionId }) => {
    // Basic matchmaking
    const opponent = matchmakingQueue.find(p => p.timeControl === timeControl && p.sessionId !== sessionId);
    if (opponent) {
      // Remove from queue
      matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== opponent.socketId);

      const gameId = uuidv4();
      const chess = new Chess();
      const tc = parseTimeControl(timeControl);
      const time = tc.base;
      const gameData = {
        id: gameId,
        chess,
        white: opponent.sessionId,
        black: sessionId,
        isCpu: false,
        timeControl,
        status: 'active',
        whiteTime: time,
        blackTime: time,
        lastMoveTime: time !== null ? Date.now() : null
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
        isCpu: false
      });
    } else {
      matchmakingQueue.push({ socketId: socket.id, sessionId, timeControl });
      socket.emit('waiting_for_opponent');
    }
  });

  socket.on('make_move', ({ gameId, move, sessionId }) => {
    const game = activeGames.get(gameId);
    if (!game) return;

    // Determine whose turn it is
    const turn = game.chess.turn() === 'w' ? game.white : game.black;
    if (turn !== sessionId) {
        return; // Not their turn
    }

    try {
      const result = game.chess.move(move);
      if (result) {
        updateGameTime(game);
        io.to(gameId).emit('move_made', {
            fen: game.chess.fen(),
            pgn: game.chess.pgn(),
            whiteTime: game.whiteTime,
            blackTime: game.blackTime,
            lastMoveTime: game.lastMoveTime
        });
        checkGameEnd(game);

        db.saveGame({
            id: game.id,
            pgn: game.chess.pgn(),
            status: game.status,
            timeControl: game.timeControl,
            white: game.white,
            black: game.black,
            isCpu: game.isCpu,
            cpuLevel: game.cpuLevel
        });

        // If playing against CPU, trigger CPU move
        if (game.isCpu && game.status === 'active' && game.chess.turn() === 'b') {
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

    if (game.white === sessionId || game.black === sessionId) {
        game.status = 'resign';
        const winner = game.white === sessionId ? 'black' : 'white';
        io.to(gameId).emit('game_over', { reason: 'resign', winner });

        db.saveGame({
            id: game.id,
            pgn: game.chess.pgn(),
            status: 'resign',
            timeControl: game.timeControl,
            white: game.white,
            black: game.black,
            isCpu: game.isCpu,
            cpuLevel: game.cpuLevel
        });
        activeGames.delete(gameId);
    }
  });

  socket.on('offer_draw', ({ gameId, sessionId }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      if (game.isCpu) return; // Cannot draw with CPU simply

      const opponent = game.white === sessionId ? game.black : game.white;
      // In a real app we'd map session to socket, for now just broadcast
      socket.to(gameId).emit('draw_offered');
  });

  socket.on('accept_draw', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      game.status = 'draw';
      io.to(gameId).emit('game_over', { reason: 'draw' });
      db.saveGame({
            id: game.id,
            pgn: game.chess.pgn(),
            status: 'draw',
            timeControl: game.timeControl,
            white: game.white,
            black: game.black,
            isCpu: game.isCpu,
            cpuLevel: game.cpuLevel
      });
      activeGames.delete(gameId);
  });

  socket.on('disconnect', () => {
    matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);
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
            io.to(gameId).emit('game_over', { reason: 'timeout', winner: 'black' });
            saveAndRemoveGame(game);
        } else if (turn === 'b' && game.blackTime - elapsed <= 0) {
            game.blackTime = 0;
            game.status = 'timeout';
            io.to(gameId).emit('game_over', { reason: 'timeout', winner: 'white' });
            saveAndRemoveGame(game);
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
        isCpu: game.isCpu,
        cpuLevel: game.cpuLevel
    });
    activeGames.delete(game.id);
}

function checkGameEnd(game) {
  if (game.chess.isGameOver()) {
    let reason = 'draw';
    if (game.chess.isCheckmate()) reason = 'mate';
    if (game.chess.isStalemate()) reason = 'stalemate';
    game.status = reason;
    io.to(game.id).emit('game_over', { reason, winner: reason === 'mate' ? (game.chess.turn() === 'w' ? 'black' : 'white') : null });
    saveAndRemoveGame(game);
  }
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Instance ID: ${db.instanceId}`);
  console.log(`Admin Password: ${db.adminPassword}`);
});
