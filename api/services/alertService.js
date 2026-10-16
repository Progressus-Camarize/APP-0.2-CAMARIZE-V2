import EmailSettings from '../models/EmailSettings.js';
import PushSubscription from '../models/PushSubscriptions.js';
import FazendasxCativeiros from '../models/FazendasxCativeiros.js';
import UsuariosxFazendas from '../models/UsuariosxFazendas.js';
import emailService from './emailService.js';

// Retorna os IDs de todos os usuários ativos ligados a um cativeiro via fazenda
const getUserIdsByCativeiro = async (cativeiroId) => {
  const fazendaRel = await FazendasxCativeiros.findOne({ cativeiro: cativeiroId });
  if (!fazendaRel) return [];
  const userRels = await UsuariosxFazendas.find({ fazenda: fazendaRel.fazenda, ativo: true });
  return userRels.map(r => r.usuario);
};

const sendEmailsForAlert = async (alertData, userIds) => {
  const emailSettingsList = await EmailSettings.find({
    userId: { $in: userIds },
    emailEnabled: true
  }).populate('userId', 'nome email');

  for (const emailSettings of emailSettingsList) {
    try {
      const forceSend = process.env.EMAIL_FORCE_SEND === 'true';

      if (!forceSend && !emailSettings.shouldSendEmail(alertData.tipo, alertData.severidade)) {
        console.log(`⏭️ E-mail pulado para ${emailSettings.emailAddress} - configurações não atendidas`);
        continue;
      } else if (forceSend) {
        console.log(`⚙️  Forçando envio ignorando preferências (EMAIL_FORCE_SEND=true)`);
      }

      if (!forceSend && emailSettings.isInQuietHours()) {
        console.log(`🌙 E-mail pulado para ${emailSettings.emailAddress} - horário de silêncio`);
        continue;
      }

      const disableRateLimit = process.env.EMAIL_DISABLE_RATE_LIMIT === 'true';
      if (!disableRateLimit && !emailSettings.canSendEmail()) {
        const reason = emailSettings.getLastBlockReason?.() || 'rate_limit';
        const reasonText = {
          min_interval: `intervalo mínimo de ${emailSettings.frequency?.minIntervalMinutes ?? '?'} min não cumprido`,
          hour_limit: `máximo por hora (${emailSettings.frequency?.maxEmailsPerHour ?? '?'}) atingido`,
          day_limit: `máximo por dia (${emailSettings.frequency?.maxEmailsPerDay ?? '?'}) atingido`,
          rate_limit: 'limite de frequência atingido'
        }[reason];
        console.log(`⏰ E-mail pulado para ${emailSettings.emailAddress} - ${reasonText}`);
        continue;
      }

      const result = await emailService.sendAlertEmail(emailSettings.emailAddress, alertData);

      if (result.success) {
        emailSettings.recordEmailSent();
        await emailSettings.save();
        console.log(`✅ E-mail enviado para ${emailSettings.emailAddress}:`, result.messageId);
      } else {
        console.error(`❌ Erro ao enviar e-mail para ${emailSettings.emailAddress}:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Erro ao processar e-mail para ${emailSettings.emailAddress}:`, error);
    }
  }
};

const sendPushForAlert = async (alertData, userIds) => {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log('⚠️ Push ignorado: VAPID keys não configuradas');
    return;
  }

  const subscriptions = await PushSubscription.find({
    userId: { $in: userIds },
    isActive: true
  });

  if (subscriptions.length === 0) {
    console.log(`ℹ️ Nenhuma subscription push ativa para o cativeiro ${alertData.cativeiroNome}`);
    return;
  }

  const webpush = await import('web-push');
  webpush.default.setVapidDetails('mailto:camarize@example.com', vapidPublicKey, vapidPrivateKey);

  const payload = JSON.stringify({
    title: 'Camarize - Alerta',
    body: alertData.mensagem,
    icon: '/images/logo_camarize1.png',
    badge: '/images/logo_camarize2.png',
    data: {
      url: `/rel-individual/${alertData.cativeiro}`,
      cativeiroId: alertData.cativeiro,
      tipo: alertData.tipo,
      severidade: alertData.severidade
    }
  });

  for (const sub of subscriptions) {
    try {
      await webpush.default.sendNotification(sub.subscription, payload);
      console.log(`✅ Push enviado para subscription ${sub._id}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar push para subscription ${sub._id}:`, error);
      if (error.statusCode === 410) {
        await PushSubscription.findByIdAndUpdate(sub._id, { isActive: false });
        console.log(`🗑️ Subscription ${sub._id} marcada como inativa`);
      }
    }
  }
};

// Ponto de entrada: envia e-mail + push para todos os usuários ativos do cativeiro
const sendAlert = async (alertData) => {
  try {
    console.log(`🚨 Enviando alerta: ${alertData.tipo} - ${alertData.cativeiroNome}`);

    const userIds = await getUserIdsByCativeiro(alertData.cativeiro);
    if (userIds.length === 0) {
      console.log(`⚠️ Nenhum usuário ativo encontrado para o cativeiro ${alertData.cativeiroNome}`);
      return;
    }

    console.log(`👥 ${userIds.length} usuário(s) encontrado(s) para ${alertData.cativeiroNome}`);

    await sendEmailsForAlert(alertData, userIds);
    await sendPushForAlert(alertData, userIds);
  } catch (error) {
    console.error('❌ Erro ao enviar alerta:', error);
  }
};

const sendPush = async (alertData) => {
  const userIds = await getUserIdsByCativeiro(alertData.cativeiro);
  if (userIds.length) await sendPushForAlert(alertData, userIds);
};

export default { sendAlert, sendPush, getUserIdsByCativeiro };
