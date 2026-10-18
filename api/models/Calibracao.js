// models/Calibracao.js
// Estado temporário da calibração em andamento de um cativeiro (motor 28BYJ-48 ou pH PH-4502C).
// No máximo um documento ativo por cativeiro — ao concluir ou cancelar, o documento é removido.
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
    enum: ["executar", "aguardando_peso", "ph7", "ph4"],
    required: true,
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
