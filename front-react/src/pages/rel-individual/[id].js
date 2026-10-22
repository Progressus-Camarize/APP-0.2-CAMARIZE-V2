import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import MemberLayout from '@/components/MemberLayout';
import Modal from '@/components/Modal';
import panelStyles from '@/styles/panel.module.css';
import { carregarHistorico } from '@/lib/parametros';
import { useAuthToken, fotoCativeiroUrl } from "@/lib/fotoCativeiro";

const PERIODO_MAP = {
  dia:    { label: 'Últimas 24 horas', dias: 1 },
  semana: { label: 'Últimos 7 dias',   dias: 7 },
  mes:    { label: 'Últimos 30 dias',  dias: 30 },
};

const PARAM_CFG = [
  { key: 'temperatura', label: 'Temperatura', unit: '°C',    decimals: 1, icon: '🌡️', stripe: '#f97316', bg: '#fff7ed', badgeColor: '#c2410c' },
  { key: 'ph',          label: 'pH',           unit: '',      decimals: 1, icon: '🧪', stripe: '#3b82f6', bg: '#eff6ff', badgeColor: '#1d4ed8' },
  { key: 'amonia',      label: 'Amônia experimental', unit: '', decimals: 3, icon: '⚗️', stripe: '#a855f7', bg: '#fdf4ff', badgeColor: '#7e22ce' },
];

function calcStats(dados, field) {
  const vals = dados.map(d => d[field]).filter(v => typeof v === 'number');
  if (!vals.length) return { avg: null, min: null, max: null };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { avg, min: Math.min(...vals), max: Math.max(...vals) };
}

function fmt(v, decimals, unit) {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(decimals)}${unit}`;
}

export default function RelatorioIndividual() {
  const authToken = useAuthToken();
  const router = useRouter();
  const { id, periodo: periodoFromQuery } = router.query;
  const relatorioRef = useRef();

  const [cativeiro, setCativeiro] = useState(null);
  const [dados, setDados] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [showPeriodoModal, setShowPeriodoModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [geradoEm, setGeradoEm] = useState('');

  useEffect(() => {
    setGeradoEm(new Date().toLocaleString('pt-BR'));
  }, []);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  const getToken = () =>
    typeof window !== 'undefined'
      ? sessionStorage.getItem('token') || localStorage.getItem('token')
      : null;

  useEffect(() => {
    if (!router.isReady) return;
    if (periodoFromQuery && PERIODO_MAP[periodoFromQuery]) {
      setPeriodo(periodoFromQuery);
    } else if (!periodo) {
      setLoading(false);
      setShowPeriodoModal(true);
    }
  }, [router.isReady, periodoFromQuery]);

  useEffect(() => {
    if (!id || !router.isReady || !periodo) return;
    const info = PERIODO_MAP[periodo];
    if (!info) return;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const token = getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [cativRes, historico] = await Promise.all([
          axios.get(`${apiUrl}/cativeiros/${id}`, { headers }),
          carregarHistorico(apiUrl, id, info.dias, headers),
        ]);
        setCativeiro(cativRes.data);
        setDados(historico);
      } catch (err) {
        setError(err.response?.status === 401
          ? 'Sessão expirada. Faça login novamente.'
          : 'Erro ao carregar dados do relatório.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, periodo, router.isReady]);

  const handlePeriodoSelect = (p) => {
    setPeriodo(p);
    setShowPeriodoModal(false);
    router.replace(`/rel-individual/${id}?periodo=${p}`, undefined, { shallow: true });
  };

  const handlePrint = () => window.print();

  const handleSavePDF = async () => {
    try {
      const html2pdf = await import('html2pdf.js');
      const pdf = html2pdf.default || html2pdf;
      pdf().set({
        margin: 1,
        filename: `relatorio-${cativeiro?.nome || id}-${periodo}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(relatorioRef.current).save();
    } catch {
      window.print();
    }
  };

  const periodoInfo = PERIODO_MAP[periodo] || {};
  const fotoUrl = fotoCativeiroUrl(apiUrl, id, authToken);

  return (
    <MemberLayout
      title="Relatório Individual"
      subtitle={cativeiro ? `${cativeiro.nome} — ${periodoInfo.label || ''}` : 'Carregando...'}
    >
      {/* Modal de seleção de período */}
      <Modal
        isOpen={showPeriodoModal}
        onClose={() => { if (!periodo) router.back(); else setShowPeriodoModal(false); }}
        title="Relatório Individual"
        showCloseButton
      >
        <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.5 }}>
          Selecione o período para o relatório{cativeiro ? <> de <strong>{cativeiro.nome}</strong></> : ''}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { key: 'dia',    label: '📅 Relatório Diário',  sub: 'Últimas 24h' },
            { key: 'semana', label: '📊 Relatório Semanal', sub: 'Últimos 7 dias' },
            { key: 'mes',    label: '📈 Relatório Mensal',  sub: 'Últimos 30 dias' },
          ].map(({ key, label, sub }) => (
            <button
              key={key}
              onClick={() => handlePeriodoSelect(key)}
              className={`${panelStyles.btn} ${panelStyles.btnPrimary}`}
              style={{ width: '100%', justifyContent: 'space-between', padding: '14px 18px', fontSize: '0.9rem' }}
            >
              <span>{label}</span>
              <span style={{ opacity: 0.75, fontSize: '0.8rem' }}>{sub}</span>
            </button>
          ))}
        </div>
      </Modal>

      <div className={panelStyles.section}>
        {/* Cabeçalho */}
        <div className={panelStyles.sectionHeader} style={{ marginBottom: 20 }}>
          <div>
            <h2 className={panelStyles.sectionTitle}>Relatório Individual</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              {periodoInfo.label} · Gerado em {geradoEm}
            </p>
          </div>
          <div className={panelStyles.sectionActions}>
            <button
              className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
              onClick={() => router.back()}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Voltar
            </button>
            {periodo && (
              <button
                className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
                onClick={() => setShowPeriodoModal(true)}
              >
                Trocar período
              </button>
            )}
            {!loading && !error && dados.length > 0 && (
              <>
                <button
                  className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
                  onClick={handlePrint}
                >
                  🖨️ Imprimir
                </button>
                <button
                  className={`${panelStyles.btn} ${panelStyles.btnPrimary} ${panelStyles.btnSm}`}
                  onClick={handleSavePDF}
                >
                  ⬇️ PDF
                </button>
              </>
            )}
          </div>
        </div>

        {loading && (
          <div className={panelStyles.loadingScreen} style={{ minHeight: 'unset', padding: '60px 0' }}>
            Carregando dados do relatório...
          </div>
        )}

        {!loading && error && (
          <div className={panelStyles.emptyState}>
            <div className={panelStyles.emptyStateIcon}>⚠️</div>
            <p className={panelStyles.emptyStateText}>{error}</p>
          </div>
        )}

        {!loading && !error && periodo && (
          <div ref={relatorioRef}>
            {/* Card do cativeiro */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg, #f7b0b7 0%, #a3c7f7 100%)' }} />
              <div style={{ display: 'flex', gap: 16, padding: '16px 18px', alignItems: 'center' }}>
                <img
                  src={fotoUrl}
                  alt={cativeiro?.nome}
                  onError={(e) => { e.target.src = '/images/cativeiro1.jpg'; }}
                  style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>
                    {cativeiro?.nome}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 3 }}>
                    {cativeiro?.id_tipo_camarao?.nome || cativeiro?.id_tipo_camarao || 'Tipo não informado'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
                      {periodoInfo.label}
                    </span>
                    <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
                      {dados.length} leitura{dados.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Condições ideais */}
            {cativeiro?.condicoes_ideais && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ height: 4, background: 'linear-gradient(90deg, #f97316 0%, #3b82f6 50%, #a855f7 100%)' }} />
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                    Condições Ideais
                  </div>
                  <div className={panelStyles.paramGrid}>
                    {[
                      { icon: '🌡️', label: 'Temperatura', value: cativeiro.condicoes_ideais.temp_ideal,   unit: '°C',    bg: '#fff7ed', badgeColor: '#c2410c' },
                      { icon: '🧪', label: 'pH',           value: cativeiro.condicoes_ideais.ph_ideal,     unit: '',      bg: '#eff6ff', badgeColor: '#1d4ed8' },
                      { icon: '⚗️', label: 'Meta de amônia (experimental)', value: cativeiro.condicoes_ideais.amonia_ideal, unit: '', bg: '#fdf4ff', badgeColor: '#7e22ce' },
                    ].map((p) => (
                      <div
                        key={p.label}
                        className={panelStyles.paramItem}
                        style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                          {p.icon}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {p.label}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: p.badgeColor, lineHeight: 1.2, marginTop: 2 }}>
                            {p.value != null ? `${p.value}${p.unit}` : '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {dados.length === 0 ? (
              <div className={panelStyles.infoPanel}>
                📭 Nenhuma leitura registrada no período selecionado. Os dados aparecem assim que os sensores enviarem leituras.
              </div>
            ) : (
              <>
                {/* Card de estatísticas — mesmo layout do card de condições ideais */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{ height: 4, background: 'linear-gradient(90deg, #f97316 0%, #3b82f6 50%, #a855f7 100%)' }} />
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                      Estatísticas do Período
                    </div>
                    <div className={panelStyles.paramGrid}>
                      {PARAM_CFG.map((cfg) => {
                        const stats = calcStats(dados, cfg.key);
                        return (
                          <div
                            key={cfg.key}
                            className={panelStyles.paramItem}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
                          >
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                              {cfg.icon}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {cfg.label}
                              </div>
                              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: cfg.badgeColor, lineHeight: 1.2, marginTop: 2 }}>
                                {fmt(stats.avg, cfg.decimals, cfg.unit)}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3 }}>
                                Mín {fmt(stats.min, cfg.decimals, cfg.unit)} · Máx {fmt(stats.max, cfg.decimals, cfg.unit)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Tabela de leituras */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>Leituras do período</div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {dados.length} registro{dados.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '8px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>Data / Hora</th>
                          <th style={{ padding: '8px 16px', textAlign: 'right', color: '#f97316', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}><span className={panelStyles.thIcon}>🌡️ </span>Temp.</th>
                          <th style={{ padding: '8px 16px', textAlign: 'right', color: '#3b82f6', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}><span className={panelStyles.thIcon}>🧪 </span>pH</th>
                          <th style={{ padding: '8px 16px', textAlign: 'right', color: '#a855f7', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}><span className={panelStyles.thIcon}>⚗️ </span>Amônia experimental</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...dados].reverse().slice(0, 50).map((d, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '7px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                              {new Date(d.datahora).toLocaleString('pt-BR', {
                                day: '2-digit', month: '2-digit', year: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </td>
                            <td style={{ padding: '7px 16px', textAlign: 'right', color: '#1e293b', fontWeight: 500 }}>
                              {fmt(d.temperatura, 1, '°C')}
                            </td>
                            <td style={{ padding: '7px 16px', textAlign: 'right', color: '#1e293b', fontWeight: 500 }}>
                              {fmt(d.ph, 1, '')}
                            </td>
                            <td style={{ padding: '7px 16px', textAlign: 'right', color: '#1e293b', fontWeight: 500 }}>
                              {fmt(d.amonia, 3, ' mg/L')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dados.length > 50 && (
                      <div style={{ padding: '8px 16px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                        Exibindo as 50 leituras mais recentes de {dados.length} registros totais
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </MemberLayout>
  );
}
