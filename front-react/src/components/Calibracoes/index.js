import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import styles from '@/styles/panel.module.css';
import {
  HiOutlineBeaker, HiOutlineRefresh, HiOutlineOfficeBuilding, HiOutlineLocationMarker,
  HiCheckCircle, HiExclamationCircle, HiChevronDown,
} from 'react-icons/hi';
import Modal from '../Modal';

// Tela de Calibrações (Figma "Admin / Group 113–119"), usada por membro, admin e master.
// O estado de cada calibração vive na API (/calibracao); a tela só acompanha as etapas.
// Membro calibra normalmente, mas o resultado vai para aprovação do admin da fazenda.

const apiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const authHeaders = () => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

const INTERVALO_CONSULTA_MS = 2000;
const NOME_TIPO = { motor: 'alimentador', ph: 'sensor de pH' };

// Etapa da API -> passo da tela (para retomar uma calibração em andamento)
const PASSO_DA_ETAPA = {
  executar: 'executando',
  aguardando_peso: 'peso',
  preparar_ph7: 'preparar_ph7',
  ph7: 'lendo_ph7',
  preparar_ph4: 'preparar_ph4',
  ph4: 'lendo_ph4',
};

// Passos em que a tela espera o ESP32 e consulta a API periodicamente
const PASSOS_AGUARDANDO = ['executando', 'lendo_ph7', 'lendo_ph4'];

const numeroBr = (n, casas = 1) =>
  Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 4) });

const positivo = (n) => n != null && Number(n) > 0;

// Situação de cada calibração a partir dos valores gravados no cativeiro
const statusAlimentador = (c) => (positivo(c.gramas_por_rotacao)
  ? { ok: true, texto: `${numeroBr(c.gramas_por_rotacao)} g por volta` }
  : { ok: false, texto: 'Não calibrado' });
const statusPh = (c) => (positivo(c.tensao_ph7) && positivo(c.tensao_ph4)
  ? { ok: true, texto: 'Calibrado' }
  : { ok: false, texto: 'Não calibrado' });

export default function Calibracoes() {
  const [fazendas, setFazendas] = useState([]);
  const [cativeiros, setCativeiros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const [aberta, setAberta] = useState({}); // fazendaId -> bool
  const [fluxo, setFluxo] = useState(null); // calibração aberta no modal
  const fluxoRef = useRef(null);
  fluxoRef.current = fluxo;

  useEffect(() => {
    async function carregar() {
      try {
        const [fz, cats] = await Promise.all([
          axios.get(`${apiUrl()}/fazendas`, authHeaders()),
          axios.get(`${apiUrl()}/cativeiros`, authHeaders()),
        ]);
        const lista = Array.isArray(fz.data) ? fz.data : [];
        setFazendas(lista);
        if (lista.length === 1) setAberta({ [String(lista[0]._id)]: true });
        setCativeiros(Array.isArray(cats.data) ? cats.data : []);
      } catch (e) {
        setErroLista(e?.response?.data?.error || 'Não foi possível carregar as fazendas e cativeiros.');
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  const atualizarFluxo = (mudancas) => setFluxo(atual => (atual ? { ...atual, ...mudancas } : atual));

  const consultarAtual = (cativeiroId) =>
    axios.get(`${apiUrl()}/calibracao/atual/${cativeiroId}`).then(r => r.data);

  // Abre o modal: retoma a calibração em andamento ou começa pela configuração
  const abrir = async (cativeiro, tipo) => {
    const base = { cativeiro, tipo, voltas: '10', peso: '', erro: '', enviando: false };
    try {
      const atual = await consultarAtual(cativeiro._id);
      if (atual.ativa && atual.tipo !== tipo) {
        setFluxo({ ...base, passo: 'ocupado', tipoEmAndamento: atual.tipo });
      } else if (atual.ativa) {
        setFluxo({ ...base, passo: PASSO_DA_ETAPA[atual.etapa], rotacoes: atual.rotacoes });
      } else {
        setFluxo({ ...base, passo: tipo === 'motor' ? 'config_motor' : 'intro_ph' });
      }
    } catch {
      setFluxo({ ...base, passo: tipo === 'motor' ? 'config_motor' : 'intro_ph' });
    }
  };

  const fechar = () => setFluxo(null);

  const aplicarNoCard = (cativeiroId, campos) =>
    setCativeiros(lista => lista.map(c => (c._id === cativeiroId ? { ...c, ...campos } : c)));

  // Chamada à API com tratamento de erro padrão do modal
  const enviar = async (acao) => {
    atualizarFluxo({ enviando: true, erro: '' });
    try {
      await acao();
    } catch (e) {
      atualizarFluxo({ erro: e?.response?.data?.error || 'Não foi possível concluir a ação. Tente novamente.' });
    } finally {
      atualizarFluxo({ enviando: false });
    }
  };

  const cancelarCalibracao = () => enviar(async () => {
    try {
      await axios.post(`${apiUrl()}/calibracao/cancelar`, { id_cativeiro: fluxo.cativeiro._id }, authHeaders());
    } catch (e) {
      if (e?.response?.status !== 404) throw e; // 404: já não havia calibração ativa
    }
    fechar();
  });

  const iniciarMotor = () => {
    const rotacoes = Number(fluxo.voltas);
    if (!Number.isInteger(rotacoes) || rotacoes < 1 || rotacoes > 500) {
      atualizarFluxo({ erro: 'Informe um número inteiro de voltas entre 1 e 500.' });
      return;
    }
    enviar(async () => {
      await axios.post(`${apiUrl()}/calibracao/iniciar`, { id_cativeiro: fluxo.cativeiro._id, tipo: 'motor', rotacoes }, authHeaders());
      atualizarFluxo({ passo: 'executando', rotacoes });
    });
  };

  const enviarPeso = () => {
    const gramas = Number(String(fluxo.peso).replace(',', '.'));
    if (!Number.isFinite(gramas) || gramas <= 0) {
      atualizarFluxo({ erro: 'Informe o peso da ração em gramas (maior que zero).' });
      return;
    }
    enviar(async () => {
      const { data } = await axios.post(`${apiUrl()}/calibracao/resultado`, {
        id_cativeiro: fluxo.cativeiro._id, tipo: 'motor', etapa: 'peso', rotacoes: fluxo.rotacoes, gramas,
      }, authHeaders());
      atualizarFluxo({ passo: 'sucesso_motor', resultado: data.resultado, pendente: !!data.pendenteAprovacao });
      if (!data.pendenteAprovacao && data.resultado) {
        aplicarNoCard(fluxo.cativeiro._id, { gramas_por_rotacao: data.resultado.gramas_por_rotacao });
      }
    });
  };

  const iniciarPh = () => enviar(async () => {
    await axios.post(`${apiUrl()}/calibracao/iniciar`, { id_cativeiro: fluxo.cativeiro._id, tipo: 'ph' }, authHeaders());
    atualizarFluxo({ passo: 'preparar_ph7' });
  });

  const confirmarPh = (proximo) => enviar(async () => {
    await axios.post(`${apiUrl()}/calibracao/confirmar`, { id_cativeiro: fluxo.cativeiro._id }, authHeaders());
    atualizarFluxo({ passo: proximo });
  });

  // Enquanto espera o ESP32, consulta a API para saber quando a etapa avançou
  const verificarAndamento = useCallback(async () => {
    const atual = fluxoRef.current;
    if (!atual || !PASSOS_AGUARDANDO.includes(atual.passo)) return;
    try {
      const estado = await consultarAtual(atual.cativeiro._id);
      if (fluxoRef.current?.passo !== atual.passo) return; // usuário já mudou de passo
      if (estado.concluida && atual.passo === 'lendo_ph4') {
        atualizarFluxo({ passo: 'sucesso_ph', resultado: estado.resultado, pendente: !!estado.pendenteAprovacao });
        if (!estado.pendenteAprovacao && estado.resultado) aplicarNoCard(atual.cativeiro._id, estado.resultado);
      } else if (!estado.ativa) {
        atualizarFluxo({ passo: 'interrompida' });
      } else if (atual.passo === 'executando' && estado.etapa === 'aguardando_peso') {
        atualizarFluxo({ passo: 'peso' });
      } else if (atual.passo === 'lendo_ph7' && estado.etapa === 'preparar_ph4') {
        atualizarFluxo({ passo: 'preparar_ph4' });
      }
    } catch {
      // Falha momentânea de rede: tenta de novo na próxima consulta
    }
  }, []);

  const passo = fluxo?.passo;
  useEffect(() => {
    if (!PASSOS_AGUARDANDO.includes(passo)) return undefined;
    const timer = setInterval(verificarAndamento, INTERVALO_CONSULTA_MS);
    return () => clearInterval(timer);
  }, [passo, verificarAndamento]);

  // Agrupa os cativeiros por fazenda (todas as fazendas aparecem, mesmo sem cativeiro)
  const porFazenda = {};
  fazendas.forEach(f => { porFazenda[String(f._id)] = []; });
  cativeiros.forEach(c => {
    const fzId = String(c.fazenda?._id || c.fazenda || '');
    if (porFazenda[fzId]) porFazenda[fzId].push(c);
  });
  const totalCativeiros = Object.values(porFazenda).reduce((n, lista) => n + lista.length, 0);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Fazendas e Cativeiros</h2>
          <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
            {fazendas.length} fazenda{fazendas.length !== 1 ? 's' : ''} · {totalCativeiros} cativeiro{totalCativeiros !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {carregando && <div style={{ color: '#64748b', padding: 20 }}>Carregando...</div>}
      {erroLista && <div className={styles.calibErro} style={{ padding: 20 }}>{erroLista}</div>}
      {!carregando && !erroLista && fazendas.length === 0 && (
        <div style={{ color: '#64748b', padding: 20 }}>Nenhuma fazenda vinculada à sua conta.</div>
      )}

      {fazendas.map(f => {
        const fzId = String(f._id);
        const lista = porFazenda[fzId] || [];
        const admins = Array.isArray(f.admins) ? f.admins : null; // só vem para o master
        const estaAberta = !!aberta[fzId];
        return (
          <div key={fzId} className={styles.calibFazenda}>
            <button
              type="button"
              className={styles.calibFazendaHeader}
              aria-expanded={estaAberta}
              onClick={() => setAberta(prev => ({ ...prev, [fzId]: !prev[fzId] }))}
            >
              <span className={styles.calibFazendaIcone}><HiOutlineLocationMarker size={18} /></span>
              <span className={styles.calibFazendaInfo}>
                <span className={styles.calibFazendaNome}>
                  {f.nome || 'Fazenda'}
                  {f.codigo && <span className={styles.calibFazendaCodigo}>{f.codigo}</span>}
                </span>
                <span className={styles.calibFazendaSub}>
                  {lista.length} cativeiro{lista.length !== 1 ? 's' : ''}
                  {admins && ` · ${admins.length > 0 ? `Admin: ${admins.map(a => a.nome).join(', ')}` : 'Sem admin responsável'}`}
                </span>
              </span>
              <HiChevronDown size={20} className={`${styles.calibFazendaSeta} ${estaAberta ? styles.calibFazendaSetaAberta : ''}`} />
            </button>

            {estaAberta && (
              lista.length === 0 ? (
                <p className={styles.calibVazio}>Nenhum cativeiro nesta fazenda.</p>
              ) : (
                <div className={styles.calibGrade}>
                  {lista.map(c => (
                    <CardCativeiro key={c._id} cativeiro={c} onCalibrar={abrir} />
                  ))}
                </div>
              )
            )}
          </div>
        );
      })}

      {/* Portal no body: a animação da .section (transform) prenderia o fundo do modal à seção */}
      {fluxo && createPortal(
        <Modal
          isOpen
          onClose={() => {}}
          title={TITULOS[fluxo.passo]?.(fluxo)}
          showCloseButton={false}
          closeOnBackdropClick={false}
        >
          <ConteudoDoPasso
            fluxo={fluxo}
            onChange={atualizarFluxo}
            onFechar={fechar}
            onCancelar={cancelarCalibracao}
            onIniciarMotor={iniciarMotor}
            onEnviarPeso={enviarPeso}
            onIniciarPh={iniciarPh}
            onConfirmarPh={confirmarPh}
          />
        </Modal>,
        document.body
      )}
    </section>
  );
}

function LinhaStatus({ rotulo, status }) {
  const Icone = status.ok ? HiCheckCircle : HiExclamationCircle;
  return (
    <div className={styles.calibStatus}>
      <span className={styles.calibStatusRotulo}>{rotulo}</span>
      <span className={`${styles.calibStatusValor} ${status.ok ? styles.calibStatusOk : styles.calibStatusPendente}`}>
        <Icone size={15} aria-hidden="true" />
        {status.texto}
      </span>
    </div>
  );
}

function CardCativeiro({ cativeiro: c, onCalibrar }) {
  return (
    <article className={styles.calibCard}>
      <header className={styles.calibCardTopo}>
        <span className={styles.calibCardIcone}><HiOutlineOfficeBuilding size={18} /></span>
        <div style={{ minWidth: 0 }}>
          <h3 className={styles.calibCardNome}>{c.nome || c._id}</h3>
          {c.id_tipo_camarao?.nome && <p className={styles.calibCardEspecie}>{c.id_tipo_camarao.nome}</p>}
        </div>
      </header>

      <div className={styles.calibCardStatus}>
        <LinhaStatus rotulo="Alimentador" status={statusAlimentador(c)} />
        <LinhaStatus rotulo="Sensor de pH" status={statusPh(c)} />
      </div>

      <div className={styles.calibCardAcoes}>
        <button type="button" className={styles.calibBotao} onClick={() => onCalibrar(c, 'ph')}>
          <HiOutlineBeaker size={18} aria-hidden="true" />
          Calibrar pH
        </button>
        <button type="button" className={`${styles.calibBotao} ${styles.calibBotaoAlimentador}`} onClick={() => onCalibrar(c, 'motor')}>
          <HiOutlineRefresh size={18} aria-hidden="true" />
          Calibrar alimentador
        </button>
      </div>
    </article>
  );
}

const TITULOS = {
  config_motor: () => 'Configurar calibração do alimentador',
  executando: () => 'Calibração em andamento...',
  peso: () => 'Retornando peso da ração',
  sucesso_motor: (f) => (f.pendente ? 'Calibração enviada para aprovação' : 'Calibração realizada com sucesso!'),
  intro_ph: () => 'Calibrar sensor de pH',
  preparar_ph7: () => 'Definição da tensão do pH7',
  lendo_ph7: () => 'Lendo o sensor de pH...',
  preparar_ph4: () => 'Definição da tensão do pH4',
  lendo_ph4: () => 'Lendo o sensor de pH...',
  sucesso_ph: (f) => (f.pendente ? 'Calibração enviada para aprovação' : 'Calibração realizada com sucesso!'),
  ocupado: () => 'Calibração em andamento',
  interrompida: () => 'Calibração interrompida',
};

function Descricao({ children }) {
  return (
    <div className={styles.calibCampo}>
      <span className={styles.calibCampoTitulo}>Descrição</span>
      <span className={styles.calibCampoTexto}>{children}</span>
    </div>
  );
}

function Botoes({ fluxo, cancelar, principal }) {
  return (
    <>
      {fluxo.erro && <div className={styles.calibErro}>{fluxo.erro}</div>}
      <div className={styles.calibAcoes}>
        {cancelar && (
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={cancelar.onClick} disabled={fluxo.enviando}>
            {cancelar.label || 'Cancelar'}
          </button>
        )}
        {principal && (
          <button type="button" className={`${styles.btn} ${styles.btnSuccess}`} onClick={principal.onClick} disabled={fluxo.enviando}>
            {fluxo.enviando ? 'Enviando...' : principal.label}
          </button>
        )}
      </div>
    </>
  );
}

function AvisoAprovacao() {
  return (
    <div className={styles.calibAviso}>
      O resultado será aplicado ao cativeiro depois que o administrador da fazenda aprovar a solicitação.
    </div>
  );
}

function ConteudoDoPasso({ fluxo, onChange, onFechar, onCancelar, onIniciarMotor, onEnviarPeso, onIniciarPh, onConfirmarPh }) {
  const { passo } = fluxo;
  const r = fluxo.resultado || {};

  if (passo === 'config_motor') return (
    <div className={styles.calibModal}>
      <Descricao>O motor irá girar a quantidade de voltas que você definir. Deixe um recipiente embaixo do alimentador para recolher a ração.</Descricao>
      <label className={styles.calibCampo}>
        <span className={styles.calibCampoTitulo}>Voltas</span>
        <input className={styles.filterInput} type="number" min="1" max="500" step="1" inputMode="numeric"
          value={fluxo.voltas} onChange={e => onChange({ voltas: e.target.value, erro: '' })} />
      </label>
      <Botoes fluxo={fluxo} cancelar={{ onClick: onFechar }} principal={{ label: 'Calibrar', onClick: onIniciarMotor }} />
    </div>
  );

  if (passo === 'executando') return (
    <div className={styles.calibModal}>
      <Descricao>Aguardando o alimentador efetuar as rotações...</Descricao>
      <div className={styles.calibResultado}><strong>Voltas solicitadas:</strong> {fluxo.rotacoes}</div>
      <Botoes fluxo={fluxo} cancelar={{ onClick: onCancelar }} />
    </div>
  );

  if (passo === 'peso') return (
    <div className={styles.calibModal}>
      <Descricao>O alimentador precisa saber a quantidade em gramas de ração que foi liberada. Pese a ração recolhida e informe abaixo.</Descricao>
      <label className={styles.calibCampo}>
        <span className={styles.calibCampoTitulo}>Peso(g)</span>
        <input className={styles.filterInput} type="text" inputMode="decimal" placeholder="40,0"
          value={fluxo.peso} onChange={e => onChange({ peso: e.target.value, erro: '' })} />
      </label>
      <Botoes fluxo={fluxo} cancelar={{ onClick: onCancelar }} principal={{ label: 'Finalizar', onClick: onEnviarPeso }} />
    </div>
  );

  if (passo === 'sucesso_motor') return (
    <div className={styles.calibModal}>
      <div className={styles.calibResultado}><strong>Rotações:</strong> {r.rotacoes}</div>
      <div className={styles.calibResultado}><strong>Peso(g):</strong> {numeroBr(r.gramas)}g</div>
      <div className={styles.calibResultado}><strong>Resultado:</strong> {numeroBr(r.gramas_por_rotacao)}g/rotação</div>
      {fluxo.pendente && <AvisoAprovacao />}
      <Botoes fluxo={fluxo} principal={{ label: 'Fechar', onClick: onFechar }} />
    </div>
  );

  if (passo === 'intro_ph') return (
    <div className={styles.calibModal}>
      <Descricao>Você precisa de duas soluções para calibrar: uma com pH 7 e outra com pH 4.</Descricao>
      <Botoes fluxo={fluxo} cancelar={{ onClick: onFechar }} principal={{ label: 'Iniciar', onClick: onIniciarPh }} />
    </div>
  );

  if (passo === 'preparar_ph7') return (
    <div className={styles.calibModal}>
      <Descricao>Insira o eletrodo do sensor de pH na solução de pH 7, aguarde 1 minuto e clique em calibrar.</Descricao>
      <Botoes fluxo={fluxo} cancelar={{ onClick: onCancelar }} principal={{ label: 'Calibrar pH7', onClick: () => onConfirmarPh('lendo_ph7') }} />
    </div>
  );

  if (passo === 'preparar_ph4') return (
    <div className={styles.calibModal}>
      <Descricao>Enxágue o eletrodo do sensor de pH, insira na solução de pH 4, aguarde 1 minuto e clique em calibrar.</Descricao>
      <Botoes fluxo={fluxo} cancelar={{ onClick: onCancelar }} principal={{ label: 'Calibrar pH4', onClick: () => onConfirmarPh('lendo_ph4') }} />
    </div>
  );

  if (passo === 'lendo_ph7' || passo === 'lendo_ph4') return (
    <div className={styles.calibModal}>
      <Descricao>Aguardando o sensor registrar a tensão na solução de {passo === 'lendo_ph7' ? 'pH 7' : 'pH 4'}... Mantenha o eletrodo na solução.</Descricao>
      <Botoes fluxo={fluxo} cancelar={{ onClick: onCancelar }} />
    </div>
  );

  if (passo === 'sucesso_ph') return (
    <div className={styles.calibModal}>
      <div className={styles.calibResultado}><strong>Tensão no pH 7:</strong> {numeroBr(r.tensao_ph7, 2)} V</div>
      <div className={styles.calibResultado}><strong>Tensão no pH 4:</strong> {numeroBr(r.tensao_ph4, 2)} V</div>
      {fluxo.pendente && <AvisoAprovacao />}
      <Botoes fluxo={fluxo} principal={{ label: 'Fechar', onClick: onFechar }} />
    </div>
  );

  if (passo === 'ocupado') return (
    <div className={styles.calibModal}>
      <Descricao>Já existe uma calibração do {NOME_TIPO[fluxo.tipoEmAndamento]} em andamento neste cativeiro. Conclua-a ou cancele antes de iniciar outra.</Descricao>
      <Botoes fluxo={fluxo} cancelar={{ label: 'Cancelar a em andamento', onClick: onCancelar }} principal={{ label: 'Fechar', onClick: onFechar }} />
    </div>
  );

  // interrompida: alguém cancelou a calibração enquanto a tela esperava
  return (
    <div className={styles.calibModal}>
      <Descricao>Esta calibração foi cancelada antes de terminar. Nenhum valor foi alterado no cativeiro.</Descricao>
      <Botoes fluxo={fluxo} principal={{ label: 'Fechar', onClick: onFechar }} />
    </div>
  );
}
