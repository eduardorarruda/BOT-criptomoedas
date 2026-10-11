import {
  MOEDA_REFERENCIA,
  type Carteira,
  type ClassePatrimonioResumo,
  type ItemImobiliario,
  type Patrimonio,
  type ResumoRendaFixa,
  type VisaoImobiliario,
} from "@zentrade/contratos";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  consolidarPatrimonio,
  converterParaReais,
  situacaoDosItens,
  type ClasseAvaliada,
} from "@zentrade/financas";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import type { CambioReais, ServicoCarteira } from "../integracoes/binance-carteira.js";
import { hojeNoBrasil, visaoImobiliaria } from "./imobiliario-servico.js";
import { resumoDaCarteira } from "./renda-fixa-servico.js";

/**
 * Patrimônio consolidado: lê o que a carteira, a renda fixa e o imobiliário já
 * calculam (as mesmas funções das rotas de cada um) e só soma. Cripto entra pela
 * conta real da Binance, convertida pelo par USDTBRL da mesma tabela de preços; sem
 * esse par, fica em USDT e fora do total. Nada aqui recomenda nada.
 */
export interface ClasseNoPatrimonio extends ClasseAvaliada {
  readonly investido: string | null;
  readonly itens: number;
  readonly atualizadoEm: number | null;
  readonly moedaOrigem: ClassePatrimonioResumo["moedaOrigem"];
  readonly avisos: readonly string[];
}

export interface LogPatrimonio {
  warn(obj: object, msg: string): void;
}

const dinheiro = (v: Valor): string => paraTexto(v.toDecimalPlaces(2));
const fracao = (v: Valor): string => paraTexto(v.toDecimalPlaces(6));
const maisRecente = (instantes: readonly (number | null)[]): number | null =>
  instantes.reduce<number | null>((m, t) => (t !== null && (m === null || t > m) ? t : m), null);
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

const CRIPTO_BASE = {
  classe: "cripto",
  investido: null,
  atualizadoEm: null,
  moedaOrigem: null,
} as const;

/** A conta real da Binance em reais. Testnet não entra: é dinheiro de teste. */
export function avaliarCarteira(c: Carteira, cambio: CambioReais | null): ClasseNoPatrimonio {
  if (!c.sincronizacao) {
    const aviso =
      "Conta real da Binance ainda não sincronizada: sincronize na Carteira para ela entrar no patrimônio.";
    return { ...CRIPTO_BASE, situacao: "indisponivel", valor: null, itens: 0, avisos: [aviso] };
  }
  // Moeda que já foi negociada mas está zerada não é patrimônio.
  const comSaldo = c.moedas.filter((m) => !dec(m.saldo.total).isZero());
  if (c.precosEm === null)
    return {
      ...CRIPTO_BASE,
      situacao: "indisponivel",
      valor: null,
      itens: comSaldo.length,
      avisos: c.avisos,
    };
  const semPreco = comSaldo.filter((m) => m.valorSaldo === null).map((m) => m.ativo);
  const situacao = situacaoDosItens(comSaldo.length, semPreco.length);
  const base = {
    ...CRIPTO_BASE,
    itens: comSaldo.length,
    atualizadoEm: c.precosEm,
    moedaOrigem: { moeda: MOEDA_REFERENCIA, valor: c.resumo.valorConta },
  };
  const avisos =
    semPreco.length > 0 ? [`${semPreco.join(", ")} sem preço em USDT na Binance: fora do valor.`] : [];
  if (!cambio && situacao !== "vazia") {
    const aviso = "Sem cotação USDT/BRL na Binance agora: a cripto aparece só em USDT e fica fora do total.";
    return { ...base, situacao: "indisponivel", valor: null, avisos: [...avisos, aviso] };
  }
  const valor = cambio ? converterParaReais(dec(c.resumo.valorConta), cambio.preco) : dec(0);
  return { ...base, situacao, valor, avisos };
}

/** Valor bruto (antes de IR e IOF), como no extrato do banco; a tela da renda fixa mostra o líquido. */
export function avaliarRendaFixa(r: ResumoRendaFixa): ClasseNoPatrimonio {
  const semValor = r.indisponiveis.length;
  const situacao = situacaoDosItens(r.quantidade, semValor);
  const fora = situacao === "indisponivel";
  return {
    classe: "renda_fixa",
    situacao,
    valor: fora ? null : dec(r.bruto),
    investido: fora ? null : r.aplicado,
    itens: r.quantidade,
    atualizadoEm: maisRecente(r.indicadores.series.map((s) => s.verificadoEm)),
    moedaOrigem: null,
    avisos:
      semValor > 0
        ? [`${plural(semValor, "título", "títulos")} sem índice ou taxa para a conta: fora do valor.`]
        : [],
  };
}

type VisaoParaPatrimonio = Pick<VisaoImobiliario, "patrimonio" | "investido" | "quantidade"> & {
  readonly itens: readonly ItemImobiliario[];
};

/** Patrimônio líquido de cada investimento (valor atual − dívida), como na visão do imobiliário. */
export function avaliarImobiliario(v: VisaoParaPatrimonio): ClasseNoPatrimonio {
  const semValor = v.itens.filter((i) => i.metricas === null);
  const situacao = situacaoDosItens(v.quantidade, semValor.length);
  const fora = situacao === "indisponivel";
  return {
    classe: "imobiliario",
    situacao,
    valor: fora ? null : dec(v.patrimonio),
    investido: fora ? null : v.investido,
    itens: v.quantidade,
    atualizadoEm: maisRecente(v.itens.map((i) => i.investimento.atualizadoEm)),
    moedaOrigem: null,
    avisos: semValor.map(
      (i) => `“${i.investimento.nome}” fora do valor: ${i.erroMetricas ?? "sem métricas"}.`,
    ),
  };
}

export function montarPatrimonio(e: {
  readonly agora: number;
  readonly cambio: CambioReais | null;
  readonly classes: readonly ClasseNoPatrimonio[];
}): Patrimonio {
  const c = consolidarPatrimonio(e.classes);
  return {
    moeda: "BRL",
    total: dinheiro(c.total),
    parcial: c.parcial,
    calculadoEm: e.agora,
    cambio: e.cambio
      ? { par: "USDTBRL", preco: paraTexto(e.cambio.preco), em: e.cambio.em, fonte: "binance" }
      : null,
    classes: e.classes.map((classe, i) => {
      const f = c.fatias[i]?.fracao ?? null;
      return {
        classe: classe.classe,
        situacao: classe.situacao,
        valor: classe.valor === null ? null : dinheiro(classe.valor),
        investido: classe.investido,
        fracao: f === null ? null : fracao(f),
        itens: classe.itens,
        atualizadoEm: classe.atualizadoEm,
        moedaOrigem: classe.moedaOrigem,
        avisos: [...classe.avisos],
      };
    }),
    avisos: c.parcial ? ["O total não inclui tudo: veja o aviso de cada classe."] : [],
  };
}

const CRIPTO_VAZIA: ClasseNoPatrimonio = {
  ...CRIPTO_BASE,
  situacao: "vazia",
  valor: dec(0),
  itens: 0,
  avisos: [],
};

/** Cripto: só a conta real. Falha da Binance não derruba o patrimônio; vira aviso (e registro). */
async function cripto(
  deps: Pick<Dependencias, "banco">,
  servico: ServicoCarteira,
  usuarioId: string,
  log: LogPatrimonio,
): Promise<{ classe: ClasseNoPatrimonio; cambio: CambioReais | null }> {
  const redes = new Set((await deps.banco.contas.listar(usuarioId)).map((c) => c.rede));
  if (!redes.has("real")) {
    const avisos = redes.has("testnet")
      ? ["Só há conta de testnet na Binance: saldo de teste não é dinheiro e fica fora do patrimônio."]
      : [];
    return { classe: { ...CRIPTO_VAZIA, avisos }, cambio: null };
  }
  try {
    const carteira = await servico.carteira(usuarioId, "real");
    const cambio = await servico.cambioReais(usuarioId, "real");
    return { classe: avaliarCarteira(carteira, cambio), cambio };
  } catch (erro) {
    log.warn({ err: erro, usuarioId }, "carteira fora do patrimônio");
    const motivo = erro instanceof ErroApi ? erro.message : "falha ao ler a carteira";
    const aviso = `A carteira da Binance não pôde ser lida agora (${motivo}).`;
    return {
      classe: { ...CRIPTO_VAZIA, situacao: "indisponivel", valor: null, avisos: [aviso] },
      cambio: null,
    };
  }
}

export async function patrimonioDe(
  deps: Dependencias,
  servico: ServicoCarteira,
  usuarioId: string,
  log: LogPatrimonio,
): Promise<Patrimonio> {
  const opcoesImobiliario = { dataBase: hojeNoBrasil(deps.agora()), cdiAnual: null };
  const [c, rendaFixa, imobiliario] = await Promise.all([
    cripto(deps, servico, usuarioId, log),
    resumoDaCarteira(deps, usuarioId),
    visaoImobiliaria(deps, usuarioId, opcoesImobiliario),
  ]);
  return montarPatrimonio({
    agora: deps.agora(),
    cambio: c.cambio,
    classes: [c.classe, avaliarRendaFixa(rendaFixa), avaliarImobiliario(imobiliario)],
  });
}
