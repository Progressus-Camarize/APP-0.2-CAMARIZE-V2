import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import {
  TbThermometer, TbFlask, TbFlask2, TbWifiOff, TbBell, TbAlertTriangle, TbCircleCheck,
  TbActivity, TbRefresh, TbLoader2, TbTrendingUp, TbChartLine, TbBuildingWarehouse, TbToolsKitchen2,
} from "react-icons/tb";
import { formatarTempoDesde } from "@/lib/tempo";
import styles from "@/styles/status.module.css";
import cardStyles from "@/styles/cards.module.css";

// Status dos Cativeiros: saúde de cada cativeiro (avisos ativos + frescor da última leitura).
// Usada pelo membro (/status-cativeiros) e pelo admin (aba "Status" do painel).

const STATUS = {
  alerta: { label: "With alert", Icone: TbAlertTriangle },
  sem_dados: { label: "No recent reading", Icone: TbWifiOff },
  ok: { label: "Normal", Icone: TbCircleCheck },
};
// Ordem de exibição: o que precisa de atenção primeiro
const ORDEM = ["alerta", "sem_dados", "ok"];

const FILTROS = [
  { key: "", label: "All", classe: "" },
  { key: "alerta", label: "With alert", classe: styles.resumoAlerta },
  { key: "sem_dados", label: "No recent reading", classe: styles.resumoSemDados },
  { key: "ok", label: "Normal", classe: styles.resumoOk },
];

const ICONE_TIPO = { temperatura: TbThermometer, ph: TbFlask, amonia: TbFlask2, sensor_inativo: TbWifiOff };
const NOME_TIPO = { temperatura: "Temperature", ph: "pH", amonia: "Ammonia", sensor_inativo: "Inactive sensor" };
const UNIDADE = { temperatura: " °C", ph: "", amonia: " mg/L" };

const formatarValor = (tipo, valor) => {
  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(Number(valor))) return null;
  const casas = tipo === "ph" ? 2 : 1;
  return `${Number(valor).toLocaleString("en-US", { maximumFractionDigits: casas })}${UNIDADE[tipo] ?? ""}`;
};

const apiUrl = () => process.env.NEXT_PUBLIC_API_URL || "/api";
const lerToken = () => sessionStorage.getItem("token") || localStorage.getItem("token");

function AlertaLinha({ alerta }) {
  const Icone = ICONE_TIPO[alerta.tipo] || TbBell;
  const atual = formatarValor(alerta.tipo, alerta.valorAtual);
  const referencia = formatarValor(alerta.tipo, alerta.valorIdeal);
  return (
    <li className={styles.alerta}>
      <span className={styles.alertaIcone}><Icone aria-hidden="true" /></span>
      <div className={styles.alertaCorpo}>
        <div className={styles.alertaTopo}>
          <span className={styles.alertaTipo}>{NOME_TIPO[alerta.tipo] || alerta.tipo}</span>
          {alerta.preditivo && (
            <span className={`${cardStyles.badge} ${cardStyles.badgeTendencia}`} title="Predictive alert, based on the reading trend">
              <TbTrendingUp aria-hidden="true" /> Trend
            </span>
          )}
          {alerta.experimental && alerta.tipo === "ph" && (
            <span className={`${cardStyles.badge} ${cardStyles.badgeExperimental}`} title="Uncalibrated sensor — experimental measurement">
              Not calibrated
            </span>
          )}
        </div>
        <p className={styles.alertaMensagem}>{alerta.mensagem}</p>
        {(atual || referencia) && (
          <div className={styles.valores}>
            {atual && <span className={styles.valor}><span>Current</span>{atual}</span>}
            {referencia && (
              <span className={styles.valor}>
                <span>{alerta.tipo === "temperatura" ? "Limit" : "Recent reference"}</span>{referencia}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

const gramas = (n) => `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 })} g`;

// Próxima refeição do alimentador (resumo calculado pela API no horário de Brasília)
function ProximaRacao({ alimentacao }) {
  if (!alimentacao) return null;
  if (!alimentacao.dieta || !alimentacao.proximo) {
    return (
      <span className={`${styles.racao} ${styles.racaoSemDieta}`}>
        <TbToolsKitchen2 aria-hidden="true" /> No diet set
      </span>
    );
  }
  const { proximo, dieta } = alimentacao;
  return (
    <span className={styles.racao} title={`${gramas(alimentacao.gramasServidas)} of ${gramas(alimentacao.gramasPrevistas)} served today`}>
      <TbToolsKitchen2 aria-hidden="true" />
      Next feeding {proximo.amanha ? "tomorrow " : ""}at {proximo.horario} · {gramas(dieta.quantidade)}
    </span>
  );
}

function CativeiroCard({ cativeiro, onAbrir }) {
  const cfg = STATUS[cativeiro.status] || STATUS.sem_dados;
  const alertas = cativeiro.alertasDetalhados || [];
  const idade = cativeiro.frescor?.idadeMinutos;
  const ultimaLeitura = cativeiro.ultimaAtualizacao ? formatarTempoDesde(idade) : null;

  return (
    <article className={styles.card}>
      <div className={styles.iconBox}><cfg.Icone aria-hidden="true" /></div>

      <div className={styles.corpo}>
        <header className={styles.cardTopo}>
          <div className={styles.cardTitulos}>
            <h3 className={styles.nome}>{cativeiro.nome}</h3>
            <div className={styles.especie}>{cativeiro.tipo_camarao}</div>
          </div>
          <span className={styles.selo}>{cfg.label}</span>
        </header>

        {alertas.length > 0 ? (
          <ul className={styles.alertas}>
            {alertas.map((alerta, i) => <AlertaLinha key={alerta.id || i} alerta={alerta} />)}
          </ul>
        ) : (
          <p className={styles.semAlertas}>
            {cativeiro.status === "sem_dados"
              ? "No recent sensor readings. Check that the pond board is powered on and connected."
              : "No active alerts. Parameters are within the expected range."}
          </p>
        )}

        <footer className={styles.cardRodape}>
          <div className={styles.rodapeInfo}>
            <span className={`${styles.leitura} ${cativeiro.status === "sem_dados" ? styles.leituraAntiga : ""}`}>
              <TbActivity aria-hidden="true" />
              {ultimaLeitura ? `Last reading ${ultimaLeitura}` : "No readings received"}
            </span>
            <ProximaRacao alimentacao={cativeiro.alimentacao} />
          </div>
          <button type="button" className={`${cardStyles.btn} ${cardStyles.btnGhost}`} onClick={() => onAbrir(cativeiro.id)}>
            <TbChartLine aria-hidden="true" /> View dashboard
          </button>
        </footer>
      </div>
    </article>
  );
}

export default function StatusCativeiros() {
  const router = useRouter();
  // O objeto do router muda a cada troca de URL (ex.: ?tab= no painel): fica numa ref para não refazer a busca
  const routerRef = useRef(router);
  routerRef.current = router;
  const [cativeiros, setCativeiros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("");

  const carregar = useCallback(async ({ manual = false } = {}) => {
    const token = lerToken();
    if (!token) { routerRef.current.push("/login"); return; }
    if (manual) setAtualizando(true); else setLoading(true);
    setError(null);
    try {
      // A API responde com cache de 60 s; ao atualizar manualmente, pede uma resposta nova
      const { data } = await axios.get(`${apiUrl()}/cativeiros-status`, {
        headers: { Authorization: `Bearer ${token}` },
        params: manual ? { _: Date.now() } : undefined,
      });
      if (data.success) setCativeiros(data.cativeiros || []);
      else setError("Could not load pond status.");
    } catch (err) {
      if (err.response?.status === 401) routerRef.current.push("/login");
      else setError("Could not load pond status.");
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className={cardStyles.state}>
        <TbLoader2 className={`${cardStyles.stateIcon} ${cardStyles.spin}`} aria-hidden="true" />
        <div>Loading status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${cardStyles.state} ${cardStyles.stateError}`}>
        <TbAlertTriangle className={cardStyles.stateIcon} aria-hidden="true" />
        <div className={cardStyles.stateTitle}>Failed to load</div>
        <div>{error}</div>
        <button type="button" className={`${cardStyles.btn} ${cardStyles.btnFalse}`} onClick={() => carregar()}>
          <TbRefresh aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  if (!cativeiros.length) {
    return (
      <div className={cardStyles.state}>
        <TbBuildingWarehouse className={cardStyles.stateIcon} aria-hidden="true" />
        <div className={cardStyles.stateTitle}>No ponds</div>
        <div>Ponds from your farms appear here with the status of each one.</div>
      </div>
    );
  }

  const contagem = (key) => (key ? cativeiros.filter(c => c.status === key).length : cativeiros.length);
  const visiveis = cativeiros
    .filter(c => !filtro || c.status === filtro)
    .sort((a, b) => ORDEM.indexOf(a.status) - ORDEM.indexOf(b.status)
      || String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));

  return (
    <section className={styles.wrap}>
      <div className={styles.resumo}>
        {FILTROS.map(({ key, label, classe }) => {
          const ativo = filtro === key;
          return (
            <button
              key={key || "todos"}
              type="button"
              className={`${styles.resumoItem} ${classe} ${ativo ? styles.resumoAtivo : ""}`}
              aria-pressed={ativo}
              onClick={() => setFiltro(ativo ? "" : key)}
            >
              <span className={styles.resumoNumero}>{contagem(key)}</span>
              <span className={styles.resumoLabel}>{label}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.barra}>
        <span className={styles.barraTexto}>
          {visiveis.length} {visiveis.length === 1 ? "pond" : "ponds"}
          {filtro ? ` · ${FILTROS.find(f => f.key === filtro).label.toLowerCase()}` : ""}
        </span>
        <button
          type="button"
          className={`${cardStyles.btn} ${cardStyles.btnGhost}`}
          onClick={() => carregar({ manual: true })}
          disabled={atualizando}
        >
          <TbRefresh className={atualizando ? cardStyles.spin : ""} aria-hidden="true" />
          {atualizando ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {visiveis.length ? (
        <div className={styles.grade}>
          {visiveis.map(c => (
            <CativeiroCard key={c.id} cativeiro={c} onAbrir={(id) => router.push(`/dashboard?id=${id}`)} />
          ))}
        </div>
      ) : (
        <div className={cardStyles.state}>
          <TbCircleCheck className={cardStyles.stateIcon} aria-hidden="true" />
          <div>No ponds with this status.</div>
        </div>
      )}
    </section>
  );
}
