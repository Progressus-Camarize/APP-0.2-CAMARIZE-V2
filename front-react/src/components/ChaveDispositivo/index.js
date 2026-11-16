import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import styles from '@/styles/panel.module.css';
import Modal from '../Modal';

// Chave do ESP32 de um cativeiro: gerar (ou trocar) a chave e ver a trilha de quem gerou.
// A API só guarda o hash: a chave aparece uma única vez, logo após ser gerada.

const apiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const authHeaders = () => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

function BotaoCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={copiar}>
      {copiado ? 'Copied!' : 'Copy'}
    </button>
  );
}

function Comando({ titulo, valor }) {
  return (
    <div className={styles.chaveComando}>
      <div className={styles.calibCampoTitulo}>{titulo}</div>
      <div className={styles.chaveValorLinha}>
        <code className={styles.chaveValor}>{valor}</code>
        <BotaoCopiar texto={valor} />
      </div>
    </div>
  );
}

export default function ChaveDispositivo({ cativeiro, onClose }) {
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [chave, setChave] = useState(''); // só em memória, enquanto o modal está aberto
  const [erro, setErro] = useState('');

  const carregarHistorico = async () => {
    try {
      const res = await axios.get(`${apiUrl()}/parametros/dispositivos/${cativeiro._id}/historico`, authHeaders());
      setHistorico(res.data?.historico || []);
    } catch {
      setHistorico([]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cativeiro._id]);

  const temChave = historico.length > 0;

  const gerar = async () => {
    setGerando(true);
    setErro('');
    try {
      const res = await axios.post(`${apiUrl()}/parametros/dispositivos/${cativeiro._id}/chave`, {}, authHeaders());
      setChave(res.data?.chave || '');
      setConfirmando(false);
      await carregarHistorico();
    } catch (e) {
      setErro(e?.response?.data?.error || 'Could not generate the key. Please try again.');
    } finally {
      setGerando(false);
    }
  };

  return createPortal(
    <Modal isOpen onClose={onClose} title={`Device key — ${cativeiro.nome || ''}`} closeOnBackdropClick={!chave}>
      <div className={styles.chaveModal}>
        {chave ? (
          <>
            <div className={styles.calibAviso}>
              Copy the key now: it <strong>will not be shown again</strong>. If you lose it, generate a new one.
              {temChave && historico.length > 1 && ' The previous key has already stopped working.'}
            </div>
            <Comando titulo="Generated key" valor={chave} />

            <div className={styles.calibCampo}>
              <span className={styles.calibCampoTitulo}>How to set up the board</span>
              <ol className={styles.chavePassos}>
                <li>Connect the ESP32 to your computer with the USB cable.</li>
                <li>In the Arduino IDE, open the Serial Monitor at <strong>9600 baud</strong>, with line ending set to &quot;Newline&quot;.</li>
                <li>Press the board&apos;s reset button (EN/RST). It accepts commands during the first 15 seconds.</li>
                <li>Send the commands below, one at a time. The board replies &quot;Chave do dispositivo salva.&quot; (device key saved).</li>
              </ol>
            </div>
            <Comando titulo="1. Key" valor={`SET DEVICEKEY ${chave}`} />
            <Comando titulo="2. Pond (if the board is not configured yet)" valor={`SET CATIVEIRO ${cativeiro._id}`} />

            <div className={styles.calibAcoes}>
              <button type="button" className={`${styles.btn} ${styles.btnSuccess}`} onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.calibCampoTexto}>
              The key identifies this pond&apos;s board: with it, the API knows the readings really came from your ESP32.
              {temChave
                ? ' This pond already has a key. Generate a new one if the board was replaced or the key may have leaked.'
                : ' This pond does not have a key yet.'}
            </div>

            {confirmando ? (
              <div className={styles.calibAviso}>
                {temChave ? (
                  <>Generating a new key <strong>immediately disables the current one</strong>: the board stops sending readings
                  until you configure the new key on it. Do you want to continue?</>
                ) : (
                  <>Once generated, <strong>the API only accepts readings for this pond that include the key</strong>: if the board is
                  already sending data without a key, it stops until you configure the key on it. Do you want to continue?</>
                )}
                <div className={styles.calibAcoes} style={{ marginTop: 10 }}>
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setConfirmando(false)} disabled={gerando}>Back</button>
                  <button type="button" className={`${styles.btn} ${styles.btnSuccess}`} onClick={gerar} disabled={gerando}>
                    {gerando ? 'Generating...' : temChave ? 'Yes, generate new key' : 'Yes, generate key'}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.calibAcoes} style={{ justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSuccess}`}
                  onClick={() => setConfirmando(true)}
                  disabled={gerando || carregando}
                >
                  {gerando ? 'Generating...' : temChave ? 'Generate new key' : 'Generate key'}
                </button>
              </div>
            )}
            {erro && <div className={styles.calibErro}>{erro}</div>}
          </>
        )}

        <div className={styles.chaveTrilha}>
          <div className={styles.calibLabel}>Key history</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 12 }}>
            Who generated each key and when (the key itself is never stored). Useful to check whether an inactive
            sensor alert coincides with a key change.
          </div>
          {carregando ? (
            <div style={{ color: '#64748b' }}>Loading...</div>
          ) : historico.length === 0 ? (
            <div style={{ color: '#64748b' }}>No key has been generated for this pond yet.</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: '#e2e8f0' }} />
              {historico.map((item, index) => (
                <div key={index} style={{ position: 'relative', paddingBottom: index === historico.length - 1 ? 0 : 18 }}>
                  <div style={{
                    position: 'absolute', left: -20, top: 2, width: 12, height: 12, borderRadius: '50%',
                    background: index === 0 ? '#3b82f6' : '#cbd5e1', border: '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0',
                  }} />
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                    {new Date(item.geradoEm).toLocaleString('en-US')}
                    {index === 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>CURRENT KEY</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                    {item.geradoPor ? (
                      <>Generated by <strong>{item.geradoPor.nome}</strong> ({item.geradoPor.email}) — {item.geradoPor.role}</>
                    ) : (
                      <em>User not found (may have been removed since)</em>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!chave && (
          <div className={styles.calibAcoes}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </Modal>,
    document.body
  );
}
