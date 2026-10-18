import ParametrosAtuais from '../models/Parametros_atuais.js';
import Cativeiros from '../models/Cativeiros.js';
import Aviso from '../models/Aviso.js';
import DeviceCredential from '../models/DeviceCredential.js';
import alertService from './alertService.js';

const WINDOW_MS = 90 * 60_000;
const MAX_GAP_MS = 20 * 60_000;
const STALE_MS = 15 * 60_000;
const SENSOR_INATIVO_MS = 3 * 60 * 60_000; // 3h sem leitura autenticada de um dispositivo provisionado
const fields = { temperatura: 'temp_atual', ph: 'ph_atual', amonia: 'amonia_atual' };
export const VALID_READING_FILTER = {
  temp_atual: { $gte: -5, $lte: 50 },
  ph_atual: { $gte: 0, $lte: 14 },
  amonia_atual: { $gte: 0, $lte: 500 },
};
// Padrões usados quando o viveiro não tem sensibilidade própria configurada.
export const DEFAULT_PH_LIMIAR = 0.35;
export const DEFAULT_AMONIA_LIMIAR_PCT = 0.25;
export const DEFAULT_AMONIA_LIMIAR_MIN = 0.05;
const RECOVERY_RATIO = 0.6;
const round = value => Number(value.toFixed(3));
const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;

export function freshness(reading, now = new Date()) {
  if (!reading) return { estado: 'sem_dados', ultimaLeitura: null, idadeMinutos: null };
  const age = Math.max(0, Math.floor((now - new Date(reading.datahora)) / 60_000));
  return { estado: age * 60_000 > STALE_MS ? 'antigo' : 'recente', ultimaLeitura: reading.datahora, idadeMinutos: age, origem: reading.origem || 'legado' };
}

// Pure rule: six authenticated readings, no long gap, a sustained final half.
export function evaluate(readings, bounds = {}, now = new Date()) {
  const ordered = [...readings].sort((a, b) => new Date(a.datahora) - new Date(b.datahora));
  const recent = ordered.slice(-6);
  if (recent.length < 6) return { suficiente: false, razao: 'leituras_insuficientes', motivos: [] };
  if (now - new Date(recent.at(-1).datahora) > STALE_MS) return { suficiente: false, razao: 'leitura_antiga', motivos: [] };
  if (recent.some((r, i) => i && new Date(r.datahora) - new Date(recent[i - 1].datahora) > MAX_GAP_MS)) {
    return { suficiente: false, razao: 'lacuna', motivos: [] };
  }
  const motivos = [];
  for (const [tipo, field] of Object.entries(fields)) {
    const first = recent.slice(0, 3).map(r => r[field]);
    const last = recent.slice(3).map(r => r[field]);
    const base = mean(first), current = mean(last), delta = current - base;
    const allMove = last.every(value => Math.sign(value - base) === Math.sign(delta));
    if (!allMove) continue;
    let limite;
    let triggered = false;
    if (tipo === 'temperatura') {
      const min = bounds.temp_min, max = bounds.temp_max;
      if (Number.isFinite(max) && delta >= 0.3 && current >= max - 0.5) { limite = max; triggered = true; }
      if (Number.isFinite(min) && delta <= -0.3 && current <= min + 0.5) { limite = min; triggered = true; }
    } else if (tipo === 'ph') {
      const threshold = Number.isFinite(bounds.ph_limiar) ? bounds.ph_limiar : DEFAULT_PH_LIMIAR;
      triggered = Math.abs(delta) >= threshold;
    } else {
      const minimo = Number.isFinite(bounds.amonia_limiar_min) ? bounds.amonia_limiar_min : DEFAULT_AMONIA_LIMIAR_MIN;
      const pct = Number.isFinite(bounds.amonia_limiar_pct) ? bounds.amonia_limiar_pct : DEFAULT_AMONIA_LIMIAR_PCT;
      triggered = Math.abs(delta) >= Math.max(minimo, Math.abs(base) * pct);
    }
    if (!triggered) continue;
    const direcao = delta > 0 ? 'aumento' : 'queda';
    const label = tipo === 'temperatura' ? 'Temperatura' : tipo === 'ph' ? 'pH' : 'Amônia';
    const mensagem = tipo === 'temperatura'
      ? `Temperatura se aproxima do limite de ${limite} °C (${round(base)} → ${round(current)} °C). Confira o sensor e a água.`
      : `${label} apresenta ${direcao} persistente (${round(base)} → ${round(current)}). Medição experimental: confira o sensor e a água.`;
    motivos.push({ tipo, mensagem, experimental: tipo !== 'temperatura', periodoInicio: recent[0].datahora,
      periodoFim: recent.at(-1).datahora, valorInicial: round(base), valorAtual: round(current), limite, direcao });
  }
  return { suficiente: true, razao: null, motivos };
}

export const TREND_WINDOW_MS = 4 * 60 * 60_000;
export const TREND_HORIZON_MS = 3 * 60 * 60_000;
export const TREND_MIN_POINTS = 8;

// Mínimos quadrados sobre (tempo em ms desde o início da janela, valor). Pura e testável
// isoladamente, igual ao restante das regras deste arquivo.
export function linearRegression(points) {
  const n = points.length;
  const sumT = points.reduce((s, p) => s + p.t, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumTY = points.reduce((s, p) => s + p.t * p.y, 0);
  const sumTT = points.reduce((s, p) => s + p.t * p.t, 0);
  const denom = n * sumTT - sumT * sumT;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumTY - sumT * sumY) / denom;
  const intercept = (sumY - slope * sumT) / n;
  return { slope, intercept };
}

// Diferente de evaluate() (que só reage quando o valor já se moveu o bastante), aqui
// projetamos a tendência atual para além da última leitura: se o padrão se mantiver,
// o limite seria cruzado dentro do horizonte configurado? Isso é o aviso antecipado de
// verdade — convive com o aviso reativo (preditivo:true vs preditivo:false no modelo).
export function projectTrend(readings, bounds = {}, now = new Date()) {
  const ordered = [...readings].sort((a, b) => new Date(a.datahora) - new Date(b.datahora));
  if (ordered.length < TREND_MIN_POINTS) return { suficiente: false, razao: 'leituras_insuficientes', motivos: [] };
  if (now - new Date(ordered.at(-1).datahora) > STALE_MS) return { suficiente: false, razao: 'leitura_antiga', motivos: [] };
  const t0 = new Date(ordered[0].datahora).getTime();
  const nowT = now.getTime() - t0;
  const motivos = [];
  for (const [tipo, field] of Object.entries(fields)) {
    const points = ordered.map(r => ({ t: new Date(r.datahora).getTime() - t0, y: r[field] }));
    const { slope, intercept } = linearRegression(points);
    if (slope === 0) continue;
    const current = round(slope * nowT + intercept);
    const projetado = round(slope * (nowT + TREND_HORIZON_MS) + intercept);
    let triggered = false, limite, direcao, horasAteCruzar;
    if (tipo === 'temperatura') {
      const { temp_min: min, temp_max: max } = bounds;
      if (slope > 0 && Number.isFinite(max) && current < max && projetado >= max) {
        triggered = true; limite = max; direcao = 'aumento'; horasAteCruzar = (max - current) / slope / 3_600_000;
      } else if (slope < 0 && Number.isFinite(min) && current > min && projetado <= min) {
        triggered = true; limite = min; direcao = 'queda'; horasAteCruzar = (min - current) / slope / 3_600_000;
      }
    } else {
      const baseline = round(intercept);
      const deltaAtual = current - baseline;
      const deltaProjetado = projetado - baseline;
      const limiar = tipo === 'ph'
        ? (Number.isFinite(bounds.ph_limiar) ? bounds.ph_limiar : DEFAULT_PH_LIMIAR)
        : Math.max(
            Number.isFinite(bounds.amonia_limiar_min) ? bounds.amonia_limiar_min : DEFAULT_AMONIA_LIMIAR_MIN,
            Math.abs(baseline) * (Number.isFinite(bounds.amonia_limiar_pct) ? bounds.amonia_limiar_pct : DEFAULT_AMONIA_LIMIAR_PCT));
      if (Math.abs(deltaAtual) < limiar && Math.abs(deltaProjetado) >= limiar) {
        triggered = true; direcao = deltaProjetado > 0 ? 'aumento' : 'queda';
        horasAteCruzar = (limiar - Math.abs(deltaAtual)) / Math.abs(slope) / 3_600_000;
      }
    }
    if (!triggered) continue;
    const label = tipo === 'temperatura' ? 'Temperatura' : tipo === 'ph' ? 'pH' : 'Amônia';
    const horas = Math.max(1, Math.round(horasAteCruzar));
    const mensagem = tipo === 'temperatura'
      ? `Tendência indica que a temperatura deve atingir ${limite} °C em ~${horas}h, se o padrão atual continuar. Projeção baseada no histórico recente: confira o sensor e a água.`
      : `Tendência indica ${direcao} persistente de ${label.toLowerCase()} que deve ultrapassar o limite configurado em ~${horas}h, se o padrão atual continuar. Projeção baseada no histórico recente: confira o sensor e a água.`;
    motivos.push({ tipo, mensagem, experimental: true, periodoInicio: ordered[0].datahora, periodoFim: now,
      valorInicial: current, valorAtual: projetado, limite, direcao, preditivo: true });
  }
  return { suficiente: true, razao: null, motivos };
}

export function temperatureBounds(condition = {}) {
  const bounds = { ...condition };
  if (Number.isFinite(condition.temp_ideal)) {
    bounds.temp_min ??= condition.temp_ideal - 2;
    bounds.temp_max ??= condition.temp_ideal + 2;
  }
  return bounds;
}

export async function processReading(cativeiroId, now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_MS);
  const readings = await ParametrosAtuais.find({ id_cativeiro: cativeiroId, autenticada: true, ...VALID_READING_FILTER, datahora: { $gte: since, $lte: now } })
    .sort({ datahora: -1 }).limit(30).lean();
  const cativeiro = await Cativeiros.findById(cativeiroId).populate('condicoes_ideais').lean();
  if (!cativeiro) return;
  const bounds = temperatureBounds(cativeiro.condicoes_ideais || {});
  const result = evaluate(readings, bounds, now);
  const trendSince = new Date(now.getTime() - TREND_WINDOW_MS);
  const trendReadings = await ParametrosAtuais.find({ id_cativeiro: cativeiroId, autenticada: true, ...VALID_READING_FILTER, datahora: { $gte: trendSince, $lte: now } })
    .sort({ datahora: -1 }).limit(200).lean();
  const trendResult = projectTrend(trendReadings, bounds, now);
  if (!result.suficiente && !trendResult.suficiente) return;
  const active = await Aviso.find({ cativeiro: cativeiroId, estado: 'ativo' });
  const recovered = new Set();
  const key = (tipo, preditivo) => `${tipo}|${preditivo}`;
  for (const existing of active) {
      const field = fields[existing.tipo];
      const last = [...readings].sort((a, b) => new Date(b.datahora) - new Date(a.datahora)).slice(0, 3);
      const normal = last.length === 3 && last.every(r => {
        if (existing.tipo === 'temperatura') {
          const b = bounds;
          return (!Number.isFinite(b.temp_min) || r[field] > b.temp_min + 0.5) &&
            (!Number.isFinite(b.temp_max) || r[field] < b.temp_max - 0.5);
        }
        // Banda de recuperação mais estreita que o limiar de disparo (evita oscilar entre ativo/recuperado).
        if (existing.tipo === 'ph') {
          const limiar = Number.isFinite(bounds.ph_limiar) ? bounds.ph_limiar : DEFAULT_PH_LIMIAR;
          return Math.abs(r[field] - existing.valorInicial) < limiar * RECOVERY_RATIO;
        }
        const minimo = Number.isFinite(bounds.amonia_limiar_min) ? bounds.amonia_limiar_min : DEFAULT_AMONIA_LIMIAR_MIN;
        const pct = Number.isFinite(bounds.amonia_limiar_pct) ? bounds.amonia_limiar_pct : DEFAULT_AMONIA_LIMIAR_PCT;
        const threshold = Math.max(minimo * RECOVERY_RATIO, Math.abs(existing.valorInicial) * pct * RECOVERY_RATIO);
        return Math.abs(r[field] - existing.valorInicial) < threshold;
      });
      if (normal) {
        await Aviso.updateOne({ _id: existing._id, estado: 'ativo' }, { $set: { estado: 'recuperado', recuperadoEm: now } });
        recovered.add(key(existing.tipo, existing.preditivo));
      }
  }
  const reactiveCreated = new Set();
  for (const motivo of result.motivos) {
    if (active.some(a => a.tipo === motivo.tipo && !a.preditivo) || recovered.has(key(motivo.tipo, false))) continue;
    try {
      const aviso = await Aviso.create({ cativeiro: cativeiroId, ...motivo, preditivo: false });
      await deliverPending({ _id: aviso._id });
      reactiveCreated.add(motivo.tipo);
      // A tendência "se cumpriu": o aviso reativo já cobre o problema, o preditivo vira ruído.
      await Aviso.updateMany({ cativeiro: cativeiroId, tipo: motivo.tipo, preditivo: true, estado: 'ativo' }, { $set: { estado: 'recuperado', recuperadoEm: now } });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  for (const motivo of trendResult.motivos) {
    if (reactiveCreated.has(motivo.tipo) || active.some(a => a.tipo === motivo.tipo) || recovered.has(key(motivo.tipo, true))) continue;
    try {
      const aviso = await Aviso.create({ cativeiro: cativeiroId, ...motivo });
      await deliverPending({ _id: aviso._id });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
}

export const MAX_PUSH_ATTEMPTS = 3;
// Backoff crescente: 2min, 10min, 30min antes de desistir de vez.
const RETRY_BACKOFF_MS = [2, 10, 30].map(minutos => minutos * 60_000);

export async function deliverPending(filter = {}, now = new Date()) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  const pending = await Aviso.find({
    ...filter,
    pushStatus: 'pendente',
    $or: [{ proximaTentativaEm: { $exists: false } }, { proximaTentativaEm: null }, { proximaTentativaEm: { $lte: now } }],
  }).limit(100).populate('cativeiro', 'nome').lean();

  for (const aviso of pending) {
    const claimed = await Aviso.findOneAndUpdate({ _id: aviso._id, pushStatus: 'pendente' },
      { $set: { pushStatus: 'processando', pushTentadoEm: now } }, { new: false });
    if (!claimed) continue;
    try {
      const resultado = await alertService.sendPush({ cativeiro: aviso.cativeiro._id, cativeiroNome: aviso.cativeiro.nome,
        tipo: aviso.tipo, mensagem: aviso.mensagem, severidade: 'media' });
      if (resultado.attempted === 0) {
        // Ninguém com push ativo agora — não é uma falha, não entra na fila de retry.
        await Aviso.updateOne({ _id: aviso._id }, { $set: { pushStatus: 'sem_inscricao' } });
      } else if (resultado.sent > 0) {
        await Aviso.updateOne({ _id: aviso._id }, { $set: { pushStatus: 'enviado' } });
      } else {
        throw new Error(`Nenhuma entrega bem-sucedida (${resultado.failed} falha(s))`);
      }
    } catch (error) {
      console.error('Falha ao entregar aviso:', error);
      const tentativas = (claimed.pushTentativas || 0) + 1;
      if (tentativas >= MAX_PUSH_ATTEMPTS) {
        await Aviso.updateOne({ _id: aviso._id }, { $set: { pushStatus: 'falhou' }, $inc: { pushTentativas: 1 } });
      } else {
        await Aviso.updateOne({ _id: aviso._id }, {
          $set: { pushStatus: 'pendente', proximaTentativaEm: new Date(now.getTime() + RETRY_BACKOFF_MS[tentativas - 1]) },
          $inc: { pushTentativas: 1 },
        });
      }
    }
  }
}

// Detecta silêncio de um dispositivo provisionado (sensor desligado, sem energia, sem rede),
// algo que a detecção de tendência não cobre: sem leitura nova, não há tendência a avaliar.
// Só se aplica a cativeiros com chave de dispositivo gerada — não incomoda quem usa a
// ingestão manual/legada, que não tem expectativa de leituras contínuas.
export async function checkSensorInativo(cativeiroId, now = new Date()) {
  const temDispositivo = await DeviceCredential.exists({ cativeiro: cativeiroId });
  if (!temDispositivo) return;
  const ultima = await ParametrosAtuais.findOne({ id_cativeiro: cativeiroId, autenticada: true })
    .sort({ datahora: -1 }).lean();
  const inativo = !ultima || (now - new Date(ultima.datahora)) > SENSOR_INATIVO_MS;
  const ativo = await Aviso.findOne({ cativeiro: cativeiroId, tipo: 'sensor_inativo', estado: 'ativo' });
  if (inativo && !ativo) {
    const idadeHoras = ultima ? Math.round((now - new Date(ultima.datahora)) / 3_600_000) : null;
    const mensagem = ultima
      ? `Sensor sem leitura autenticada há cerca de ${idadeHoras}h. Confira alimentação, conexão e a chave configurada no dispositivo.`
      : 'Nenhuma leitura autenticada recebida deste dispositivo até agora. Confira a instalação e a chave configurada no sensor.';
    try {
      const aviso = await Aviso.create({
        cativeiro: cativeiroId, tipo: 'sensor_inativo', mensagem, experimental: false,
        periodoInicio: ultima?.datahora || now, periodoFim: now,
      });
      await deliverPending({ _id: aviso._id }, now);
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  } else if (!inativo && ativo) {
    await Aviso.updateOne({ _id: ativo._id, estado: 'ativo' }, { $set: { estado: 'recuperado', recuperadoEm: now } });
  }
}
