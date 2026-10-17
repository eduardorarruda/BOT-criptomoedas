/**
 * "Comece aqui": os primeiros passos de uma instalação nova, com o progresso tirado dos
 * dados (nada de caixa que a pessoa marca sem ter feito). Função pura; a tela só desenha.
 *
 * Enquanto algum dado ainda carrega, devolve `null`: a lista não aparece com passos
 * "faltando" que na verdade só não chegaram.
 */
export type IdPasso = "2fa" | "chave-testnet" | "estrategia" | "backtest" | "robo-papel" | "conhecimento";

export type DestinoPasso =
  "/contas" | "/estrategias" | "/backtests" | "/robos" | "/conhecimento" | "/privacidade";

export interface Passo {
  readonly id: IdPasso | "lgpd";
  readonly titulo: string;
  readonly descricao: string;
  /** Texto do botão quando é o próximo passo. */
  readonly acao: string;
  readonly para: DestinoPasso;
  readonly feito: boolean;
  /** Só quem opera a instância faz; não conta no progresso. */
  readonly opcional: boolean;
}

export interface DadosPassos {
  readonly doisFatores: boolean | undefined;
  readonly contas: readonly { readonly rede: string }[] | undefined;
  readonly estrategias: readonly unknown[] | undefined;
  readonly backtests: readonly { readonly estado: string }[] | undefined;
  readonly robos: readonly { readonly rede: string; readonly pausado: boolean }[] | undefined;
  readonly documentos: readonly unknown[] | undefined;
  /** `null`: não configurado; `undefined`: não se sabe (exemplo, ou a leitura falhou). */
  readonly controlador: { readonly nome: string; readonly email: string } | null | undefined;
}

export interface ResultadoPassos {
  readonly passos: readonly Passo[];
  readonly feitos: number;
  readonly total: number;
  readonly proximo: Passo | null;
  readonly completo: boolean;
  /** O passo de quem opera (controlador LGPD), ou `null` quando não se aplica. */
  readonly operador: Passo | null;
}

type Carregado = { readonly [K in keyof DadosPassos]-?: Exclude<DadosPassos[K], undefined> };

const PASSOS: readonly (Omit<Passo, "feito" | "opcional"> & {
  readonly id: IdPasso;
  readonly feito: (d: Carregado) => boolean;
})[] = [
  {
    id: "2fa",
    titulo: "Ligar o 2FA",
    descricao: "O código do app autenticador, além da senha. Proteja a conta antes de qualquer chave.",
    acao: "Ligar o 2FA",
    para: "/contas",
    feito: (d) => d.doisFatores,
  },
  {
    id: "chave-testnet",
    titulo: "Cadastrar uma chave da testnet, sem saque",
    descricao: "Dinheiro de teste da Binance. A chave só lê e negocia; saque fica desligado.",
    acao: "Cadastrar a chave",
    para: "/contas",
    feito: (d) => d.contas.some((c) => c.rede === "testnet"),
  },
  {
    id: "estrategia",
    titulo: "Criar uma estratégia a partir de um modelo",
    descricao: "Comece de um modelo pronto e ajuste as regras de entrada e de saída.",
    acao: "Escolher um modelo",
    para: "/estrategias",
    feito: (d) => d.estrategias.length > 0,
  },
  {
    id: "backtest",
    titulo: "Rodar um backtest e ler o veredito",
    descricao: "Como a regra teria ido no passado, com taxas, e se resiste fora da amostra.",
    acao: "Rodar um backtest",
    para: "/backtests",
    feito: (d) => d.backtests.some((b) => b.estado === "concluido"),
  },
  {
    id: "robo-papel",
    titulo: "Ligar um robô em papel",
    descricao: "Ele segue a estratégia com dinheiro fictício e registra o que faria.",
    acao: "Criar o robô",
    para: "/robos",
    feito: (d) => d.robos.some((r) => r.rede === "papel" && !r.pausado),
  },
  {
    id: "conhecimento",
    titulo: "Adicionar documentos à base de conhecimento",
    descricao: "Notas e textos que a IA consulta ao argumentar cada decisão.",
    acao: "Adicionar um documento",
    para: "/conhecimento",
    feito: (d) => d.documentos.length > 0,
  },
];

function carregado(d: DadosPassos): d is Carregado {
  const { controlador: _, ...resto } = d;
  return Object.values(resto).every((v) => v !== undefined);
}

function passoOperador(controlador: DadosPassos["controlador"]): Passo | null {
  if (controlador === undefined) return null;
  return {
    id: "lgpd",
    titulo: "Configurar o controlador dos dados (LGPD)",
    descricao:
      "Para quem opera esta instância: ZENTRADE_CONTROLADOR_NOME e ZENTRADE_CONTROLADOR_EMAIL no ambiente da API. A política de privacidade mostra esse contato.",
    acao: "Ver a política",
    para: "/privacidade",
    feito: controlador !== null,
    opcional: true,
  };
}

export function derivarPassos(d: DadosPassos): ResultadoPassos | null {
  if (!carregado(d)) return null;
  const passos: Passo[] = PASSOS.map((p) => ({ ...p, feito: p.feito(d), opcional: false }));
  const feitos = passos.filter((p) => p.feito).length;
  return {
    passos,
    feitos,
    total: passos.length,
    proximo: passos.find((p) => !p.feito) ?? null,
    completo: feitos === passos.length,
    operador: passoOperador(d.controlador),
  };
}
