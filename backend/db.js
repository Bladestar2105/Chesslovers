const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');

const dataDir = process.env.CHESS_DATA_DIR || path.join(__dirname, 'data');
const fs = require('fs');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'chess.db'));

const PASSWORD_HASH_PREFIX = 'scrypt';

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 16384;
  const keylen = 64;
  const digest = 'sha512';
  const hash = crypto.scryptSync(password, salt, keylen, { N: iterations }).toString('hex');
  return `${PASSWORD_HASH_PREFIX}$${iterations}$${keylen}$${digest}$${salt}$${hash}`;
};

const isHashedPassword = (value) => typeof value === 'string' && value.startsWith(`${PASSWORD_HASH_PREFIX}$`);

const verifyHashedPassword = (password, storedHash) => {
  const parts = String(storedHash).split('$');
  if (parts.length !== 6) return false;
  const [, rawIterations, rawKeylen, , salt, hashHex] = parts;
  const iterations = Number.parseInt(rawIterations, 10);
  const keylen = Number.parseInt(rawKeylen, 10);
  if (!Number.isFinite(iterations) || !Number.isFinite(keylen)) return false;
  const derived = crypto.scryptSync(password, salt, keylen, { N: iterations });
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
};

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

  CREATE TABLE IF NOT EXISTS ratings (
    player_key TEXT PRIMARY KEY,
    display_name TEXT,
    rating INTEGER NOT NULL DEFAULT 1200,
    games_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS federation_links (
    id TEXT PRIMARY KEY,
    partner_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const gameColumns = db.prepare(`PRAGMA table_info(games)`).all();
const hasGameColumn = (name) => gameColumns.some((col) => col.name === name);
if (!hasGameColumn('white_player_key')) {
  db.exec(`ALTER TABLE games ADD COLUMN white_player_key TEXT`);
}
if (!hasGameColumn('black_player_key')) {
  db.exec(`ALTER TABLE games ADD COLUMN black_player_key TEXT`);
}
if (!hasGameColumn('learning_mode')) {
  db.exec(`ALTER TABLE games ADD COLUMN learning_mode INTEGER DEFAULT 0`);
}

// Get or generate instance ID
let instanceIdRow = db.prepare('SELECT value FROM config WHERE key = ?').get('instance_id');
if (!instanceIdRow) {
  const newInstanceId = uuidv4();
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('instance_id', newInstanceId);
  instanceIdRow = { value: newInstanceId };
}
const instanceId = instanceIdRow.value;

// Get or generate Admin Password
let adminPasswordRow = db.prepare('SELECT value FROM config WHERE key = ?').get('admin_password');
let generatedAdminPassword = null;
if (!adminPasswordRow) {
  const envPassword = process.env.ADMIN_PASSWORD && String(process.env.ADMIN_PASSWORD).trim();
  // Generate a random 12 character password (base64 of 9 bytes is exactly 12 chars)
  const newAdminPassword = envPassword || crypto.randomBytes(9).toString('base64').replace(/\+/g, '8').replace(/\//g, '9');
  const hashedAdminPassword = hashPassword(newAdminPassword);
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('admin_password', hashedAdminPassword);
  generatedAdminPassword = envPassword ? null : newAdminPassword;
  adminPasswordRow = { value: hashedAdminPassword };
}
const adminPassword = adminPasswordRow.value;

// Get or generate JWT Secret
let jwtSecretRow = db.prepare('SELECT value FROM config WHERE key = ?').get('jwt_secret');
if (!jwtSecretRow) {
  const newJwtSecret = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('jwt_secret', newJwtSecret);
  jwtSecretRow = { value: newJwtSecret };
}
const jwtSecret = jwtSecretRow.value;


module.exports = {
  db,
  instanceId,
  adminPassword,
  generatedAdminPassword,
  jwtSecret,
  saveGame: (gameData) => {
    const stmt = db.prepare(`
      INSERT INTO games (
        id, pgn, status, time_control, white_player_id, black_player_id, white_player_key, black_player_key, is_cpu, cpu_level, learning_mode
      )
      VALUES (
        @id, @pgn, @status, @time_control, @white_player_id, @black_player_id, @white_player_key, @black_player_key, @is_cpu, @cpu_level, @learning_mode
      )
      ON CONFLICT(id) DO UPDATE SET
        pgn = excluded.pgn,
        status = excluded.status,
        white_player_key = excluded.white_player_key,
        black_player_key = excluded.black_player_key,
        learning_mode = excluded.learning_mode,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run({
      id: gameData.id,
      pgn: gameData.pgn || '',
      status: gameData.status || 'active',
      time_control: gameData.timeControl || 'standard',
      white_player_id: gameData.white || null,
      black_player_id: gameData.black || null,
      white_player_key: gameData.whitePlayerKey || null,
      black_player_key: gameData.blackPlayerKey || null,
      is_cpu: gameData.isCpu ? 1 : 0,
      cpu_level: gameData.cpuLevel || 1,
      learning_mode: gameData.learningMode ? 1 : 0
    });
  },
  getGame: (id) => {
    return db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  },
  getFinishedGames: () => {
    return db.prepare("SELECT * FROM games WHERE status IN ('mate', 'stalemate', 'draw', 'resign', 'timeout') ORDER BY created_at DESC").all();
  },
  deleteGame: (id) => {
    db.prepare('DELETE FROM games WHERE id = ?').run(id);
  },
  deleteAllReplays: () => {
    db.prepare("DELETE FROM games WHERE status IN ('mate', 'stalemate', 'draw', 'resign', 'timeout')").run();
  },
  saveFederationLink: (id, partnerUrl) => {
    db.prepare('INSERT OR REPLACE INTO federation_links (id, partner_url) VALUES (?, ?)').run(id, partnerUrl);
  },
  getFederationLinks: () => {
    return db.prepare('SELECT * FROM federation_links').all();
  },
  getFederationLink: (id) => {
    return db.prepare('SELECT * FROM federation_links WHERE id = ?').get(id);
  },
  deleteFederationLink: (id) => {
    db.prepare('DELETE FROM federation_links WHERE id = ?').run(id);
  },
  verifyAdminPassword: (password) => {
    const stored = module.exports.adminPassword;
    if (!stored || !password) return false;
    if (isHashedPassword(stored)) return verifyHashedPassword(password, stored);
    const isValid = stored === password;
    if (isValid) {
      module.exports.updateAdminPassword(password);
    }
    return isValid;
  },
  updateAdminPassword: (newPassword) => {
    const hashed = hashPassword(newPassword);
    db.prepare('UPDATE config SET value = ? WHERE key = ?').run(hashed, 'admin_password');
    module.exports.adminPassword = hashed;
  },
  upsertPlayerDisplayName: (playerKey, displayName) => {
    if (!playerKey) return;
    db.prepare(`
      INSERT INTO ratings (player_key, display_name)
      VALUES (?, ?)
      ON CONFLICT(player_key) DO UPDATE SET
        display_name = CASE
          WHEN excluded.display_name IS NOT NULL AND excluded.display_name <> '' THEN excluded.display_name
          ELSE ratings.display_name
        END,
        updated_at = CURRENT_TIMESTAMP
    `).run(playerKey, displayName || null);
  },
  getRating: (playerKey) => {
    return db.prepare('SELECT * FROM ratings WHERE player_key = ?').get(playerKey);
  },
  saveRating: (ratingData) => {
    db.prepare(`
      INSERT INTO ratings (player_key, display_name, rating, games_played, wins, draws, losses, updated_at)
      VALUES (@player_key, @display_name, @rating, @games_played, @wins, @draws, @losses, CURRENT_TIMESTAMP)
      ON CONFLICT(player_key) DO UPDATE SET
        display_name = excluded.display_name,
        rating = excluded.rating,
        games_played = excluded.games_played,
        wins = excluded.wins,
        draws = excluded.draws,
        losses = excluded.losses,
        updated_at = CURRENT_TIMESTAMP
    `).run(ratingData);
  },
  getTopRatings: (limit = 50) => {
    return db.prepare(`
      SELECT player_key, display_name, rating, games_played, wins, draws, losses, updated_at
      FROM ratings
      WHERE games_played > 0
      ORDER BY rating DESC, games_played DESC, updated_at DESC
      LIMIT ?
    `).all(limit);
  }
};
