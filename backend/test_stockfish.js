const { exec } = require('child_process');
const path = require('path');

const enginePath = path.join(__dirname, 'node_modules', 'stockfish', 'bin', 'stockfish-18-single.js');
const proc = exec(`node ${enginePath}`);

proc.stdout.on('data', (data) => {
    console.log("OUT", data.toString());
});

proc.stderr.on('data', (data) => {
    console.error("ERR", data.toString());
});

proc.stdin.write('uci\n');

setTimeout(() => {
    proc.kill();
}, 2000);
