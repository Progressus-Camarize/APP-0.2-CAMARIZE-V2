import nodemailer from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';


// Promisify DNS functions
const resolveMx = promisify(dns.resolveMx);

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Configuração do transporter de email
    this.transporter = nodemailer.createTransport(process.env.NODE_ENV === 'test' ? { jsonTransport: true } : {
      service: 'gmail', // Pode ser alterado para outros provedores
      auth: {
        user: process.env.EMAIL_USER || 'camarize.alertas@gmail.com',
        pass: process.env.EMAIL_PASS || 'sua_senha_de_app'
      }
    });
  }

  // Função para validar formato de email
  validateEmailFormat(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Função para verificar se o domínio tem servidores MX
  async checkDomainMX(domain) {
    try {
      const mxRecords = await Promise.race([
        resolveMx(domain),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('DNS Timeout')), 2000)
        )
      ]);
      return mxRecords.length > 0;
    } catch (error) {
      console.log(`❌ Domínio ${domain} não possui servidores MX válidos ou timeout: ${error.message}`);
      return false;
    }
  }

  // Função para verificar se o email existe (verificação rápida)
  async verifyEmailExists(email) {
    try {
      // Primeiro, validar formato
      if (!this.validateEmailFormat(email)) {
        return {
          exists: false,
          reason: 'Formato de email inválido'
        };
      }

      // Extrair domínio do email
      const domain = email.split('@')[1];
      
      // Verificar se o domínio tem servidores MX (timeout reduzido)
      const hasMX = await Promise.race([
        this.checkDomainMX(domain),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 3000)
        )
      ]);
      
      if (!hasMX) {
        return {
          exists: false,
          reason: 'Domínio não possui servidores de email válidos'
        };
      }

      // Para configurações de usuário, aceitar email com formato válido e domínio MX
      // A verificação SMTP completa pode ser feita posteriormente se necessário
      return {
        exists: 'unknown',
        reason: 'Formato válido e domínio com MX. Email aceito para configurações.'
      };

    } catch (error) {
      console.error('❌ Erro ao verificar email:', error);
      
      // Se der timeout ou erro, fazer verificação básica
      if (this.validateEmailFormat(email)) {
        const domain = email.split('@')[1];
        
        // Lista de domínios conhecidos que geralmente são válidos
        const knownDomains = [
          'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
          'icloud.com', 'protonmail.com', 'aol.com', 'live.com'
        ];
        
        if (knownDomains.includes(domain.toLowerCase())) {
          return {
            exists: 'unknown',
            reason: 'Formato válido e domínio conhecido. Email aceito.'
          };
        }
        
        return {
          exists: 'unknown',
          reason: 'Formato válido. Recomendamos testar o envio.'
        };
      }
      
      return {
        exists: false,
        reason: 'Formato de email inválido'
      };
    }
  }

  // Função para verificar múltiplos emails
  async verifyMultipleEmails(emails) {
    const results = [];
    
    for (const email of emails) {
      const result = await this.verifyEmailExists(email);
      results.push({
        email,
        ...result
      });
    }
    
    return results;
  }

  // Função para validar email antes de salvar nas configurações
  async validateEmailForSettings(email) {
    try {
      console.log(`🔍 Validando email: ${email}`);
      
      // Validação básica de formato primeiro
      if (!this.validateEmailFormat(email)) {
        console.log(`❌ Email ${email} tem formato inválido`);
        return {
          valid: false,
          message: 'Formato de email inválido'
        };
      }

      // Para configurações de usuário, aceitar emails com formato válido
      // A verificação completa pode ser feita posteriormente
      console.log(`✅ Email ${email} tem formato válido - aceito para configurações`);
      return {
        valid: true,
        message: 'Email aceito para configurações. Recomendamos testar o envio.',
        warning: false
      };
      
    } catch (error) {
      console.error('❌ Erro na validação do email:', error);
      return {
        valid: false,
        message: 'Erro interno na validação'
      };
    }
  }

  // Função para enviar email de alerta
  async sendAlertEmail(userEmail, notificationData) {
    try {
      const { tipo, cativeiroNome, valorAtual, valorIdeal, mensagem, severidade, datahora } = notificationData;

      // Determinar cor e ícone baseado na severidade
      const severityConfig = {
        alta: { color: '#ef4444', icon: '🔴', title: 'ALERTA CRÍTICO' },
        media: { color: '#f59e0b', icon: '🟡', title: 'ALERTA MÉDIO' },
        baixa: { color: '#22c55e', icon: '🟢', title: 'ALERTA BAIXO' }
      };

      const config = severityConfig[severidade] || severityConfig.media;

      // Formatar data/hora
      const dataFormatada = new Date(datahora).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Base de URL para links do botão/CTA (pode ser local)
      const ctaBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      // Template HTML do email (design elegante + compatibilidade de clientes)
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${config.title} - Camarize</title>
          <style>
            /* Reset básico para consistência */
            table { border-collapse: collapse; }
            img { border: 0; outline: none; text-decoration: none; display: block; }
            a { text-decoration: none; }
            /* Fonts e cores para clientes que aceitam <style> */
            .title { font-size: 22px; line-height: 1.3; margin: 0 0 8px; }
            .subtitle { margin: 0 0 16px; color: #475569; }
            .kpi-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
            .kpi-value { font-size: 24px; font-weight: 800; color: #0f172a; }
          </style>
        </head>
        <body style="margin:0;padding:24px;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Helvetica Neue',Arial,'Noto Sans','Liberation Sans',sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(2,6,23,0.08);overflow:hidden;border:1px solid #e5e7eb;">
            <!-- Header -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#14b8a6 0%,#0ea5e9 100%);color:#ffffff;">
              <tr>
                <td style="padding:18px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="left" style="vertical-align:middle;">
                        <table role="presentation" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="vertical-align:middle;font-weight:700;font-size:18px;letter-spacing:0.2px;">Camarize</td>
                          </tr>
                        </table>
                      </td>
                      <td align="right" style="vertical-align:middle;">
                        <span style="background:rgba(255,255,255,0.14);color:#ffffff;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;display:inline-block;border:1px solid rgba(255,255,255,0.35);">
                          <span style="display:inline-block;width:8px;height:8px;background:${config.color};border-radius:999px;margin-right:8px;vertical-align:middle;"></span>
                          ${config.title}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Conteúdo principal -->
            <div style="padding:28px 24px;">
              <h1 class="title" style="margin:0 0 8px;font-size:22px;line-height:1.3;">Alerta de ${tipo.toUpperCase()}</h1>
              <p class="subtitle" style="margin:0 0 16px;color:#475569;"><strong>Cativeiro:</strong> ${cativeiroNome}</p>

              <!-- KPIs -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0 6px;border-collapse:collapse;">
                <tr>
                  <td style="width:50%;padding-right:8px;">
                    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;text-align:center;padding:14px 10px;">
                      <div class="kpi-label" style="font-size:12px;color:#64748b;margin-bottom:4px;">Valor Atual</div>
                      <div class="kpi-value" style="font-size:24px;font-weight:800;color:${config.color};">${valorAtual}</div>
                    </div>
                  </td>
                  <td style="width:50%;padding-left:8px;">
                    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;text-align:center;padding:14px 10px;">
                      <div class="kpi-label" style="font-size:12px;color:#64748b;margin-bottom:4px;">Valor Ideal</div>
                      <div class="kpi-value" style="font-size:24px;font-weight:800;color:#10b981;">${valorIdeal}</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Mensagem -->
              <div style="margin:18px 0 6px;background:#fef2f2;border:1px solid #fecaca;border-left:4px solid ${config.color};color:#7f1d1d;padding:12px 14px;border-radius:10px;">
                <strong>Mensagem:</strong> ${mensagem}
              </div>

              <!-- CTA -->
              <a href="${ctaBaseUrl}/status-cativeiros" style="display:inline-block;margin:18px 0 4px;background:linear-gradient(90deg,#14b8a6,#0ea5e9);color:#ffffff !important;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;">Ver no painel</a>
              <div style="margin-top:10px;color:#64748b;font-size:13px;"><strong>Data/Hora:</strong> ${dataFormatada}</div>
            </div>

            <!-- Rodapé -->
            <div style="background:#f8fafc;padding:18px 20px;color:#64748b;text-align:center;font-size:12px;border-top:1px solid #e5e7eb;">
              Este é um alerta automático do sistema Camarize. Gerencie suas preferências nas configurações do sistema.
            </div>
          </div>
        </body>
        </html>
      `;

      // Configuração do email
      const subjectPrefix = process.env.EMAIL_SUBJECT_PREFIX ? `${process.env.EMAIL_SUBJECT_PREFIX} ` : '';
      const mailOptions = {
        from: `"Camarize Alertas" <${process.env.EMAIL_USER || 'camarize.alertas@gmail.com'}>`,
        to: userEmail,
        subject: `${subjectPrefix}${config.icon} ${config.title} - ${tipo.toUpperCase()} em ${cativeiroNome}`,
        html: htmlContent,
        text: `
          ${config.title} - Camarize
          
          Cativeiro: ${cativeiroNome}
          Tipo: ${tipo.toUpperCase()}
          Valor Atual: ${valorAtual}
          Valor Ideal: ${valorIdeal}
          
          Mensagem: ${mensagem}
          
          Data/Hora: ${dataFormatada}
          
          Acesse: ${ctaBaseUrl}/status-cativeiros
        `
      };

      // Enviar email
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email de alerta enviado para ${userEmail}:`, info.messageId);
      
      return {
        success: true,
        messageId: info.messageId,
        email: userEmail
      };

    } catch (error) {
      console.error('❌ Erro ao enviar email de alerta:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Função para enviar email de teste
  async sendTestEmail(userEmail) {
    try {
      const testNotification = {
        tipo: 'teste',
        cativeiroNome: 'Cativeiro de Teste',
        valorAtual: '25.5°C',
        valorIdeal: '24.0°C',
        mensagem: 'Este é um email de teste do sistema de alertas do Camarize.',
        severidade: 'baixa',
        datahora: new Date()
      };

      return await this.sendAlertEmail(userEmail, testNotification);
    } catch (error) {
      console.error('❌ Erro ao enviar email de teste:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Função para verificar se o serviço está funcionando
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('✅ Serviço de email configurado corretamente');
      return true;
    } catch (error) {
      console.error('❌ Erro na configuração do email:', error);
      return false;
    }
  }
}

export default new EmailService();
