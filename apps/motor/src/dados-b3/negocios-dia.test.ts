import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { lerArquivoNegocios, lerNegociosWin, type ContratoNoDia } from "./negocios-dia.js";

const DIA_13 = new URL("../teste/fixtures/negocios-drv-2026-10-13.txt", import.meta.url);
const DIA_14 = new URL("../teste/fixtures/negocios-drv-2026-10-14.txt", import.meta.url);

/** 13/10/2026 às hh:mm de Brasília (UTC−3), em ms UTC. */
const b3 = (h: number, m: number, dia = 13) => Date.UTC(2026, 9, dia, h + 3, m);

/** As linhas da fixture em dois blocos, como vêm do disco. */
async function* linhasDe(url: URL): AsyncGenerator<string[]> {
  const linhas = (await readFile(url, "utf8")).split("\n");
  yield linhas.slice(0, 5);
  yield linhas.slice(5);
}

const contrato = (lista: readonly ContratoNoDia[], nome: string) => lista.find((c) => c.instrumento === nome);

describe("negócios do WIN agregados em barras de 5 minutos", () => {
  it("monta OHLCV pela ordem do horário (não pela ordem das linhas) e deixa buraco sem barra", async () => {
    const r = await lerArquivoNegocios(() => linhasDe(DIA_13));
    expect(r.dias.map((d) => d.data)).toEqual(["2026-10-13"]);
    const v = contrato(r.dias[0]!.contratos, "WINV26")!;
    expect(v.barras).toEqual([
      // 4 negócios: o de 09:04:59.999 vem antes no arquivo e ainda assim é o fechamento;
      // dois no mesmo milissegundo seguem o número do negócio.
      {
        abertura: b3(9, 0),
        abreMil: 200_000_000,
        maximaMil: 200_100_000,
        minimaMil: 199_900_000,
        fechaMil: 200_050_000,
        volume: 38,
        negocios: 4,
      },
      // 09:05 não teve negócio: sem barra. O de 210.000 foi cancelado e não conta.
      {
        abertura: b3(9, 10),
        abreMil: 200_200_000,
        maximaMil: 200_200_000,
        minimaMil: 200_150_000,
        fechaMil: 200_150_000,
        volume: 5,
        negocios: 2,
      },
      {
        abertura: b3(18, 20),
        abreMil: 200_500_000,
        maximaMil: 200_500_000,
        minimaMil: 200_500_000,
        fechaMil: 200_500_000,
        volume: 3,
        negocios: 1,
      },
    ]);
    // O leilão de fechamento (18:31) fica fora do pregão, mas é o último negócio do dia.
    expect(v).toMatchObject({
      negocios: 8,
      quantidade: 56,
      negociosNoPregao: 7,
      negociosForaDoPregao: 1,
      ultimoMil: 200_600_000,
    });
  });

  it("cancelamento (ação 2) tira o negócio original pelo número, numa segunda leitura", async () => {
    const r = await lerArquivoNegocios(() => linhasDe(DIA_13));
    expect(r.passadas).toBe(2);
    expect(r.cancelados).toBe(1);
    expect([...r.cancelamentos]).toEqual(["2026-10-13|WINV26|60"]);
  });

  it("uma passada só quando não há cancelamento", async () => {
    const r = await lerArquivoNegocios(() => linhasDe(DIA_14));
    expect(r.passadas).toBe(1);
    expect(r.cancelados).toBe(0);
  });

  it("ignora outros ativos, opções de WIN e o after hours; linha ruim vai para a lista com o número", async () => {
    const r = await lerNegociosWin(linhasDe(DIA_13));
    expect(r.dias[0]!.contratos.map((c) => c.instrumento)).toEqual(["WINV26", "WINZ26"]);
    expect(r.outraSessao).toBe(1);
    expect(r.ignoradas).toEqual([{ linha: 14, motivo: 'preço inválido: "abc"' }]);
    expect(r.totalIgnoradas).toBe(1);
    expect(r.linhas).toBe(16);
  });

  it("os contratos do dia saem do mais negociado ao menos negociado", async () => {
    const r = await lerArquivoNegocios(() => linhasDe(DIA_14));
    expect(r.dias[0]!.contratos.map((c) => [c.instrumento, c.quantidade, c.negocios])).toEqual([
      ["WINZ26", 32, 4],
      ["WINV26", 9, 2],
    ]);
  });

  it("guarda só as 20 primeiras linhas ruins, mas conta todas", async () => {
    async function* ruins() {
      yield [
        "CodigoInstrumento;AcaoAtualizacao;PrecoNegocio;QuantidadeNegociada;HoraFechamento;CodigoIdentificadorNegocio;TipoSessaoPregao;DataNegocio",
        ...Array.from({ length: 25 }, (_, i) => `WINZ26;0;x;1;090000000;${i};1;2026-10-14`),
        "",
      ];
    }
    const r = await lerNegociosWin(ruins());
    expect(r.ignoradas).toHaveLength(20);
    expect(r.totalIgnoradas).toBe(25);
    expect(r.dias).toEqual([]);
  });

  it("arquivo vazio ou sem o cabeçalho certo é recusado", async () => {
    async function* vazio() {
      yield [""];
    }
    await expect(lerNegociosWin(vazio())).rejects.toThrow(/vazio/);
    async function* outro() {
      yield ["<DATE>\t<TIME>"];
    }
    await expect(lerNegociosWin(outro())).rejects.toThrow(/Negócio a negócio/);
  });
});
