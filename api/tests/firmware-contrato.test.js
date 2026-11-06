// Contrato entre a API e o firmware do ESP32 (esp32/camarize_esp32.ino).
// Cada requisição aqui imita exatamente o que a placa envia (caminho, headers e JSON);
// se algum teste quebrar, o firmware instalado nas placas para de funcionar.
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
let masterToken;
let pond;
let chave;

// Requisição como o painel faz (login)
async function painel(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

// Requisição como o ESP32 faz: Content-Type só no POST e X-Device-Key quando configurada
async function placa(path, { method = 'GET', body, deviceKey = chave } = {}) {
  const headers = {};
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  if (deviceKey) headers['X-Device-Key'] = deviceKey;
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await connectTestDatabase('firmware');
  fixtures = await seedFixtures();
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseURL}/users/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixtures.users[2].email, senha: password }),
  });
  masterToken = (await login.json()).token;
  pond = fixtures.cativeiros[0].id;
  chave = (await painel(`/parametros/dispositivos/${pond}/chave`, { method: 'POST' })).body.chave;
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('leituras a cada 5 s: com chave e amostraId são gravadas uma vez só', async () => {
  const leitura = { id_cativeiro: pond, temperatura: 26.5, ph: 7.12, amonia: 0.43, amostraId: '1793500000' };

  const semChave = await placa('/parametros/cadastrar', { method: 'POST', body: leitura, deviceKey: null });
  assert.equal(semChave.status, 401);

  const primeira = await placa('/parametros/cadastrar', { method: 'POST', body: leitura });
  assert.equal(primeira.status, 201);

  // POST repetido (ex.: a placa não recebeu a resposta e reenviou)
  const repetida = await placa('/parametros/cadastrar', { method: 'POST', body: leitura });
  assert.equal(repetida.status, 200);
  assert.equal(repetida.body.repetida, true);

  // Antes de o relógio sincronizar a placa envia sem amostraId
  const semAmostra = await placa('/parametros/cadastrar', { method: 'POST',
    body: { id_cativeiro: pond, temperatura: 26.6, ph: 7.1, amonia: 0.44 } });
  assert.equal(semAmostra.status, 201);
});

test('leitura não busca a foto do cativeiro no banco (resposta rápida para a placa)', async () => {
  // A foto fica dentro do documento do cativeiro; trazê-la a cada leitura deixava a resposta
  // lenta a ponto de a placa desistir (HTTP -11) em conexões mais lentas
  await Cativeiros.updateOne({ _id: pond }, { $set: { foto_cativeiro: Buffer.alloc(512 * 1024) } });
  const projecoes = [];
  const exec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = function (...args) {
    if (this.model?.modelName === 'Cativeiros') projecoes.push(this.projection());
    return exec.apply(this, args);
  };
  try {
    const resposta = await placa('/parametros/cadastrar', { method: 'POST',
      body: { id_cativeiro: pond, temperatura: 25, ph: 7, amonia: 0.4, amostraId: '1793500100' } });
    assert.equal(resposta.status, 201);
  } finally {
    mongoose.Query.prototype.exec = exec;
    await Cativeiros.updateOne({ _id: pond }, { $set: { foto_cativeiro: null } });
  }
  assert.ok(projecoes.length >= 2, 'esperava as buscas do cadastro e da avaliação de avisos');
  for (const projecao of projecoes) {
    assert.ok(projecao?.foto_cativeiro === 0 || (projecao && !Object.values(projecao).includes(0) && !('foto_cativeiro' in projecao)),
      `busca de cativeiro trouxe a foto: ${JSON.stringify(projecao)}`);
  }
});

test('dieta com chave traz horários, quantidade e gramas por rotação', async () => {
  await Cativeiros.updateOne({ _id: pond }, { $set: { gramas_por_rotacao: 2.5 } });
  const dieta = await Dietas.create({ descricao: 'Dieta firmware', quantidade: 25, horarios: ['08:00', '17:00'] });
  await DietasxCativeiros.create({ cativeiro: pond, dieta: dieta._id, ativo: true });

  const resposta = await placa(`/dietas/atual/${pond}`);
  assert.equal(resposta.status, 200);
  assert.deepEqual(resposta.body.horarios, ['08:00', '17:00']);
  assert.equal(resposta.body.quantidade, 25);
  assert.equal(resposta.body.gramas_por_rotacao, 2.5);
});

test('calibração do motor: a placa gira e avisa com a etapa "executar"', async () => {
  await painel('/calibracao/iniciar', { method: 'POST', body: { id_cativeiro: pond, tipo: 'motor', rotacoes: 10 } });

  const comando = await placa(`/calibracao/atual/${pond}`);
  assert.deepEqual(comando.body, { ativa: true, tipo: 'motor', etapa: 'executar', rotacoes: 10 });

  // Firmware antigo: sem chave e com a etapa "motor_executado" — ambos recusados
  const semChave = await placa('/calibracao/resultado', { method: 'POST', deviceKey: null,
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'executar', rotacoes: 10 } });
  assert.equal(semChave.status, 401);
  const etapaAntiga = await placa('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'motor_executado', rotacoes: 10 } });
  assert.equal(etapaAntiga.status, 409);

  const executado = await placa('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'executar', rotacoes: 10 } });
  assert.equal(executado.status, 200);

  const aguardando = await placa(`/calibracao/atual/${pond}`);
  assert.equal(aguardando.body.etapa, 'aguardando_peso');

  // O usuário pesa a ração no painel
  const peso = await painel('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'motor', etapa: 'peso', rotacoes: 10, gramas: 32 } });
  assert.equal(peso.status, 200);

  // A placa recebe o novo valor pela dieta (consultada a cada minuto)
  const dieta = await placa(`/dietas/atual/${pond}`);
  assert.equal(dieta.body.gramas_por_rotacao, 3.2);
});

test('calibração do pH: a placa só mede depois que o usuário confirma', async () => {
  await painel('/calibracao/iniciar', { method: 'POST', body: { id_cativeiro: pond, tipo: 'ph' } });

  // preparar_ph7: a placa espera (não mede)
  assert.equal((await placa(`/calibracao/atual/${pond}`)).body.etapa, 'preparar_ph7');
  await painel('/calibracao/confirmar', { method: 'POST', body: { id_cativeiro: pond } });
  assert.equal((await placa(`/calibracao/atual/${pond}`)).body.etapa, 'ph7');

  const ph7 = await placa('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph7', tensao: 2.5123 } });
  assert.equal(ph7.status, 200);

  assert.equal((await placa(`/calibracao/atual/${pond}`)).body.etapa, 'preparar_ph4');
  await painel('/calibracao/confirmar', { method: 'POST', body: { id_cativeiro: pond } });

  const ph4 = await placa('/calibracao/resultado', { method: 'POST',
    body: { id_cativeiro: pond, tipo: 'ph', etapa: 'ph4', tensao: 3.0456 } });
  assert.equal(ph4.status, 200);

  const final = await placa(`/calibracao/atual/${pond}`);
  assert.equal(final.body.ativa, false);
  const cativeiro = await Cativeiros.findById(pond).lean();
  assert.equal(cativeiro.tensao_ph7, 2.5123);
  assert.equal(cativeiro.tensao_ph4, 3.0456);
});

test('calibração cancelada no painel: a placa vê ativa=false (e para o motor)', async () => {
  await painel('/calibracao/iniciar', { method: 'POST', body: { id_cativeiro: pond, tipo: 'motor', rotacoes: 5 } });
  await painel('/calibracao/cancelar', { method: 'POST', body: { id_cativeiro: pond } });

  const atual = await placa(`/calibracao/atual/${pond}`);
  assert.equal(atual.status, 200);
  assert.equal(atual.body.ativa, false);
});

test('alimentação: a placa informa a refeição e o painel vê as do dia', async () => {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const refeicao = { id_cativeiro: pond, data: hoje, horario: '08:00', status: 'servida', gramas: 25, rotacoes: 10, atraso_min: 0 };

  const semChave = await placa('/alimentacoes', { method: 'POST', body: refeicao, deviceKey: null });
  assert.equal(semChave.status, 401);
  const horarioInvalido = await placa('/alimentacoes', { method: 'POST', body: { ...refeicao, horario: '8h' } });
  assert.equal(horarioInvalido.status, 400);

  // Primeiro a placa não conseguiu servir; depois, dentro da janela, serviu com atraso
  const falha = await placa('/alimentacoes', { method: 'POST',
    body: { ...refeicao, status: 'falhou', motivo: 'Alimentador sem calibração', gramas: 25, rotacoes: 0 } });
  assert.equal(falha.status, 201);
  const servida = await placa('/alimentacoes', { method: 'POST', body: { ...refeicao, atraso_min: 4 } });
  assert.equal(servida.status, 200);
  assert.equal(servida.body.alimentacao.status, 'servida');
  assert.equal(servida.body.alimentacao.motivo, null);

  // Um aviso de falha atrasado não desfaz a refeição servida
  const falhaAtrasada = await placa('/alimentacoes', { method: 'POST', body: { ...refeicao, status: 'falhou', motivo: 'x' } });
  assert.equal(falhaAtrasada.body.alimentacao.status, 'servida');

  await placa('/alimentacoes', { method: 'POST', body: { ...refeicao, horario: '17:00', status: 'falhou', motivo: 'Motor ocupado' } });

  const dia = await painel(`/alimentacoes/${pond}`);
  assert.equal(dia.status, 200);
  assert.equal(dia.body.data, hoje);
  assert.deepEqual(dia.body.alimentacoes.map(a => [a.horario, a.status, a.atrasoMin]),
    [['08:00', 'servida', 4], ['17:00', 'falhou', 0]]);

  const outroDia = await painel(`/alimentacoes/${pond}?data=2020-01-01`);
  assert.deepEqual(outroDia.body.alimentacoes, []);
});

test('alimentações de um cativeiro não aparecem para quem não tem acesso', async () => {
  const login = await fetch(`${baseURL}/users/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixtures.users[1].email, senha: password }),
  });
  const tokenMembroB = (await login.json()).token;
  const resposta = await fetch(`${baseURL}/alimentacoes/${pond}`, { headers: { Authorization: `Bearer ${tokenMembroB}` } });
  assert.equal(resposta.status, 403);
});

test('cativeiro sem dieta ativa: a placa recebe 404 (e suspende a alimentação)', async () => {
  await DietasxCativeiros.updateMany({ cativeiro: pond }, { $set: { ativo: false } });
  const resposta = await placa(`/dietas/atual/${pond}`);
  assert.equal(resposta.status, 404);
});
