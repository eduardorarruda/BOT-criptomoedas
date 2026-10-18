import {
  MOEDA_REFERENCIA,
  RedeContaEsquema,
  type MoedaCarteira,
  type RedeConta,
  type ResumoCarteira,
} from "@zentrade/contratos";
import { calcularCarteira, precosUsdtDaTabela } from "@zentrade/corretora";
import { dec, paraTexto } from "@zentrade/dominio";
import { z } from "zod";
import { definirFerramenta } from "../../ferramentas/index.js";
import {
  cortar,
  fracaoEmPct,
  json,
  limite,
  quando,
  type ContextoInvestimentos,
  type LeituraInvestimentos,
} from "./comum.js";

/** Preço de referência vale por até 1 h: candle mais velho que isso não diz o preço de agora. */
const VALIDADE_PRECO_MS = 60 * 60_000;
const FONTE_PRECOS =
  "último candle de 1 minuto gravado pelo ZenTrade (até 1 h); a tela Carteira usa a cotação ao vivo da Binance e pode diferir um pouco";
const SEM_CONTA = "Nenhuma conta da Binance cadastrada. A pessoa conecta a conta na tela Carteira.";
const NAO_SINCRONIZADA =
  "Conta ainda não sincronizada: os números aparecem depois de “Sincronizar agora” na tela Carteira.";

const semPrecoRecente = (ativos: readonly string[]): string =>
  `Sem preço recente para ${ativos.join(", ")}: valor atual e resultado não realizado ficam desconhecidos ` +
  "e fora do valor da conta.";

/** Real primeiro quando houver, como na tela: é a carteira que importa. */
const redePadrao = (redes: readonly RedeConta[]): RedeConta => (redes.includes("real") ? "real" : "testnet");

/** Pares em USDT (direto ou invertido) de cada moeda, para a tabela de preços. */
const paresDe = (ativos: readonly string[]): string[] =>
  ativos
    .filter((a) => a !== MOEDA_REFERENCIA)
    .flatMap((a) => [`${a}${MOEDA_REFERENCIA}`, `${MOEDA_REFERENCIA}${a}`]);

async function precosDeReferencia(dados: LeituraInvestimentos, ativos: readonly string[], agora: number) {
  const ultimos = await dados.ultimosPrecos(paresDe(ativos), agora - VALIDADE_PRECO_MS);
  const tabela = new Map([...ultimos].map(([simbolo, u]) => [simbolo, dec(u.preco)]));
  const instantes = [...ultimos.values()].map((u) => u.em);
  return {
    precos: precosUsdtDaTabela(tabela, ativos),
    maisAntigo: instantes.length > 0 ? Math.min(...instantes) : null,
  };
}

/** Soma de dois decimais em texto; desconhecido se um deles for. */
const somar = (a: string, b: string | null): string | null => (b === null ? null : paraTexto(dec(a).plus(b)));

function moeda(m: MoedaCarteira) {
  const t = m.total;
  return {
    ativo: m.ativo,
    saldo: m.saldo.total,
    preco: m.preco,
    valorAtual: m.valorSaldo,
    alocacaoPct: fracaoEmPct(m.alocacao),
    investido: t.custoComprado,
    quantidadeComprada: t.quantidadeComprada,
    quantidadeVendida: t.quantidadeVendida,
    valorVendido: t.valorVendido,
    precoMedio: t.precoMedio,
    custoPosicao: t.custoPosicao,
    resultadoRealizadoBruto: t.resultadoRealizadoBruto,
    resultadoRealizadoLiquido: t.resultadoRealizadoLiquido,
    resultadoNaoRealizado: t.resultadoNaoRealizado,
    resultadoBruto: somar(t.resultadoRealizadoBruto, t.resultadoNaoRealizado),
    resultadoLiquido: t.resultadoLiquido,
    taxas: t.taxas,
    retornoPct: fracaoEmPct(t.retorno),
    ...(m.avisos.length > 0 ? { avisos: m.avisos } : {}),
  };
}

function resumo(r: ResumoCarteira) {
  const { retorno, ...total } = r.total;
  return {
    valorConta: r.valorConta,
    caixa: r.caixa,
    valorSemCusto: r.valorSemCusto,
    ...total,
    retornoPct: fracaoEmPct(retorno),
  };
}

/** A carteira da rede, calculada como na API, com os preços de referência dos candles. */
async function calcular(ctx: ContextoInvestimentos, dados: LeituraInvestimentos, rede: RedeConta) {
  const [saldos, negociacoes, sincronizacao] = await Promise.all([
    dados.saldosCarteira(ctx.usuarioId, rede),
    dados.negociacoesCarteira(ctx.usuarioId, rede),
    dados.sincronizacaoCarteira(ctx.usuarioId, rede),
  ]);
  const ativos = [
    ...new Set([
      ...saldos.map((s) => s.ativo),
      ...negociacoes.flatMap((n) => [n.base, n.cotacao, n.ativoTaxa]),
    ]),
  ];
  const p = await precosDeReferencia(dados, ativos, ctx.agora());
  const r = calcularCarteira({
    negociacoes,
    saldos: new Map(saldos.map((s) => [s.ativo, s])),
    precos: p.precos,
  });
  return { r, p, sincronizacao };
}

async function lerCarteira(
  ctx: ContextoInvestimentos,
  dados: LeituraInvestimentos,
  e: { rede?: RedeConta | undefined; ativo?: string | undefined; limite: number },
) {
  const redes = await dados.redesCarteira(ctx.usuarioId);
  if (redes.length === 0) return { conectada: false, aviso: SEM_CONTA };
  const rede = e.rede ?? redePadrao(redes);
  if (!redes.includes(rede))
    return { conectada: false, redes, aviso: `Sem conta da Binance na rede ${rede} para esta pessoa.` };
  const { r, p, sincronizacao } = await calcular(ctx, dados, rede);
  const todas = r.moedas.filter((m) => !m.referencia && (!e.ativo || m.ativo === e.ativo));
  const { itens, omitidos } = cortar(todas, e.limite);
  // O aviso do cálculo fala da Binance; aqui o preço vem dos candles gravados.
  const semPreco = todas.filter((m) => m.preco === null).map((m) => m.ativo);
  const avisos = [
    ...(sincronizacao ? [] : [NAO_SINCRONIZADA]),
    ...(e.ativo && todas.length === 0 ? [`A moeda ${e.ativo} não aparece nesta carteira.`] : []),
    ...(semPreco.length > 0 ? [semPrecoRecente(semPreco)] : []),
  ];
  return {
    moeda: MOEDA_REFERENCIA,
    conectada: true,
    rede,
    redes,
    sincronizacao: sincronizacao
      ? { em: quando(sincronizacao.em, ctx.fuso), ok: sincronizacao.ok, erro: sincronizacao.erro }
      : null,
    precos: {
      fonte: FONTE_PRECOS,
      maisAntigoEm: p.maisAntigo === null ? null : quando(p.maisAntigo, ctx.fuso),
    },
    resumo: resumo(r.resumo),
    moedas: itens.map(moeda),
    omitidas: omitidos,
    avisos,
  };
}

export const carteiraCripto = (ctx: ContextoInvestimentos, dados: LeituraInvestimentos) =>
  definirFerramenta({
    nome: "carteira_cripto",
    descricao:
      "Carteira de cripto da pessoa na Binance, pelo que foi sincronizado (com a data da sincronização). Por moeda: " +
      "saldo, preço, valor atual, quanto investiu (custo das compras), quantidade comprada e vendida, preço médio, " +
      "resultado realizado e não realizado, bruto e líquido, taxas e retorno; e o resumo da conta (valor total, caixa " +
      "em USDT). Valores em USDT, decimais em texto; null = não dá para saber. O preço é o último candle de 1 minuto " +
      "gravado pelo ZenTrade (até 1 h). Por padrão, a rede real; filtre por moeda (ex.: BTC) se quiser.",
    entrada: z.object({
      rede: RedeContaEsquema.optional(),
      ativo: z
        .string()
        .regex(/^[A-Z0-9]{1,20}$/, "moeda em maiúsculas, ex.: BTC")
        .optional(),
      limite: limite(15),
    }),
    rodar: async (e) => json(await lerCarteira(ctx, dados, e)),
  });
