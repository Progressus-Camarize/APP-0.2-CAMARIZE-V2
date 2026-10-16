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
});

const CondicoesIdeais = mongoose.model("CondicoesIdeais", CondicoesIdeaisSchema);
export default CondicoesIdeais;
