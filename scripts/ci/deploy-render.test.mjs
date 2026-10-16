import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployRender, waitForHealth } from './deploy-render.mjs';

const commit = 'a'.repeat(40);
const params = { token: 'token-simulado', serviceId: 'srv-teste', commit, sleep: async () => {} };
const response = data => ({ ok: true, json: async () => data });

test('publicação aguarda status live e verifica o SHA exato', async () => {
  const replies = [[], { id: 'dep-ci' }, { status: 'build_in_progress' }, { id: 'dep-ci', status: 'live', commit: { id: commit } }];
  const calls = [];
  const result = await deployRender({ ...params, request: async (url, options) => { calls.push({ url, options }); return response(replies.shift()); } });
  assert.equal(result.deploymentId, 'dep-ci');
  assert.deepEqual(JSON.parse(calls[1].options.body), { commitId: commit });
  assert.equal(calls.length, 4);
});

test('publicação falha se o Render rejeitar o build ou servir outro commit', async () => {
  for (const final of [{ status: 'build_failed' }, { status: 'live', commit: { id: 'b'.repeat(40) } }]) {
    const replies = [[], { id: 'dep-ci' }, final];
    await assert.rejects(deployRender({ ...params, request: async () => response(replies.shift()) }));
  }
});

test('readiness rejeita a versão anterior e aceita somente banco conectado no commit esperado', async () => {
  const replies = [
    { database: 'connected', status: 'healthy', commit: 'anterior' },
    { database: 'disconnected', status: 'unavailable', commit },
    { database: 'connected', status: 'healthy', commit },
  ];
  await waitForHealth({ apiURL: 'https://api.example.invalid', commit, sleep: async () => {}, request: async () => response(replies.shift()) });
  assert.equal(replies.length, 0);
});

test('falha e timeout nunca liberam frontend sem readiness válida', async () => {
  await assert.rejects(waitForHealth({ apiURL: 'https://api.example.invalid', commit, attempts: 2,
    sleep: async () => {}, request: async () => ({ ok: false }) }));
  await assert.rejects(deployRender({ ...params, attempts: 1,
    request: async url => response(url.endsWith('?limit=20') ? [] : { id: 'dep-ci', status: 'build_in_progress' }) }));
});
