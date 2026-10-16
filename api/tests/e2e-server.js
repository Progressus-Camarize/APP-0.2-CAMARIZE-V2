import { once } from 'node:events';
import { connectTestDatabase, dropTestDatabase, seedFixtures } from './fixtures.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'chave-exclusiva-para-testes-locais';
process.env.ENABLE_AUTO_MONITORING = 'false';
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_PUBLIC_KEY;
const { createApp } = await import('../app.js');
await connectTestDatabase('e2e');
const fixtures = await seedFixtures();
const app = createApp();
// Endpoint exclusivo deste executor; não faz parte de app.js nem do servidor de produção.
app.get('/__fixtures', (req, res) => res.json({ cativeiroId: fixtures.cativeiros[0].id }));
const server = app.listen(4100, '127.0.0.1');
await once(server, 'listening');
console.log('API E2E pronta na porta 4100');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await dropTestDatabase();
}
process.once('SIGTERM', () => close().catch(() => process.exit(1)));
process.once('SIGINT', () => close().catch(() => process.exit(1)));
