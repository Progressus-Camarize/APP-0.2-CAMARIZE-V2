import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  cativeiro: { type: mongoose.Schema.Types.ObjectId, ref: 'Cativeiros', required: true, unique: true },
  keyHash: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('DeviceCredential', schema);
