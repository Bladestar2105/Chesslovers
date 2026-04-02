import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useTranslation } from 'react-i18next';

function Replays() {
  const { t } = useTranslation();
  const [games, setGames] = useState([]);
  const [selectedPgn, setSelectedPgn] = useState(null);
  const [chess] = useState(new Chess());
  const [currentFen, setCurrentFen] = useState(chess.fen());
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [error, setError] = useState('');
  const API_URL = import.meta.env.VITE_SOCKET_URL || '';

  useEffect(() => {
    fetch(`${API_URL}/api/replays`)
      .then(res => res.json())
      .then(data => setGames(data))
      .catch(err => console.error("Error fetching replays:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewReplay = (pgn) => {
    setSelectedPgn(pgn);
    setError('');
    chess.reset();
    
    if (pgn && pgn.trim()) {
      try {
        chess.loadPgn(pgn);
        const h = chess.history({ verbose: true });
        setHistory(h);
        chess.reset();
        setHistoryIndex(-1);
        setCurrentFen(chess.fen());
      } catch (e) {
        console.error("PGN parse error:", e);
        setError('Invalid PGN format');
        setHistory([]);
        setHistoryIndex(-1);
      }
    } else {
      setHistory([]);
      setHistoryIndex(-1);
      setCurrentFen(chess.fen());
    }
  };

  const nextMove = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      try {
        chess.move(history[nextIdx]);
        setCurrentFen(chess.fen());
        setHistoryIndex(nextIdx);
      } catch (e) {
        console.error("Error making move:", e);
      }
    }
  };

  const prevMove = () => {
    if (historyIndex >= 0) {
      chess.undo();
      setCurrentFen(chess.fen());
      setHistoryIndex(historyIndex - 1);
    }
  };

  const goToStart = () => {
    chess.reset();
    setCurrentFen(chess.fen());
    setHistoryIndex(-1);
  };

  const goToEnd = () => {
    while (historyIndex < history.length - 1) {
      chess.move(history[historyIndex + 1]);
      setHistoryIndex(prev => prev + 1);
    }
    setCurrentFen(chess.fen());
  };

  if (selectedPgn !== null) {
    return (
      <div className="flex flex-col items-center">
        <h2 className="text-2xl font-bold mb-4">{t('Replay Viewer')}</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <div className="w-full max-w-md shadow-2xl rounded-sm overflow-hidden mb-4 border border-[var(--border-color)]">
          <Chessboard
            position={currentFen}
            arePiecesDraggable={false}
            customDarkSquareStyle={{ backgroundColor: '#779556' }}
            customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
          />
        </div>
        
        {/* Move info */}
        <div className="mb-4 text-center">
          <span className="text-gray-600 dark:text-gray-400">
            Move {historyIndex + 1} of {history.length}
          </span>
          {historyIndex >= 0 && history[historyIndex] && (
            <span className="ml-4 font-mono font-bold">
              {history[historyIndex].san}
            </span>
          )}
        </div>
        
        {/* Navigation buttons */}
        <div className="flex gap-2">
          <button 
            onClick={goToStart} 
            disabled={historyIndex === -1} 
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-bold disabled:opacity-50"
          >
            ⏮ Start
          </button>
          <button 
            onClick={prevMove} 
            disabled={historyIndex === -1} 
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-bold disabled:opacity-50"
          >
            ← Prev
          </button>
          <button 
            onClick={nextMove} 
            disabled={historyIndex === history.length - 1} 
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-bold disabled:opacity-50"
          >
            Next →
          </button>
          <button 
            onClick={goToEnd} 
            disabled={historyIndex === history.length - 1} 
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-bold disabled:opacity-50"
          >
            End ⏭
          </button>
        </div>
        
        <button onClick={() => setSelectedPgn(null)} className="mt-8 text-blue-500 underline hover:text-blue-700">
          {t('Back to list')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto panel p-6 rounded-lg shadow-md">
      <h1 className="text-3xl font-bold mb-6">{t('Finished Games')}</h1>
      {games.length === 0 ? (
        <p className="text-gray-500">No replays available yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="p-3">Date</th>
                <th className="p-3">Time Control</th>
                <th className="p-3">White vs Black</th>
                <th className="p-3">{t('Result')}</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {games.map(g => (
                <tr key={g.id} className="border-b border-[var(--border-color)] hover:bg-gray-100 dark:hover:bg-gray-800 text-[var(--text-color)]">
                  <td className="p-3">{new Date(g.created_at).toLocaleString()}</td>
                  <td className="p-3">{g.time_control}</td>
                  <td className="p-3">{g.is_cpu ? 'Player vs CPU (Lvl ' + g.cpu_level + ')' : 'PvP'}</td>
                  <td className="p-3 font-semibold uppercase">{g.status}</td>
                  <td className="p-3">
                    <button 
                      onClick={() => viewReplay(g.pgn)} 
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      {t('View')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Replays;