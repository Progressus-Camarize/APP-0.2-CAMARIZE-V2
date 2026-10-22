import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/Users.js';
import Cativeiros from '../models/Cativeiros.js';
import EmailSettings from '../models/EmailSettings.js';
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
let adminA;
let adminB;
const tokens = {};

async function request(path, { method = 'GET', body, auth, headers = {} } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* resposta não JSON */ }
  return { status: response.status, body: parsed };
}

const login = async (email) =>
  (await request('/users/auth', { method: 'POST', body: { email, senha: password } })).body.token;

// Fixtures: membro A e cativeiro 0 na fazenda 0; membro B e cativeiro 1 na fazenda 1.
// Somamos um admin por fazenda.
beforeAll(async () => {
  await connectTestDatabase('security');
  fixtures = await seedFixtures();
  const senha = await bcrypt.hash(password, 4);
  [adminA, adminB] = await User.create([
    { nome: 'Admin Seg A', email: 'admin-seg-a@example.invalid', senha, role: 'admin' },
    { nome: 'Admin Seg B', email: 'admin-seg-b@example.invalid', senha, role: 'admin' },
  ]);
  await UsuariosxFazendas.create([
    { usuario: adminA._id, fazenda: fixtures.fazendas[0]._id, ativo: true },
    { usuario: adminB._id, fazenda: fixtures.fazendas[1]._id, ativo: true },
  ]);
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  tokens.membroA = await login('membro-a@example.invalid');
  tokens.adminA = await login('admin-seg-a@example.invalid');
  tokens.adminB = await login('admin-seg-b@example.invalid');
  tokens.master = await login('master@example.invalid');
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('usuários: sem vazamento de hash, sem acesso anônimo e sem admin mexendo em quem não é dele', async () => {
  const membroA = String(fixtures.users[0]._id);
  const membroB = String(fixtures.users[1]._id);
  const master = String(fixtures.users[2]._id);

  assert.equal((await request(`/users/${membroA}`)).status, 401);
  const proprio = await request(`/users/${membroA}`, { auth: tokens.membroA });
  assert.equal(proprio.status, 200);
  assert.equal(proprio.body.senha, undefined);
  assert.equal(proprio.body.tokenVersion, undefined);
  assert.equal((await request(`/users/${membroA}`, { auth: tokens.adminA })).status, 200, 'colega de fazenda');
  assert.equal((await request(`/users/${membroB}`, { auth: tokens.adminA })).status, 404, 'outra fazenda');

  const foto = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal((await request(`/users/${membroB}/photo`, { method: 'PATCH', body: { foto_perfil: foto } })).status, 401);
  assert.equal((await request(`/users/${membroB}/photo`, { method: 'PATCH', auth: tokens.membroA, body: { foto_perfil: foto } })).status, 403);
  const minhaFoto = await request(`/users/${membroA}/photo`, { method: 'PATCH', auth: tokens.membroA, body: { foto_perfil: foto } });
  assert.equal(minhaFoto.status, 200);
  assert.equal(minhaFoto.body.user.senha, undefined);

  assert.equal((await request('/users/user', { method: 'POST', body: { nome: 'X', email: 'x@example.invalid', senha: 'x', role: 'master' } })).status, 401);
  assert.equal(await User.exists({ email: 'x@example.invalid' }), null);

  // Admin não troca senha nem apaga o master, outro admin ou funcionário de outra fazenda
  for (const alvo of [master, String(adminB._id), membroB]) {
    assert.equal((await request(`/users/${alvo}`, { method: 'PATCH', auth: tokens.adminA, body: { senha: 'nova-senha-123' } })).status, 404);
    assert.equal((await request(`/users/${alvo}`, { method: 'DELETE', auth: tokens.adminA })).status, 404);
  }
  assert.equal((await request(`/users/${membroA}`, { method: 'PATCH', auth: tokens.adminA, body: { nome: 'Membro A renomeado' } })).status, 200);

  const cadastro = await request('/users/register/funcionario', { method: 'POST',
    body: { nome: 'Novo', email: 'novo-seg@example.invalid', senha: 'senha-segura-1' } });
  assert.equal(cadastro.status, 201);
  assert.equal(cadastro.body.user.senha, undefined);
});

test('fazendas: dados e foto só para quem pertence à fazenda', async () => {
  const fazendaA = String(fixtures.fazendas[0]._id);
  const fazendaB = String(fixtures.fazendas[1]._id);
  const foto = 'data:image/png;base64,iVBORw0KGgo=';

  assert.equal((await request(`/fazendas/${fazendaA}`)).status, 401);
  assert.equal((await request(`/fazendas/${fazendaA}`, { auth: tokens.membroA })).status, 200);
  assert.equal((await request(`/fazendas/${fazendaB}`, { auth: tokens.membroA })).status, 404);
  assert.equal((await request(`/fazendas/${fazendaB}/foto`, { auth: tokens.membroA })).status, 404);

  assert.equal((await request(`/fazendas/${fazendaB}/foto`, { method: 'PATCH', body: { foto_sitio: foto } })).status, 401);
  assert.equal((await request(`/fazendas/${fazendaB}/foto`, { method: 'PATCH', auth: tokens.membroA, body: { foto_sitio: foto } })).status, 404);
  assert.equal((await request(`/fazendas/${fazendaA}/foto`, { method: 'PATCH', auth: tokens.membroA, body: { foto_sitio: 'não é imagem' } })).status, 400);
  assert.equal((await request(`/fazendas/${fazendaA}/foto`, { method: 'PATCH', auth: tokens.membroA, body: { foto_sitio: foto } })).status, 200);
  assert.equal((await request(`/fazendas/${fazendaA}/foto`, { auth: tokens.membroA })).body.foto, foto);

  assert.equal((await request('/fazendas/public')).status, 401);
  assert.equal((await request('/fazendas', { method: 'POST', auth: tokens.membroA, body: { nome: 'F' } })).status, 403);
});

test('cativeiros: ninguém edita, apaga ou toma o cativeiro de outra fazenda', async () => {
  const cativeiroA = String(fixtures.cativeiros[0]._id);
  const cativeiroB = String(fixtures.cativeiros[1]._id);

  assert.equal((await request(`/cativeiros/${cativeiroB}`, { method: 'PATCH', auth: tokens.adminA, body: { nome: 'Invadido' } })).status, 403);
  assert.equal((await request(`/cativeiros/${cativeiroB}`, { method: 'DELETE', auth: tokens.adminA })).status, 403);
  assert.equal((await request(`/cativeiros/${cativeiroA}`, { method: 'PATCH', auth: tokens.membroA, body: { nome: 'Membro' } })).status, 403);
  assert.ok(await Cativeiros.exists({ _id: cativeiroB, nome: 'Viveiro CI 1' }));

  // Campos protegidos (dono, calibração) não mudam pelo PATCH
  const patch = await request(`/cativeiros/${cativeiroA}`, { method: 'PATCH', auth: tokens.adminA,
    body: { nome: 'Viveiro A editado', user: String(adminB._id), gramas_por_rotacao: 999 } });
  assert.equal(patch.status, 200);
  const atual = await Cativeiros.findById(cativeiroA).lean();
  assert.equal(atual.nome, 'Viveiro A editado');
  assert.notEqual(String(atual.user), String(adminB._id));
  assert.notEqual(atual.gramas_por_rotacao, 999);

  // Foto do cativeiro: exige token (header ou ?token=) e acesso ao cativeiro
  assert.equal((await request(`/cativeiros/${cativeiroA}/foto`)).status, 401);
  assert.equal((await request(`/cativeiros/${cativeiroA}/foto?token=${tokens.adminA}`)).status, 404, 'acesso ok, sem foto cadastrada');
  assert.equal((await request(`/cativeiros/${cativeiroB}/foto?token=${tokens.adminA}`)).status, 404);

  // Vínculos sensor-cativeiro deixaram de ser públicos
  assert.equal((await request('/sensoresxcativeiros')).status, 401);
  assert.equal((await request('/sensoresxcativeiros', { method: 'POST', body: { id_sensor: cativeiroA, id_cativeiro: cativeiroA } })).status, 401);
  assert.equal((await request('/sensoresxcativeiros', { method: 'POST', auth: tokens.adminA,
    body: { id_sensor: String(new mongoose.Types.ObjectId()), id_cativeiro: cativeiroB } })).status, 403);

  assert.equal((await request(`/dietas/assign/${cativeiroB}`, { method: 'POST', auth: tokens.adminA, body: { dietaId: cativeiroB } })).status, 403);
});

test('leituras do ESP32: depois de gerada a chave, leitura sem chave é recusada', async () => {
  const cativeiroA = String(fixtures.cativeiros[0]._id);
  const leitura = { id_cativeiro: cativeiroA, temperatura: 27, ph: 7.2, amonia: 0.1 };
  const chave = (await request(`/parametros/dispositivos/${cativeiroA}/chave`, { method: 'POST', auth: tokens.adminA })).body.chave;
  assert.ok(chave);
  assert.equal((await request('/parametros/cadastrar', { method: 'POST', body: leitura })).status, 401);
  assert.equal((await request('/parametros/cadastrar', { method: 'POST', body: leitura, headers: { 'X-Device-Key': 'errada' } })).status, 401);
  assert.equal((await request('/parametros/cadastrar', { method: 'POST', body: leitura, headers: { 'X-Device-Key': chave } })).status, 201);
});

test('monitoramento, email e chat: sem controle global por qualquer usuário e sem campos forjados', async () => {
  assert.equal((await request('/notifications/monitoring/stop', { method: 'POST', auth: tokens.membroA })).status, 403);
  assert.equal((await request('/notifications/monitoring/check', { method: 'POST', auth: tokens.adminA })).status, 403);
  assert.equal((await request('/notifications/monitoring/start', { method: 'POST', auth: tokens.master, body: { intervalMinutes: 'x' } })).status, 400);
  assert.equal((await request('/email/status', { auth: tokens.membroA })).status, 403);

  const outro = String(fixtures.users[1]._id);
  // A tela de email busca as configurações antes de salvar (o GET cria o registro padrão)
  assert.equal((await request('/email/settings', { auth: tokens.membroA })).status, 200);
  const settings = await request('/email/settings', { method: 'PUT', auth: tokens.membroA,
    body: { userId: outro, lastEmailSent: '2000-01-01', emailEnabled: false } });
  assert.equal(settings.status, 200);
  assert.equal(String(settings.body.emailSettings.userId), String(fixtures.users[0]._id));
  assert.equal(await EmailSettings.exists({ userId: outro, emailEnabled: false }), null);

  // Chat: só abre conversa da qual participa, e sempre entre admin e master
  const master = String(fixtures.users[2]._id);
  assert.equal((await request('/chat/conversations', { method: 'POST', auth: tokens.membroA,
    body: { adminId: String(adminB._id), masterId: master } })).status, 403);
  assert.equal((await request('/chat/conversations', { method: 'POST', auth: tokens.adminA,
    body: { adminId: String(adminA._id), masterId: master } })).status, 201);
});

test('login não revela se o e-mail existe e bloqueia a conta após 5 senhas erradas', async () => {
  const inexistente = await request('/users/auth', { method: 'POST', body: { email: 'ninguem@example.invalid', senha: 'qualquer' } });
  const senhaErrada = await request('/users/auth', { method: 'POST', body: { email: 'admin-seg-b@example.invalid', senha: 'errada' } });
  assert.equal(inexistente.status, 401);
  assert.deepEqual(inexistente.body, senhaErrada.body);

  // admin-seg-b já tem 1 falha acima; mais 4 completam o limite de 5
  for (let i = 0; i < 4; i++) {
    assert.equal((await request('/users/auth', { method: 'POST', body: { email: 'admin-seg-b@example.invalid', senha: 'errada' } })).status, 401);
  }
  const bloqueado = await request('/users/auth', { method: 'POST', body: { email: 'admin-seg-b@example.invalid', senha: password } });
  assert.equal(bloqueado.status, 429, 'mesmo com a senha certa, a conta fica bloqueada');
  assert.match(bloqueado.body.error, /Muitas tentativas/);
  // O bloqueio é da conta, não de quem usa o mesmo IP
  assert.equal((await request('/users/auth', { method: 'POST', body: { email: 'admin-seg-a@example.invalid', senha: password } })).status, 200);
});

test('configurações de email: a tela salva os campos que a API realmente usa', async () => {
  assert.equal((await request('/email/settings', { auth: tokens.adminA })).status, 200);
  const salvo = await request('/email/settings', { method: 'PUT', auth: tokens.adminA, body: {
    emailEnabled: false,
    emailAddress: 'alertas-a@example.com',
    quietHours: { enabled: true, startTime: '22:30', endTime: '06:00' },
    alertTypes: { temperatura: { enabled: true, severity: { baixa: false, media: false, alta: true } } },
  } });
  assert.equal(salvo.status, 200);
  const doc = await EmailSettings.findOne({ userId: adminA._id }).lean();
  assert.equal(doc.emailEnabled, false);
  assert.equal(doc.emailAddress, 'alertas-a@example.com');
  assert.deepEqual(doc.quietHours, { enabled: true, startTime: '22:30', endTime: '06:00' });
  assert.equal(doc.alertTypes.temperatura.severity.media, false);
  assert.equal(doc.alertTypes.temperatura.severity.alta, true);

  assert.equal((await request('/email/settings', { method: 'PUT', auth: tokens.adminA,
    body: { quietHours: { enabled: true, startTime: '25:00', endTime: 'x' } } })).status, 400);
});

test('chat: excluir a conversa apaga só para quem excluiu', async () => {
  const master = String(fixtures.users[2]._id);
  const conversa = (await request('/chat/conversations', { method: 'POST', auth: tokens.master,
    body: { adminId: String(adminA._id), masterId: master } })).body;
  const id = conversa._id;
  await request(`/chat/conversations/${id}/messages`, { method: 'POST', auth: tokens.adminA, body: { text: 'Mensagem antiga' } });

  assert.equal((await request(`/chat/conversations/${id}`, { method: 'DELETE', auth: tokens.adminA })).status, 200);
  const minhas = (await request('/chat/conversations/mine', { auth: tokens.adminA })).body;
  assert.ok(!minhas.some(c => c._id === id), 'some da lista de quem excluiu');
  assert.deepEqual((await request(`/chat/conversations/${id}/messages`, { auth: tokens.adminA })).body, []);

  const doMaster = (await request(`/chat/conversations/${id}/messages`, { auth: tokens.master })).body;
  assert.deepEqual(doMaster.map(m => m.text), ['Mensagem antiga'], 'o outro participante continua vendo');

  // Mensagem nova reabre a conversa para quem excluiu, só com o que veio depois
  await request(`/chat/conversations/${id}/messages`, { method: 'POST', auth: tokens.master, body: { text: 'Mensagem nova' } });
  assert.ok((await request('/chat/conversations/mine', { auth: tokens.adminA })).body.some(c => c._id === id));
  assert.deepEqual((await request(`/chat/conversations/${id}/messages`, { auth: tokens.adminA })).body.map(m => m.text), ['Mensagem nova']);

  // Quando os dois excluem, a conversa some do banco
  await request(`/chat/conversations/${id}`, { method: 'DELETE', auth: tokens.adminA });
  await request(`/chat/conversations/${id}`, { method: 'DELETE', auth: tokens.master });
  assert.equal(await mongoose.model('Conversation').exists({ _id: id }), null);
});
