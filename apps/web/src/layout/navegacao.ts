import {
  ArrowLeftRight,
  BookOpen,
  Bot,
  ChartCandlestick,
  Gauge,
  History,
  KeyRound,
  KeySquare,
  ListTree,
  ScrollText,
  ShieldAlert,
  Workflow,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type RotaApp =
  | "/"
  | "/mercado"
  | "/decisoes"
  | "/ordens"
  | "/carteira"
  | "/robos"
  | "/estrategias"
  | "/backtests"
  | "/conhecimento"
  | "/risco"
  | "/automacoes"
  | "/contas"
  | "/tokens";

export interface ItemNavegacao {
  readonly para: RotaApp;
  readonly rotulo: string;
  readonly icone: LucideIcon;
}

export interface GrupoNavegacao {
  readonly titulo: string;
  readonly itens: readonly ItemNavegacao[];
}

export const NAVEGACAO: readonly GrupoNavegacao[] = [
  {
    titulo: "Acompanhar",
    itens: [
      { para: "/", rotulo: "Visão geral", icone: Gauge },
      { para: "/mercado", rotulo: "Mercado", icone: ChartCandlestick },
      { para: "/decisoes", rotulo: "Decisões", icone: ScrollText },
      { para: "/ordens", rotulo: "Ordens e posições", icone: ArrowLeftRight },
      { para: "/carteira", rotulo: "Carteira", icone: Wallet },
    ],
  },
  {
    titulo: "Construir",
    itens: [
      { para: "/robos", rotulo: "Robôs", icone: Bot },
      { para: "/estrategias", rotulo: "Estratégias", icone: ListTree },
      { para: "/backtests", rotulo: "Backtests", icone: History },
      { para: "/conhecimento", rotulo: "Conhecimento", icone: BookOpen },
    ],
  },
  {
    titulo: "Proteger",
    itens: [
      { para: "/risco", rotulo: "Risco", icone: ShieldAlert },
      { para: "/automacoes", rotulo: "Automações", icone: Workflow },
      { para: "/contas", rotulo: "Contas e chaves", icone: KeyRound },
      { para: "/tokens", rotulo: "Tokens de API", icone: KeySquare },
    ],
  },
];
