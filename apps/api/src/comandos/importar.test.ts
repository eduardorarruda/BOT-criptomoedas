import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashConteudo } from "@zentrade/conhecimento";
import type { DocumentoIngerido } from "@zentrade/contratos";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarServicoArquivos } from "../integracoes/conhecimento-arquivos.js";
import type { ServicoConhecimento } from "../integracoes/conhecimento.js";
import { executarImportacao, listarArquivos, type DependenciasImportacao } from "./importar.js";

const ANA = "11111111-1111-4111-8111-111111111111";

let pasta: string;
beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), "zt-importar-"));
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

/** Base em memória: deduplica pelo texto, como o hash faria, e guarda título e fonte. */
function montar(o: { embeddings?: DependenciasImportacao["embeddings"] } = {}) {
  const docs: { id: string; titulo: string; fonte: string; texto: string; hash: string }[] = [];
  const ingerir = vi.fn(async (_u: string, d: { titulo: string; fonte: string; texto: string }) => {
    const existente = docs.find((x) => x.hash === hashConteudo(d.texto));
    if (existente) return { id: existente.id, novo: false, trechos: 0 } as unknown as DocumentoIngerido;
    const novo = { id: `d${docs.length + 1}`, ...d, hash: hashConteudo(d.texto) };
    docs.push(novo);
    return { ...novo, url: null, publicadoEm: 1, criadoEm: 1, novo: true, trechos: 2 } as DocumentoIngerido;
  });
  const conhecimento: ServicoConhecimento = { busca: "palavras", ingerir };
  const banco = {
    usuarios: { porEmail: async (e: string) => (e === "ana@exemplo.com" ? { id: ANA } : null) },
    conhecimento: {
      documentoPorHash: async (_u: string, hash: string) => docs.find((d) => d.hash === hash)?.id ?? null,
      documentoPorTitulo: async (_u: string, titulo: string, fonte: string) =>
        docs.find((d) => d.titulo === titulo && d.fonte === fonte)?.id ?? null,
      contarTrechosSemVetor: async () => 0,
    },
    conhecimentoDetalhe: { gravarOrigem: vi.fn(async () => undefined) },
  };
  const arquivos = criarServicoArquivos({
    conhecimento,
    banco: banco as never,
    repositorio: {} as never,
    embeddings: { embeddings: null },
    agora: () => 1,
  });
  const linhas: string[] = [];
  const deps: DependenciasImportacao = {
    banco: banco as never,
    arquivos,
    embeddings: o.embeddings ?? { embeddings: null },
    escrever: (l) => linhas.push(l),
  };
  return { deps, docs, linhas, ingerir };
}

describe("listarArquivos", () => {
  it("percorre subpastas em ordem, pula ocultos e marca o que não é arquivo comum", async () => {
    await mkdir(join(pasta, "b"));
    await mkdir(join(pasta, ".git"));
    await writeFile(join(pasta, "b", "z.md"), "z");
    await writeFile(join(pasta, "a.md"), "a");
    await writeFile(join(pasta, ".oculto.md"), "x");
    await writeFile(join(pasta, ".git", "config.md"), "x");
    await symlink(join(pasta, "a.md"), join(pasta, "atalho.md"));
    expect(await listarArquivos(pasta)).toEqual([
      { caminho: join(pasta, "a.md"), relativo: "a.md", comum: true },
      { caminho: join(pasta, "atalho.md"), relativo: "atalho.md", comum: false },
      { caminho: join(pasta, "b", "z.md"), relativo: join("b", "z.md"), comum: true },
    ]);
  });
});

describe("comando importar-conhecimento", () => {
  it("importa md, txt e html, pula duplicados e não suportados com o motivo, e resume", async () => {
    await writeFile(join(pasta, "estrategia.md"), "# Reversão\n\nComprar abaixo da média com stop curto.");
    await writeFile(join(pasta, "z-copia.md"), "# Reversão\n\nComprar abaixo da média com stop curto.");
    await writeFile(join(pasta, "regras.txt"), "Nunca arriscar mais de 1% por operação.");
    await writeFile(
      join(pasta, "pagina.html"),
      "<html><head><title>Taxas</title></head><body><p>A taxa é 0,1%.</p></body></html>",
    );
    await writeFile(join(pasta, "foto.png"), "PNG");
    await writeFile(join(pasta, "README.md"), "# Notas\n\nComo importar esta pasta.");
    await writeFile(join(pasta, "vazio.md"), "");
    await writeFile(join(pasta, "falso.pdf"), "não sou pdf");
    const { deps, docs, linhas } = montar();

    const r = await executarImportacao(["--email", "ana@exemplo.com", "--pasta", pasta], deps);

    expect(docs.map((d) => [d.titulo, d.fonte])).toEqual([
      ["estrategia", "nota"],
      ["Taxas", "nota"],
      ["regras", "nota"],
    ]);
    expect(r).toMatchObject({ importados: 3, trechos: 6, duplicados: 1, ignorados: 3, falhas: 1 });
    expect(linhas).toEqual(
      expect.arrayContaining([
        "+ estrategia.md: importado (2 trechos)",
        "= z-copia.md: já existe (mesmo conteúdo)",
        "- foto.png: ignorado (tipo não suportado: .png)",
        "- vazio.md: ignorado (arquivo vazio)",
        "- README.md: ignorado (README da pasta: descreve os arquivos, não é conteúdo)",
        expect.stringMatching(/^! falso\.pdf: falhou \(.*não é um PDF/),
      ]),
    );
    expect(linhas.at(-1)).toBe(
      "resumo: 3 importados (6 trechos), 1 já existia, 3 ignorados, 1 falha. Busca só por palavras: " +
        "rode reindexar-conhecimento quando configurar um provedor de embeddings.",
    );
  });

  it("rodar de novo não duplica nada; título e fonte iguais com texto novo também conta como existente", async () => {
    await writeFile(join(pasta, "plano.md"), "versão 1");
    const { deps, linhas } = montar();
    const args = ["--email", "ana@exemplo.com", "--pasta", pasta, "--fonte", "estrategia"];
    await executarImportacao(args, deps);
    await writeFile(join(pasta, "plano.md"), "versão 2, editada");
    linhas.length = 0;
    const r = await executarImportacao(args, deps);
    expect(r).toMatchObject({ importados: 0, duplicados: 1 });
    expect(linhas[0]).toBe("= plano.md: já existe (mesmo título e fonte)");
  });

  it("--pasta relativa vale a partir da pasta de onde o comando foi chamado", async () => {
    await mkdir(join(pasta, "semente"));
    await writeFile(join(pasta, "semente", "nota.md"), "Stop sempre definido.");
    const { deps, docs } = montar();
    await executarImportacao(["--email", "ana@exemplo.com", "--pasta", "semente"], deps, { base: pasta });
    expect(docs.map((d) => d.titulo)).toEqual(["nota"]);
  });

  it("arquivo acima do limite é ignorado sem ser lido", async () => {
    await writeFile(join(pasta, "grande.txt"), "x".repeat(32));
    const { deps, ingerir } = montar();
    const r = await executarImportacao(["--email", "ana@exemplo.com", "--pasta", pasta], deps, {
      limiteBytes: 16,
    });
    expect(r).toMatchObject({ ignorados: 1, importados: 0 });
    expect(ingerir).not.toHaveBeenCalled();
  });

  it("valida os argumentos, a pessoa, a pasta e o RAG antes de começar", async () => {
    const { deps } = montar();
    await expect(executarImportacao(["--pasta", pasta], deps)).rejects.toThrow(/--email/);
    await expect(executarImportacao(["--email", "ana@exemplo.com"], deps)).rejects.toThrow(/--pasta/);
    await expect(
      executarImportacao(["--email", "ana@exemplo.com", "--pasta", pasta, "--fonte", "boato"], deps),
    ).rejects.toThrow(/--fonte/);
    await expect(executarImportacao(["--email", "ze@exemplo.com", "--pasta", pasta], deps)).rejects.toThrow(
      /nenhuma pessoa com o e-mail ze@exemplo.com/,
    );
    await expect(
      executarImportacao(["--email", "ana@exemplo.com", "--pasta", join(pasta, "nao-existe")], deps),
    ).rejects.toThrow(/não existe/);
    await writeFile(join(pasta, "a.md"), "a");
    await expect(
      executarImportacao(["--email", "ana@exemplo.com", "--pasta", join(pasta, "a.md")], deps),
    ).rejects.toThrow(/não é uma pasta/);
    const desligado = montar({ embeddings: { indisponivel: "VOYAGE_API_KEY não está definida" } }).deps;
    await expect(
      executarImportacao(["--email", "ana@exemplo.com", "--pasta", pasta], desligado),
    ).rejects.toThrow(/VOYAGE_API_KEY/);
  });
});
