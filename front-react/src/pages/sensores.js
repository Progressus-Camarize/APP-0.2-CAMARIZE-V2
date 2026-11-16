import { useEffect, useState } from 'react';
import axios from 'axios';
import MemberLayout from '../components/MemberLayout';
import Notification from '../components/Notification';
import styles from '../styles/panel.module.css';

const SENSOR_CFG = {
  temperatura: { label: 'Temperature', icon: '🌡️', bg: '#fff7ed', stripe: '#f97316', badgeBg: '#ffedd5', badgeColor: '#c2410c' },
  ph:          { label: 'pH',          icon: '🧪', bg: '#eff6ff', stripe: '#3b82f6', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' },
  amonia:      { label: 'Ammonia',     icon: '⚗️', bg: '#fdf4ff', stripe: '#a855f7', badgeBg: '#f3e8ff', badgeColor: '#7e22ce' },
};

const DEFAULT_CFG = { label: 'Sensor', icon: '📡', bg: '#f8fafc', stripe: '#94a3b8', badgeBg: '#f1f5f9', badgeColor: '#475569' };

function normalizeTipo(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s.includes('temp')) return 'temperatura';
  if (s.includes('ph') || s.includes('acide')) return 'ph';
  if (s.includes('amon') || s.includes('nh3')) return 'amonia';
  return null;
}

const FILTROS_TIPO = [
  { key: '', label: 'All' },
  { key: 'temperatura', label: 'Temperature' },
  { key: 'ph', label: 'pH' },
  { key: 'amonia', label: 'Ammonia' },
];

export default function SensoresPage() {
  const [sensores, setSensores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [ordenado, setOrdenado] = useState(false);

  useEffect(() => {
    async function fetchSensores() {
      try {
        setLoading(true);
        setError(null);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
        const token = typeof window !== 'undefined'
          ? (sessionStorage.getItem('token') || localStorage.getItem('token'))
          : null;

        if (!token) {
          setError('You need to be logged in to access this page.');
          return;
        }

        const cativeirosRes = await axios.get(`${apiUrl}/cativeiros`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const cativeiros = Array.isArray(cativeirosRes.data) ? cativeirosRes.data : [];

        const lists = await Promise.all(
          cativeiros.map(async (c) => {
            try {
              const res = await axios.get(`${apiUrl}/cativeiros/${c._id}/sensores`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              return (Array.isArray(res.data) ? res.data : []).map((r) => {
                const s = r.id_sensor || r;
                if (!s?._id) return null;
                let tipoRaw = '';
                if (s.id_tipo_sensor) {
                  if (typeof s.id_tipo_sensor === 'object') tipoRaw = s.id_tipo_sensor.descricao || s.id_tipo_sensor.nome || '';
                  else if (typeof s.id_tipo_sensor === 'string' && !/^[0-9a-fA-F]{24}$/.test(s.id_tipo_sensor)) tipoRaw = s.id_tipo_sensor;
                }
                if (!tipoRaw && s.apelido) tipoRaw = s.apelido;
                return {
                  _id: s._id,
                  tipoRaw,
                  tipoKey: normalizeTipo(tipoRaw),
                  apelido: s.apelido || '',
                  cativeiroId: c._id,
                  cativeiroNome: c.nome || '—',
                };
              }).filter(Boolean);
            } catch {
              return [];
            }
          })
        );

        const merged = [].concat(...lists);
        const unique = Array.from(new Map(merged.map(s => [String(s._id), s])).values());
        setSensores(unique);
      } catch (err) {
        if (err.response?.status === 401) {
          setError('Session expired. Please log in again.');
        } else {
          setError('Error loading sensors. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSensores();
  }, []);

  const filtrados = sensores.filter((s) => {
    const cfg = SENSOR_CFG[s.tipoKey] || DEFAULT_CFG;
    const termo = busca.toLowerCase();
    const matchBusca = !busca ||
      cfg.label.toLowerCase().includes(termo) ||
      s.apelido.toLowerCase().includes(termo) ||
      s.cativeiroNome.toLowerCase().includes(termo);
    const matchTipo = !tipoFiltro || s.tipoKey === tipoFiltro;
    return matchBusca && matchTipo;
  });

  const lista = ordenado
    ? [...filtrados].sort((a, b) => {
        return sensores.findIndex(s => s._id === b._id) - sensores.findIndex(s => s._id === a._id);
      })
    : filtrados;

  const countByType = { temperatura: 0, ph: 0, amonia: 0 };
  sensores.forEach(s => { if (s.tipoKey && countByType[s.tipoKey] !== undefined) countByType[s.tipoKey]++; });

  const temFiltroAtivo = busca || tipoFiltro;

  if (loading) {
    return (
      <MemberLayout title="Sensors" subtitle="Sensors connected to your ponds">
        <div className={styles.loadingScreen} style={{ minHeight: 'unset', padding: '60px 0' }}>
          Loading sensors...
        </div>
      </MemberLayout>
    );
  }

  if (error) {
    return (
      <MemberLayout title="Sensors" subtitle="Sensors connected to your ponds">
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>⚠️</div>
          <p className={styles.emptyStateText}>{error}</p>
        </div>
      </MemberLayout>
    );
  }

  return (
    <MemberLayout title="Sensors" subtitle="Sensors connected to your ponds">
      <div className={styles.section}>

        {/* Cabeçalho */}
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>IoT Sensors</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              {sensores.length} linked sensor{sensores.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
            onClick={() => setOrdenado(o => !o)}
            title={ordenado ? 'Remove sorting' : 'Sort by code, descending'}
            style={ordenado ? { borderColor: '#a3c7f7', background: '#eff6ff', color: '#1d4ed8' } : {}}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path d="M3 18h6M3 6h18M3 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {ordenado ? 'Sorted ↓' : 'Sort'}
          </button>
        </div>

        {/* Cards de resumo por tipo */}
        {sensores.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {Object.entries(SENSOR_CFG).map(([key, cfg]) => (
              <div
                key={key}
                onClick={() => setTipoFiltro(tipoFiltro === key ? '' : key)}
                style={{
                  flex: 1, minWidth: 110, background: cfg.bg,
                  borderRadius: 12, padding: '12px 16px',
                  border: `1px solid ${tipoFiltro === key ? cfg.stripe : cfg.badgeBg}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', transition: 'box-shadow 0.18s',
                  boxShadow: tipoFiltro === key ? `0 0 0 2px ${cfg.stripe}` : 'none',
                }}
              >
                <span style={{ fontSize: 22 }}>{cfg.icon}</span>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: cfg.badgeColor, lineHeight: 1 }}>
                    {countByType[key]}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: cfg.badgeColor, opacity: 0.8, marginTop: 2 }}>
                    {cfg.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Barra de busca + filtros de tipo */}
        <div className={styles.filterBar} style={{ alignItems: 'center' }}>
          {/* Campo de busca com ícone interno */}
          <div className={styles.filterGroup} style={{ flex: 1 }}>
            <label className={styles.filterLabel}>Search</label>
            <div style={{ position: 'relative' }}>
              <svg
                width="15" height="15" fill="none" viewBox="0 0 24 24"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                className={styles.filterInput}
                type="text"
                placeholder="Type, nickname or pond..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ paddingLeft: 32, width: '100%', minWidth: 0 }}
              />
            </div>
          </div>

          {/* Pills de tipo */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTROS_TIPO.map(({ key, label }) => {
                const cfg = SENSOR_CFG[key];
                const active = tipoFiltro === key;
                return (
                  <button
                    key={key || 'todos'}
                    onClick={() => setTipoFiltro(key)}
                    className={`${styles.btn} ${styles.btnSm}`}
                    style={{
                      background: active ? (cfg?.badgeBg || '#1e293b') : '#f8fafc',
                      color: active ? (cfg?.badgeColor || '#fff') : '#64748b',
                      border: `1px solid ${active ? (cfg?.stripe || '#1e293b') : '#e2e8f0'}`,
                      fontWeight: active ? 600 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    {cfg ? `${cfg.icon} ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contador de resultados quando há filtro ativo */}
          {temFiltroAtivo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'flex-end' }}>
              <span className={styles.filterCount}>
                {lista.length} of {sensores.length}
              </span>
              <button
                onClick={() => { setBusca(''); setTipoFiltro(''); }}
                className={`${styles.btn} ${styles.btnSm}`}
                style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontSize: 11 }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Lista de sensores */}
        {lista.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>📡</div>
            <p className={styles.emptyStateText}>
              {sensores.length === 0
                ? 'No sensors linked to your ponds.'
                : 'No sensors match the applied filter.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12 }}>
            {lista.map((sensor) => {
              const cfg = SENSOR_CFG[sensor.tipoKey] || DEFAULT_CFG;
              const displayIdx = sensores.findIndex(s => s._id === sensor._id) + 1;
              return (
                <div
                  key={sensor._id}
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 14,
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s, transform 0.15s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {/* Stripe colorida superior */}
                  <div style={{ height: 4, background: cfg.stripe }} />

                  <div style={{ padding: '14px 16px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: cfg.bg, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, flexShrink: 0,
                      }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600, fontSize: '0.9rem', color: '#1e293b',
                          marginBottom: 4, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {sensor.apelido || 'No nickname'}
                        </div>
                        <span style={{
                          display: 'inline-block',
                          background: cfg.badgeBg, color: cfg.badgeColor,
                          padding: '2px 9px', borderRadius: 20,
                          fontSize: '10.5px', fontWeight: 700,
                          textTransform: 'capitalize', letterSpacing: '0.03em',
                        }}>
                          {cfg.label}
                        </span>
                      </div>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 11,
                        color: '#94a3b8', background: '#f1f5f9',
                        padding: '2px 7px', borderRadius: 6, flexShrink: 0,
                      }}>
                        #{String(displayIdx).padStart(3, '0')}
                      </span>
                    </div>

                    {/* Cativeiro */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: '#f8fafc', borderRadius: 8,
                      padding: '6px 10px', fontSize: '0.78rem', color: '#64748b',
                    }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" style={{ flexShrink: 0, color: '#94a3b8' }}>
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sensor.cativeiroNome}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notification.show && (
        <Notification
          isVisible={notification.show}
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ show: false, message: '', type: 'success' })}
        />
      )}
    </MemberLayout>
  );
}
