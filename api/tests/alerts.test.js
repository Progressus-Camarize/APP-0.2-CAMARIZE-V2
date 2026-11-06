import { beforeAll, afterAll, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ParametrosAtuais from '../models/Parametros_atuais.js';
import Aviso from '../models/Aviso.js';
import DeviceCredential from '../models/DeviceCredential.js';
import Cativeiros from '../models/Cativeiros.js';
import alertService from '../services/alertService.js';
import { evaluate, processReading, checkSensorInativo, deliverPending, freshness, linearRegression, projectTrend, leiturasAgregadas } from '../services/avisoService.js';
import { connectTestDatabase, dropTestDatabase, seedFixtures } from './fixtures.js';

process.env.NODE_ENV = 'test';
let fixtures;
beforeAll(async () => {
  await connectTestDatabase('alerts');
  fixtures = await seedFixtures();
});
afterAll(async () => {
  if (mongoose.connection.readyState) await dropTestDatabase();
});

const samples = (values, start = Date.now() - 5 * 60_000, passoMin = 1) => values.map((v, i) => ({
  datahora: new Date(start + i * passoMin * 60_000), temp_atual: v[0], ph_atual: v[1], amonia_atual: v[2],
}));
// processReading analisa médias de 5 min: as leituras simuladas ficam uma por janela de 5 min
const PASSO_JANELA_MIN = 5;

test('regras: normal, ruído isolado, tendência persistente, lacuna e dado antigo', () => {
  const bounds = { temp_min: 26, temp_max: 30 };
  const normal = samples(Array(6).fill([28, 7, 0.2]));
  assert.deepEqual(evaluate(normal, bounds).motivos, []);
  const noise = samples([[28,7,0.2],[28,7,0.2],[28,7,0.2],[31,8,0.5],[28,7,0.2],[28,7,0.2]]);
  assert.deepEqual(evaluate(noise, bounds).motivos, []);
  const trend = samples([[28,7,0.2],[28,7,0.2],[28,7,0.2],[29.5,7.7,0.3],[29.7,7.8,0.32],[29.8,7.9,0.34]]);
  const result = evaluate(trend, bounds);
  assert.deepEqual(result.motivos.map(a => a.tipo), ['temperatura', 'ph', 'amonia']);
  // Só a amônia é medição experimental (sem calibração); pH só gera aviso com calibração registrada
  assert.deepEqual(result.motivos.filter(a => a.experimental).map(a => a.tipo), ['amonia']);
  assert.equal(evaluate(trend.map((s, i) => ({ ...s, datahora: new Date(Date.now() - (130 - i * 25) * 60_000) })), bounds).suficiente, false);
  assert.equal(evaluate(trend, bounds, new Date(Date.now() + 20 * 60_000)).suficiente, false);
  assert.equal(freshness({ datahora: new Date(Date.now() - 20 * 60_000) }).estado, 'antigo');
});

test('limiares de pH e amônia são configuráveis por viveiro', () => {
  const bounds = { temp_min: 26, temp_max: 30 };
  const trendLeve = samples([[28,7,0.2],[28,7,0.2],[28,7,0.2],[28,7.2,0.22],[28,7.22,0.225],[28,7.25,0.23]]);
  const padrao = evaluate(trendLeve, bounds);
  assert.equal(padrao.motivos.some(m => m.tipo === 'ph'), false, 'variação pequena não deve disparar com o limiar padrão');
  const sensivel = evaluate(trendLeve, { ...bounds, ph_limiar: 0.15 });
  assert.equal(sensivel.motivos.some(m => m.tipo === 'ph'), true, 'o mesmo trend deve disparar com um limiar mais sensível configurado');
});

test('ocorrência única, recuperação e nova ocorrência; somente leitura autenticada conta', async () => {
  const pond = fixtures.cativeiros[0]._id;
  // Avisos de pH exigem calibração registrada (feita antes das leituras do teste)
  await Cativeiros.updateOne({ _id: pond }, { $set: { tensao_ph7: 2.5, tensao_ph4: 3.03, calibracao_ph_em: new Date(Date.now() - 6 * 60 * 60_000) } });
  // 6 leituras, uma a cada 5 min, terminando `minutesAgo` minutos atrás
  const create = async (values, authenticated = true, minutesAgo = 5) => {
    const start = Date.now() - (minutesAgo + (values.length - 1) * PASSO_JANELA_MIN) * 60_000;
    await ParametrosAtuais.insertMany(samples(values, start, PASSO_JANELA_MIN).map((v, i) => ({
      id_cativeiro: pond, autenticada: authenticated, origem: authenticated ? 'dispositivo' : 'legado',
      amostraId: `${Date.now()}_${i}_${Math.random()}`, ...v,
    })));
  };
  const reativoPh = { tipo: 'ph', preditivo: { $ne: true } };
  await create([[28,7,0.2],[28,7,0.2],[28,7,0.2],[28,8,0.2],[28,8,0.2],[28,8,0.2]], false, 100);
  await processReading(pond, new Date(Date.now() - 95 * 60_000));
  assert.equal(await Aviso.countDocuments(), 0);
  await create([[28,7,0.2],[28,7,0.2],[28,7,0.2],[28,8,0.2],[28,8,0.2],[28,8,0.2]], true, 70);
  await processReading(pond, new Date(Date.now() - 69 * 60_000));
  await processReading(pond, new Date(Date.now() - 69 * 60_000));
  assert.equal(await Aviso.countDocuments(reativoPh), 1);
  assert.equal((await Aviso.findOne(reativoPh)).pushStatus, 'pendente');
  process.env.VAPID_PUBLIC_KEY = 'teste';
  process.env.VAPID_PRIVATE_KEY = 'teste';
  const push = vi.spyOn(alertService, 'sendPush').mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });
  await deliverPending();
  await deliverPending();
  assert.equal(push.mock.calls.length, 1);
  push.mockRestore();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  await create(Array(6).fill([28,7,0.2]), true, 35);
  await processReading(pond, new Date(Date.now() - 34 * 60_000));
  assert.equal((await Aviso.findOne(reativoPh)).estado, 'recuperado');
  await create([[28,7,0.2],[28,7,0.2],[28,7,0.2],[28,8,0.2],[28,8,0.2],[28,8,0.2]], true, 0);
  await processReading(pond);
  assert.equal(await Aviso.countDocuments(reativoPh), 2);
});

test('push: falha real tenta de novo com backoff até esgotar e marca "falhou"; sem inscrição marca "sem_inscricao" sem retry', async () => {
  const pond = fixtures.cativeiros[1]._id;
  const trend = samples([[28,7,0.2],[28,7,0.2],[28,7,0.2],[29.5,7.7,0.3],[29.7,7.8,0.32],[29.8,7.9,0.34]], Date.now() - 25 * 60_000, PASSO_JANELA_MIN);
  await ParametrosAtuais.insertMany(trend.map((v, i) => ({
    id_cativeiro: pond, autenticada: true, origem: 'dispositivo', amostraId: `retry_${Date.now()}_${i}_${Math.random()}`, ...v,
  })));
  await processReading(pond);
  const temperatura = await Aviso.findOne({ cativeiro: pond, tipo: 'temperatura', estado: 'ativo' });
  const amonia = await Aviso.findOne({ cativeiro: pond, tipo: 'amonia', estado: 'ativo' });
  assert.ok(temperatura && amonia);

  process.env.VAPID_PUBLIC_KEY = 'teste';
  process.env.VAPID_PRIVATE_KEY = 'teste';

  // Falha real de entrega (ex.: servidor de push fora do ar) deve ser reprocessada, não desistida de cara.
  const push = vi.spyOn(alertService, 'sendPush').mockResolvedValue({ attempted: 1, sent: 0, failed: 1 });
  let now = new Date();
  await deliverPending({ _id: temperatura._id }, now);
  let estado = await Aviso.findById(temperatura._id);
  assert.equal(estado.pushStatus, 'pendente');
  assert.equal(estado.pushTentativas, 1);
  assert.ok(estado.proximaTentativaEm > now);

  // Antes do backoff vencer, não tenta de novo.
  await deliverPending({ _id: temperatura._id }, new Date(now.getTime() + 1000));
  assert.equal(push.mock.calls.length, 1);

  // Backoff vencido: 2ª tentativa.
  now = new Date(estado.proximaTentativaEm.getTime() + 1000);
  await deliverPending({ _id: temperatura._id }, now);
  estado = await Aviso.findById(temperatura._id);
  assert.equal(estado.pushTentativas, 2);
  assert.equal(estado.pushStatus, 'pendente');

  // 3ª tentativa esgota o limite — vira terminal, para de tentar.
  now = new Date(estado.proximaTentativaEm.getTime() + 1000);
  await deliverPending({ _id: temperatura._id }, now);
  estado = await Aviso.findById(temperatura._id);
  assert.equal(estado.pushTentativas, 3);
  assert.equal(estado.pushStatus, 'falhou');
  assert.equal(push.mock.calls.length, 3);
  now = new Date(now.getTime() + 60 * 60_000);
  await deliverPending({ _id: temperatura._id }, now);
  assert.equal(push.mock.calls.length, 3, 'aviso terminal não deve ser reprocessado');

  // Ninguém com push ativo no momento: não é falha, não entra em retry.
  push.mockResolvedValue({ attempted: 0, sent: 0, failed: 0 });
  await deliverPending({ _id: amonia._id });
  const semInscricao = await Aviso.findById(amonia._id);
  assert.equal(semInscricao.pushStatus, 'sem_inscricao');
  assert.equal(semInscricao.pushTentativas, 0);

  push.mockRestore();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

test('sensor_inativo: dispara quando um dispositivo provisionado some, recupera quando leitura volta', async () => {
  // Cativeiro isolado, sem o histórico de leituras recentes que os fixtures já acumularam
  // nos testes anteriores — senão "sem leitura há 3h" nunca seria verdade.
  const pond = (await Cativeiros.create({
    nome: 'Viveiro isolado sensor_inativo', id_tipo_camarao: fixtures.condicao.id_tipo_camarao,
    data_instalacao: new Date(),
  }))._id;
  await DeviceCredential.create({ cativeiro: pond, keyHash: 'hash-de-teste' });
  const now = new Date();

  await checkSensorInativo(pond, now);
  let aviso = await Aviso.findOne({ cativeiro: pond, tipo: 'sensor_inativo', estado: 'ativo' });
  assert.ok(aviso, 'deve abrir aviso quando nunca houve leitura autenticada deste dispositivo');

  await checkSensorInativo(pond, now);
  assert.equal(await Aviso.countDocuments({ cativeiro: pond, tipo: 'sensor_inativo' }), 1, 'não deve duplicar enquanto o aviso segue ativo');

  await ParametrosAtuais.create({ id_cativeiro: pond, autenticada: true, origem: 'dispositivo',
    temp_atual: 28, ph_atual: 7, amonia_atual: 0.2, datahora: now });
  await checkSensorInativo(pond, now);
  aviso = await Aviso.findOne({ cativeiro: pond, tipo: 'sensor_inativo' }).sort({ criadoEm: -1 });
  assert.equal(aviso.estado, 'recuperado');

  const maisTarde = new Date(now.getTime() + 4 * 60 * 60_000);
  await checkSensorInativo(pond, maisTarde);
  assert.equal(await Aviso.countDocuments({ cativeiro: pond, tipo: 'sensor_inativo', estado: 'ativo' }), 1,
    'silêncio novamente após a recuperação deve abrir outra ocorrência');
});

test('sensor_inativo: não se aplica a cativeiro sem dispositivo provisionado', async () => {
  const pond = fixtures.cativeiros[1]._id;
  await checkSensorInativo(pond, new Date());
  assert.equal(await Aviso.countDocuments({ cativeiro: pond, tipo: 'sensor_inativo' }), 0);
});

test('linearRegression: reta exata e janela plana', () => {
  assert.deepEqual(linearRegression([{ t: 0, y: 1 }, { t: 1, y: 3 }, { t: 2, y: 5 }]), { slope: 2, intercept: 1 });
  const plano = linearRegression([{ t: 0, y: 7 }, { t: 10, y: 7 }, { t: 20, y: 7 }]);
  assert.equal(plano.slope, 0);
});

test('projectTrend: insuficiente, estável e tendência que projeta cruzamento antes do limite', () => {
  const bounds = { temp_min: 26, temp_max: 30 };
  const poucos = Array.from({ length: 5 }, (_, i) => ({ datahora: new Date(Date.now() - i * 20 * 60_000), temp_atual: 28, ph_atual: 7, amonia_atual: 0.2 }));
  assert.equal(projectTrend(poucos, bounds).suficiente, false);

  const estavel = Array.from({ length: 9 }, (_, i) => ({ datahora: new Date(Date.now() - (160 - i * 20) * 60_000), temp_atual: 28, ph_atual: 7, amonia_atual: 0.2 }));
  assert.deepEqual(projectTrend(estavel, bounds).motivos, []);

  // Sobe 0.25°C a cada 20min: ainda longe do limite (29.0 < 29.5), mas projeta cruzar 30°C em ~1h20.
  const subindo = Array.from({ length: 9 }, (_, i) => ({
    datahora: new Date(Date.now() - (160 - i * 20) * 60_000), temp_atual: 27 + i * 0.25, ph_atual: 7, amonia_atual: 0.2,
  }));
  const result = projectTrend(subindo, bounds);
  assert.equal(result.suficiente, true);
  const motivo = result.motivos.find(m => m.tipo === 'temperatura');
  assert.ok(motivo, 'deve projetar cruzamento de temperatura antes de o valor atual chegar perto do limite');
  assert.equal(motivo.preditivo, true);
  assert.equal(motivo.limite, 30);
  assert.equal(motivo.direcao, 'aumento');
});

test('processReading: aviso preditivo antecipa a tendência; aviso reativo (quando chega) recupera o preditivo', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro isolado tendencia', id_tipo_camarao: fixtures.condicao.id_tipo_camarao,
    data_instalacao: new Date(), condicoes_ideais: fixtures.condicao._id,
  }))._id;
  const now = new Date();
  const subindo = Array.from({ length: 9 }, (_, i) => ({
    id_cativeiro: pond, autenticada: true, origem: 'dispositivo', amostraId: `trend_${Date.now()}_${i}_${Math.random()}`,
    datahora: new Date(now.getTime() - (160 - i * 20) * 60_000), temp_atual: 27 + i * 0.25, ph_atual: 7, amonia_atual: 0.2,
  }));
  await ParametrosAtuais.insertMany(subindo);
  await processReading(pond, now);

  assert.equal(await Aviso.countDocuments({ cativeiro: pond, tipo: 'temperatura', preditivo: false }), 0,
    'poucas leituras na janela reativa de 90min: não deve disparar o aviso reativo ainda');
  const preditivo = await Aviso.findOne({ cativeiro: pond, tipo: 'temperatura', preditivo: true, estado: 'ativo' });
  assert.ok(preditivo, 'deve abrir o aviso de tendência antes do limite ser atingido');
  assert.equal(preditivo.limite, 30);

  // A tendência continua e agora realmente se aproxima do limite: o reativo dispara.
  const now2 = new Date(now.getTime() + 60 * 60_000);
  const confirmando = [50, 40, 30, 20, 10, 0].map((minutosAtras, i) => ({
    id_cativeiro: pond, autenticada: true, origem: 'dispositivo', amostraId: `confirma_${Date.now()}_${i}_${Math.random()}`,
    datahora: new Date(now2.getTime() - minutosAtras * 60_000), temp_atual: 29.0 + i * 0.18, ph_atual: 7, amonia_atual: 0.2,
  }));
  await ParametrosAtuais.insertMany(confirmando);
  await processReading(pond, now2);

  const reativo = await Aviso.findOne({ cativeiro: pond, tipo: 'temperatura', preditivo: false, estado: 'ativo' });
  assert.ok(reativo, 'a tendência confirmada deve abrir o aviso reativo de verdade');
  const preditivoAposReativo = await Aviso.findById(preditivo._id);
  assert.equal(preditivoAposReativo.estado, 'recuperado', 'o aviso preditivo deve ser recuperado quando o reativo confirma o problema');
});

test('processReading: aviso preditivo continua aberto enquanto a tendência aponta o limite, e só se encerra quando ela se afasta', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro preditivo sem ciclo', id_tipo_camarao: fixtures.condicao.id_tipo_camarao,
    data_instalacao: new Date(), condicoes_ideais: fixtures.condicao._id,
  }))._id;
  const leitura = (datahora, temp, tag) => ({
    id_cativeiro: pond, autenticada: true, origem: 'dispositivo', amostraId: `ciclo_${tag}_${Math.random()}`,
    datahora, temp_atual: temp, ph_atual: 7, amonia_atual: 0.2,
  });
  const now = new Date();
  await ParametrosAtuais.insertMany(Array.from({ length: 9 }, (_, i) =>
    leitura(new Date(now.getTime() - (160 - i * 20) * 60_000), 27 + i * 0.25, `sobe${i}`)));
  await processReading(pond, now);
  const preditivos = () => Aviso.find({ cativeiro: pond, tipo: 'temperatura', preditivo: true }).lean();
  assert.equal((await preditivos()).length, 1);

  // Próxima leitura: a temperatura atual está normal, mas a tendência segue apontando o limite.
  // Antes, o aviso era "recuperado" e reaberto a cada leitura (um aviso novo a cada ~10 s).
  const now2 = new Date(now.getTime() + 20 * 60_000);
  await ParametrosAtuais.create(leitura(now2, 29.25, 'segue'));
  await processReading(pond, now2);
  const depois = await preditivos();
  assert.equal(depois.length, 1, 'não deve abrir um aviso novo enquanto a tendência continua');
  assert.equal(depois[0].estado, 'ativo', 'o aviso preditivo segue aberto enquanto a projeção cruza o limite');

  // A temperatura estabiliza e cai: a projeção se afasta do limite e o aviso se encerra.
  const now3 = new Date(now2.getTime() + 4 * 60 * 60_000);
  await ParametrosAtuais.insertMany(Array.from({ length: 10 }, (_, i) =>
    leitura(new Date(now3.getTime() - (180 - i * 20) * 60_000), 28 - i * 0.05, `cai${i}`)));
  await processReading(pond, now3);
  const final = await preditivos();
  assert.equal(final.length, 1);
  assert.equal(final[0].estado, 'recuperado', 'tendência afastada do limite: o aviso preditivo se encerra');
});

test('leituras a cada 5 s: a análise usa médias de 5 min, o ruído se cancela e 30 s de dados não abrem aviso', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro com placa a cada 5 s', id_tipo_camarao: fixtures.condicao.id_tipo_camarao,
    data_instalacao: new Date(), condicoes_ideais: fixtures.condicao._id,
  }))._id;
  const now = new Date();
  const leitura = (msAtras, ph, tag) => ({
    id_cativeiro: pond, autenticada: true, origem: 'dispositivo', amostraId: `5s_${tag}_${Math.random()}`,
    datahora: new Date(now.getTime() - msAtras), temp_atual: 28, ph_atual: ph, amonia_atual: 0.2,
  });

  // Só 30 s de leituras (6 a cada 5 s), com salto de pH: antes bastava para abrir aviso
  await ParametrosAtuais.insertMany([7, 7, 7, 8, 8, 8].map((ph, i) => leitura((5 - i) * 5_000, ph, `rapido${i}`)));
  await processReading(pond, now);
  assert.equal(await Aviso.countDocuments({ cativeiro: pond }), 0, '30 s de dados não são uma mudança persistente');

  // Meia hora a cada 5 s com pH pulando 5 ↔ 9 (sensor desligado): as médias ficam em ~7
  await ParametrosAtuais.insertMany(Array.from({ length: 360 }, (_, i) => leitura((30 * 60 + i * 5) * 1000, i % 2 ? 9 : 5, `ruido${i}`)));
  const medias = await leiturasAgregadas(pond, new Date(now.getTime() - 90 * 60_000), now);
  assert.ok(medias.length >= 6 && medias.length <= 9, `esperava ~6-8 médias de 5 min, veio ${medias.length}`);
  for (const m of medias.slice(0, -1)) assert.ok(Math.abs(m.ph_atual - 7) < 0.1, `média suavizada perto de 7, veio ${m.ph_atual}`);
  assert.ok(medias.every(m => m.leituras >= 1));
});

test('aviso encerrado há pouco: não reabre o mesmo tipo dentro de 30 min; depois disso, reabre', async () => {
  const pond = (await Cativeiros.create({
    nome: 'Viveiro intervalo mínimo', id_tipo_camarao: fixtures.condicao.id_tipo_camarao,
    data_instalacao: new Date(), condicoes_ideais: fixtures.condicao._id,
    // pH calibrado antes das leituras (sem calibração, pH não gera aviso)
    tensao_ph7: 2.5, tensao_ph4: 3.03, calibracao_ph_em: new Date(Date.now() - 6 * 60 * 60_000),
  }))._id;
  const now = new Date();
  // Mudança de pH sustentada (uma leitura por janela de 5 min) que abriria um aviso reativo
  await ParametrosAtuais.insertMany([25, 20, 15, 10, 5, 0].map((minutosAtras, i) => ({
    id_cativeiro: pond, autenticada: true, origem: 'dispositivo', amostraId: `intervalo_${i}_${Math.random()}`,
    datahora: new Date(now.getTime() - minutosAtras * 60_000), temp_atual: 28, ph_atual: i < 3 ? 7 : 8, amonia_atual: 0.2,
  })));
  // Aviso de pH (reativo) encerrado há 10 min
  const anterior = await Aviso.create({ cativeiro: pond, tipo: 'ph', mensagem: 'pH anterior', estado: 'recuperado',
    periodoInicio: now, periodoFim: now, criadoEm: new Date(now.getTime() - 40 * 60_000), recuperadoEm: new Date(now.getTime() - 10 * 60_000) });
  const reativosPh = () => Aviso.countDocuments({ cativeiro: pond, tipo: 'ph', preditivo: { $ne: true } });

  await processReading(pond, now);
  assert.equal(await reativosPh(), 1, 'encerrado há 10 min: não abre outro aviso de pH reativo');

  // Passados mais de 30 min do encerramento, a mesma condição volta a abrir aviso
  await Aviso.updateOne({ _id: anterior._id }, { $set: { recuperadoEm: new Date(now.getTime() - 31 * 60_000) } });
  await processReading(pond, now);
  assert.equal(await reativosPh(), 2, 'encerrado há mais de 30 min: abre o aviso novo');
});

test('pH só gera aviso com calibração registrada, e só com leituras posteriores a ela', async () => {
  const now = new Date();
  const criarViveiro = async (nome, calibracao = {}) => (await Cativeiros.create({
    nome, id_tipo_camarao: fixtures.condicao.id_tipo_camarao, data_instalacao: new Date(),
    condicoes_ideais: fixtures.condicao._id, ...calibracao,
  }))._id;
  // pH 7 → 8 sustentado (uma leitura por janela de 5 min); temperatura e amônia estáveis
  const mudancaDePh = (pond) => ParametrosAtuais.insertMany([25, 20, 15, 10, 5, 0].map((minutosAtras, i) => ({
    id_cativeiro: pond, autenticada: true, origem: 'dispositivo', amostraId: `phcal_${pond}_${i}`,
    datahora: new Date(now.getTime() - minutosAtras * 60_000), temp_atual: 28, ph_atual: i < 3 ? 7 : 8, amonia_atual: 0.2,
  })));
  const avisosPh = (pond) => Aviso.find({ cativeiro: pond, tipo: 'ph' }).lean();

  // Sem calibração: leitura de pH não é confiável, nenhum aviso de pH
  const semCalibracao = await criarViveiro('pH sem calibração');
  await mudancaDePh(semCalibracao);
  await processReading(semCalibracao, now);
  assert.equal((await avisosPh(semCalibracao)).length, 0);

  // Calibração aplicada antes das leituras: aviso de pH normal (não é mais medição experimental)
  const calibrado = await criarViveiro('pH calibrado', { tensao_ph7: 2.5, tensao_ph4: 3.03, calibracao_ph_em: new Date(now.getTime() - 2 * 60 * 60_000) });
  await mudancaDePh(calibrado);
  await processReading(calibrado, now);
  const abertos = await avisosPh(calibrado);
  assert.equal(abertos.length, 1);
  assert.equal(abertos[0].experimental, false);
  assert.ok(!/experimental/i.test(abertos[0].mensagem));

  // Calibração aplicada no meio da janela: o salto entre "antes" e "depois" não é mudança real
  const recemCalibrado = await criarViveiro('pH recém-calibrado', { tensao_ph7: 2.5, tensao_ph4: 3.03, calibracao_ph_em: new Date(now.getTime() - 12 * 60_000) });
  await mudancaDePh(recemCalibrado);
  await processReading(recemCalibrado, now);
  assert.equal((await avisosPh(recemCalibrado)).length, 0);
});
