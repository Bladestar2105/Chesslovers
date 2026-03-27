const { Chess } = require('chess.js');
const chess = new Chess();
try {
  const res = chess.loadPgn('');
  console.log('empty string res:', res);
} catch (e) {
  console.log('error on empty string:', e.message);
}

try {
  const res2 = chess.loadPgn('1. e4 e5');
  console.log('valid pgn res:', res2);
} catch (e) {
  console.log('error on valid pgn:', e.message);
}

try {
  const res3 = chess.loadPgn('invalid');
  console.log('invalid pgn res:', res3);
} catch (e) {
  console.log('error on invalid pgn:', e.message);
}
