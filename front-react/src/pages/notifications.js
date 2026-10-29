import React, { useState, useEffect } from "react";
import MemberLayout from "../components/MemberLayout";
import axios from "axios";
import { useUnreadAvisos } from "../hooks/useUnreadAvisos";
import { formatarTempoDesde } from "@/lib/tempo";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { markSeen } = useUnreadAvisos();

  useEffect(() => {
    fetchNotifications();
    markSeen();
  }, [markSeen]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
      const token = typeof window !== "undefined" ? (sessionStorage.getItem("token") || localStorage.getItem("token")) : null;

      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.get(`${apiUrl}/notifications`, { headers });

      if (response.data.success) {
        setNotifications(response.data.notifications);
      } else {
        setError('Erro ao carregar notificações');
      }
    } catch (err) {
      console.error('Erro ao buscar notificações:', err);
      setError('Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  };

  const avaliar = async (notification, avaliacao) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      const token = sessionStorage.getItem('token') || localStorage.getItem('token');
      await axios.patch(`${apiUrl}/notifications/${notification.id}/avaliacao`, { avaliacao }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(items => items.map(item => item.id === notification.id
        ? { ...item, avaliacao, verificadoEm: new Date().toISOString() } : item));
    } catch {
      setError('Não foi possível registrar a conferência. Tente novamente.');
    }
  };

  const getIcon = (tipo) => {
    switch (tipo) {
      case 'temperatura':
        return '🌡️';
      case 'ph':
        return '🧪';
      case 'amonia':
        return '⚗️';
      case 'sensor_inativo':
        return '📡';
      default:
        return '🔔';
    }
  };

  const getSeverityColor = (severidade) => {
    switch (severidade) {
      case 'alta':
        return '#ff4444';
      case 'media':
        return '#ff8800';
      default:
        return '#ffaa00';
    }
  };

  const formatTime = (datahora) => {
    const date = new Date(datahora);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (datahora) => {
    const date = new Date(datahora);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hoje';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    } else {
      return date.toLocaleDateString('pt-BR');
    }
  };
  return (
    <MemberLayout title="Notificações" subtitle="Alertas e avisos dos seus cativeiros">
      {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 24px',
            color: '#888',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Carregando notificações...</div>
          </div>
        ) : error ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 24px',
            color: '#ff4444',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Erro ao carregar</div>
            <div style={{ fontSize: '14px' }}>{error}</div>
            <button
              onClick={fetchNotifications}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                background: '#007bff',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notifications.map((notification, i) => (
                <div key={notification.id || i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#fff',
                  borderRadius: 12,
                  border: `2px solid ${notification.estado === 'recuperado' ? '#94a3b8' : getSeverityColor(notification.severidade)}`,
                  padding: 16,
                  gap: 16,
                  transition: 'box-shadow 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: getSeverityColor(notification.severidade),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    color: '#000'
                  }}>
                    {getIcon(notification.tipo)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, color: '#333' }}>
                      {notification.mensagem}
                    </div>
                    <div style={{ color: '#888', fontSize: 14, marginTop: 2 }}>
                      {notification.cativeiroNome}
                    </div>
                    <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
                      {formatDate(notification.datahora)} às {formatTime(notification.datahora)}
                    </div>
                    <div style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
                      {notification.estado === 'recuperado' ? 'Recuperado' : 'Ativo'} · Última leitura: {formatarTempoDesde(notification.frescor?.idadeMinutos) ?? '—'} · {notification.frescor?.estado === 'recente' ? 'dados recentes' : 'dados antigos ou ausentes'}
                      {notification.experimental ? ' · sensor sem calibração · medição experimental' : ''}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                      Período analisado: {formatDate(notification.periodoInicio)} às {formatTime(notification.periodoInicio)} até {formatDate(notification.periodoFim)} às {formatTime(notification.periodoFim)}
                    </div>
                    {notification.verificadoEm ? (
                      <div style={{ color: '#166534', fontSize: 12, marginTop: 4 }}>Conferido: {notification.avaliacao === 'falso_alarme' ? 'falso alarme' : 'mudança confirmada'}</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" onClick={() => avaliar(notification, 'confirmado')}>Conferi a mudança</button>
                        <button type="button" onClick={() => avaliar(notification, 'falso_alarme')}>Falso alarme</button>
                      </div>
                    )}
                  </div>
                  <div style={{
                    color: getSeverityColor(notification.severidade),
                    fontWeight: 600,
                    fontSize: 12,
                    textTransform: 'uppercase'
                  }}>
                    {notification.estado}
                  </div>
                </div>
              ))}
            </div>

            {notifications.length === 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '56px 24px',
                color: '#94a3b8',
                textAlign: 'center',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
              }}>
                <div style={{ fontSize: '42px', marginBottom: '12px', opacity: 0.4 }}>🔔</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Nenhuma notificação</div>
              </div>
            )}
          </>
        )}
    </MemberLayout>
  );
}
