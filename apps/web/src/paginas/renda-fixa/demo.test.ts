import { ResumoRendaFixaEsquema, TituloDetalheEsquema } from "@zentrade/contratos/esquemas";
import { criarFonteRendaFixaDemo } from "./demo";

const AGORA = Date.parse("2026-10-10T15:00:00-03:00");

describe("renda fixa na demonstração", () => {
  const fonte = criarFonteRendaFixaDemo(() => AGORA);

  it("o resumo segue o contrato da API e tem números", async () => {
    const r = ResumoRendaFixaEsquema.parse(await fonte.resumo());
    expect(r.quantidade).toBe(8);
    expect(r.indisponiveis).toEqual([]);
    expect(Number(r.bruto)).toBeGreaterThan(Number(r.aplicado));
    expect(Number(r.liquido)).toBeLessThan(Number(r.bruto));
    expect(r.rendimentoMes).not.toBeNull();
    expect(r.indicadores.fonte).toMatch(/demonstração/);
  });

  it("detalhe com projeção e premissas; premissa informada aparece", async () => {
    const [t] = await fonte.titulos();
    const d = TituloDetalheEsquema.parse(await fonte.titulo(t!.id, { cdi: "10" }));
    expect(d.projecao.disponivel).toBe(true);
    if (d.projecao.disponivel) expect(d.projecao.premissas.join(" ")).toMatch(/informado por você/);
  });

  it("cadastra, altera e remove em memória", async () => {
    const novo = await fonte.criarTitulo({
      tipo: "CDB",
      nome: "Novo",
      indexador: "PREFIXADO",
      taxaAnual: "12",
      dataAplicacao: "2026-01-02",
      valorAplicado: "1000",
      liquidez: "vencimento",
    });
    expect(novo.posicao.disponivel).toBe(true);
    expect((await fonte.alterarTitulo(novo.id, { nome: "Renomeado" })).nome).toBe("Renomeado");
    await fonte.removerTitulo(novo.id);
    await expect(fonte.titulo(novo.id)).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("simuladores e regras funcionam; Pluggy explica que não há conexão", async () => {
    const isento = await fonte.simularIsento({
      direcao: "isento_para_tributado",
      percentualCdi: "90",
      prazoDias: 365,
      cdiAnual: "13.65",
    });
    expect(Number(isento.regraDeBolso)).toBeCloseTo(109.09, 1);
    expect(
      (
        await fonte.simularPreIpca({
          valor: "1000",
          prazoDias: 720,
          taxaPre: "12",
          taxaReal: "6",
          ipcaEsperado: "4",
        })
      ).curva.length,
    ).toBe(33);
    expect(
      (
        await fonte.simularSelicCdbPoupanca({
          valor: "1000",
          prazoDias: 90,
          selicAnual: "13",
          cdiAnual: "13",
          percentualCdb: "100",
          metaSelicAnual: "13",
          trMensal: "0",
        })
      ).serie.length,
    ).toBeGreaterThan(2);
    expect((await fonte.regras()).ir.faixas).toHaveLength(4);
    expect(await fonte.pluggy()).toEqual({ configurada: false, itens: [] });
    await expect(fonte.connectToken()).rejects.toMatchObject({ codigo: "pluggy_nao_configurada" });
  });
});
