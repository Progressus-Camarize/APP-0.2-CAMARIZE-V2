import HomeContent from "@/components/HomeContent";
import MemberLayout from "@/components/MemberLayout";
import { useEffect, useRef } from "react";

export default function HomePage() {
  const refHome = useRef(null);
  const refStatus = useRef(null);
  const refSensores = useRef(null);
  const refRequests = useRef(null);
  const refNotifications = useRef(null);
  const refSettings = useRef(null);
  const refProfile = useRef(null);

  const navItemRefs = {
    '/home': refHome,
    '/status-cativeiros': refStatus,
    '/sensores': refSensores,
    '/requests': refRequests,
    '/notifications': refNotifications,
    '/settings': refSettings,
    '/profile': refProfile,
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('usuarioCamarize');
      const user = raw ? JSON.parse(raw) : null;
      const role = user?.role || 'membro';
      if (role === 'master') window.location.replace('/master');
      else if (role === 'admin') window.location.replace('/admin');
    } catch {}
  }, []);

  return (
    <MemberLayout title="My Ponds" subtitle="Monitor and manage your ponds" navItemRefs={navItemRefs}>
      <HomeContent sidebarRefs={navItemRefs} />
    </MemberLayout>
  );
}
