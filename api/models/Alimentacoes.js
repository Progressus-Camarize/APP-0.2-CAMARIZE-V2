import mongoose from "mongoose";

// Registro de cada refeição programada, enviado pelo ESP32: uma por cativeiro, dia e horário.
// "data" e "horario" são os da placa (horário de Brasília), iguais aos da dieta.
const AlimentacoesSchema = new mongoose.Schema({
  cativeiro: { type: mongoose.Schema.Types.ObjectId, ref: "Cativeiros", required: true },
  data: { type: String, required: true }, // "2026-11-06"
  horario: { type: String, required: true }, // "08:00"
  status: { type: String, enum: ["servida", "falhou"], required: true },
  gramas: { type: Number, default: null },
  rotacoes: { type: Number, default: null },
  atrasoMin: { type: Number, default: 0 },
  motivo: { type: String, maxlength: 200, default: null }, // por que não foi servida
  registradoEm: { type: Date, default: Date.now }, // quando a API recebeu (hora real da refeição)
}, {
  collection: "Alimentacoes",
});

AlimentacoesSchema.index({ cativeiro: 1, data: 1, horario: 1 }, { unique: true });

const Alimentacoes = mongoose.model("Alimentacoes", AlimentacoesSchema);
export default Alimentacoes;
