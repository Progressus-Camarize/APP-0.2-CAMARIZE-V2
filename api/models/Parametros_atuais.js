// models/ParametrosAtuais.js
import mongoose from "mongoose";

const ParametrosAtuaisSchema = new mongoose.Schema({
  datahora: {
    type: Date,
    required: true,
    default: Date.now,
  },
  temp_atual: {
    type: Number,
    required: true,
  },
  ph_atual: {
    type: Number,
    required: true,
  },
  amonia_atual: {
    type: Number,
    required: true,
  },
  id_cativeiro: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cativeiros",
    required: true,
  },
  origem: { type: String, enum: ['dispositivo', 'legado'], default: 'legado' },
  autenticada: { type: Boolean, default: false },
  amostraId: { type: String }
}, {
  collection: "parametros_atuais",
  timestamps: false
});

ParametrosAtuaisSchema.index({ id_cativeiro: 1, datahora: -1 });
ParametrosAtuaisSchema.index({ id_cativeiro: 1, amostraId: 1 }, { unique: true, partialFilterExpression: { amostraId: { $type: 'string' } } });

const ParametrosAtuais = mongoose.model("ParametrosAtuais", ParametrosAtuaisSchema);
export default ParametrosAtuais;
