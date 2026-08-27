import { startServer } from './net/party/local.mjs';
startServer({ port: 5181 });
console.log('prime time room on ws://localhost:5181');
