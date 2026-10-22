import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import axios from "axios";

const CreatableSelect = dynamic(() => import("react-select/creatable"), { ssr: false });

const authHeaders = () => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

export default function SelectTipoCamarao({ value, onChange }) {
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchTipos() {
      setLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const res = await axios.get(`${apiUrl}/tipos-camarao`, authHeaders());
        setTipos(res.data.map(tc => ({ value: tc._id, label: tc.nome })));
      } catch {
        setTipos([]);
      }
      setLoading(false);
    }
    fetchTipos();
  }, []);

  // Garante que o value seja um dos objetos da lista ou null
  const selected = tipos.find(t => t.value === value?.value) || null;
  console.log('SelectTipoCamarao - tipos:', tipos, 'value:', value, 'selected:', selected);

  const handleCreate = async (inputValue) => {
    const nome = inputValue.trim();
    if (!nome) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await axios.post(`${apiUrl}/camaroes`, { nome }, authHeaders());
    const lista = await axios.get(`${apiUrl}/tipos-camarao`, authHeaders());
    setTipos(lista.data.map(tc => ({ value: tc._id, label: tc.nome })));
    onChange({ value: res.data._id, label: res.data.nome });
  };

  return (
    <>
      <CreatableSelect
        isClearable
        isLoading={loading}
        options={tipos}
        value={selected || null}
        isDisabled={loading}
        onChange={onChange}
        onCreateOption={handleCreate}
        placeholder="Selecione ou crie o tipo de camarão"
        menuPortalTarget={typeof window !== "undefined" ? document.body : null}
        // menuPosition="fixed"
        styles={{
          menuPortal: base => ({ ...base, zIndex: 9999 }),
          menu: base => ({ ...base, zIndex: 9999 }),
        }}
        formatCreateLabel={inputValue => `Criar novo tipo: "${inputValue}"`}
        noOptionsMessage={() => "Nenhum tipo encontrado"}
      />
    </>
  );
} 