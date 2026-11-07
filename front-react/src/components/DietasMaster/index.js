import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  TbBuildingWarehouse, TbChevronDown, TbFish, TbPencil, TbTrash, TbPlus, TbX,
  TbCheck, TbRefresh, TbLoader2, TbAlertTriangle, TbSearch, TbHourglass,
} from "react-icons/tb";
import Modal from "../Modal";
import { useSolicitacoesPendentes } from "@/hooks/useSolicitacoesPendentes";
import DietaCativeiro from "../DietaCativeiro";
import cardStyles from "@/styles/cards.module.css";
import styles from "@/styles/dietas.module.css";

// Aba Dietas do master: cada cativeiro tem a própria dieta. Fazendas → cativeiros → dieta,
// com o pedido do admin aguardando aprovação e as alimentações de hoje informadas pela placa.

const apiUrl = () => process.env.NEXT_PUBLIC_API_URL || "/api";
const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem("token") || localStorage.getItem("token")}` });
const numero = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const horariosOrdenados = (hs) => [...hs].filter(Boolean).sort((a, b) => a.localeCompare(b));

function FormularioDieta({ inicial, cativeiroNome, salvando, onCancelar, onSalvar }) {
  const [descricao, setDescricao] = useState(inicial?.descricao || "");
  const [quantidade, setQuantidade] = useState(inicial?.quantidade != null ? String(inicial.quantidade) : "");
  const [horarios, setHorarios] = useState(inicial?.horarios?.length ? inicial.horarios : ["08:00"]);
  const [erro, setErro] = useState("");

  const validos = horarios.filter(Boolean);
  const totalDia = Number(quantidade) > 0 ? Number(quantidade) * validos.length : null;

  const salvar = () => {
    if (!(Number(quantidade) > 0)) return setErro("Informe os gramas por refeição (maior que zero).");
    if (!validos.length) return setErro("Informe ao menos um horário.");
    if (new Set(validos).size !== validos.length) return setErro("Há horários repetidos.");
    setErro("");
    onSalvar({ descricao: descricao.trim(), quantidade: Number(quantidade), horarios: horariosOrdenados(validos) });
  };

  return (
    <div className={styles.form}>
      <p className={styles.formAlvo}>Cativeiro <strong>{cativeiroNome}</strong></p>
      <label className={styles.campo}>
        <span>Descrição <em>(opcional)</em></span>
        <input className={cardStyles.input} value={descricao} maxLength={100} placeholder="Ex.: Engorda"
          onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <label className={styles.campo}>
        <span>Ração por refeição (g)</span>
        <input className={cardStyles.input} type="number" min="0" step="0.1" inputMode="decimal" value={quantidade}
          placeholder="Ex.: 25" onChange={(e) => setQuantidade(e.target.value)} />
      </label>
      <div className={styles.campo}>
        <span>Horários de alimentação</span>
        <div className={styles.horariosForm}>
          {horarios.map((h, i) => (
            <div key={i} className={styles.horarioLinha}>
              <input className={cardStyles.input} type="time" value={h}
                onChange={(e) => setHorarios(hs => hs.map((x, j) => (j === i ? e.target.value : x)))} />
              {horarios.length > 1 && (
                <button type="button" className={`${cardStyles.btn} ${cardStyles.btnGhost}`} aria-label={`Remover horário ${h}`}
                  onClick={() => setHorarios(hs => hs.filter((_, j) => j !== i))}>
                  <TbX aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
        {horarios.length < 12 && (
          <button type="button" className={`${cardStyles.btn} ${cardStyles.btnGhost} ${styles.addHorario}`}
            onClick={() => setHorarios(hs => [...hs, ""])}>
            <TbPlus aria-hidden="true" /> Adicionar horário
          </button>
        )}
      </div>
      {totalDia != null && (
        <p className={styles.totalDia}>{validos.length}× ao dia · {numero(totalDia)} g por dia</p>
      )}
      {erro && <p className={styles.erroForm}>{erro}</p>}
      <div className={styles.formAcoes}>
        <button type="button" className={`${cardStyles.btn} ${cardStyles.btnGhost}`} onClick={onCancelar} disabled={salvando}>Cancelar</button>
        <button type="button" className={`${cardStyles.btn} ${cardStyles.btnConfirm}`} onClick={salvar} disabled={salvando}>
          {salvando ? <TbLoader2 className={cardStyles.spin} aria-hidden="true" /> : <TbCheck aria-hidden="true" />}
          Salvar dieta
        </button>
      </div>
    </div>
  );
}

function CativeiroDieta({ cativeiro, pedido, alimentacoes, decidindo, onEditar, onRemover, onDecidir }) {
  const dieta = cativeiro.dieta;

  return (
    <article className={styles.cativeiro}>
      <header className={styles.cativeiroTopo}>
        <div className={styles.iconBox}><TbFish aria-hidden="true" /></div>
        <div className={styles.titulos}>
          <h4 className={styles.cativeiroNome}>{cativeiro.nome}</h4>
          <span className={styles.subtitulo}>{dieta ? "Dieta configurada" : "Sem dieta"}</span>
        </div>
        {pedido && <span className={`${styles.selo} ${styles.seloPedido}`}><TbHourglass aria-hidden="true" /> Pedido pendente</span>}
      </header>

      <DietaCativeiro
        dieta={dieta}
        alimentacoes={alimentacoes}
        pedido={pedido}
        pedidoTitulo={`${pedido?.requesterUser?.nome || "Admin"} pediu uma nova dieta`}
        pedidoAcoes={pedido && (
          <>
            <button type="button" className={`${cardStyles.btn} ${cardStyles.btnReject}`} disabled={decidindo}
              onClick={() => onDecidir(pedido, "reject")}>
              <TbX aria-hidden="true" /> Recusar
            </button>
            <button type="button" className={`${cardStyles.btn} ${cardStyles.btnConfirm}`} disabled={decidindo}
              onClick={() => onDecidir(pedido, "approve")}>
              {decidindo ? <TbLoader2 className={cardStyles.spin} aria-hidden="true" /> : <TbCheck aria-hidden="true" />} Aprovar
            </button>
          </>
        )}
        textoSemDieta="Nenhuma dieta definida: o alimentador não serve ração."
      />

      <footer className={styles.acoes}>
        {dieta && (
          <button type="button" className={`${cardStyles.btn} ${cardStyles.btnGhost}`} onClick={() => onRemover(cativeiro)}>
            <TbTrash aria-hidden="true" /> Remover dieta
          </button>
        )}
        <button type="button" className={`${cardStyles.btn} ${styles.btnPrincipal}`} onClick={() => onEditar(cativeiro)}>
          {dieta ? <TbPencil aria-hidden="true" /> : <TbPlus aria-hidden="true" />} {dieta ? "Editar dieta" : "Definir dieta"}
        </button>
      </footer>
    </article>
  );
}

export default function DietasMaster({ onNotify }) {
  const [fazendas, setFazendas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [alimentacoes, setAlimentacoes] = useState({}); // cativeiroId -> registros | { erro }
  const [aberta, setAberta] = useState({}); // fazendaId -> bool
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(null); // cativeiro
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState(null); // cativeiro
  const [decidindo, setDecidindo] = useState(null); // id do pedido
  const { refresh: atualizarContadorPedidos } = useSolicitacoesPendentes();
  const avisar = useCallback((message, type = "success") => onNotify?.({ show: true, message, type }), [onNotify]);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [visao, solicitacoes] = await Promise.all([
        axios.get(`${apiUrl()}/dietas/fazendas`, { headers: authHeaders() }),
        axios.get(`${apiUrl()}/requests`, { headers: authHeaders(), params: { _: Date.now() } }).catch(() => ({ data: [] })),
      ]);
      setFazendas(Array.isArray(visao.data) ? visao.data : []);
      setPedidos((Array.isArray(solicitacoes.data) ? solicitacoes.data : [])
        .filter(r => r.action === "editar_dieta" && r.status === "pendente" && r.payload?.cativeiroId));
    } catch (e) {
      setErro(e?.response?.data?.error || "Não foi possível carregar as dietas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const carregarAlimentacoes = useCallback(async (cativeiros) => {
    const resultados = await Promise.allSettled(cativeiros.map(c =>
      axios.get(`${apiUrl()}/alimentacoes/${c._id}`, { headers: authHeaders() })));
    setAlimentacoes(prev => {
      const next = { ...prev };
      cativeiros.forEach((c, i) => {
        next[c._id] = resultados[i].status === "fulfilled" ? (resultados[i].value.data?.alimentacoes || []) : { erro: true };
      });
      return next;
    });
  }, []);

  const alternarFazenda = (fazenda) => {
    const chave = String(fazenda._id);
    const abrir = !aberta[chave];
    setAberta(prev => ({ ...prev, [chave]: abrir }));
    if (abrir && fazenda.cativeiros.length) carregarAlimentacoes(fazenda.cativeiros);
  };

  // Pedido pendente mais recente de cada cativeiro
  const pedidoPorCativeiro = useMemo(() => {
    const mapa = new Map();
    for (const r of pedidos) {
      const id = String(r.payload.cativeiroId);
      if (!mapa.has(id) || new Date(r.createdAt) > new Date(mapa.get(id).createdAt)) mapa.set(id, r);
    }
    return mapa;
  }, [pedidos]);

  const termo = busca.trim().toLowerCase();
  const visiveis = fazendas
    .map(f => {
      if (!termo || f.nome?.toLowerCase().includes(termo)) return f;
      return { ...f, cativeiros: f.cativeiros.filter(c => c.nome?.toLowerCase().includes(termo)) };
    })
    .filter(f => !termo || f.cativeiros.length || f.nome?.toLowerCase().includes(termo));

  const salvarDieta = async (dados) => {
    setSalvando(true);
    try {
      await axios.put(`${apiUrl()}/dietas/cativeiro/${editando._id}`, dados, { headers: authHeaders() });
      avisar(`Dieta de ${editando.nome} salva. A placa recebe a mudança em até 1 minuto.`);
      setEditando(null);
      await carregar();
    } catch (e) {
      avisar(`Erro ao salvar a dieta: ${e?.response?.data?.error || e.message}`, "error");
    } finally {
      setSalvando(false);
    }
  };

  const removerDieta = async () => {
    const alvo = removendo;
    setSalvando(true);
    try {
      await axios.delete(`${apiUrl()}/dietas/cativeiro/${alvo._id}`, { headers: authHeaders() });
      avisar(`Dieta de ${alvo.nome} removida. O alimentador para de servir em até 1 minuto.`);
      setRemovendo(null);
      await carregar();
    } catch (e) {
      avisar(`Erro ao remover a dieta: ${e?.response?.data?.error || e.message}`, "error");
    } finally {
      setSalvando(false);
    }
  };

  const decidir = async (pedido, op) => {
    setDecidindo(pedido._id);
    try {
      await axios.post(`${apiUrl()}/requests/${pedido._id}/${op}`, {}, { headers: authHeaders() });
      avisar(op === "approve" ? "Pedido aprovado: dieta aplicada ao cativeiro." : "Pedido recusado.");
      await carregar();
      atualizarContadorPedidos?.();
    } catch (e) {
      avisar(`Erro ao ${op === "approve" ? "aprovar" : "recusar"}: ${e?.response?.data?.error || e.message}`, "error");
    } finally {
      setDecidindo(null);
    }
  };

  if (carregando) {
    return (
      <div className={cardStyles.state}>
        <TbLoader2 className={`${cardStyles.stateIcon} ${cardStyles.spin}`} aria-hidden="true" />
        <div>Carregando dietas...</div>
      </div>
    );
  }
  if (erro) {
    return (
      <div className={`${cardStyles.state} ${cardStyles.stateError}`}>
        <TbAlertTriangle className={cardStyles.stateIcon} aria-hidden="true" />
        <div className={cardStyles.stateTitle}>Erro ao carregar</div>
        <div>{erro}</div>
        <button type="button" className={`${cardStyles.btn} ${cardStyles.btnFalse}`} onClick={carregar}>
          <TbRefresh aria-hidden="true" /> Tentar novamente
        </button>
      </div>
    );
  }

  const totalCativeiros = fazendas.reduce((n, f) => n + f.cativeiros.length, 0);
  const semDieta = fazendas.reduce((n, f) => n + f.cativeiros.filter(c => !c.dieta).length, 0);

  return (
    <section className={styles.wrap}>
      <div className={styles.barra}>
        <label className={`${cardStyles.field} ${styles.busca}`}>
          <TbSearch aria-hidden="true" />
          <input className={cardStyles.input} value={busca} placeholder="Buscar fazenda ou cativeiro"
            onChange={(e) => setBusca(e.target.value)} />
        </label>
        <span className={styles.resumo}>
          {totalCativeiros} cativeiro{totalCativeiros !== 1 ? "s" : ""} · {semDieta} sem dieta · {pedidoPorCativeiro.size} pedido{pedidoPorCativeiro.size !== 1 ? "s" : ""} pendente{pedidoPorCativeiro.size !== 1 ? "s" : ""}
        </span>
        <button type="button" className={`${cardStyles.btn} ${cardStyles.btnGhost}`} onClick={carregar}>
          <TbRefresh aria-hidden="true" /> Atualizar
        </button>
      </div>

      {!visiveis.length && (
        <div className={cardStyles.state}>
          <TbBuildingWarehouse className={cardStyles.stateIcon} aria-hidden="true" />
          <div>{termo ? "Nada encontrado para essa busca." : "Nenhuma fazenda cadastrada."}</div>
        </div>
      )}

      {visiveis.map(fazenda => {
        const chave = String(fazenda._id);
        const expandida = !!aberta[chave] || !!termo;
        const pendentes = fazenda.cativeiros.filter(c => pedidoPorCativeiro.has(String(c._id))).length;
        const faltando = fazenda.cativeiros.filter(c => !c.dieta).length;
        return (
          <div key={chave} className={styles.fazenda}>
            <button type="button" className={styles.fazendaTopo} aria-expanded={expandida} onClick={() => alternarFazenda(fazenda)}>
              <div className={styles.iconBox}><TbBuildingWarehouse aria-hidden="true" /></div>
              <div className={styles.titulos}>
                <span className={styles.fazendaNome}>{fazenda.nome}</span>
                <span className={styles.subtitulo}>
                  {fazenda.cativeiros.length} cativeiro{fazenda.cativeiros.length !== 1 ? "s" : ""}
                  {faltando ? ` · ${faltando} sem dieta` : ""}
                  {fazenda.cidade ? ` · ${fazenda.cidade}` : ""}
                </span>
              </div>
              {pendentes > 0 && <span className={styles.selo}><TbHourglass aria-hidden="true" /> {pendentes} pendente{pendentes !== 1 ? "s" : ""}</span>}
              <TbChevronDown className={`${styles.seta} ${expandida ? styles.setaAberta : ""}`} aria-hidden="true" />
            </button>
            {expandida && (
              <div className={styles.cativeiros}>
                {!fazenda.cativeiros.length && <p className={styles.semDieta}>Nenhum cativeiro nesta fazenda.</p>}
                {fazenda.cativeiros.map(c => (
                  <CativeiroDieta
                    key={c._id}
                    cativeiro={c}
                    pedido={pedidoPorCativeiro.get(String(c._id))}
                    alimentacoes={alimentacoes[c._id]}
                    decidindo={decidindo === pedidoPorCativeiro.get(String(c._id))?._id}
                    onEditar={setEditando}
                    onRemover={setRemovendo}
                    onDecidir={decidir}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Modal isOpen={!!editando} onClose={() => !salvando && setEditando(null)} title={editando?.dieta ? "Editar dieta" : "Definir dieta"}
        closeOnBackdropClick={!salvando}>
        {editando && (
          <FormularioDieta key={editando._id} inicial={editando.dieta} cativeiroNome={editando.nome} salvando={salvando}
            onCancelar={() => setEditando(null)} onSalvar={salvarDieta} />
        )}
      </Modal>

      <Modal isOpen={!!removendo} onClose={() => !salvando && setRemovendo(null)} title="Remover dieta?" closeOnBackdropClick={!salvando}>
        {removendo && (
          <div className={styles.form}>
            <p className={styles.formAlvo}>
              O cativeiro <strong>{removendo.nome}</strong> fica sem dieta e <strong>o alimentador para de servir ração</strong> em até 1 minuto
              (com o firmware atualizado). Você pode definir uma nova dieta depois.
            </p>
            <div className={styles.formAcoes}>
              <button type="button" className={`${cardStyles.btn} ${cardStyles.btnGhost}`} onClick={() => setRemovendo(null)} disabled={salvando}>Cancelar</button>
              <button type="button" className={`${cardStyles.btn} ${cardStyles.btnDanger}`} onClick={removerDieta} disabled={salvando}>
                {salvando ? <TbLoader2 className={cardStyles.spin} aria-hidden="true" /> : <TbTrash aria-hidden="true" />} Remover dieta
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
