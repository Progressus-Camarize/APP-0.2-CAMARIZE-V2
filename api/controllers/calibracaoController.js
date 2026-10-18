// controllers/calibracaoController.js
import mongoose from "mongoose";
import Cativeiros from "../models/Cativeiros.js";
import cativeiroController from "./cativeiroController.js";
import * as calibracaoService from "../services/calibracaoService.js";
import { isPositiveInteger, isPositiveNumber, isFiniteNumber } from "../services/calibracaoService.js";

// POST /calibracao/iniciar — Aplicação inicia uma nova calibração (motor ou pH).
const iniciarCalibracao = async (req, res) => {
  try {
    const { id_cativeiro, tipo, rotacoes } = req.body;

    if (!id_cativeiro || !mongoose.isValidObjectId(id_cativeiro)) {
      return res.status(400).json({ error: "ID do cativeiro é obrigatório" });
    }
    if (tipo !== "motor" && tipo !== "ph") {
      return res.status(400).json({ error: "tipo deve ser 'motor' ou 'ph'" });
    }
    if (tipo === "motor" && !isPositiveInteger(rotacoes)) {
      return res.status(400).json({ error: "rotacoes é obrigatório e deve ser um inteiro maior que zero" });
    }

    if (req.loggedUser?.role === "membro") return res.status(403).json({ error: "Acesso negado" });
    const access = await cativeiroController.assertCativeiroAccess(id_cativeiro, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: "Cativeiro não encontrado" });
    if (access === false) return res.status(403).json({ error: "Acesso negado" });
    if (!await Cativeiros.exists({ _id: id_cativeiro })) return res.status(404).json({ error: "Cativeiro não encontrado" });

    const calibracao = await calibracaoService.iniciar(id_cativeiro, tipo, tipo === "motor" ? rotacoes : undefined);

    return res.status(201).json({ sucesso: true, mensagem: "Calibração iniciada.", calibracao });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.mensagem });
    console.error("Erro ao iniciar calibração:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET /calibracao/atual/:cativeiroId — ESP32 faz polling do comando pendente. Somente leitura.
const getCalibracaoAtual = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    if (!mongoose.isValidObjectId(cativeiroId)) {
      return res.status(400).json({ error: "ID do cativeiro é obrigatório" });
    }

    const cativeiro = await Cativeiros.findById(cativeiroId).select("_id").lean();
    if (!cativeiro) return res.status(404).json({ error: "Cativeiro não encontrado" });

    const estado = await calibracaoService.getAtual(cativeiroId);
    return res.json(estado);
  } catch (err) {
    console.error("Erro ao buscar calibração atual:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// POST /calibracao/resultado — ESP32 (executar/ph7/ph4) e Aplicação (peso) enviam o resultado da etapa.
const registrarResultado = async (req, res) => {
  try {
    const { id_cativeiro, tipo, etapa, rotacoes, gramas, tensao } = req.body;

    if (!id_cativeiro || !mongoose.isValidObjectId(id_cativeiro)) {
      return res.status(400).json({ error: "ID do cativeiro é obrigatório" });
    }
    if (tipo !== "motor" && tipo !== "ph") {
      return res.status(400).json({ error: "tipo deve ser 'motor' ou 'ph'" });
    }
    if (typeof etapa !== "string" || !etapa) {
      return res.status(400).json({ error: "etapa é obrigatória" });
    }
    if (tipo === "ph" && !isFiniteNumber(tensao)) {
      return res.status(400).json({ error: "tensao deve ser numérica" });
    }
    if (tipo === "motor" && etapa === "peso") {
      if (!isPositiveNumber(rotacoes) || !Number.isInteger(rotacoes)) {
        return res.status(400).json({ error: "rotacoes deve ser um inteiro maior que zero" });
      }
      if (!isPositiveNumber(gramas)) {
        return res.status(400).json({ error: "gramas deve ser numérico e maior que zero" });
      }
    }

    const cativeiro = await Cativeiros.findById(id_cativeiro).select("_id").lean();
    if (!cativeiro) return res.status(404).json({ error: "Cativeiro não encontrado" });

    const resultado = await calibracaoService.registrarResultado({ id_cativeiro, tipo, etapa, rotacoes, gramas, tensao });

    return res.status(200).json({ sucesso: true, ...resultado });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.mensagem });
    console.error("Erro ao registrar resultado da calibração:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// POST /calibracao/cancelar — Aplicação cancela a calibração ativa do cativeiro.
const cancelarCalibracao = async (req, res) => {
  try {
    const { id_cativeiro } = req.body;
    if (!id_cativeiro || !mongoose.isValidObjectId(id_cativeiro)) {
      return res.status(400).json({ error: "ID do cativeiro é obrigatório" });
    }

    if (req.loggedUser?.role === "membro") return res.status(403).json({ error: "Acesso negado" });
    const access = await cativeiroController.assertCativeiroAccess(id_cativeiro, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: "Cativeiro não encontrado" });
    if (access === false) return res.status(403).json({ error: "Acesso negado" });

    await calibracaoService.cancelar(id_cativeiro);

    return res.json({ sucesso: true, mensagem: "Calibração cancelada." });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.mensagem });
    console.error("Erro ao cancelar calibração:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

export default {
  iniciarCalibracao,
  getCalibracaoAtual,
  registrarResultado,
  cancelarCalibracao,
};
