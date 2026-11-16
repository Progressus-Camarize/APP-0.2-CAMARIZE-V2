import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import styles from "@/components/CreateContent/CreateContent.module.css";
import axios from "axios";
import SelectTipoCamarao from "@/components/SelectTipoCamarao";
import Notification from "@/components/Notification";
import AuthError from "@/components/AuthError";
import Loading from "@/components/Loading";
import RequestButton from "@/components/RequestButton";
import { rotaListaDeCativeiros } from "@/components/Sidebar/menus";
import { comprimirFoto } from "@/lib/fotoCativeiro";

export default function CreateContent() {
  const router = useRouter();
  const localUser = typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}') : {};
  const effectiveRole = localUser?.role;
  const isMember = String(effectiveRole).toLowerCase() === 'membro';
  const [fazendas, setFazendas] = useState([]);
  const [tiposCamarao, setTiposCamarao] = useState([]);
  const [fazendaSelecionada, setFazendaSelecionada] = useState("");
  const [nomeCativeiro, setNomeCativeiro] = useState("");
  const [tipoCamarao, setTipoCamarao] = useState(null);
  const [dataInstalacao, setDataInstalacao] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const [sensores, setSensores] = useState(["", "", ""]);
  const [sensoresDisponiveis, setSensoresDisponiveis] = useState([]);
  const [tempMedia, setTempMedia] = useState("");
  const [phMedio, setPhMedio] = useState("");
  const [amoniaMedia, setAmoniaMedia] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const fileInputRef = useRef();

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
  };

  const hideNotification = () => {
    setNotification({ show: false, message: '', type: 'success' });
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        
        if (!token) {
          setError('You need to be logged in to access this page');
          setLoading(false);
          return;
        }
        
        const headers = { Authorization: `Bearer ${token}` };
        
        // Buscar todos os dados necessários
        const requests = [
          axios.get(`${apiUrl}/fazendas`, { headers }),
          axios.get(`${apiUrl}/tipos-camarao`, { headers })
        ];
        // Somente perfis não-membro precisam carregar lista de sensores
        if (!isMember) {
          requests.push(axios.get(`${apiUrl}/sensores`, { headers }));
        }
        const responses = await Promise.all(requests);
        const [fazendasRes, tiposRes, sensoresRes] = [responses[0], responses[1], responses[2]];
        
        setFazendas(fazendasRes.data);
        setTiposCamarao(tiposRes.data);
        setSensoresDisponiveis(Array.isArray(sensoresRes?.data) ? sensoresRes.data : []);
      } catch (err) {
        console.error('Erro ao buscar dados:', err);
        if (err.response?.status === 401) {
          setError('Session expired. Log in again to continue.');
        } else {
          setError('Failed to load data. Please try again.');
        }
        setFazendas([]);
        setTiposCamarao([]);
        setSensoresDisponiveis([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // LOG para depuração
  useEffect(() => {
    console.log('tiposCamarao:', tiposCamarao);
  }, [tiposCamarao]);

  // Se há erro, mostrar tela de erro
  if (error) {
    return <AuthError error={error} onRetry={() => window.location.reload()} />;
  }

  // Se está carregando, mostrar loading
  if (loading) {
    return <Loading message="Loading form..." />;
  }

  const handleSensorChange = (idx, value) => {
    const novos = [...sensores];
    novos[idx] = value;
    setSensores(novos);
  };

  const adicionarCampoSensor = () => {
    if (sensores.length < 3) {
      setSensores([...sensores, ""]);
    }
  };

  const removerCampoSensor = (idx) => {
    if (sensores.length > 1) {
      const novos = sensores.filter((_, index) => index !== idx);
      setSensores(novos);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const formData = new FormData();
    formData.append("fazendaId", fazendaSelecionada);
    formData.append("nome", nomeCativeiro);
    formData.append("id_tipo_camarao", tipoCamarao?.value || "");
    formData.append("data_instalacao", dataInstalacao);
    if (arquivo) formData.append("foto_cativeiro", await comprimirFoto(arquivo));
    formData.append("temp_media_diaria", tempMedia);
    formData.append("ph_medio_diario", phMedio);
    formData.append("amonia_media_diaria", amoniaMedia);

    
    // Membros não podem relacionar sensores no cadastro
    if (!isMember) {
      // Adiciona todos os sensores selecionados (máximo 3)
      const sensoresSelecionados = sensores.filter(sensor => sensor && sensor !== "");
      if (sensoresSelecionados.length > 0) {
        // Envia como array para suportar múltiplos sensores
        sensoresSelecionados.forEach((sensorId) => {
          formData.append("sensorIds", sensorId);
        });
        console.log('🔗 Sensores relacionados:', sensoresSelecionados);
      }
    }
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      await axios.post(`${apiUrl}/cativeiros`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      
      // Verifica se sensores foram relacionados
      const sensoresSelecionados = isMember ? [] : sensores.filter(sensor => sensor && sensor !== "");
      const message = sensoresSelecionados.length > 0 
        ? `Pond created successfully! ${sensoresSelecionados.length} sensor(s) linked automatically.`
        : "Pond created successfully!";
      
      showNotification(message);
      // Aguardar 2 segundos antes de redirecionar para a notificação aparecer
      setTimeout(() => {
        router.push(rotaListaDeCativeiros());
      }, 2000);
    } catch {
      showNotification("Failed to create pond.", 'error');
    }
  };

  return (
    <div className={styles.createWrapper}>
      <button 
        className={styles.backBtn} 
        onClick={() => router.back()}
        aria-label="Back"
        type="button"
      >
        <span style={{ fontSize: 24, lineHeight: 1 }}>&larr;</span>
      </button>
      <form className={styles.formBox} onSubmit={handleSubmit}>
        <h2 className={styles.title}>Register your pond</h2>
        <select
          className={`${styles.input} ${styles.inputSelect}`}
          value={fazendaSelecionada}
          onChange={e => setFazendaSelecionada(e.target.value)}
          required
          aria-label="Select the farm"
        >
          <option value="">Select the farm</option>
          {fazendas.map(f => (
            <option key={f._id} value={f._id}>
              {f.nome}
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          placeholder="Pond name"
          type="text"
          value={nomeCativeiro}
          onChange={e => setNomeCativeiro(e.target.value)}
          required
          aria-label="Pond name"
        />
        <div className={styles.inputIconBox}>
          <input
            className={styles.input}
            placeholder="Installation date"
            type="date"
            value={dataInstalacao}
            onChange={e => setDataInstalacao(e.target.value)}
            required
            aria-label="Installation date"
          />
        </div>
        {/* Troca o select de tipo de camarão por um autocomplete com criação */}
        <div style={{ width: '100%' }}>
          <SelectTipoCamarao
            value={tipoCamarao}
            onChange={option => setTipoCamarao(option)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <h4 style={{ margin: '0 0 8px 0', fontWeight: 600, fontSize: '1.08rem' }}>Ideal Conditions</h4>
        </div>
        <div className={styles.mediaInputs}>
          <input
            className={styles.input}
            placeholder="Temperature"
            type="number"
            step="0.1"
            min="0"
            value={tempMedia}
            onChange={e => setTempMedia(e.target.value)}
            aria-label="Average temperature"
          />
          <input
            className={styles.input}
            placeholder="pH"
            type="number"
            step="0.1"
            min="0"
            max="14"
            value={phMedio}
            onChange={e => setPhMedio(e.target.value)}
            aria-label="Average pH"
          />
          <input
            className={styles.input}
            placeholder="Ammonia"
            type="number"
            step="0.01"
            min="0"
            value={amoniaMedia}
            onChange={e => setAmoniaMedia(e.target.value)}
            aria-label="Average ammonia"
          />
        </div>
        <div className={styles.uploadBox}>
          <button 
            type="button" 
            className={styles.uploadBtn} 
            onClick={() => fileInputRef.current.click()}
            aria-label="Select pond photo"
          >
            &#128206; Select photo
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={e => setArquivo(e.target.files[0])}
            accept="image/*"
            aria-label="Photo upload"
          />
          <span className={styles.uploadFileName}>{arquivo ? arquivo.name : "No file selected"}</span>
        </div>
        {!isMember && (
          <>
            <hr className={styles.hr} />
            <h3 className={styles.subtitle}>Link the sensors</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px', gridColumn: '1 / -1' }}>
              All selected sensors will be linked to the pond automatically (maximum 3 sensors).
            </p>
            {sensores.map((sensor, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  className={`${styles.input} ${styles.inputSelect}`}
                  value={sensor}
                  onChange={e => handleSensorChange(idx, e.target.value)}
                  aria-label={`Select sensor ${idx + 1}`}
                  style={{ flex: 1 }}
                >
                  <option value="">Select</option>
                  {sensoresDisponiveis
                    .filter(s => {
                      return sensor === s._id || !sensores.includes(s._id);
                    })
                    .map(s => (
                      <option key={s._id} value={s._id}>
                        {s.apelido ? `${s.apelido} (${s.id_tipo_sensor})` : s.id_tipo_sensor || s._id}
                      </option>
                    ))}
                </select>
                {sensores.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removerCampoSensor(idx)}
                    style={{
                      background: '#ff4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                    aria-label={`Remove sensor ${idx + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {sensores.length < 3 && (
              <button
                type="button"
                onClick={adicionarCampoSensor}
                style={{
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginTop: '8px'
                }}
              >
                + Add Sensor
              </button>
            )}
          </>
        )}
        <RequestButton
          className={styles.cadastrarBtn}
          aria-label="Create pond"
          labelWhenAllowed="Create"
          labelWhenRequest="Request"
          action="cadastrar_cativeiro"
          buildPayload={() => ({
            fazendaId: fazendaSelecionada,
            nome: nomeCativeiro,
            tipoCamarao: tipoCamarao?.value || '',
            data_instalacao: dataInstalacao,
            temp_media_diaria: tempMedia,
            ph_medio_diario: phMedio,
            amonia_media_diaria: amoniaMedia,
            sensores: sensores.filter(s => s),
          })}
          onSuccess={handleSubmit}
        />
      </form>
      <div className={styles.logoBox}>
        <img src="/images/logo_camarize1.png" alt="Camarize Logo" />
      </div>
      <Notification
        isVisible={notification.show}
        message={notification.message}
        type={notification.type}
        onClose={hideNotification}
      />
    </div>
  );
}