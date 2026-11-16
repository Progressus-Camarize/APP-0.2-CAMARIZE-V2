import { useState, useEffect } from 'react';
import MemberLayout from '../components/MemberLayout';
import Notification from '../components/Notification';
import { useNotifications } from '../hooks/useNotifications';

const STATUS_BADGE = {
  supported:   { text: 'Supported',     color: '#10b981', bg: '#f0fdf4' },
  unsupported: { text: 'Not supported', color: '#ef4444', bg: '#fef2f2' },
  granted:     { text: 'Granted',       color: '#10b981', bg: '#f0fdf4' },
  denied:      { text: 'Denied',        color: '#ef4444', bg: '#fef2f2' },
  default:     { text: 'Pending',       color: '#f59e0b', bg: '#fefce8' },
  active:      { text: 'Active',        color: '#10b981', bg: '#f0fdf4' },
  inactive:    { text: 'Inactive',      color: '#64748b', bg: '#f8fafc' },
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
  { icon: '🌡️', text: 'Temperature outside the ideal range' },
  { icon: '🧪', text: 'pH outside the ideal range' },
  { icon: '⚗️', text: 'Ammonia level outside the ideal range' },
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
        showToast('Push notifications enabled successfully!');
      } else {
        showToast(hookError || 'Could not enable notifications.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error enabling notifications', 'error');
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await unsubscribeFromPush();
      showToast('Push notifications disabled.');
    } catch (err) {
      showToast(err.message || 'Error disabling notifications', 'error');
    }
  };

  const handleTest = async () => {
    try {
      await testNotification();
      showToast('Test notification sent!');
    } catch (err) {
      showToast(err.message || 'Error sending test notification', 'error');
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
    <MemberLayout title="Push Notifications" subtitle="Manage browser alerts">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Status bar ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>Status</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <StatusItem label="Browser support"      badge={isSupported ? 'supported' : 'unsupported'} />
            <StatusItem label="Permission"           badge={permBadge} />
            <StatusItem label="Notifications"        badge={isSubscribed ? 'active' : 'inactive'} last />
          </div>
        </div>

        {/* ── Navegador não suportado ── */}
        {!isSupported && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '20px 24px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.875rem', fontWeight: 600, color: '#b91c1c' }}>
              Push API not detected
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: '#b91c1c', lineHeight: 1.6 }}>
              Push notifications require HTTPS (or localhost) and a compatible browser.
              Use <strong>Chrome 90+</strong>, <strong>Edge 90+</strong> or <strong>Firefox 44+</strong>.
              On macOS, Safari only supports push from version 16.4 (macOS Ventura) onwards.
            </p>
            {diag && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#7f1d1d', lineHeight: 1.8 }}>
                <div>Service Worker API: <strong>{diag.hasSW ? '✓ present' : '✗ missing'}</strong></div>
                <div>Push Manager API: <strong>{diag.hasPush ? '✓ present' : '✗ missing'}</strong></div>
                <div>Protocol: <strong>{diag.protocol}</strong></div>
                <div>Address: <strong>{diag.host}</strong></div>
              </div>
            )}
          </div>
        )}

        {/* ── Permissão negada ── */}
        {isSupported && permission === 'denied' && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: '20px 24px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.875rem', fontWeight: 600, color: '#c2410c' }}>
              Permission blocked
            </p>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#c2410c', lineHeight: 1.6 }}>
              Click the <strong>lock</strong> icon in the address bar, go to <strong>Notifications</strong> and change it to <strong>Allow</strong>. Then reload the page.
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
                {isSubscribed ? 'Notifications active' : 'Enable notifications'}
              </h2>
              <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
                {isSubscribed
                  ? 'You will receive alerts when pond parameters go outside the ideal range.'
                  : 'Enable to receive browser alerts even with the tab closed.'}
              </p>

              {!isSubscribed ? (
                <button
                  onClick={handleSubscribe}
                  disabled={isLoading}
                  style={{ ...btnBase, background: '#14b8a6', color: '#fff' }}
                >
                  {isLoading ? 'Enabling...' : 'Enable Notifications'}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={handleTest}
                    disabled={isLoading}
                    style={{ ...btnBase, background: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0' }}
                  >
                    Send test notification
                  </button>
                  <button
                    onClick={handleUnsubscribe}
                    disabled={isLoading}
                    style={{ ...btnBase, background: '#fff', color: '#ef4444', border: '1px solid #fecaca' }}
                  >
                    {isLoading ? 'Please wait...' : 'Disable Notifications'}
                  </button>
                </div>
              )}
            </div>

            {/* Info card */}
            <div style={infoCard}>
              <p style={{ margin: '0 0 14px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                When you will be alerted
              </p>
              {ALERT_ITEMS.map(({ icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Info card sozinho quando push não está disponível */
          <div style={infoCard}>
            <p style={{ margin: '0 0 14px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              When you would be alerted
            </p>
            {ALERT_ITEMS.map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: '1.1rem' }}>{icon}</span>
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
