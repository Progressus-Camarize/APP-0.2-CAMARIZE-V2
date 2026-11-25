// Leituras guardadas pela placa durante uma queda de internet: horário da medição (ts)
// em POST /parametros/cadastrar e envio em lote em POST /parametros/lote.
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import ParametrosAtuais from '../models/Parametros_atuais.js';
import parametrosEmitter from '../services/parametrosEmitter.js';
import { connectTestDatabase, dropTestDatabase, password, seedFixtures } from './fixtures.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'chave-exclusiva-para-testes-locais';
process.env.ENABLE_AUTO_MONITORING = 'false';
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_PUBLIC_KEY;
const { createApp } = await import('../app.js');

let server;
let baseURL;
let fixtures;
let pond;
let pondSemChave;
let chave;

const segundos = ms => Math.floor(ms / 1000);
const minutosAtras = min => segundos(Date.now() - min * 60_000);

async function placa(path, body, { deviceKey = chave } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (deviceKey) headers['X-Device-Key'] = deviceKey;
  const response = await fetch(`${baseURL}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await connectTestDatabase('lote');
  fixtures = await seedFixtures();
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseURL}/users/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixtures.users[2].email, senha: password }),
  });
  const token = (await login.json()).token;
  pond = fixtures.cativeiros[0].id;
  pondSemChave = fixtures.cativeiros[1].id;
  const gerada = await fetch(`${baseURL}/parametros/dispositivos/${pond}/chave`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  chave = (await gerada.json()).chave;
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('leitura com ts fica no horário em que a placa mediu', async () => {
  const ts = minutosAtras(42);
  const resposta = await placa('/parametros/cadastrar',
    { id_cativeiro: pond, temperatura: 26, ph: 7, amonia: 0.4, amostraId: 'ts-1', ts });
  assert.equal(resposta.status, 201);
  assert.equal(new Date(resposta.body.data.datahora).getTime(), ts * 1000);
});

test('ts inválido, no futuro ou antigo demais é recusado', async () => {
  const base = { id_cativeiro: pond, temperatura: 26, ph: 7, amonia: 0.4 };
  for (const ts of ['1795000000', 1795000000.5, minutosAtras(-10), minutosAtras(31 * 24 * 60)]) {
    const resposta = await placa('/parametros/cadastrar', { ...base, ts });
    assert.equal(resposta.status, 400, `ts ${ts} deveria ser recusado`);
  }
  // Relógio da placa um pouco adiantado ainda é aceito
  assert.equal((await placa('/parametros/cadastrar', { ...base, amostraId: 'ts-2', ts: minutosAtras(-2) })).status, 201);
  // Remove para não ser a "mais recente" nos testes seguintes
  await ParametrosAtuais.deleteOne({ id_cativeiro: pond, amostraId: 'ts-2' });
});

test('sem chave o ts é ignorado: vale o horário de chegada', async () => {
  const antes = Date.now();
  const resposta = await placa('/parametros/cadastrar',
    { id_cativeiro: pondSemChave, temperatura: 26, ph: 7, amonia: 0.4, ts: minutosAtras(60) }, { deviceKey: null });
  assert.equal(resposta.status, 201);
  assert.equal(resposta.body.data.origem, 'legado');
  assert.ok(new Date(resposta.body.data.datahora).getTime() >= antes - 1000);
});

test('lote exige chave e uma lista de 1 a 100 leituras', async () => {
  const leitura = { ts: minutosAtras(5), amostraId: 'l-0', temperatura: 26, ph: 7, amonia: 0.4 };
  assert.equal((await placa('/parametros/lote', { id_cativeiro: pond, leituras: [leitura] }, { deviceKey: null })).status, 401);
  assert.equal((await placa('/parametros/lote', { id_cativeiro: pond, leituras: [leitura] }, { deviceKey: 'errada' })).status, 401);
  // Cativeiro sem chave gerada também não envia lote (horário retroativo só com chave)
  assert.equal((await placa('/parametros/lote', { id_cativeiro: pondSemChave, leituras: [leitura] }, { deviceKey: null })).status, 401);
  assert.equal((await placa('/parametros/lote', { id_cativeiro: pond, leituras: [] })).status, 400);
  assert.equal((await placa('/parametros/lote', { id_cativeiro: pond, leituras: leitura })).status, 400);
  const muitas = Array.from({ length: 101 }, (_, i) => ({ ...leitura, amostraId: `l-${i}` }));
  assert.equal((await placa('/parametros/lote', { id_cativeiro: pond, leituras: muitas })).status, 400);
  assert.equal((await placa('/parametros/lote', { id_cativeiro: new mongoose.Types.ObjectId().toString(), leituras: [leitura] })).status, 404);
});

test('lote grava cada leitura no seu horário, recusa só as inválidas e não duplica no reenvio', async () => {
  const leituras = [
    { ts: minutosAtras(120), amostraId: 'q-120', temperatura: 26.1, ph: 7.1, amonia: 0.41 },
    { ts: minutosAtras(119), amostraId: 'q-119', temperatura: 26.2, ph: 7.2, amonia: 0.42 },
    { ts: minutosAtras(31 * 24 * 60), amostraId: 'q-velha', temperatura: 26, ph: 7, amonia: 0.4 },
    { ts: minutosAtras(118), temperatura: 26, ph: 7, amonia: 0.4 },
    { ts: minutosAtras(117), amostraId: 'q-117', temperatura: 99, ph: 7, amonia: 0.4 },
    { ts: minutosAtras(116), amostraId: 'q-116', temperatura: 26.3, ph: 7.3, amonia: 0.43 },
    // Mesma amostra duas vezes no lote: entra uma vez
    { ts: minutosAtras(116), amostraId: 'q-116', temperatura: 26.3, ph: 7.3, amonia: 0.43 },
  ];

  let avisosDashboard = 0;
  const contar = () => { avisosDashboard += 1; };
  parametrosEmitter.on(`parametro:${pond}`, contar);
  try {
    const primeira = await placa('/parametros/lote', { id_cativeiro: pond, leituras });
    assert.equal(primeira.status, 200);
    assert.equal(primeira.body.recebidas, 7);
    assert.equal(primeira.body.inseridas, 3);
    assert.equal(primeira.body.repetidas, 1);
    assert.deepEqual(primeira.body.rejeitadas.map(r => r.indice), [2, 3, 4]);
    // O dashboard é avisado uma vez por lote, não por leitura
    assert.equal(avisosDashboard, 1);

    // A placa não recebeu a resposta e reenviou o mesmo lote
    const reenvio = await placa('/parametros/lote', { id_cativeiro: pond, leituras });
    assert.equal(reenvio.status, 200);
    assert.equal(reenvio.body.inseridas, 0);
    assert.equal(reenvio.body.repetidas, 4);
    assert.equal(avisosDashboard, 1);
  } finally {
    parametrosEmitter.off(`parametro:${pond}`, contar);
  }

  const gravadas = await ParametrosAtuais.find({ id_cativeiro: pond, amostraId: /^q-/ }).sort({ datahora: 1 }).lean();
  assert.deepEqual(gravadas.map(g => [g.amostraId, g.datahora.getTime(), g.temp_atual, g.origem, g.autenticada]), [
    ['q-120', leituras[0].ts * 1000, 26.1, 'dispositivo', true],
    ['q-119', leituras[1].ts * 1000, 26.2, 'dispositivo', true],
    ['q-116', leituras[5].ts * 1000, 26.3, 'dispositivo', true],
  ]);
});

test('lote antigo não passa à frente da leitura mais recente no painel', async () => {
  const atual = await placa('/parametros/cadastrar',
    { id_cativeiro: pond, temperatura: 27.5, ph: 7.4, amonia: 0.5, amostraId: 'agora', ts: minutosAtras(0) });
  assert.equal(atual.status, 201);
  await placa('/parametros/lote', { id_cativeiro: pond,
    leituras: [{ ts: minutosAtras(300), amostraId: 'q-300', temperatura: 20, ph: 6, amonia: 1 }] });
  const ultima = await ParametrosAtuais.findOne({ id_cativeiro: pond }).sort({ datahora: -1 }).lean();
  assert.equal(ultima.amostraId, 'agora');
});
