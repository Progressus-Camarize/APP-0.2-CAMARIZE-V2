import styles from "@/components/LoginContent/LoginContent.module.css";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useRef, useState } from "react";
import axios from "axios";

// Plano free do Render "dorme" a API após inatividade; o primeiro request
// pode levar até ~1 min para acordar o servidor. Depois desse tempo sem
// resposta, mostramos um aviso para o usuário não achar que travou.
const SLOW_HINT_DELAY_MS = 4000;

const LoginContent = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const slowHintTimer = useRef(null);
  const isFormValid = email && senha;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setShowSlowHint(false);
    slowHintTimer.current = setTimeout(() => setShowSlowHint(true), SLOW_HINT_DELAY_MS);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const response = await axios.post(`${apiUrl}/users/auth`, { email, senha });
      // Salvar sessão por aba, evitando conflito entre múltiplas janelas
      if (typeof window !== 'undefined') {
        sessionStorage.setItem("token", response.data.token);
        localStorage.setItem("token", response.data.token);
      }

      // Buscar o usuário autenticado com o token (inclui role)
      const meRes = await axios.get(`${apiUrl}/users/me`, {
        headers: { Authorization: `Bearer ${response.data.token}` }
      });
      const usuario = meRes.data;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem("usuarioCamarize", JSON.stringify(usuario));
        localStorage.setItem("usuarioCamarize", JSON.stringify(usuario));
      }

      // Redireciona conforme a role
      const role = (usuario && usuario.role) || 'membro';
      if (role === 'master') router.push('/master');
      else if (role === 'admin') router.push('/admin');
      else router.push('/home');
    } catch (err) {
      // 429: muitas tentativas erradas; a API informa quanto tempo esperar
      setError(err?.response?.status === 429
        ? err.response.data?.error || "Muitas tentativas. Aguarde alguns minutos."
        : "Usuário ou senha inválidos!");
      setLoading(false);
    } finally {
      clearTimeout(slowHintTimer.current);
      setShowSlowHint(false);
    }
  };

  return (
    <div className={styles.loginMobileWrapper}>
      <form className={styles.loginForm} onSubmit={handleLogin}>
        <h2 className={styles.loginTitle}>Conecte-se para continuar</h2>
        <div className={styles.divider} />
        <div className={styles.fields}>
          <div className={styles.inputGroup}>
            <input
              type="email"
              name="email"
              placeholder="Email"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Senha"
              className={styles.input}
              value={senha}
              onChange={e => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className={`${styles.eyeIcon} ${showPassword ? styles.eyeIconOff : ""}`}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
            >
              <img src="/images/login-olho.svg" alt="" width={16} height={16} />
            </button>
          </div>
          <label className={styles.rememberRow}>
            <input
              type="checkbox"
              id="remember"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className={styles.checkbox}
            />
            <span className={styles.checkboxBox} aria-hidden="true">
              {remember && <img src="/images/login-checkbox.svg" alt="" width={14.25} height={14.25} />}
            </span>
            <span className={styles.rememberLabel}>Lembre-me</span>
          </label>
        </div>
        <button
          type="submit"
          className={styles.loginButton}
          disabled={!isFormValid || loading}
        >
          {loading ? (
            <span className={styles.loginButtonContent}>
              <span className={styles.spinner} aria-hidden="true" />
              Conectando...
            </span>
          ) : "Conectar"}
        </button>
        {showSlowHint && (
          <div className={styles.slowHint}>
            O servidor está iniciando (plano gratuito) — isso pode levar até 1 minuto na primeira vez.
          </div>
        )}
        {error && <div className={styles.errorMsg}>{error}</div>}
        <div className={styles.divider} />
        <div className={styles.registerRow}>
          <span>Não tem uma conta?</span>
          <Link href="/register-type" className={styles.registerLink}>Cadastre-se agora</Link>
        </div>
      </form>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo-login.svg" alt="Camarize" width={231} height={41.8} />
      </div>
    </div>
  );
};

export default LoginContent;
