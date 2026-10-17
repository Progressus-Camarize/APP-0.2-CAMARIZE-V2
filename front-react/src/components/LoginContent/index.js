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
    } catch {
      setError("Usuário ou senha inválidos!");
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
          <span
            className={styles.eyeIcon}
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={0}
            role="button"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="#888"/><circle cx="12" cy="12" r="2.5" fill="#888"/></svg>
            ) : (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M2 2l20 20M12 5c-5 0-9.27 3.11-11 7a12.35 12.35 0 0 0 5.29 5.29M17.94 17.94A11.94 11.94 0 0 0 23 12c-1.73-3.89-6-7-11-7a11.94 11.94 0 0 0-5.29 1.29" stroke="#888" strokeWidth="2"/><path d="M9.5 9.5a3 3 0 0 1 4.24 4.24" stroke="#888" strokeWidth="2"/></svg>
            )}
          </span>
        </div>
        <div className={styles.rememberRow}>
          <input
            type="checkbox"
            id="remember"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="remember" className={styles.rememberLabel}>Lembre-me</label>
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
        <div className={styles.registerRow}>
          <span>Não tem uma conta?</span>
          <Link href="/register-type" className={styles.registerLink}>Cadastre-se agora</Link>
        </div>
      </form>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo.svg" alt="Logo" width={180} height={120} />
      </div>
    </div>
  );
};

export default LoginContent;
