import type {
  FinanciamentoImobiliario,
  InvestimentoImobiliario,
  LancamentoImobiliario,
  MudancaInvestimentoImobiliario,
  NovoLancamentoImobiliario,
} from "@zentrade/contratos";
import { decimalOpcional, decimalTexto, fracao, ms } from "../conversao.js";
import type {
  financiamentosImobiliarios,
  investimentosImobiliarios,
  lancamentosImobiliarios,
} from "../esquema/index.js";

/** Linhas do imobiliário ↔ formatos de @zentrade/contratos (decimais normalizados, frações em number). */
type LinhaInvestimento = typeof investimentosImobiliarios.$inferSelect;
type LinhaFinanciamento = typeof financiamentosImobiliarios.$inferSelect;
type LinhaLancamento = typeof lancamentosImobiliarios.$inferSelect;
type ColunasInvestimento = Partial<typeof investimentosImobiliarios.$inferInsert>;
type ColunasFinanciamento = Omit<
  typeof financiamentosImobiliarios.$inferInsert,
  "investimentoId" | "usuarioId"
>;

const texto = (v: string | null): string | null => decimalOpcional(v) ?? null;
const numero = (v: string | null): number | null => (v === null ? null : fracao(v));

export function financiamentoDeLinha(f: LinhaFinanciamento): FinanciamentoImobiliario {
  const opcionais = {
    seguroTaxaMensalSaldo: f.seguroTaxaMensalSaldo === null ? undefined : fracao(f.seguroTaxaMensalSaldo),
    seguroFixoMensal: decimalOpcional(f.seguroFixoMensal),
    taxaAdministracaoMensal: decimalOpcional(f.taxaAdministracaoMensal),
    custosIniciais: decimalOpcional(f.custosIniciais),
  };
  return {
    sistema: f.sistema,
    valorFinanciado: decimalTexto(f.valorFinanciado),
    taxaAnual: fracao(f.taxaAnual),
    prazoMeses: f.prazoMeses,
    primeiraParcela: f.primeiraParcela,
    ...Object.fromEntries(Object.entries(opcionais).filter(([, v]) => v !== undefined)),
  };
}

export function investimentoDeLinha(
  i: LinhaInvestimento,
  f: LinhaFinanciamento | null | undefined,
): InvestimentoImobiliario {
  return {
    id: i.id,
    tipo: i.tipo,
    moeda: i.moeda,
    nome: i.nome,
    ticker: i.ticker,
    observacoes: i.observacoes,
    valorAtual: texto(i.valorAtual),
    valorAtualEm: i.valorAtualEm,
    cambioAtual: texto(i.cambioAtual),
    valorizacaoAnual: numero(i.valorizacaoAnual),
    aluguelPrevisto: texto(i.aluguelPrevisto),
    taxaAdministracao: numero(i.taxaAdministracao),
    diaria: texto(i.diaria),
    ocupacao: numero(i.ocupacao),
    taxaPlataforma: numero(i.taxaPlataforma),
    precoVendaAlvo: texto(i.precoVendaAlvo),
    prazoMeses: i.prazoMeses,
    dataEntrega: i.dataEntrega,
    valorCarta: texto(i.valorCarta),
    fundoReserva: numero(i.fundoReserva),
    contempladoEm: i.contempladoEm,
    financiamento: f ? financiamentoDeLinha(f) : null,
    criadoEm: ms(i.criadoEm),
    atualizadoEm: ms(i.atualizadoEm),
  };
}

export function lancamentoDeLinha(l: LinhaLancamento): LancamentoImobiliario {
  return {
    id: l.id,
    investimentoId: l.investimentoId,
    data: l.data,
    tipo: l.tipo,
    categoria: l.categoria,
    valor: decimalTexto(l.valor),
    quantidade: texto(l.quantidade),
    cambio: texto(l.cambio),
    descricao: l.descricao,
    criadoEm: ms(l.criadoEm),
  };
}

const fracaoTexto = (v: number | null | undefined): string | null | undefined =>
  v === undefined ? undefined : v === null ? null : String(v);

/** Campos enviados → colunas. `undefined` não mexe; `null` limpa. */
export function colunasDoInvestimento(d: MudancaInvestimentoImobiliario): ColunasInvestimento {
  const colunas: Record<string, unknown> = {
    nome: d.nome,
    ticker: d.ticker,
    observacoes: d.observacoes,
    valorAtual: d.valorAtual,
    valorAtualEm: d.valorAtualEm,
    cambioAtual: d.cambioAtual,
    valorizacaoAnual: fracaoTexto(d.valorizacaoAnual),
    aluguelPrevisto: d.aluguelPrevisto,
    taxaAdministracao: fracaoTexto(d.taxaAdministracao),
    diaria: d.diaria,
    ocupacao: fracaoTexto(d.ocupacao),
    taxaPlataforma: fracaoTexto(d.taxaPlataforma),
    precoVendaAlvo: d.precoVendaAlvo,
    prazoMeses: d.prazoMeses,
    dataEntrega: d.dataEntrega,
    valorCarta: d.valorCarta,
    fundoReserva: fracaoTexto(d.fundoReserva),
    contempladoEm: d.contempladoEm,
  };
  return Object.fromEntries(
    Object.entries(colunas).filter(([, v]) => v !== undefined),
  ) as ColunasInvestimento;
}

export function colunasDoFinanciamento(f: FinanciamentoImobiliario): ColunasFinanciamento {
  return {
    sistema: f.sistema,
    valorFinanciado: f.valorFinanciado,
    taxaAnual: String(f.taxaAnual),
    prazoMeses: f.prazoMeses,
    primeiraParcela: f.primeiraParcela,
    seguroTaxaMensalSaldo: fracaoTexto(f.seguroTaxaMensalSaldo) ?? null,
    seguroFixoMensal: f.seguroFixoMensal ?? null,
    taxaAdministracaoMensal: f.taxaAdministracaoMensal ?? null,
    custosIniciais: f.custosIniciais ?? null,
  };
}

export function colunasDoLancamento(l: NovoLancamentoImobiliario) {
  return {
    data: l.data,
    tipo: l.tipo,
    categoria: l.categoria,
    valor: l.valor,
    quantidade: l.quantidade ?? null,
    cambio: l.cambio ?? null,
    descricao: l.descricao ?? null,
  };
}
