import {
  paraTexto,
  PRECISAO_META,
  resumoDoPlacar,
  type GrupoPlacar,
  type MetricasPlacar,
  type Placar,
  type Valor,
} from "@zentrade/dominio";
import { z } from "zod";
import { Fracao, Id, Instante, TextoDecimal } from "./comum.js";

/**
 * O placar do Claude na API (GET /decisoes/placar) e a avaliação de cada decisão
 * (no item de GET /decisoes). As contas moram no domínio (placar/metricas.ts); aqui o
 * dinheiro vira texto decimal, como em todo o contrato.
 */

export const MOTIVOS_DESFECHO = ["stop", "alvo", "regra", "tempo", "zeragem", "horizonte"] as const;
export const MotivoDesfechoEsquema = z.enum(MOTIVOS_DESFECHO);

/** A avaliação de uma entrada que passou pelo Claude. */
export const AvaliacaoDecisaoEsquema = z.object({
  claude: z.enum(["aprovou", "vetou"]),
  confianca: Fracao,
  /** `real`: a posição executada fechou; `contrafactual`: a simulação da entrada. */
  fonte: z.enum(["real", "contrafactual"]),
  situacao: z.enum(["concluida", "pendente"]),
  /** Só no contrafactual concluído. */
  motivo: MotivoDesfechoEsquema.optional(),
  resultado: TextoDecimal.optional(),
  retorno: z.number().optional(),
  barras: z.number().int().nonnegative().optional(),
  /** Aprovação certa = resultado > 0; veto certo = contrafactual ≤ 0. Só quando concluída. */
  acertou: z.boolean().optional(),
  moeda: z.string().min(1).max(12),
  avaliadaEm: Instante,
});
export type AvaliacaoDecisao = z.infer<typeof AvaliacaoDecisaoEsquema>;

const IntervaloEsquema = z.object({ inferior: Fracao, superior: Fracao });

const ProporcaoEsquema = z.object({
  acertos: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  taxa: Fracao.nullable(),
  intervalo: IntervaloEsquema.nullable(),
});

const LinhaLimiteEsquema = z.object({
  limite: Fracao,
  aprovacoes: z.number().int().nonnegative(),
  acertos: z.number().int().nonnegative(),
  precisao: Fracao.nullable(),
  resultado: TextoDecimal.nullable(),
  retorno: z.number(),
});

export const MetricasPlacarEsquema = z.object({
  decisoes: z.number().int().nonnegative(),
  avaliadas: z.number().int().nonnegative(),
  pendentes: z.number().int().nonnegative(),
  moeda: z.string().nullable(),
  aprovacoes: ProporcaoEsquema,
  vetos: ProporcaoEsquema,
  acuracia: ProporcaoEsquema,
  dinheiro: z
    .object({
      aprovadas: TextoDecimal,
      seAprovasseTudo: TextoDecimal,
      agregado: TextoDecimal,
      perdasEvitadas: TextoDecimal,
      ganhosPerdidos: TextoDecimal,
    })
    .nullable(),
  payoff: z
    .object({
      ganhoMedio: TextoDecimal,
      perdaMedia: TextoDecimal,
      payoff: z.number().nullable(),
      expectativa: TextoDecimal,
      acertoNecessario: Fracao.nullable(),
    })
    .nullable(),
  calibracao: z.object({
    brier: z.number().nullable(),
    faixas: z.array(
      z.object({
        de: Fracao,
        ate: Fracao,
        decisoes: z.number().int().nonnegative(),
        confiancaMedia: Fracao.nullable(),
        acerto: Fracao.nullable(),
      }),
    ),
  }),
  limites: z.array(LinhaLimiteEsquema),
  limite: LinhaLimiteEsquema.extend({
    precisao: Fracao,
    intervalo: IntervaloEsquema,
    poucasAmostras: z.boolean(),
  }).nullable(),
  confiavel: z.boolean(),
  aviso: z.string().nullable(),
  /** O placar em poucas frases (o mesmo texto que o agente lê). */
  resumo: z.string(),
});
export type MetricasPlacarDTO = z.infer<typeof MetricasPlacarEsquema>;

const GrupoPlacarEsquema = z.object({ chave: Id, nome: z.string(), metricas: MetricasPlacarEsquema });
export type GrupoPlacarDTO = z.infer<typeof GrupoPlacarEsquema>;

export const PlacarEsquema = z.object({
  total: MetricasPlacarEsquema,
  porRobo: z.array(GrupoPlacarEsquema),
  porEstrategia: z.array(GrupoPlacarEsquema),
  porMercado: z.array(GrupoPlacarEsquema),
  /** A meta de precisão das aprovações (0,8). */
  meta: Fracao,
  geradoEm: Instante,
});
export type PlacarDTO = z.infer<typeof PlacarEsquema>;

export const FiltroPlacarEsquema = z.object({
  roboId: z.uuid("roboId precisa ser o id de um robô").optional(),
  /** Só decisões a partir deste instante (ms). */
  desde: z.coerce.number().int().nonnegative().optional(),
});
export type FiltroPlacar = z.infer<typeof FiltroPlacarEsquema>;

const texto = (v: Valor): string => paraTexto(v);
const textoOuNulo = (v: Valor | null): string | null => (v === null ? null : paraTexto(v));

/** Métricas do domínio → contrato (dinheiro em texto), com o resumo em frases. */
export function metricasParaDTO(m: MetricasPlacar, onde = ""): MetricasPlacarDTO {
  return {
    decisoes: m.decisoes,
    avaliadas: m.avaliadas,
    pendentes: m.pendentes,
    moeda: m.moeda,
    aprovacoes: m.aprovacoes,
    vetos: m.vetos,
    acuracia: m.acuracia,
    dinheiro: m.dinheiro && {
      aprovadas: texto(m.dinheiro.aprovadas),
      seAprovasseTudo: texto(m.dinheiro.seAprovasseTudo),
      agregado: texto(m.dinheiro.agregado),
      perdasEvitadas: texto(m.dinheiro.perdasEvitadas),
      ganhosPerdidos: texto(m.dinheiro.ganhosPerdidos),
    },
    payoff: m.payoff && {
      ganhoMedio: texto(m.payoff.ganhoMedio),
      perdaMedia: texto(m.payoff.perdaMedia),
      payoff: m.payoff.payoff,
      expectativa: texto(m.payoff.expectativa),
      acertoNecessario: m.payoff.acertoNecessario,
    },
    calibracao: { brier: m.calibracao.brier, faixas: [...m.calibracao.faixas] },
    limites: m.limites.map((l) => ({ ...l, resultado: textoOuNulo(l.resultado) })),
    limite: m.limite && { ...m.limite, resultado: textoOuNulo(m.limite.resultado) },
    confiavel: m.confiavel,
    aviso: m.aviso,
    resumo: resumoDoPlacar(m, onde),
  };
}

/** O placar inteiro → contrato. */
export function placarParaDTO(p: Placar, geradoEm: number): PlacarDTO {
  const grupo = (prefixo: string) => (g: GrupoPlacar) => ({
    chave: g.chave,
    nome: g.nome,
    metricas: metricasParaDTO(g.metricas, `${prefixo} ${g.nome}`),
  });
  return {
    total: metricasParaDTO(p.total),
    porRobo: p.porRobo.map(grupo("no robô")),
    porEstrategia: p.porEstrategia.map(grupo("na estratégia")),
    porMercado: p.porMercado.map(grupo("no mercado")),
    meta: PRECISAO_META,
    geradoEm,
  };
}
