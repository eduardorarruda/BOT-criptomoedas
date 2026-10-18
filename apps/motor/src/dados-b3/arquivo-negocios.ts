import { createReadStream } from "node:fs";
import { glob, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pipeline, type Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { createInflateRaw } from "node:zlib";
import yauzl, { type Entry, type ZipFile } from "yauzl";

/**
 * O arquivo "Negócio a negócio" baixado no BDI vem como `.zip` (~60 MB) com um `.txt`
 * de ~560 MB dentro. As linhas são lidas em stream direto do `.zip`, sem gravar nada em
 * disco e sem carregar o arquivo na memória: o yauzl lê o diretório do zip e entrega os
 * bytes comprimidos, e o zlib do Node descompacta em pedaços de 1 MB (com os pedaços
 * pequenos do padrão, a leitura levava quase 3 vezes mais). O tamanho descompactado é
 * conferido contra o declarado no zip. Também aceita o `.txt` ou `.csv` já
 * descompactado. Nenhum comando de shell é chamado com o caminho.
 */
export const EXTENSOES_NEGOCIOS = [".zip", ".txt", ".csv"] as const;

/** Descompactado, um dia do arquivo de derivativos tem ~560 MB; 4 GB é engano ou zip bomba. */
const LIMITE_DESCOMPACTADO = 4 * 1024 ** 3;
/** O .zip da B3 tem um arquivo só; muitos itens não é o arquivo certo. */
const MAXIMO_ITENS_ZIP = 100;
const DADOS = /\.(txt|csv)$/i;
const PADRAO = /[*?[]/;

export async function conferirArquivoNegocios(caminho: string): Promise<void> {
  const info = await stat(caminho).catch((erro: NodeJS.ErrnoException) => {
    if (erro.code === "ENOENT")
      throw new Error(
        `o arquivo ${caminho} não existe (no Docker, monte a pasta no container; veja docs/dados-b3.md)`,
        { cause: erro },
      );
    throw new Error(`não deu para abrir ${caminho}: ${erro.message}`, { cause: erro });
  });
  if (!info.isFile()) throw new Error(`${caminho} não é um arquivo`);
  const ext = extname(caminho).toLowerCase();
  if (!(EXTENSOES_NEGOCIOS as readonly string[]).includes(ext))
    throw new Error(
      `${caminho}: aceito .zip, .txt ou .csv (o .zip baixado no BDI da B3, ou o .txt de dentro dele)`,
    );
}

/**
 * Os caminhos de `--arquivos`, absolutos, sem repetir. Um argumento com `*`, `?` ou `[`
 * é um padrão, expandido aqui (no Docker, o shell de fora não enxerga a pasta montada).
 */
export async function expandirCaminhos(argumentos: readonly string[], base: string): Promise<string[]> {
  const caminhos: string[] = [];
  for (const a of argumentos) {
    if (!PADRAO.test(a)) {
      caminhos.push(resolve(base, a));
      continue;
    }
    const achados: string[] = [];
    for await (const c of glob(a, { cwd: base })) achados.push(resolve(base, c));
    if (achados.length === 0) throw new Error(`nenhum arquivo casa com ${a}`);
    caminhos.push(...achados.sort());
  }
  return [...new Set(caminhos)];
}

/** Uma linha do arquivo da B3 tem ~70 caracteres; sem quebra de linha em 1 MB, não é o arquivo. */
const MAXIMO_LINHA = 1024 * 1024;
const PEDACO = 1024 * 1024;
const DEFLATE = 8;
const SEM_COMPRESSAO = 0;

const semCr = (l: string) => (l.endsWith("\r") ? l.slice(0, -1) : l);

/**
 * As linhas em blocos (as de cada pedaço lido), e não uma a uma: com ~8 milhões de
 * linhas, um passo assíncrono por linha custava mais do que ler e agregar. Com
 * `bytesEsperados`, confere no fim que veio exatamente esse tamanho.
 */
async function* blocosDe(stream: Readable, bytesEsperados?: number): AsyncGenerator<string[]> {
  const texto = new StringDecoder("utf8");
  let resto = "";
  let bytes = 0;
  try {
    for await (const pedaco of stream as AsyncIterable<Buffer>) {
      bytes += pedaco.length;
      if (bytes > LIMITE_DESCOMPACTADO)
        throw new Error("o arquivo passa de 4 GB: não é o arquivo de negócios");
      const linhas = (resto + texto.write(pedaco)).split("\n");
      resto = linhas.pop() ?? "";
      if (resto.length > MAXIMO_LINHA)
        throw new Error("linha longa demais: não é o arquivo de negócios da B3");
      if (linhas.length > 0) yield linhas.map(semCr);
    }
    resto += texto.end();
    if (bytesEsperados !== undefined && bytes !== bytesEsperados)
      throw new Error("o .zip está corrompido: o arquivo de dentro não tem o tamanho declarado");
    if (resto !== "") yield [semCr(resto)];
  } finally {
    stream.destroy();
  }
}

function listarItens(zip: ZipFile): Promise<Entry[]> {
  return new Promise((ok, falha) => {
    const itens: Entry[] = [];
    zip.on("entry", (e: Entry) => {
      itens.push(e);
      zip.readEntry();
    });
    zip.once("end", () => ok(itens));
    zip.once("error", falha);
    zip.readEntry();
  });
}

async function itemDeDados(zip: ZipFile, caminho: string): Promise<Entry> {
  if (zip.entryCount > MAXIMO_ITENS_ZIP)
    throw new Error(`${caminho} tem ${zip.entryCount} itens; o .zip da B3 tem um .txt só`);
  const dados = (await listarItens(zip)).filter((e) => !e.fileName.endsWith("/") && DADOS.test(e.fileName));
  const [item] = dados;
  if (!item || dados.length > 1)
    throw new Error(`${caminho} não tem um arquivo .txt ou .csv dentro (ou tem mais de um)`);
  if (item.uncompressedSize > LIMITE_DESCOMPACTADO)
    throw new Error(`${caminho}: o arquivo de dentro passa de 4 GB descompactado`);
  if (item.compressionMethod !== DEFLATE && item.compressionMethod !== SEM_COMPRESSAO)
    throw new Error(
      `${caminho}: compressão ${item.compressionMethod} não suportada (o .zip da B3 usa deflate)`,
    );
  return item;
}

async function abrirZip(caminho: string): Promise<ZipFile> {
  try {
    return await yauzl.openPromise(caminho, { lazyEntries: true, autoClose: false });
  } catch (erro) {
    throw new Error(`não deu para abrir o .zip ${caminho}: ${(erro as Error).message}`, { cause: erro });
  }
}

/** As linhas do arquivo, do começo, em blocos; cada chamada abre o arquivo de novo. */
export async function* blocosDoArquivo(caminho: string): AsyncGenerator<string[]> {
  if (extname(caminho).toLowerCase() !== ".zip") {
    yield* blocosDe(createReadStream(caminho, { highWaterMark: PEDACO }));
    return;
  }
  const zip = await abrirZip(caminho);
  try {
    const item = await itemDeDados(zip, caminho);
    if (item.compressionMethod === SEM_COMPRESSAO) {
      yield* blocosDe(await zip.openReadStreamPromise(item), item.uncompressedSize);
      return;
    }
    const bruto = await zip.openReadStreamPromise(item, { decompress: false });
    // O erro de um lado chega ao outro: quem lê `inflar` recebe a falha da leitura do zip.
    const inflar = pipeline(bruto, createInflateRaw({ chunkSize: PEDACO }), () => undefined);
    yield* blocosDe(inflar, item.uncompressedSize);
  } finally {
    zip.close();
  }
}
