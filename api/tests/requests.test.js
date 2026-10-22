import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/Users.js';
import Request from '../models/Requests.js';
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
const tokens = {};

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

const ids = (items) => items.map(item => item._id);

// Fixtures: membro A na fazenda 0, membro B na fazenda 1. Aqui somamos um admin por fazenda,
// um admin sem fazenda, um funcionário recém-cadastrado sem vínculo e um funcionário nas duas fazendas.
beforeAll(async () => {
  await connectTestDatabase('requests');
  fixtures = await seedFixtures();
  const senha = await bcrypt.hash(password, 4);
  const [adminA, adminB, , , duplo] = await User.create([
    { nome: 'Admin CI A', email: 'admin-a@example.invalid', senha, role: 'admin' },
    { nome: 'Admin CI B', email: 'admin-b@example.invalid', senha, role: 'admin' },
    { nome: 'Admin CI Sem Fazenda', email: 'admin-sem@example.invalid', senha, role: 'admin' },
    { nome: 'Membro CI Novo', email: 'membro-novo@example.invalid', senha, role: 'membro' },
    { nome: 'Membro CI Duplo', email: 'membro-duplo@example.invalid', senha, role: 'membro' },
  ]);
  await UsuariosxFazendas.create([
    { usuario: adminA._id, fazenda: fixtures.fazendas[0]._id, ativo: true },
    { usuario: adminB._id, fazenda: fixtures.fazendas[1]._id, ativo: true },
    { usuario: duplo._id, fazenda: fixtures.fazendas[0]._id, ativo: true },
    { usuario: duplo._id, fazenda: fixtures.fazendas[1]._id, ativo: true },
  ]);
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  tokens.membroA = await login('membro-a@example.invalid');
  tokens.membroB = await login('membro-b@example.invalid');
  tokens.membroNovo = await login('membro-novo@example.invalid');
  tokens.membroDuplo = await login('membro-duplo@example.invalid');
  tokens.adminA = await login('admin-a@example.invalid');
  tokens.adminB = await login('admin-b@example.invalid');
  tokens.adminSemFazenda = await login('admin-sem@example.invalid');
  tokens.master = await login('master@example.invalid');
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

const criar = (auth, action = 'editar_dieta', { payload = { teste: true }, fazenda = null } = {}) =>
  request('/requests', { method: 'POST', auth, body: { action, payload, fazenda } });

test('admin só vê, aprova e recusa solicitações da própria fazenda', async () => {
  const doA = (await criar(tokens.membroA)).body;
  const doB = (await criar(tokens.membroB)).body;
  assert.equal(doA.targetRole, 'admin');
  assert.equal(doB.targetRole, 'admin');
  // Funcionário de uma fazenda só: a fazenda é gravada na solicitação mesmo sem vir no corpo
  assert.equal(doA.fazenda, String(fixtures.fazendas[0]._id));
  assert.equal(doB.fazenda, String(fixtures.fazendas[1]._id));

  const pendentesA = await request('/requests', { auth: tokens.adminA });
  assert.deepEqual(ids(pendentesA.body), [doA._id]);
  const pendentesB = await request('/requests', { auth: tokens.adminB });
  assert.deepEqual(ids(pendentesB.body), [doB._id]);
  assert.deepEqual((await request('/requests', { auth: tokens.adminSemFazenda })).body, []);

  // Admin B não decide sobre a solicitação da fazenda A
  assert.equal((await request(`/requests/${doA._id}/approve`, { method: 'POST', auth: tokens.adminB, body: {} })).status, 404);
  assert.equal((await request(`/requests/${doA._id}/reject`, { method: 'POST', auth: tokens.adminB })).status, 404);
  assert.equal((await Request.findById(doA._id).lean()).status, 'pendente');

  assert.equal((await request(`/requests/${doA._id}/reject`, { method: 'POST', auth: tokens.adminA })).status, 200);
  assert.equal((await request(`/requests/${doB._id}/reject`, { method: 'POST', auth: tokens.adminB })).status, 200);

  // Histórico também é isolado por fazenda; master continua vendo tudo
  const historicoA = await request('/requests/all-admin', { auth: tokens.adminA });
  assert.deepEqual(ids(historicoA.body), [doA._id]);
  const historicoB = await request('/requests/all-admin', { auth: tokens.adminB });
  assert.deepEqual(ids(historicoB.body), [doB._id]);
  assert.deepEqual((await request('/requests/all-admin', { auth: tokens.adminSemFazenda })).body, []);
  const historicoMaster = await request('/requests/all-admin', { auth: tokens.master });
  assert.deepEqual(new Set(ids(historicoMaster.body)), new Set([doA._id, doB._id]));
});

test('admin não aprova a própria solicitação destinada ao master', async () => {
  const pedido = (await criar(tokens.adminA, 'cadastrar_cativeiro')).body;
  assert.equal(pedido.targetRole, 'master');
  assert.equal((await request(`/requests/${pedido._id}/approve`, { method: 'POST', auth: tokens.adminA, body: {} })).status, 404);
  assert.equal((await Request.findById(pedido._id).lean()).status, 'pendente');
  assert.equal((await request(`/requests/${pedido._id}/reject`, { method: 'POST', auth: tokens.master })).status, 200);
});

test('funcionário em duas fazendas: a solicitação vai só para o admin da fazenda certa', async () => {
  const [fazendaA, fazendaB] = fixtures.fazendas.map(f => String(f._id));
  const cativeiroA = String(fixtures.cativeiros[0]._id);

  // Fazenda deduzida pelo cativeiro, mesmo se o corpo apontar outra
  const peloCativeiro = await criar(tokens.membroDuplo, 'editar_cativeiro', { payload: { cativeiroId: cativeiroA }, fazenda: fazendaB });
  assert.equal(peloCativeiro.status, 201);
  assert.equal(peloCativeiro.body.fazenda, fazendaA);

  // Sem cativeiro/sensor, vale a fazenda informada no corpo
  const peloCorpo = await criar(tokens.membroDuplo, 'editar_dieta', { fazenda: fazendaB });
  assert.equal(peloCorpo.status, 201);
  assert.equal(peloCorpo.body.fazenda, fazendaB);

  const vistosA = ids((await request('/requests', { auth: tokens.adminA })).body);
  const vistosB = ids((await request('/requests', { auth: tokens.adminB })).body);
  assert.ok(vistosA.includes(peloCativeiro.body._id) && !vistosA.includes(peloCorpo.body._id));
  assert.ok(vistosB.includes(peloCorpo.body._id) && !vistosB.includes(peloCativeiro.body._id));

  // Sem nada que identifique a fazenda, a API pede que ela seja informada
  assert.equal((await criar(tokens.membroDuplo, 'editar_dieta')).status, 400);
});

test('funcionário não cria solicitação para fazenda da qual não faz parte', async () => {
  const fazendaB = String(fixtures.fazendas[1]._id);
  const cativeiroB = String(fixtures.cativeiros[1]._id);
  assert.equal((await criar(tokens.membroA, 'editar_dieta', { fazenda: fazendaB })).status, 403);
  assert.equal((await criar(tokens.membroA, 'editar_cativeiro', { payload: { cativeiroId: cativeiroB } })).status, 403);
  assert.equal((await criar(tokens.membroNovo, 'editar_dieta')).status, 403);
});

test('funcionário sem fazenda pede vínculo ao master, que escolhe a fazenda', async () => {
  const pedido = (await criar(tokens.membroNovo, 'associar_funcionario', { payload: { nome: 'Membro CI Novo', fazendaInformada: 'Fazenda CI 1' } })).body;
  assert.equal(pedido.targetRole, 'master');
  assert.equal(pedido.fazenda, null);
  assert.equal((await criar(tokens.membroNovo, 'associar_funcionario')).status, 409);

  assert.ok(!ids((await request('/requests', { auth: tokens.adminA })).body).includes(pedido._id));
  assert.ok(ids((await request('/requests', { auth: tokens.master })).body).includes(pedido._id));

  const fazendaId = String(fixtures.fazendas[1]._id);
  const aprovado = await request(`/requests/${pedido._id}/approve`, { method: 'POST', auth: tokens.master, body: { fazendaId } });
  assert.equal(aprovado.status, 200);
  const novo = await User.findOne({ email: 'membro-novo@example.invalid' }).lean();
  assert.ok(await UsuariosxFazendas.exists({ usuario: novo._id, fazenda: fazendaId, ativo: true }));
  assert.ok(ids((await request('/requests/all', { auth: tokens.master })).body).includes(pedido._id));
});

test('vínculos usuário-fazenda exigem login e só mostram os do próprio usuário', async () => {
  const membroA = String(fixtures.users[0]._id);
  const membroB = String(fixtures.users[1]._id);

  assert.equal((await request('/usuariosxfazendas')).status, 401);

  const proprios = await request('/usuariosxfazendas', { auth: tokens.membroA });
  assert.equal(proprios.status, 200);
  assert.ok(proprios.body.length > 0 && proprios.body.every(r => String(r.usuario) === membroA));
  assert.deepEqual((await request(`/usuariosxfazendas?usuario=${membroA}`, { auth: tokens.membroA })).body, proprios.body);

  assert.equal((await request(`/usuariosxfazendas?usuario=${membroB}`, { auth: tokens.membroA })).status, 403);
  assert.equal((await request(`/usuariosxfazendas?usuario=${membroB}`, { auth: tokens.adminA })).status, 403);
  assert.equal((await request('/usuariosxfazendas?usuario=nao-e-um-id', { auth: tokens.master })).status, 400);

  const doB = await request(`/usuariosxfazendas?usuario=${membroB}`, { auth: tokens.master });
  assert.ok(doB.body.length > 0 && doB.body.every(r => String(r.usuario) === membroB));
});
