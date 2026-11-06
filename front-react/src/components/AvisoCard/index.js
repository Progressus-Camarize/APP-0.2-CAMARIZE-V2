import React from "react";
import {
  TbThermometer, TbFlask, TbFlask2, TbWifiOff, TbBell, TbBellOff, TbCheck, TbX,
  TbClock, TbActivity, TbCalendarStats, TbAlertTriangle, TbLoader2, TbCircleCheck,
  TbCircleX, TbRefresh, TbTrendingUp,
} from "react-icons/tb";
import { formatarTempoDesde } from "@/lib/tempo";
import styles from "@/styles/cards.module.css";

const ICONES = { temperatura: TbThermometer, ph: TbFlask, amonia: TbFlask2, sensor_inativo: TbWifiOff };

const formatTime = (datahora) =>
  new Date(datahora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const formatDate = (datahora) => {
  const date = new Date(datahora);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR");
};

const classeSeveridade = (aviso) => {
  if (aviso.estado === "recuperado") return styles.recuperado;
  if (aviso.severidade === "alta") return styles.sevAlta;
  if (aviso.severidade === "media") return styles.sevMedia;
  return styles.sevBaixa;
};

export function AvisoCard({ aviso, onAvaliar }) {
  const Icone = ICONES[aviso.tipo] || TbBell;
  const recuperado = aviso.estado === "recuperado";
  const recente = aviso.frescor?.estado === "recente";
  const avaliado = aviso.verificadoEm || aviso.avaliacao;

  return (
    <article className={`${styles.card} ${classeSeveridade(aviso)}`}>
      <div className={styles.iconBox}>
        <Icone aria-hidden="true" />
      </div>

      <div className={styles.body}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{aviso.mensagem}</h3>
            <div className={styles.cativeiro}>{aviso.cativeiroNome}</div>
          </div>
          <div className={styles.badges}>
            {aviso.preditivo && (
              <span className={`${styles.badge} ${styles.badgeTendencia}`} title="Alerta preditivo, baseado na tendência das leituras">
                <TbTrendingUp aria-hidden="true" /> Tendência
              </span>
            )}
            {aviso.experimental && (
              <span className={`${styles.badge} ${styles.badgeExperimental}`} title="Sensor sem calibração — medição experimental">
                Experimental
              </span>
            )}
            <span className={`${styles.badge} ${recuperado ? styles.badgeRecuperado : styles.badgeAtivo}`}>
              {recuperado ? "Recuperado" : "Ativo"}
            </span>
          </div>
        </div>

        <div className={styles.meta}>
          <span className={styles.metaItem}>
            <TbClock aria-hidden="true" />
            {formatDate(aviso.datahora)} às {formatTime(aviso.datahora)}
          </span>
          {aviso.frescor && (
            <span className={`${styles.metaItem} ${recente ? "" : styles.stale}`}>
              <TbActivity aria-hidden="true" />
              Última leitura: {formatarTempoDesde(aviso.frescor.idadeMinutos) ?? "—"}
              {recente ? "" : " · dados antigos ou ausentes"}
            </span>
          )}
          {aviso.periodoInicio && aviso.periodoFim && (
            <span className={styles.metaItem}>
              <TbCalendarStats aria-hidden="true" />
              Período: {formatDate(aviso.periodoInicio)} {formatTime(aviso.periodoInicio)} – {formatDate(aviso.periodoFim)} {formatTime(aviso.periodoFim)}
            </span>
          )}
        </div>

        <div className={styles.footer}>
          {avaliado ? (
            aviso.avaliacao === "falso_alarme" ? (
              <span className={`${styles.verified} ${styles.verifiedFalse}`}>
                <TbCircleX aria-hidden="true" /> Marcado como falso alarme
              </span>
            ) : (
              <span className={`${styles.verified} ${styles.verifiedOk}`}>
                <TbCircleCheck aria-hidden="true" /> Mudança conferida
              </span>
            )
          ) : (
            <>
              <span className={styles.footerHint}>Você conferiu este alerta no viveiro?</span>
              <div className={styles.actions}>
                <button type="button" className={`${styles.btn} ${styles.btnFalse}`} onClick={() => onAvaliar(aviso, "falso_alarme")}>
                  <TbX aria-hidden="true" /> Falso alarme
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnConfirm}`} onClick={() => onAvaliar(aviso, "confirmado")}>
                  <TbCheck aria-hidden="true" /> Conferi a mudança
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/** Lista de avisos com os estados de carregando, erro e vazio no mesmo padrão visual. */
export default function AvisoLista({ avisos, loading, error, onRetry, onAvaliar }) {
  if (loading) {
    return (
      <div className={styles.state}>
        <TbLoader2 className={`${styles.stateIcon} ${styles.spin}`} aria-hidden="true" />
        <div>Carregando avisos...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={`${styles.state} ${styles.stateError}`}>
        <TbAlertTriangle className={styles.stateIcon} aria-hidden="true" />
        <div className={styles.stateTitle}>Erro ao carregar</div>
        <div>{error}</div>
        {onRetry && (
          <button type="button" className={`${styles.btn} ${styles.btnFalse}`} onClick={onRetry}>
            <TbRefresh aria-hidden="true" /> Tentar novamente
          </button>
        )}
      </div>
    );
  }
  if (!avisos.length) {
    return (
      <div className={styles.state}>
        <TbBellOff className={styles.stateIcon} aria-hidden="true" />
        <div className={styles.stateTitle}>Nenhum aviso</div>
        <div>Quando algum cativeiro sair do esperado, o alerta aparece aqui.</div>
      </div>
    );
  }
  return (
    <div className={styles.list}>
      {avisos.map((aviso, i) => (
        <AvisoCard key={aviso.id || i} aviso={aviso} onAvaliar={onAvaliar} />
      ))}
    </div>
  );
}
