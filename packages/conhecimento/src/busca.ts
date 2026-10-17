import { z } from "zod";
import type { Embeddings } from "./embeddings/tipos.js";
import { fundirResultados } from "./fusao.js";
import { termosDeBusca } from "./normalizar.js";
import {
  ErroConhecimento,
  FonteConhecimento,
  mensagemZod,
  type FiltroBusca,
  type RepositorioConhecimento,
  type TrechoEncontrado,
  type TrechoEncontradoBruto,
} from "./tipos.js";

/**
 * Notícia envelhece em dias; o diário de decisões, em meses. Estratégia e regra da
 * corretora quase não envelhecem: quando mudam, o texto novo vira outro documento.
 */
export const MEIA_VIDA_PADRAO_DIAS: Readonly<Record<FonteConhecimento, number>> = {
  noticia: 3,
  nota: 90,
  diario: 180,
  estrategia: 1095,
  regra_corretora: 1095,
};

export const PESOS_PADRAO: Readonly<Record<FonteConhecimento, number>> = {
  diario: 1,
  regra_corretora: 1,
  estrategia: 0.9,
  nota: 0.8,
  noticia: 0.8,
};

const PedidoBusca = z.object({
  consulta: z.string().trim().min(1, "a consulta está vazia").max(2000),
  usuarioId: z.uuid(),
  fontes: z.array(FonteConhecimento).min(1).optional(),
  limite: z.number().int().min(1).max(50).default(8),
});

export interface OpcoesBusca {
  readonly usuarioId: string;
  readonly fontes?: readonly FonteConhecimento[];
  readonly limite?: number;
}

/**
 * `hibrida`: semântica (vetores) + palavras. `palavras`: sem provedor de embeddings
 * (EMBEDDINGS_PROVEDOR=nenhum), só o full-text — a tela e o agente avisam disso.
 */
export const MODOS_BUSCA = ["hibrida", "palavras"] as const;
export type ModoBusca = (typeof MODOS_BUSCA)[number];

export interface BuscaConhecimento {
  /** Opcional para dublês de teste; ausente conta como `hibrida`. */
  readonly modo?: ModoBusca;
  buscar(consulta: string, opcoes: OpcoesBusca): Promise<TrechoEncontrado[]>;
}

export interface DependenciasBusca {
  readonly repositorio: RepositorioConhecimento;
  /** `null`: busca só por palavras. */
  readonly embeddings: Embeddings | null;
  readonly pesos?: Readonly<Record<FonteConhecimento, number>>;
  readonly meiaVidaDias?: Readonly<Record<FonteConhecimento, number>>;
  /** Quantos candidatos cada busca traz antes da fusão (por padrão, 4× o limite). */
  readonly candidatosPorBusca?: number;
  readonly agora?: () => Date;
}

async function buscarVetorial(
  deps: DependenciasBusca,
  filtro: FiltroBusca,
  consulta: string,
): Promise<TrechoEncontradoBruto[] | null> {
  if (!deps.embeddings) return null;
  const [vetor] = await deps.embeddings.gerar([consulta], "consulta");
  return deps.repositorio.buscarVetorial(filtro, vetor ?? []);
}

/**
 * Busca híbrida: vetorial (cosseno) + textual (ts_rank), fundidas por RRF, com peso por
 * fonte e idade. Sem embeddings, a vetorial fica de fora e vale só a textual.
 */
export function criarBuscaHibrida(deps: DependenciasBusca): BuscaConhecimento & { readonly modo: ModoBusca } {
  return {
    modo: deps.embeddings ? "hibrida" : "palavras",
    async buscar(consulta, opcoes) {
      const lido = PedidoBusca.safeParse({ consulta, ...opcoes });
      if (!lido.success) throw new ErroConhecimento(`Busca inválida: ${mensagemZod(lido.error)}`);
      const p = lido.data;
      const filtro = {
        usuarioId: p.usuarioId,
        fontes: p.fontes ?? null,
        limite: deps.candidatosPorBusca ?? p.limite * 4,
      };
      const termos = termosDeBusca(p.consulta);
      const [vetorial, textual] = await Promise.all([
        buscarVetorial(deps, filtro, p.consulta),
        termos ? deps.repositorio.buscarTextual(filtro, termos) : Promise.resolve([]),
      ]);
      const comId = (lista: readonly TrechoEncontradoBruto[] | null) =>
        lista?.map((t) => ({ ...t, id: t.trechoId })) ?? null;
      return fundirResultados([comId(vetorial), comId(textual)], {
        agora: (deps.agora ?? (() => new Date()))(),
        limite: p.limite,
        pesos: deps.pesos ?? PESOS_PADRAO,
        meiaVidaDias: deps.meiaVidaDias ?? MEIA_VIDA_PADRAO_DIAS,
      }).map(({ id: _id, ...t }) => t);
    },
  };
}
