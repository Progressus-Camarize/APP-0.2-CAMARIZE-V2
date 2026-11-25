import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import MemberLayout from '@/components/MemberLayout';
import Modal from '@/components/Modal';
import panelStyles from '@/styles/panel.module.css';
import IconeParametro from '@/components/IconeParametro';
import { TbAlertTriangle, TbCalendarEvent, TbCalendarWeek, TbCalendarMonth, TbPrinter, TbDownload, TbInbox } from 'react-icons/tb';
import { carregarResumoRelatorio } from '@/lib/parametros';
import { formatarParametro } from '@/lib/formatar';
import { useAuthToken, fotoCativeiroUrl } from "@/lib/fotoCativeiro";

const PERIODO_MAP = {
  dia:    { label: 'Últimas 24 horas', dias: 1 },
  semana: { label: 'Últimos 7 dias',   dias: 7 },
  mes:    { label: 'Últimos 30 dias',  dias: 30 },
};

const PARAM_CFG = [
  { key: 'temperatura', label: 'Temperatura', unit: '°C',   stripe: '#f97316', bg: '#fff7ed', badgeColor: '#c2410c' },
  { key: 'ph',          label: 'pH',           unit: '',     stripe: '#3b82f6', bg: '#eff6ff', badgeColor: '#1d4ed8' },
  { key: 'amonia',      label: 'Amônia experimental', unit: 'mg/L', stripe: '#a855f7', bg: '#fdf4ff', badgeColor: '#7e22ce' },
];

// "2026-11-25 14:00" → "25/11, 14h–15h" (médias por hora) · "2026-11-25" → "ter, 25/11/2026" (por dia)
function rotuloPeriodo(periodo, agrupamento) {
  const [data, hora] = periodo.split(' ');
  const [ano, mes, dia] = data.split('-');
  if (agrupamento === 'hora') {
    const h = Number(hora.slice(0, 2));
    return `${dia}/${mes}, ${h}h–${(h + 1) % 24}h`;
  }
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${semana}, ${dia}/${mes}/${ano}`;
}

export default function RelatorioIndividual() {
  const authToken = useAuthToken();
  const router = useRouter();
  const { id, periodo: periodoFromQuery } = router.query;
  const relatorioRef = useRef();

  const [cativeiro, setCativeiro] = useState(null);
  // Resumo calculado na API: total, estatísticas e médias por hora/dia (não o período inteiro)
  const [resumo, setResumo] = useState(null);
  const total = resumo?.total || 0;
  const medias = resumo?.medias || [];
  const porHora = resumo?.agrupamento === 'hora';
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
        const [cativRes, resumoPeriodo] = await Promise.all([
          axios.get(`${apiUrl}/cativeiros/${id}`, { headers }),
          carregarResumoRelatorio(apiUrl, id, info.dias, headers),
        ]);
        setCativeiro(cativRes.data);
        setResumo(resumoPeriodo);
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
  const fotoUrl = fotoCativeiroUrl(apiUrl, id, authToken, cativeiro?.foto_versao);

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
            { key: 'dia',    label: 'Relatório Diário',  Icone: TbCalendarEvent, sub: 'Últimas 24h' },
            { key: 'semana', label: 'Relatório Semanal', Icone: TbCalendarWeek,  sub: 'Últimos 7 dias' },
            { key: 'mes',    label: 'Relatório Mensal',  Icone: TbCalendarMonth, sub: 'Últimos 30 dias' },
          ].map(({ key, label, Icone, sub }) => (
            <button
              key={key}
              onClick={() => handlePeriodoSelect(key)}
              className={`${panelStyles.btn} ${panelStyles.btnPeriodo}`}
            >
              <span className={panelStyles.btnPeriodoTitulo}><Icone aria-hidden="true" />{label}</span>
              <span className={panelStyles.btnPeriodoSub}>{sub}</span>
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
            {!loading && !error && total > 0 && (
              <>
                <button
                  className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
                  onClick={handlePrint}
                >
                  <TbPrinter aria-hidden="true" /> Imprimir
                </button>
                <button
                  className={`${panelStyles.btn} ${panelStyles.btnPrimary} ${panelStyles.btnSm}`}
                  onClick={handleSavePDF}
                >
                  <TbDownload aria-hidden="true" /> PDF
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
            <div className={panelStyles.emptyStateIcon}><TbAlertTriangle aria-hidden="true" /></div>
            <p className={panelStyles.emptyStateText}>{error}</p>
          </div>
        )}

        {!loading && !error && periodo && (
          <div ref={relatorioRef}>
            {/* Card do cativeiro */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg, var(--salmao-camarize) 0%, #a3c7f7 100%)' }} />
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
                      {total.toLocaleString('pt-BR')} leitura{total !== 1 ? 's' : ''}
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
                      { tipo: 'temperatura', label: 'Temperatura', value: cativeiro.condicoes_ideais.temp_ideal,   unit: '°C',    bg: '#fff7ed', badgeColor: '#c2410c' },
                      { tipo: 'ph',          label: 'pH',           value: cativeiro.condicoes_ideais.ph_ideal,     unit: '',      bg: '#eff6ff', badgeColor: '#1d4ed8' },
                      { tipo: 'amonia',      label: 'Meta de amônia (experimental)', value: cativeiro.condicoes_ideais.amonia_ideal, unit: 'mg/L', bg: '#fdf4ff', badgeColor: '#7e22ce' },
                    ].map((p) => (
                      <div
                        key={p.label}
                        className={panelStyles.paramItem}
                        style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, color: p.badgeColor, flexShrink: 0 }}>
                          <IconeParametro tipo={p.tipo} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {p.label}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: p.badgeColor, lineHeight: 1.2, marginTop: 2 }}>
                            {formatarParametro(p.tipo, p.value, { unidade: p.unit, casasFixas: false })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {total === 0 ? (
              <div className={panelStyles.infoPanel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TbInbox aria-hidden="true" style={{ flexShrink: 0, fontSize: '1.1rem' }} /> Nenhuma leitura registrada no período selecionado. Os dados aparecem assim que os sensores enviarem leituras.
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
                        const stats = resumo.estatisticas[cfg.key];
                        return (
                          <div
                            key={cfg.key}
                            className={panelStyles.paramItem}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
                          >
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, color: cfg.badgeColor, flexShrink: 0 }}>
                              <IconeParametro tipo={cfg.key} />
                            </div>
                            <div>
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {cfg.label}
                              </div>
                              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: cfg.badgeColor, lineHeight: 1.2, marginTop: 2 }}>
                                {formatarParametro(cfg.key, stats.media, { unidade: cfg.unit })}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3 }}>
                                Mín {formatarParametro(cfg.key, stats.min, { unidade: cfg.unit })} · Máx {formatarParametro(cfg.key, stats.max, { unidade: cfg.unit })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Médias por hora (relatório diário) ou por dia (semanal e mensal), calculadas na API */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{porHora ? 'Médias por hora' : 'Médias por dia'}</div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {total.toLocaleString('pt-BR')} leitura{total !== 1 ? 's' : ''} no período
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '8px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{porHora ? 'Hora' : 'Dia'}</th>
                          <th style={{ padding: '8px 16px', textAlign: 'right', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Leituras</th>
                          <th style={{ padding: '8px 16px', textAlign: 'right', color: '#f97316', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}><span className={panelStyles.thIcon}><IconeParametro tipo="temperatura" /> </span>Temp.</th>
                          <th style={{ padding: '8px 16px', textAlign: 'right', color: '#3b82f6', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}><span className={panelStyles.thIcon}><IconeParametro tipo="ph" /> </span>pH</th>
                          <th style={{ padding: '8px 16px', textAlign: 'right', color: '#a855f7', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}><span className={panelStyles.thIcon}><IconeParametro tipo="amonia" /> </span>Amônia experimental</th>
                        </tr>
                      </thead>
                      <tbody>
                        {medias.map((m) => (
                          <tr key={m.periodo} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '7px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                              {rotuloPeriodo(m.periodo, resumo.agrupamento)}
                            </td>
                            <td style={{ padding: '7px 16px', textAlign: 'right', color: '#94a3b8' }}>
                              {m.leituras.toLocaleString('pt-BR')}
                            </td>
                            <td style={{ padding: '7px 16px', textAlign: 'right', color: '#1e293b', fontWeight: 500 }}>
                              {formatarParametro('temperatura', m.temperatura, { unidade: '°C' })}
                            </td>
                            <td style={{ padding: '7px 16px', textAlign: 'right', color: '#1e293b', fontWeight: 500 }}>
                              {formatarParametro('ph', m.ph)}
                            </td>
                            <td style={{ padding: '7px 16px', textAlign: 'right', color: '#1e293b', fontWeight: 500 }}>
                              {formatarParametro('amonia', m.amonia, { unidade: 'mg/L' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '8px 16px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                      {porHora ? 'Cada linha é a média das leituras daquela hora' : 'Cada linha é a média das leituras daquele dia'} (horário de Brasília). Horas e dias sem leitura não aparecem.
                    </div>
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
