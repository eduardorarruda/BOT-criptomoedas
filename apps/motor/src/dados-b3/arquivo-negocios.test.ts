import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conferirArquivoNegocios, expandirCaminhos, blocosDoArquivo } from "./arquivo-negocios.js";

const TXT = fileURLToPath(new URL("../teste/fixtures/negocios-drv-2026-10-14.txt", import.meta.url));
const ZIP = fileURLToPath(new URL("../teste/fixtures/negocios-drv-2026-10-14.zip", import.meta.url));
const ZIP_SEM_COMPRESSAO = fileURLToPath(
  new URL("../teste/fixtures/negocios-drv-2026-10-14-sem-compressao.zip", import.meta.url),
);
/** Um .zip sem nenhum arquivo: só o registro de fim do diretório central. */
const ZIP_VAZIO = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]);

async function todas(blocos: AsyncIterable<readonly string[]>): Promise<string[]> {
  const lista: string[] = [];
  for await (const b of blocos) lista.push(...b);
  return lista;
}

let pasta: string;

beforeAll(async () => {
  pasta = await mkdtemp(join(tmpdir(), "zt-negocios-"));
  await writeFile(join(pasta, "vazio.zip"), ZIP_VAZIO);
  await writeFile(join(pasta, "quebrado.zip"), "isto não é um zip");
  await writeFile(join(pasta, "negocios.xlsx"), "x");
  await writeFile(join(pasta, "13-10-2026_NEGOCIOSAVISTA_DRV.TXT"), "a");
  await writeFile(join(pasta, "14-10-2026_NEGOCIOSAVISTA_DRV.zip"), "b");
  await mkdir(join(pasta, "pasta.zip"));
});

afterAll(async () => {
  await rm(pasta, { recursive: true, force: true });
});

describe("linhas do arquivo de negócios", () => {
  it("lê o .txt em stream, sem o \\r do fim de linha", async () => {
    const linhas = await todas(blocosDoArquivo(TXT));
    expect(linhas).toHaveLength(7);
    expect(linhas[1]).toBe("2026-10-14;WINZ26;0;202500,000;20;090010000;30;1;2026-10-14;88;88;1");
    expect(linhas.some((l) => l.includes("\r"))).toBe(false);
  });

  it("lê o .zip da B3 sem descompactar em disco: as mesmas linhas do .txt de dentro", async () => {
    expect(await todas(blocosDoArquivo(ZIP))).toEqual(await todas(blocosDoArquivo(TXT)));
  });

  it("lê também o .zip sem compressão", async () => {
    expect(await todas(blocosDoArquivo(ZIP_SEM_COMPRESSAO))).toEqual(await todas(blocosDoArquivo(TXT)));
  });

  it("recusa o .zip cujo arquivo de dentro não tem o tamanho declarado", async () => {
    const zip = await readFile(ZIP);
    // Tamanho descompactado no diretório central (assinatura PK\x01\x02, campo no byte 24).
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(zip.readUInt32LE(central + 24) + 1, central + 24);
    await writeFile(join(pasta, "tamanho-errado.zip"), zip);
    await expect(todas(blocosDoArquivo(join(pasta, "tamanho-errado.zip")))).rejects.toThrow(/corrompido/);
  });

  it("dá para ler de novo do começo (a segunda leitura dos cancelamentos)", async () => {
    const primeira = await todas(blocosDoArquivo(ZIP));
    expect(await todas(blocosDoArquivo(ZIP))).toEqual(primeira);
  });

  it(".zip sem o .txt dentro, ou que não é zip, explica o que houve", async () => {
    await expect(todas(blocosDoArquivo(join(pasta, "vazio.zip")))).rejects.toThrow(
      /não tem um arquivo \.txt ou \.csv/,
    );
    await expect(todas(blocosDoArquivo(join(pasta, "quebrado.zip")))).rejects.toThrow(
      /não deu para abrir o \.zip/,
    );
  });
});

describe("conferência do caminho", () => {
  it("aceita .zip, .txt e .csv que existem", async () => {
    await expect(conferirArquivoNegocios(ZIP)).resolves.toBeUndefined();
    await expect(conferirArquivoNegocios(TXT)).resolves.toBeUndefined();
    await expect(
      conferirArquivoNegocios(join(pasta, "13-10-2026_NEGOCIOSAVISTA_DRV.TXT")),
    ).resolves.toBeUndefined();
  });

  it("recusa o que não existe, pasta e outra extensão", async () => {
    await expect(conferirArquivoNegocios(join(pasta, "nada.zip"))).rejects.toThrow(/não existe.*Docker/);
    await expect(conferirArquivoNegocios(join(pasta, "pasta.zip"))).rejects.toThrow(/não é um arquivo/);
    await expect(conferirArquivoNegocios(join(pasta, "negocios.xlsx"))).rejects.toThrow(
      /\.zip, \.txt ou \.csv/,
    );
  });
});

describe("caminhos de --arquivos", () => {
  it("relativos valem a partir da base; repetidos contam uma vez", async () => {
    expect(await expandirCaminhos(["a.zip", "./a.zip", "/x/b.txt"], "/base")).toEqual([
      "/base/a.zip",
      "/x/b.txt",
    ]);
  });

  it("expande um padrão (útil no Docker, onde o shell de fora não vê a pasta), em ordem", async () => {
    expect(await expandirCaminhos(["*_NEGOCIOSAVISTA_DRV.*"], pasta)).toEqual([
      join(pasta, "13-10-2026_NEGOCIOSAVISTA_DRV.TXT"),
      join(pasta, "14-10-2026_NEGOCIOSAVISTA_DRV.zip"),
    ]);
    await expect(expandirCaminhos(["*.nada"], pasta)).rejects.toThrow(/nenhum arquivo casa com/);
  });
});
