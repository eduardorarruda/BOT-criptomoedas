import type { EstadoDecisao, EstadoOrdem, ModoRobo, Rede } from "@zentrade/contratos/esquemas";
import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  Hourglass,
  NotebookPen,
  OctagonX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { FonteDocumento } from "../api/esquemas";
import type { Tom } from "../componentes/Selo";

/** Nomes que a pessoa lê, do lado dela. */
export interface Rotulo {
  readonly texto: string;
  readonly tom: Tom;
  readonly icone: LucideIcon;
}

export const ESTADO_DECISAO: Record<EstadoDecisao, Rotulo> = {
  registrada: { texto: "Só registrada", tom: "neutro", icone: NotebookPen },
  barrada: { texto: "Barrada pelo risco", tom: "atencao", icone: OctagonX },
  aguardando_aprovacao: { texto: "Aguarda você", tom: "atencao", icone: Hourglass },
  aprovada: { texto: "Aprovada", tom: "marca", icone: CircleCheck },
  recusada: { texto: "Recusada por você", tom: "neutro", icone: Ban },
  expirada: { texto: "Expirou sem resposta", tom: "neutro", icone: Clock },
  executada: { texto: "Executada", tom: "marca", icone: CircleCheck },
  falhou: { texto: "Falhou na corretora", tom: "perda", icone: TriangleAlert },
};

export const ESTADO_ORDEM: Record<EstadoOrdem, Rotulo> = {
  PENDENTE: { texto: "Pendente", tom: "atencao", icone: Hourglass },
  PARCIAL: { texto: "Parcial", tom: "atencao", icone: Clock },
  PREENCHIDA: { texto: "Preenchida", tom: "marca", icone: CircleCheck },
  REJEITADA: { texto: "Rejeitada", tom: "perda", icone: CircleX },
  CANCELADA: { texto: "Cancelada", tom: "neutro", icone: Ban },
};

export const MODO_ROBO: Record<
  ModoRobo,
  { readonly texto: string; readonly descricao: string; readonly icone: LucideIcon }
> = {
  observar: { texto: "Observar", descricao: "Só registra o que faria. Nenhuma ordem sai.", icone: Eye },
  sugerir: { texto: "Sugerir", descricao: "Pede sua aprovação antes de cada ordem.", icone: Hourglass },
  auto: { texto: "Automático", descricao: "Envia a ordem sozinho se o risco aprovar.", icone: CircleCheck },
};

export const REDE: Record<Rede, { readonly texto: string; readonly descricao: string; readonly tom: Tom }> = {
  papel: { texto: "Papel", descricao: "Simulação local, sem corretora.", tom: "neutro" },
  testnet: { texto: "Testnet", descricao: "Corretora de teste, dinheiro de mentira.", tom: "neutro" },
  real: { texto: "Dinheiro real", descricao: "Ordens de verdade na sua conta.", tom: "perda" },
};

export const FONTE_DOCUMENTO: Record<FonteDocumento, string> = {
  diario: "Diário",
  noticia: "Notícia",
  regra_corretora: "Regra da corretora",
  estrategia: "Estratégia",
  nota: "Nota sua",
};

export const ACAO: Record<"COMPRAR" | "VENDER" | "AGUARDAR", string> = {
  COMPRAR: "Compra",
  VENDER: "Venda",
  AGUARDAR: "Aguardar",
};
