import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const apiURL = 'http://127.0.0.1:4100';
async function login(page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email', { exact: true }).fill('membro-a@example.invalid');
  await page.getByPlaceholder('Senha', { exact: true }).fill('Teste-local-123!');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test('login no navegador rejeita credenciais incorretas', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email', { exact: true }).fill('membro-a@example.invalid');
  await page.getByPlaceholder('Senha', { exact: true }).fill('incorreta');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(page.getByText('Usuário ou senha inválidos!')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('sensor → banco → dashboard ao vivo e acesso direto ao relatório', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  const fixtureResponse = await request.get(`${apiURL}/__fixtures`);
  const { cativeiroId } = await fixtureResponse.json();
  await page.goto(`/dashboard?id=${cativeiroId}`);
  // Aguarda a primeira resposta SSE antes de enviar a leitura.
  await expect(page.getByText('Temperatura', { exact: true }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(sessionStorage.getItem('token')))).toBe(true);
  const response = await request.post(`${apiURL}/parametros/cadastrar`, {
    data: { id_cativeiro: cativeiroId, temperatura: 31.7, ph: 7.4, amonia: 0.15 },
  });
  expect(response.status()).toBe(201);
  await expect(page.getByText(/31[.,]7/).first()).toBeVisible();
  const report = await page.goto(`/rel-individual/${cativeiroId}`);
  expect(report.status()).toBe(200);
  await page.getByRole('button', { name: /Relatório Semanal/ }).click();
  await expect(page).toHaveURL(/periodo=semana/);
  await expect(page.getByText(/31[.,]7/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/31[.,]7/).first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '⬇️ PDF', exact: true }).click(),
  ]);
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(errors).toEqual([]);
});

test('leitura autenticada → aviso no dashboard e em Notificações', async ({ page, request }) => {
  const { cativeiroId } = await (await request.get(`${apiURL}/__fixtures`)).json();
  const masterLogin = await request.post(`${apiURL}/users/auth`, {
    data: { email: 'master@example.invalid', senha: 'Teste-local-123!' },
  });
  const { token: masterToken } = await masterLogin.json();
  const provision = await request.post(`${apiURL}/parametros/dispositivos/${cativeiroId}/chave`, {
    headers: { Authorization: `Bearer ${masterToken}` },
  });
  expect(provision.status()).toBe(200);
  const { chave } = await provision.json();
  await login(page);
  await page.goto(`/dashboard?id=${cativeiroId}`);
  await expect(page.getByText('Temperatura', { exact: true }).first()).toBeVisible();
  for (let i = 0; i < 6; i++) {
    const response = await request.post(`${apiURL}/parametros/cadastrar`, {
      headers: { 'X-Device-Key': chave },
      data: { id_cativeiro: cativeiroId, temperatura: i < 3 ? 28 : 29.8,
        ph: i < 3 ? 7 : 8, amonia: i < 3 ? 0.2 : 0.3, amostraId: `browser-${i}` },
    });
    expect(response.status()).toBe(201);
  }
  await expect(page.getByText('Aviso ativo').first()).toBeVisible();
  await expect(page.getByText(/sensor sem calibração/).first()).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByText(/mudança|aumento persistente/).first()).toBeVisible();
  await expect(page.getByText(/sensor sem calibração/).first()).toBeVisible();
});
