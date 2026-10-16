import mongoose from "mongoose";

const DietasxCativeirosSchema = new mongoose.Schema({
  cativeiro: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cativeiros",
    required: true,
  },
  dieta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dietas",
    required: true,
  },
  inicioVigencia: {
    type: Date,
    required: false,
    default: null,
  },
  fimVigencia: {
    type: Date,
    required: false,
    default: null,
  },
  ativo: {
    type: Boolean,
    default: true,
  },
  criadoEm: {
    type: Date,
    default: Date.now,
  },
  atualizadoEm: {
    type: Date,
    default: Date.now,
  }
}, {
  collection: "DietasxCativeiros"
});

DietasxCativeirosSchema.index({ cativeiro: 1, ativo: 1 });
DietasxCativeirosSchema.index({ cativeiro: 1, inicioVigencia: 1, fimVigencia: 1 });

DietasxCativeirosSchema.pre('save', function() {
  this.atualizadoEm = new Date();
});

const DietasxCativeiros = mongoose.model("DietasxCativeiros", DietasxCativeirosSchema);
export default DietasxCativeiros;


