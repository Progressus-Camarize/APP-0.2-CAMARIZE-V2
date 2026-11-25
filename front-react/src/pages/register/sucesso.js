import styles from "@/components/LoginContent/LoginContent.module.css";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { TbCircleCheck, TbMail } from "react-icons/tb";

export default function RegisterSucessoPage() {
  const router = useRouter();
  const { email } = router.query;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Carregando...</div>;
  }

  return (
    <div className={styles.loginMobileWrapper}>
      <div className={styles.loginForm} style={{ maxWidth: '500px', textAlign: 'center' }}>
        <TbCircleCheck aria-hidden="true" style={{ display: 'block', margin: '0 auto 24px', fontSize: '64px', color: '#16a34a' }} />
        <h2 className={styles.loginTitle}>Solicitação Enviada!</h2>
        
        <div style={{ 
          padding: '20px', 
          background: '#d4edda', 
          borderRadius: '8px', 
          marginBottom: '24px',
          border: '1px solid #c3e6cb',
          color: '#155724'
        }}>
          <p style={{ margin: '0 0 12px 0', fontSize: '15px', lineHeight: '1.6' }}>
            Sua solicitação de cadastro foi enviada com sucesso para análise do Master.
          </p>
          {email && (
            <p style={{ margin: '0', fontSize: '14px', fontWeight: '600' }}>
              Email cadastrado: <strong>{email}</strong>
            </p>
          )}
        </div>

        <div style={{ 
          padding: '16px', 
          background: '#fff3cd', 
          borderRadius: '8px', 
          marginBottom: '24px',
          border: '1px solid #ffc107',
          fontSize: '14px',
          color: '#856404',
          textAlign: 'left'
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><TbMail aria-hidden="true" /> O que acontece agora?</p>
          <ul style={{ margin: '0', paddingLeft: '20px' }}>
            <li>O Master receberá sua solicitação</li>
            <li>Você receberá um email quando seu cadastro for aprovado</li>
            <li>Após aprovação, você poderá fazer login normalmente</li>
          </ul>
        </div>

        <Link href="/login">
          <button
            type="button"
            className={styles.loginButton}
            style={{ background: "linear-gradient(90deg, var(--salmao-camarize) 0%, #a3c7f7 100%)", color: "#000", width: '100%' }}
          >
            Ir para Login
          </button>
        </Link>

        <div className={styles.registerRow} style={{ marginTop: '16px' }}>
          <span>Lembrou de algo?</span>
          <Link href="/register-type" className={styles.registerLink}>Voltar ao cadastro</Link>
        </div>
      </div>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo.svg" alt="Camarize Logo" width={180} height={40} />
      </div>
    </div>
  );
}

