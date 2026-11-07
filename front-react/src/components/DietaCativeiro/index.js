import { TbToolsKitchen2, TbClock, TbHourglass } from "react-icons/tb";
import { linhasAlimentacaoDoDia, COR_ALIMENTACAO } from "@/lib/alimentacoes";
import styles from "@/styles/dieta.module.css";

// Como a dieta de um cativeiro aparece em qualquer tela (master e admin):
// card da dieta, alimentações de hoje e o pedido que aguarda o master.

const numero = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const ordenar = (hs) => [...(Array.isArray(hs) ? hs : [])].filter(Boolean).map(String).sort((a, b) => a.localeCompare(b));

function AlimentacoesHoje({ linhas, solto }) {
  if (!linhas.length) return null;
  return (
    <div className={`${styles.hoje} ${solto ? styles.hojeSolto : ""}`}>
      <div className={styles.hojeRotulo}>Alimentações de hoje</div>
      {linhas.map(l => (
        <div key={l.horario} className={styles.alimentacao}>
          <strong>{l.horario}</strong>
          <span style={{ color: COR_ALIMENTACAO[l.situacao] }}>{l.texto}</span>
        </div>
      ))}
    </div>
  );
}

function CardDieta({ dieta, linhas }) {
  const horarios = ordenar(dieta.horarios);
  const refeicoes = horarios.length || Number(dieta.quantidadeRefeicoes) || 0;
  const gramas = Number(dieta.quantidade);
  const temGramas = Number.isFinite(gramas) && gramas > 0;
  return (
    <div className={styles.card}>
      <div className={styles.topo}>
        <div className={styles.icone}><TbToolsKitchen2 aria-hidden="true" /></div>
        <div className={styles.titulos}>
          <span className={styles.rotulo}>Dieta ativa</span>
          <span className={styles.nome}>
            {dieta.descricao || <span className={styles.semNome}>Sem descrição</span>}
          </span>
        </div>
        {temGramas && refeicoes > 0 && (
          <div className={styles.total}>
            <strong>{numero(gramas * refeicoes)} g</strong>
            <small>por dia</small>
          </div>
        )}
      </div>
      <p className={styles.linha}>
        {temGramas ? <><strong>{numero(gramas)} g</strong> por refeição</> : "Quantidade não informada"}
        {refeicoes > 0 && <> · <strong>{refeicoes}×</strong> ao dia</>}
      </p>
      {horarios.length > 0 && (
        <div className={styles.chips}>
          {horarios.map(h => <span key={h} className={styles.chip}><TbClock aria-hidden="true" />{h}</span>)}
        </div>
      )}
      <AlimentacoesHoje linhas={linhas} />
    </div>
  );
}

function PedidoDieta({ pedido, titulo, acoes }) {
  const p = pedido.payload || {};
  const horarios = ordenar(p.horarios);
  const refeicoes = horarios.length || Number(p.quantidadeRefeicoes) || 1;
  const gramas = Number(p.quantidade);
  const enviado = pedido.createdAt ? new Date(pedido.createdAt).toLocaleDateString("pt-BR") : null;
  return (
    <div className={styles.pedido}>
      <div className={styles.pedidoTexto}>
        <span className={styles.pedidoTitulo}>
          <TbHourglass aria-hidden="true" /> {titulo}{enviado ? ` · ${enviado}` : ""}
        </span>
        <span>
          {p.descricao ? `"${p.descricao}" · ` : ""}
          {Number.isFinite(gramas) ? `${numero(gramas)} g por refeição · ` : ""}
          {refeicoes}× ao dia
          {Number.isFinite(gramas) ? ` (${numero(gramas * refeicoes)} g por dia)` : ""}
          {horarios.length ? ` · ${horarios.join(", ")}` : ""}
        </span>
      </div>
      {acoes && <div className={styles.pedidoAcoes}>{acoes}</div>}
    </div>
  );
}

/**
 * dieta: undefined (carregando) | null (sem dieta) | { erro: true } | dieta
 * alimentacoes: undefined (não carregou) | { erro: true } | registros de hoje
 * pedido: solicitação editar_dieta pendente (opcional); pedidoTitulo e pedidoAcoes ajustam o texto e os botões
 */
export default function DietaCativeiro({
  dieta, alimentacoes, pedido, pedidoTitulo = "Aguardando aprovação do master", pedidoAcoes,
  textoSemDieta = "Nenhuma dieta definida para este cativeiro.",
  textoErro = "Não foi possível carregar a dieta.",
}) {
  const temDieta = dieta && !dieta.erro;
  const linhas = Array.isArray(alimentacoes) ? linhasAlimentacaoDoDia(temDieta ? dieta.horarios || [] : [], alimentacoes) : [];

  return (
    <div className={styles.bloco}>
      {dieta === undefined && <p className={styles.carregando}>Carregando dieta...</p>}
      {dieta === null && <p className={styles.vazio}>{textoSemDieta}</p>}
      {dieta?.erro && <p className={styles.erro}>{textoErro}</p>}
      {temDieta && <CardDieta dieta={dieta} linhas={linhas} />}
      {!temDieta && <AlimentacoesHoje linhas={linhas} solto />}
      {alimentacoes?.erro && <p className={styles.erroLinha}>Não foi possível carregar as alimentações de hoje.</p>}
      {pedido && <PedidoDieta pedido={pedido} titulo={pedidoTitulo} acoes={pedidoAcoes} />}
    </div>
  );
}
