import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard, ChessboardDnDProvider } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useTranslation } from 'react-i18next';

function Game({ socket, sessionId }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [side, setSide] = useState('w');
  const [status, setStatus] = useState('active');
  const [waitingForOpponent, setWaitingForOpponent] = useState(true);
  const [isCpu, setIsCpu] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  const [gameResult, setGameResult] = useState(null);
  const [isInCheck, setIsInCheck] = useState(false);

  // Timer state
  const [whiteTime, setWhiteTime] = useState(null);
  const [blackTime, setBlackTime] = useState(null);
  const [lastMoveTime, setLastMoveTime] = useState(null);
  const [timeControl, setTimeControl] = useState('unlimited');

  // Promotion Dialog State
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  
  // Ref for auto-scrolling move history
  const moveListRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join_game', { gameId: id, sessionId });

    const onGameJoined = (data) => {
      setSide(data.side);
      if (data.pgn) {
        chess.loadPgn(data.pgn);
      } else {
        chess.load(data.fen);
      }
      setFen(data.fen);
      setIsCpu(data.isCpu);
      setTimeControl(data.timeControl);
      setWhiteTime(data.whiteTime);
      setBlackTime(data.blackTime);
      setLastMoveTime(data.lastMoveTime);
      setWaitingForOpponent(data.isCpu ? false : (data.side === 'w' && !data.lastMoveTime && data.timeControl !== 'unlimited'));
      
      // Update move history from PGN
      if (data.pgn) {
        try {
          setMoveHistory(chess.history({ verbose: true }));
        } catch (e) {
          console.error('Error getting history:', e);
        }
      }
    };

    const onPlayerJoined = () => {
      setWaitingForOpponent(false);
    };

    const onMoveMade = (data) => {
      chess.loadPgn(data.pgn);
      setFen(data.fen);
      if (data.whiteTime !== undefined) setWhiteTime(data.whiteTime);
      if (data.blackTime !== undefined) setBlackTime(data.blackTime);
      if (data.lastMoveTime !== undefined) setLastMoveTime(data.lastMoveTime);
      
      // Update check status
      setIsInCheck(chess.isCheck());
      
      // Update move history
      setMoveHistory(chess.history({ verbose: true }));
    };

    const onGameOver = ({ reason, winner }) => {
      setStatus(reason);
      setGameResult({ reason, winner });
      setIsInCheck(false);
      
      let message = '';
      if (reason === 'resign') {
        message = winner === side ? t('You won! Opponent resigned.') : t('You lost. You resigned.');
      } else if (reason === 'timeout') {
        message = winner === side ? t('You won on time!') : t('You lost on time.');
      } else if (reason === 'mate') {
        message = winner === side ? t('Checkmate! You won!') : t('Checkmate! You lost.');
      } else if (reason === 'stalemate') {
        message = t('Stalemate! Draw.');
      } else if (reason === 'draw') {
        message = t('Draw!');
      } else {
        message = t('Game Over') + `: ${reason}`;
      }
      
      // Show result after a small delay to let the last move render
      setTimeout(() => alert(message), 100);
    };

    const onDrawOffered = () => {
      if (window.confirm(t('Opponent offered a draw. Accept?'))) {
        socket.emit('accept_draw', { gameId: id });
      }
    };

    const onError = (error) => {
      console.error('Socket error:', error);
    };

    socket.on('game_joined', onGameJoined);
    socket.on('player_joined', onPlayerJoined);
    socket.on('move_made', onMoveMade);
    socket.on('game_over', onGameOver);
    socket.on('draw_offered', onDrawOffered);
    socket.on('error', onError);

    return () => {
      socket.off('game_joined', onGameJoined);
      socket.off('player_joined', onPlayerJoined);
      socket.off('move_made', onMoveMade);
      socket.off('game_over', onGameOver);
      socket.off('draw_offered', onDrawOffered);
      socket.off('error', onError);
    };
  }, [socket, id, sessionId, chess, side, t]);

  // Auto-scroll move history
  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [moveHistory]);

  // Helper function to check if a move is a promotion move
  const isPromotionMove = useCallback((from, to) => {
    const possibleMoves = chess.moves({ verbose: true });
    return possibleMoves.some(m => m.from === from && m.to === to && m.promotion);
  }, [chess]);

  const onDrop = (sourceSquare, targetSquare, piece) => {
    console.log('onDrop called:', { sourceSquare, targetSquare, piece, turn: chess.turn(), side, status });
    
    if (status !== 'active') {
      console.log('Game not active');
      return false;
    }
    
    if (chess.turn() !== side) {
      console.log('Not your turn');
      return false;
    }

    const move = {
      from: sourceSquare,
      to: targetSquare,
    };

    // Check if this is a promotion move using chess.js verbose moves
    if (isPromotionMove(sourceSquare, targetSquare)) {
      setPendingMove(move);
      setShowPromotionDialog(true);
      return true;
    }

    try {
      const result = chess.move(move);
      console.log('Move result:', result);

      if (result) {
        setFen(chess.fen());
        setIsInCheck(chess.isCheck());
        socket.emit('make_move', { gameId: id, move: result, sessionId });
        return true;
      }
    } catch (e) {
      console.error("Move error:", e.message);
      return false;
    }
    return false;
  };

  const handlePromotionSelection = (promotionPiece) => {
    if (pendingMove) {
      try {
        const result = chess.move({ ...pendingMove, promotion: promotionPiece });
        if (result) {
          setFen(chess.fen());
          setIsInCheck(chess.isCheck());
          socket.emit('make_move', { gameId: id, move: result, sessionId });
        }
      } catch (e) {
        console.error("Promotion failed", e);
        setFen(chess.fen());
      }
    }
    setShowPromotionDialog(false);
    setPendingMove(null);
  };

  const handlePromotionCancel = () => {
    setFen(chess.fen());
    setShowPromotionDialog(false);
    setPendingMove(null);
  };

  const handleResign = () => {
    if (window.confirm(t('Are you sure you want to resign?'))) {
      socket.emit('resign', { gameId: id, sessionId });
    }
  };

  const handleDrawOffer = () => {
    socket.emit('offer_draw', { gameId: id, sessionId });
    alert(t('Draw offer sent.'));
  };

  // Timer effect
  useEffect(() => {
    if (status !== 'active' || timeControl === 'unlimited' || !lastMoveTime || waitingForOpponent) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastMoveTime) / 1000;
      const turn = chess.turn();

      if (turn === 'w') {
        setWhiteTime(prev => Math.max(0, prev - elapsed));
      } else {
        setBlackTime(prev => Math.max(0, prev - elapsed));
      }
      setLastMoveTime(now);
    }, 100);

    return () => clearInterval(interval);
  }, [status, timeControl, lastMoveTime, waitingForOpponent, chess]);

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}${seconds < 10 ? '.' + ms : ''}`;
  };

  const myTime = side === 'w' ? whiteTime : blackTime;
  const oppTime = side === 'w' ? blackTime : whiteTime;

  // Get custom square styles for check highlight
  const getCustomSquareStyles = useCallback(() => {
    if (isInCheck && status === 'active') {
      const turn = chess.turn();
      const kingSquare = chess.board().flat().find(p => p && p.type === 'k' && p.color === turn);
      if (kingSquare) {
        return {
          [kingSquare.square]: {
            backgroundColor: 'rgba(255, 0, 0, 0.5)',
            borderRadius: '50%'
          }
        };
      }
    }
    return {};
  }, [isInCheck, chess, status]);

  // Format move for display
  const formatMoves = () => {
    const pairs = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = moveHistory[i]?.san || '';
      const blackMove = moveHistory[i + 1]?.san || '';
      pairs.push({ moveNum, whiteMove, blackMove });
    }
    return pairs;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
      {/* Main game area */}
      <div className="flex flex-col items-center space-y-4">
        <div className="flex justify-between w-full max-w-lg mb-2 items-end">
          <div>
            <div className="text-xl font-bold">
              {t('You')} ({side === 'w' ? t('White') : t('Black')})
              {isInCheck && chess.turn() === side && status === 'active' && (
                <span className="ml-2 text-red-500 font-bold">{t('CHECK!')}</span>
              )}
            </div>
            {timeControl !== 'unlimited' && (
              <div className={`text-2xl font-mono ${myTime < 30 ? 'text-red-500' : ''}`}>
                {formatTime(myTime)}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xl font-bold">
              {waitingForOpponent ? t('Waiting for opponent...') : (isCpu ? 'CPU' : t('Opponent'))}
              {isInCheck && chess.turn() !== side && status === 'active' && (
                <span className="ml-2 text-red-500 font-bold">{t('CHECK!')}</span>
              )}
            </div>
            {timeControl !== 'unlimited' && (
              <div className={`text-2xl font-mono text-gray-600 dark:text-gray-400 ${oppTime < 30 ? 'text-red-500' : ''}`}>
                {formatTime(oppTime)}
              </div>
            )}
          </div>
        </div>

        {/* Game status banner */}
        {gameResult && (
          <div className={`w-full max-w-lg p-4 rounded text-center text-xl font-bold ${
            gameResult.winner === side 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' 
              : gameResult.winner === null 
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
          }`}>
            {gameResult.reason === 'mate' && (gameResult.winner === side ? t('Checkmate! You win!') : t('Checkmate! You lose.'))}
            {gameResult.reason === 'stalemate' && t('Stalemate - Draw')}
            {gameResult.reason === 'draw' && t('Draw')}
            {gameResult.reason === 'resign' && (gameResult.winner === side ? t('Opponent resigned. You win!') : t('You resigned.'))}
            {gameResult.reason === 'timeout' && (gameResult.winner === side ? t('Opponent ran out of time. You win!') : t('You ran out of time.'))}
          </div>
        )}

        <div className="w-full max-w-lg shadow-2xl rounded-sm overflow-hidden border border-[var(--border-color)]">
          <ChessboardDnDProvider>
            <Chessboard
              position={fen}
              onPieceDrop={onDrop}
              boardOrientation={side === 'w' ? 'white' : 'black'}
              customDarkSquareStyle={{ backgroundColor: '#779556' }}
              customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
              customSquareStyles={getCustomSquareStyles()}
            />
          </ChessboardDnDProvider>
        </div>

        <div className="flex gap-4 w-full max-w-lg mt-4">
          <button
            onClick={handleResign}
            disabled={status !== 'active'}
            className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded disabled:opacity-50"
          >
            {t('Resign')}
          </button>
          <button
            onClick={handleDrawOffer}
            disabled={status !== 'active' || waitingForOpponent}
            className="flex-1 py-2 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded disabled:opacity-50"
          >
            {t('Offer Draw')}
          </button>
        </div>

        <div className="mt-4 text-center text-sm text-gray-500 w-full max-w-lg break-all">
          Game Link: {window.location.href}
        </div>
      </div>

      {/* Move history panel */}
      <div className="panel p-4 rounded-lg shadow-md w-full max-w-xs">
        <h3 className="text-lg font-bold mb-2 border-b border-[var(--border-color)] pb-2">
          {t('Moves')}
        </h3>
        <div 
          ref={moveListRef}
          className="h-64 overflow-y-auto text-sm font-mono"
        >
          {moveHistory.length === 0 ? (
            <p className="text-gray-500 italic">{t('No moves yet')}</p>
          ) : (
            <table className="w-full">
              <tbody>
                {formatMoves().map(({ moveNum, whiteMove, blackMove }) => (
                  <tr key={moveNum} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                    <td className="py-1 px-2 text-gray-500 w-8">{moveNum}.</td>
                    <td className="py-1 px-2">{whiteMove}</td>
                    <td className="py-1 px-2">{blackMove}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Promotion dialog */}
      {showPromotionDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="panel p-6 rounded shadow-lg text-center">
            <h3 className="text-lg font-bold mb-4">{t('Choose Promotion')}</h3>
            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => handlePromotionSelection('q')} 
                className="text-4xl hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded"
              >
                {side === 'w' ? '♕' : '♛'}
              </button>
              <button 
                onClick={() => handlePromotionSelection('r')} 
                className="text-4xl hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded"
              >
                {side === 'w' ? '♖' : '♜'}
              </button>
              <button 
                onClick={() => handlePromotionSelection('b')} 
                className="text-4xl hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded"
              >
                {side === 'w' ? '♗' : '♝'}
              </button>
              <button 
                onClick={() => handlePromotionSelection('n')} 
                className="text-4xl hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded"
              >
                {side === 'w' ? '♘' : '♞'}
              </button>
            </div>
            <button
              onClick={handlePromotionCancel}
              className="mt-4 px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 rounded"
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Game;