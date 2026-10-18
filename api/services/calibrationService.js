import Aviso from '../models/Aviso.js';
import Cativeiros from '../models/Cativeiros.js';
import { temperatureBounds, DEFAULT_PH_LIMIAR, DEFAULT_AMONIA_LIMIAR_PCT } from './avisoService.js';

// Camada 2 da pipeline de avisos: aprende com o feedback humano (Aviso.avaliacao) para
// sugerir limiares menos ruidosos. Só enxerga falso positivo (avisou e não era nada) — não
// tem como saber se um limiar está frouxo demais, pois um problema que nunca cruzou o limiar
// nunca vira aviso nem avaliação. Por isso só sugere afrouxar, nunca apertar.
export const MIN_AMOSTRAS = 5;
export const FALSO_ALARME_LIMIAR = 0.5;
export const INCREMENTO_PCT = 1.2;
export const INCREMENTO_TEMP = 0.5;
export const PH_LIMIAR_MAX = 3;
export const AMONIA_LIMIAR_PCT_MAX = 1;
const round = value => Number(value.toFixed(3));

// Pura: recebe os avisos já avaliados de um tipo + os limiares em vigor, devolve a
// sugestão ou null. Testável sem banco.
export function suggestForTipo(tipo, avaliados, bounds = {}) {
  if (avaliados.length < MIN_AMOSTRAS) return null;
  const falsos = avaliados.filter(a => a.avaliacao === 'falso_alarme').length;
  const taxaFalsoAlarme = falsos / avaliados.length;
  if (taxaFalsoAlarme < FALSO_ALARME_LIMIAR) return null;
  const motivo = `${falsos} de ${avaliados.length} avisos recentes foram marcados como falso alarme.`;
  const base = { amostras: avaliados.length, taxaFalsoAlarme: round(taxaFalsoAlarme), motivo };

  if (tipo === 'temperatura') {
    const { temp_min: minimo, temp_max: maximo } = bounds;
    if (!Number.isFinite(minimo) || !Number.isFinite(maximo)) return null;
    return { ...base, campo: 'temperatura',
      valorAtual: { minimo, maximo },
      valorSugerido: { minimo: round(minimo - INCREMENTO_TEMP), maximo: round(maximo + INCREMENTO_TEMP) } };
  }
  if (tipo === 'ph') {
    const atual = Number.isFinite(bounds.ph_limiar) ? bounds.ph_limiar : DEFAULT_PH_LIMIAR;
    const sugerido = Math.min(PH_LIMIAR_MAX, round(atual * INCREMENTO_PCT));
    if (sugerido <= atual) return null;
    return { ...base, campo: 'ph', valorAtual: atual, valorSugerido: sugerido };
  }
  if (tipo === 'amonia') {
    const atual = Number.isFinite(bounds.amonia_limiar_pct) ? bounds.amonia_limiar_pct : DEFAULT_AMONIA_LIMIAR_PCT;
    const sugerido = Math.min(AMONIA_LIMIAR_PCT_MAX, round(atual * INCREMENTO_PCT));
    if (sugerido <= atual) return null;
    return { ...base, campo: 'amonia', valorAtual: atual, valorSugerido: sugerido };
  }
  return null;
}

export async function suggestThresholdAdjustments(cativeiroId) {
  const cativeiro = await Cativeiros.findById(cativeiroId).populate('condicoes_ideais').lean();
  if (!cativeiro) return null;
  const bounds = temperatureBounds(cativeiro.condicoes_ideais || {});
  const avisos = await Aviso.find({
    cativeiro: cativeiroId, tipo: { $in: ['temperatura', 'ph', 'amonia'] },
    verificadoEm: { $exists: true, $ne: null },
  }).select('tipo avaliacao').lean();
  const porTipo = { temperatura: [], ph: [], amonia: [] };
  for (const aviso of avisos) porTipo[aviso.tipo]?.push(aviso);
  return Object.fromEntries(Object.entries(porTipo).map(([tipo, avaliados]) => [tipo, suggestForTipo(tipo, avaliados, bounds)]));
}
