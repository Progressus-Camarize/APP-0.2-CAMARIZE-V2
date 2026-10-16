// models/Sensores.js
import mongoose from "mongoose";

const SensoresSchema = new mongoose.Schema({
  id_tipo_sensor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TiposSensor',
    required: true,
  },
  apelido: {
    type: String,
    maxlength: 100,
    required: false,
  },
  foto_sensor: {
    type: Buffer, // Para armazenar binário (imagem)
    required: false,
  },
  // Campo para associar o sensor ao usuário proprietário
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  collection: "Sensores",
  timestamps: false
});

// Compatibilidade: permitir receber string (descricao) e converter para TiposSensor
SensoresSchema.pre('validate', async function() {
  const value = this.id_tipo_sensor;
  if (!value) return;

  // Se já for ObjectId, ok
  if (typeof value === 'object' && value instanceof mongoose.Types.ObjectId) return;

  // Se vier como string (ex: "temperatura", "pH", "Amônia"), mapear para catálogo
  if (typeof value === 'string') {
    const TiposSensor = mongoose.models.TiposSensor || (await import('./Tipos_sensores.js')).default;
    const descricao = value.trim();
    let tipo = await TiposSensor.findOne({ descricao });
    if (!tipo) {
      tipo = await TiposSensor.create({ descricao });
    }
    this.id_tipo_sensor = tipo._id;
  }
});

const Sensores = mongoose.model("Sensores", SensoresSchema);
export default Sensores;