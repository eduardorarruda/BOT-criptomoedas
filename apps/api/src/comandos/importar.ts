import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Banco } from "@zentrade/banco";
import { extensaoAceita, extensaoDe, hashConteudo } from "@zentrade/conhecimento";
import { FonteDocumento, LIMITE_ARQUIVO_BYTES } from "@zentrade/contratos";
import { z } from "zod";
import {
  tituloDoArquivo,
  type ArquivoExtraido,
  type ServicoArquivos,
} from "../integracoes/conhecimento-arquivos.js";
import type { FonteEmbeddings } from "../integracoes/conhecimento.js";
import { lerArgumentos } from "./usuario.js";

const Argumentos = z.object({
  email: z.email("informe o e-mail da pessoa em --email"),
  pasta: z.string("informe a pasta em --pasta").min(1, "informe a pasta em --pasta"),
  fonte: z
    .enum(FonteDocumento.options, { error: `--fonte aceita ${FonteDocumento.options.join(", ")}` })
    .default("nota"),
});

export interface DependenciasImportacao {
  readonly banco: {
    readonly usuarios: Pick<Banco["usuarios"], "porEmail">;
    readonly conhecimento: Pick<Banco["conhecimento"], "documentoPorHash" | "documentoPorTitulo">;
  };
  /** O mesmo serviço do envio pela tela: extração isolada, limites e a mesma ingestão. */
  readonly arquivos: Pick<ServicoArquivos, "extrairArquivo" | "ingerirExtraido">;
  readonly embeddings: FonteEmbeddings;
  readonly escrever: (linha: string) => void;
}

export interface OpcoesImportacao {
  /** Teto por arquivo; o padrão é o mesmo do envio pela tela (15 MB). */
  readonly limiteBytes?: number;
  /** De onde vale uma --pasta relativa (o comando usa INIT_CWD, a pasta em que o pnpm foi chamado). */
  readonly base?: string;
}

export interface ResumoImportacao {
  readonly importados: number;
  readonly trechos: number;
  readonly duplicados: number;
  readonly ignorados: number;
  readonly falhas: number;
}

export interface EntradaPasta {
  readonly caminho: string;
  readonly relativo: string;
  /** Arquivo comum; link simbólico, socket etc. não são lidos. */
  readonly comum: boolean;
}

type Resultado =
  | { readonly tipo: "importado"; readonly trechos: number }
  | { readonly tipo: "duplicado" | "ignorado" | "falhou"; readonly motivo: string };

const oculto = (relativo: string) => relativo.split(/[\\/]/).some((parte) => parte.startsWith("."));

/** Tudo dentro da pasta (com subpastas), em ordem, sem arquivos e pastas ocultos (.git etc.). */
export async function listarArquivos(pasta: string): Promise<EntradaPasta[]> {
  const entradas = await readdir(pasta, { withFileTypes: true, recursive: true });
  return entradas
    .filter((e) => !e.isDirectory())
    .map((e) => {
      const caminho = join(e.parentPath, e.name);
      return { caminho, relativo: relative(pasta, caminho), comum: e.isFile() };
    })
    .filter((e) => !oculto(e.relativo))
    .sort((a, b) => a.relativo.localeCompare(b.relativo, "en"));
}

async function conferirPasta(pasta: string): Promise<void> {
  const info = await stat(pasta).catch(() => null);
  if (!info) {
    throw new Error(
      `a pasta ${pasta} não existe (no Docker, monte a pasta no container; veja docs/operacao.md)`,
    );
  }
  if (!info.isDirectory()) throw new Error(`${pasta} não é uma pasta`);
}

async function jaExiste(
  d: DependenciasImportacao,
  usuarioId: string,
  a: ArquivoExtraido,
  titulo: string,
  fonte: FonteDocumento,
): Promise<string | null> {
  if (await d.banco.conhecimento.documentoPorHash(usuarioId, hashConteudo(a.texto.texto))) {
    return "mesmo conteúdo";
  }
  if (await d.banco.conhecimento.documentoPorTitulo(usuarioId, titulo, fonte)) return "mesmo título e fonte";
  return null;
}

async function importarArquivo(
  d: DependenciasImportacao,
  usuarioId: string,
  fonte: FonteDocumento,
  e: EntradaPasta,
  limiteBytes: number,
): Promise<Resultado> {
  if (!e.comum)
    return { tipo: "ignorado", motivo: "não é um arquivo comum (links simbólicos não são seguidos)" };
  if (!extensaoAceita(e.relativo)) {
    return { tipo: "ignorado", motivo: `tipo não suportado: .${extensaoDe(e.relativo) || "sem extensão"}` };
  }
  const { size } = await stat(e.caminho);
  if (size === 0) return { tipo: "ignorado", motivo: "arquivo vazio" };
  if (size > limiteBytes) {
    return { tipo: "ignorado", motivo: `passa de ${Math.floor(limiteBytes / 1024 / 1024)} MB` };
  }
  try {
    const extraido = await d.arquivos.extrairArquivo(e.relativo, await readFile(e.caminho));
    const titulo = tituloDoArquivo(extraido);
    const motivo = await jaExiste(d, usuarioId, extraido, titulo, fonte);
    if (motivo) return { tipo: "duplicado", motivo };
    const r = await d.arquivos.ingerirExtraido(usuarioId, extraido, { titulo, fonte });
    // Outro processo pode ter gravado o mesmo conteúdo entre a checagem e aqui.
    return r.novo
      ? { tipo: "importado", trechos: r.trechos }
      : { tipo: "duplicado", motivo: "mesmo conteúdo" };
  } catch (erro) {
    return { tipo: "falhou", motivo: (erro as Error).message };
  }
}

function linha(relativo: string, r: Resultado): string {
  if (r.tipo === "importado") return `+ ${relativo}: importado (${plural(r.trechos, "trecho", "trechos")})`;
  if (r.tipo === "duplicado") return `= ${relativo}: já existe (${r.motivo})`;
  if (r.tipo === "ignorado") return `- ${relativo}: ignorado (${r.motivo})`;
  return `! ${relativo}: falhou (${r.motivo})`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function textoDoResumo(r: ResumoImportacao, soPalavras: boolean): string {
  const partes = [
    `${plural(r.importados, "importado", "importados")} (${plural(r.trechos, "trecho", "trechos")})`,
    `${r.duplicados} ${r.duplicados === 1 ? "já existia" : "já existiam"}`,
    plural(r.ignorados, "ignorado", "ignorados"),
    plural(r.falhas, "falha", "falhas"),
  ];
  const aviso = soPalavras
    ? " Busca só por palavras: rode reindexar-conhecimento quando configurar um provedor de embeddings."
    : "";
  return `resumo: ${partes.join(", ")}.${aviso}`;
}

function lerArgs(argv: readonly string[]) {
  const lido = Argumentos.safeParse(lerArgumentos(argv));
  if (!lido.success) throw new Error(lido.error.issues.map((i) => i.message).join("; "));
  return lido.data;
}

/**
 * importar-conhecimento: cada .md, .txt, .pdf, .docx e .html da pasta (e subpastas) entra
 * na base da pessoa pelo mesmo caminho do envio pela tela (extração isolada, limite de
 * tamanho, mesma ingestão, origem "arquivo"). Pula o que já existe (mesmo conteúdo, ou
 * mesmo título e fonte) e o que não é suportado, dizendo o motivo; no fim, um resumo.
 */
export async function executarImportacao(
  argv: readonly string[],
  d: DependenciasImportacao,
  o: OpcoesImportacao = {},
): Promise<ResumoImportacao> {
  const args = lerArgs(argv);
  if ("indisponivel" in d.embeddings) throw new Error(`o RAG está desligado: ${d.embeddings.indisponivel}`);
  const pessoa = await d.banco.usuarios.porEmail(args.email);
  if (!pessoa) throw new Error(`nenhuma pessoa com o e-mail ${args.email}`);
  const pasta = resolve(o.base ?? process.cwd(), args.pasta);
  await conferirPasta(pasta);

  const contagem = { importados: 0, trechos: 0, duplicados: 0, ignorados: 0, falhas: 0 };
  for (const e of await listarArquivos(pasta)) {
    const r = await importarArquivo(d, pessoa.id, args.fonte, e, o.limiteBytes ?? LIMITE_ARQUIVO_BYTES);
    d.escrever(linha(e.relativo, r));
    if (r.tipo === "importado") {
      contagem.importados++;
      contagem.trechos += r.trechos;
    } else if (r.tipo === "duplicado") contagem.duplicados++;
    else if (r.tipo === "ignorado") contagem.ignorados++;
    else contagem.falhas++;
  }
  d.escrever(textoDoResumo(contagem, d.embeddings.embeddings === null));
  return contagem;
}
