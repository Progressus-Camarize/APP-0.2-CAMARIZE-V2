import { test } from 'vitest';
import assert from 'node:assert/strict';
import { suggestForTipo, MIN_AMOSTRAS, PH_LIMIAR_MAX } from '../services/calibrationService.js';

const avaliados = (falsos, confirmados) => [
  ...Array(falsos).fill({ avaliacao: 'falso_alarme' }),
  ...Array(confirmados).fill({ avaliacao: 'confirmado' }),
];

test('sem amostra mínima não sugere nada', () => {
  assert.equal(suggestForTipo('ph', avaliados(MIN_AMOSTRAS - 1, 0), {}), null);
});

test('taxa de falso alarme abaixo do limiar não sugere nada', () => {
  assert.equal(suggestForTipo('ph', avaliados(2, 8), {}), null);
});

test('maioria falso alarme sugere afrouxar pH, respeitando o teto', () => {
  const sugestao = suggestForTipo('ph', avaliados(4, 1), { ph_limiar: 0.35 });
  assert.ok(sugestao);
  assert.equal(sugestao.campo, 'ph');
  assert.equal(sugestao.valorAtual, 0.35);
  assert.ok(sugestao.valorSugerido > sugestao.valorAtual);

  const jaNoTeto = suggestForTipo('ph', avaliados(4, 1), { ph_limiar: PH_LIMIAR_MAX });
  assert.equal(jaNoTeto, null, 'não deve sugerir subir além do teto permitido');
});

test('maioria falso alarme sugere afrouxar amônia', () => {
  const sugestao = suggestForTipo('amonia', avaliados(3, 2), { amonia_limiar_pct: 0.25 });
  assert.ok(sugestao);
  assert.equal(sugestao.campo, 'amonia');
  assert.ok(sugestao.valorSugerido > sugestao.valorAtual);
});

test('maioria falso alarme sugere alargar a banda de temperatura', () => {
  const sugestao = suggestForTipo('temperatura', avaliados(5, 0), { temp_min: 26, temp_max: 30 });
  assert.ok(sugestao);
  assert.deepEqual(sugestao.valorAtual, { minimo: 26, maximo: 30 });
  assert.ok(sugestao.valorSugerido.minimo < 26 && sugestao.valorSugerido.maximo > 30);
});

test('temperatura sem bounds configurados não sugere nada', () => {
  assert.equal(suggestForTipo('temperatura', avaliados(5, 0), {}), null);
});
