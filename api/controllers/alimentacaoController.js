import mongoose from "mongoose";
import Alimentacoes from "../models/Alimentacoes.js";
import cativeiroController from "./cativeiroController.js";
import cativeiroService from "../services/cativeiroService.js";
import { verificarChaveDispositivo } from "../services/deviceAuthService.js";
import { hojeEmBrasilia, resumoAlimentacaoDoDia } from "../services/alimentacaoService.js";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORARIO_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const numeroOuNull = (v) => (v === undefined || v === null || !Number.isFinite(Number(v)) ? null : Number(v));

// POST /alimentacoes — ESP32 informa uma refeição servida ou que não pôde ser servida
const registrarAlimentacao = async (req, res) => {
  try {
    const { id_cativeiro, data, horario, status, gramas, rotacoes, atraso_min, motivo } = req.body || {};
    if (!id_cativeiro || !mongoose.isValidObjectId(id_cativeiro)) {
      return res.status(400).json({ error: "ID do cativeiro é obrigatório" });
    }
    if (await verificarChaveDispositivo(id_cativeiro, req.get("X-Device-Key")) !== "valida") {
      return res.status(401).json({ error: "Chave do dispositivo inválida ou ausente" });
    }
    if (!DATA_RE.test(String(data)) || !HORARIO_RE.test(String(horario))) {
      return res.status(400).json({ error: "data (AAAA-MM-DD) e horario (HH:MM) são obrigatórios" });
    }
    if (status !== "servida" && status !== "falhou") {
      return res.status(400).json({ error: "status deve ser 'servida' ou 'falhou'" });
    }

    const filtro = { cativeiro: id_cativeiro, data: String(data), horario: String(horario) };
    const existente = await Alimentacoes.findOne(filtro).lean();
    // Refeição já servida não volta a "falhou" (a placa pode reenviar um aviso antigo)
    if (existente?.status === "servida") {
      return res.status(200).json({ sucesso: true, alimentacao: existente });
    }

    const alimentacao = await Alimentacoes.findOneAndUpdate(filtro, {
      $set: {
        status,
        gramas: numeroOuNull(gramas),
        rotacoes: numeroOuNull(rotacoes),
        atrasoMin: Math.max(0, Math.round(numeroOuNull(atraso_min) ?? 0)),
        motivo: status === "falhou" && motivo ? String(motivo).slice(0, 200) : null,
        registradoEm: new Date(),
      },
    }, { upsert: true, returnDocument: "after", runValidators: true }).lean();

    return res.status(existente ? 200 : 201).json({ sucesso: true, alimentacao });
  } catch (err) {
    console.error("Erro ao registrar alimentação:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET /alimentacoes/:cativeiroId?data=AAAA-MM-DD — refeições do dia (padrão: hoje em Brasília)
const listarAlimentacoes = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    const acesso = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
    if (acesso === null) return res.status(404).json({ error: "Cativeiro não encontrado" });
    if (!acesso) return res.status(403).json({ error: "Acesso negado a este cativeiro" });

    const data = req.query.data ? String(req.query.data) : hojeEmBrasilia();
    if (!DATA_RE.test(data)) return res.status(400).json({ error: "data deve estar no formato AAAA-MM-DD" });

    const alimentacoes = await Alimentacoes.find({ cativeiro: cativeiroId, data })
      .sort({ horario: 1 }).lean();
    return res.json({ cativeiroId, data, alimentacoes });
  } catch (err) {
    console.error("Erro ao listar alimentações:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET /alimentacoes/hoje — resumo de hoje de cada cativeiro que o usuário enxerga (Home)
const resumoDeHoje = async (req, res) => {
  try {
    const { id, role } = req.loggedUser;
    const cativeiros = role === "master"
      ? await cativeiroService.getAll()
      : await cativeiroService.getAllByUsuarioViaRelacionamentos(id);
    const resumos = await resumoAlimentacaoDoDia(cativeiros.map(c => c._id));
    return res.json({ data: hojeEmBrasilia(), cativeiros: Object.fromEntries(resumos) });
  } catch (err) {
    console.error("Erro ao resumir alimentações de hoje:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

export default { registrarAlimentacao, listarAlimentacoes, resumoDeHoje };
