import { startServer } from './net/party/local.mjs';
try {
  const srv = startServer({ port: 5188, count: 8, castSeed: 5, worldSeed: 7, code: 'warm' });
  console.log('started', typeof srv, Object.keys(srv||{}));
  setTimeout(() => { try { srv?.close?.(); srv?.server?.close?.(); } catch {} process.exit(0); }, 500);
} catch (e) {
  console.error('start fail', e);
  process.exit(1);
}