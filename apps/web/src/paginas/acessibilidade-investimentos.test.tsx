import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

/** axe nas telas de investimento, com os filtros e as visões alternativas abertas pela URL. */
describe("acessibilidade: investimentos", () => {
  it.each<[string, RegExp]>([
    ["/imobiliario", /imobiliário/i],
    ["/imobiliario?visao=tabela&situacao=ativo", /imobiliário/i],
    ["/imobiliario?visao=alocacao&tipo=fii,reit", /imobiliário/i],
    ["/carteira", /carteira/i],
    ["/carteira?visao=cartoes&saldo=true", /carteira/i],
    ["/carteira?visao=alocacao&parcela=robo", /carteira/i],
    ["/carteira?q=nada-disso", /carteira/i],
    ["/renda-fixa", /renda fixa/i],
    ["/renda-fixa?aba=titulos", /renda fixa/i],
    ["/renda-fixa?aba=titulos&visao=tabela&indexador=CDI", /renda fixa/i],
    ["/renda-fixa?aba=titulos&visao=escada", /renda fixa/i],
    ["/renda-fixa?aba=titulos&visao=alocacao&situacao=ativo", /renda fixa/i],
    ["/renda-fixa?aba=titulos&q=nada-disso-existe", /renda fixa/i],
  ])(
    "%s sem violações",
    async (caminho, titulo) => expect(await violacoesNaTela(caminho, titulo)).toEqual([]),
    PRAZO_TELA_MS,
  );
});
