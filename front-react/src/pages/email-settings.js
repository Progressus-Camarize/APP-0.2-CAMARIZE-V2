import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import EmailSettings from '../components/EmailSettings/EmailSettings';
import NavBottom from '../components/NavBottom';
import AuthError from '../components/AuthError';
import Loading from '../components/Loading';

export default function EmailSettingsPage() {
  const router = useRouter();
  
  // Verificar se o usuário está logado
  const usuario = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("usuarioCamarize")) : null;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!usuario) {
      router.push('/login');
      return;
    }
    setLoading(false);
  }, [usuario, router]);

  if (loading) {
    return <Loading message="Loading..." />;
  }

  if (!usuario) {
    return <AuthError error="Sign in to access email settings." />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      paddingBottom: '80px'
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseOver={(e) => {
            e.target.style.background = '#f3f4f6';
          }}
          onMouseOut={(e) => {
            e.target.style.background = 'none';
          }}
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        
        <div>
          <h1 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '600',
            color: '#1f2937'
          }}>
            Email Settings
          </h1>
          <p style={{
            margin: '4px 0 0 0',
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Manage your email notifications
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <EmailSettings />
      </div>

      <NavBottom />
    </div>
  );
}
