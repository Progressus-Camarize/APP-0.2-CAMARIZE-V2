import { TbTemperature, TbFlask, TbFlask2, TbBroadcast } from "react-icons/tb";

// Ícone de cada parâmetro monitorado, o mesmo em todas as telas (cards, relatórios, avisos).
// Tipo desconhecido (ex.: sensor sem tipo) usa o ícone genérico de sensor.
export const ICONES_PARAMETRO = { temperatura: TbTemperature, ph: TbFlask, amonia: TbFlask2 };

export default function IconeParametro({ tipo, ...props }) {
  const Icone = ICONES_PARAMETRO[tipo] || TbBroadcast;
  return <Icone aria-hidden="true" {...props} />;
}
