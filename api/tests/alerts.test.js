import { beforeAll, afterAll, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ParametrosAtuais from '../models/Parametros_atuais.js';
import Aviso from '../models/Aviso.js';
import alertService from '../services/alertService.js';
import { evaluate, processReading, deliverPending, freshness } from '../services/avisoService.js';
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

const samples = (values, start = Date.now() - 5 * 60_000) => values.map((v, i) => ({
  datahora: new Date(start + i * 60_000), temp_atual: v[0], ph_atual: v[1], amonia_atual: v[2],
}));

test('regras: normal, ruído isolado, tendência persistente, lacuna e dado antigo', () => {
  const bounds = { temp_min: 26, temp_max: 30 };
  const normal = samples(Array(6).fill([28, 7, 0.2]));
  assert.deepEqual(evaluate(normal, bounds).motivos, []);
  const noise = samples([[28,7,0.2],[28,7,0.2],[28,7,0.2],[31,8,0.5],[28,7,0.2],[28,7,0.2]]);
  assert.deepEqual(evaluate(noise, bounds).motivos, []);
  const trend = samples([[28,7,0.2],[28,7,0.2],[28,7,0.2],[29.5,7.7,0.3],[29.7,7.8,0.32],[29.8,7.9,0.34]]);
  const result = evaluate(trend, bounds);
  assert.deepEqual(result.motivos.map(a => a.tipo), ['temperatura', 'ph', 'amonia']);
  assert.ok(result.motivos.filter(a => a.experimental).length === 2);
  assert.equal(evaluate(trend.map((s, i) => ({ ...s, datahora: new Date(Date.now() - (130 - i * 25) * 60_000) })), bounds).suficiente, false);
  assert.equal(evaluate(trend, bounds, new Date(Date.now() + 20 * 60_000)).suficiente, false);
  assert.equal(freshness({ datahora: new Date(Date.now() - 20 * 60_000) }).estado, 'antigo');
});

test('ocorrência única, recuperação e nova ocorrência; somente leitura autenticada conta', async () => {
  const pond = fixtures.cativeiros[0]._id;
  const create = async (values, authenticated = true, minutesAgo = 5) => {
    const start = Date.now() - (minutesAgo + 5) * 60_000;
    await ParametrosAtuais.insertMany(samples(values, start).map((v, i) => ({
      id_cativeiro: pond, autenticada: authenticated, origem: authenticated ? 'dispositivo' : 'legado',
      amostraId: `${Date.now()}_${i}_${Math.random()}`, ...v,
    })));
  };
  await create([[28,7,0.2],[28,7,0.2],[28,7,0.2],[28,8,0.2],[28,8,0.2],[28,8,0.2]], false, 20);
  await processReading(pond, new Date(Date.now() - 19 * 60_000));
  assert.equal(await Aviso.countDocuments(), 0);
  await create([[28,7,0.2],[28,7,0.2],[28,7,0.2],[28,8,0.2],[28,8,0.2],[28,8,0.2]], true, 15);
  await processReading(pond, new Date(Date.now() - 14 * 60_000));
  await processReading(pond, new Date(Date.now() - 14 * 60_000));
  assert.equal(await Aviso.countDocuments({ tipo: 'ph' }), 1);
  assert.equal((await Aviso.findOne({ tipo: 'ph' })).pushStatus, 'pendente');
  process.env.VAPID_PUBLIC_KEY = 'teste';
  process.env.VAPID_PRIVATE_KEY = 'teste';
  const push = vi.spyOn(alertService, 'sendPush').mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });
  await deliverPending();
  await deliverPending();
  assert.equal(push.mock.calls.length, 1);
  push.mockRestore();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  await create(Array(6).fill([28,7,0.2]), true, 8);
  await processReading(pond, new Date(Date.now() - 7 * 60_000));
  assert.equal((await Aviso.findOne({ tipo: 'ph' })).estado, 'recuperado');
  await create([[28,7,0.2],[28,7,0.2],[28,7,0.2],[28,8,0.2],[28,8,0.2],[28,8,0.2]], true, 1);
  await processReading(pond);
  assert.equal(await Aviso.countDocuments({ tipo: 'ph' }), 2);
});

test('push: falha real tenta de novo com backoff até esgotar e marca "falhou"; sem inscrição marca "sem_inscricao" sem retry', async () => {
  const pond = fixtures.cativeiros[1]._id;
  const trend = samples([[28,7,0.2],[28,7,0.2],[28,7,0.2],[29.5,7.7,0.3],[29.7,7.8,0.32],[29.8,7.9,0.34]], Date.now() - 10 * 60_000);
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
