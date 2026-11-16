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
  new Date(datahora).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

const formatDate = (datahora) => {
  const date = new Date(datahora);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US");
};

const classeSeveridade = (aviso) => {
  if (aviso.estado === "recuperado") return styles.recuperado;
  if (aviso.severidade === "alta") return styles.sevAlta;
  if (aviso.severidade === "media") return styles.sevMedia;
  return styles.sevBaixa;
};

// O selo "Sem calibração" só vale para o pH: temperatura não precisa e amônia não usa esse selo
// (avisos antigos podem ter vindo marcados como experimentais)
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
              <span className={`${styles.badge} ${styles.badgeTendencia}`} title="Predictive alert, based on the reading trend">
                <TbTrendingUp aria-hidden="true" /> Trend
              </span>
            )}
            {aviso.experimental && aviso.tipo === "ph" && (
              <span className={`${styles.badge} ${styles.badgeExperimental}`} title="Uncalibrated sensor — experimental measurement">
                Not calibrated
              </span>
            )}
            <span className={`${styles.badge} ${recuperado ? styles.badgeRecuperado : styles.badgeAtivo}`}>
              {recuperado ? "Recovered" : "Active"}
            </span>
          </div>
        </div>

        <div className={styles.meta}>
          <span className={styles.metaItem}>
            <TbClock aria-hidden="true" />
            {formatDate(aviso.datahora)} at {formatTime(aviso.datahora)}
          </span>
          {aviso.frescor && (
            <span className={`${styles.metaItem} ${recente ? "" : styles.stale}`}>
              <TbActivity aria-hidden="true" />
              Last reading: {formatarTempoDesde(aviso.frescor.idadeMinutos) ?? "—"}
              {recente ? "" : " · stale or missing data"}
            </span>
          )}
          {aviso.periodoInicio && aviso.periodoFim && (
            <span className={styles.metaItem}>
              <TbCalendarStats aria-hidden="true" />
              Period: {formatDate(aviso.periodoInicio)} {formatTime(aviso.periodoInicio)} – {formatDate(aviso.periodoFim)} {formatTime(aviso.periodoFim)}
            </span>
          )}
        </div>

        <div className={styles.footer}>
          {avaliado ? (
            aviso.avaliacao === "falso_alarme" ? (
              <span className={`${styles.verified} ${styles.verifiedFalse}`}>
                <TbCircleX aria-hidden="true" /> Marked as false alarm
              </span>
            ) : (
              <span className={`${styles.verified} ${styles.verifiedOk}`}>
                <TbCircleCheck aria-hidden="true" /> Change verified
              </span>
            )
          ) : (
            <>
              <span className={styles.footerHint}>Did you check this alert at the pond?</span>
              <div className={styles.actions}>
                <button type="button" className={`${styles.btn} ${styles.btnFalse}`} onClick={() => onAvaliar(aviso, "falso_alarme")}>
                  <TbX aria-hidden="true" /> False alarm
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnConfirm}`} onClick={() => onAvaliar(aviso, "confirmado")}>
                  <TbCheck aria-hidden="true" /> I verified the change
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
        <div>Loading alerts...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={`${styles.state} ${styles.stateError}`}>
        <TbAlertTriangle className={styles.stateIcon} aria-hidden="true" />
        <div className={styles.stateTitle}>Failed to load</div>
        <div>{error}</div>
        {onRetry && (
          <button type="button" className={`${styles.btn} ${styles.btnFalse}`} onClick={onRetry}>
            <TbRefresh aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    );
  }
  if (!avisos.length) {
    return (
      <div className={styles.state}>
        <TbBellOff className={styles.stateIcon} aria-hidden="true" />
        <div className={styles.stateTitle}>No alerts</div>
        <div>When a pond goes out of the expected range, the alert appears here.</div>
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
