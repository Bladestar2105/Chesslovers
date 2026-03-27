import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
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

  // Timer state
  const [whiteTime, setWhiteTime] = useState(null);
  const [blackTime, setBlackTime] = useState(null);
  const [lastMoveTime, setLastMoveTime] = useState(null);
  const [timeControl, setTimeControl] = useState('unlimited');

  // Promotion Dialog State
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join_game', { gameId: id, sessionId });

    const onGameJoined = (data) => {
      setSide(data.side);
      chess.load(data.fen);
      setFen(data.fen);
      setIsCpu(data.isCpu);
      setTimeControl(data.timeControl);
      setWhiteTime(data.whiteTime);
      setBlackTime(data.blackTime);
      setLastMoveTime(data.lastMoveTime);
      setWaitingForOpponent(data.isCpu ? false : (data.side === 'w' && !data.lastMoveTime && data.timeControl !== 'unlimited')); // heuristic for waiting
    };

    const onPlayerJoined = () => {
      setWaitingForOpponent(false);
      // Wait for server to send the first move timestamp if not unlimited
    };

    const onMoveMade = (data) => {
      chess.load(data.fen);
      setFen(data.fen);
      if (data.whiteTime !== undefined) setWhiteTime(data.whiteTime);
      if (data.blackTime !== undefined) setBlackTime(data.blackTime);
      if (data.lastMoveTime !== undefined) setLastMoveTime(data.lastMoveTime);
    };

    const onGameOver = ({ reason, winner }) => {
      setStatus(reason);
      if (reason === 'resign') {
        alert(winner === side ? t('You won!') : t('You lost.'));
      } else {
        alert(t('Game Over') + `: ${reason}`);
      }
    };

    const onDrawOffered = () => {
        if (window.confirm(t('Opponent offered a draw. Accept?'))) {
            socket.emit('accept_draw', { gameId: id });
        }
    };

    socket.on('game_joined', onGameJoined);
    socket.on('player_joined', onPlayerJoined);
    socket.on('move_made', onMoveMade);
    socket.on('game_over', onGameOver);
    socket.on('draw_offered', onDrawOffered);

    return () => {
      socket.off('game_joined', onGameJoined);
      socket.off('player_joined', onPlayerJoined);
      socket.off('move_made', onMoveMade);
      socket.off('game_over', onGameOver);
      socket.off('draw_offered', onDrawOffered);
    };
  }, [socket, id, sessionId, chess, side, t]);

  const onDrop = (sourceSquare, targetSquare, piece) => {
    if (typeof sourceSquare === 'object' && sourceSquare !== null && 'sourceSquare' in sourceSquare) {
        targetSquare = sourceSquare.targetSquare;
        piece = sourceSquare.piece;
        sourceSquare = sourceSquare.sourceSquare;
    }

    if (status !== 'active' || chess.turn() !== side) {
      return false;
    }

    const move = {
      from: sourceSquare,
      to: targetSquare,
    };

    // Check for pawn promotion
    const isPawn = piece && piece[1] === 'P';
    const isPromotionRank = (side === 'w' && targetSquare[1] === '8') || (side === 'b' && targetSquare[1] === '1');

    if (isPawn && isPromotionRank) {
      setPendingMove(move);
      setShowPromotionDialog(true);
      return true;
    }

    try {
      // Create a move object
      const moveData = {
          from: sourceSquare,
          to: targetSquare
      };

      // If we're promoting, chess.move expects the promotion piece to be specified
      // Only attach the promotion property if it's a valid promotion move.
      // (The chess.js library throws an exception if you pass promotion for a non-promotion move)
      const possibleMoves = chess.moves({ verbose: true });
      const isPromotionMove = possibleMoves.some(
        (m) => m.from === sourceSquare && m.to === targetSquare && m.promotion
      );

      if (isPromotionMove) {
        moveData.promotion = 'q'; // Default to Queen, promotion dialog overrides this later
      }

      const result = chess.move(moveData);

      if (result) {
        setFen(chess.fen());
        socket.emit('make_move', { gameId: id, move: result, sessionId });
        return true;
      }
    } catch (e) {
      // If the move was invalid, chess.move throws an error
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
                  socket.emit('make_move', { gameId: id, move: result, sessionId });
              }
          } catch(e) {
              console.error("Promotion failed", e);
          }
      }
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

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="flex justify-between w-full max-w-lg mb-2 items-end">
         <div>
             <div className="text-xl font-bold">{t('You')} ({side === 'w' ? t('White') : t('Black')})</div>
             {timeControl !== 'unlimited' && <div className="text-2xl font-mono">{formatTime(myTime)}</div>}
         </div>
         <div className="text-right">
             <div className="text-xl font-bold">{waitingForOpponent ? t('Waiting for opponent...') : (isCpu ? 'CPU' : t('Opponent'))}</div>
             {timeControl !== 'unlimited' && <div className="text-2xl font-mono text-gray-600 dark:text-gray-400">{formatTime(oppTime)}</div>}
         </div>
      </div>

      <div className="w-full max-w-lg shadow-2xl rounded-sm overflow-hidden border border-[var(--border-color)]">
        <Chessboard
          position={fen}
          onPieceDrop={onDrop}
          boardOrientation={side === 'w' ? 'white' : 'black'}
          customDarkSquareStyle={{ backgroundColor: '#779556' }}
          customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
        />
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

      {showPromotionDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="panel p-6 rounded shadow-lg text-center">
                  <h3 className="text-lg font-bold mb-4">{t('Choose Promotion')}</h3>
                  <div className="flex gap-4 justify-center">
                      <button onClick={() => handlePromotionSelection('q')} className="text-4xl hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded">♕</button>
                      <button onClick={() => handlePromotionSelection('r')} className="text-4xl hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded">♖</button>
                      <button onClick={() => handlePromotionSelection('b')} className="text-4xl hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded">♗</button>
                      <button onClick={() => handlePromotionSelection('n')} className="text-4xl hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded">♘</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

export default Game;
