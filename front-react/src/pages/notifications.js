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
        setError('Error loading notifications');
      }
    } catch (err) {
      console.error('Erro ao buscar notificações:', err);
      setError('Error loading notifications');
    } finally {
      setLoading(false);
    }
  };

  const avaliar = async (notification, avaliacao) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      const token = sessionStorage.getItem('token') || localStorage.getItem('token');
      await axios.patch(`${apiUrl}/notifications/${notification.id}/avaliacao`, { avaliacao }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(items => items.map(item => item.id === notification.id
        ? { ...item, avaliacao, verificadoEm: new Date().toISOString() } : item));
    } catch {
      setError('Could not record the review. Please try again.');
    }
  };

  return (
    <MemberLayout title="Notifications" subtitle="Alerts and warnings from your ponds">
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
