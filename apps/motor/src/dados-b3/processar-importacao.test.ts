import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bancoDeCandlesFalso } from "../teste/banco-candles.js";
import { blocosDoArquivo, conferirArquivoNegocios } from "./arquivo-negocios.js";
import { processarImportacaoB3, type RepositorioImportacoesB3ParaMotor } from "./processar-importacao.js";

const FIXTURES = fileURLToPath(new URL("../teste/fixtures/", import.meta.url));
const AGORA = Date.UTC(2026, 9, 17, 12);

function repositorioFalso(caminho: string | null) {
  const chamadas: string[] = [];
  const repositorio: RepositorioImportacoesB3ParaMotor = {
    obterParaProcessar: async (id) => {
      chamadas.push(`obter:${id}`);
      return caminho ? { caminho } : null;
    },
    marcarLendo: async (id) => void chamadas.push(`lendo:${id}`),
    concluir: async (id) => void chamadas.push(`concluida:${id}`),
    falhar: async (id, erro) => void chamadas.push(`falhou:${id}:${erro}`),
  };
  return { repositorio, chamadas };
}

describe("processarImportacaoB3", () => {
  it("lê o .zip (mesmo caminho do comando importar-negocios-b3), grava o resumo e apaga o arquivo", async () => {
    const caminho = `${FIXTURES}negocios-drv-2026-10-14.zip`;
    const { repositorio, chamadas } = repositorioFalso(caminho);
    const b = bancoDeCandlesFalso();
    const apagados: string[] = [];

    await processarImportacaoB3(
      {
        banco: b.banco,
        repositorio,
        agora: () => AGORA,
        apagar: async (c) => void apagados.push(c),
        blocos: blocosDoArquivo,
        conferir: conferirArquivoNegocios,
      },
      "importacao-1",
    );

    expect(chamadas).toEqual(["obter:importacao-1", "lendo:importacao-1", "concluida:importacao-1"]);
    expect(apagados).toEqual([caminho]);
    expect(b.de("WIN", "5m").length).toBeGreaterThan(0);
  });

  it("sem a linha (apagada ou nunca existiu), não lê nem apaga nada", async () => {
    const { repositorio, chamadas } = repositorioFalso(null);
    const apagados: string[] = [];
    const b = bancoDeCandlesFalso();

    await processarImportacaoB3(
      { banco: b.banco, repositorio, agora: () => AGORA, apagar: async (c) => void apagados.push(c) },
      "importacao-2",
    );

    expect(chamadas).toEqual(["obter:importacao-2"]);
    expect(apagados).toEqual([]);
  });

  it("arquivo inválido: grava o erro legível (falhou) e ainda assim apaga o arquivo", async () => {
    const caminho = `${FIXTURES}arquivo-que-nao-existe.zip`;
    const { repositorio, chamadas } = repositorioFalso(caminho);
    const apagados: string[] = [];
    const b = bancoDeCandlesFalso();

    await processarImportacaoB3(
      {
        banco: b.banco,
        repositorio,
        agora: () => AGORA,
        apagar: async (c) => void apagados.push(c),
        blocos: blocosDoArquivo,
        conferir: conferirArquivoNegocios,
      },
      "importacao-3",
    );

    expect(chamadas[0]).toBe("obter:importacao-3");
    expect(chamadas[1]).toBe("lendo:importacao-3");
    expect(chamadas[2]).toMatch(/^falhou:importacao-3:.*não existe/);
    expect(apagados).toEqual([caminho]);
  });
});
