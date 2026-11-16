import { createPortal } from 'react-dom';
import styles from '@/styles/panel.module.css';
import Modal from '../Modal';

// Confirmação antes de aplicar a calibração feita por um membro (solicitação "aplicar_calibracao"):
// mostra o valor em uso e o novo, com as datas, e alerta quando a solicitação é mais antiga
// que a calibração atual (aplicá-la substituiria um valor mais recente).

const numeroBr = (n, casas = 1) => (typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString('en-US', { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 4) })
  : null);

const dataBr = (d) => (d ? new Date(d).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : null);

const NOME_TIPO = { motor: 'feeder', ph: 'pH sensor' };

// Valor legível de uma calibração (do payload da solicitação ou dos campos do cativeiro)
export function descreverCalibracao(tipo, valores = {}) {
  if (tipo === 'motor') {
    const g = numeroBr(valores.gramas_por_rotacao);
    return g ? `${g} g per turn` : null;
  }
  const ph7 = numeroBr(valores.tensao_ph7, 2);
  const ph4 = numeroBr(valores.tensao_ph4, 2);
  return ph7 && ph4 ? `pH 7: ${ph7} V · pH 4: ${ph4} V` : null;
}

// Mensagem de sucesso depois de aplicar
export function mensagemCalibracaoAplicada(payload = {}) {
  const valor = descreverCalibracao(payload.tipo, payload);
  return `${(NOME_TIPO[payload.tipo] || 'device').replace(/^./, c => c.toUpperCase())} calibration applied${valor ? `: ${valor}` : ''}.`;
}

export default function ConfirmarCalibracao({ item, cativeiro, enviando = false, onCancelar, onConfirmar }) {
  const payload = item?.payload || {};
  const tipo = payload.tipo;
  const dataAtual = tipo === 'motor' ? cativeiro?.calibracao_motor_em : cativeiro?.calibracao_ph_em;
  const valorAtual = cativeiro ? descreverCalibracao(tipo, cativeiro) : null;
  const valorNovo = descreverCalibracao(tipo, payload);
  const maisAntiga = dataAtual && item?.createdAt && new Date(item.createdAt) < new Date(dataAtual);
  const solicitante = item?.requesterUser?.nome;

  return createPortal(
    <Modal
      isOpen
      onClose={enviando ? () => {} : onCancelar}
      title={`Apply ${NOME_TIPO[tipo] || 'device'} calibration`}
      closeOnBackdropClick={!enviando}
    >
      <div className={styles.calibModal}>
        <div className={styles.calibCampoTexto}>
          Pond <strong>{cativeiro?.nome || payload.cativeiroId}</strong>. Check the values before applying:
          the new calibration replaces the one in use.
        </div>

        <div className={styles.calibComparacao}>
          <div className={styles.calibComparacaoItem}>
            <span className={styles.calibComparacaoRotulo}>Currently in use</span>
            <strong className={styles.calibComparacaoValor}>{valorAtual || 'Not calibrated'}</strong>
            <span className={styles.calibComparacaoData}>
              {valorAtual
                ? (dataAtual ? `Calibrated on ${dataBr(dataAtual)}` : 'Calibration date not recorded')
                : 'No calibration applied'}
            </span>
          </div>
          <div className={`${styles.calibComparacaoItem} ${styles.calibComparacaoNova}`}>
            <span className={styles.calibComparacaoRotulo}>New calibration</span>
            <strong className={styles.calibComparacaoValor}>{valorNovo || 'Invalid value'}</strong>
            <span className={styles.calibComparacaoData}>
              {`Calibrated on ${dataBr(item?.createdAt)}`}{solicitante ? ` by ${solicitante}` : ''}
            </span>
          </div>
        </div>

        {maisAntiga && (
          <div className={styles.calibAviso}>
            <strong>This calibration is older than the one in use.</strong> Applying it will replace a more
            recent value. Consider rejecting this request unless the current calibration is wrong.
          </div>
        )}

        <div className={styles.calibAcoes}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onCancelar} disabled={enviando}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnSuccess}`} onClick={onConfirmar} disabled={enviando || !valorNovo}>
            {enviando ? 'Applying...' : 'Apply calibration'}
          </button>
        </div>
      </div>
    </Modal>,
    document.body
  );
}
