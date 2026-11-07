import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import Dietas from '../models/Dietas.js';
import DietasxCativeiros from '../models/DietasxCativeiros.js';
import Alimentacoes from '../models/Alimentacoes.js';
import { resumoAlimentacaoDoDia, hojeEmBrasilia } from '../services/alimentacaoService.js';
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

async function request(path, { method = 'GET', body, auth } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

const login = async (email) =>
  (await request('/users/auth', { method: 'POST', body: { email, senha: password } })).body.token;

// 12:00 em Brasília (UTC-3)
const MEIO_DIA = new Date('2026-11-06T15:00:00Z');

beforeAll(async () => {
  await connectTestDatabase('alimentacao_resumo');
  fixtures = await seedFixtures();
  const [pondA] = fixtures.cativeiros;
  const dieta = await Dietas.create({ descricao: 'Engorda', quantidade: 20, horarios: ['15:30', '08:00'], cativeiro: pondA._id });
  await DietasxCativeiros.create({ cativeiro: pondA._id, dieta: dieta._id, ativo: true });
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('resumo do dia soma o servido e aponta o próximo horário', async () => {
  const [pondA, pondB] = fixtures.cativeiros.map(c => c._id);
  await Alimentacoes.create({ cativeiro: pondA, data: '2026-11-06', horario: '08:00', status: 'servida', gramas: 19.5 });

  const resumos = await resumoAlimentacaoDoDia([pondA, pondB], MEIO_DIA);
  const a = resumos.get(String(pondA));
  assert.deepEqual(a.dieta, { descricao: 'Engorda', quantidade: 20, horarios: ['08:00', '15:30'] });
  assert.equal(a.gramasPrevistas, 40);
  assert.equal(a.gramasServidas, 19.5);
  assert.equal(a.refeicoesServidas, 1);
  assert.equal(a.refeicoesPrevistas, 2);
  assert.deepEqual(a.proximo, { horario: '15:30', amanha: false });

  // Depois do último horário, o próximo é o primeiro de amanhã
  const noite = await resumoAlimentacaoDoDia([pondA], new Date('2026-11-06T22:00:00Z'));
  assert.deepEqual(noite.get(String(pondA)).proximo, { horario: '08:00', amanha: true });

  // Cativeiro sem dieta
  assert.deepEqual(resumos.get(String(pondB)), {
    dieta: null, gramasPrevistas: 0, gramasServidas: 0, refeicoesServidas: 0, refeicoesPrevistas: 0, proximo: null,
  });
});

test('GET /alimentacoes/hoje traz só os cativeiros do usuário; /cativeiros-status inclui o resumo', async () => {
  const [pondA, pondB] = fixtures.cativeiros.map(c => String(c._id));
  const token = await login('membro-a@example.invalid');

  const hoje = await request('/alimentacoes/hoje', { auth: token });
  assert.equal(hoje.status, 200);
  assert.equal(hoje.body.data, hojeEmBrasilia());
  assert.deepEqual(Object.keys(hoje.body.cativeiros), [pondA]);
  assert.equal(hoje.body.cativeiros[pondA].gramasPrevistas, 40);
  assert.ok(!hoje.body.cativeiros[pondB]);

  const status = await request('/cativeiros-status', { auth: token });
  assert.equal(status.status, 200);
  assert.equal(status.body.cativeiros[0].alimentacao.dieta.quantidade, 20);

  assert.equal((await request('/alimentacoes/hoje')).status, 401);
});
