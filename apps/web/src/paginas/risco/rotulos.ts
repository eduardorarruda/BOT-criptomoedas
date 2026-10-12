import type { CodigoPausa, GravidadeAlerta, TipoAlerta } from "@zentrade/contratos/esquemas";
import {
  Bot,
  BrainCircuit,
  CalendarX,
  CircleAlert,
  Info,
  OctagonX,
  Scale,
  TrendingDown,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { Tom } from "../../componentes/Selo";

export interface RotuloRisco {
  readonly texto: string;
  readonly tom: Tom;
  readonly icone: LucideIcon;
}

/** Nome curto de cada pausa de compras, como a pessoa lê na tela. */
export const PAUSA: Record<CodigoPausa, RotuloRisco> = {
  conta_perda_diaria: { texto: "Perda do dia da conta", tom: "perda", icone: CalendarX },
  conta_queda: { texto: "Queda do pico", tom: "perda", icone: TrendingDown },
  sequencia_stops: { texto: "Sequência de stops (conta)", tom: "atencao", icone: OctagonX },
  sequencia_stops_robo: { texto: "Sequência de stops (robô)", tom: "atencao", icone: Bot },
  divergencia_saldo: { texto: "Saldo não bate com a corretora", tom: "perda", icone: Scale },
  orcamento_ia: { texto: "Orçamento de IA", tom: "atencao", icone: BrainCircuit },
};

export const GRAVIDADE: Record<GravidadeAlerta, RotuloRisco> = {
  critico: { texto: "Crítico", tom: "perda", icone: TriangleAlert },
  atencao: { texto: "Atenção", tom: "atencao", icone: CircleAlert },
  info: { texto: "Informação", tom: "info", icone: Info },
};

export const TIPO_ALERTA: Record<TipoAlerta, string> = {
  stop_atingido: "Stop atingido",
  perda_diaria_robo: "Perda do dia (robô)",
  perda_diaria_conta: "Perda do dia (conta)",
  pausa_sequencia_stops: "Sequência de stops",
  pausa_queda: "Queda do pico",
  ordem_rejeitada: "Ordem rejeitada",
  ordem_incerta: "Ordem incerta",
  robo_nao_ligou: "Robô não ligou",
  websocket_fora: "WebSocket fora",
  divergencia_saldo: "Divergência de saldo",
  orcamento_ia_80: "Orçamento de IA 80%",
  orcamento_ia_100: "Orçamento de IA 100%",
};
