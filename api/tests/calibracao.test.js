import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import Cativeiros from '../models/Cativeiros.js';
import Dietas from '../models/Dietas.js';
import DietasxCativeiros from '../models/DietasxCativeiros.js';
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
let otherToken;
let masterToken;
const deviceKeys = {};

// /calibracao/resultado exige credencial: login na etapa "peso" (aplicação) e X-Device-Key
// nas demais (ESP32). O helper envia a credencial certa, salvo com { semCredencial: true }.
async function request(path, { method = 'GET', body, auth, semCredencial = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (path === '/calibracao/resultado' && !semCredencial && !auth) {
    if (body?.etapa === 'peso') auth = masterToken;
    else if (deviceKeys[body?.id_cativeiro]) headers['X-Device-Key'] = deviceKeys[body.id_cativeiro];
  }
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await connectTestDatabase('calibracao');
  fixtures = await seedFixtures();
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  otherToken = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[1].email, senha: password } })).body.token;
  masterToken = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[2].email, senha: password } })).body.token;
  for (const cativeiro of fixtures.cativeiros) {
    deviceKeys[cativeiro.id] = (await request(`/parametros/dispositivos/${cativeiro.id}/chave`, { method: 'POST', auth: masterToken })).body.chave;
  }
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('fluxo completo de calibração do motor: iniciar -> executar -> peso', async () => {
  const pond = fixtures.cativeiros[0].id;

  const iniciar = await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: pond, tipo: 'motor', rotacoes: 10 } });
  assert.equal(iniciar.status, 201);
  assert.deepEqual(iniciar.body.calibracao, { ativa: true, tipo: 'motor', etapa: 'executar', rotacoes: 10 });

  const atual1 = await request(`/calibracao/atual/${pond}`);
  assert.deepEqual(atual1.body, { ativa: true, tipo: 'motor', etapa: 'executar', rotacoes: 10 });

  const executar = await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'executar', rotacoes: 10 } });
  assert.equal(executar.status, 200);
  assert.equal(executar.body.sucesso, true);

  const atual2 = await request(`/calibracao/atual/${pond}`);
  assert.deepEqual(atual2.body, { ativa: true, tipo: 'motor', etapa: 'aguardando_peso', rotacoes: 10 });

  const peso = await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'peso', rotacoes: 10, gramas: 23.7 } });
  assert.equal(peso.status, 200);
  assert.equal(peso.body.sucesso, true);
  assert.equal(peso.body.resultado.gramas_por_rotacao, 2.37);

  assert.deepEqual((await request(`/calibracao/atual/${pond}`)).body, { ativa: false });

  const cativeiro = await Cativeiros.findById(pond).lean();
  assert.equal(cativeiro.gramas_por_rotacao, 2.37);

  const dieta = await Dietas.create({ descricao: 'Dieta teste calibração', quantidade: 25, horarios: ['08:00'] });
  await DietasxCativeiros.create({ cativeiro: pond, dieta: dieta._id, ativo: true });
  const dietaAtual = await request(`/dietas/atual/${pond}`);
  assert.equal(dietaAtual.status, 200);
  assert.equal(dietaAtual.body.gramas_por_rotacao, 2.37);
});

test('rotacoes do peso diferente do guardado é rejeitado (A2)', async () => {
  const pond = fixtures.cativeiros[1].id;
  await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: pond, tipo: 'motor', rotacoes: 5 } });
  await request('/calibracao/resultado', { method: 'POST', body: { id_cativeiro: pond, tipo: 'motor', etapa: 'executar', rotacoes: 5 } });

  const pesoErrado = await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'peso', rotacoes: 7, gramas: 10 } });
  assert.equal(pesoErrado.status, 400);

  const cativeiro = await Cativeiros.findById(pond).lean();
  assert.equal(cativeiro.gramas_por_rotacao, null);

  await request('/calibracao/cancelar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond } });
});

test('fluxo completo de calibração de pH: iniciar -> ph7 -> ph4, sem par inconsistente se cancelado antes (A3)', async () => {
  const pond = fixtures.cativeiros[1].id;

  const iniciar = await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: pond, tipo: 'ph' } });
  assert.equal(iniciar.status, 201);
  assert.deepEqual(iniciar.body.calibracao, { ativa: true, tipo: 'ph', etapa: 'ph7' });

  const ph7 = await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph7', tensao: 2.51 } });
  assert.equal(ph7.status, 200);
  assert.deepEqual((await request(`/calibracao/atual/${pond}`)).body, { ativa: true, tipo: 'ph', etapa: 'ph4' });

  // A3: cancelar com ph7 já reportado não deixa tensao_ph7 gravada no cativeiro (alternativa rígida)
  let cativeiro = await Cativeiros.findById(pond).lean();
  assert.equal(cativeiro.tensao_ph7, null);

  const ph4 = await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph4', tensao: 2.96 } });
  assert.equal(ph4.status, 200);
  assert.deepEqual((await request(`/calibracao/atual/${pond}`)).body, { ativa: false });

  cativeiro = await Cativeiros.findById(pond).lean();
  assert.equal(cativeiro.tensao_ph7, 2.51);
  assert.equal(cativeiro.tensao_ph4, 2.96);
});

test('cancelar antes do ph4 não grava tensao_ph7 no cativeiro', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro isolado calibração pH', id_tipo_camarao: fixtures.condicao.id_tipo_camarao, data_instalacao: new Date(),
  }))._id;

  await request('/calibracao/iniciar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond, tipo: 'ph' } });
  await request('/calibracao/resultado', { method: 'POST', body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph7', tensao: 2.5 } });
  const cancelar = await request('/calibracao/cancelar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond } });
  assert.equal(cancelar.status, 200);

  const cativeiro = await Cativeiros.findById(pond).lean();
  assert.equal(cativeiro.tensao_ph7, null);
  assert.equal(cativeiro.tensao_ph4, null);
  assert.deepEqual((await request(`/calibracao/atual/${pond}`)).body, { ativa: false });
});

test('iniciar com calibração já ativa responde 409', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro duplicidade', id_tipo_camarao: fixtures.condicao.id_tipo_camarao, data_instalacao: new Date(),
  }))._id;
  await request('/calibracao/iniciar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond, tipo: 'motor', rotacoes: 3 } });
  const duplicada = await request('/calibracao/iniciar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond, tipo: 'ph' } });
  assert.equal(duplicada.status, 409);
});

test('resultado com etapa diferente da atual responde 409 e não salva dados', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro etapa errada', id_tipo_camarao: fixtures.condicao.id_tipo_camarao, data_instalacao: new Date(),
  }))._id;
  deviceKeys[pond] = (await request(`/parametros/dispositivos/${pond}/chave`, { method: 'POST', auth: masterToken })).body.chave;
  await request('/calibracao/iniciar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond, tipo: 'ph' } });

  const etapaErrada = await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph4', tensao: 2.96 } });
  assert.equal(etapaErrada.status, 409);

  assert.deepEqual((await request(`/calibracao/atual/${pond}`)).body, { ativa: true, tipo: 'ph', etapa: 'ph7' });
  const cativeiro = await Cativeiros.findById(pond).lean();
  assert.equal(cativeiro.tensao_ph4, null);
});

test('resultado sem calibração ativa responde 409', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro sem calibração', id_tipo_camarao: fixtures.condicao.id_tipo_camarao, data_instalacao: new Date(),
  }))._id;
  deviceKeys[pond] = (await request(`/parametros/dispositivos/${pond}/chave`, { method: 'POST', auth: masterToken })).body.chave;
  const resultado = await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'executar', rotacoes: 1 } });
  assert.equal(resultado.status, 409);
});

test('cancelar sem calibração ativa responde 404', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro cancelar sem ativa', id_tipo_camarao: fixtures.condicao.id_tipo_camarao, data_instalacao: new Date(),
  }))._id;
  const cancelar = await request('/calibracao/cancelar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond } });
  assert.equal(cancelar.status, 404);
});

test('validações de entrada (seção 5)', async () => {
  const pond = fixtures.cativeiros[0].id;

  assert.equal((await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: 'invalido', tipo: 'motor', rotacoes: 10 } })).status, 400);
  assert.equal((await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: pond, tipo: 'invalido' } })).status, 400);
  assert.equal((await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: pond, tipo: 'motor' } })).status, 400, 'rotacoes ausente no motor');
  assert.equal((await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: pond, tipo: 'motor', rotacoes: -1 } })).status, 400, 'rotacoes <= 0');
  assert.equal((await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: new mongoose.Types.ObjectId().toString(), tipo: 'motor', rotacoes: 10 } })).status, 404);

  const semCalibracao = (await request('/calibracao/atual/invalido')).status;
  assert.equal(semCalibracao, 400);

  await request('/calibracao/iniciar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond, tipo: 'ph' } });
  assert.equal((await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph7', tensao: 'abc' } })).status, 400, 'tensao não numérica');
  await request('/calibracao/resultado', { method: 'POST', body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph7', tensao: 2.5 } });
  assert.equal((await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph4', tensao: 3.0 } })).status, 200);
});

test('iniciar e cancelar calibração exigem autenticação e acesso ao cativeiro', async () => {
  const pond = fixtures.cativeiros[0].id;
  assert.equal((await request('/calibracao/iniciar', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', rotacoes: 10 } })).status, 401);
  assert.equal((await request('/calibracao/iniciar', { method: 'POST', auth: otherToken,
    body: { id_cativeiro: pond, tipo: 'motor', rotacoes: 10 } })).status, 403);
});

test('resultado sem credencial é recusado: ESP32 sem chave e pesagem sem login', async () => {
  const pond = fixtures.cativeiros[1].id;
  assert.equal((await request('/calibracao/iniciar', { method: 'POST', auth: masterToken,
    body: { id_cativeiro: pond, tipo: 'motor', rotacoes: 5 } })).status, 201);

  const semChave = await request('/calibracao/resultado', { method: 'POST', semCredencial: true,
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'executar', rotacoes: 5 } });
  assert.equal(semChave.status, 401);
  const chaveErrada = await fetch(`${baseURL}/calibracao/resultado`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Key': 'chave-errada' },
    body: JSON.stringify({ id_cativeiro: pond, tipo: 'motor', etapa: 'executar', rotacoes: 5 }),
  });
  assert.equal(chaveErrada.status, 401);
  assert.deepEqual((await request(`/calibracao/atual/${pond}`)).body, { ativa: true, tipo: 'motor', etapa: 'executar', rotacoes: 5 });

  assert.equal((await request('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'executar', rotacoes: 5 } })).status, 200);
  const pesoSemLogin = await request('/calibracao/resultado', { method: 'POST', semCredencial: true,
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'peso', rotacoes: 5, gramas: 10 } });
  assert.equal(pesoSemLogin.status, 401);

  assert.equal((await request('/calibracao/cancelar', { method: 'POST', auth: masterToken, body: { id_cativeiro: pond } })).status, 200);
});
