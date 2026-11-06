import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import Cativeiros from '../models/Cativeiros.js';
import Dietas from '../models/Dietas.js';
import DietasxCativeiros from '../models/DietasxCativeiros.js';
import { migrarDietasPorCativeiro } from '../services/dietaService.js';
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
let master;

async function request(path, { method = 'GET', body, auth = master } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await connectTestDatabase('dietas_cativeiro');
  fixtures = await seedFixtures();
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  master = (await request('/users/auth', { method: 'POST', auth: null,
    body: { email: fixtures.users[2].email, senha: password } })).body.token;
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('master define, edita e remove a dieta de um cativeiro direto', async () => {
  const pond = String(fixtures.cativeiros[0]._id);

  const invalida = await request(`/dietas/cativeiro/${pond}`, { method: 'PUT', body: { quantidade: 10, horarios: ['25:00'] } });
  assert.equal(invalida.status, 400);
  assert.equal((await request(`/dietas/cativeiro/${new mongoose.Types.ObjectId()}`, { method: 'PUT',
    body: { quantidade: 10, horarios: ['08:00'] } })).status, 404);

  const criada = await request(`/dietas/cativeiro/${pond}`, { method: 'PUT',
    body: { descricao: 'Engorda', quantidade: 20, horarios: ['17:00', '08:00'] } });
  assert.equal(criada.status, 200);
  assert.deepEqual(criada.body.horarios, ['08:00', '17:00'], 'horários em ordem');
  assert.equal(criada.body.quantidadeRefeicoes, 2);
  assert.equal(String((await Dietas.findById(criada.body._id).lean()).cativeiro), pond);

  const placa = await request(`/dietas/atual/${pond}`, { auth: null });
  assert.equal(placa.body.quantidade, 20);
  assert.deepEqual(placa.body.horarios, ['08:00', '17:00']);

  // Editar mantém a mesma dieta (é do cativeiro)
  const editada = await request(`/dietas/cativeiro/${pond}`, { method: 'PUT', body: { quantidade: 30, horarios: ['09:00'] } });
  assert.equal(String(editada.body._id), String(criada.body._id));
  assert.equal((await request(`/dietas/atual/${pond}`, { auth: null })).body.quantidade, 30);

  const removida = await request(`/dietas/cativeiro/${pond}`, { method: 'DELETE' });
  assert.equal(removida.status, 200);
  assert.equal((await request(`/dietas/atual/${pond}`, { auth: null })).status, 404, 'a placa para de alimentar');
  assert.equal(await Dietas.countDocuments({ _id: criada.body._id }), 0, 'não sobra dieta solta');
  assert.equal((await request(`/dietas/cativeiro/${pond}`, { method: 'DELETE' })).status, 404);
});

test('visão por fazenda: cada fazenda com os cativeiros e a dieta de cada um', async () => {
  const [pondA, pondB] = fixtures.cativeiros.map(c => String(c._id));
  await request(`/dietas/cativeiro/${pondA}`, { method: 'PUT', body: { descricao: 'A', quantidade: 12, horarios: ['07:00'] } });
  const solto = await Cativeiros.create({ nome: 'Viveiro sem fazenda', id_tipo_camarao: fixtures.condicao.id_tipo_camarao,
    data_instalacao: new Date(), condicoes_ideais: fixtures.condicao._id });

  const visao = await request('/dietas/fazendas');
  assert.equal(visao.status, 200);
  const fazendaA = visao.body.find(f => String(f._id) === String(fixtures.fazendas[0]._id));
  assert.deepEqual(fazendaA.cativeiros.map(c => [String(c._id), c.dieta?.quantidade ?? null]), [[pondA, 12]]);
  const fazendaB = visao.body.find(f => String(f._id) === String(fixtures.fazendas[1]._id));
  assert.deepEqual(fazendaB.cativeiros.map(c => [String(c._id), c.dieta]), [[pondB, null]]);
  const semFazenda = visao.body.find(f => f._id === null);
  assert.deepEqual(semFazenda.cativeiros.map(c => String(c._id)), [String(solto._id)]);
  assert.ok(!JSON.stringify(visao.body).includes('foto'), 'sem fotos na resposta');

  await DietasxCativeiros.deleteMany({});
  await Dietas.deleteMany({});
  await Cativeiros.deleteOne({ _id: solto._id });
});

test('migração: dieta compartilhada vira uma por cativeiro e as soltas são apagadas', async () => {
  const [pondA, pondB] = fixtures.cativeiros.map(c => c._id);
  const pondC = (await Cativeiros.create({ nome: 'Viveiro C', id_tipo_camarao: fixtures.condicao.id_tipo_camarao,
    data_instalacao: new Date(), condicoes_ideais: fixtures.condicao._id }))._id;
  const compartilhada = await Dietas.create({ descricao: 'Padrão', quantidade: 25, horarios: ['08:00', '17:00'], quantidadeRefeicoes: 2 });
  const antiga = await Dietas.create({ descricao: 'Antiga de C', quantidade: 5, horarios: ['06:00'] });
  const solta = await Dietas.create({ descricao: 'Nunca usada', quantidade: 9, horarios: ['10:00'] });
  const historica = await Dietas.create({ descricao: 'Só histórico', quantidade: 7, horarios: ['11:00'] });
  const ligacoes = await DietasxCativeiros.create([
    { cativeiro: pondA, dieta: compartilhada._id, ativo: true },
    { cativeiro: pondB, dieta: compartilhada._id, ativo: true },
    // C tem duas ligações ativas (dado antigo): vale a mais recente, a compartilhada
    { cativeiro: pondC, dieta: antiga._id, ativo: true },
    { cativeiro: pondC, dieta: compartilhada._id, ativo: true },
    { cativeiro: pondA, dieta: historica._id, ativo: false },
  ]);
  // O save do modelo grava atualizadoEm = agora; as datas de cada ligação vão depois
  for (const [i, segundos] of [3, 2, 5, 1, 9].entries()) {
    await DietasxCativeiros.updateOne({ _id: ligacoes[i]._id }, { $set: { atualizadoEm: new Date(Date.now() - segundos * 1000) } });
  }
  const antes = await Promise.all([pondA, pondB, pondC].map(p => request(`/dietas/atual/${p}`, { auth: null })));

  // Simulação: relata e não grava nada
  const simulacao = await migrarDietasPorCativeiro();
  assert.equal(simulacao.copias.length, 2);
  assert.equal(simulacao.ligacoesDuplicadasDesativadas.length, 1);
  assert.deepEqual(simulacao.dietasApagadas.map(d => d.descricao).sort(), ['Antiga de C', 'Nunca usada', 'Só histórico']);
  assert.equal(await Dietas.countDocuments(), 4);
  assert.equal(await DietasxCativeiros.countDocuments({ ativo: true }), 4);

  const aplicada = await migrarDietasPorCativeiro({ aplicar: true });
  assert.equal(aplicada.copias.length, 2);

  const depois = await Promise.all([pondA, pondB, pondC].map(p => request(`/dietas/atual/${p}`, { auth: null })));
  const ids = depois.map(r => String(r.body.dietaId));
  assert.equal(new Set(ids).size, 3, 'cada cativeiro com a própria dieta');
  for (const [i, r] of depois.entries()) {
    assert.equal(r.body.quantidade, antes[i].body.quantidade, 'o alimentador continua igual');
    assert.deepEqual(r.body.horarios, antes[i].body.horarios);
  }
  for (const [i, pond] of [pondA, pondB, pondC].entries()) {
    assert.equal(String((await Dietas.findById(ids[i]).lean()).cativeiro), String(pond));
  }
  assert.equal(await Dietas.countDocuments({ _id: { $in: [antiga._id, solta._id, historica._id] } }), 0);
  assert.equal(await DietasxCativeiros.countDocuments({ dieta: historica._id }), 0);
  assert.equal(await DietasxCativeiros.countDocuments({ ativo: true }), 3);

  // Rodar de novo não muda nada
  const denovo = await migrarDietasPorCativeiro({ aplicar: true });
  assert.equal(denovo.copias.length + denovo.dietasApagadas.length + denovo.donosDefinidos, 0);
});

test('migração: ligações de cativeiro já excluído são apagadas e a dieta dele vira solta', async () => {
  await DietasxCativeiros.deleteMany({});
  await Dietas.deleteMany({});
  const pondA = fixtures.cativeiros[0]._id;
  const excluido = new mongoose.Types.ObjectId();
  const daExcluida = await Dietas.create({ descricao: 'Do excluído', quantidade: 20, horarios: ['12:00'] });
  const daA = await Dietas.create({ descricao: 'Do A', quantidade: 15, horarios: ['08:00'] });
  await DietasxCativeiros.create([
    { cativeiro: excluido, dieta: daExcluida._id, ativo: true },
    { cativeiro: excluido, dieta: new mongoose.Types.ObjectId(), ativo: true },
    { cativeiro: pondA, dieta: daA._id, ativo: true },
  ]);

  const simulacao = await migrarDietasPorCativeiro();
  assert.equal(simulacao.ligacoesDeCativeiroExcluido.length, 2);
  assert.equal(simulacao.ligacoesSemDieta.length, 0);
  assert.deepEqual(simulacao.dietasApagadas.map(d => d.descricao), ['Do excluído']);

  await migrarDietasPorCativeiro({ aplicar: true });
  assert.equal(await DietasxCativeiros.countDocuments({ cativeiro: excluido }), 0);
  assert.equal(await Dietas.countDocuments({ _id: daExcluida._id }), 0);
  assert.equal(String((await Dietas.findById(daA._id).lean()).cativeiro), String(pondA));
});

test('excluir um cativeiro apaga a dieta dele', async () => {
  const pond = await Cativeiros.create({ nome: 'Viveiro temporário', id_tipo_camarao: fixtures.condicao.id_tipo_camarao,
    data_instalacao: new Date(), condicoes_ideais: fixtures.condicao._id });
  const dieta = await request(`/dietas/cativeiro/${pond._id}`, { method: 'PUT', body: { quantidade: 10, horarios: ['10:00'] } });
  assert.equal(dieta.status, 200);

  assert.equal((await request(`/cativeiros/${pond._id}`, { method: 'DELETE' })).status, 200);
  assert.equal(await DietasxCativeiros.countDocuments({ cativeiro: pond._id }), 0);
  assert.equal(await Dietas.countDocuments({ _id: dieta.body._id }), 0);
});
