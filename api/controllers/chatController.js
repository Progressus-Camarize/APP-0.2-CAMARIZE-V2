import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';

// GET /chat/conversations/mine - Listar conversas do usuário autenticado
export const getMyConversations = async (req, res) => {
  try {
    const userId = req.loggedUser.id;
    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'nome email foto_perfil role')
      .sort({ lastMessageAt: -1 });

    res.json(conversations);
  } catch (error) {
    console.error('Erro ao buscar conversas:', error);
    res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
};

// POST /chat/conversations - Criar ou retornar conversa existente entre dois usuários
export const createConversation = async (req, res) => {
  try {
    const { adminId, masterId } = req.body;

    if (!adminId || !masterId) {
      return res.status(400).json({ error: 'adminId e masterId são obrigatórios' });
    }

    // Verifica se já existe conversa entre os dois participantes
    const existing = await Conversation.findOne({
      participants: { $all: [adminId, masterId] }
    }).populate('participants', 'nome email foto_perfil role');

    if (existing) {
      return res.json(existing);
    }

    // Cria nova conversa
    const conversation = await Conversation.create({
      participants: [adminId, masterId],
      lastMessageAt: new Date(),
      unreadCounts: new Map()
    });

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'nome email foto_perfil role');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Erro ao criar conversa:', error);
    res.status(500).json({ error: 'Erro ao criar conversa' });
  }
};

// GET /chat/conversations/:id/messages - Listar mensagens de uma conversa
export const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.loggedUser.id;

    // Verifica se o usuário participa da conversa
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const isParticipant = conversation.participants.some(
      p => p.toString() === userId
    );
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não participa desta conversa' });
    }

    // Zera contagem de não lidas para este usuário
    conversation.unreadCounts.set(userId, 0);
    await conversation.save();

    const messages = await Message.find({ conversationId: id })
      .populate('senderId', 'nome email foto_perfil role')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
};

// POST /chat/conversations/:id/messages - Enviar mensagem em uma conversa
export const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.loggedUser.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'O texto da mensagem é obrigatório' });
    }

    // Verifica se o usuário participa da conversa
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const isParticipant = conversation.participants.some(
      p => p.toString() === userId
    );
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não participa desta conversa' });
    }

    // Cria a mensagem
    const message = await Message.create({
      conversationId: id,
      senderId: userId,
      text: text.trim()
    });

    // Atualiza lastMessageAt e incrementa unread para os outros participantes
    conversation.lastMessageAt = new Date();
    for (const participant of conversation.participants) {
      const pid = participant.toString();
      if (pid !== userId) {
        const current = conversation.unreadCounts.get(pid) || 0;
        conversation.unreadCounts.set(pid, current + 1);
      }
    }
    await conversation.save();

    const populated = await Message.findById(message._id)
      .populate('senderId', 'nome email foto_perfil role');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};

// DELETE /chat/conversations/:id - Excluir uma conversa e todas as suas mensagens
export const deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.loggedUser.id;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const isParticipant = conversation.participants.some(
      p => p.toString() === userId
    );
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não participa desta conversa' });
    }

    // Remove todas as mensagens da conversa
    await Message.deleteMany({ conversationId: id });
    // Remove a conversa
    await Conversation.findByIdAndDelete(id);

    res.json({ message: 'Conversa excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir conversa:', error);
    res.status(500).json({ error: 'Erro ao excluir conversa' });
  }
};
