// As fotos de cativeiro e fazenda ficam dentro dos próprios documentos. Listas e consultas que
// não exibem a foto não devem trazê-la: cada uma transferia as imagens inteiras do banco e para o
// navegador (a lista de cativeiros chegava a vários MB). As fotos continuam nas rotas próprias.
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import Cativeiros from '../models/Cativeiros.js';
import Fazendas from '../models/Fazendas.js';
import Aviso from '../models/Aviso.js';
import UsuariosxFazendas from '../models/UsuariosxFazendas.js';
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
let membroToken;
let outroMembroToken;
let masterToken;
const FOTO_CATIVEIRO = Buffer.from('foto-do-cativeiro-de-teste');
const FOTO_FAZENDA = 'data:image/png;base64,Zm90by1kYS1mYXplbmRh';

async function get(path, token) {
  const response = await fetch(`${baseURL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  const tipo = response.headers.get('content-type') || '';
  return {
    status: response.status,
    body: tipo.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()),
  };
}

async function login(email) {
  const response = await fetch(`${baseURL}/users/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: password }),
  });
  return (await response.json()).token;
}

beforeAll(async () => {
  await connectTestDatabase('listas_sem_foto');
  fixtures = await seedFixtures();
  await Cativeiros.updateMany({}, { $set: { foto_cativeiro: FOTO_CATIVEIRO } });
  await Fazendas.updateMany({}, { $set: { foto_sitio: FOTO_FAZENDA } });
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  membroToken = await login(fixtures.users[0].email);
  outroMembroToken = await login(fixtures.users[1].email);
  masterToken = await login(fixtures.users[2].email);
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

const semFotoDeCativeiro = (cativeiro) => {
  assert.ok(cativeiro.nome, 'o cativeiro precisa continuar vindo com os dados');
  assert.equal('foto_cativeiro' in cativeiro, false, `cativeiro ${cativeiro.nome} veio com a foto`);
};
const semFotoDeFazenda = (fazenda) => {
  assert.ok(fazenda.nome, 'a fazenda precisa continuar vindo com os dados');
  assert.equal('foto_sitio' in fazenda, false, `fazenda ${fazenda.nome} veio com a foto`);
};

test('lista de cativeiros (membro e master) vem sem as fotos', async () => {
  const membro = await get('/cativeiros', membroToken);
  assert.equal(membro.status, 200);
  assert.deepEqual(membro.body.map(c => c.nome), ['Viveiro CI 0']);
  membro.body.forEach(semFotoDeCativeiro);
  assert.equal(membro.body[0].fazendaNome, 'Fazenda CI 0');

  const master = await get('/cativeiros', masterToken);
  assert.equal(master.status, 200);
  assert.equal(master.body.length, 2);
  master.body.forEach(semFotoDeCativeiro);
});

test('detalhe do cativeiro vem sem a foto', async () => {
  const detalhe = await get(`/cativeiros/${fixtures.cativeiros[0].id}`, membroToken);
  assert.equal(detalhe.status, 200);
  semFotoDeCativeiro(detalhe.body);
});

test('lista de fazendas (membro e master) vem sem as fotos', async () => {
  const membro = await get('/fazendas', membroToken);
  assert.equal(membro.status, 200);
  assert.deepEqual(membro.body.map(f => f.nome), ['Fazenda CI 0']);
  membro.body.forEach(semFotoDeFazenda);

  const master = await get('/fazendas', masterToken);
  assert.equal(master.status, 200);
  assert.equal(master.body.length, 2);
  master.body.forEach(semFotoDeFazenda);
});

test('notificações e contador só enxergam os cativeiros das fazendas com vínculo ativo', async () => {
  const agora = new Date();
  await Aviso.create({ cativeiro: fixtures.cativeiros[0]._id, tipo: 'ph', mensagem: 'pH fora da faixa',
    periodoInicio: agora, periodoFim: agora });
  const total = async (token) => ({
    lista: (await get('/notifications', token)).body.notifications.length,
    naoVistos: (await get('/notifications/nao-vistos', token)).body.naoVistos,
  });

  assert.deepEqual(await total(membroToken), { lista: 1, naoVistos: 1 });
  assert.deepEqual(await total(outroMembroToken), { lista: 0, naoVistos: 0 });
  assert.deepEqual(await total(masterToken), { lista: 1, naoVistos: 1 });

  // Vínculo desativado: o membro deixa de enxergar os avisos daquela fazenda
  const filtro = { usuario: fixtures.users[0]._id, fazenda: fixtures.fazendas[0]._id };
  await UsuariosxFazendas.updateOne(filtro, { $set: { ativo: false } });
  try {
    assert.deepEqual(await total(membroToken), { lista: 0, naoVistos: 0 });
  } finally {
    await UsuariosxFazendas.updateOne(filtro, { $set: { ativo: true } });
  }
});

test('as rotas próprias das fotos continuam devolvendo as imagens', async () => {
  const fotoCativeiro = await get(`/cativeiros/${fixtures.cativeiros[0].id}/foto`, membroToken);
  assert.equal(fotoCativeiro.status, 200);
  assert.deepEqual(fotoCativeiro.body, FOTO_CATIVEIRO);

  const fotoFazenda = await get(`/fazendas/${fixtures.fazendas[0].id}/foto`, membroToken);
  assert.equal(fotoFazenda.status, 200);
  assert.equal(fotoFazenda.body.foto, FOTO_FAZENDA);
});
