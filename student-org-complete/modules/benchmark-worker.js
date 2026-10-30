const { parentPort } = require('node:worker_threads');
const { runBenchmark } = require('./performance');
// This file runs in a worker, not in the page. postMessage sends the measured
// result back to main.js without making the window wait for the timing loops.
try { parentPort.postMessage({ result: runBenchmark() }); }
catch (error) { parentPort.postMessage({ error: error.message }); }
