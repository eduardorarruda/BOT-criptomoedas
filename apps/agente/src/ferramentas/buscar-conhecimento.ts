import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { FONTES } from "@zentrade/conhecimento";
import type { Fonte } from "@zentrade/contratos";
import { z } from "zod";
import { dataCurta, json, type ContextoAnalise, type DependenciasFerramentas } from "./contexto.js";

const Entrada = z.object({
  consulta: z.string().min(1).max(500).describe("O que procurar, em linguagem natural"),
  fontes: z
    .array(z.enum(FONTES))
    .min(1)
    .optional()
    .describe("Restringe a: diario, noticia, regra_corretora, estrategia, nota"),
  limite: z.number().int().min(1).max(10).default(5),
});

export function buscarConhecimento(ctx: ContextoAnalise, deps: DependenciasFerramentas) {
  return betaZodTool({
    name: "buscar_conhecimento",
    description:
      "Busca híbrida (semântica + palavras) na base de conhecimento do usuário: diário de decisões, notícias, " +
      "regras da corretora, estratégias e notas. Cada resultado traz a fonte (tipo, id, título, data) para citar.",
    inputSchema: Entrada,
    run: async (e) => {
      const achados = await deps.busca.buscar(e.consulta, {
        usuarioId: ctx.usuarioId,
        ...(e.fontes ? { fontes: e.fontes } : {}),
        limite: e.limite,
      });
      const resultados = achados.map((a) => {
        const fonte: Fonte = {
          tipo: a.fonte,
          id: a.documentoId,
          titulo: a.titulo.slice(0, 200),
          data: dataCurta(a.publicadoEm),
        };
        ctx.registro.registrar(fonte);
        return { fonte, url: a.url, trecho: a.texto };
      });
      return json(
        resultados.length > 0
          ? { resultados }
          : { resultados, aviso: "Nada encontrado. Não invente fonte; considere aguardar." },
      );
    },
  });
}
