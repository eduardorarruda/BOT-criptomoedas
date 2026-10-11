import { z } from "zod";
import { Id, Instante, TextoDecimal } from "./comum.js";

/**
 * Investimentos imobiliários (`/api/v1/imobiliario`): cadastro por pessoa, lançamentos,
 * métricas calculadas pela API e simuladores. Dinheiro sempre em texto decimal; taxas
 * e percentuais em fração (0,1 = 10%); datas de calendário em AAAA-MM-DD.
 * CRI e LCI ficam na renda fixa.
 */
export const TIPOS_IMOBILIARIO = [
  "aluguel",
  "temporada",
  "flip",
  "terreno",
  "planta",
  "fii",
  "reit",
  "crowdfunding",
  "consorcio",
] as const;
export const TipoImobiliario = z.enum(TIPOS_IMOBILIARIO);
export type TipoImobiliario = z.infer<typeof TipoImobiliario>;
/** Tipos que são um imóvel físico (aceitam financiamento e valorização estimada). */
export const TIPOS_IMOVEL_FISICO: readonly TipoImobiliario[] = [
  "aluguel",
  "temporada",
  "flip",
  "terreno",
  "planta",
];

export const TipoLancamentoImobiliario = z.enum(["aporte", "receita", "despesa", "resgate", "imposto"]);
export type TipoLancamentoImobiliario = z.infer<typeof TipoLancamentoImobiliario>;
export const MoedaImobiliario = z.enum(["BRL", "USD"]);
export const SistemaAmortizacaoEsquema = z.enum(["SAC", "PRICE"]);

export const DataCalendario = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "data no formato AAAA-MM-DD");
const NaoNegativo = TextoDecimal.refine((v) => !v.startsWith("-"), "não pode ser negativo");
const Positivo = NaoNegativo.refine((v) => /[1-9]/.test(v), "precisa ser maior que zero");
const Fracao01 = z.number().min(0).max(1);
/** Valorização ou reajuste anual: pode ser negativo, até -90%. */
const TaxaAnual = z.number().min(-0.9).max(10);
const Ticker = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.]{1,12}$/, "ticker como HGLG11 ou O");

export const FinanciamentoImobiliarioEsquema = z.object({
  sistema: SistemaAmortizacaoEsquema,
  valorFinanciado: Positivo,
  /** Juros efetivos ao ano. */
  taxaAnual: z.number().min(0).max(1),
  prazoMeses: z.number().int().min(1).max(600),
  primeiraParcela: DataCalendario,
  /** Seguro sobre o saldo devedor, por mês (fração). */
  seguroTaxaMensalSaldo: z.number().min(0).max(0.1).optional(),
  seguroFixoMensal: NaoNegativo.optional(),
  taxaAdministracaoMensal: NaoNegativo.optional(),
  custosIniciais: NaoNegativo.optional(),
});
export type FinanciamentoImobiliario = z.infer<typeof FinanciamentoImobiliarioEsquema>;

/** Campos que o cadastro aceita; cada tipo usa os seus (veja `problemasDoTipo`). */
const Campos = {
  nome: z.string().trim().min(1, "dê um nome").max(120),
  ticker: Ticker.nullable(),
  observacoes: z.string().max(2000).nullable(),
  /** Imóvel, crowdfunding, consórcio: valor atual do bem ou saldo. FII e REIT: preço por cota. */
  valorAtual: NaoNegativo.nullable(),
  valorAtualEm: DataCalendario.nullable(),
  /** Reais por dólar hoje (REIT). */
  cambioAtual: Positivo.nullable(),
  /** Premissa de valorização anual do imóvel. */
  valorizacaoAnual: TaxaAnual.nullable(),
  aluguelPrevisto: NaoNegativo.nullable(),
  /** Administração do aluguel (fração do aluguel) ou do consórcio (fração da carta). */
  taxaAdministracao: Fracao01.nullable(),
  diaria: NaoNegativo.nullable(),
  ocupacao: Fracao01.nullable(),
  taxaPlataforma: Fracao01.nullable(),
  precoVendaAlvo: NaoNegativo.nullable(),
  prazoMeses: z.number().int().min(1).max(600).nullable(),
  dataEntrega: DataCalendario.nullable(),
  valorCarta: Positivo.nullable(),
  fundoReserva: Fracao01.nullable(),
  contempladoEm: DataCalendario.nullable(),
  financiamento: FinanciamentoImobiliarioEsquema.nullable(),
};

export const NovoLancamentoImobiliarioEsquema = z.object({
  data: DataCalendario,
  tipo: TipoLancamentoImobiliario,
  /** compra, itbi, aluguel, provento, condominio, iptu, venda, parcela, lance… */
  categoria: z.string().trim().toLowerCase().min(1).max(40),
  valor: Positivo,
  /** Cotas compradas (aporte) ou vendidas (resgate). */
  quantidade: Positivo.optional(),
  /** Reais por dólar no dia (obrigatório em REIT). */
  cambio: Positivo.optional(),
  descricao: z.string().max(500).optional(),
});
export type NovoLancamentoImobiliario = z.infer<typeof NovoLancamentoImobiliarioEsquema>;

export const LancamentoImobiliarioEsquema = NovoLancamentoImobiliarioEsquema.extend({
  id: Id,
  investimentoId: Id,
  quantidade: Positivo.nullable(),
  cambio: Positivo.nullable(),
  descricao: z.string().nullable(),
  criadoEm: Instante,
});
export type LancamentoImobiliario = z.infer<typeof LancamentoImobiliarioEsquema>;

type Dados = { [K in keyof typeof Campos]?: z.infer<(typeof Campos)[K]> | undefined } & {
  tipo: TipoImobiliario;
  moeda?: z.infer<typeof MoedaImobiliario> | undefined;
};

/** Regras de cada tipo, com mensagens para a pessoa. */
export function problemasDoTipo(d: Dados): { caminho: string; mensagem: string }[] {
  const p: { caminho: string; mensagem: string }[] = [];
  const cotas = d.tipo === "fii" || d.tipo === "reit";
  if (cotas && !d.ticker) p.push({ caminho: "ticker", mensagem: "informe o ticker (ex.: HGLG11)" });
  if (d.tipo === "reit" && d.moeda !== "USD")
    p.push({ caminho: "moeda", mensagem: "REIT é em dólar: use USD" });
  if (d.tipo !== "reit" && d.moeda === "USD") p.push({ caminho: "moeda", mensagem: "só REIT aceita dólar" });
  if (d.financiamento && !TIPOS_IMOVEL_FISICO.includes(d.tipo)) {
    p.push({ caminho: "financiamento", mensagem: "financiamento só vale para imóvel físico" });
  }
  if (
    d.tipo === "consorcio" &&
    (!d.valorCarta || !d.prazoMeses || d.taxaAdministracao === null || d.taxaAdministracao === undefined)
  ) {
    p.push({
      caminho: "valorCarta",
      mensagem: "consórcio precisa de valor da carta, prazo e taxa de administração",
    });
  }
  if (d.tipo === "temporada" && (!d.diaria || d.ocupacao === null || d.ocupacao === undefined)) {
    p.push({ caminho: "diaria", mensagem: "temporada precisa da diária e da ocupação esperada" });
  }
  return p;
}

function refinar(d: Dados, ctx: z.RefinementCtx): void {
  for (const { caminho, mensagem } of problemasDoTipo(d)) {
    ctx.addIssue({ code: "custom", path: [caminho], message: mensagem });
  }
}

export const NovoInvestimentoImobiliarioEsquema = z
  .object(Campos)
  .partial()
  .extend({
    tipo: TipoImobiliario,
    moeda: MoedaImobiliario.optional(),
    nome: Campos.nome,
    /** Compra, ITBI, entrada… gravados junto com o cadastro. */
    lancamentosIniciais: z.array(NovoLancamentoImobiliarioEsquema).max(30).optional(),
  })
  .superRefine(refinar);
export type NovoInvestimentoImobiliario = z.infer<typeof NovoInvestimentoImobiliarioEsquema>;

/** PATCH: só os campos enviados mudam; `null` limpa. Tipo e moeda não mudam. */
export const MudancaInvestimentoImobiliarioEsquema = z.object(Campos).partial();
export type MudancaInvestimentoImobiliario = z.infer<typeof MudancaInvestimentoImobiliarioEsquema>;

export const InvestimentoImobiliarioEsquema = z.object({
  id: Id,
  tipo: TipoImobiliario,
  moeda: MoedaImobiliario,
  ...Campos,
  criadoEm: Instante,
  atualizadoEm: Instante,
});
export type InvestimentoImobiliario = z.infer<typeof InvestimentoImobiliarioEsquema>;

export const FonteValorAtual = z.enum(["cotacao", "manual", "valorizacao", "custo", "vendido"]);

export const MetricasImobiliarioEsquema = z.object({
  investido: TextoDecimal,
  rendaAcumulada: TextoDecimal,
  despesas: TextoDecimal,
  impostos: TextoDecimal,
  resgatado: TextoDecimal,
  parcelasPagas: TextoDecimal,
  valorAtual: TextoDecimal,
  valorAtualMoeda: TextoDecimal.nullable(),
  fonteValorAtual: FonteValorAtual,
  dividaAtual: TextoDecimal,
  patrimonioLiquido: TextoDecimal,
  resultadoBruto: TextoDecimal,
  resultadoLiquido: TextoDecimal,
  /** TIR anual realizada (fração), das datas dos lançamentos até a data-base. */
  tirAnual: z.number().nullable(),
  renda12Meses: TextoDecimal,
  rendaMensalMedia: TextoDecimal,
  rendaMensalLiquidaMedia: TextoDecimal,
  encerrado: z.boolean(),
  dividendYield: z.number().nullable(),
  cdi: z
    .object({ taxaAnual: z.number(), valorEquivalente: TextoDecimal, diferenca: TextoDecimal })
    .nullable(),
  cotas: z
    .object({
      quantidade: TextoDecimal,
      precoMedio: TextoDecimal.nullable(),
      custoTotal: TextoDecimal,
      resultadoRealizado: TextoDecimal,
    })
    .nullable(),
  financiamento: z
    .object({ parcelasPagas: z.number().int(), jurosPagos: TextoDecimal, saldoDevedor: TextoDecimal })
    .nullable(),
  consorcio: z
    .object({
      parcelaEstimada: TextoDecimal,
      parcelasPagas: z.number().int(),
      parcelasRestantes: z.number().int(),
      lances: TextoDecimal,
      saldoEstimado: TextoDecimal,
      contemplado: z.boolean(),
    })
    .nullable(),
  premissas: z.array(z.string()),
});
export type MetricasImobiliario = z.infer<typeof MetricasImobiliarioEsquema>;

export const ItemImobiliarioEsquema = z.object({
  investimento: InvestimentoImobiliarioEsquema,
  /** null quando os dados não fecham (ex.: venda de mais cotas que a carteira); veja `erroMetricas`. */
  metricas: MetricasImobiliarioEsquema.nullable(),
  erroMetricas: z.string().nullable(),
});
export type ItemImobiliario = z.infer<typeof ItemImobiliarioEsquema>;

export const LinhaAmortizacaoEsquema = z.object({
  mes: z.number().int(),
  vencimento: DataCalendario.nullable(),
  saldoInicial: TextoDecimal,
  juros: TextoDecimal,
  amortizacao: TextoDecimal,
  prestacao: TextoDecimal,
  seguros: TextoDecimal,
  taxaAdministracao: TextoDecimal,
  parcelaTotal: TextoDecimal,
  saldoFinal: TextoDecimal,
});
export const TabelaAmortizacaoEsquema = z.object({
  sistema: SistemaAmortizacaoEsquema,
  taxaMensal: z.number(),
  linhas: z.array(LinhaAmortizacaoEsquema),
  totalJuros: TextoDecimal,
  totalAmortizado: TextoDecimal,
  totalSeguros: TextoDecimal,
  totalTaxas: TextoDecimal,
  totalPago: TextoDecimal,
  primeiraParcela: TextoDecimal,
  ultimaParcela: TextoDecimal,
  cetMensal: z.number().nullable(),
  cetAnual: z.number().nullable(),
});
export type TabelaAmortizacaoDTO = z.infer<typeof TabelaAmortizacaoEsquema>;

export const CotacaoEsquema = z.object({
  ticker: z.string(),
  preco: TextoDecimal,
  moeda: z.string(),
  em: Instante,
  fonte: z.literal("brapi"),
});
export type Cotacao = z.infer<typeof CotacaoEsquema>;
export const CotacoesEsquema = z.object({
  /** false sem BRAPI_TOKEN: a tela usa o preço informado à mão. */
  configurado: z.boolean(),
  cotacoes: z.array(CotacaoEsquema),
  indisponiveis: z.array(z.object({ ticker: z.string(), motivo: z.string() })),
});
export type Cotacoes = z.infer<typeof CotacoesEsquema>;

export const DetalheImobiliarioEsquema = ItemImobiliarioEsquema.extend({
  lancamentos: z.array(LancamentoImobiliarioEsquema),
  tabela: TabelaAmortizacaoEsquema.nullable(),
  cotacao: CotacaoEsquema.nullable(),
});
export type DetalheImobiliario = z.infer<typeof DetalheImobiliarioEsquema>;

export const VisaoImobiliarioEsquema = z.object({
  dataBase: DataCalendario,
  cdiAnual: z.number().nullable(),
  patrimonio: TextoDecimal,
  investido: TextoDecimal,
  rendaMensal: TextoDecimal,
  resultadoLiquido: TextoDecimal,
  quantidade: z.number().int(),
  alocacao: z.array(z.object({ tipo: TipoImobiliario, valor: TextoDecimal, fracao: z.number() })),
  itens: z.array(ItemImobiliarioEsquema),
});
export type VisaoImobiliario = z.infer<typeof VisaoImobiliarioEsquema>;

/** `?dataBase=AAAA-MM-DD&cdiAnual=0.1`: data-base (padrão hoje) e CDI anual da comparação (premissa). */
export const ConsultaImobiliarioEsquema = z.object({
  dataBase: DataCalendario.optional(),
  cdiAnual: z.coerce.number().min(0).max(1).optional(),
});

const FinanciamentoSimuladoEsquema = FinanciamentoImobiliarioEsquema.omit({
  valorFinanciado: true,
  primeiraParcela: true,
  custosIniciais: true,
});

/** `POST /imobiliario/simulacoes/financiamento`: devolve `{ sac, price }` (TabelaAmortizacaoEsquema). */
export const PedidoSimulacaoFinanciamentoEsquema = FinanciamentoImobiliarioEsquema.omit({
  sistema: true,
  primeiraParcela: true,
});

export const PedidoAlugarComprarEsquema = z.object({
  valorImovel: Positivo,
  entrada: NaoNegativo,
  custosCompra: NaoNegativo,
  financiamento: FinanciamentoSimuladoEsquema.optional(),
  aluguelMensal: NaoNegativo,
  reajusteAnual: TaxaAnual,
  custosProprietarioMensais: NaoNegativo,
  valorizacaoAnual: TaxaAnual,
  taxaOportunidadeAnual: TaxaAnual,
  horizonteMeses: z.number().int().min(1).max(600),
  custoVendaFinal: Fracao01.optional(),
});

export const PedidoRentabilidadeEsquema = z.object({
  valorCompra: Positivo,
  custosAquisicao: NaoNegativo,
  reforma: NaoNegativo.optional(),
  entrada: NaoNegativo.optional(),
  financiamento: FinanciamentoSimuladoEsquema.optional(),
  rendaMensal: NaoNegativo,
  vacancia: Fracao01.optional(),
  taxaAdministracao: Fracao01.optional(),
  despesasMensais: NaoNegativo.optional(),
  reajusteAnual: TaxaAnual,
  valorizacaoAnual: TaxaAnual,
  horizonteAnos: z.number().int().min(1).max(50),
  custoVenda: Fracao01.optional(),
  taxaDescontoAnual: TaxaAnual,
});

export const PedidoSimulacaoFiiEsquema = z.object({
  cotas: z.number().int().min(0).max(10_000_000),
  precoCota: Positivo,
  rendimentoMensalPorCota: NaoNegativo,
  meses: z.number().int().min(1).max(600),
  reinvestir: z.boolean().optional(),
  rendaAlvo: NaoNegativo.optional(),
});

export const PedidoGanhoCapitalEsquema = z.object({
  valorVenda: NaoNegativo,
  custosVenda: NaoNegativo.optional(),
  custoAquisicao: NaoNegativo,
  benfeitorias: NaoNegativo.optional(),
  dataAquisicao: DataCalendario,
  dataVenda: DataCalendario,
  aplicarFatoresReducao: z.boolean().optional(),
  /** Declaração: valor aplicado em outro imóvel residencial em até 180 dias. */
  valorReinvestido: NaoNegativo.optional(),
  /** Declaração: único imóvel, sem outra venda de imóvel nos últimos 5 anos. */
  unicoImovel: z.boolean().optional(),
});
