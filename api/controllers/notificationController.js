import ParametrosAtuais from "../models/Parametros_atuais.js";
import Cativeiros from '../models/Cativeiros.js';
import Aviso from '../models/Aviso.js';
import User from '../models/Users.js';
import cativeiroService from '../services/cativeiroService.js';
import cativeiroController from './cativeiroController.js';
import { freshness, VALID_READING_FILTER } from '../services/avisoService.js';
import PushSubscription from "../models/PushSubscriptions.js";
import EmailSettings from "../models/EmailSettings.js";
import emailService from "../services/emailService.js";

// Push é opcional — a API sobe normalmente sem as VAPID keys
const pushEnabled = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (!pushEnabled) {
  console.warn(
    '⚠️ Push notifications desabilitado: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY não configuradas no .env.'
  );
}


// Ocorrências persistidas; consultar a tela nunca dispara push.
const serializeAviso = (aviso, reading) => ({
  id: aviso._id,
  tipo: aviso.tipo,
  cativeiro: aviso.cativeiro?._id || aviso.cativeiro,
  cativeiroNome: aviso.cativeiro?.nome || 'Viveiro',
  mensagem: aviso.mensagem,
  datahora: aviso.criadoEm,
  estado: aviso.estado,
  periodoInicio: aviso.periodoInicio,
  periodoFim: aviso.periodoFim,
  valorInicial: aviso.valorInicial,
  valorAtual: aviso.valorAtual,
  limite: aviso.limite,
  experimental: aviso.experimental,
  preditivo: aviso.preditivo,
  recuperadoEm: aviso.recuperadoEm,
  verificadoEm: aviso.verificadoEm,
  avaliacao: aviso.avaliacao,
  frescor: freshness(reading),
});

const getNotifications = async (req, res) => {
  try {
    const cativeiros = req.loggedUser.role === 'master'
      ? await Cativeiros.find().select('_id').lean()
      : await cativeiroService.getAllByUsuarioViaRelacionamentos(req.loggedUser.id);
    const ids = cativeiros.map(c => c._id);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const avisos = await Aviso.find({ cativeiro: { $in: ids } }).sort({ criadoEm: -1 }).limit(limit).populate('cativeiro', 'nome').lean();
    const readings = await Promise.all(ids.map(id => ParametrosAtuais.findOne({ id_cativeiro: id, ...VALID_READING_FILTER }).sort({ datahora: -1 }).lean()));
    const byId = new Map(ids.map((id, index) => [String(id), readings[index]]));
    const notifications = avisos.map(a => serializeAviso(a, byId.get(String(a.cativeiro?._id))));
    res.json({ success: true, notifications, total: notifications.length });
  } catch (error) {
    console.error('Erro ao listar avisos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
};

const getNotificationsByCativeiro = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado' });
    if (!access) return res.status(403).json({ error: 'Acesso negado' });
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const [avisos, reading] = await Promise.all([
      Aviso.find({ cativeiro: cativeiroId }).sort({ criadoEm: -1 }).limit(limit).populate('cativeiro', 'nome').lean(),
      ParametrosAtuais.findOne({ id_cativeiro: cativeiroId, ...VALID_READING_FILTER }).sort({ datahora: -1 }).lean(),
    ]);
    const notifications = avisos.map(a => serializeAviso(a, reading));
    res.json({ success: true, notifications, total: notifications.length });
  } catch (error) {
    console.error('Erro ao listar avisos do viveiro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
};

const evaluateNotification = async (req, res) => {
  try {
    if (!['confirmado', 'falso_alarme'].includes(req.body.avaliacao)) {
      return res.status(400).json({ error: 'Avaliação inválida' });
    }
    const aviso = await Aviso.findById(req.params.id);
    if (!aviso) return res.status(404).json({ error: 'Aviso não encontrado' });
    const access = await cativeiroController.assertCativeiroAccess(aviso.cativeiro, req.loggedUser.id, req.loggedUser.role);
    if (!access) return res.status(403).json({ error: 'Acesso negado' });
    if (!aviso.verificadoEm) {
      aviso.verificadoEm = new Date();
      aviso.verificadoPor = req.loggedUser.id;
      aviso.avaliacao = req.body.avaliacao;
      await aviso.save();
    }
    res.json({ success: true, verificadoEm: aviso.verificadoEm, avaliacao: aviso.avaliacao });
  } catch (error) {
    console.error('Erro ao avaliar aviso:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

const getNotificationSummary = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    const access = await cativeiroController.assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado' });
    if (!access) return res.status(403).json({ error: 'Acesso negado' });
    const avisos = await Aviso.find({ cativeiro: cativeiroId }).select('tipo criadoEm verificadoEm avaliacao').lean();
    const verificados = avisos.filter(a => a.verificadoEm);
    const porParametro = Object.fromEntries(['temperatura', 'ph', 'amonia', 'sensor_inativo'].map(tipo => [tipo, avisos.filter(a => a.tipo === tipo).length]));
    res.json({
      total: avisos.length,
      porParametro,
      verificados: verificados.length,
      falsosAlarmes: verificados.filter(a => a.avaliacao === 'falso_alarme').length,
      tempoMedioConferenciaMinutos: verificados.length
        ? Math.round(verificados.reduce((sum, a) => sum + (a.verificadoEm - a.criadoEm) / 60_000, 0) / verificados.length)
        : null,
    });
  } catch (error) {
    console.error('Erro ao resumir avisos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Contador independente de push: quantos avisos surgiram desde a última vez que o
// usuário abriu a tela de notificações. Usado para um indicador no app que funciona
// mesmo que o push esteja desabilitado, tenha falhado ou o dispositivo esteja offline.
const getUnreadCount = async (req, res) => {
  try {
    const cativeiros = req.loggedUser.role === 'master'
      ? await Cativeiros.find().select('_id').lean()
      : await cativeiroService.getAllByUsuarioViaRelacionamentos(req.loggedUser.id);
    const ids = cativeiros.map(c => c._id);
    const user = await User.findById(req.loggedUser.id).select('avisosVistoEm').lean();
    const desde = user?.avisosVistoEm || new Date(0);
    const naoVistos = await Aviso.countDocuments({ cativeiro: { $in: ids }, criadoEm: { $gt: desde } });
    res.json({ success: true, naoVistos });
  } catch (error) {
    console.error('Erro ao contar avisos não vistos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
};

const markNotificationsSeen = async (req, res) => {
  try {
    await User.updateOne({ _id: req.loggedUser.id }, { $set: { avisosVistoEm: new Date() } });
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar avisos como vistos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
};

// Controller para inscrever em notificações push
const subscribeToPush = async (req, res) => {
  if (!pushEnabled) {
    return res.status(503).json({
      success: false,
      error: 'Push notifications não disponível: VAPID keys não configuradas no servidor'
    });
  }

  try {
    const { subscription, deviceInfo } = req.body;
    const userId = req.loggedUser?.id;

    if (!subscription?.endpoint) {
      return res.status(400).json({ success: false, error: 'Subscription inválida' });
    }

    // Verificar se já existe uma subscription para este endpoint
    const existingSubscription = await PushSubscription.findOne({
      'subscription.endpoint': subscription.endpoint
    });

    if (existingSubscription) {
      await PushSubscription.findByIdAndUpdate(existingSubscription._id, {
        userId,
        subscription,
        deviceInfo,
        isActive: true,
        createdAt: new Date()
      });
      console.log('✅ Subscription atualizada:', subscription.endpoint);
    } else {
      await PushSubscription.create({ userId, subscription, deviceInfo });
      console.log('✅ Nova subscription criada:', subscription.endpoint);
    }

    console.log('✅ Nova inscrição para notificações push:', {
      userId,
      endpoint: subscription.endpoint
    });

    res.status(200).json({
      success: true,
      message: 'Inscrito para notificações push com sucesso!'
    });
  } catch (error) {
    console.error('❌ Erro ao inscrever para notificações push:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
};

// Controller para cancelar inscrição em notificações push
const unsubscribeFromPush = async (req, res) => {
  if (!pushEnabled) {
    return res.status(503).json({
      success: false,
      error: 'Push notifications não disponível: VAPID keys não configuradas no servidor'
    });
  }

  try {
    const { subscription, userId } = req.body;

    // Marcar subscription como inativa
    await PushSubscription.findOneAndUpdate(
      { 'subscription.endpoint': subscription.endpoint },
      { isActive: false }
    );

    console.log('❌ Cancelamento de inscrição para notificações push:', {
      userId,
      subscription: subscription.endpoint
    });

    res.status(200).json({
      success: true,
      message: 'Inscrição cancelada com sucesso!'
    });
  } catch (error) {
    console.error('❌ Erro ao cancelar inscrição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
};

// Controller para obter configurações de email do usuário
const getEmailSettings = async (req, res) => {
  try {
    const userId = req.loggedUser?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado'
      });
    }

    let emailSettings = await EmailSettings.findOne({ userId });

    if (!emailSettings) {
      // Criar configurações padrão se não existirem
      emailSettings = new EmailSettings({
        userId,
        emailAddress: req.loggedUser?.email || ''
      });
      await emailSettings.save();
    }

    res.status(200).json({
      success: true,
      emailSettings
    });
  } catch (error) {
    console.error('Erro ao buscar configurações de email:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
};

// Controller para validar email
const validateEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email é obrigatório'
      });
    }

    const validation = await emailService.validateEmailForSettings(email);

    res.status(200).json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('Erro ao validar email:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
};

// Controller para atualizar configurações de email
const updateEmailSettings = async (req, res) => {
  try {
    const userId = req.loggedUser?.id;
    const updateData = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado'
      });
    }

    // Se está atualizando o email, validar primeiro
    if (updateData.emailAddress) {
      console.log(`🔍 Validando novo email: ${updateData.emailAddress}`);

      const validation = await emailService.validateEmailForSettings(updateData.emailAddress);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Email inválido',
          details: validation.message
        });
      }

      if (validation.warning) {
        console.log(`⚠️ Aviso na validação do email: ${validation.message}`);
      }
    }

    // Sanitizar/validar frequência se enviada
    if (updateData.frequency) {
      const freq = updateData.frequency;
      const sanitized = {};
      if (typeof freq.maxEmailsPerHour === 'number') {
        sanitized.maxEmailsPerHour = Math.max(0, Math.floor(freq.maxEmailsPerHour));
      }
      if (typeof freq.maxEmailsPerDay === 'number') {
        sanitized.maxEmailsPerDay = Math.max(0, Math.floor(freq.maxEmailsPerDay));
      }
      if (typeof freq.minIntervalMinutes === 'number') {
        sanitized.minIntervalMinutes = Math.max(0, Math.floor(freq.minIntervalMinutes));
      }
      updateData.frequency = { ...sanitized };
    }

    let emailSettings = await EmailSettings.findOne({ userId });

    if (!emailSettings) {
      emailSettings = new EmailSettings({
        userId,
        ...updateData
      });
    } else {
      Object.assign(emailSettings, updateData);
    }

    await emailSettings.save();

    res.status(200).json({
      success: true,
      message: 'Configurações de email atualizadas com sucesso',
      emailSettings
    });
  } catch (error) {
    console.error('Erro ao atualizar configurações de email:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
};

// Controller para enviar email de teste
const sendTestEmail = async (req, res) => {
  try {
    const userId = req.loggedUser?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado'
      });
    }

    const emailSettings = await EmailSettings.findOne({ userId });

    if (!emailSettings || !emailSettings.emailEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Configurações de email não encontradas ou desabilitadas'
      });
    }

    const result = await emailService.sendTestEmail(emailSettings.emailAddress);

    if (result.success) {
      // Atualizar status do teste
      emailSettings.testEmailSent = true;
      emailSettings.lastTestEmail = new Date();
      await emailSettings.save();

      res.status(200).json({
        success: true,
        message: 'Email de teste enviado com sucesso',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Erro ao enviar email de teste',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Erro ao enviar email de teste:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
};

// Controller para verificar status do serviço de email
const checkEmailServiceStatus = async (req, res) => {
  try {
    const isConnected = await emailService.verifyConnection();

    res.status(200).json({
      success: true,
      emailServiceStatus: isConnected ? 'connected' : 'disconnected',
      message: isConnected ? 'Serviço de email funcionando' : 'Serviço de email indisponível'
    });
  } catch (error) {
    console.error('Erro ao verificar status do serviço de email:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
};

export default {
  getNotifications,
  getNotificationsByCativeiro,
  evaluateNotification,
  getNotificationSummary,
  getUnreadCount,
  markNotificationsSeen,
  subscribeToPush,
  unsubscribeFromPush,
  getEmailSettings,
  updateEmailSettings,
  sendTestEmail,
  checkEmailServiceStatus,
  validateEmail
};
