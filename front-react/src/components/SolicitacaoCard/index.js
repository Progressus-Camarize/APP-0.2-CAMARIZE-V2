import React from "react";
import {
  TbEdit, TbPlus, TbTrash, TbCpu, TbLink, TbReplace, TbToolsKitchen2, TbAdjustments,
  TbUserPlus, TbFileText, TbUser, TbCalendar, TbSearch, TbInbox, TbCalendarEvent,
  TbFilterOff, TbClock, TbCheck, TbX, TbCircleCheck, TbCircleX, TbHourglass, TbLoader2,
} from "react-icons/tb";
import styles from "@/styles/cards.module.css";

const ICONES = {
  editar_cativeiro: TbEdit,
  cadastrar_cativeiro: TbPlus,
  excluir_cativeiro: TbTrash,
  editar_sensor: TbCpu,
  cadastrar_sensor: TbPlus,
  excluir_sensor: TbTrash,
  editar_cativeiro_add_sensor: TbLink,
  editar_cativeiro_remove_sensor: TbReplace,
  editar_dieta: TbToolsKitchen2,
  aplicar_calibracao: TbAdjustments,
  cadastrar_funcionario: TbUserPlus,
  associar_funcionario: TbUserPlus,
  cadastrar_proprietario: TbUserPlus,
};

const STATUS = {
  pendente: { classe: styles.stPendente, rotulo: "Pendente", Icone: TbHourglass },
  aprovado: { classe: styles.stAprovado, rotulo: "Aprovado", Icone: TbCircleCheck },
  recusado: { classe: styles.stRecusado, rotulo: "Recusado", Icone: TbCircleX },
};

const BOTOES = {
  aprovar: { classe: styles.btnConfirm, Icone: TbCheck },
  recusar: { classe: styles.btnReject, Icone: TbX },
};

/**
 * Card de uma solicitação.
 * - titulo: rótulo amigável da ação
 * - mostrarSolicitante: exibe nome/email de quem pediu (painéis admin/master)
 * - detalhes: conteúdo já formatado do payload
 * - acoes: [{ rotulo, tipo: 'aprovar' | 'recusar', onClick, desabilitado }]
 */
export function SolicitacaoCard({ item, titulo, mostrarSolicitante = false, detalhes, acoes = [] }) {
  const Icone = ICONES[item.action] || TbFileText;
  const status = STATUS[item.status] || STATUS.pendente;
  const solicitante = item.requesterUser || item.requester;

  return (
    <article className={`${styles.card} ${status.classe}`}>
      <div className={styles.iconBox}>
        <Icone aria-hidden="true" />
      </div>

      <div className={styles.body}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{titulo}</h3>
            {mostrarSolicitante && (
              <div className={styles.solicitante}>
                {solicitante?.nome || "Solicitante desconhecido"}
                {solicitante?.email && <span> · {solicitante.email}</span>}
              </div>
            )}
          </div>
          <div className={styles.badges}>
            <span className={`${styles.badge} ${styles.badgeStatus}`}>
              <status.Icone aria-hidden="true" /> {status.rotulo}
            </span>
          </div>
        </div>

        <div className={styles.meta}>
          <span className={styles.metaItem}>
            <TbClock aria-hidden="true" />
            {new Date(item.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </div>

        {detalhes}

        {acoes.length > 0 && (
          <div className={styles.footer}>
            <span className={styles.footerHint}>Aguardando sua decisão</span>
            <div className={styles.actions}>
              {acoes.map(({ rotulo, tipo, onClick, desabilitado = false }) => {
                const b = BOTOES[tipo] || BOTOES.aprovar;
                return (
                  <button key={rotulo} type="button" className={`${styles.btn} ${b.classe}`} onClick={onClick} disabled={desabilitado}>
                    <b.Icone aria-hidden="true" /> {rotulo}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/** Barra de filtros; cada campo só aparece se o respectivo onChange for passado. */
export function SolicitacoesFiltros({
  solicitante, onSolicitante, acao, onAcao, data, onData, onLimpar, filtrados, total, rotulo = "registros",
}) {
  return (
    <div className={styles.toolbar}>
      {onSolicitante && (
        <label className={styles.field}>
          <TbUser aria-hidden="true" />
          <input className={styles.input} type="text" placeholder="Solicitante (nome ou email)" aria-label="Filtrar por solicitante"
            value={solicitante} onChange={(e) => onSolicitante(e.target.value)} />
        </label>
      )}
      {onAcao && (
        <label className={styles.field}>
          <TbSearch aria-hidden="true" />
          <input className={styles.input} type="text" placeholder="Buscar ação" aria-label="Filtrar por ação"
            value={acao} onChange={(e) => onAcao(e.target.value)} />
        </label>
      )}
      {onData && (
        <label className={`${styles.field} ${styles.fieldDate}`}>
          <TbCalendar aria-hidden="true" />
          <input className={styles.input} type="date" aria-label="Filtrar por data"
            value={data} onChange={(e) => onData(e.target.value)} />
        </label>
      )}
      {onData && (
        <button type="button" className={`${styles.btn} ${styles.btnFalse}`}
          onClick={() => onData(new Date().toISOString().split("T")[0])}>
          <TbCalendarEvent aria-hidden="true" /> Hoje
        </button>
      )}
      {onLimpar && (
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onLimpar}>
          <TbFilterOff aria-hidden="true" /> Limpar filtros
        </button>
      )}
      <div className={styles.contador}>
        {typeof total === "number" && filtrados !== total
          ? <><strong>{filtrados}</strong> de {total} {rotulo}</>
          : <><strong>{filtrados}</strong> {rotulo}</>}
      </div>
    </div>
  );
}

export function SolicitacoesVazio({ titulo, texto, carregando = false }) {
  const Icone = carregando ? TbLoader2 : TbInbox;
  return (
    <div className={styles.state}>
      <Icone className={`${styles.stateIcon} ${carregando ? styles.spin : ""}`} aria-hidden="true" />
      {titulo && <div className={styles.stateTitle}>{titulo}</div>}
      {texto && <div>{texto}</div>}
    </div>
  );
}

export { styles as cardStyles };
