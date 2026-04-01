import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function Home({ socket, sessionId }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState('cpu'); // cpu, random, friend
  const [difficulty, setDifficulty] = useState(1);
  const [timeControl, setTimeControl] = useState('10|0');
  const [waiting, setWaiting] = useState(false);
  const [friendGameId, setFriendGameId] = useState('');
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('playerName') || '');

  useEffect(() => {
    localStorage.setItem('playerName', playerName);
  }, [playerName]);

  useEffect(() => {
    if (!socket) return;

    const onGameCreated = ({ gameId }) => {
      navigate(`/game/${gameId}`);
    };

    const onGameStarted = ({ gameId }) => {
      setWaiting(false);
      navigate(`/game/${gameId}`);
    };

    const onWaitingForOpponent = () => {
      setWaiting(true);
    };

    socket.on('game_created', onGameCreated);
    socket.on('game_started', onGameStarted);
    socket.on('waiting_for_opponent', onWaitingForOpponent);

    return () => {
      socket.off('game_created', onGameCreated);
      socket.off('game_started', onGameStarted);
      socket.off('waiting_for_opponent', onWaitingForOpponent);
    };
  }, [socket, navigate]);

  const handleStart = () => {
    const nameToUse = playerName.trim() || undefined;
    if (mode === 'cpu') {
      socket.emit('create_game', { isCpu: true, cpuLevel: parseInt(difficulty), timeControl, sessionId, playerName: nameToUse });
    } else if (mode === 'friend') {
      if (friendGameId) {
        socket.emit('join_friend_game', { gameId: friendGameId, timeControl, sessionId, playerName: nameToUse });
      } else {
        socket.emit('create_game', { isCpu: false, timeControl, sessionId, playerName: nameToUse });
      }
    } else if (mode === 'random') {
      socket.emit('find_random', { timeControl, sessionId, playerName: nameToUse });
    }
  };

  return (
    <div className="max-w-md mx-auto panel p-6 rounded-lg shadow-md space-y-6">
      <h1 className="text-3xl font-bold text-center mb-6">{t('Play Chess')}</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Mode</label>
          <div className="flex gap-2" role="group" aria-label={t('Game Mode')}>
            {['cpu', 'random', 'friend'].map(m => (
              <button
                key={m}
                aria-pressed={mode === m}
                className={`flex-1 py-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                onClick={() => setMode(m)}
              >
                {m === 'cpu' ? t('Play vs CPU') : m === 'random' ? t('Play Random') : t('Play a Friend')}
              </button>
            ))}
          </div>
        </div>

        {mode === 'cpu' && (
          <div>
            <label htmlFor="difficulty-range" className="block text-sm font-medium mb-1">{t('Difficulty')} (1-10)</label>
            <input
              id="difficulty-range"
              type="range"
              min="1"
              max="10"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            />
            <div className="text-center">{difficulty}</div>
          </div>
        )}

        {(mode === 'friend' || mode === 'random') && (
          <div>
            <label htmlFor="nickname-input" className="block text-sm font-medium mb-1">{t('Nickname (optional)')}</label>
            <input
              id="nickname-input"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
              placeholder={t('Enter nickname...')}
              className="w-full p-2 border rounded-md bg-[var(--panel-bg)] border-[var(--border-color)] text-[var(--text-color)] mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
        )}

        {mode === 'friend' && (
          <div>
            <label htmlFor="game-id-input" className="block text-sm font-medium mb-1">{t('Game ID')} ({t('optional to join')})</label>
            <input
              id="game-id-input"
              type="text"
              value={friendGameId}
              onChange={(e) => setFriendGameId(e.target.value)}
              placeholder={t('Enter Game ID to join...')}
              className="w-full p-2 border rounded-md bg-[var(--panel-bg)] border-[var(--border-color)] text-[var(--text-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
        )}

        <div>
          <label htmlFor="time-control-select" className="block text-sm font-medium mb-1">{t('Time Control')}</label>
          <select
            id="time-control-select"
            value={timeControl}
            onChange={(e) => setTimeControl(e.target.value)}
            className="w-full p-2 border rounded-md bg-[var(--panel-bg)] border-[var(--border-color)] text-[var(--text-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="3|0">Blitz 3|0</option>
            <option value="3|2">Blitz 3|2</option>
            <option value="5|0">Blitz 5|0</option>
            <option value="10|0">Rapid 10|0</option>
            <option value="15|10">Rapid 15|10</option>
            <option value="unlimited">Unlimited</option>
          </select>
        </div>

        <button
          onClick={handleStart}
          disabled={waiting}
          className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500 dark:focus-visible:ring-offset-[var(--panel-bg)]"
        >
          {waiting ? t('Waiting for opponent...') : t('Start Game')}
        </button>
      </div>
    </div>
  );
}

export default Home;
