import type { Fonte } from "@zentrade/contratos";
import { diaNoFuso, FUSO_PADRAO, paraTexto } from "@zentrade/dominio";
import { z } from "zod";
import { definirFerramenta } from "./definicao.js";
import { json, type ContextoAnalise, type DependenciasFerramentas } from "./contexto.js";

const Entrada = z.object({ limite: z.number().int().min(1).max(20).default(10) });

export function historicoDecisoes(ctx: ContextoAnalise, deps: DependenciasFerramentas) {
  return definirFerramenta({
    nome: "historico_decisoes",
    descricao:
      "Decisões anteriores deste robô, das mais recentes para as mais antigas: sinal, proposta, estado e o " +
      "desfecho (resultado líquido em USDT, quando já avaliado). Use para ver o que já funcionou ou falhou.",
    entrada: Entrada,
    rodar: async (e) => {
      const decisoes = await deps.historico.recentes(ctx.pedido.robo.id, e.limite);
      return json({
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
          };
        }),
      });
    },
  });
}
