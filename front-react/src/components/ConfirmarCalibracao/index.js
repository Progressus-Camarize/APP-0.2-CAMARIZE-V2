import { createPortal } from 'react-dom';
import styles from '@/styles/panel.module.css';
import Modal from '../Modal';

// Confirmação antes de aplicar a calibração feita por um membro (solicitação "aplicar_calibracao"):
// mostra o valor em uso e o novo, com as datas, e alerta quando a solicitação é mais antiga
// que a calibração atual (aplicá-la substituiria um valor mais recente).

const numeroBr = (n, casas = 1) => (typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 4) })
  : null);

const dataBr = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null);

const NOME_TIPO = { motor: 'alimentador', ph: 'sensor de pH' };

// Valor legível de uma calibração (do payload da solicitação ou dos campos do cativeiro)
export function descreverCalibracao(tipo, valores = {}) {
  if (tipo === 'motor') {
    const g = numeroBr(valores.gramas_por_rotacao);
    return g ? `${g} g por volta` : null;
  }
  const ph7 = numeroBr(valores.tensao_ph7, 2);
  const ph4 = numeroBr(valores.tensao_ph4, 2);
  return ph7 && ph4 ? `pH 7: ${ph7} V · pH 4: ${ph4} V` : null;
}

// Mensagem de sucesso depois de aplicar
export function mensagemCalibracaoAplicada(payload = {}) {
  const valor = descreverCalibracao(payload.tipo, payload);
  return `Calibração do ${NOME_TIPO[payload.tipo] || 'dispositivo'} aplicada${valor ? `: ${valor}` : ''}.`;
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
      title={`Aplicar calibração do ${NOME_TIPO[tipo] || 'dispositivo'}`}
      closeOnBackdropClick={!enviando}
    >
      <div className={styles.calibModal}>
        <div className={styles.calibCampoTexto}>
          Cativeiro <strong>{cativeiro?.nome || payload.cativeiroId}</strong>. Confira os valores antes de aplicar:
          a calibração nova substitui a que está em uso.
        </div>

        <div className={styles.calibComparacao}>
          <div className={styles.calibComparacaoItem}>
            <span className={styles.calibComparacaoRotulo}>Em uso agora</span>
            <strong className={styles.calibComparacaoValor}>{valorAtual || 'Não calibrado'}</strong>
            <span className={styles.calibComparacaoData}>
              {valorAtual
                ? (dataAtual ? `Calibração de ${dataBr(dataAtual)}` : 'Data da calibração não registrada')
                : 'Nenhuma calibração aplicada'}
            </span>
          </div>
          <div className={`${styles.calibComparacaoItem} ${styles.calibComparacaoNova}`}>
            <span className={styles.calibComparacaoRotulo}>Nova calibração</span>
            <strong className={styles.calibComparacaoValor}>{valorNovo || 'Valor inválido'}</strong>
            <span className={styles.calibComparacaoData}>
              {`Calibração de ${dataBr(item?.createdAt)}`}{solicitante ? ` por ${solicitante}` : ''}
            </span>
          </div>
        </div>

        {maisAntiga && (
          <div className={styles.calibAviso}>
            <strong>Esta calibração é anterior à que está em uso.</strong> Aplicá-la vai substituir um valor
            mais recente. Prefira recusar esta solicitação, a menos que a calibração atual esteja errada.
          </div>
        )}

        <div className={styles.calibAcoes}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnSuccess}`} onClick={onConfirmar} disabled={enviando || !valorNovo}>
            {enviando ? 'Aplicando...' : 'Aplicar calibração'}
          </button>
        </div>
      </div>
    </Modal>,
    document.body
  );
}
