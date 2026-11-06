// models/Calibracao.js
// Estado temporário da calibração em andamento de um cativeiro (motor 28BYJ-48 ou pH PH-4502C).
// No máximo um documento por cativeiro. Cancelar remove o documento; concluir o mantém na
// etapa "concluida" com o resultado (para a aplicação exibi-lo) até a próxima calibração.
import mongoose from "mongoose";

const CalibracaoSchema = new mongoose.Schema({
  id_cativeiro: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cativeiros",
    required: true,
    unique: true,
  },
  tipo: {
    type: String,
    enum: ["motor", "ph"],
    required: true,
  },
  etapa: {
    type: String,
    // motor: executar (ESP32 gira) -> aguardando_peso (app informa gramas) -> concluida
    // ph: preparar_ph7 (usuário mergulha o eletrodo e confirma) -> ph7 (ESP32 lê) ->
    //     preparar_ph4 -> ph4 -> concluida
    enum: ["executar", "aguardando_peso", "preparar_ph7", "ph7", "preparar_ph4", "ph4", "concluida"],
    required: true,
  },
  // Quem iniciou: se foi um membro, o resultado só vale depois que o admin aprova
  iniciadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  iniciadoPorRole: {
    type: String,
    enum: ["membro", "admin", "master", null],
    default: null,
  },
  // Preenchidos na etapa "concluida"
  resultado: {
    type: Object,
    default: null,
  },
  pendenteAprovacao: {
    type: Boolean,
    default: false,
  },
  rotacoes: {
    type: Number,
    default: null, // só para tipo = motor
  },
  // Guardado apenas no estado temporário até a etapa ph4 ser concluída — nunca grava
  // tensao_ph7 no cativeiro sem o par tensao_ph4, evitando calibração de pH incompleta/inconsistente.
  tensao_ph7: {
    type: Number,
    default: null,
  },
}, {
  timestamps: { createdAt: "criadoEm", updatedAt: "atualizadoEm" },
});

const Calibracao = mongoose.model("Calibracao", CalibracaoSchema);
export default Calibracao;
