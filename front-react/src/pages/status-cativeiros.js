import MemberLayout from "@/components/MemberLayout";
import StatusCativeiros from "@/components/StatusCativeiros";

// Status dos cativeiros do membro (o admin vê a mesma tela na aba "Status" do painel)
export default function StatusCativeirosPage() {
  return (
    <MemberLayout title="Status dos Cativeiros" subtitle="Visão geral de saúde de cada cativeiro">
      <StatusCativeiros />
    </MemberLayout>
  );
}
