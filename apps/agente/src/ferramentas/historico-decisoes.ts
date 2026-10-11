import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Fonte } from "@zentrade/contratos";
import { paraTexto } from "@zentrade/dominio";
import { z } from "zod";
import { dataCurta, json, type ContextoAnalise, type DependenciasFerramentas } from "./contexto.js";

const Entrada = z.object({ limite: z.number().int().min(1).max(20).default(10) });

export function historicoDecisoes(ctx: ContextoAnalise, deps: DependenciasFerramentas) {
  return betaZodTool({
    name: "historico_decisoes",
    description:
      "Decisões anteriores deste robô, das mais recentes para as mais antigas: sinal, proposta, estado e o " +
      "desfecho (resultado líquido em USDT, quando já avaliado). Use para ver o que já funcionou ou falhou.",
    inputSchema: Entrada,
    run: async (e) => {
      const decisoes = await deps.historico.recentes(ctx.pedido.robo.id, e.limite);
      return json({
        decisoes: decisoes.map((d) => {
          const fonte: Fonte = { tipo: "diario", id: d.id, titulo: `Decisão ${d.id}`, data: dataCurta(d.em) };
          ctx.registro.registrar(fonte);
          return {
            fonte,
            sinal: d.sinal,
            acaoProposta: d.acaoProposta,
            estado: d.estado,
            preco: paraTexto(d.preco),
            resultado: d.resultado ? paraTexto(d.resultado) : null,
            explicacao: d.explicacao,
          };
        }),
      });
    },
  });
}
