// Inscrições de push que nunca mais vão funcionar são desativadas (a API para de tentar);
// falhas temporárias ou de configuração do servidor não desativam ninguém.
import { afterAll, beforeAll, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import PushSubscription from '../models/PushSubscriptions.js';
import { connectTestDatabase, dropTestDatabase, seedFixtures } from './fixtures.js';

// Resposta simulada do serviço de push para cada aparelho (pelo endereço da inscrição)
const RESPOSTAS = {
  'https://fcm.googleapis.com/fcm/send/chave-antiga': { statusCode: 403,
    body: 'the VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions.\n' },
  'https://web.push.apple.com/chave-antiga': { statusCode: 400, body: '{"reason":"VapidPkHashMismatch"}' },
  'https://fcm.googleapis.com/fcm/send/cancelada': { statusCode: 410, body: 'push subscription has unsubscribed or expired.' },
  'https://fcm.googleapis.com/fcm/send/instavel': { statusCode: 500, body: 'Internal error' },
  'https://fcm.googleapis.com/fcm/send/servidor-mal-configurado': { statusCode: 403, body: 'invalid JWT provided' },
  'https://fcm.googleapis.com/fcm/send/ok': null,
};

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (subscription) => {
      const erro = RESPOSTAS[subscription.endpoint];
      if (erro) throw Object.assign(new Error('Received unexpected response code'), erro);
      return { statusCode: 201 };
    },
  },
}));

process.env.NODE_ENV = 'test';
const { inscricaoInvalida, default: alertService } = await import('../services/alertService.js');

let fixtures;

beforeAll(async () => {
  await connectTestDatabase('push');
  fixtures = await seedFixtures();
}, 15000);

afterAll(async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  if (mongoose.connection.readyState) await dropTestDatabase();
});

test('inscricaoInvalida: só "cancelada" e "chave diferente" invalidam a inscrição', () => {
  for (const [endpoint, erro] of Object.entries(RESPOSTAS)) {
    if (!erro) continue;
    const esperado = /chave-antiga|cancelada/.test(endpoint);
    assert.equal(inscricaoInvalida(erro), esperado, endpoint);
  }
  assert.equal(inscricaoInvalida({ statusCode: 404 }), true);
  assert.equal(inscricaoInvalida(undefined), false);
});

test('envio desativa inscrições com chave antiga ou canceladas e mantém as demais', async () => {
  process.env.VAPID_PUBLIC_KEY = 'publica-teste';
  process.env.VAPID_PRIVATE_KEY = 'privada-teste';
  const usuario = fixtures.users[0]._id; // membro da fazenda do cativeiro 0
  await PushSubscription.insertMany(Object.keys(RESPOSTAS).map(endpoint => ({
    userId: usuario, isActive: true, subscription: { endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } },
  })));

  const resultado = await alertService.sendPush({
    cativeiro: fixtures.cativeiros[0]._id, cativeiroNome: 'Viveiro CI 0', tipo: 'ph', mensagem: 'teste', severidade: 'media',
  });
  assert.equal(resultado.attempted, 6);
  assert.equal(resultado.sent, 1);
  assert.equal(resultado.failed, 5);

  const ativas = (await PushSubscription.find({ isActive: true }).lean()).map(s => s.subscription.endpoint).sort();
  assert.deepEqual(ativas, [
    'https://fcm.googleapis.com/fcm/send/instavel',
    'https://fcm.googleapis.com/fcm/send/ok',
    'https://fcm.googleapis.com/fcm/send/servidor-mal-configurado',
  ]);
});
