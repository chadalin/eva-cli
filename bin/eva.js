#!/usr/bin/env node
const { startRepl } = require('../src/repl');
const args = process.argv.slice(2);

if (args[0] === '--version' || args[0] === '-v') {
    console.log('Eva CLI v1.0.0');
    process.exit(0);
}

startRepl();
