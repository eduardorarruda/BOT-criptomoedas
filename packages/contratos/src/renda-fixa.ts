import { z } from "zod";
import { Id, Instante, TextoDecimal } from "./comum.js";
import { INDEXADORES, LIQUIDEZES, ORIGENS_TITULO, TIPOS_TITULO } from "./valores.js";

export { INDEXADORES, LIQUIDEZES, ORIGENS_TITULO, TIPOS_TITULO };

/**
 * Renda fixa e investimento passivo (`/api/v1/renda-fixa/*` e `/api/v1/pluggy/*`).
 * Dinheiro e taxas em texto decimal; taxas em % ("110" = 110% do CDI, "6.5" = 6,5%
 * ao ano); datas de calendário em "AAAA-MM-DD"; instantes em ms UTC.
 */

export const TipoTitulo = z.enum(TIPOS_TITULO);
export type TipoTitulo = z.infer<typeof TipoTitulo>;

export const Indexador = z.enum(INDEXADORES);
export type Indexador = z.infer<typeof Indexador>;

export const Liquidez = z.enum(LIQUIDEZES);
export type Liquidez = z.infer<typeof Liquidez>;

export const SERIES_INDICADOR = ["CDI", "SELIC", "SELIC_META", "IPCA", "POUPANCA", "TR"] as const;
export const SerieIndicador = z.enum(SERIES_INDICADOR);
export type SerieIndicador = z.infer<typeof SerieIndicador>;

export const Dia = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "data no formato AAAA-MM-DD, ex.: 2026-10-13");
const Percentual = TextoDecimal.refine((v) => Number(v) >= -100 && Number(v) <= 1000, {
  error: "percentual fora do razoável (entre -100 e 1000)",
});
const ValorPositivo = TextoDecimal.refine((v) => Number(v) > 0 && Number(v) < 1e13, {
  error: "o valor precisa ser maior que zero",
});

// ---------- Cadastro manual ----------

const CamposTitulo = z.object({
  tipo: TipoTitulo,
  nome: z.string().trim().min(1, "dê um nome ao título").max(120),
  emissor: z.string().trim().max(120).nullable().optional(),
  indexador: Indexador,
  percentualIndexador: Percentual.nullable().optional(),
  taxaAnual: Percentual.nullable().optional(),
  dataAplicacao: Dia,
  vencimento: Dia.nullable().optional(),
  valorAplicado: ValorPositivo,
  liquidez: Liquidez,
  carenciaAte: Dia.nullable().optional(),
});

type CamposTitulo = z.infer<typeof CamposTitulo>;

function conferirTitulo(
  t: { readonly [K in keyof CamposTitulo]?: CamposTitulo[K] | undefined },
  ctx: z.core.$RefinementCtx,
): void {
  const precisaTaxa = t.indexador === "PREFIXADO" || t.indexador === "IPCA";
  if (precisaTaxa && (t.taxaAnual === undefined || t.taxaAnual === null)) {
    ctx.addIssue({
      code: "custom",
      path: ["taxaAnual"],
      message: "informe a taxa anual (% ao ano) do título",
    });
  }
  if (t.vencimento && t.dataAplicacao && t.vencimento <= t.dataAplicacao) {
    ctx.addIssue({
      code: "custom",
      path: ["vencimento"],
      message: "o vencimento precisa ser depois da aplicação",
    });
  }
  if (t.liquidez === "carencia" && !t.carenciaAte) {
    ctx.addIssue({ code: "custom", path: ["carenciaAte"], message: "informe até quando vai a carência" });
  }
}

export const NovoTituloEsquema = CamposTitulo.superRefine(conferirTitulo);
export type NovoTitulo = z.infer<typeof NovoTituloEsquema>;

export const MudancaTituloEsquema = CamposTitulo.partial().superRefine(conferirTitulo);
export type MudancaTitulo = z.infer<typeof MudancaTituloEsquema>;

// ---------- Posição, título e projeção ----------

export const PosicaoTituloEsquema = z.discriminatedUnion("disponivel", [
  z.object({
    disponivel: z.literal(true),
    fonte: z.enum(["indices", "instituicao"]),
    ate: Dia,
    vencido: z.boolean(),
    aplicado: TextoDecimal,
    bruto: TextoDecimal,
    iof: TextoDecimal,
    ir: TextoDecimal,
    liquido: TextoDecimal,
    rendimentoBruto: TextoDecimal,
    rendimentoLiquido: TextoDecimal,
    rentabilidadeBrutaPct: TextoDecimal,
    rentabilidadeLiquidaPct: TextoDecimal,
    aliquotaIrPct: TextoDecimal,
    aliquotaIofPct: TextoDecimal,
    isentoIr: z.boolean(),
    diasCorridos: z.number().int(),
    diasUteis: z.number().int(),
    cdiPeriodoPct: TextoDecimal.nullable(),
    percentualDoCdi: TextoDecimal.nullable(),
    poupancaPeriodoPct: TextoDecimal.nullable(),
    avisos: z.array(z.string()),
  }),
  z.object({ disponivel: z.literal(false), aplicado: TextoDecimal, motivo: z.string() }),
]);
export type PosicaoTitulo = z.infer<typeof PosicaoTituloEsquema>;

export const InformadoEsquema = z.object({
  em: Dia,
  bruto: TextoDecimal,
  liquido: TextoDecimal.nullable(),
  ir: TextoDecimal.nullable(),
  iof: TextoDecimal.nullable(),
  fonte: z.string(),
});

export const TituloRendaFixaEsquema = z.object({
  id: Id,
  origem: z.enum(ORIGENS_TITULO),
  itemId: z.string().nullable(),
  grupo: z.string().nullable(),
  tipo: TipoTitulo,
  nome: z.string(),
  emissor: z.string().nullable(),
  indexador: Indexador,
  percentualIndexador: TextoDecimal.nullable(),
  taxaAnual: TextoDecimal.nullable(),
  dataAplicacao: Dia,
  vencimento: Dia.nullable(),
  valorAplicado: TextoDecimal,
  liquidez: Liquidez,
  carenciaAte: Dia.nullable(),
  informado: InformadoEsquema.nullable(),
  atualizadoEm: Instante,
  posicao: PosicaoTituloEsquema,
});
export type TituloRendaFixa = z.infer<typeof TituloRendaFixaEsquema>;

export const PontoProjecaoEsquema = z.object({
  dia: Dia,
  bruto: TextoDecimal,
  iof: TextoDecimal,
  ir: TextoDecimal,
  liquido: TextoDecimal,
  aliquotaIrPct: TextoDecimal,
});

export const ProjecaoEsquema = z.discriminatedUnion("disponivel", [
  z.object({
    disponivel: z.literal(true),
    fim: Dia,
    pontos: z.array(PontoProjecaoEsquema),
    premissas: z.array(z.string()),
  }),
  z.object({ disponivel: z.literal(false), motivo: z.string() }),
]);
export type ProjecaoTitulo = z.infer<typeof ProjecaoEsquema>;

export const TituloDetalheEsquema = TituloRendaFixaEsquema.extend({ projecao: ProjecaoEsquema });
export type TituloDetalhe = z.infer<typeof TituloDetalheEsquema>;

/** `GET /renda-fixa/titulos/:id?cdi=&selic=&ipca=`: premissas informadas pela pessoa (% ao ano). */
export const PremissasConsultaEsquema = z.object({
  cdi: Percentual.optional(),
  selic: Percentual.optional(),
  ipca: Percentual.optional(),
  horizonteMeses: z.coerce.number().int().min(1).max(480).optional(),
});

// ---------- Indicadores e regras ----------

export const IndicadorEsquema = z.object({
  serie: SerieIndicador,
  codigoSgs: z.number().int(),
  nome: z.string(),
  unidade: z.string(),
  ultimoDia: Dia.nullable(),
  ultimoValor: TextoDecimal.nullable(),
  /** CDI e Selic: a taxa do dia levada a % ao ano (base 252). IPCA: acumulado de 12 meses. */
  anualizado: TextoDecimal.nullable(),
  verificadoEm: Instante.nullable(),
  erro: z.string().nullable(),
});
export type Indicador = z.infer<typeof IndicadorEsquema>;

export const IndicadoresEsquema = z.object({ fonte: z.string(), series: z.array(IndicadorEsquema) });
export type Indicadores = z.infer<typeof IndicadoresEsquema>;

export const RegrasTributariasEsquema = z.object({
  verificadoEm: Dia,
  ir: z.object({
    fonte: z.string(),
    vigenteDesde: Dia,
    faixas: z.array(z.object({ ateDias: z.number().int().nullable(), aliquotaPct: TextoDecimal })),
  }),
  iof: z.object({ fonte: z.string(), percentuais: z.array(z.number()) }),
  isencoes: z.array(
    z.object({ tipo: TipoTitulo, isentoIr: z.boolean(), isentoIof: z.boolean(), base: z.string() }),
  ),
  notas: z.array(z.string()),
  feriados: z.object({ fonte: z.string(), verificadoEm: Dia }),
});
export type RegrasTributariasDTO = z.infer<typeof RegrasTributariasEsquema>;

// ---------- Resumo da carteira ----------

const AlocacaoEsquema = z.object({ chave: z.string(), bruto: TextoDecimal, fracao: TextoDecimal });

export const ResumoRendaFixaEsquema = z.object({
  hoje: Dia,
  quantidade: z.number().int(),
  indisponiveis: z.array(Id),
  aplicado: TextoDecimal,
  bruto: TextoDecimal,
  iof: TextoDecimal,
  ir: TextoDecimal,
  liquido: TextoDecimal,
  rendimentoBruto: TextoDecimal,
  rendimentoLiquido: TextoDecimal,
  rentabilidadeBrutaPct: TextoDecimal,
  rentabilidadeLiquidaPct: TextoDecimal,
  /** Rendimento bruto estimado desde o 1º dia do mês; `null` se faltar índice para algum título. */
  rendimentoMes: TextoDecimal.nullable(),
  porTipo: z.array(AlocacaoEsquema),
  porIndexador: z.array(AlocacaoEsquema),
  proximoVencimento: z.object({ tituloId: Id, nome: z.string(), dia: Dia }).nullable(),
  vencimentos: z.array(
    z.object({ tituloId: Id, nome: z.string(), dia: Dia, diasCorridos: z.number().int() }),
  ),
  indicadores: IndicadoresEsquema,
});
export type ResumoRendaFixa = z.infer<typeof ResumoRendaFixaEsquema>;

// ---------- Simuladores ----------

const Prazo = z.number().int().min(1, "o prazo mínimo é 1 dia").max(14_600, "o prazo máximo é 40 anos");

export const SimularIsentoEsquema = z.object({
  direcao: z.enum(["isento_para_tributado", "tributado_para_isento"]),
  percentualCdi: Percentual,
  prazoDias: Prazo,
  cdiAnual: Percentual,
});
export const ResultadoIsentoEsquema = z.object({
  aliquotaIrPct: TextoDecimal,
  equivalente: TextoDecimal,
  regraDeBolso: TextoDecimal,
  curva: z.array(
    z.object({ prazoDias: z.number().int(), equivalente: TextoDecimal, aliquotaIrPct: TextoDecimal }),
  ),
  premissas: z.array(z.string()),
});

export const SimularSelicCdbPoupancaEsquema = z.object({
  valor: ValorPositivo,
  prazoDias: Prazo,
  selicAnual: Percentual,
  cdiAnual: Percentual,
  percentualCdb: Percentual,
  metaSelicAnual: Percentual,
  trMensal: Percentual,
});
const AlternativaEsquema = z.object({
  bruto: TextoDecimal,
  iof: TextoDecimal,
  ir: TextoDecimal,
  custodia: TextoDecimal,
  liquido: TextoDecimal,
  aliquotaIrPct: TextoDecimal,
  rentabilidadeLiquidaPct: TextoDecimal,
});
export const ResultadoSelicCdbPoupancaEsquema = z.object({
  tesouroSelic: AlternativaEsquema,
  cdb: AlternativaEsquema,
  poupanca: AlternativaEsquema,
  serie: z.array(
    z.object({ dia: Dia, tesouroSelic: TextoDecimal, cdb: TextoDecimal, poupanca: TextoDecimal }),
  ),
  premissas: z.array(z.string()),
});

export const SimularPreIpcaEsquema = z.object({
  valor: ValorPositivo,
  prazoDias: Prazo,
  taxaPre: Percentual,
  taxaReal: Percentual,
  ipcaEsperado: Percentual,
});
export const ResultadoPreIpcaEsquema = z.object({
  inflacaoEquilibrio: TextoDecimal,
  prefixado: AlternativaEsquema,
  ipcaMais: AlternativaEsquema,
  curva: z.array(z.object({ ipca: TextoDecimal, prefixado: TextoDecimal, ipcaMais: TextoDecimal })),
  premissas: z.array(z.string()),
});
export type ResultadoIsento = z.infer<typeof ResultadoIsentoEsquema>;
export type ResultadoSelicCdbPoupanca = z.infer<typeof ResultadoSelicCdbPoupancaEsquema>;
export type ResultadoPreIpca = z.infer<typeof ResultadoPreIpcaEsquema>;
export type SimularIsento = z.infer<typeof SimularIsentoEsquema>;
export type SimularSelicCdbPoupanca = z.infer<typeof SimularSelicCdbPoupancaEsquema>;
export type SimularPreIpca = z.infer<typeof SimularPreIpcaEsquema>;

// ---------- Pluggy ----------

export const ItemPluggyEsquema = z.object({
  id: z.string(),
  instituicao: z.string(),
  logoUrl: z.url({ protocol: /^https$/ }).nullable(),
  situacao: z.string(),
  erro: z.string().nullable(),
  atualizadoNoBanco: Instante.nullable(),
  consentimentoExpira: Instante.nullable(),
  ultimaSincronizacao: Instante.nullable(),
  erroSincronizacao: z.string().nullable(),
  titulos: z.number().int(),
  criadoEm: Instante,
});
export type ItemPluggy = z.infer<typeof ItemPluggyEsquema>;

export const EstadoPluggyEsquema = z.object({
  /** PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET definidos na instalação. */
  configurada: z.boolean(),
  itens: z.array(ItemPluggyEsquema),
});
export type EstadoPluggy = z.infer<typeof EstadoPluggyEsquema>;

export const PedidoConnectTokenEsquema = z.object({ itemId: z.uuid().optional() });
export const ConnectTokenEsquema = z.object({ accessToken: z.string().min(1) });
export const RegistrarItemEsquema = z.object({ itemId: z.uuid("o Item ID da Pluggy é um UUID") });

export const ResultadoSincronizacaoEsquema = z.object({
  item: ItemPluggyEsquema,
  novos: z.number().int(),
  atualizados: z.number().int(),
  encerrados: z.number().int(),
  ignorados: z.number().int(),
});
export type ResultadoSincronizacao = z.infer<typeof ResultadoSincronizacaoEsquema>;
