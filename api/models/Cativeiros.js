// models/Cativeiros.js
import mongoose from "mongoose";

const CativeirosSchema = new mongoose.Schema({
  id_cativeiro: Number, // ou ObjectId, se preferir
  nome: {
    type: String,
    required: true,
    default: function() {
      return `Cativeiro ${this.id_cativeiro || 'N/A'}`;
    }
  },
  // campo fazenda removido para normalização
  id_tipo_camarao: {
    type: mongoose.Schema.Types.ObjectId, // Referência ao _id do TiposCamarao
    ref: "TiposCamaroes",
    required: true,
  },
  data_instalacao: {
    type: Date,
    required: true,
  },
  foto_cativeiro: {
    type: Buffer, // Para armazenar binário (imagem)
    required: false,
    default: null
  },
  temp_media_diaria: {
    type: String,
    default: null
  },
  ph_medio_diario: {
    type: String,
    default: null
  },
  amonia_media_diaria: {
    type: String,
    default: null
  },
  condicoes_ideais: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CondicoesIdeais",
    required: false,
    default: null
  },
  // Campo para associar o cativeiro ao usuário proprietário
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false
  },
  // Calibração do motor 28BYJ-48 (gramas por rotação) e do sensor PH-4502C (tensão em pH 7/4)
  gramas_por_rotacao: {
    type: Number,
    default: null
  },
  tensao_ph7: {
    type: Number,
    default: null
  },
  tensao_ph4: {
    type: Number,
    default: null
  }
});

const Cativeiros = mongoose.model("Cativeiros", CativeirosSchema);
export default Cativeiros;