// services/calibracaoService.js
// Máquina de estados das calibrações de hardware do ESP32 (motor 28BYJ-48 e sensor PH-4502C).
// A API só informa comandos e persiste resultados — nunca aciona o hardware diretamente.
import Calibracao from "../models/Calibracao.js";
import Cativeiros from "../models/Cativeiros.js";
import FazendasxCativeiros from "../models/FazendasxCativeiros.js";
import requestService from "./requestService.js";

const round4 = (value) => Number(value.toFixed(4));

export const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
export const isPositiveNumber = (value) => Number.isFinite(value) && value > 0;
export const isFiniteNumber = (value) => Number.isFinite(value);

// Cria uma nova calibração para o cativeiro. Lança { status, mensagem } em caso de erro de negócio.
// `usuario` = { id, role } de quem iniciou (decide se o resultado precisa de aprovação).
export async function iniciar(id_cativeiro, tipo, rotacoes, usuario = {}) {
  const existente = await Calibracao.findOne({ id_cativeiro });
  if (existente && existente.etapa !== "concluida") {
    throw { status: 409, mensagem: "Já existe uma calibração ativa para este cativeiro." };
  }
  // Resultado da calibração anterior já foi exibido: dá lugar à nova
  if (existente) await Calibracao.deleteOne({ _id: existente._id });

  const dados = tipo === "motor"
    ? { id_cativeiro, tipo, etapa: "executar", rotacoes }
    : { id_cativeiro, tipo, etapa: "preparar_ph7" };

  const calibracao = await Calibracao.create({
    ...dados,
    iniciadoPor: usuario.id || null,
    iniciadoPorRole: usuario.role || null,
  });
  return formatarCalibracao(calibracao);
}

export async function getAtual(id_cativeiro) {
  const calibracao = await Calibracao.findOne({ id_cativeiro }).lean();
  if (!calibracao) return { ativa: false };
  return formatarCalibracao(calibracao);
}

export async function cancelar(id_cativeiro) {
  const calibracao = await Calibracao.findOneAndDelete({ id_cativeiro, etapa: { $ne: "concluida" } });
  if (!calibracao) {
    throw { status: 404, mensagem: "Nenhuma calibração ativa para este cativeiro." };
  }
}

// O usuário confirma que o eletrodo está na solução (pH 7 ou pH 4): só então o ESP32 lê a tensão
const PROXIMA_APOS_CONFIRMAR = { preparar_ph7: "ph7", preparar_ph4: "ph4" };

export async function confirmar(id_cativeiro) {
  const calibracao = await Calibracao.findOne({ id_cativeiro });
  const proxima = PROXIMA_APOS_CONFIRMAR[calibracao?.etapa];
  if (!proxima) {
    throw { status: 409, mensagem: "Não há etapa aguardando confirmação nesta calibração." };
  }
  calibracao.etapa = proxima;
  await calibracao.save();
  return formatarCalibracao(calibracao);
}

// A etapa do body nem sempre é igual ao nome da etapa guardada no estado (ex.: estado
// "aguardando_peso" é reportado pela aplicação com etapa "peso" — ver SPEC seção 3.3).
const ETAPA_ESPERADA_NO_BODY = {
  motor: { executar: "executar", aguardando_peso: "peso" },
  ph: { ph7: "ph7", ph4: "ph4" },
};

// Recebe o resultado de uma etapa (ESP32 ou aplicação) e avança a máquina de estados.
export async function registrarResultado({ id_cativeiro, tipo, etapa, rotacoes, gramas, tensao }) {
  const calibracao = await Calibracao.findOne({ id_cativeiro });
  if (!calibracao || calibracao.etapa === "concluida") {
    throw { status: 409, mensagem: "Nenhuma calibração ativa para este cativeiro." };
  }
  const etapaEsperada = ETAPA_ESPERADA_NO_BODY[calibracao.tipo]?.[calibracao.etapa];
  if (calibracao.tipo !== tipo || etapa !== etapaEsperada) {
    throw { status: 409, mensagem: "Etapa da calibração não corresponde ao estado atual." };
  }

  if (tipo === "motor" && calibracao.etapa === "executar") {
    calibracao.etapa = "aguardando_peso";
    await calibracao.save();
    return { mensagem: "Execução registrada. Aguardando peso informado pela aplicação." };
  }

  if (tipo === "motor" && calibracao.etapa === "aguardando_peso") {
    if (rotacoes !== calibracao.rotacoes) {
      throw { status: 400, mensagem: "rotacoes informado não corresponde ao da calibração em andamento." };
    }
    const resultado = { rotacoes, gramas, gramas_por_rotacao: round4(gramas / rotacoes) };
    const pendenteAprovacao = await finalizar(calibracao, { gramas_por_rotacao: resultado.gramas_por_rotacao }, resultado);
    return {
      mensagem: pendenteAprovacao
        ? "Calibração do motor concluída. Aguardando aprovação do administrador."
        : "Calibração do motor concluída.",
      resultado,
      pendenteAprovacao,
    };
  }

  if (tipo === "ph" && calibracao.etapa === "ph7") {
    calibracao.etapa = "preparar_ph4";
    calibracao.tensao_ph7 = tensao;
    await calibracao.save();
    return { mensagem: "pH 7 registrado. Aguardando confirmação para a leitura de pH 4." };
  }

  if (tipo === "ph" && calibracao.etapa === "ph4") {
    const campos = { tensao_ph7: calibracao.tensao_ph7, tensao_ph4: tensao };
    const pendenteAprovacao = await finalizar(calibracao, campos, campos);
    return {
      mensagem: pendenteAprovacao
        ? "Calibração de pH concluída. Aguardando aprovação do administrador."
        : "Calibração de pH concluída.",
      resultado: campos,
      pendenteAprovacao,
    };
  }
}

// Conclui a calibração: admin/master gravam o resultado no cativeiro na hora; quando quem
// iniciou foi um membro, vira uma solicitação para o admin da fazenda aprovar.
// Retorna true quando o resultado ficou pendente de aprovação.
async function finalizar(calibracao, camposDoCativeiro, resultado) {
  const pendenteAprovacao = calibracao.iniciadoPorRole === "membro";

  if (pendenteAprovacao) {
    const vinculo = await FazendasxCativeiros.findOne({ cativeiro: calibracao.id_cativeiro }).lean();
    await requestService.create({
      requesterUser: calibracao.iniciadoPor,
      requesterRole: "membro",
      targetRole: "admin",
      type: "leve",
      action: "aplicar_calibracao",
      payload: { cativeiroId: String(calibracao.id_cativeiro), tipo: calibracao.tipo, ...resultado },
      fazenda: vinculo?.fazenda || null,
    });
  } else {
    await Cativeiros.updateOne({ _id: calibracao.id_cativeiro }, { $set: camposDoCativeiro });
  }

  calibracao.etapa = "concluida";
  calibracao.resultado = resultado;
  calibracao.pendenteAprovacao = pendenteAprovacao;
  await calibracao.save();
  return pendenteAprovacao;
}

function formatarCalibracao(calibracao) {
  if (calibracao.etapa === "concluida") {
    return {
      ativa: false,
      concluida: true,
      tipo: calibracao.tipo,
      resultado: calibracao.resultado,
      pendenteAprovacao: !!calibracao.pendenteAprovacao,
    };
  }
  const base = { ativa: true, tipo: calibracao.tipo, etapa: calibracao.etapa };
  if (calibracao.tipo === "motor") base.rotacoes = calibracao.rotacoes;
  return base;
}
