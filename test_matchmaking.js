const { io } = require('socket.io-client');

const socket2 = io('http://localhost:3002');
const socket1 = io('http://localhost:3001');

socket2.on('connect', () => {
  console.log('Socket 2 connected');
  socket2.emit('find_random', { timeControl: '10|0', sessionId: 'sess2', playerName: 'Player2' });
});

socket2.on('waiting_for_opponent', () => {
  console.log('Socket 2 is waiting... joining socket 1');

  // Now connect instance 1 and find match
  socket1.on('connect', () => {
    console.log('Socket 1 connected');
    socket1.emit('find_random', { timeControl: '10|0', sessionId: 'sess1', playerName: 'Player1' });
  });

  socket1.on('game_started_federated', (data) => {
    console.log('Socket 1 federated match found!', data);
    process.exit(0);
  });
});

socket2.on('game_started', (data) => {
  console.log('Socket 2 game started!', data);
});

// Timeout
setTimeout(() => {
  console.log('Timeout waiting for match');
  process.exit(1);
}, 5000);
