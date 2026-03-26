import { Chess } from 'chess.js';
const chess = new Chess();
try {
  const result = chess.move({ from: 'e2', to: 'e4', promotion: 'q' });
  console.log('Result:', result);
} catch (e) {
  console.log('Error thrown!', e.message);
}
