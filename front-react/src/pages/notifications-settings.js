import { useState, useEffect } from 'react';
import MemberLayout from '../components/MemberLayout';
import Notification from '../components/Notification';
import { useNotifications } from '../hooks/useNotifications';
import IconeParametro from '../components/IconeParametro';

const STATUS_BADGE = {
  supported:   { text: 'Suportado',     color: '#10b981', bg: '#f0fdf4' },
  unsupported: { text: 'Não suportado', color: '#ef4444', bg: '#fef2f2' },
  granted:     { text: 'Concedida',     color: '#10b981', bg: '#f0fdf4' },
  denied:      { text: 'Negada',        color: '#ef4444', bg: '#fef2f2' },
  default:     { text: 'Pendente',      color: '#f59e0b', bg: '#fefce8' },
  active:      { text: 'Ativas',        color: '#10b981', bg: '#f0fdf4' },
  inactive:    { text: 'Inativas',      color: '#64748b', bg: '#f8fafc' },
};

function Badge({ variant }) {
  const s = STATUS_BADGE[variant] || STATUS_BADGE.inactive;
  return (
    <span style={{
      fontSize: '0.78rem',
      fontWeight: 600,
      padding: '3px 12px',
      borderRadius: 999,
      color: s.color,
      background: s.bg,
    }}>
      {s.text}
    </span>
  );
}

function StatusItem({ label, badge, last }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 160,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '16px 20px',
      borderRight: last ? 'none' : '1px solid #f1f5f9',
    }}>
      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <Badge variant={badge} />
    </div>
  );
}

const ALERT_ITEMS = [
  { tipo: 'temperatura', cor: '#c2410c', text: 'Temperatura fora do intervalo ideal' },
  { tipo: 'ph', cor: '#1d4ed8', text: 'pH fora do intervalo ideal' },
  { tipo: 'amonia', cor: '#7e22ce', text: 'Nível de amônia fora do intervalo ideal' },
];

export default function NotificationsSettings() {
  const {
    isSupported,
    isSubscribed,
    permission,
    isLoading,
    error: hookError,
    subscribeToPush,
    unsubscribeFromPush,
    testNotification,
  } = useNotifications();

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [diag, setDiag] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDiag({
      hasSW:   'serviceWorker' in navigator,
      hasPush: 'PushManager' in window,
      protocol: window.location.protocol,
      host: window.location.host,
    });
  }, []);

  const showToast = (message, type = 'success') => setToast({ show: true, message, type });
  const hideToast = () => setToast({ show: false, message: '', type: 'success' });

  const handleSubscribe = async () => {
    try {
      const success = await subscribeToPush();
      if (success) {
        showToast('Notificações push ativadas com sucesso!');
      } else {
        showToast(hookError || 'Não foi possível ativar as notificações.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Erro ao ativar notificações', 'error');
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await unsubscribeFromPush();
      showToast('Notificações push desativadas.');
    } catch (err) {
      showToast(err.message || 'Erro ao desativar notificações', 'error');
    }
  };

  const handleTest = async () => {
    try {
      await testNotification();
      showToast('Notificação de teste enviada!');
    } catch (err) {
      showToast(err.message || 'Erro ao enviar notificação de teste', 'error');
    }
  };

  const card = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '24px',
  };

  const btnBase = {
    width: '100%',
    padding: '14px',
    borderRadius: 12,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: isLoading ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'opacity 0.15s',
    opacity: isLoading ? 0.6 : 1,
  };

  const infoCard = {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '20px 24px',
  };

  const permBadge = permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'default';
  const actionable = isSupported && permission !== 'denied';

  return (
    <MemberLayout title="Notificações Push" subtitle="Gerencie alertas no navegador">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Status bar ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>Status</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <StatusItem label="Suporte do navegador" badge={isSupported ? 'supported' : 'unsupported'} />
            <StatusItem label="Permissão"            badge={permBadge} />
            <StatusItem label="Notificações"         badge={isSubscribed ? 'active' : 'inactive'} last />
          </div>
        </div>

        {/* ── Navegador não suportado ── */}
        {!isSupported && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '20px 24px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.875rem', fontWeight: 600, color: '#b91c1c' }}>
              API de push não detectada
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: '#b91c1c', lineHeight: 1.6 }}>
              Notificações push requerem HTTPS (ou localhost) e um navegador compatível.
              Use <strong>Chrome 90+</strong>, <strong>Edge 90+</strong> ou <strong>Firefox 44+</strong>.
              No macOS, Safari só suporta push a partir da versão 16.4 (macOS Ventura).
            </p>
            {diag && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#7f1d1d', lineHeight: 1.8 }}>
                <div>Service Worker API: <strong>{diag.hasSW ? '✓ presente' : '✗ ausente'}</strong></div>
                <div>Push Manager API: <strong>{diag.hasPush ? '✓ presente' : '✗ ausente'}</strong></div>
                <div>Protocolo: <strong>{diag.protocol}</strong></div>
                <div>Endereço: <strong>{diag.host}</strong></div>
              </div>
            )}
          </div>
        )}

        {/* ── Permissão negada ── */}
        {isSupported && permission === 'denied' && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: '20px 24px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.875rem', fontWeight: 600, color: '#c2410c' }}>
              Permissão bloqueada
            </p>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#c2410c', lineHeight: 1.6 }}>
              Clique no <strong>cadeado</strong> na barra de endereços, vá em <strong>Notificações</strong> e altere para <strong>Permitir</strong>. Em seguida, recarregue a página.
            </p>
          </div>
        )}

        {/* ── Ação + Info em grade no desktop ── */}
        {actionable ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}>
            {/* Action card */}
            <div style={card}>
              <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>
                {isSubscribed ? 'Notificações ativas' : 'Ativar notificações'}
              </h2>
              <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
                {isSubscribed
                  ? 'Você receberá alertas quando os parâmetros dos cativeiros saírem do ideal.'
                  : 'Ative para receber alertas no navegador mesmo com a aba fechada.'}
              </p>

              {!isSubscribed ? (
                <button
                  onClick={handleSubscribe}
                  disabled={isLoading}
                  style={{ ...btnBase, background: '#14b8a6', color: '#fff' }}
                >
                  {isLoading ? 'Ativando...' : 'Ativar Notificações'}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={handleTest}
                    disabled={isLoading}
                    style={{ ...btnBase, background: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0' }}
                  >
                    Enviar notificação de teste
                  </button>
                  <button
                    onClick={handleUnsubscribe}
                    disabled={isLoading}
                    style={{ ...btnBase, background: '#fff', color: '#ef4444', border: '1px solid #fecaca' }}
                  >
                    {isLoading ? 'Aguarde...' : 'Desativar Notificações'}
                  </button>
                </div>
              )}
            </div>

            {/* Info card */}
            <div style={infoCard}>
              <p style={{ margin: '0 0 14px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Quando você será alertado
              </p>
              {ALERT_ITEMS.map(({ tipo, cor, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <IconeParametro tipo={tipo} style={{ fontSize: '1.1rem', color: cor, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Info card sozinho quando push não está disponível */
          <div style={infoCard}>
            <p style={{ margin: '0 0 14px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quando você seria alertado
            </p>
            {ALERT_ITEMS.map(({ tipo, cor, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <IconeParametro tipo={tipo} style={{ fontSize: '1.1rem', color: cor, flexShrink: 0 }} />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>{text}</span>
              </div>
            ))}
          </div>
        )}

      </div>

      <Notification
        isVisible={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />
    </MemberLayout>
  );
}
