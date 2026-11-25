import React, { useState, useEffect } from "react";
import MemberLayout from "../components/MemberLayout";
import axios from "axios";
import { useUnreadAvisos } from "../hooks/useUnreadAvisos";
import AvisoLista from "../components/AvisoCard";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { markSeen } = useUnreadAvisos();

  useEffect(() => {
    fetchNotifications();
    markSeen();
  }, [markSeen]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
      const token = typeof window !== "undefined" ? (sessionStorage.getItem("token") || localStorage.getItem("token")) : null;

      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.get(`${apiUrl}/notifications`, { headers });

      if (response.data.success) {
        setNotifications(response.data.notifications);
      } else {
        setError('Erro ao carregar notificações');
      }
    } catch (err) {
      console.error('Erro ao buscar notificações:', err);
      setError('Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  };

  const avaliar = async (notification, avaliacao) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      const token = sessionStorage.getItem('token') || localStorage.getItem('token');
      const { data } = await axios.patch(`${apiUrl}/notifications/${notification.id}/avaliacao`, { avaliacao }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // O aviso de queda de conexão fecha ao ser conferido: a API devolve o novo estado
      setNotifications(items => items.map(item => item.id === notification.id
        ? { ...item, avaliacao, verificadoEm: new Date().toISOString(), estado: data?.estado || item.estado } : item));
    } catch {
      setError('Não foi possível registrar a conferência. Tente novamente.');
    }
  };

  return (
    <MemberLayout title="Notificações" subtitle="Alertas e avisos dos seus cativeiros">
      <AvisoLista
        avisos={notifications}
        loading={loading}
        error={error}
        onRetry={fetchNotifications}
        onAvaliar={avaliar}
      />
    </MemberLayout>
  );
}
