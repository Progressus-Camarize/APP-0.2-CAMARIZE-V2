import Link from 'next/link';


export default function Custom404() {
  return (
    <div style={{ 
      padding: '20px', 
      textAlign: 'center', 
      fontFamily: 'Arial, sans-serif',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <h1>404 - Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link href="/" style={{
        padding: '10px 20px',
        backgroundColor: '#007bff',
        color: 'white',
        textDecoration: 'none',
        borderRadius: '5px',
        marginTop: '20px'
      }}>
        Back to home
      </Link>
    </div>
  );
}
