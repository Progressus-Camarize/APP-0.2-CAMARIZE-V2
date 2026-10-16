import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import MemberLayout from "../components/MemberLayout";
import styles from "../styles/panel.module.css";

const STATUS_CFG = {
  critico: { label: 'Crítico',  icon: '🚨', bg: '#fef2f2', stripe: '#ef4444', badgeBg: '#fee2e2', badgeColor: '#b91c1c', borderColor: '#ef4444' },
  alerta:  { label: 'Alerta',   icon: '⚠️', bg: '#fffbeb', stripe: '#f59e0b', badgeBg: '#fef9c3', badgeColor: '#92400e', borderColor: '#f59e0b' },
  ok:      { label: 'Normal',   icon: '✅', bg: '#f0fdf4', stripe: '#10b981', badgeBg: '#dcfce7', badgeColor: '#15803d', borderColor: '#10b981' },
  default: { label: 'Sem dados',icon: '❓', bg: '#f8fafc', stripe: '#94a3b8', badgeBg: '#f1f5f9', badgeColor: '#475569', borderColor: '#94a3b8' },
};

const TIPO_ICON = { temperatura: '🌡️', ph: '🧪', amonia: '⚗️' };

export default function StatusCativeirosPage() {
  const router = useRouter();
  const [cativeirosStatus, setCativeirosStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('');

  const fetchCativeirosStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = typeof window !== 'undefined'
        ? (sessionStorage.getItem('token') || localStorage.getItem('token'))
        : null;
      if (!token) { router.push('/login'); return; }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      const response = await axios.get(`${apiUrl}/cativeiros-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        setCativeirosStatus(response.data.cativeiros || []);
      } else {
        setError('Erro ao carregar status dos cativeiros.');
      }
    } catch (err) {
      if (err.response?.status === 401) router.push('/login');
      else setError('Erro ao carregar status dos cativeiros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCativeirosStatus(); }, []);

  const formatDateTime = (datahora) => {
    if (!datahora) return null;
    const date = new Date(datahora);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === today.toDateString()) return `Hoje às ${hora}`;
    if (date.toDateString() === yesterday.toDateString()) return `Ontem às ${hora}`;
    return `${date.toLocaleDateString('pt-BR')} às ${hora}`;
  };

  const criticoCativeiros = cativeirosStatus.filter(c => c.status === 'critico');
  const alertaCativeiros  = cativeirosStatus.filter(c => c.status === 'alerta');
  const okCativeiros      = cativeirosStatus.filter(c => c.status === 'ok');
  const semDadosCativeiros = cativeirosStatus.filter(c => c.status === 'sem_dados');
  const hasAnyAtualizacao = cativeirosStatus.some(c => !!c.ultimaAtualizacao);

  const GRUPOS = [
    { key: 'critico', list: criticoCativeiros },
    { key: 'alerta',  list: alertaCativeiros },
    { key: 'ok',      list: okCativeiros },
    { key: 'sem_dados', list: semDadosCativeiros },
  ].filter(g => g.list.length > 0);

  const gruposVisiveis = filtroStatus
    ? GRUPOS.filter(g => g.key === filtroStatus)
    : GRUPOS;

  const SUMMARY = [
    { key: '',        label: 'Total',    count: cativeirosStatus.length, bg: '#f8fafc', color: '#1e293b', border: '#e2e8f0' },
    { key: 'critico', label: 'Críticos', count: criticoCativeiros.length, bg: '#fef2f2', color: '#b91c1c', border: '#ef4444' },
    { key: 'alerta',  label: 'Alertas',  count: alertaCativeiros.length,  bg: '#fffbeb', color: '#92400e', border: '#f59e0b' },
    { key: 'ok',      label: 'OK',       count: okCativeiros.length,       bg: '#f0fdf4', color: '#15803d', border: '#10b981' },
    { key: 'sem_dados', label: 'Dados antigos/ausentes', count: semDadosCativeiros.length, bg: '#f8fafc', color: '#475569', border: '#94a3b8' },
  ];

  if (loading) {
    return (
      <MemberLayout title="Status dos Cativeiros" subtitle="Visão geral de saúde de cada cativeiro">
        <div className={styles.loadingScreen} style={{ minHeight: 'unset', padding: '60px 0' }}>
          Carregando status...
        </div>
      </MemberLayout>
    );
  }

  if (error) {
    return (
      <MemberLayout title="Status dos Cativeiros" subtitle="Visão geral de saúde de cada cativeiro">
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>⚠️</div>
          <p className={styles.emptyStateText}>{error}</p>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ marginTop: 16 }}
            onClick={fetchCativeirosStatus}
          >
            Tentar novamente
          </button>
        </div>
      </MemberLayout>
    );
  }

  return (
    <MemberLayout title="Status dos Cativeiros" subtitle="Visão geral de saúde de cada cativeiro">
      <div className={styles.section}>

        {/* Cards de resumo / filtro rápido */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {SUMMARY.map(({ key, label, count, bg, color, border }) => {
            const active = filtroStatus === key;
            return (
              <div
                key={key || 'total'}
                onClick={() => key && setFiltroStatus(filtroStatus === key ? '' : key)}
                style={{
                  flex: 1, minWidth: 110,
                  background: bg,
                  border: `1px solid ${active ? border : '#e2e8f0'}`,
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: key ? 'pointer' : 'default',
                  boxShadow: active ? `0 0 0 2px ${border}` : 'none',
                  transition: 'box-shadow 0.18s, border-color 0.18s',
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color, lineHeight: 1 }}>{count}</span>
                <span style={{ fontSize: '0.72rem', color, opacity: 0.8, marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Aviso sem dados de sensores */}
        {!hasAnyAtualizacao && cativeirosStatus.length > 0 && (
          <div className={styles.infoPanel} style={{ marginBottom: 20, marginTop: 0 }}>
            📭 Ainda não recebemos leituras de sensores. O status será exibido assim que houver dados.
          </div>
        )}

        {/* Nenhum cativeiro */}
        {cativeirosStatus.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>📋</div>
            <p className={styles.emptyStateText}>Nenhum cativeiro encontrado.</p>
          </div>
        )}

        {/* Grupos de cativeiros */}
        {gruposVisiveis.map(({ key, list }, groupIdx) => {
          const cfg = STATUS_CFG[key] || STATUS_CFG.default;
          return (
            <div key={key} style={{ marginBottom: 28 }}>

              {/* Cabeçalho da seção */}
              <div className={styles.sectionHeader} style={{ marginBottom: 12 }}>
                <h2 className={styles.sectionTitle}>
                  {cfg.icon} {cfg.label}s
                  <span className={`${styles.badge}`} style={{ marginLeft: 10, background: cfg.badgeBg, color: cfg.badgeColor, fontSize: 12 }}>
                    {list.length}
                  </span>
                </h2>
                {groupIdx === 0 && (
                  <button
                    className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                    onClick={fetchCativeirosStatus}
                    title="Atualizar dados"
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                      <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Atualizar
                  </button>
                )}
              </div>

              {/* Cards de cativeiro */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.map((cativeiro) => (
                  <div
                    key={cativeiro.id}
                    className={styles.card}
                    style={{ borderLeft: `4px solid ${cfg.borderColor}`, background: cfg.bg, padding: '16px 18px' }}
                  >
                    {/* Topo do card */}
                    <div className={styles.cardHeader} style={{ marginBottom: 10 }}>
                      <div>
                        <div className={styles.cardTitle}>{cativeiro.nome}</div>
                        {cativeiro.tipo_camarao && (
                          <div className={styles.cardMeta} style={{ marginTop: 2 }}>{cativeiro.tipo_camarao}</div>
                        )}
                      </div>
                      <span className={styles.badge} style={{ background: cfg.badgeBg, color: cfg.badgeColor }}>
                        {cfg.icon} {cativeiro.statusText || cfg.label}
                      </span>
                    </div>

                    {/* Alertas detalhados */}
                    {cativeiro.alertasDetalhados && cativeiro.alertasDetalhados.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {cativeiro.alertasDetalhados.map((alerta, i) => {
                          const sevColor = alerta.severidade === 'alta' ? '#ef4444' : '#f59e0b';
                          const sevBg    = alerta.severidade === 'alta' ? '#fee2e2' : '#fef9c3';
                          return (
                            <div
                              key={i}
                              style={{
                                background: '#fff',
                                borderRadius: 8,
                                padding: '10px 12px',
                                borderLeft: `3px solid ${sevColor}`,
                                display: 'flex', flexDirection: 'column', gap: 6,
                              }}
                            >
                              {/* Tipo + severidade */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 5, textTransform: 'capitalize' }}>
                                  {TIPO_ICON[alerta.tipo] || '🔔'} {alerta.tipo}
                                </span>
                                <span style={{ background: sevBg, color: sevColor, fontWeight: 700, fontSize: '10px', padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                  {alerta.experimental ? 'experimental' : 'aviso'}
                                </span>
                              </div>

                              {/* Mensagem */}
                              <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.45 }}>
                                {alerta.mensagem}
                              </div>

                              {/* Valores */}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {[
                                  { label: 'Atual',     value: alerta.valorAtual },
                                  { label: alerta.tipo === 'temperatura' ? 'Limite' : 'Referência recente', value: alerta.valorIdeal },
                                ].map(({ label, value }) => (
                                  <span key={label} style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
                                    <span style={{ color: '#94a3b8', marginRight: 3 }}>{label}:</span>{value}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.82rem', color: '#64748b', fontStyle: 'italic' }}>
                        Sem avisos ativos com dados suficientes.
                      </div>
                    )}

                    {/* Última atualização */}
                    {cativeiro.ultimaAtualizacao && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#94a3b8' }}>
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                          <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        {formatDateTime(cativeiro.ultimaAtualizacao)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Botão atualizar quando há filtro ativo ou quando não há grupos */}
        {filtroStatus && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <button
              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
              onClick={() => setFiltroStatus('')}
            >
              ← Ver todos
            </button>
            <button
              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
              onClick={fetchCativeirosStatus}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Atualizar
            </button>
          </div>
        )}

      </div>
    </MemberLayout>
  );
}
