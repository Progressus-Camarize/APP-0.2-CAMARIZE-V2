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
      {copiado ? 'Copiado!' : 'Copiar'}
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
      setErro(e?.response?.data?.error || 'Não foi possível gerar a chave. Tente novamente.');
    } finally {
      setGerando(false);
    }
  };

  return createPortal(
    <Modal isOpen onClose={onClose} title={`Chave do dispositivo — ${cativeiro.nome || ''}`} closeOnBackdropClick={!chave}>
      <div className={styles.chaveModal}>
        {chave ? (
          <>
            <div className={styles.calibAviso}>
              Copie a chave agora: ela <strong>não aparece de novo</strong>. Se perder, gere outra.
              {temChave && historico.length > 1 && ' A chave anterior já deixou de funcionar.'}
            </div>
            <Comando titulo="Chave gerada" valor={chave} />

            <div className={styles.calibCampo}>
              <span className={styles.calibCampoTitulo}>Como configurar na placa</span>
              <ol className={styles.chavePassos}>
                <li>Ligue o ESP32 no computador pelo cabo USB.</li>
                <li>No Arduino IDE, abra o Monitor Serial em <strong>9600 baud</strong>, com o final de linha em &quot;Nova linha&quot;.</li>
                <li>Aperte o botão de reiniciar da placa (EN/RST). Ela aceita comandos durante os primeiros 15 segundos.</li>
                <li>Envie os comandos abaixo, um de cada vez. A placa responde &quot;Chave do dispositivo salva.&quot;</li>
              </ol>
            </div>
            <Comando titulo="1. Chave" valor={`SET DEVICEKEY ${chave}`} />
            <Comando titulo="2. Cativeiro (se a placa ainda não estiver configurada)" valor={`SET CATIVEIRO ${cativeiro._id}`} />

            <div className={styles.calibAcoes}>
              <button type="button" className={`${styles.btn} ${styles.btnSuccess}`} onClick={onClose}>Concluir</button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.calibCampoTexto}>
              A chave identifica a placa deste viveiro: com ela, a API sabe que as leituras vieram mesmo do seu ESP32.
              {temChave
                ? ' Este viveiro já tem uma chave. Gere uma nova se a placa foi trocada ou se a chave pode ter vazado.'
                : ' Este viveiro ainda não tem chave.'}
            </div>

            {confirmando ? (
              <div className={styles.calibAviso}>
                {temChave ? (
                  <>Ao gerar uma nova chave, <strong>a atual para de funcionar na hora</strong>: a placa deixa de enviar leituras
                  até você configurar a nova chave nela. Deseja continuar?</>
                ) : (
                  <>Depois de gerada, <strong>a API só aceita leituras deste viveiro que venham com a chave</strong>: se a placa já
                  está enviando dados sem chave, ela para até você configurar a chave nela. Deseja continuar?</>
                )}
                <div className={styles.calibAcoes} style={{ marginTop: 10 }}>
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setConfirmando(false)} disabled={gerando}>Voltar</button>
                  <button type="button" className={`${styles.btn} ${styles.btnSuccess}`} onClick={gerar} disabled={gerando}>
                    {gerando ? 'Gerando...' : temChave ? 'Sim, gerar nova chave' : 'Sim, gerar chave'}
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
                  {gerando ? 'Gerando...' : temChave ? 'Gerar nova chave' : 'Gerar chave'}
                </button>
              </div>
            )}
            {erro && <div className={styles.calibErro}>{erro}</div>}
          </>
        )}

        <div className={styles.chaveTrilha}>
          <div className={styles.calibLabel}>Histórico de chaves</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 12 }}>
            Quem gerou cada chave e quando (a chave em si nunca fica guardada). Útil para investigar se um aviso de
            sensor inativo coincide com uma troca de chave.
          </div>
          {carregando ? (
            <div style={{ color: '#64748b' }}>Carregando...</div>
          ) : historico.length === 0 ? (
            <div style={{ color: '#64748b' }}>Nenhuma chave foi gerada para este viveiro ainda.</div>
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
                    {new Date(item.geradoEm).toLocaleString('pt-BR')}
                    {index === 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>CHAVE ATUAL</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                    {item.geradoPor ? (
                      <>Gerada por <strong>{item.geradoPor.nome}</strong> ({item.geradoPor.email}) — {item.geradoPor.role}</>
                    ) : (
                      <em>Usuário não encontrado (pode ter sido removido depois)</em>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!chave && (
          <div className={styles.calibAcoes}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Fechar</button>
          </div>
        )}
      </div>
    </Modal>,
    document.body
  );
}
