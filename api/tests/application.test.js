import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import ParametrosAtuais from '../models/Parametros_atuais.js';
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
let token;
let otherToken;
let databaseReady = true;

async function request(path, { method = 'GET', body, auth, deviceKey } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(deviceKey ? { 'X-Device-Key': deviceKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await connectTestDatabase('api');
  fixtures = await seedFixtures();
  server = createApp({ isDatabaseReady: () => databaseReady && mongoose.connection.readyState === 1 }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  token = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[0].email, senha: password } })).body.token;
  otherToken = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[1].email, senha: password } })).body.token;
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('readiness retorna 503 quando o banco não está pronto', async () => {
  assert.equal((await request('/api/health')).status, 200);
  databaseReady = false;
  try {
    const result = await request('/api/health');
    assert.equal(result.status, 503);
    assert.equal(result.body.database, 'disconnected');
  } finally { databaseReady = true; }
});

test('login rejeita senha incorreta e /me exige um token válido', async () => {
  assert.equal((await request('/users/auth', { method: 'POST', body: { email: fixtures.users[0].email, senha: 'incorreta' } })).status, 401);
  assert.equal((await request('/users/me')).status, 401);
  assert.equal((await request('/users/me', { auth: 'invalido' })).status, 401);
  const result = await request('/users/me', { auth: token });
  assert.equal(result.status, 200);
  assert.equal(result.body.email, fixtures.users[0].email);
  assert.equal(result.body.senha, undefined);
});

test('ingestão do ESP32 persiste leitura e dashboard devolve os mesmos valores', async () => {
  const result = await request('/parametros/cadastrar', { method: 'POST', body: {
    id_cativeiro: fixtures.cativeiros[0].id, temperatura: 28.5, ph: 7.2, amonia: 0.15,
  } });
  assert.equal(result.status, 201);
  assert.equal(await ParametrosAtuais.countDocuments({ id_cativeiro: fixtures.cativeiros[0]._id }), 1);
  const dashboard = await request(`/parametros/dashboard/${fixtures.cativeiros[0].id}`, { auth: token });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.dadosAtuais.temperatura, 28.5);
  assert.equal(dashboard.body.dadosAtuais.ph, 7.2);
  assert.equal(dashboard.body.dadosSemanais.length, 7);
  assert.equal(dashboard.body.analise.suficiente, false);
});

test('ingestão rejeita ID inválido, valores ausentes e valores não numéricos sem persistir', async () => {
  const count = await ParametrosAtuais.countDocuments();
  for (const body of [
    { id_cativeiro: 'invalido', temperatura: 28, ph: 7, amonia: 0.2 },
    { id_cativeiro: fixtures.cativeiros[0].id, temperatura: 28 },
    { id_cativeiro: fixtures.cativeiros[0].id, temperatura: '28', ph: 7, amonia: 0.2 },
    { id_cativeiro: fixtures.cativeiros[0].id, temperatura: null, ph: 7, amonia: 0.2 },
  ]) assert.equal((await request('/parametros/cadastrar', { method: 'POST', body })).status, 400);
  assert.equal(await ParametrosAtuais.countDocuments(), count);
  assert.equal((await request('/parametros/cadastrar', { method: 'POST', body: {
    id_cativeiro: new mongoose.Types.ObjectId().toString(), temperatura: 28, ph: 7, amonia: 0.2,
  } })).status, 404);
});

test('histórico antigo com sensor desconectado não aparece no dashboard ou relatório', async () => {
  const pond = fixtures.cativeiros[0]._id;
  await ParametrosAtuais.create({ id_cativeiro: pond, temp_atual: -127, ph_atual: 7, amonia_atual: 0.2 });
  const dashboard = await request(`/parametros/dashboard/${pond}`, { auth: token });
  assert.equal(dashboard.body.dadosAtuais.temperatura, 28.5);
  const history = await request(`/parametros/historicos/${pond}?dias=1`, { auth: token });
  assert.equal(history.body.dados.some(d => d.temperatura === -127), false);
});

test('leituras e SSE são isolados por fazenda e exigem autenticação', async () => {
  for (const path of ['dashboard', 'atuais', 'historicos']) {
    assert.equal((await request(`/parametros/${path}/${fixtures.cativeiros[0].id}`, { auth: otherToken })).status, 403);
    assert.equal((await request(`/parametros/${path}/${fixtures.cativeiros[0].id}`)).status, 401);
  }
  assert.equal((await request(`/parametros/stream/${fixtures.cativeiros[0].id}?token=${otherToken}`)).status, 403);
  assert.equal((await request(`/parametros/dashboard/${fixtures.cativeiros[1].id}`, { auth: otherToken })).body.dadosAtuais.temperatura, null);
});

test('SSE entrega leitura inicial e nova leitura após o envio do sensor', async () => {
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 7000);
  let reader;
  try {
    const response = await fetch(`${baseURL}/parametros/stream/${fixtures.cativeiros[0].id}?token=${token}`, { signal: abort.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const nextEvent = async () => {
      for (;;) {
        const delimiter = buffer.indexOf('\n\n');
        if (delimiter >= 0) {
          const frame = buffer.slice(0, delimiter);
          buffer = buffer.slice(delimiter + 2);
          if (frame.startsWith('data: ')) return JSON.parse(frame.slice(6));
          continue;
        }
        const chunk = await reader.read();
        assert.equal(chunk.done, false, 'stream encerrou antes da leitura esperada');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    };
    assert.equal((await nextEvent()).dadosAtuais.temperatura, 28.5);
    assert.equal((await request('/parametros/cadastrar', { method: 'POST', body: {
      id_cativeiro: fixtures.cativeiros[0].id, temperatura: 30, ph: 7, amonia: 0.2,
    } })).status, 201);
    assert.equal((await nextEvent()).dadosAtuais.temperatura, 30);
  } finally {
    clearTimeout(deadline);
    abort.abort();
    await reader?.cancel().catch(() => {});
  }
}, 10000);

test('rotas de diagnóstico ficam desabilitadas por padrão', async () => {
  const result = await fetch(`${baseURL}/test/test-relacoes`);
  assert.equal(result.status, 404);
});

test('logout revoga o token previamente emitido', async () => {
  assert.equal((await request('/users/logout', { method: 'POST', auth: token })).status, 200);
  assert.equal((await request('/users/me', { auth: token })).status, 401);
});

test('dispositivo autenticado gera aviso explicável, isolado por fazenda e idempotente', async () => {
  const pond = fixtures.cativeiros[0].id;
  const ownToken = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[0].email, senha: password } })).body.token;
  const master = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[2].email, senha: password } })).body.token;
  assert.equal((await request(`/parametros/dispositivos/${pond}/chave`, { method: 'POST', auth: ownToken })).status, 403);
  const provision = await request(`/parametros/dispositivos/${pond}/chave`, { method: 'POST', auth: master });
  assert.equal(provision.status, 200);
  const deviceKey = provision.body.chave;
  assert.equal((await request('/parametros/cadastrar', { method: 'POST', deviceKey: 'invalida', body: {
    id_cativeiro: pond, temperatura: 28, ph: 7, amonia: 0.2,
  } })).status, 401);
  assert.equal((await request('/parametros/cadastrar', { method: 'POST', deviceKey, body: {
    id_cativeiro: pond, temperatura: -127, ph: 7, amonia: 0.2,
  } })).status, 400);
  for (let i = 0; i < 6; i++) {
    const body = { id_cativeiro: pond, temperatura: i < 3 ? 28 : 29.8,
      ph: i < 3 ? 7 : 8, amonia: i < 3 ? 0.2 : 0.3, amostraId: `integration-${i}` };
    assert.equal((await request('/parametros/cadastrar', { method: 'POST', deviceKey, body })).status, 201);
    if (i === 5) assert.equal((await request('/parametros/cadastrar', { method: 'POST', deviceKey, body })).body.repetida, true);
  }
  const dashboard = await request(`/parametros/dashboard/${pond}`, { auth: ownToken });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.frescor.estado, 'recente');
  assert.equal(dashboard.body.analise.suficiente, true);
  assert.deepEqual(dashboard.body.avisosAtivos.map(a => a.tipo).sort(), ['amonia', 'ph', 'temperatura']);
  const status = await request('/cativeiros-status', { auth: ownToken });
  assert.equal(status.status, 200);
  assert.equal(status.body.cativeiros[0].status, 'alerta');
  assert.equal(status.body.cativeiros[0].totalAlertas, 3);
  const own = await request(`/notifications/cativeiro/${pond}`, { auth: ownToken });
  assert.equal(own.status, 200);
  assert.equal(own.body.notifications.length, 3);
  assert.equal(own.body.notifications.find(a => a.tipo === 'amonia').experimental, true);
  assert.equal((await request(`/notifications/cativeiro/${pond}`, { auth: otherToken })).status, 403);
  assert.equal((await request('/notifications', { auth: otherToken })).body.notifications.length, 0);
  const avisoId = own.body.notifications[0].id;
  assert.equal((await request(`/notifications/${avisoId}/avaliacao`, { method: 'PATCH', auth: otherToken, body: { avaliacao: 'falso_alarme' } })).status, 403);
  assert.equal((await request(`/notifications/${avisoId}/avaliacao`, { method: 'PATCH', auth: ownToken, body: { avaliacao: 'confirmado' } })).status, 200);
  const summary = await request(`/notifications/cativeiro/${pond}/resumo`, { auth: ownToken });
  assert.equal(summary.body.total, 3);
  assert.equal(summary.body.verificados, 1);
  assert.equal((await request(`/notifications/cativeiro/${pond}/resumo`, { auth: otherToken })).status, 403);
  const page = await request(`/parametros/historicos/${pond}?dias=1&pagina=1&limite=2`, { auth: ownToken });
  assert.equal(page.status, 200);
  assert.equal(page.body.dados.length, 2);
  assert.equal(page.body.proximaPagina, 2);
});

test('contador de avisos não vistos independe de push e some ao marcar como visto', async () => {
  // token já foi revogado pelo teste de logout acima; usa ownToken (mesmo usuário, sessão nova).
  const ownToken = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[0].email, senha: password } })).body.token;
  const unread = await request('/notifications/nao-vistos', { auth: ownToken });
  assert.equal(unread.status, 200);
  assert.ok(unread.body.naoVistos >= 3, 'deve contar os avisos já criados nos testes anteriores');
  assert.equal((await request('/notifications/nao-vistos')).status, 401);

  const marcado = await request('/notifications/marcar-visto', { method: 'POST', auth: ownToken });
  assert.equal(marcado.status, 200);
  assert.equal((await request('/notifications/nao-vistos', { auth: ownToken })).body.naoVistos, 0);

  assert.equal((await request('/notifications/nao-vistos', { auth: otherToken })).body.naoVistos, 0,
    'otherToken não tem acesso aos cativeiros do dono, não deve contar os avisos dele');
});

test('limites de sensibilidade de pH/amônia: só admin/master, com validação', async () => {
  const pond = fixtures.cativeiros[0].id;
  const ownToken = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[0].email, senha: password } })).body.token;
  const master = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[2].email, senha: password } })).body.token;

  assert.equal((await request(`/parametros/limites-sensibilidade/${pond}`, { method: 'PATCH', auth: ownToken,
    body: { phLimiar: 0.2, amoniaLimiarPct: 0.15 } })).status, 403, 'membro não pode ajustar sensibilidade');

  assert.equal((await request(`/parametros/limites-sensibilidade/${pond}`, { method: 'PATCH', auth: otherToken,
    body: { phLimiar: 0.2, amoniaLimiarPct: 0.15 } })).status, 403, 'usuário de outra fazenda não tem acesso ao cativeiro');

  assert.equal((await request(`/parametros/limites-sensibilidade/${pond}`, { method: 'PATCH', auth: master,
    body: { phLimiar: 10, amoniaLimiarPct: 0.15 } })).status, 400, 'phLimiar fora da faixa aceita deve ser rejeitado');

  const ok = await request(`/parametros/limites-sensibilidade/${pond}`, { method: 'PATCH', auth: master,
    body: { phLimiar: 0.4, amoniaLimiarPct: 0.3 } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { phLimiar: 0.4, amoniaLimiarPct: 0.3 });
});

test('histórico de rotação da chave do dispositivo: registra quem gerou, sem guardar a chave', async () => {
  const pond = fixtures.cativeiros[0].id;
  const ownToken = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[0].email, senha: password } })).body.token;
  const master = (await request('/users/auth', { method: 'POST', body: { email: fixtures.users[2].email, senha: password } })).body.token;

  assert.equal((await request(`/parametros/dispositivos/${pond}/historico`, { auth: ownToken })).status, 403, 'membro não pode ver o histórico de chaves');
  assert.equal((await request(`/parametros/dispositivos/${pond}/historico`, { auth: otherToken })).status, 403, 'usuário de outra fazenda não tem acesso ao cativeiro');

  const antes = await request(`/parametros/dispositivos/${pond}/historico`, { auth: master });
  assert.equal(antes.status, 200);
  const totalAntes = antes.body.historico.length;
  assert.ok(totalAntes >= 1, 'o teste de dispositivo anterior já deve ter gerado uma chave para este viveiro');

  const provisionNova = await request(`/parametros/dispositivos/${pond}/chave`, { method: 'POST', auth: master });
  assert.equal(provisionNova.status, 200);

  const depois = await request(`/parametros/dispositivos/${pond}/historico`, { auth: master });
  assert.equal(depois.body.historico.length, totalAntes + 1);
  const maisRecente = depois.body.historico[0];
  assert.equal(maisRecente.geradoPor.email, fixtures.users[2].email);
  assert.equal(maisRecente.geradoPor.role, 'master');
  assert.ok(new Date(maisRecente.geradoEm).getTime() > 0);
  assert.equal(JSON.stringify(depois.body).includes(provisionNova.body.chave), false, 'a chave em si nunca deve aparecer no histórico');
});
