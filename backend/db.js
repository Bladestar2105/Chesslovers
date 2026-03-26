const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const fs = require('fs');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'chess.db'));

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    pgn TEXT,
    status TEXT,
    time_control TEXT,
    white_player_id TEXT,
    black_player_id TEXT,
    is_cpu BOOLEAN,
    cpu_level INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Get or generate instance ID
let instanceIdRow = db.prepare('SELECT value FROM config WHERE key = ?').get('instance_id');
if (!instanceIdRow) {
  const newInstanceId = uuidv4();
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('instance_id', newInstanceId);
  instanceIdRow = { value: newInstanceId };
}
const instanceId = instanceIdRow.value;

module.exports = {
  db,
  instanceId,
  saveGame: (gameData) => {
    const stmt = db.prepare(`
      INSERT INTO games (id, pgn, status, time_control, white_player_id, black_player_id, is_cpu, cpu_level)
      VALUES (@id, @pgn, @status, @time_control, @white_player_id, @black_player_id, @is_cpu, @cpu_level)
      ON CONFLICT(id) DO UPDATE SET
        pgn = excluded.pgn,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run({
      id: gameData.id,
      pgn: gameData.pgn || '',
      status: gameData.status || 'active',
      time_control: gameData.timeControl || 'standard',
      white_player_id: gameData.white || null,
      black_player_id: gameData.black || null,
      is_cpu: gameData.isCpu ? 1 : 0,
      cpu_level: gameData.cpuLevel || 1
    });
  },
  getGame: (id) => {
    return db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  },
  getFinishedGames: () => {
    return db.prepare('SELECT * FROM games WHERE status IN ("mate", "stalemate", "draw", "resign", "timeout") ORDER BY created_at DESC').all();
  }
};
