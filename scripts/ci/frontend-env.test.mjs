import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function check(values) {
  return spawnSync(process.execPath, ['front-react/scripts/check-env.js'], {
    env: { VERCEL_ENV: 'production', ...values }, encoding: 'utf8',
  }).status;
}
test('build de produção exige URLs públicas e HTTPS', () => {
  assert.equal(check({}), 1);
  assert.equal(check({ NEXT_PUBLIC_API_URL: 'http://localhost:4000', NEXT_PUBLIC_SSE_URL: 'http://localhost:4000' }), 1);
  assert.equal(check({ NEXT_PUBLIC_API_URL: 'https://api.example.invalid', NEXT_PUBLIC_SSE_URL: 'https://api.example.invalid' }), 0);
});
test('build de produção recusa URLs de homologação diferentes da API aprovada', () => {
  assert.equal(check({ API_URL: 'https://api.example.invalid', NEXT_PUBLIC_API_URL: 'https://staging.example.invalid', NEXT_PUBLIC_SSE_URL: 'https://staging.example.invalid' }), 1);
});
