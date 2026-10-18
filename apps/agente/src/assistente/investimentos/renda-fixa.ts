import type { LinhaTitulo, PontoIndicador } from "@zentrade/banco";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  consolidar,
  posicaoDoTitulo,
  premissasDosIndices,
  somarMeses,
  type Indices,
  type Posicao,
  type Titulo,
} from "@zentrade/financas";
import { z } from "zod";
import { definirFerramenta } from "../../ferramentas/index.js";
import {
  cortar,
  hojeNoBrasil,
  json,
  limite,
  quando,
  type ContextoInvestimentos,
  type LeituraInvestimentos,
} from "./comum.js";

const dinheiro = (v: Valor): string => paraTexto(v.toDecimalPlaces(2));
const pct = (v: Valor | null): string | null => (v === null ? null : paraTexto(v.toDecimalPlaces(2)));
const decOpcional = (v: string | null): Valor | null => (v === null ? null : dec(v));
const FONTE_PLUGGY = "Pluggy (informado pela instituição)";

/** Linha do banco → título das contas (o mesmo mapeamento da API, em apps/api/src/rotas/renda-fixa-conversao.ts). */
function paraTitulo(l: LinhaTitulo): Titulo {
  return {
    id: l.id,
    tipo: l.tipo,
    nome: l.nome,
    emissor: l.emissor,
    indexador: l.indexador,
    percentualIndexador: decOpcional(l.percentualIndexador),
    taxaAnual: decOpcional(l.taxaAnual),
    dataAplicacao: l.dataAplicacao,
    vencimento: l.vencimento,
    valorAplicado: dec(l.valorAplicado),
    liquidez: l.liquidez,
    carenciaAte: l.carenciaAte,
    informado: l.informado
      ? {
          em: l.informado.em,
          bruto: dec(l.informado.bruto),
          liquido: decOpcional(l.informado.liquido),
          ir: decOpcional(l.informado.ir),
          iof: decOpcional(l.informado.iof),
          fonte: FONTE_PLUGGY,
        }
      : null,
    grupo: l.grupo,
  };
}

const paraMapa = (pontos: readonly PontoIndicador[], chave: (dia: string) => string = (d) => d) =>
  new Map<string, Valor>(pontos.map((p) => [chave(p.dia), dec(p.valor)]));

/** Índices do BCB desde 13 meses antes da aplicação mais antiga (como a API: as premissas usam o passado recente). */
async function carregarIndices(dados: LeituraInvestimentos, desde: string): Promise<Indices> {
  const inicio = somarMeses(desde, -13);
  const [cdi, selic, ipca, poupanca] = await Promise.all([
    dados.indicador("CDI", inicio),
    dados.indicador("SELIC", inicio),
    dados.indicador("IPCA", inicio),
    dados.indicador("POUPANCA", inicio),
  ]);
  return {
    cdi: paraMapa(cdi),
    selic: paraMapa(selic),
    ipca: paraMapa(ipca, (d) => d.slice(0, 7)),
    poupanca: paraMapa(poupanca),
  };
}

/** Como o título rende, em poucas palavras: "110% do CDI", "IPCA + 6% a.a.", "prefixado 12% a.a.". */
function rendimento(l: LinhaTitulo): string {
  const taxa = l.taxaAnual ? `${l.taxaAnual}% a.a.` : null;
  switch (l.indexador) {
    case "PREFIXADO":
      return `prefixado ${taxa ?? "sem taxa"}`;
    case "IPCA":
      return taxa ? `IPCA + ${taxa}` : "IPCA";
    case "POUPANCA":
      return "regra da poupança";
    default:
      return `${l.percentualIndexador ?? "100"}% do ${l.indexador}${taxa ? ` + ${taxa}` : ""}`;
  }
}

function linhaDoTitulo(l: LinhaTitulo, p: Posicao, fuso: string) {
  const base = {
    id: l.id,
    nome: l.nome,
    tipo: l.tipo,
    emissor: l.emissor,
    origem: l.origem,
    rendimento: rendimento(l),
    aplicadoEm: l.dataAplicacao,
    vencimento: l.vencimento,
    liquidez: l.liquidez,
    ...(l.carenciaAte ? { carenciaAte: l.carenciaAte } : {}),
    aplicado: dinheiro(p.aplicado),
    atualizadoEm: quando(l.atualizadoEm, fuso),
  };
  if (!p.disponivel) return { ...base, indisponivel: p.motivo };
  return {
    ...base,
    fonte: p.fonte === "instituicao" ? "informado pela instituição (Pluggy)" : "calculado pelo ZenTrade",
    posicaoEm: p.ate,
    vencido: p.vencido,
    bruto: dinheiro(p.bruto),
    ir: dinheiro(p.ir),
    iof: dinheiro(p.iof),
    liquido: dinheiro(p.liquido),
    rendimentoLiquido: dinheiro(p.rendimentoLiquido),
    rentabilidadeLiquidaPct: pct(p.rentabilidadeLiquidaPct),
    percentualDoCdi: pct(p.percentualDoCdi),
    ...(p.avisos.length > 0 ? { avisos: p.avisos } : {}),
  };
}

/** O que pesa mais primeiro: valor bruto de hoje ou, sem posição, o aplicado. */
const peso = (p: Posicao): Valor => (p.disponivel ? p.bruto : p.aplicado);

async function lerRendaFixa(ctx: ContextoInvestimentos, dados: LeituraInvestimentos, n: number) {
  const hoje = hojeNoBrasil(ctx.agora());
  const linhas = await dados.titulosRendaFixa(ctx.usuarioId);
  if (linhas.length === 0)
    return { moeda: "BRL", hoje, titulos: [], aviso: "Nenhum título de renda fixa cadastrado ou importado." };
  const desde = linhas.reduce((min, l) => (l.dataAplicacao < min ? l.dataAplicacao : min), hoje);
  const indices = await carregarIndices(dados, desde);
  // Para o mês do IPCA ainda não publicado: o acumulado de 12 meses (dito no aviso do título).
  const ipcaProjetado = premissasDosIndices(indices, hoje).ipcaAnual?.valor;
  const titulos = linhas.map(paraTitulo);
  const opcoes = { hoje, ...(ipcaProjetado ? { ipcaProjetadoAnual: ipcaProjetado } : {}) };
  const posicoes = titulos.map((t) => posicaoDoTitulo(t, indices, opcoes));
  const s = consolidar(titulos, posicoes, hoje);
  const ordem = linhas
    .map((l, i) => ({ l, p: posicoes[i] as Posicao }))
    .sort((a, b) => peso(b.p).comparedTo(peso(a.p)));
  const { itens, omitidos } = cortar(ordem, n);
  return {
    moeda: "BRL",
    hoje,
    totais: {
      quantidade: s.quantidade,
      indisponiveis: s.indisponiveis.length,
      aplicado: dinheiro(s.aplicado),
      bruto: dinheiro(s.bruto),
      ir: dinheiro(s.ir),
      iof: dinheiro(s.iof),
      liquido: dinheiro(s.liquido),
      rendimentoLiquido: dinheiro(s.rendimentoLiquido),
      rentabilidadeLiquidaPct: pct(s.rentabilidadeLiquidaPct),
    },
    proximoVencimento: s.proximoVencimento,
    titulos: itens.map(({ l, p }) => linhaDoTitulo(l, p, ctx.fuso)),
    omitidos,
  };
}

export const rendaFixa = (ctx: ContextoInvestimentos, dados: LeituraInvestimentos) =>
  definirFerramenta({
    nome: "renda_fixa",
    descricao:
      "Títulos de renda fixa da pessoa (CDB, LCI/LCA, Tesouro, poupança, caixinhas…), cadastrados à mão ou " +
      "importados pela Pluggy, com a posição de hoje: aplicado, bruto, IR, IOF, líquido, rendimento, rentabilidade " +
      "e % do CDI, vencimento, liquidez, de onde veio o valor (conta do ZenTrade pelos índices do BCB ou o informado " +
      "pela instituição) e quando o título foi atualizado; mais os totais da carteira. Valores em BRL (R$), " +
      "decimais em texto; percentuais já em %. Os maiores primeiro.",
    entrada: z.object({ limite: limite(15) }),
    rodar: async (e) => json(await lerRendaFixa(ctx, dados, e.limite)),
  });
