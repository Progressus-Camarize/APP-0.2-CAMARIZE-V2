// Aviso "durante a falta de conexão": leituras que a placa guardou sem internet e enviou depois
// (POST /parametros/lote) passam pelas mesmas regras dos avisos ao vivo.
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import Aviso, { INDICE_AVISO_ATIVO_ANTIGO } from '../models/Aviso.js';
import Cativeiros from '../models/Cativeiros.js';
import ParametrosAtuais from '../models/Parametros_atuais.js';
import { avaliarPeriodo, mensagemRetroativa, processReading } from '../services/avisoService.js';
import { migrarAvisoRetroativo } from '../services/migracoes.js';
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

const MIN = 60_000;

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

// Viveiro com pH calibrado (avisos de pH exigem calibração) e chave de dispositivo
async function criarViveiro(nome, { calibrado = true } = {}) {
  const pond = await Cativeiros.create({
    nome, id_tipo_camarao: fixtures.condicao.id_tipo_camarao, data_instalacao: new Date(),
    condicoes_ideais: fixtures.condicao._id,
    ...(calibrado ? { tensao_ph7: 2.5, tensao_ph4: 3.03, calibracao_ph_em: new Date(Date.now() - 24 * 60 * MIN) } : {}),
  });
  const { body } = await request(`/parametros/dispositivos/${pond._id}/chave`, { method: 'POST' });
  return { id: String(pond._id), chave: body.chave };
}

// Médias por minuto como a placa envia: `minutos` leituras começando `inicioMinAtras` minutos atrás
function serie(inicioMinAtras, minutos, valores) {
  const inicio = Math.floor((Date.now() - inicioMinAtras * MIN) / 1000);
  return Array.from({ length: minutos }, (_, i) => {
    const ts = inicio + i * 60;
    const [temperatura, ph, amonia] = valores(i);
    return { ts, amostraId: `m${ts}`, temperatura, ph, amonia };
  });
}

const enviarLote = (viveiro, leituras) => request('/parametros/lote', {
  method: 'POST', body: { id_cativeiro: viveiro.id, leituras }, headers: { 'X-Device-Key': viveiro.chave },
});

beforeAll(async () => {
  await connectTestDatabase('retroativo');
  fixtures = await seedFixtures();
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseURL}/users/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixtures.users[2].email, senha: password }),
  });
  token = (await login.json()).token;
}, 15000);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('regra: aplica as regras ao vivo a cada janela do período e junta num motivo por parâmetro', () => {
  const t0 = Date.now() - 3 * 60 * MIN;
  // Médias de 5 min: pH estável em 7, sobe para 7.6 e depois para 7.8
  const ph = [7, 7, 7, 7, 7, 7, 7.6, 7.6, 7.6, 7.8, 7.8, 7.8];
  const readings = ph.map((valor, i) => ({ datahora: new Date(t0 + i * 5 * MIN), temp_atual: 28, ph_atual: valor, amonia_atual: 0.2 }));
  const bounds = { temp_min: 26, temp_max: 30 };

  const motivos = avaliarPeriodo(readings, bounds, readings[0].datahora, readings.at(-1).datahora);
  assert.deepEqual(motivos.map(m => m.tipo), ['ph']);
  const [motivo] = motivos;
  assert.equal(motivo.direcao, 'aumento');
  // Valores do disparo de maior variação; período do primeiro ao último disparo
  assert.equal(motivo.valorInicial, 7);
  assert.equal(motivo.valorAtual, 7.6);
  assert.ok(new Date(motivo.periodoFim) > new Date(readings[8].datahora));

  // Janelas que terminam fora do período não contam
  assert.deepEqual(avaliarPeriodo(readings, bounds, readings[0].datahora, readings[5].datahora), []);
  // Variação abaixo do limiar do viveiro não dispara, igual ao aviso ao vivo
  const leve = readings.map(r => ({ ...r, ph_atual: r.ph_atual === 7 ? 7 : 7.2 }));
  assert.deepEqual(avaliarPeriodo(leve, bounds, readings[0].datahora, readings.at(-1).datahora), []);
});

test('mensagem diz quando foi e pede para verificar o cativeiro agora', () => {
  const inicio = new Date('2026-11-24T17:10:00Z');
  const mensagem = mensagemRetroativa({ tipo: 'ph', direcao: 'queda', valorInicial: 7.8, valorAtual: 7.3,
    periodoInicio: inicio, periodoFim: new Date('2026-11-24T18:40:00Z') });
  assert.equal(mensagem, 'Durante a falta de conexão (24/11, 14:10–15:40), o pH teve queda persistente (7.8 → 7.3). '
    + 'Verifique o cativeiro agora para ver se normalizou.');
  const temperatura = mensagemRetroativa({ tipo: 'temperatura', limite: 30, valorInicial: 28, valorAtual: 29.7,
    periodoInicio: new Date('2026-11-24T02:50:00Z'), periodoFim: new Date('2026-11-24T03:20:00Z') });
  assert.match(temperatura, /^Durante a falta de conexão \(23\/11 23:50 a 24\/11 00:20\), a temperatura chegou perto do limite de 30 °C/);
});

test('lote com pH fora do esperado abre um aviso retroativo; o lote seguinte da mesma queda estende o mesmo aviso', async () => {
  const viveiro = await criarViveiro('Viveiro queda pH');

  // 1ª hora sem internet: pH cai de 7.8 para 7.3 depois de 30 min
  const primeira = serie(180, 60, i => [28, i < 30 ? 7.8 : 7.3, 0.2]);
  const resposta = await enviarLote(viveiro, primeira);
  assert.equal(resposta.status, 200);
  assert.equal(resposta.body.inseridas, 60);

  const avisos = await Aviso.find({ cativeiro: viveiro.id, retroativo: true }).lean();
  assert.equal(avisos.length, 1);
  const [aviso] = avisos;
  assert.equal(aviso.tipo, 'ph');
  assert.equal(aviso.estado, 'ativo');
  assert.equal(aviso.preditivo, false);
  assert.equal(aviso.pushStatus, 'pendente');
  // As médias de 5 min seguem o relógio: a janela da mudança mistura os dois valores (ex.: 7.333)
  assert.match(aviso.mensagem, /^Durante a falta de conexão \(.+\), o pH teve queda persistente \(7\.8 → 7\.3\d*\)\. Verifique o cativeiro agora para ver se normalizou\.$/);
  // O período fica dentro da queda (a janela das regras não puxa leituras de antes dela)
  assert.ok(aviso.periodoInicio.getTime() >= primeira[0].ts * 1000);

  // 2ª hora: o pH cai mais (7.3 → 6.7). Continua um aviso só, com o período e os valores atualizados
  const segunda = serie(120, 60, i => [28, i < 20 ? 7.3 : 6.7, 0.2]);
  assert.equal((await enviarLote(viveiro, segunda)).status, 200);
  const estendido = await Aviso.find({ cativeiro: viveiro.id, retroativo: true }).lean();
  assert.equal(estendido.length, 1);
  assert.ok(estendido[0].periodoFim > aviso.periodoFim);
  assert.ok(estendido[0].valorAtual < 6.8, `valorAtual ${estendido[0].valorAtual}`);
  assert.match(estendido[0].mensagem, /\(7\.3\d* → 6\.7\d*\)/);

  // A placa reenviou o primeiro lote: nada de aviso novo
  assert.equal((await enviarLote(viveiro, primeira)).status, 200);
  assert.equal(await Aviso.countDocuments({ cativeiro: viveiro.id }), 1);
});

test('lote sem variação não abre aviso; pH sem calibração não abre aviso de pH', async () => {
  const estavel = await criarViveiro('Viveiro queda estável');
  assert.equal((await enviarLote(estavel, serie(180, 60, () => [28, 7.5, 0.2]))).status, 200);
  assert.equal(await Aviso.countDocuments({ cativeiro: estavel.id }), 0);

  const semCalibracao = await criarViveiro('Viveiro queda sem calibração', { calibrado: false });
  assert.equal((await enviarLote(semCalibracao, serie(180, 60, i => [28, i < 30 ? 7.8 : 7.3, 0.2]))).status, 200);
  assert.equal(await Aviso.countDocuments({ cativeiro: semCalibracao.id }), 0);
});

test('o aviso retroativo não fecha com leituras novas, não bloqueia o ao vivo e só fecha quando alguém confere', async () => {
  const viveiro = await criarViveiro('Viveiro queda ciclo');
  assert.equal((await enviarLote(viveiro, serie(180, 60, i => [28, i < 30 ? 7.8 : 7.3, 0.2]))).status, 200);
  const retro = await Aviso.findOne({ cativeiro: viveiro.id, retroativo: true }).lean();
  assert.ok(retro);

  // Conexão de volta: leituras ao vivo normais não encerram o retroativo...
  const ao_vivo = (valores, fimMinAtras) => ParametrosAtuais.insertMany(valores.map((ph, i) => ({
    id_cativeiro: viveiro.id, autenticada: true, origem: 'dispositivo', amostraId: `vivo_${fimMinAtras}_${i}`,
    datahora: new Date(Date.now() - (fimMinAtras + (valores.length - 1 - i) * 5) * MIN),
    temp_atual: 28, ph_atual: ph, amonia_atual: 0.2,
  })));
  await ao_vivo([7.3, 7.3, 7.3, 7.3, 7.3, 7.3], 32);
  await processReading(viveiro.id);
  assert.equal((await Aviso.findById(retro._id).lean()).estado, 'ativo');

  // ...e um problema agora abre o aviso ao vivo do mesmo tipo normalmente
  await ao_vivo([7.3, 7.3, 7.3, 7.9, 7.9, 7.9], 1);
  await processReading(viveiro.id);
  const aoVivo = await Aviso.findOne({ cativeiro: viveiro.id, retroativo: false, tipo: 'ph', estado: 'ativo' }).lean();
  assert.ok(aoVivo, 'aviso ao vivo de pH deveria abrir com o retroativo ainda ativo');
  assert.equal((await Aviso.findById(retro._id).lean()).estado, 'ativo');

  // Com o aviso ao vivo aberto, uma nova queda com o mesmo problema não abre outro retroativo
  await Aviso.updateOne({ _id: retro._id }, { $set: { estado: 'recuperado', recuperadoEm: new Date() } });
  assert.equal((await enviarLote(viveiro, serie(300, 60, i => [28, i < 30 ? 7.8 : 7.3, 0.2]))).status, 200);
  assert.equal(await Aviso.countDocuments({ cativeiro: viveiro.id, retroativo: true, estado: 'ativo' }), 0);
  await Aviso.updateOne({ _id: retro._id }, { $set: { estado: 'ativo' }, $unset: { recuperadoEm: 1 } });

  // Conferir o viveiro encerra o retroativo; o ao vivo segue as próprias regras
  const avaliacao = await request(`/notifications/${retro._id}/avaliacao`, { method: 'PATCH', body: { avaliacao: 'confirmado' } });
  assert.equal(avaliacao.status, 200);
  assert.equal(avaliacao.body.estado, 'recuperado');
  const fechado = await Aviso.findById(retro._id).lean();
  assert.equal(fechado.estado, 'recuperado');
  assert.ok(fechado.recuperadoEm);
  assert.equal((await Aviso.findById(aoVivo._id).lean()).estado, 'ativo');

  // A lista de notificações e o status dos viveiros mostram o selo
  const lista = await request(`/notifications/cativeiro/${viveiro.id}`);
  assert.equal(lista.status, 200);
  assert.deepEqual(lista.body.notifications.map(n => n.retroativo).sort(), [false, true]);
});

test('migração: remove o índice antigo de avisos ativos e marca avisos antigos como não retroativos', async () => {
  await Aviso.collection.createIndex({ cativeiro: 1, tipo: 1, preditivo: 1 },
    { name: INDICE_AVISO_ATIVO_ANTIGO, unique: true, partialFilterExpression: { estado: 'ativo' } });
  const antigo = await Aviso.collection.insertOne({
    cativeiro: fixtures.cativeiros[1]._id, tipo: 'temperatura', estado: 'recuperado', mensagem: 'antigo',
    periodoInicio: new Date(), periodoFim: new Date(), preditivo: false,
  });

  await migrarAvisoRetroativo();
  // Pode rodar de novo em todo boot
  await migrarAvisoRetroativo();

  const indices = (await Aviso.collection.indexes()).map(i => i.name);
  assert.ok(!indices.includes(INDICE_AVISO_ATIVO_ANTIGO));
  assert.ok(indices.includes('cativeiro_1_tipo_1_preditivo_1_retroativo_1'));
  assert.equal((await Aviso.findById(antigo.insertedId).lean()).retroativo, false);
});
