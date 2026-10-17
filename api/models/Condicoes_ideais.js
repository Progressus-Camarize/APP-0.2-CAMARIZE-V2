// models/CondicoesIdeais.js
import mongoose from "mongoose";

const CondicoesIdeaisSchema = new mongoose.Schema({
  // id_condicao: Number, // pode usar o _id do MongoDB
  id_tipo_camarao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TiposCamaroes",
    required: true,
  },
  temp_ideal: {
    type: Number,
    required: false,
  },
  temp_min: Number,
  temp_max: Number,
  ph_ideal: {
    type: Number,
    required: false,
  },
  amonia_ideal: {
    type: Number,
    required: false,
  },
  // Sensibilidade da detecção de tendência (avisoService.evaluate). Sem valor
  // definido, usa os padrões do código — mesmo esquema já usado por temp_min/temp_max.
  ph_limiar: Number,
  amonia_limiar_pct: Number,
  amonia_limiar_min: Number,
});

const CondicoesIdeais = mongoose.model("CondicoesIdeais", CondicoesIdeaisSchema);
export default CondicoesIdeais;
