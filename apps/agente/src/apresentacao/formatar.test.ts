import { describe, expect, it } from "vitest";
import { DECISOES } from "../teste/api-falsa.js";
import { explicarDecisao, formatarBacktest, formatarDecisoes, formatarResumo } from "./formatar.js";

describe("formatação para gente", () => {
  it("tira caracteres de controle do texto que vem de fora antes de mostrar", () => {
    const base = DECISOES[0]!;
    const t = explicarDecisao({
      ...base,
      proposta: { ...base.proposta!, justificativa: "ok\u001b[2Jsumiu\u0007", riscos: ["r\u001b[1m"] },
    } as never);
    // eslint-disable-next-line no-control-regex -- o teste procura exatamente caracteres de controle
    expect(t).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
    expect(t).toMatch(/oksumiu/);
  });

  it("resumo destaca a parada total ligada", () => {
    const t = formatarResumo({
      resultadoHoje: "0",
      exposicao: "0",
      maiorQueda30d: "0",
      robosAtivos: 0,
      custoIaHoje: "0",
      paradaTotal: true,
    });
    expect(t).toMatch(/Parada total: LIGADA/);
  });

  it("lista vazia diz que não há decisões", () => {
    expect(formatarDecisoes([])).toBe("Nenhuma decisão encontrada.");
  });

  it("decisão aprovada, com ordem e proposta de aguardar sem stop nem alvo", () => {
    const base = DECISOES[0]!;
    const t = explicarDecisao({
      ...base,
      proposta: {
        ...base.proposta!,
        acao: "aguardar",
        riscos: [],
        fontes: [],
        stop: undefined,
        alvo: undefined,
      } as never,
      risco: { aprovada: true, barreiras: [] },
      ordem: {
        id: "o1",
        decisaoId: base.id,
        idCliente: "zt-1",
        simbolo: "BTCUSDT",
        lado: "COMPRA",
        quantidade: "0.001",
        estado: "PREENCHIDA",
        criadaEm: 0,
        execucoes: [],
      },
    });
    expect(t).toMatch(/Proposta da IA: aguardar, confiança 72%, tamanho 50%\n/);
    expect(t).not.toMatch(/Riscos:|Fontes:/);
    expect(t).toMatch(/Motor de risco: aprovou/);
    expect(t).toMatch(/Ordem: o1 \(PREENCHIDA\)/);
    expect(t).toMatch(/Desfecho: ainda não avaliado/);
  });

  it("decisão sem proposta deixa claro que foi só por regras", () => {
    expect(explicarDecisao(DECISOES[1]!)).toMatch(/nenhuma \(decisão só por regras\)/);
  });

  it("backtest sem detalhes mostra só o estado", () => {
    expect(formatarBacktest({ id: "b", estado: "na_fila" })).toBe("Backtest b: na_fila");
  });
});
