import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bancoDeCandlesFalso } from "../teste/banco-candles.js";
import { conferirArquivoNegocios, blocosDoArquivo } from "./arquivo-negocios.js";
import {
  executarImportacaoNegocios,
  lerArgumentosComLista,
  type DependenciasImportacaoNegocios,
} from "./comando-negocios.js";

const FIXTURES = fileURLToPath(new URL("../teste/fixtures/", import.meta.url));
const AGORA = Date.UTC(2026, 9, 17, 12);
const b3 = (dia: number, h: number, m: number) => Date.UTC(2026, 9, dia, h + 3, m);

function preparar() {
  const b = bancoDeCandlesFalso();
  const linhas: string[] = [];
  const d: DependenciasImportacaoNegocios = {
    banco: b.banco,
    agora: () => AGORA,
    escrever: (l) => linhas.push(l),
    base: FIXTURES,
    blocos: blocosDoArquivo,
    conferir: conferirArquivoNegocios,
  };
  return { b, d, linhas, texto: () => linhas.join("\n") };
}

// O dia 14 vai primeiro e em .zip: a ordem de gravação é a das datas.
const ARQUIVOS = ["--arquivos", "negocios-drv-2026-10-14.zip", "negocios-drv-2026-10-13.txt"];

describe("argumentos com lista", () => {
  it("junta os valores de cada --chave e ignora o -- do pnpm", () => {
    expect(
      lerArgumentosComLista(["--", "--arquivos", "a.zip", "b.zip", "--ajuste", "nenhum", "solto"]),
    ).toEqual({
      arquivos: ["a.zip", "b.zip"],
      ajuste: ["nenhum", "solto"],
    });
    expect(lerArgumentosComLista(["antes", "--simbolo"])).toEqual({ simbolo: [] });
  });
});

describe("importar-negocios-b3", () => {
  it("lê os arquivos, escolhe o contrato cheio de cada dia e grava WIN em 5m, 15m e 1h", async () => {
    const { b, d, texto } = preparar();
    const r = await executarImportacaoNegocios(ARQUIVOS, d);
    expect(r.dias.map((x) => [x.data, x.contrato, x.gravados])).toEqual([
      ["2026-10-13", "WINV26", { "5m": 3, "15m": 2, "1h": 2 }],
      ["2026-10-14", "WINZ26", { "5m": 4, "15m": 4, "1h": 2 }],
    ]);
    expect(r.dias[0]).toMatchObject({
      quantidade: 56,
      negocios: 8,
      negociosUsados: 7,
      foraDoPregao: 1,
      primeiro: b3(13, 9, 0),
      ultimo: b3(13, 18, 20),
      minima: "199900",
      maxima: "200500",
      fecha: "200500",
      ultimoDoDia: "200600",
      deslocamentoMil: 0,
    });
    expect(b.de("WIN", "5m").map((k) => k.abertura)).toEqual([
      b3(13, 9, 0),
      b3(13, 9, 10),
      b3(13, 18, 20),
      b3(14, 9, 0),
      b3(14, 9, 30),
      b3(14, 9, 55),
      b3(14, 10, 0),
    ]);
    const [primeira] = b.de("WIN", "1h");
    expect(
      [primeira!.abre, primeira!.maxima, primeira!.minima, primeira!.fecha, primeira!.volume].map(String),
    ).toEqual(["200000", "200200", "199900", "200150", "43"]);
    expect(r.rolagens).toEqual([
      { data: "2026-10-14", de: "WINV26", para: "WINZ26", diferencaMil: 1_900_000, referencia: "2026-10-13" },
    ]);
    const t = texto();
    expect(t).toContain("negocios-drv-2026-10-13.txt: 16 linhas, pregão 2026-10-13");
    expect(t).toContain("1 negócio cancelado (lido 2 vezes)");
    expect(t).toContain("1 negócio do after hours ignorado");
    expect(t).toContain('linha 14: preço inválido: "abc"');
    expect(t).toContain("2026-10-13: WINV26 (56 contratos em 8 negócios; também WINZ26: 5)");
    expect(t).toContain("rolagem em 2026-10-14: WINV26 → WINZ26, diferença de +1.900 pontos");
    expect(t).toContain("ajuste de rolagem: nenhum");
  });

  it("é idempotente: reimportar o dia troca as velas do dia, sem duplicar, e tira vela que não existe mais", async () => {
    const { b, d } = preparar();
    await executarImportacaoNegocios(ARQUIVOS, d);
    const antes = [b.de("WIN", "5m"), b.de("WIN", "15m"), b.de("WIN", "1h")];
    // Uma vela estranha no meio do dia 13 e outra num dia que não está nos arquivos.
    const estranha = { ...antes[0]![0]!, abertura: b3(13, 12, 0), fechamento: b3(13, 12, 5) - 1 };
    const outroDia = { ...antes[0]![0]!, abertura: b3(9, 12, 0), fechamento: b3(9, 12, 5) - 1 };
    await b.banco.gravar("WIN", "5m", [estranha, outroDia]);
    await executarImportacaoNegocios(ARQUIVOS, d);
    expect(b.de("WIN", "5m")).toEqual([outroDia, ...antes[0]!]);
    expect(b.de("WIN", "15m")).toEqual(antes[1]);
    expect(b.de("WIN", "1h")).toEqual(antes[2]);
  });

  it("--ajuste diferenca desloca os dias antes da rolagem", async () => {
    const { b, d, texto } = preparar();
    const r = await executarImportacaoNegocios([...ARQUIVOS, "--ajuste", "diferenca"], d);
    expect(r.dias.map((x) => x.deslocamentoMil)).toEqual([1_900_000, 0]);
    expect(String(b.de("WIN", "5m")[0]!.abre)).toBe("201900");
    expect(String(b.de("WIN", "5m").at(-1)!.fecha)).toBe("202700");
    expect(texto()).toContain("preços do dia deslocados em +1.900 pontos");
  });

  it("aceita padrão em --arquivos", async () => {
    const { d } = preparar();
    const r = await executarImportacaoNegocios(["--arquivos", "negocios-drv-*.txt"], d);
    expect(r.dias.map((x) => x.data)).toEqual(["2026-10-13", "2026-10-14"]);
  });

  it("o mesmo pregão em dois arquivos é recusado antes de gravar", async () => {
    const { b, d } = preparar();
    await expect(
      executarImportacaoNegocios(
        ["--arquivos", "negocios-drv-2026-10-14.txt", "negocios-drv-2026-10-14.zip"],
        d,
      ),
    ).rejects.toThrow(/2026-10-14 aparece em dois arquivos/);
    expect(b.total()).toBe(0);
  });

  it("confere todos os caminhos antes de ler qualquer um", async () => {
    const { b, d, linhas } = preparar();
    await expect(
      executarImportacaoNegocios(["--arquivos", "negocios-drv-2026-10-13.txt", "nao-existe.zip"], d),
    ).rejects.toThrow(/não existe/);
    expect(linhas).toEqual([]);
    expect(b.total()).toBe(0);
  });

  it("arquivo sem negócio de WIN não grava nada e diz por quê", async () => {
    const { b, d } = preparar();
    const so13: DependenciasImportacaoNegocios = {
      ...d,
      blocos: async function* () {
        yield [
          "CodigoInstrumento;AcaoAtualizacao;PrecoNegocio;QuantidadeNegociada;HoraFechamento;CodigoIdentificadorNegocio;TipoSessaoPregao;DataNegocio",
          "DI1F27;0;14,150;100;090001000;10;1;2026-10-13",
        ];
      },
    };
    await expect(
      executarImportacaoNegocios(["--arquivos", "negocios-drv-2026-10-13.txt"], so13),
    ).rejects.toThrow(/nenhum negócio de contrato futuro do WIN/);
    expect(b.total()).toBe(0);
  });

  it("recusa argumentos errados", async () => {
    const { d } = preparar();
    await expect(executarImportacaoNegocios([], d)).rejects.toThrow(/--arquivos/);
    await expect(executarImportacaoNegocios(["--arquivos"], d)).rejects.toThrow(/--arquivos/);
    await expect(executarImportacaoNegocios([...ARQUIVOS, "--simbolo", "WIN-IBOV"], d)).rejects.toThrow(
      /--simbolo aceita WIN/,
    );
    await expect(executarImportacaoNegocios([...ARQUIVOS, "--ajuste", "proporcional"], d)).rejects.toThrow(
      /--ajuste aceita nenhum, diferenca/,
    );
    await expect(
      executarImportacaoNegocios([...ARQUIVOS, "--ajuste", "nenhum", "diferenca"], d),
    ).rejects.toThrow(/--ajuste aceita um valor só/);
  });
});
