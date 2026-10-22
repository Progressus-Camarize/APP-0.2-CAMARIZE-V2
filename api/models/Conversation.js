import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessageAt: { type: Date, default: Date.now },
  unreadCounts: {
    type: Map,
    of: Number,
    default: {}
  },
  // Quando cada participante excluiu a conversa (userId -> data). Para ele, só aparecem
  // mensagens posteriores a essa data; para o outro participante, nada muda.
  clearedAt: {
    type: Map,
    of: Date,
    default: {}
  }
}, { timestamps: true });

const Conversation = mongoose.model('Conversation', ConversationSchema);
export default Conversation;
