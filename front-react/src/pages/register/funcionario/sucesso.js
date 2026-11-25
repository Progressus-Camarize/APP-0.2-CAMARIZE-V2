import styles from "@/components/LoginContent/LoginContent.module.css";
import Image from "next/image";
import Link from "next/link";
import { TbCircleCheck } from "react-icons/tb";

export default function RegisterFuncionarioSucessoPage() {
  return (
    <div className={styles.loginMobileWrapper}>
      <div className={styles.loginForm} style={{ maxWidth: '500px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <TbCircleCheck aria-hidden="true" style={{ fontSize: '64px', color: '#16a34a' }} />
        </div>
        <h2 className={styles.loginTitle}>Cadastro Solicitado!</h2>
        <p style={{ textAlign: 'center', marginBottom: '24px', color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
          Sua solicitação de cadastro foi enviada com sucesso!<br />
          O Master irá revisar e aprovar seu cadastro. Em breve você receberá mais informações.
        </p>

        <div style={{ marginBottom: '24px' }}>
          <Link href="/login" style={{ 
            display: 'block', 
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            border: '2px solid #667eea',
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            fontWeight: '600',
            fontSize: '16px',
            textAlign: 'center',
            textDecoration: 'none',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          >
            Ir para Login
          </Link>
        </div>
      </div>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo.svg" alt="Camarize Logo" width={180} height={40} />
      </div>
    </div>
  );
}

