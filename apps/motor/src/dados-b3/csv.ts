import { MS_POR_INTERVALO } from "@zentrade/contratos";
import { dec, type Candle, type Valor } from "@zentrade/dominio";
import { montarCandle } from "./candle.js";
import { instanteLocal, type Fuso } from "./fuso.js";
import type { IntervaloB3 } from "./pregao.js";

/**
 * Candles de um arquivo CSV, em dois formatos:
 *
 * - **MetaTrader 5** (Símbolos → Barras → Exportar): separado por tabulação, cabeçalho
 *   `<DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL> <VOL> <SPREAD>`, data
 *   `AAAA.MM.DD`, hora `HH:MM[:SS]`. O volume é `<VOL>` (contratos); sem ela, `<TICKVOL>`.
 * - **genérico**: cabeçalho `data,hora,abertura,maxima,minima,fechamento,volume` (em
 *   qualquer ordem, com ou sem acento), separado por vírgula ou ponto e vírgula, data
 *   `AAAA-MM-DD` ou `DD/MM/AAAA`. Com ponto e vírgula vale o costume brasileiro:
 *   `128.000,50`.
 *
 * O horário de cada linha é lido no `fuso` dado (o do servidor do MT5, que varia de
 * corretora para corretora). Linha estranha não para a leitura: vai para `ignoradas`
 * com o número da linha e o motivo.
 */
export type FormatoCsv = "mt5" | "generico";

export interface OpcoesCsv {
  readonly intervalo: IntervaloB3;
  readonly fuso: Fuso;
  /** Sem isso, o formato é reconhecido pelo cabeçalho. */
  readonly formato?: FormatoCsv | "auto";
}

export interface LinhaIgnorada {
  readonly linha: number;
  readonly motivo: string;
}

export interface CsvLido {
  readonly formato: FormatoCsv;
  /** Em ordem, sem aberturas repetidas (vale a última linha). */
  readonly candles: Candle[];
  readonly ignoradas: LinhaIgnorada[];
  readonly repetidos: number;
}

type Campo = "data" | "hora" | "abre" | "maxima" | "minima" | "fecha" | "volume";
type Colunas = Readonly<Record<Campo, number>>;

const NOMES_MT5: Readonly<Record<string, Campo>> = {
  "<DATE>": "data",
  "<TIME>": "hora",
  "<OPEN>": "abre",
  "<HIGH>": "maxima",
  "<LOW>": "minima",
  "<CLOSE>": "fecha",
  "<VOL>": "volume",
};

const NOMES_GENERICO: Readonly<Record<string, Campo>> = {
  data: "data",
  hora: "hora",
  abertura: "abre",
  maxima: "maxima",
  minima: "minima",
  fechamento: "fecha",
  volume: "volume",
};

const OBRIGATORIOS_GENERICO = Object.keys(NOMES_GENERICO);
const FORMATOS_ACEITOS =
  "use a exportação do MetaTrader 5 (<DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL> <VOL> <SPREAD>) ou um CSV com o cabeçalho data,hora,abertura,maxima,minima,fechamento,volume";

/** UTF-16 (com ou sem BOM, como o MT5 costuma salvar) ou UTF-8. */
function decodificar(conteudo: Buffer | string): string {
  if (typeof conteudo === "string") return conteudo.replace(/^\uFEFF/, "");
  if (conteudo[0] === 0xff && conteudo[1] === 0xfe) return conteudo.subarray(2).toString("utf16le");
  const amostra = conteudo.subarray(0, 200);
  const zerosImpares = amostra.filter((b, i) => i % 2 === 1 && b === 0).length;
  if (amostra.length > 1 && zerosImpares >= amostra.length / 4) return conteudo.toString("utf16le");
  return conteudo.toString("utf8").replace(/^\uFEFF/, "");
}

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

function separadorDo(cabecalho: string): string {
  if (cabecalho.includes("\t")) return "\t";
  return cabecalho.includes(";") ? ";" : ",";
}

function colunasMt5(nomes: readonly string[]): Colunas | null {
  if (!nomes.includes("<DATE>") || !nomes.includes("<TIME>")) return null;
  const pos: Partial<Record<Campo, number>> = {};
  nomes.forEach((n, i) => {
    const campo = NOMES_MT5[n.toUpperCase()];
    if (campo) pos[campo] = i;
  });
  const tickvol = nomes.findIndex((n) => n.toUpperCase() === "<TICKVOL>");
  if (pos.volume === undefined && tickvol >= 0) pos.volume = tickvol;
  const faltando = (["abre", "maxima", "minima", "fecha", "volume"] as const).filter(
    (c) => pos[c] === undefined,
  );
  if (faltando.length > 0)
    throw new RangeError(
      `o cabeçalho do MT5 não tem todas as colunas de preço e volume; ${FORMATOS_ACEITOS}`,
    );
  return pos as Colunas;
}

function colunasGenerico(nomes: readonly string[]): Colunas | null {
  const normais = nomes.map(semAcento);
  if (!normais.includes("data") || !normais.includes("hora")) return null;
  const falta = OBRIGATORIOS_GENERICO.find((c) => !normais.includes(c));
  if (falta) throw new RangeError(`no CSV genérico, falta a coluna ${falta}; ${FORMATOS_ACEITOS}`);
  return Object.fromEntries(
    OBRIGATORIOS_GENERICO.map((c) => [NOMES_GENERICO[c], normais.indexOf(c)]),
  ) as unknown as Colunas;
}

function reconhecer(
  nomes: readonly string[],
  pedido: OpcoesCsv["formato"],
): { formato: FormatoCsv; colunas: Colunas } {
  const mt5 = pedido === "generico" ? null : colunasMt5(nomes);
  if (mt5) return { formato: "mt5", colunas: mt5 };
  const generico = pedido === "mt5" ? null : colunasGenerico(nomes);
  if (generico) return { formato: "generico", colunas: generico };
  const qual =
    pedido && pedido !== "auto" ? `o cabeçalho não é do formato ${pedido}; ` : "cabeçalho não reconhecido; ";
  throw new RangeError(qual + FORMATOS_ACEITOS);
}

const DATA = [
  { re: /^(\d{4})[.-](\d{2})[.-](\d{2})$/, ano: 1, mes: 2, dia: 3 },
  { re: /^(\d{2})\/(\d{2})\/(\d{4})$/, ano: 3, mes: 2, dia: 1 },
] as const;
const HORA = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function lerData(texto: string): { ano: number; mes: number; dia: number } | null {
  for (const f of DATA) {
    const m = f.re.exec(texto);
    if (!m) continue;
    const ano = Number(m[f.ano]);
    const mes = Number(m[f.mes]);
    const dia = Number(m[f.dia]);
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    const existe = d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
    return existe ? { ano, mes, dia } : null;
  }
  return null;
}

function lerHora(texto: string): { hora: number; minuto: number; segundo: number } | null {
  const m = HORA.exec(texto);
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  const segundo = Number(m[3] ?? 0);
  return hora < 24 && minuto < 60 && segundo < 60 ? { hora, minuto, segundo } : null;
}

const MILHAR = /^\d{1,3}(\.\d{3})+$/;
const NUMERO = /^-?\d+(\.\d+)?$/;

/** Número decimal; com `;` como separador, `128.000,50` (costume brasileiro). */
function lerNumero(texto: string, brasileiro: boolean): Valor | null {
  let t = texto.trim();
  if (brasileiro && (t.includes(",") || MILHAR.test(t))) t = t.replaceAll(".", "").replace(",", ".");
  return NUMERO.test(t) ? dec(t) : null;
}

type Leitura = { readonly candle: Candle } | { readonly motivo: string };

function lerLinha(
  campos: readonly string[],
  c: Colunas,
  o: OpcoesCsv,
  brasileiro: boolean,
  minimoCampos: number,
): Leitura {
  if (campos.length < minimoCampos)
    return { motivo: `${campos.length} colunas, o cabeçalho tem pelo menos ${minimoCampos}` };
  const data = lerData(campos[c.data]?.trim() ?? "");
  if (!data) return { motivo: `data inválida: "${campos[c.data]?.trim() ?? ""}"` };
  const hora = lerHora(campos[c.hora]?.trim() ?? "");
  if (!hora) return { motivo: `hora inválida: "${campos[c.hora]?.trim() ?? ""}"` };
  const numeros = (["abre", "maxima", "minima", "fecha", "volume"] as const).map((k) =>
    lerNumero(campos[c[k]] ?? "", brasileiro),
  );
  const [abre, maxima, minima, fecha, volume] = numeros;
  if (!abre || !maxima || !minima || !fecha || !volume)
    return { motivo: "número inválido em preço ou volume" };
  const ms = MS_POR_INTERVALO[o.intervalo];
  const abertura = instanteLocal({ ...data, ...hora }, o.fuso);
  if (abertura % ms !== 0) return { motivo: `horário fora da grade de ${o.intervalo}` };
  return montarCandle(abertura, ms, { abre, maxima, minima, fecha, volume });
}

export function lerCsvCandles(conteudo: Buffer | string, o: OpcoesCsv): CsvLido {
  const linhas = decodificar(conteudo).split(/\r?\n/);
  const inicio = linhas.findIndex((l) => l.trim() !== "");
  const cabecalho = linhas[inicio];
  if (inicio < 0 || cabecalho === undefined) throw new RangeError("o arquivo está vazio");
  const separador = separadorDo(cabecalho);
  const nomes = cabecalho.split(separador).map((n) => n.trim());
  const { formato, colunas } = reconhecer(nomes, o.formato);
  const minimoCampos = Math.max(...Object.values(colunas)) + 1;
  const porAbertura = new Map<number, Candle>();
  const ignoradas: LinhaIgnorada[] = [];
  let repetidos = 0;
  linhas.forEach((texto, i) => {
    if (i <= inicio || texto.trim() === "" || texto.trim() === cabecalho.trim()) return;
    const lido = lerLinha(texto.split(separador), colunas, o, separador === ";", minimoCampos);
    if ("motivo" in lido) {
      ignoradas.push({ linha: i + 1, motivo: lido.motivo });
      return;
    }
    if (porAbertura.has(lido.candle.abertura)) repetidos++;
    porAbertura.set(lido.candle.abertura, lido.candle);
  });
  const candles = [...porAbertura.values()].sort((a, b) => a.abertura - b.abertura);
  return { formato, candles, ignoradas, repetidos };
}
