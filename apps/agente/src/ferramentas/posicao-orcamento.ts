import { paraTexto } from "@zentrade/dominio";
import { z } from "zod";
import { definirFerramenta } from "./definicao.js";
import type { OrcamentoRisco } from "../serializacao.js";
import { json, type ContextoAnalise } from "./contexto.js";

function orcamentoComFolga(o: OrcamentoRisco) {
  return {
    riscoPorOperacao: paraTexto(o.riscoPorOperacao),
    exposicaoMaxima: paraTexto(o.exposicaoMaxima),
    perdaDiariaMaxima: paraTexto(o.perdaDiariaMaxima),
    exposicaoAtual: o.exposicaoAtual ? paraTexto(o.exposicaoAtual) : null,
    resultadoDoDia: o.resultadoDoDia ? paraTexto(o.resultadoDoDia) : null,
    folgaExposicao: o.exposicaoAtual ? paraTexto(o.exposicaoMaxima.minus(o.exposicaoAtual)) : null,
    folgaPerdaDiaria: o.resultadoDoDia ? paraTexto(o.perdaDiariaMaxima.plus(o.resultadoDoDia)) : null,
  };
}

export function posicaoEOrcamento(ctx: ContextoAnalise) {
  return definirFerramenta({
    nome: "posicao_e_orcamento",
    descricao:
      "Posição atual do robô (quantidade, preço médio, resultado realizado e não realizado, taxas) e o orçamento " +
      "de risco (risco por operação, folga de exposição e de perda diária). Valores em USDT, decimais em texto.",
    entrada: z.object({}),
    rodar: () => {
      const { posicao: p, preco } = ctx.pedido;
      const posicao = {
        quantidade: paraTexto(p.quantidade),
        precoMedio: paraTexto(p.precoMedio),
        valorAtual: paraTexto(p.quantidade.times(preco)),
        resultadoNaoRealizado: paraTexto(preco.minus(p.precoMedio).times(p.quantidade)),
        resultadoRealizado: paraTexto(p.resultadoRealizado),
        taxasPagas: paraTexto(p.taxasPagas),
      };
      if (!ctx.orcamento) {
        return json({
          posicao,
          orcamento: null,
          aviso: "O motor não informou o orçamento de risco; trate como desconhecido e seja conservador.",
        });
      }
      return json({ posicao, orcamento: orcamentoComFolga(ctx.orcamento) });
    },
  });
}
