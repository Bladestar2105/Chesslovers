# ♟️ Chesslovers

A modern, registration-free multiplayer chess platform designed for instant play. Challenge your friends, play against a CPU (Stockfish), or find a random opponent online!

## ✨ Features

- **No Registration Required**: Jump straight into a game with just a nickname.
- **Real-Time Multiplayer**: Instant move synchronization powered by Socket.io.
- **Play vs. Computer**: Test your skills against the powerful Stockfish chess engine.
- **Multi-Language Support**: i18n support for English and German out of the box.
- **Light & Dark Mode**: A seamless theming system that adapts to your preferences.
- **Admin Dashboard**: Manage your instance, view replays, and handle federated partner instances via `/admin` (JWT authenticated).
- **Federation Ready (WIP)**: Built with server federation in mind to pool players across different hosted instances.

---

## 🏗️ Architecture & Tech Stack

Chesslovers is structured as a monorepo, keeping the frontend and backend clearly separated but easy to deploy together.

### Frontend
- **Framework**: React + Vite
- **Styling**: Tailwind CSS + Custom CSS Variables for Theming
- **Chess Logic**: `chess.js` & `react-chessboard`
- **Localization**: `react-i18next`

### Backend
- **Server**: Node.js + Express
- **Real-Time Engine**: Socket.io
- **Database**: SQLite (`better-sqlite3`) for persistent sessions and game history
- **Chess Engine**: `stockfish` running as a child process

---

## 🚀 Getting Started (Local Development)

### 1. Clone the repository
```bash
git clone https://github.com/bladestar2105/chesslovers.git
cd chesslovers
```

### 2. Backend Setup
The backend serves the API, Socket connections, and manages the database.

```bash
cd backend
npm install
node server.js
```
*Note: On the first startup, a 12-character random admin password will be generated and printed to the console. Save this to access the Admin UI at `/admin`.*

### 3. Frontend Setup
Open a new terminal window to start the Vite development server.

```bash
cd frontend
npm install
```

For local development, create a `.env.development` file in the `frontend/` directory (not `.env`!) to connect to your local backend:
```env
VITE_SOCKET_URL=http://localhost:3000
```
*In production builds, leave `VITE_SOCKET_URL` undefined so it defaults to the host origin.*

Run the frontend:
```bash
npm run dev
```

---

## 🐳 Docker Deployment

Chesslovers is automatically built and published as a single multi-stage Docker image via GitHub Actions. The Node.js backend serves the statically built frontend.

### Using Docker Compose
A `docker-compose.yml` is provided at the root for easy deployment (compatible with Portainer CE).

```yaml
version: '3.8'
services:
  chesslovers:
    image: ghcr.io/bladestar2105/chesslovers:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/backend/data
```

Run the container:
```bash
docker-compose up -d
```
*The SQLite database is stored in the mapped `data` volume to ensure your data persists across restarts.*

---

## 🧪 Testing

We use [Playwright](https://playwright.dev/) for automated UI testing and frontend visual verification. Test scripts are located in the `backend/` directory.

To run the test suite:
```bash
cd backend
npx playwright test
```

---

## 🗺️ Roadmap & Future Enhancements

Check out `TODO.md` for our full roadmap. Upcoming features include:
- **Mobile Companion App**: A native app for iOS and Android to easily connect to your preferred instances.
- **Server Federation (Instance Pooling)**: Connect multiple self-hosted instances together to share matchmaking pools, allowing users across different servers to play against each other seamlessly.

---

## 🤝 Contributing

Contributions are welcome! Please ensure that:
- Dependencies strictly remain within their respective `frontend/` or `backend/` directories.
- No `package.json` is created at the root level to avoid breaking monorepo definitions.
- Local test artifacts are cleaned up before committing.

Enjoy the game! ♘
