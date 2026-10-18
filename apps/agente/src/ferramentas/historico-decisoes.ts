import type { Fonte } from "@zentrade/contratos";
import { diaNoFuso, FUSO_PADRAO, metricasDoPlacar, paraTexto, resumoDoPlacar } from "@zentrade/dominio";
import { z } from "zod";
import { definirFerramenta } from "./definicao.js";
import {
  json,
  type AvaliacaoPassada,
  type ContextoAnalise,
  type DependenciasFerramentas,
} from "./contexto.js";

const Entrada = z.object({ limite: z.number().int().min(1).max(20).default(10) });

/** Quantas entradas do robô entram no placar que a ferramenta resume. */
export const DECISOES_DO_PLACAR = 200;

const avaliacaoEmTexto = (a: AvaliacaoPassada) => ({
  claude: a.claude,
  situacao: a.situacao,
  fonte: a.fonte,
  resultado: a.resultado ? paraTexto(a.resultado) : null,
  acertou: a.acertou,
});

/** O placar do Claude neste robô em frases, ou `null` se a porta não sabe calcular. */
async function placarDoRobo(ctx: ContextoAnalise, deps: DependenciasFerramentas): Promise<string | null> {
  if (!deps.historico.placar) return null;
  const lista = await deps.historico.placar(ctx.pedido.robo.id, DECISOES_DO_PLACAR);
  return resumoDoPlacar(metricasDoPlacar(lista), "neste robô");
}

export function historicoDecisoes(ctx: ContextoAnalise, deps: DependenciasFerramentas) {
  return definirFerramenta({
    nome: "historico_decisoes",
    descricao:
      "Decisões anteriores deste robô, das mais recentes para as mais antigas: sinal, proposta, estado, o " +
      "desfecho (resultado líquido em USDT, quando já avaliado) e a avaliação do placar (o que a análise " +
      "decidiu e se acertou: aprovação certa = lucro líquido; veto certo = a entrada vetada teria dado ≤ 0). " +
      "Traz também o placar deste robô em frases: precisão das aprovações, vetos certos, dinheiro contra " +
      "aprovar tudo, calibração da confiança. Use para ver o que já funcionou ou falhou.",
    entrada: Entrada,
    rodar: async (e) => {
      const decisoes = await deps.historico.recentes(ctx.pedido.robo.id, e.limite);
      return json({
        placar: await placarDoRobo(ctx, deps),
        decisoes: decisoes.map((d) => {
          const data = diaNoFuso(d.em, deps.fuso ?? FUSO_PADRAO);
          const fonte: Fonte = { tipo: "diario", id: d.id, titulo: `Decisão ${d.id}`, data };
          ctx.registro.registrar(fonte);
          return {
            fonte,
            sinal: d.sinal,
            acaoProposta: d.acaoProposta,
            estado: d.estado,
            preco: paraTexto(d.preco),
            resultado: d.resultado ? paraTexto(d.resultado) : null,
            explicacao: d.explicacao,
            avaliacao: d.avaliacao ? avaliacaoEmTexto(d.avaliacao) : null,
          };
        }),
      });
    },
  });
}
