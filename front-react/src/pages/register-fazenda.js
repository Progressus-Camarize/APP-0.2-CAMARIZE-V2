import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import styles from "@/components/CreateContent/CreateContent.module.css";

export default function RegisterFazendaPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [rua, setRua] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [numero, setNumero] = useState("");
  const [adminId, setAdminId] = useState("");
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isFormValid = nome && rua && bairro && cidade && numero;

  const getToken = () =>
    typeof window !== "undefined"
      ? sessionStorage.getItem("token") || localStorage.getItem("token")
      : null;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    fetch(`${apiUrl}/users?role=admin`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setAdmins(Array.isArray(data) ? data : []))
      .catch(() => setAdmins([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const token = getToken();
    if (!token) {
      setError("You need to be signed in to register a farm.");
      return;
    }
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const body = { nome, rua, bairro, cidade, numero };
      if (adminId) body.adminId = adminId;

      const response = await fetch(`${apiUrl}/fazendas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        router.back();
      } else {
        const data = await response.json();
        setError(data.error || "Error registering farm.");
      }
    } catch (err) {
      setError(`Server connection error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.createWrapper}>
      <button
        className={styles.backBtn}
        onClick={() => router.back()}
        type="button"
        aria-label="Back"
      >
        <span style={{ fontSize: 24, lineHeight: 1 }}>&larr;</span>
      </button>

      <form className={styles.formBox} onSubmit={handleSubmit}>
        <h2 className={styles.title}>Register farm</h2>

        <input
          className={styles.input}
          type="text"
          placeholder="Farm name"
          value={nome}
          onChange={e => setNome(e.target.value)}
          autoComplete="off"
          required
          style={{ gridColumn: "1 / -1" }}
        />

        <hr className={styles.hr} />
        <h3 className={styles.subtitle}>Address</h3>

        <input
          className={styles.input}
          type="text"
          placeholder="Street"
          value={rua}
          onChange={e => setRua(e.target.value)}
          autoComplete="off"
          required
          style={{ gridColumn: "1 / -1" }}
        />

        <input
          className={styles.input}
          type="text"
          placeholder="Neighborhood"
          value={bairro}
          onChange={e => setBairro(e.target.value)}
          autoComplete="off"
          required
          style={{ gridColumn: "1 / -1" }}
        />

        <div className={styles.mediaInputs}>
          <input
            className={styles.input}
            type="text"
            placeholder="City"
            value={cidade}
            onChange={e => setCidade(e.target.value)}
            autoComplete="off"
            required
            style={{ flex: 2 }}
          />
          <input
            className={styles.input}
            type="text"
            placeholder="Number"
            value={numero}
            onChange={e => setNumero(e.target.value)}
            autoComplete="off"
            required
            style={{ flex: 1 }}
          />
        </div>

        <hr className={styles.hr} />
        <h3 className={styles.subtitle}>Manager</h3>

        <select
          className={`${styles.input} ${styles.inputSelect}`}
          value={adminId}
          onChange={e => setAdminId(e.target.value)}
          style={{ gridColumn: "1 / -1" }}
        >
          <option value="">No managing admin (optional)</option>
          {admins.map(a => (
            <option key={a.id || a._id} value={a.id || a._id}>
              {a.nome} — {a.email}
            </option>
          ))}
        </select>

        {error && (
          <p style={{ color: "#ef4444", gridColumn: "1 / -1", margin: 0, fontSize: "0.95rem" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className={styles.cadastrarBtn}
          disabled={!isFormValid || loading}
        >
          {loading ? "Registering..." : "Register"}
        </button>
      </form>

      <div className={styles.logoBox}>
        <img src="/images/logo_camarize1.png" alt="Camarize Logo" />
      </div>
    </div>
  );
}
