const { Chess } = require('chess.js');
const chess = new Chess();
try {
  chess.loadPgn('');
  console.log('empty string res:', true);
} catch (e) {
  console.log('error on empty string:', e.message);
}

try {
  chess.loadPgn('1. e4 e5');
  console.log('valid pgn res:', true);
} catch (e) {
  console.log('error on valid pgn:', e.message);
}

try {
  chess.loadPgn('invalid');
  console.log('invalid pgn res:', true);
} catch (e) {
  console.log('error on invalid pgn:', e.message);
}
