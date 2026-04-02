import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import Home from './pages/Home';
import Game from './pages/Game';
import Replays from './pages/Replays';
import Admin from './pages/Admin';
import { Sun, Moon, Globe } from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

function App() {
  const { t, i18n } = useTranslation();
  const [socket, setSocket] = useState(null);
  const [sessionId, setSessionId] = useState('');

  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  };
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    // Listen for OS theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      // Only auto-switch if user hasn't manually set a preference
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    // Generate or retrieve session ID
    let sid = localStorage.getItem('chess_session_id');
    if (!sid) {
      sid = uuidv4();
      localStorage.setItem('chess_session_id', sid);
    }
    setTimeout(() => setSessionId(sid), 0);

    // Apply theme
    document.documentElement.className = theme;
    localStorage.setItem('theme', theme);

    // Connect to server
    const newSocket = io(SOCKET_URL);
    setTimeout(() => setSocket(newSocket), 0);

    newSocket.on('connect', () => {
      newSocket.emit('rejoin', { sessionId: sid });
    });

    const onGameRejoined = ({ gameId }) => {
      if (window.location.pathname !== `/game/${gameId}`) {
        window.location.href = `/game/${gameId}`;
      }
    };

    newSocket.on('game_rejoined', onGameRejoined);

    return () => {
        newSocket.off('game_rejoined', onGameRejoined);
        newSocket.close();
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'de' : 'en');
  };

  if (!socket) return <div>Loading...</div>;

  return (
    <BrowserRouter>
      <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''} bg-[var(--bg-color)] text-[var(--text-color)]`}>
        <nav className="panel p-4 mb-8 flex justify-between items-center shadow-sm">
          <div className="flex gap-4 items-center">
            <Link to="/" className="text-2xl font-bold">{t('Play Chess')}</Link>
            <Link to="/replays" className="hover:underline">{t('Replays')}</Link>
            <Link to="/admin" className="hover:underline">Admin</Link>
          </div>
          <div className="flex gap-4">
            <button
              onClick={toggleLanguage}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title={t('Language')}
              aria-label={t('Language')}
            >
              <Globe size={20} />
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title={t('Theme')}
              aria-label={t('Theme')}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </nav>

        <main className="container mx-auto px-4 pb-8">
          <Routes>
            <Route path="/" element={<Home socket={socket} sessionId={sessionId} />} />
            <Route path="/game/:id" element={<Game socket={socket} sessionId={sessionId} />} />
            <Route path="/replays" element={<Replays />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
