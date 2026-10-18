// services/calibracaoService.js
// Máquina de estados das calibrações de hardware do ESP32 (motor 28BYJ-48 e sensor PH-4502C).
// A API só informa comandos e persiste resultados — nunca aciona o hardware diretamente.
import Calibracao from "../models/Calibracao.js";
import Cativeiros from "../models/Cativeiros.js";

const round4 = (value) => Number(value.toFixed(4));

export const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
export const isPositiveNumber = (value) => Number.isFinite(value) && value > 0;
export const isFiniteNumber = (value) => Number.isFinite(value);

// Cria uma nova calibração para o cativeiro. Lança { status, mensagem } em caso de erro de negócio.
export async function iniciar(id_cativeiro, tipo, rotacoes) {
  const existente = await Calibracao.findOne({ id_cativeiro });
  if (existente) {
    throw { status: 409, mensagem: "Já existe uma calibração ativa para este cativeiro." };
  }

  const dados = tipo === "motor"
    ? { id_cativeiro, tipo, etapa: "executar", rotacoes }
    : { id_cativeiro, tipo, etapa: "ph7" };

  const calibracao = await Calibracao.create(dados);
  return formatarCalibracao(calibracao);
}

export async function getAtual(id_cativeiro) {
  const calibracao = await Calibracao.findOne({ id_cativeiro }).lean();
  if (!calibracao) return { ativa: false };
  return formatarCalibracao(calibracao);
}

export async function cancelar(id_cativeiro) {
  const calibracao = await Calibracao.findOneAndDelete({ id_cativeiro });
  if (!calibracao) {
    throw { status: 404, mensagem: "Nenhuma calibração ativa para este cativeiro." };
  }
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
  if (!calibracao) {
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
    const gramasPorRotacao = round4(gramas / rotacoes);
    await Cativeiros.updateOne({ _id: id_cativeiro }, { $set: { gramas_por_rotacao: gramasPorRotacao } });
    await Calibracao.deleteOne({ _id: calibracao._id });
    return {
      mensagem: "Calibração do motor concluída.",
      resultado: { rotacoes, gramas, gramas_por_rotacao: gramasPorRotacao },
    };
  }

  if (tipo === "ph" && calibracao.etapa === "ph7") {
    calibracao.etapa = "ph4";
    calibracao.tensao_ph7 = tensao;
    await calibracao.save();
    return { mensagem: "pH 7 registrado. Aguardando leitura de pH 4." };
  }

  if (tipo === "ph" && calibracao.etapa === "ph4") {
    await Cativeiros.updateOne(
      { _id: id_cativeiro },
      { $set: { tensao_ph7: calibracao.tensao_ph7, tensao_ph4: tensao } }
    );
    await Calibracao.deleteOne({ _id: calibracao._id });
    return { mensagem: "Calibração de pH concluída." };
  }
}

function formatarCalibracao(calibracao) {
  const base = { ativa: true, tipo: calibracao.tipo, etapa: calibracao.etapa };
  if (calibracao.tipo === "motor") base.rotacoes = calibracao.rotacoes;
  return base;
}
