import styles from "@/components/LoginContent/LoginContent.module.css";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";

export default function RegisterSucessoPage() {
  const router = useRouter();
  const { email } = router.query;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div className={styles.loginMobileWrapper}>
      <div className={styles.loginForm} style={{ maxWidth: '500px', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '24px' }}>✅</div>
        <h2 className={styles.loginTitle}>Request Sent!</h2>
        
        <div style={{ 
          padding: '20px', 
          background: '#d4edda', 
          borderRadius: '8px', 
          marginBottom: '24px',
          border: '1px solid #c3e6cb',
          color: '#155724'
        }}>
          <p style={{ margin: '0 0 12px 0', fontSize: '15px', lineHeight: '1.6' }}>
            Your sign-up request was successfully sent for review by the Master.
          </p>
          {email && (
            <p style={{ margin: '0', fontSize: '14px', fontWeight: '600' }}>
              Registered email: <strong>{email}</strong>
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
          <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>📧 What happens next?</p>
          <ul style={{ margin: '0', paddingLeft: '20px' }}>
            <li>The Master will receive your request</li>
            <li>You will receive an email when your sign-up is approved</li>
            <li>Once approved, you can sign in normally</li>
          </ul>
        </div>

        <Link href="/login">
          <button
            type="button"
            className={styles.loginButton}
            style={{ background: "linear-gradient(90deg, var(--salmao-camarize) 0%, #a3c7f7 100%)", color: "#000", width: '100%' }}
          >
            Go to Sign in
          </button>
        </Link>

        <div className={styles.registerRow} style={{ marginTop: '16px' }}>
          <span>Forgot something?</span>
          <Link href="/register-type" className={styles.registerLink}>Back to sign-up</Link>
        </div>
      </div>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo.svg" alt="Camarize Logo" width={180} height={40} />
      </div>
    </div>
  );
}

