// Limites de tentativas em memória (a API roda em uma única instância no Render).
// Ao reiniciar, os contadores zeram — aceitável para frear força bruta.

class Contador {
  constructor({ max, janelaMs }) {
    this.max = max;
    this.janelaMs = janelaMs;
    this.registros = new Map(); // chave -> { count, expiraEm }
    // Limpeza periódica para o Map não crescer sem limite
    setInterval(() => this.limpar(), 5 * 60_000).unref();
  }

  atual(chave) {
    const reg = this.registros.get(chave);
    if (!reg || reg.expiraEm <= Date.now()) return null;
    return reg;
  }

  bloqueado(chave) {
    const reg = this.atual(chave);
    return reg && reg.count >= this.max ? Math.ceil((reg.expiraEm - Date.now()) / 1000) : 0;
  }

  somar(chave) {
    const reg = this.atual(chave) || { count: 0, expiraEm: Date.now() + this.janelaMs };
    reg.count += 1;
    this.registros.set(chave, reg);
  }

  zerar(chave) {
    this.registros.delete(chave);
  }

  limpar() {
    const agora = Date.now();
    for (const [chave, reg] of this.registros) if (reg.expiraEm <= agora) this.registros.delete(chave);
  }
}

const QUINZE_MIN = 15 * 60_000;

// Login: 5 senhas erradas na mesma conta bloqueiam essa conta por 15 min.
// Por IP o teto é alto, porque chamadas via proxy da Vercel chegam com o mesmo IP.
const falhasPorConta = new Contador({ max: 5, janelaMs: QUINZE_MIN });
const falhasPorIp = new Contador({ max: 50, janelaMs: QUINZE_MIN });

const bloquear = (res, segundos) => {
  res.set('Retry-After', String(segundos));
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return res.status(429).json({ error: `Muitas tentativas. Tente novamente em ${minutos} minuto(s).` });
};

const chaveConta = (email) => String(email || '').trim().toLowerCase();

export const limitarLogin = (req, res, next) => {
  const conta = chaveConta(req.body?.email);
  const espera = Math.max(falhasPorConta.bloqueado(conta), falhasPorIp.bloqueado(req.ip));
  if (espera > 0) return bloquear(res, espera);

  // Conta as respostas de credencial inválida; login certo zera a conta
  res.on('finish', () => {
    if (res.statusCode === 401) {
      falhasPorConta.somar(conta);
      falhasPorIp.somar(req.ip);
    } else if (res.statusCode === 200) {
      falhasPorConta.zerar(conta);
    }
  });
  next();
};

// Cadastros: freia criação de contas em massa a partir do mesmo IP
const cadastrosPorIp = new Contador({ max: 30, janelaMs: 60 * 60_000 });

export const limitarCadastro = (req, res, next) => {
  const espera = cadastrosPorIp.bloqueado(req.ip);
  if (espera > 0) return bloquear(res, espera);
  cadastrosPorIp.somar(req.ip);
  next();
};

export default { limitarLogin, limitarCadastro };
