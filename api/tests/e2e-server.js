import { once } from 'node:events';
import express from 'express';
import { connectTestDatabase, dropTestDatabase, seedFixtures } from './fixtures.js';
import ParametrosAtuais from '../models/Parametros_atuais.js';

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
// Grava leituras autenticadas com horário passado (ex.: a meia hora antes de um teste), já que os
// avisos analisam médias de 5 min e o navegador só consegue enviar leituras "de agora" pela API.
app.post('/__leituras-anteriores', express.json(), async (req, res) => {
  const leituras = (req.body?.leituras || []).map((l, i) => ({
    id_cativeiro: fixtures.cativeiros[0]._id, autenticada: true, origem: 'dispositivo',
    amostraId: `e2e-anterior-${Date.now()}-${i}`, datahora: new Date(Date.now() - l.minutosAtras * 60_000),
    temp_atual: l.temperatura, ph_atual: l.ph, amonia_atual: l.amonia,
  }));
  await ParametrosAtuais.insertMany(leituras);
  res.status(201).json({ inseridas: leituras.length });
});
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
