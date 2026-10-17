import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { CandlesDoBanco } from "../backtest/candles-historicos.js";
import { lerCsvCandles, type LinhaIgnorada } from "./csv.js";
import type { FonteCandlesB3 } from "./fonte.js";
import { FUSO_B3, horaLocal, instanteLocal, lerFuso, type Fuso } from "./fuso.js";
import { gravarCandlesB3, type ResumoGravacao } from "./importar.js";
import { INTERVALOS_B3, SIMBOLOS_B3, type IntervaloB3 } from "./pregao.js";

const SAO_PAULO = lerFuso(FUSO_B3);
const DIA = 86_400_000;
/** Fim de semana mais um feriado emendado (carnaval): até aqui, começar depois do --desde é normal. */
const SEM_PREGAO_MAXIMO_MS = 5 * DIA;
/** A política de retenção da tabela candles (migração 0002) apaga o que passa de 3 anos. */
const RETENCAO_MS = 3 * 365 * DIA;
const MAXIMO_LINHAS_IGNORADAS = 20;
/** 10 anos de 5m do WIN dão uns 20 MB; acima disso, provavelmente não é o arquivo certo. */
export const LIMITE_ARQUIVO_BYTES = 256 * 1024 * 1024;

/** `--chave valor`; o resto é ignorado (o mesmo jeito dos comandos da API). */
export function lerArgumentos(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i];
    const proximo = argv[i + 1];
    if (atual?.startsWith("--") && proximo !== undefined && !proximo.startsWith("--")) {
      args[atual.slice(2)] = proximo;
      i++;
    }
  }
  return args;
}

/** Date.parse aceita 2026-02-30 (vira 2 de março); a volta para texto denuncia. */
const meiaNoiteUtc = (t: string) => new Date(`${t}T00:00:00Z`).toISOString();

const DataB3 = (nome: string) =>
  z
    .string({ error: `informe ${nome} AAAA-MM-DD` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${nome} no formato AAAA-MM-DD`)
    .refine((t) => !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && meiaNoiteUtc(t).startsWith(t), {
      error: `${nome} no formato AAAA-MM-DD (data que existe)`,
    });

const Intervalo = z.enum(INTERVALOS_B3, { error: `--intervalo aceita ${INTERVALOS_B3.join(", ")}` });

/** 00:00 de Brasília do dia `AAAA-MM-DD`. */
function meiaNoiteB3(texto: string): number {
  const [ano, mes, dia] = texto.split("-").map(Number);
  return instanteLocal({ ano: ano ?? 0, mes: mes ?? 1, dia: dia ?? 1, hora: 0, minuto: 0 }, SAO_PAULO);
}

const hojeB3 = (agora: number) => {
  const h = horaLocal(agora, SAO_PAULO);
  return `${h.ano}-${String(h.mes).padStart(2, "0")}-${String(h.dia).padStart(2, "0")}`;
};

/** "2026-07-01 10:00", no horário de Brasília. */
function quando(instante: number): string {
  const h = horaLocal(instante, SAO_PAULO);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${h.ano}-${p(h.mes)}-${p(h.dia)} ${p(h.hora)}:${p(h.minuto)}`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function linhaGravados(simbolo: string, r: ResumoGravacao): string {
  const partes = INTERVALOS_B3.filter((i) => r.gravados[i] !== undefined).map((i) => `${i} ${r.gravados[i]}`);
  return `gravados em ${simbolo}: ${partes.join(" · ")} (fora do pregão: ${r.foraDoPregao}; em formação: ${r.emFormacao})`;
}

function avisarRetencao(desde: number, agora: number, escrever: (l: string) => void): void {
  if (agora - desde > RETENCAO_MS)
    escrever(
      "aviso: o banco apaga candles com mais de 3 anos (política de retenção da tabela candles); o que for mais antigo some na próxima limpeza",
    );
}

// ---------------------------------------------------------------- importar-candles-b3

export interface DependenciasImportacaoB3 {
  readonly banco: CandlesDoBanco;
  /** Fontes registradas, pelo nome aceito em --fonte. */
  readonly fontes: Readonly<Record<string, () => FonteCandlesB3>>;
  readonly agora: () => number;
  readonly escrever: (linha: string) => void;
}

function argumentosB3(argv: readonly string[], fontes: readonly string[], agora: number) {
  const nomes = fontes.length > 0 ? fontes : ["brapi"];
  const Args = z.object({
    fonte: z
      .enum(nomes as [string, ...string[]], { error: `--fonte aceita ${nomes.join(", ")}` })
      .default("brapi"),
    intervalo: Intervalo.default("5m"),
    desde: DataB3("--desde"),
    ate: DataB3("--ate").optional(),
  });
  const lido = Args.safeParse(lerArgumentos(argv));
  if (!lido.success) throw new RangeError(lido.error.issues[0]?.message ?? "argumentos inválidos");
  const { fonte, intervalo, desde, ate = hojeB3(agora) } = lido.data;
  const inicio = meiaNoiteB3(desde);
  if (inicio > agora) throw new RangeError("--desde está no futuro");
  if (desde > ate) throw new RangeError("--desde é depois de --ate");
  return { fonte, intervalo, inicio, fim: meiaNoiteB3(ate) + DIA, desde };
}

/**
 * `importar-candles-b3 --fonte brapi --intervalo 5m --desde 2026-07-01 [--ate 2026-07-31]`:
 * busca o Ibovespa intradiário na fonte e grava como WIN-IBOV (mais 15m e 1h).
 */
export async function executarImportacaoB3(
  argv: readonly string[],
  d: DependenciasImportacaoB3,
): Promise<ResumoGravacao> {
  const agora = d.agora();
  const a = argumentosB3(argv, Object.keys(d.fontes), agora);
  const fonte = d.fontes[a.fonte]?.();
  if (!fonte) throw new RangeError(`--fonte ${a.fonte} não está disponível`);
  avisarRetencao(a.inicio, agora, d.escrever);
  const lote = await fonte.buscar({ intervalo: a.intervalo, desde: a.inicio, ate: a.fim });
  d.escrever(
    `${lote.descricao}: ${plural(lote.candles.length, "candle recebido", "candles recebidos")}, ${plural(lote.ignorados, "ignorado", "ignorados")} (sem preço ou com preço impossível)`,
  );
  const primeiro = lote.candles[0];
  const ultimo = lote.candles.at(-1);
  if (!primeiro || !ultimo) {
    d.escrever("nenhum candle no período: confira as datas (fim de semana e feriado não têm pregão)");
    return { gravados: { [a.intervalo]: 0 }, foraDoPregao: 0, emFormacao: 0 };
  }
  d.escrever(
    `do candle de ${quando(primeiro.abertura)} ao de ${quando(ultimo.abertura)} (horário de Brasília)`,
  );
  if (primeiro.abertura >= a.inicio + SEM_PREGAO_MAXIMO_MS)
    d.escrever(
      `aviso: a fonte só tem dados a partir de ${quando(primeiro.abertura).slice(0, 10)}; antes disso, ela não devolveu nada (limite de histórico do intervalo ou do plano)`,
    );
  const r = await gravarCandlesB3(d.banco, fonte.simbolo, a.intervalo, lote.candles, { agora });
  d.escrever(linhaGravados(fonte.simbolo, r));
  if (fonte.simbolo === "WIN-IBOV")
    d.escrever(
      "lembrete: WIN-IBOV é o Ibovespa à vista (cerca de 10:00 às 17:00), uma aproximação do WIN (09:00 às 18:25); veja docs/dados-b3.md",
    );
  return r;
}

// ---------------------------------------------------------------- importar-candles-csv

export interface DependenciasImportacaoCsv {
  readonly banco: CandlesDoBanco;
  readonly agora: () => number;
  readonly escrever: (linha: string) => void;
  readonly lerArquivo: (caminho: string) => Promise<Buffer>;
  /** De onde vale um --arquivo relativo (o comando usa INIT_CWD, a pasta em que o pnpm foi chamado). */
  readonly base: string;
}

const ArgsCsv = z.object({
  simbolo: z.enum(SIMBOLOS_B3, { error: `--simbolo aceita ${SIMBOLOS_B3.join(", ")}` }),
  intervalo: Intervalo,
  arquivo: z.string({ error: "informe o arquivo em --arquivo" }).min(1, "informe o arquivo em --arquivo"),
  fuso: z.string().default(FUSO_B3),
  formato: z
    .enum(["auto", "mt5", "generico"], { error: "--formato aceita auto, mt5, generico" })
    .default("auto"),
});

function argumentosCsv(argv: readonly string[]): z.infer<typeof ArgsCsv> & { fusoLido: Fuso } {
  const lido = ArgsCsv.safeParse(lerArgumentos(argv));
  if (!lido.success) throw new RangeError(lido.error.issues[0]?.message ?? "argumentos inválidos");
  return { ...lido.data, fusoLido: lerFuso(lido.data.fuso) };
}

function escreverIgnoradas(ignoradas: readonly LinhaIgnorada[], escrever: (l: string) => void): void {
  ignoradas.slice(0, MAXIMO_LINHAS_IGNORADAS).forEach((l) => escrever(`  linha ${l.linha}: ${l.motivo}`));
  if (ignoradas.length > MAXIMO_LINHAS_IGNORADAS)
    escrever(`  … e mais ${ignoradas.length - MAXIMO_LINHAS_IGNORADAS}`);
}

/**
 * `importar-candles-csv --simbolo WIN --intervalo 5m --arquivo <csv> [--fuso America/Sao_Paulo]
 * [--formato auto|mt5|generico]`: lê o CSV (MetaTrader 5 ou genérico) e grava (mais 15m e 1h).
 */
export async function executarImportacaoCsv(
  argv: readonly string[],
  d: DependenciasImportacaoCsv,
): Promise<ResumoGravacao> {
  const a = argumentosCsv(argv);
  const caminho = resolve(d.base, a.arquivo);
  const lido = lerCsvCandles(await d.lerArquivo(caminho), {
    intervalo: a.intervalo as IntervaloB3,
    fuso: a.fusoLido,
    formato: a.formato,
  });
  d.escrever(
    `${a.arquivo}: formato ${lido.formato}, ${plural(lido.candles.length, "candle lido", "candles lidos")}, ${plural(lido.repetidos, "repetido", "repetidos")} (vale a última linha), ${plural(lido.ignoradas.length, "linha ignorada", "linhas ignoradas")}`,
  );
  escreverIgnoradas(lido.ignoradas, d.escrever);
  const primeiro = lido.candles[0];
  if (!primeiro) throw new RangeError("nenhum candle válido no arquivo: confira o formato e o --intervalo");
  avisarRetencao(primeiro.abertura, d.agora(), d.escrever);
  const r = await gravarCandlesB3(d.banco, a.simbolo, a.intervalo, lido.candles, { agora: d.agora() });
  d.escrever(linhaGravados(a.simbolo, r));
  if (r.primeiro !== undefined && r.ultimo !== undefined)
    d.escrever(`do candle de ${quando(r.primeiro)} ao de ${quando(r.ultimo)} (horário de Brasília)`);
  return r;
}

/** Lê um arquivo comum de até `limite` bytes, com mensagens que dizem o que fazer. */
export async function lerArquivoLimitado(caminho: string, limite = LIMITE_ARQUIVO_BYTES): Promise<Buffer> {
  const info = await stat(caminho).catch(() => null);
  if (!info)
    throw new Error(
      `o arquivo ${caminho} não existe (no Docker, monte o arquivo no container; veja docs/dados-b3.md)`,
    );
  if (!info.isFile()) throw new Error(`${caminho} não é um arquivo`);
  if (info.size > limite) throw new Error(`${caminho} passa de ${Math.floor(limite / 1024 / 1024)} MB`);
  return readFile(caminho);
}
