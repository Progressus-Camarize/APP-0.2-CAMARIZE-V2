import MemberLayout from "@/components/MemberLayout";
import Calibracoes from "@/components/Calibracoes";

// Calibrações do membro: ele calibra normalmente, mas o resultado só é aplicado ao
// cativeiro depois que o admin da fazenda aprova (admin e master usam a aba do painel)
export default function CalibracoesPage() {
  return (
    <MemberLayout title="Calibrações" subtitle="Calibração do sensor de pH e alimentador">
      <Calibracoes />
    </MemberLayout>
  );
}
