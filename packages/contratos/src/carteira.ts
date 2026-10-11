import { z } from "zod";
import { Id, Instante, Lado, TextoDecimal } from "./comum.js";

/**
 * Carteira da Binance (`/api/v1/carteira`, `/api/v1/binance/status`). Valores em USDT,
 * decimais em texto, instantes em ms UTC. O método de custo (preço médio ponderado,
 * o mesmo do domínio) e o tratamento de saldo sem negociação estão em docs/carteira.md.
 */

/** Rede de uma conta de corretora: papel não tem conta. */
export const RedeContaEsquema = z.enum(["testnet", "real"]);
export type RedeConta = z.infer<typeof RedeContaEsquema>;

/** Robô: a ordem saiu do ZenTrade (clientOrderId "zt-..."). Manual: qualquer outra. */
export const OrigemNegociacaoEsquema = z.enum(["robo", "manual"]);
export type OrigemNegociacao = z.infer<typeof OrigemNegociacaoEsquema>;

/** A moeda de referência: todo valor da carteira é convertido para ela. */
export const MOEDA_REFERENCIA = "USDT";

/** Uma negociação (fill) importada da conta da pessoa, como a Binance devolveu. */
export const NegociacaoCarteiraEsquema = z.object({
  id: Id,
  simbolo: z.string(),
  base: z.string(),
  cotacao: z.string(),
  lado: Lado,
  preco: TextoDecimal,
  quantidade: TextoDecimal,
  /** Quantidade × preço, na moeda de cotação do par. */
  valorCotacao: TextoDecimal,
  taxa: TextoDecimal,
  ativoTaxa: z.string(),
  /** Taxa convertida para USDT no instante da negociação; null = sem preço para converter. */
  taxaUsdt: TextoDecimal.nullable(),
  /** Quanto valia 1 unidade da moeda de cotação em USDT no instante; null = sem conversão. */
  cotacaoUsdt: TextoDecimal.nullable(),
  origem: OrigemNegociacaoEsquema,
  idOrdem: z.string(),
  em: Instante,
});
export type NegociacaoCarteira = z.infer<typeof NegociacaoCarteiraEsquema>;

/**
 * Números de uma moeda numa parcela (robô, manual ou total), todos em USDT.
 * `precoMedio`, `valorAtual`, `resultadoNaoRealizado`, `resultadoLiquido` e `retorno`
 * são null quando não dá para saber (sem posição, sem preço atual ou sem custo).
 */
export const ParcelaCarteiraEsquema = z.object({
  quantidadeComprada: TextoDecimal,
  custoComprado: TextoDecimal,
  quantidadeVendida: TextoDecimal,
  valorVendido: TextoDecimal,
  /** Quantidade em posição segundo as negociações (pode diferir do saldo da conta). */
  quantidade: TextoDecimal,
  precoMedio: TextoDecimal.nullable(),
  custoPosicao: TextoDecimal,
  valorAtual: TextoDecimal.nullable(),
  resultadoRealizadoBruto: TextoDecimal,
  resultadoRealizadoLiquido: TextoDecimal,
  resultadoNaoRealizado: TextoDecimal.nullable(),
  resultadoLiquido: TextoDecimal.nullable(),
  taxas: TextoDecimal,
  /** resultadoLiquido ÷ custoComprado (fração: 0,05 = 5%). */
  retorno: TextoDecimal.nullable(),
  /** Vendido além do que as negociações conhecidas compraram: não tem custo, não entra no resultado. */
  quantidadeVendidaSemCusto: TextoDecimal,
  negociacoes: z.number().int().nonnegative(),
  /** Negociações que ficaram fora do cálculo por falta de preço em USDT no instante. */
  semConversao: z.number().int().nonnegative(),
});
export type ParcelaCarteira = z.infer<typeof ParcelaCarteiraEsquema>;

export const SaldoMoedaEsquema = z.object({
  livre: TextoDecimal,
  bloqueado: TextoDecimal,
  total: TextoDecimal,
});

export const MoedaCarteiraEsquema = z.object({
  ativo: z.string(),
  /** Preço atual em USDT; null = a Binance não tem par com USDT para esta moeda. */
  preco: TextoDecimal.nullable(),
  /** A própria moeda de referência (USDT): é caixa, sem preço médio nem resultado. */
  referencia: z.boolean(),
  saldo: SaldoMoedaEsquema,
  /** Saldo total × preço atual: o que a conta tem hoje desta moeda. */
  valorSaldo: TextoDecimal.nullable(),
  /** Saldo que nenhuma negociação explica (depósito, transferência): custo desconhecido. */
  quantidadeSemCusto: TextoDecimal,
  valorSemCusto: TextoDecimal.nullable(),
  /** As negociações dizem que há mais do que o saldo (saque, Earn, transferência). */
  quantidadeForaDoSaldo: TextoDecimal,
  /** Fatia do valor da conta (fração), pelo saldo × preço. */
  alocacao: TextoDecimal.nullable(),
  robo: ParcelaCarteiraEsquema,
  manual: ParcelaCarteiraEsquema,
  total: ParcelaCarteiraEsquema,
  avisos: z.array(z.string()),
});
export type MoedaCarteira = z.infer<typeof MoedaCarteiraEsquema>;

/** Soma das moedas (exceto a referência) numa parcela. */
export const ResumoParcelaEsquema = z.object({
  custoComprado: TextoDecimal,
  custoPosicao: TextoDecimal,
  valorAtual: TextoDecimal,
  resultadoRealizadoBruto: TextoDecimal,
  resultadoRealizadoLiquido: TextoDecimal,
  resultadoNaoRealizado: TextoDecimal,
  resultadoBruto: TextoDecimal,
  resultadoLiquido: TextoDecimal,
  taxas: TextoDecimal,
  retorno: TextoDecimal.nullable(),
});
export type ResumoParcela = z.infer<typeof ResumoParcelaEsquema>;

export const ResumoCarteiraEsquema = z.object({
  robo: ResumoParcelaEsquema,
  manual: ResumoParcelaEsquema,
  total: ResumoParcelaEsquema,
  /** Tudo o que a conta tem hoje a preço de mercado, inclusive USDT e saldo sem custo. */
  valorConta: TextoDecimal,
  valorSemCusto: TextoDecimal,
  /** Saldo em USDT (caixa). */
  caixa: TextoDecimal,
});
export type ResumoCarteira = z.infer<typeof ResumoCarteiraEsquema>;

export const EstadoSincronizacaoEsquema = z.object({
  em: Instante,
  ok: z.boolean(),
  erro: z.string().nullable(),
  negociacoes: z.number().int().nonnegative(),
});
export type EstadoSincronizacao = z.infer<typeof EstadoSincronizacaoEsquema>;

/** `GET /carteira`. Sem conta cadastrada: `conectada: false` e listas vazias. */
export const CarteiraEsquema = z.object({
  conectada: z.boolean(),
  rede: RedeContaEsquema.nullable(),
  /** Redes em que a pessoa tem conta cadastrada. */
  redes: z.array(RedeContaEsquema),
  moedaReferencia: z.literal(MOEDA_REFERENCIA),
  sincronizacao: EstadoSincronizacaoEsquema.nullable(),
  precosEm: Instante.nullable(),
  resumo: ResumoCarteiraEsquema,
  moedas: z.array(MoedaCarteiraEsquema),
  avisos: z.array(z.string()),
});
export type Carteira = z.infer<typeof CarteiraEsquema>;

/** `GET /carteira/:ativo`: a moeda e as negociações que a tocam (base, cotação ou taxa). */
export const CarteiraAtivoEsquema = z.object({
  rede: RedeContaEsquema,
  precosEm: Instante.nullable(),
  moeda: MoedaCarteiraEsquema,
  negociacoes: z.array(NegociacaoCarteiraEsquema),
});
export type CarteiraAtivo = z.infer<typeof CarteiraAtivoEsquema>;

/** `POST /carteira/sincronizar` (corpo opcional `{ rede?, simbolos? }`). */
export const PedidoSincronizacaoEsquema = z.object({
  rede: RedeContaEsquema.optional(),
  /** Pares a mais para importar (ex.: moeda que você zerou antes da primeira sincronização). */
  simbolos: z
    .array(z.string().regex(/^[A-Z0-9]{2,20}$/, "par em maiúsculas, ex.: BTCUSDT"))
    .max(50)
    .optional(),
});
export type PedidoSincronizacao = z.infer<typeof PedidoSincronizacaoEsquema>;

export const SincronizacaoEsquema = z.object({
  rede: RedeContaEsquema,
  em: Instante,
  negociacoesNovas: z.number().int().nonnegative(),
  simbolos: z.array(z.string()),
  saldos: z.number().int().nonnegative(),
  /** Parou no meio (limite da Binance, por exemplo): o que entrou fica; a próxima continua. */
  parcial: z.boolean(),
  avisos: z.array(z.string()),
});
export type Sincronizacao = z.infer<typeof SincronizacaoEsquema>;

/** Uma conta cadastrada, como a Binance a vê agora. Permissões null = não deu para ler. */
export const StatusContaBinanceEsquema = z.object({
  id: Id,
  rede: RedeContaEsquema,
  apiKeyFinal: z.string(),
  conectada: z.boolean(),
  erro: z.string().nullable(),
  podeNegociar: z.boolean().nullable(),
  podeSacar: z.boolean().nullable(),
  ipRestrito: z.boolean().nullable(),
  permissoesLidas: z.boolean(),
  sincronizacao: EstadoSincronizacaoEsquema.nullable(),
  avisos: z.array(z.string()),
});
export type StatusContaBinance = z.infer<typeof StatusContaBinanceEsquema>;

/** `GET /binance/status`. */
export const StatusBinanceEsquema = z.object({ contas: z.array(StatusContaBinanceEsquema) });
export type StatusBinance = z.infer<typeof StatusBinanceEsquema>;

export interface CredenciaisCorretora {
  readonly apiKey: string;
  readonly apiSecret: string;
}

/**
 * As chaves de corretora de cada pessoa, decifradas (implementada em packages/banco).
 * Só o motor e a API usam; nada disto sai pela API.
 */
export interface PortaCredenciais {
  binance(usuarioId: string, rede: RedeConta): Promise<CredenciaisCorretora | null>;
}
