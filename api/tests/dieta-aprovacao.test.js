import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/Users.js';
import UsuariosxFazendas from '../models/UsuariosxFazendas.js';
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

// Admin A pede a dieta pelo painel e o master aprova
async function solicitarEAprovar(cativeiroId, dados, dietaId = null) {
  const criada = await request('/requests', {
    method: 'POST', auth: tokens.adminA,
    body: { action: 'editar_dieta', payload: { cativeiroId: String(cativeiroId), dietaId, ...dados } },
  });
  assert.equal(criada.status, 201);
  const aprovada = await request(`/requests/${criada.body._id}/approve`, { method: 'POST', auth: tokens.master, body: {} });
  assert.equal(aprovada.status, 200);
}

const dietaAtual = async (cativeiroId) => (await request(`/dietas/atual/${cativeiroId}`)).body;

beforeAll(async () => {
  await connectTestDatabase('dieta_aprovacao');
  fixtures = await seedFixtures();
  const senha = await bcrypt.hash(password, 4);
  const adminA = await User.create({ nome: 'Admin CI A', email: 'admin-a@example.invalid', senha, role: 'admin' });
  await UsuariosxFazendas.create({ usuario: adminA._id, fazenda: fixtures.fazendas[0]._id, ativo: true });
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  tokens.adminA = await login('admin-a@example.invalid');
  tokens.master = await login('master@example.invalid');
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('aprovar dieta de um cativeiro não altera a dieta compartilhada com outro', async () => {
  const [pondA, pondB] = fixtures.cativeiros.map(c => c._id);
  const compartilhada = await Dietas.create({ descricao: 'Padrão', quantidade: 10, horarios: ['08:00'], quantidadeRefeicoes: 1 });
  await DietasxCativeiros.create([
    { cativeiro: pondA, dieta: compartilhada._id, ativo: true },
    { cativeiro: pondB, dieta: compartilhada._id, ativo: true },
  ]);

  await solicitarEAprovar(pondA, { descricao: 'Engorda', quantidade: 25, quantidadeRefeicoes: 2, horarios: ['08:00', '17:00'] },
    String(compartilhada._id));

  const a = await dietaAtual(pondA);
  assert.deepEqual(a.horarios, ['08:00', '17:00']);
  assert.equal(a.quantidade, 25);
  assert.notEqual(String(a.dietaId), String(compartilhada._id));

  const b = await dietaAtual(pondB);
  assert.equal(String(b.dietaId), String(compartilhada._id));
  assert.deepEqual(b.horarios, ['08:00']);
  assert.equal(b.quantidade, 10);
  assert.deepEqual((await Dietas.findById(compartilhada._id).lean()).horarios, ['08:00']);
});

test('dieta exclusiva do cativeiro é editada no lugar, sem criar outra', async () => {
  const pondA = fixtures.cativeiros[0]._id;
  const antes = await dietaAtual(pondA);
  const total = await Dietas.countDocuments();

  await solicitarEAprovar(pondA, { descricao: 'Engorda', quantidade: 30, quantidadeRefeicoes: 3, horarios: ['07:00', '12:00', '18:00'] },
    String(antes.dietaId));

  const depois = await dietaAtual(pondA);
  assert.equal(String(depois.dietaId), String(antes.dietaId));
  assert.deepEqual(depois.horarios, ['07:00', '12:00', '18:00']);
  assert.equal(depois.quantidade, 30);
  assert.equal(await Dietas.countDocuments(), total);
});

test('o dietaId enviado na solicitação não permite alterar a dieta de outro cativeiro', async () => {
  const [pondA, pondB] = fixtures.cativeiros.map(c => c._id);
  const dietaB = await dietaAtual(pondB);

  await solicitarEAprovar(pondA, { descricao: 'Tentativa', quantidade: 99, quantidadeRefeicoes: 1, horarios: ['03:00'] },
    String(dietaB.dietaId));

  const b = await dietaAtual(pondB);
  assert.equal(b.quantidade, 10);
  assert.deepEqual(b.horarios, ['08:00']);
  assert.equal((await dietaAtual(pondA)).quantidade, 99);
});

test('cativeiro sem dieta recebe uma nova ao aprovar', async () => {
  const pondA = fixtures.cativeiros[0]._id;
  await DietasxCativeiros.updateMany({ cativeiro: pondA }, { $set: { ativo: false } });
  assert.equal((await request(`/dietas/atual/${pondA}`)).status, 404);

  await solicitarEAprovar(pondA, { descricao: 'Inicial', quantidade: 12, quantidadeRefeicoes: 2, horarios: ['09:00', '15:00'] });

  const a = await dietaAtual(pondA);
  assert.deepEqual(a.horarios, ['09:00', '15:00']);
  assert.equal(a.quantidade, 12);
});
