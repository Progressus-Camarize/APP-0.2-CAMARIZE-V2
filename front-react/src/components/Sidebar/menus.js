import {
  HiOutlineClipboardList, HiOutlineBell, HiOutlineExclamationCircle, HiOutlineOfficeBuilding,
  HiOutlineChartBar, HiOutlineUsers, HiOutlineChatAlt2, HiOutlineChip, HiOutlineBeaker, HiOutlineAdjustments,
  HiOutlineCheckCircle,
} from 'react-icons/hi';

// Abas dos painéis /admin e /master. As páginas compartilhadas (dashboard, edição de
// cativeiro, relatórios...) usam o mesmo menu e voltam ao painel com ?tab=<id>.
export const ADMIN_MENU = [
  { id: 'requests', icon: HiOutlineClipboardList, label: 'History' },
  { id: 'avisos', icon: HiOutlineExclamationCircle, label: 'Alerts' },
  { id: 'status', icon: HiOutlineCheckCircle, label: 'Status' },
  { id: 'solicitacoes', icon: HiOutlineBell, label: 'Requests' },
  { id: 'cativeiros', icon: HiOutlineOfficeBuilding, label: 'Ponds' },
  { id: 'monitoramento', icon: HiOutlineChartBar, label: 'Monitoring' },
  { id: 'funcionarios', icon: HiOutlineUsers, label: 'Employees' },
  { id: 'chat', icon: HiOutlineChatAlt2, label: 'Chat' },
  { id: 'calibracoes', icon: HiOutlineAdjustments, label: 'Calibrations' },
];

export const MASTER_MENU = [
  { id: 'requests', icon: HiOutlineClipboardList, label: 'History' },
  { id: 'avisos', icon: HiOutlineExclamationCircle, label: 'Alerts' },
  { id: 'solicitacoes', icon: HiOutlineBell, label: 'Requests' },
  { id: 'usuarios', icon: HiOutlineUsers, label: 'Users' },
  { id: 'cativeiros', icon: HiOutlineOfficeBuilding, label: 'Ponds' },
  { id: 'sensores', icon: HiOutlineChip, label: 'Sensors' },
  { id: 'dietas', icon: HiOutlineBeaker, label: 'Diets' },
  { id: 'chat', icon: HiOutlineChatAlt2, label: 'Chat' },
  { id: 'calibracoes', icon: HiOutlineAdjustments, label: 'Calibrations' },
];

// Aba que corresponde às páginas compartilhadas de cativeiro (de onde o painel chega nelas)
export const ABA_DAS_PAGINAS_DE_CATIVEIRO = { admin: 'monitoramento', master: 'cativeiros' };

// Abas que podem ser abertas por ?tab=<id>
export const abasNavegaveis = (menu) => menu.filter(item => !item.disabled).map(item => item.id);

// Para onde voltar ao sair das páginas de cativeiro (painel, edição, cadastro):
// admin/master voltam à aba do painel de onde vieram; membro volta à /home
export function rotaListaDeCativeiros() {
  let role = 'membro';
  try {
    const raw = sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize');
    role = (raw && JSON.parse(raw)?.role) || 'membro';
  } catch { /* sem usuário salvo: trata como membro */ }
  const aba = ABA_DAS_PAGINAS_DE_CATIVEIRO[role];
  return aba ? `/${role}?tab=${aba}` : '/home';
}

// Aba inicial do painel a partir de ?tab=<id>, lida já no primeiro render
// (senão a aba padrão aparece selecionada por um instante antes de trocar)
export function abaInicialDaUrl(router, menu, padrao) {
  let tab = router?.query?.tab;
  if (typeof tab !== 'string' && typeof window !== 'undefined') {
    tab = new URLSearchParams(window.location.search).get('tab');
  }
  return abasNavegaveis(menu).includes(tab) ? tab : padrao;
}
