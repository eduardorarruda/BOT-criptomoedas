import {
  estrategiaDoDTO,
  type AvaliacaoDecisao,
  type CamposEstrategia,
  type DecisaoDTO,
  type EstadoDecisao,
  type EstrategiaDTO,
  type LeituraCenarioDTO,
  type OrdemDTO,
  type PropostaAgente,
  type ProtecaoCorretoraDTO,
  type RoboConfig,
  type RoboDTO,
} from "@zentrade/contratos";
import { acertou, dec, paraTexto, type Condicao, type Estrategia, type Execucao } from "@zentrade/dominio";
import type {
  avaliacoesDecisao,
  decisoes,
  estrategiaVersoes,
  execucoes,
  ordens,
  protecoesCorretora,
  robos,
} from "./esquema/index.js";

/**
 * Linha do banco ↔ formatos do contrato. O NUMERIC volta do driver com 18 casas
 * ("0.010000000000000000"); para fora sai normalizado ("0.01").
 */
export const decimalTexto = (numeric: string): string => paraTexto(dec(numeric));
export const decimalOpcional = (numeric: string | null): string | undefined =>
  numeric === null ? undefined : decimalTexto(numeric);
/** Frações (stop, taxa, confiança) são `number` no contrato e no domínio. */
export const fracao = (numeric: string): number => Number(decimalTexto(numeric));
export const ms = (data: Date): number => data.getTime();

type LinhaVersao = typeof estrategiaVersoes.$inferSelect;
type LinhaRobo = typeof robos.$inferSelect;
type LinhaDecisao = typeof decisoes.$inferSelect;
type LinhaOrdem = typeof ordens.$inferSelect;
type LinhaExecucao = typeof execucoes.$inferSelect;
type LinhaAvaliacao = typeof avaliacoesDecisao.$inferSelect;

/**
 * O JSONB `regra` da versão: as árvores e, desde as saídas novas, a configuração
 * opcional de stop por ATR, stop móvel, empate, tempo e tamanho. Versões antigas
 * só têm `entrada` e `saida` e continuam lidas como antes.
 */
export type RegraGravada = Omit<CamposEstrategia, "stop" | "alvoLiquido" | "taxa">;

/** Separa o que vai para o JSONB do que tem coluna própria (stop, alvo, taxa). */
export function regraGravada(d: CamposEstrategia): RegraGravada {
  const { stop: _stop, alvoLiquido: _alvo, taxa: _taxa, ...regra } = estrategiaDoDTO(d);
  return regra;
}

export function estrategiaDeLinha(v: LinhaVersao): EstrategiaDTO {
  const regra = estrategiaDoDTO({
    ...(v.regra as RegraGravada),
    stop: fracao(v.stop),
    alvoLiquido: fracao(v.alvoLiquido),
    taxa: fracao(v.taxa),
  });
  return { id: v.estrategiaId, nome: v.nome, versao: v.versao, ...regra };
}

export function estrategiaDominio(v: LinhaVersao): Estrategia {
  return estrategiaDoDTO(estrategiaDeLinha(v));
}

export function roboDeLinha(r: LinhaRobo): RoboDTO {
  return {
    id: r.id,
    nome: r.nome,
    simbolo: r.simbolo,
    intervalo: r.intervalo,
    modo: r.modo,
    rede: r.rede,
    estrategiaId: r.estrategiaId,
    estrategiaVersao: r.estrategiaVersao,
    limites: {
      perdaDiariaMaxima: decimalTexto(r.perdaDiariaMaxima),
      exposicaoMaxima: decimalTexto(r.exposicaoMaxima),
      riscoPorOperacao: decimalTexto(r.riscoPorOperacao),
      ordensPorHoraMax: r.ordensPorHoraMax,
      pausaAposPerdaMin: r.pausaAposPerdaMin,
      confiancaMinima: fracao(r.confiancaMinima),
      diasDeEvento: r.diasDeEvento,
      agente: r.agente,
    },
    pausado: r.pausado,
    criadoEm: ms(r.criadoEm),
  };
}

export function roboConfigDeLinha(r: LinhaRobo, versao: LinhaVersao): RoboConfig {
  return {
    id: r.id,
    usuarioId: r.usuarioId,
    simbolo: r.simbolo,
    intervalo: r.intervalo,
    modo: r.modo,
    rede: r.rede,
    estrategia: estrategiaDominio(versao),
    limites: {
      perdaDiariaMaxima: dec(r.perdaDiariaMaxima),
      exposicaoMaxima: dec(r.exposicaoMaxima),
      ordensPorHoraMax: r.ordensPorHoraMax,
      pausaAposPerdaMs: r.pausaAposPerdaMin * 60_000,
      confiancaMinima: fracao(r.confiancaMinima),
      diasDeEvento: r.diasDeEvento,
      agente: r.agente,
    },
    riscoPorOperacao: dec(r.riscoPorOperacao),
  };
}

interface SinalGravado {
  readonly acao: "COMPRAR" | "VENDER" | "AGUARDAR";
  readonly explicacao: string;
  readonly regime?: LeituraCenarioDTO;
  readonly condicoes?: Condicao;
}

interface RiscoGravado {
  readonly aprovada: boolean;
  readonly barreiras: { codigo: string; mensagem: string }[];
}

/** A avaliação do placar do Claude → contrato (vai em cada item de GET /decisoes). */
export function avaliacaoDeLinha(a: LinhaAvaliacao): AvaliacaoDecisao {
  const concluida = a.situacao === "concluida" && a.resultado !== null;
  return {
    claude: a.claude,
    confianca: fracao(a.confianca),
    fonte: a.fonte,
    situacao: a.situacao,
    ...(a.motivo ? { motivo: a.motivo } : {}),
    ...(a.resultado !== null ? { resultado: decimalTexto(a.resultado) } : {}),
    ...(a.retorno !== null ? { retorno: Number(a.retorno) } : {}),
    barras: a.barras,
    ...(concluida ? { acertou: acertou(a.claude, dec(a.resultado as string)) } : {}),
    moeda: a.moeda,
    avaliadaEm: ms(a.avaliadaEm),
  };
}

export function decisaoDeLinha(
  d: LinhaDecisao,
  ordemId?: string,
  avaliacao?: LinhaAvaliacao | null,
): DecisaoDTO {
  const sinal = d.sinal as SinalGravado;
  const risco = d.risco as RiscoGravado;
  const quantidade = decimalOpcional(d.quantidade);
  const custo = decimalOpcional(d.custoIaUsd);
  return {
    id: d.id,
    roboId: d.roboId,
    em: ms(d.em),
    sinal: { acao: sinal.acao, explicacao: sinal.explicacao },
    ...(sinal.regime ? { regime: sinal.regime } : {}),
    ...(sinal.condicoes ? { condicoes: sinal.condicoes } : {}),
    ...(d.proposta ? { proposta: d.proposta as PropostaAgente } : {}),
    ...(quantidade !== undefined ? { quantidade } : {}),
    preco: decimalTexto(d.preco),
    risco: { aprovada: risco.aprovada, barreiras: risco.barreiras },
    estado: d.estado as EstadoDecisao,
    ...(ordemId ? { ordemId } : {}),
    ...(custo !== undefined ? { custoIaUsd: custo } : {}),
    ...(d.resultado !== null && d.avaliadaEm !== null
      ? { desfecho: { resultado: decimalTexto(d.resultado), avaliadoEm: ms(d.avaliadaEm) } }
      : {}),
    ...(avaliacao ? { avaliacao: avaliacaoDeLinha(avaliacao) } : {}),
  };
}

export function ordemDeLinha(o: LinhaOrdem, execs: readonly LinhaExecucao[]): OrdemDTO {
  return {
    id: o.id,
    decisaoId: o.decisaoId,
    idCliente: o.idCliente,
    simbolo: o.simbolo,
    lado: o.lado,
    quantidade: decimalTexto(o.quantidade),
    estado: o.estado,
    ...(o.motivo ? { motivo: o.motivo } : {}),
    criadaEm: ms(o.criadaEm),
    execucoes: execs.map((e) => ({
      preco: decimalTexto(e.preco),
      quantidade: decimalTexto(e.quantidade),
      taxaCotacao: decimalTexto(e.taxaCotacao),
      em: ms(e.em),
    })),
  };
}

export function execucaoDeLinha(lado: "COMPRA" | "VENDA", e: LinhaExecucao): Execucao {
  return {
    lado,
    preco: dec(e.preco),
    quantidade: dec(e.quantidade),
    taxaCotacao: dec(e.taxaCotacao),
    em: ms(e.em),
  };
}

/** Instante para SQL cru: o driver do Drizzle não serializa Date em parâmetro de `sql\`\``. */
export const iso = (msUtc: number): string => new Date(msUtc).toISOString();

/** A última proteção na corretora, como a tela mostra ("Stop na corretora: ativo a X"). */
export function protecaoCorretoraDTO(l: typeof protecoesCorretora.$inferSelect): ProtecaoCorretoraDTO {
  return {
    estado: l.estado,
    stop: decimalTexto(l.stop),
    limite: decimalTexto(l.limite),
    ...(l.alvo !== null ? { alvo: decimalTexto(l.alvo) } : {}),
    quantidade: decimalTexto(l.quantidade),
    ...(l.motivo !== null ? { motivo: l.motivo } : {}),
    atualizadaEm: ms(l.atualizadaEm),
  };
}
