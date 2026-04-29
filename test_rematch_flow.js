const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const TIMEOUT_MS = 15000;

const playerA = { sessionId: 'rematch-sess-a', playerKey: 'rematch-key-a', playerName: 'RematchA' };
const playerB = { sessionId: 'rematch-sess-b', playerKey: 'rematch-key-b', playerName: 'RematchB' };

const socketA = io(SERVER_URL, { transports: ['websocket'] });
const socketB = io(SERVER_URL, { transports: ['websocket'] });

let gameIdA;
let gameIdB;
let rematchGameId;
let joinedA = false;
let joinedB = false;
let rematchReadyA = false;
let rematchReadyB = false;
let oldGameId;

function fail(message) {
  console.error(`❌ ${message}`);
  cleanup(1);
}

function pass(message) {
  console.log(`✅ ${message}`);
}

function cleanup(code) {
  socketA.disconnect();
  socketB.disconnect();
  process.exit(code);
}

function maybeRequestRematch() {
  if (!rematchReadyA || !rematchReadyB || !oldGameId) return;
  socketA.emit('request_rematch', { gameId: oldGameId, sessionId: playerA.sessionId, playerKey: playerA.playerKey });
  socketB.emit('request_rematch', { gameId: oldGameId, sessionId: playerB.sessionId, playerKey: playerB.playerKey });
}

function maybeVerifyAndExit() {
  if (!joinedA || !joinedB || !rematchGameId) return;

  if (oldGameId === rematchGameId) {
    fail(`Expected new gameId, got same id: ${rematchGameId}`);
    return;
  }

  pass(`Old gameId (${oldGameId}) != new gameId (${rematchGameId})`);
  pass('Both clients joined rematch game in initial position');
  cleanup(0);
}

socketA.on('connect', () => {
  socketA.emit('create_friend_game', {
    timeControl: '3|0',
    sessionId: playerA.sessionId,
    playerName: playerA.playerName,
    playerKey: playerA.playerKey,
  });
});

socketA.on('game_created', ({ gameId }) => {
  gameIdA = gameId;
  oldGameId = gameId;
  socketB.emit('join_friend_game', {
    gameId,
    timeControl: '3|0',
    sessionId: playerB.sessionId,
    playerName: playerB.playerName,
    playerKey: playerB.playerKey,
  });
});

socketA.on('player_joined', () => {
  socketA.emit('resign', { gameId: oldGameId, sessionId: playerA.sessionId });
});

socketA.on('game_over', ({ reason }) => {
  if (reason === 'resign') {
    rematchReadyA = true;
    maybeRequestRematch();
  }
});

socketB.on('game_over', ({ reason }) => {
  if (reason === 'resign') {
    rematchReadyB = true;
    maybeRequestRematch();
  }
});

socketA.on('rematch_started', ({ previousGameId, gameId }) => {
  if (previousGameId !== oldGameId) return;
  rematchGameId = gameId;
  socketA.emit('join_game', {
    gameId,
    sessionId: playerA.sessionId,
    playerName: playerA.playerName,
    playerKey: playerA.playerKey,
  });
});

socketB.on('rematch_started', ({ previousGameId, gameId }) => {
  if (previousGameId !== oldGameId) return;
  rematchGameId = gameId;
  socketB.emit('join_game', {
    gameId,
    sessionId: playerB.sessionId,
    playerName: playerB.playerName,
    playerKey: playerB.playerKey,
  });
});

socketA.on('game_joined', ({ gameId, fen }) => {
  if (gameId !== rematchGameId) return;
  if (fen !== INITIAL_FEN) {
    fail(`Client A expected initial FEN, got: ${fen}`);
    return;
  }
  joinedA = true;
  maybeVerifyAndExit();
});

socketB.on('game_joined', ({ gameId, fen }) => {
  if (gameId !== rematchGameId) return;
  if (fen !== INITIAL_FEN) {
    fail(`Client B expected initial FEN, got: ${fen}`);
    return;
  }
  joinedB = true;
  maybeVerifyAndExit();
});

setTimeout(() => {
  fail('Timed out waiting for rematch flow to complete');
}, TIMEOUT_MS);
