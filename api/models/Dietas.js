import mongoose from "mongoose";

const DietasSchema = new mongoose.Schema({
  // Cativeiro dono da dieta: cada cativeiro tem a sua (não há mais dietas compartilhadas)
  cativeiro: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cativeiros",
    default: null,
  },
  descricao: {
    type: String,
    maxlength: 100,
    required: false,
  },
  horaAlimentacao: {
    type: String, // Exemplo: "08:00" ou JSON array para múltiplos horários
    required: false,
  },
  horarios: {
    type: [String], // Array de horários: ["08:00", "14:00", "20:00"]
    required: false,
  },
  quantidadeRefeicoes: {
    type: Number, // Quantidade de refeições por dia (1-6)
    required: false,
  },
  quantidade: {
    type: Number,
    required: true,
  }
}, {
  collection: "Dietas"
});

const Dietas = mongoose.model("Dietas", DietasSchema);
export default Dietas; 