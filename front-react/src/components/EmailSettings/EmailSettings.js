import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

const TIPOS_ALERTA = ['temperatura', 'ph', 'amonia'];

// A API guarda as severidades por tipo de alerta; a tela liga/desliga cada severidade para todos os tipos
const severidadeAtiva = (alertTypes, nivel) =>
  TIPOS_ALERTA.some(tipo => alertTypes?.[tipo]?.severity?.[nivel]);

export default function EmailSettings() {
  const [settings, setSettings] = useState({
    emailEnabled: false,
    emailAddress: '',
    alertasCriticos: true,
    alertasModerados: true,
    silencioAtivo: false,
    silencioInicio: '22:00',
    silencioFim: '07:00',
  });
  // Configuração completa vinda da API, para não perder o que a tela não edita
  const alertTypesSalvos = useRef({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchSettings = useCallback(async () => {
    try {
      const token = getToken();
      const res = await axios.get(`${API_URL}/email/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const salvo = res.data?.emailSettings;
      if (salvo) {
        alertTypesSalvos.current = salvo.alertTypes || {};
        setSettings({
          emailEnabled: !!salvo.emailEnabled,
          emailAddress: salvo.emailAddress || '',
          alertasCriticos: severidadeAtiva(salvo.alertTypes, 'alta'),
          alertasModerados: severidadeAtiva(salvo.alertTypes, 'media'),
          silencioAtivo: !!salvo.quietHours?.enabled,
          silencioInicio: salvo.quietHours?.startTime || '22:00',
          silencioFim: salvo.quietHours?.endTime || '07:00',
        });
      }
    } catch (err) {
      console.error('Erro ao buscar configurações de email:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = getToken();
      const alertTypes = Object.fromEntries(TIPOS_ALERTA.map(tipo => {
        const atual = alertTypesSalvos.current?.[tipo] || {};
        return [tipo, {
          enabled: atual.enabled ?? true,
          severity: {
            baixa: atual.severity?.baixa ?? false,
            media: settings.alertasModerados,
            alta: settings.alertasCriticos,
          },
        }];
      }));
      const res = await axios.put(`${API_URL}/email/settings`, {
        emailEnabled: settings.emailEnabled,
        emailAddress: settings.emailAddress.trim(),
        alertTypes,
        quietHours: {
          enabled: settings.silencioAtivo,
          startTime: settings.silencioInicio,
          endTime: settings.silencioFim,
        },
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alertTypesSalvos.current = res.data?.emailSettings?.alertTypes || alertTypes;
      setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
    } catch (err) {
      const { error, details } = err.response?.data || {};
      setMessage({ type: 'error', text: details ? `${error}: ${details}` : (error || 'Erro ao salvar configurações.') });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setMessage(null);
    try {
      const token = getToken();
      await axios.post(`${API_URL}/email/test`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage({ type: 'success', text: 'Email de teste enviado!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao enviar email de teste.' });
    }
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
        Carregando configurações...
      </div>
    );
  }

  const cardStyle = {
    background: '#fff',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '16px',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px',
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  const toggleStyle = (active) => ({
    width: '48px',
    height: '26px',
    borderRadius: '13px',
    background: active ? '#10b981' : '#d1d5db',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s',
    flexShrink: 0,
  });

  const toggleDotStyle = (active) => ({
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: '3px',
    left: active ? '25px' : '3px',
    transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  });

  return (
    <div>
      {/* Message Banner */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          fontSize: '14px',
        }}>
          {message.type === 'success' ? '✅' : '❌'} {message.text}
        </div>
      )}

      {/* Notificações Ativas */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Notificações por Email
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
              Ativar ou desativar todas as notificações por email
            </p>
          </div>
          <button
            onClick={() => handleChange('emailEnabled', !settings.emailEnabled)}
            style={toggleStyle(settings.emailEnabled)}
            aria-label="Ativar notificações"
            aria-pressed={settings.emailEnabled}
          >
            <div style={toggleDotStyle(settings.emailEnabled)} />
          </button>
        </div>
      </div>

      {/* Email Destinatário */}
      <div style={cardStyle}>
        <label style={labelStyle}>Email para notificações</label>
        <input
          type="email"
          style={inputStyle}
          placeholder="seu@email.com"
          value={settings.emailAddress}
          onChange={(e) => handleChange('emailAddress', e.target.value)}
        />
      </div>

      {/* Horário de silêncio */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: settings.silencioAtivo ? '16px' : 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Horário de silêncio
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
              Não enviar emails nesse intervalo (ex.: durante a noite)
            </p>
          </div>
          <button
            onClick={() => handleChange('silencioAtivo', !settings.silencioAtivo)}
            style={toggleStyle(settings.silencioAtivo)}
            aria-label="Ativar horário de silêncio"
            aria-pressed={settings.silencioAtivo}
          >
            <div style={toggleDotStyle(settings.silencioAtivo)} />
          </button>
        </div>
        {settings.silencioAtivo && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Início</label>
              <input
                type="time"
                style={inputStyle}
                value={settings.silencioInicio}
                onChange={(e) => handleChange('silencioInicio', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Fim</label>
              <input
                type="time"
                style={inputStyle}
                value={settings.silencioFim}
                onChange={(e) => handleChange('silencioFim', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tipos de Notificação */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
          Tipos de Notificação
        </h3>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Alertas Críticos</span>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9ca3af' }}>
              Parâmetros muito fora dos limites ideais (severidade alta)
            </p>
          </div>
          <button
            onClick={() => handleChange('alertasCriticos', !settings.alertasCriticos)}
            style={toggleStyle(settings.alertasCriticos)}
            aria-label="Ativar alertas críticos"
            aria-pressed={settings.alertasCriticos}
          >
            <div style={toggleDotStyle(settings.alertasCriticos)} />
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Alertas Moderados</span>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9ca3af' }}>
              Parâmetros saindo dos limites ideais (severidade média)
            </p>
          </div>
          <button
            onClick={() => handleChange('alertasModerados', !settings.alertasModerados)}
            style={toggleStyle(settings.alertasModerados)}
            aria-label="Ativar alertas moderados"
            aria-pressed={settings.alertasModerados}
          >
            <div style={toggleDotStyle(settings.alertasModerados)} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: saving ? '#93c5fd' : '#3b82f6',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
        <button
          onClick={handleTestEmail}
          style={{
            padding: '12px 20px',
            borderRadius: '10px',
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#374151',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          📧 Testar Email
        </button>
      </div>
    </div>
  );
}
