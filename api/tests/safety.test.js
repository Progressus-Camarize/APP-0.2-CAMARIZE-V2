import { test } from 'vitest';
import assert from 'node:assert/strict';
import { connectTestDatabase } from './fixtures.js';

test('testes recusam Atlas, banco nomeado, query string e credenciais', async () => {
  const credentialURL = new URL('mongodb://127.0.0.1:27028');
  credentialURL.username = 'fixture';
  credentialURL.password = 'fixture';
  const previous = process.env.MONGO_TEST_URL;
  try {
    for (const uri of ['mongodb+srv://cluster.example.invalid', 'mongodb://127.0.0.1:27028/producao',
      'mongodb://127.0.0.1:27028?authSource=admin', credentialURL.href]) {
      process.env.MONGO_TEST_URL = uri;
      await assert.rejects(connectTestDatabase('safety'), /MongoDB local/);
    }
  } finally {
    if (previous === undefined) delete process.env.MONGO_TEST_URL;
    else process.env.MONGO_TEST_URL = previous;
  }
});
