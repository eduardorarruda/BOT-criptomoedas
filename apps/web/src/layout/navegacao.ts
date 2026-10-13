import {
  ArrowLeftRight,
  BookOpen,
  Bot,
  Building2,
  ChartCandlestick,
  ChartPie,
  Gauge,
  History,
  KeyRound,
  KeySquare,
  Landmark,
  ListTree,
  Radio,
  MessagesSquare,
  ScrollText,
  ShieldAlert,
  Workflow,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type RotaApp =
  | "/"
  | "/aovivo"
  | "/assistente"
  | "/mercado"
  | "/decisoes"
  | "/ordens"
  | "/patrimonio"
  | "/carteira"
  | "/renda-fixa"
  | "/imobiliario"
  | "/robos"
  | "/estrategias"
  | "/backtests"
  | "/conhecimento"
  | "/risco"
  | "/automacoes"
  | "/contas"
  | "/tokens";

interface ItemNavegacao {
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
      { para: "/aovivo", rotulo: "Ao vivo", icone: Radio },
      { para: "/mercado", rotulo: "Mercado", icone: ChartCandlestick },
      { para: "/decisoes", rotulo: "Decisões", icone: ScrollText },
      { para: "/ordens", rotulo: "Ordens e posições", icone: ArrowLeftRight },
      { para: "/assistente", rotulo: "Assistente", icone: MessagesSquare },
    ],
  },
  {
    titulo: "Finanças",
    itens: [
      { para: "/patrimonio", rotulo: "Patrimônio", icone: ChartPie },
      { para: "/carteira", rotulo: "Carteira", icone: Wallet },
      { para: "/renda-fixa", rotulo: "Renda fixa", icone: Landmark },
      { para: "/imobiliario", rotulo: "Imobiliário", icone: Building2 },
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

/** O grupo do menu de um caminho ("/robos/x" → "Construir"); a raiz só casa com "/". */
export function grupoDe(caminho: string): string | undefined {
  const casa = (para: RotaApp): boolean =>
    para === "/" ? caminho === "/" : caminho === para || caminho.startsWith(`${para}/`);
  return NAVEGACAO.find((g) => g.itens.some((i) => casa(i.para)))?.titulo;
}
