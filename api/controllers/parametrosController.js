import mongoose from "mongoose";
import ParametrosAtuais from "../models/Parametros_atuais.js";
import Cativeiros from "../models/Cativeiros.js";
import cativeiroController from "../controllers/cativeiroController.js";
import parametrosEmitter from "../services/parametrosEmitter.js";
import crypto from 'node:crypto';
import DeviceCredential from '../models/DeviceCredential.js';
import DeviceCredentialHistory from '../models/DeviceCredentialHistory.js';
import Aviso from '../models/Aviso.js';
import CondicoesIdeais from '../models/Condicoes_ideais.js';
import { processReading, freshness, evaluate, temperatureBounds, VALID_READING_FILTER } from '../services/avisoService.js';
import { suggestThresholdAdjustments } from '../services/calibrationService.js';

const validReading = ({ temperatura, ph, amonia }) =>
  [temperatura, ph, amonia].every(Number.isFinite) &&
  temperatura >= -5 && temperatura <= 50 && ph >= 0 && ph <= 14 && amonia >= 0 && amonia <= 500;

const credentialHash = key => crypto.createHash('sha256').update(key).digest('hex');

const provisionDevice = async (req, res) => {
  const { cativeiroId } = req.params;
  if (!mongoose.isValidObjectId(cativeiroId)) return res.status(400).json({ error: 'ID inválido' });
  if (req.loggedUser.role === 'membro') return res.status(403).json({ error: 'Acesso negado' });
  const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
  if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  if (!access) return res.status(403).json({ error: 'Acesso negado' });
  if (!await Cativeiros.exists({ _id: cativeiroId })) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  const key = crypto.randomBytes(32).toString('hex');
  await DeviceCredential.findOneAndUpdate({ cativeiro: cativeiroId },
    { keyHash: credentialHash(key), updatedAt: new Date() }, { upsert: true });
  // Auditoria: nunca guarda a chave, só quem gerou e quando — permite investigar depois
  // se um sensor "parou de funcionar" porque alguém trocou a chave sem avisar.
  await DeviceCredentialHistory.create({ cativeiro: cativeiroId, geradoPor: req.loggedUser.id });
  res.json({ chave: key, aviso: 'Guarde esta chave no ESP32. Ela será exibida somente agora; gerar outra revoga a anterior.' });
};

const getDeviceCredentialHistory = async (req, res) => {
  const { cativeiroId } = req.params;
  if (!mongoose.isValidObjectId(cativeiroId)) return res.status(400).json({ error: 'ID inválido' });
  if (req.loggedUser.role === 'membro') return res.status(403).json({ error: 'Acesso negado' });
  const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
  if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  if (!access) return res.status(403).json({ error: 'Acesso negado' });
  const historico = await DeviceCredentialHistory.find({ cativeiro: cativeiroId })
    .sort({ geradoEm: -1 }).populate('geradoPor', 'nome email role').lean();
  res.json({ historico: historico.map(h => ({
    geradoEm: h.geradoEm,
    geradoPor: h.geradoPor ? { id: h.geradoPor._id, nome: h.geradoPor.nome, email: h.geradoPor.email, role: h.geradoPor.role } : null,
  })) });
};

const updateTemperatureLimits = async (req, res) => {
  const { cativeiroId } = req.params;
  if (!mongoose.isValidObjectId(cativeiroId)) return res.status(400).json({ error: 'ID inválido' });
  if (req.loggedUser.role === 'membro') return res.status(403).json({ error: 'Acesso negado' });
  const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
  if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  if (!access) return res.status(403).json({ error: 'Acesso negado' });
  const { minimo, maximo } = req.body;
  if (!Number.isFinite(minimo) || !Number.isFinite(maximo) || minimo < -5 || maximo > 50 || minimo >= maximo) {
    return res.status(400).json({ error: 'Limites de temperatura inválidos' });
  }
  const cativeiro = await Cativeiros.findById(cativeiroId).lean();
  if (!cativeiro) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  if (!cativeiro.condicoes_ideais) return res.status(409).json({ error: 'Configure primeiro as condições do viveiro' });
  await CondicoesIdeais.updateOne({ _id: cativeiro.condicoes_ideais }, { $set: { temp_min: minimo, temp_max: maximo } });
  res.json({ minimo, maximo });
};

// pH e amônia usavam limiares fixos no código, iguais para qualquer viveiro.
// Este endpoint permite calibrar por cativeiro, com os padrões do código como fallback.
const updateSensitivityLimits = async (req, res) => {
  const { cativeiroId } = req.params;
  if (!mongoose.isValidObjectId(cativeiroId)) return res.status(400).json({ error: 'ID inválido' });
  if (req.loggedUser.role === 'membro') return res.status(403).json({ error: 'Acesso negado' });
  const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
  if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  if (!access) return res.status(403).json({ error: 'Acesso negado' });
  const { phLimiar, amoniaLimiarPct } = req.body;
  if (!Number.isFinite(phLimiar) || !Number.isFinite(amoniaLimiarPct) ||
      phLimiar < 0.05 || phLimiar > 3 || amoniaLimiarPct < 0.05 || amoniaLimiarPct > 1) {
    return res.status(400).json({ error: 'Limiares de sensibilidade inválidos' });
  }
  const cativeiro = await Cativeiros.findById(cativeiroId).lean();
  if (!cativeiro) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  if (!cativeiro.condicoes_ideais) return res.status(409).json({ error: 'Configure primeiro as condições do viveiro' });
  await CondicoesIdeais.updateOne({ _id: cativeiro.condicoes_ideais },
    { $set: { ph_limiar: phLimiar, amonia_limiar_pct: amoniaLimiarPct } });
  res.json({ phLimiar, amoniaLimiarPct });
};

// Camada 2 da pipeline de avisos: sugestão de limiares com base no histórico de avaliações
// (confirmado/falso_alarme) já registradas pelo admin/master. Nunca aplica sozinha — só sugere.
const getThresholdSuggestions = async (req, res) => {
  const { cativeiroId } = req.params;
  if (!mongoose.isValidObjectId(cativeiroId)) return res.status(400).json({ error: 'ID inválido' });
  if (req.loggedUser.role === 'membro') return res.status(403).json({ error: 'Acesso negado' });
  const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
  if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  if (!access) return res.status(403).json({ error: 'Acesso negado' });
  const sugestoes = await suggestThresholdAdjustments(cativeiroId);
  if (!sugestoes) return res.status(404).json({ error: 'Cativeiro não encontrado' });
  res.json({ sugestoes });
};

// POST - Receber dados dos sensores do ESP32
const cadastrarParametros = async (req, res) => {
  try {
    const { id_cativeiro, temperatura, ph, amonia } = req.body;

    if (!id_cativeiro || !mongoose.isValidObjectId(id_cativeiro)) {
      return res.status(400).json({ error: "ID do cativeiro é obrigatório" });
    }

    if (temperatura === undefined || ph === undefined || amonia === undefined) {
      return res.status(400).json({ error: "Temperatura, pH e amônia são obrigatórios" });
    }

    if (!validReading({ temperatura, ph, amonia })) {
      return res.status(400).json({ error: "Leitura fora da faixa física aceita ou não numérica" });
    }

    const cativeiro = await Cativeiros.findById(id_cativeiro);
    if (!cativeiro) {
      return res.status(404).json({ error: "Cativeiro não encontrado" });
    }

    const suppliedKey = req.get('X-Device-Key');
    const credential = await DeviceCredential.findOne({ cativeiro: id_cativeiro }).lean();
    let authenticated = false;
    if (suppliedKey) {
      const suppliedHash = credentialHash(suppliedKey);
      authenticated = !!credential && crypto.timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(credential.keyHash, 'hex'));
      if (!authenticated) return res.status(401).json({ error: 'Chave do dispositivo inválida' });
    }
    const amostraId = req.body.amostraId;
    if (amostraId !== undefined && (typeof amostraId !== 'string' || !/^[A-Za-z0-9:_-]{1,80}$/.test(amostraId))) {
      return res.status(400).json({ error: 'amostraId inválido' });
    }
    if (authenticated && amostraId) {
      const repeated = await ParametrosAtuais.findOne({ id_cativeiro, amostraId, autenticada: true }).lean();
      if (repeated) return res.status(200).json({ success: true, repetida: true, data: { id: repeated._id } });
    } else {
      const latest = await ParametrosAtuais.findOne({ id_cativeiro, origem: authenticated ? 'dispositivo' : 'legado' }).sort({ datahora: -1 }).lean();
      if (latest && Date.now() - new Date(latest.datahora) < 10_000 &&
        latest.temp_atual === temperatura && latest.ph_atual === ph && latest.amonia_atual === amonia) {
        return res.status(200).json({ success: true, repetida: true, data: { id: latest._id } });
      }
    }
    const novoParametro = new ParametrosAtuais({
      id_cativeiro,
      temp_atual: temperatura,
      ph_atual: ph,
      amonia_atual: amonia,
      datahora: new Date(),
      origem: authenticated ? 'dispositivo' : 'legado',
      autenticada: authenticated,
      ...(authenticated && amostraId ? { amostraId } : {})
    });

    await novoParametro.save();

    if (authenticated) await processReading(id_cativeiro);
    // Notifica dashboards abertos para esse cativeiro
    parametrosEmitter.emit(`parametro:${id_cativeiro.toString()}`);

    res.status(201).json({
      success: true,
      message: "Parâmetros cadastrados com sucesso",
      data: {
        id: novoParametro._id,
        cativeiro: cativeiro.nome,
        temperatura,
        ph,
        amonia,
        datahora: novoParametro.datahora,
        origem: novoParametro.origem
      }
    });

  } catch (error) {
    if (error.code === 11000) return res.status(200).json({ success: true, repetida: true });
    console.error('Erro ao cadastrar parâmetros:', error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET - Buscar dados atuais de um cativeiro específico
const getParametrosAtuais = async (req, res) => {
  try {
    const { cativeiroId } = req.params;

    if (!cativeiroId) {
      return res.status(400).json({ error: "ID do cativeiro é obrigatório" });
    }

    const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    if (access === false) return res.status(403).json({ error: 'Acesso negado.' });

    const [cativeiro, parametroAtual] = await Promise.all([
      Cativeiros.findById(cativeiroId).lean(),
      ParametrosAtuais.findOne({ id_cativeiro: cativeiroId, ...VALID_READING_FILTER }).sort({ datahora: -1 }).lean()
    ]);

    if (!cativeiro) {
      return res.status(404).json({ error: "Cativeiro não encontrado" });
    }

    const parametros = parametroAtual ? {
      temperatura: parametroAtual.temp_atual,
      ph: parametroAtual.ph_atual,
      amonia: parametroAtual.amonia_atual,
      datahora: parametroAtual.datahora
    } : { temperatura: null, ph: null, amonia: null, datahora: null };

    res.json({ cativeiro: { id: cativeiro._id, nome: cativeiro.nome }, parametros });

  } catch (error) {
    console.error('Erro ao buscar parâmetros atuais:', error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET - Buscar dados históricos dos últimos X dias
const getParametrosHistoricos = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    const { dias = 7 } = req.query;
    const days = Number(dias);
    const page = Number(req.query.pagina || 1);
    const pageSize = Math.min(1000, Math.max(1, Number(req.query.limite || 500)));
    if (!Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize)) {
      return res.status(400).json({ error: 'Período ou paginação inválidos' });
    }

    if (!cativeiroId) {
      return res.status(400).json({ error: "ID do cativeiro é obrigatório" });
    }

    const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    if (access === false) return res.status(403).json({ error: 'Acesso negado.' });

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - days);

    const [cativeiro, parametros] = await Promise.all([
      Cativeiros.findById(cativeiroId).lean(),
      ParametrosAtuais.find({
        id_cativeiro: cativeiroId,
        ...VALID_READING_FILTER,
        datahora: { $gte: dataLimite }
      }).sort({ datahora: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize + 1).lean()
    ]);

    if (!cativeiro) {
      return res.status(404).json({ error: "Cativeiro não encontrado" });
    }

    const hasMore = parametros.length > pageSize;
    parametros.length = Math.min(parametros.length, pageSize);

    const dadosFormatados = parametros.map(p => ({
      datahora: p.datahora,
      temperatura: p.temp_atual,
      ph: p.ph_atual,
      amonia: p.amonia_atual,
      origem: p.origem || 'legado'
    }));

    res.json({
      cativeiro: { id: cativeiro._id, nome: cativeiro.nome },
      periodo: `${dias} dias`,
      total_registros: dadosFormatados.length,
      pagina: page,
      proximaPagina: hasMore ? page + 1 : null,
      dados: dadosFormatados
    });

  } catch (error) {
    console.error('Erro ao buscar parâmetros históricos:', error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Busca os dados do dashboard para um cativeiro — reutilizada por REST e SSE
async function fetchDashboardData(cativeiroId) {
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - 7);

  const [cativeiro, parametroAtual, dadosAgregados, avisosAtivos, leiturasAnalise] = await Promise.all([
    Cativeiros.findById(cativeiroId).populate('condicoes_ideais').lean(),
    ParametrosAtuais.findOne({ id_cativeiro: cativeiroId, ...VALID_READING_FILTER }).sort({ datahora: -1 }).lean(),
    ParametrosAtuais.aggregate([
      {
        $match: {
          id_cativeiro: new mongoose.Types.ObjectId(cativeiroId),
          ...VALID_READING_FILTER,
          datahora: { $gte: dataLimite }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$datahora" } },
          temperatura: { $avg: "$temp_atual" },
          ph: { $avg: "$ph_atual" },
          amonia: { $avg: "$amonia_atual" }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Aviso.find({ cativeiro: cativeiroId, estado: 'ativo' }).sort({ criadoEm: -1 }).lean(),
    ParametrosAtuais.find({ id_cativeiro: cativeiroId, autenticada: true, ...VALID_READING_FILTER,
      datahora: { $gte: new Date(Date.now() - 90 * 60_000) } }).sort({ datahora: -1 }).limit(6).lean()
  ]);

  if (!cativeiro) return null;

  const { suficiente, razao } = evaluate(leiturasAnalise, temperatureBounds(cativeiro.condicoes_ideais || {}));

  const dadosAtuais = parametroAtual ? {
    temperatura: parametroAtual.temp_atual,
    ph: parametroAtual.ph_atual,
    amonia: parametroAtual.amonia_atual,
    datahora: parametroAtual.datahora
  } : { temperatura: null, ph: null, amonia: null, datahora: null };

  const dadosPorDia = new Map();
  dadosAgregados.forEach(item => {
    dadosPorDia.set(item._id, { temperatura: item.temperatura, ph: item.ph, amonia: item.amonia });
  });

  const dadosSemanais = [];
  for (let i = 6; i >= 0; i--) {
    const data = new Date();
    data.setDate(data.getDate() - i);
    const dia = data.toISOString().split('T')[0];
    const dados = dadosPorDia.get(dia);
    if (dados) {
      dadosSemanais.push({
        data: dia,
        temperatura: Number(dados.temperatura.toFixed(2)),
        ph: Number(dados.ph.toFixed(2)),
        amonia: Number(dados.amonia.toFixed(3))
      });
    } else {
      dadosSemanais.push({ data: dia, temperatura: null, ph: null, amonia: null });
    }
  }

  return {
    cativeiro: { id: cativeiro._id, nome: cativeiro.nome },
    dadosAtuais,
    dadosSemanais,
    frescor: freshness(parametroAtual),
    analise: { suficiente, razao },
    avisosAtivos
  };
}

// GET - Dados do dashboard via requisição REST normal
const getDadosDashboard = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    if (!cativeiroId) return res.status(400).json({ error: "ID do cativeiro é obrigatório" });

    const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    if (access === false) return res.status(403).json({ error: 'Acesso negado.' });

    const dados = await fetchDashboardData(cativeiroId);
    if (!dados) return res.status(404).json({ error: "Cativeiro não encontrado" });
    res.json(dados);

  } catch (error) {
    console.error('Erro ao buscar dados do dashboard:', error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET /parametros/stream/:cativeiroId — SSE: envia dados imediatamente e a cada nova leitura
const streamDashboard = async (req, res) => {
  const { cativeiroId } = req.params;

  try {
    const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    if (access === false) return res.status(403).json({ error: 'Acesso negado.' });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': stream-start\n\n');

  console.log(`[SSE] stream aberto para cativeiroId=${cativeiroId}`);

  const push = async () => {
    try {
      const dados = await fetchDashboardData(cativeiroId);
      if (dados) {
        res.write(`data: ${JSON.stringify(dados)}\n\n`);
        console.log(`[SSE] dados enviados para cativeiroId=${cativeiroId}`);
      } else {
        console.error(`[SSE] fetchDashboardData retornou null para cativeiroId=${cativeiroId}`);
        res.end();
      }
    } catch (err) {
      console.error(`[SSE] erro em push() para cativeiroId=${cativeiroId}:`, err.message);
      try { res.end(); } catch { /* conexão já encerrada */ }
    }
  };

  await push();

  const eventKey = `parametro:${cativeiroId}`;
  parametrosEmitter.on(eventKey, push);

  const keepalive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_e) { clearInterval(keepalive); }
  }, 15_000);

  req.on('close', () => {
    parametrosEmitter.off(eventKey, push);
    clearInterval(keepalive);
    console.log(`[SSE] stream fechado para cativeiroId=${cativeiroId}`);
  });
};

export {
  cadastrarParametros,
  provisionDevice,
  getDeviceCredentialHistory,
  updateTemperatureLimits,
  updateSensitivityLimits,
  getThresholdSuggestions,
  getParametrosAtuais,
  getParametrosHistoricos,
  getDadosDashboard,
  streamDashboard
};
