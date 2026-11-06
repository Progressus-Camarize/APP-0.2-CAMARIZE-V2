import cardStyles from '@/styles/cards.module.css';

// Títulos e detalhes legíveis das solicitações, compartilhados por admin, master e membro.
// Cobre também ações antigas que não são mais criadas, mas continuam no histórico do banco.

export const ROTULOS_ACAO = {
  cadastrar_cativeiro: 'Cadastrar cativeiro',
  editar_cativeiro: 'Editar cativeiro',
  excluir_cativeiro: 'Excluir cativeiro',
  editar_cativeiro_add_sensor: 'Solicitar vínculo de sensor',
  editar_cativeiro_remove_sensor: 'Solicitar troca de sensor(es)',
  cadastrar_sensor: 'Cadastrar sensor',
  editar_sensor: 'Editar sensor',
  excluir_sensor: 'Excluir sensor',
  editar_dieta: 'Gerenciar dieta de cativeiro',
  aplicar_calibracao: 'Aplicar calibração',
  cadastrar_funcionario: 'Cadastrar funcionário',
  associar_funcionario: 'Associar funcionário à fazenda',
  cadastrar_proprietario: 'Cadastrar proprietário',
  relatorio_individual: 'Relatório individual',
};

// "acao_desconhecida" -> "Acao desconhecida": nunca exibe snake_case na tela
const humanizar = (texto) => {
  const s = String(texto || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Solicitação';
};

export const rotuloAcao = (action) => ROTULOS_ACAO[action] || humanizar(action);

const ROTULOS_CAMPO = {
  cativeiroId: 'Cativeiro',
  cativeiroNome: 'Cativeiro',
  fazendaId: 'Fazenda',
  fazenda: 'Fazenda',
  sensorId: 'Sensor',
  periodo: 'Período',
  nome: 'Nome',
  apelido: 'Apelido',
  descricao: 'Descrição',
  email: 'E-mail',
  quantidade: 'Quantidade',
  horarios: 'Horários',
  data_instalacao: 'Data de instalação',
  motivo: 'Motivo',
  observacao: 'Observação',
};

const PERIODOS = { dia: 'Últimas 24 horas', semana: 'Últimos 7 dias', mes: 'Últimos 30 dias' };

const pareceId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const pareceData = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));

// Campos que nunca devem aparecer para o usuário (técnicos ou sensíveis)
const OCULTOS = new Set(['_id', 'id', '__v', 'senha', 'password', 'token', 'chave']);

// Valor legível; null quando não há o que mostrar (ex.: id que não conseguimos traduzir)
function valorLegivel(chave, valor, resolver) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (chave === 'periodo') return PERIODOS[valor] || humanizar(valor);
  if (pareceId(valor)) {
    const resolvido = resolver?.(chave, valor);
    return resolvido || null;
  }
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (pareceData(valor)) return new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  if (Array.isArray(valor)) {
    const itens = valor.map(v => valorLegivel(chave, v, resolver)).filter(Boolean);
    return itens.length ? itens.join(', ') : null;
  }
  if (typeof valor === 'object') {
    const partes = Object.entries(valor)
      .filter(([k]) => !OCULTOS.has(k))
      .map(([k, v]) => {
        const legivel = valorLegivel(k, v, resolver);
        return legivel ? `${ROTULOS_CAMPO[k] || humanizar(k)}: ${legivel}` : null;
      })
      .filter(Boolean);
    return partes.length ? partes.join(' · ') : null;
  }
  return String(valor);
}

/**
 * Detalhes de uma solicitação sem formatação própria: lista "Campo: valor" em vez de JSON.
 * resolver(chave, id) devolve o nome de um id (cativeiro, fazenda...) ou null para ocultá-lo.
 */
export function DetalhesGenericos({ payload, resolver, titulo }) {
  const vistos = new Set();
  const linhas = Object.entries(payload || {})
    .filter(([k]) => !OCULTOS.has(k))
    .map(([k, v]) => ({ rotulo: ROTULOS_CAMPO[k] || humanizar(k), valor: valorLegivel(k, v, resolver) }))
    // cativeiroId e cativeiroNome viram o mesmo "Cativeiro": mostra uma vez só
    .filter(({ rotulo, valor }) => valor && !vistos.has(rotulo) && vistos.add(rotulo));
  if (linhas.length === 0) return null;
  return (
    <div className={cardStyles.detalhes}>
      {titulo && <div className={cardStyles.detalhesTitulo}>{titulo}</div>}
      <ul>
        {linhas.map(({ rotulo, valor }) => (
          <li key={rotulo}><strong>{rotulo}:</strong> {valor}</li>
        ))}
      </ul>
    </div>
  );
}

const br = (n, casas) => (typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 4 })
  : '—');

/**
 * Detalhes da solicitação "Aplicar calibração" (mesmo formato no admin, master e membro).
 * nomeCativeiro: nome vindo da lista da tela; sem ele, usa o nome guardado na solicitação.
 */
export function DetalhesCalibracao({ payload = {}, nomeCativeiro, rodape }) {
  const cativeiro = nomeCativeiro || payload.cativeiroNome;
  return (
    <div className={cardStyles.detalhes}>
      {payload.tipo === 'motor' ? (
        <ul>
          {cativeiro && <li><strong>Cativeiro:</strong> {cativeiro}</li>}
          <li><strong>Calibração:</strong> alimentador</li>
          <li><strong>Rotações:</strong> {payload.rotacoes ?? '—'}</li>
          <li><strong>Peso medido:</strong> {br(payload.gramas, 1)} g</li>
          <li><strong>Resultado:</strong> {br(payload.gramas_por_rotacao, 1)} g por volta</li>
        </ul>
      ) : (
        <ul>
          {cativeiro && <li><strong>Cativeiro:</strong> {cativeiro}</li>}
          <li><strong>Calibração:</strong> sensor de pH</li>
          <li><strong>Tensão no pH 7:</strong> {br(payload.tensao_ph7, 2)} V</li>
          <li><strong>Tensão no pH 4:</strong> {br(payload.tensao_ph4, 2)} V</li>
        </ul>
      )}
      {rodape && <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>{rodape}</div>}
    </div>
  );
}

/**
 * Detalhes da solicitação "Editar sensor". O cativeiro vem anotado pela API na solicitação;
 * `sensor` (opcional) é o sensor atual, vindo da lista da tela, para mostrar tipo e apelido de hoje.
 */
export function DetalhesSensor({ payload = {}, sensor }) {
  const tipo = sensor && typeof sensor.id_tipo_sensor === 'object'
    ? (sensor.id_tipo_sensor.descricao || sensor.id_tipo_sensor.nome)
    : null;
  const atual = sensor ? [tipo, sensor.apelido].filter(Boolean).join(' — ') : null;
  if (!payload.cativeiroNome && !atual && !payload.apelido) return null;
  return (
    <div className={cardStyles.detalhes}>
      <ul>
        {payload.cativeiroNome && <li><strong>Cativeiro:</strong> {payload.cativeiroNome}</li>}
        {atual && <li><strong>Sensor:</strong> {atual}</li>}
        {payload.apelido && <li><strong>Novo apelido:</strong> {payload.apelido}</li>}
      </ul>
    </div>
  );
}
