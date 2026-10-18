import { FUSO_B3, instanteLocal, lerFuso } from "./fuso.js";

/**
 * Uma linha do arquivo "Negócio a negócio" da B3 (`DD-MM-AAAA_NEGOCIOSAVISTA`, o de
 * derivativos termina em `_DRV`), baixado à mão no BDI. Separado por `;`, com cabeçalho
 * e vírgula decimal:
 *
 * ```
 * DataReferencia;CodigoInstrumento;AcaoAtualizacao;PrecoNegocio;QuantidadeNegociada;HoraFechamento;CodigoIdentificadorNegocio;TipoSessaoPregao;DataNegocio;…
 * 2026-10-16;WINZ26;0;209500,000;4300;090055940;10;1;2026-10-16;88;88;1
 * ```
 *
 * Pelo glossário da B3 ("Negócios Listados"): `AcaoAtualizacao` 0 = negócio novo e
 * 2 = cancelado (a linha repete o número do negócio que cai); `HoraFechamento` é
 * HHMMSSmmm em UTC−3; `TipoSessaoPregao` 1 = sessão regular e 6 = after hours.
 * `QuantidadeNegociada` vem em contratos (no WIN, o mínimo é 1; veja docs/dados-b3.md).
 */
export type AcaoNegocio = "novo" | "cancelamento";

export interface Negocio {
  readonly instrumento: string;
  readonly acao: AcaoNegocio;
  /** `CodigoIdentificadorNegocio`: único por instrumento no dia. */
  readonly id: string;
  /** Preço em milésimos de ponto, inteiro: compara e soma sem ponto flutuante. */
  readonly precoMil: number;
  /** Em contratos. */
  readonly quantidade: number;
  /** Instante do negócio, em ms UTC. */
  readonly instante: number;
  readonly sessao: number;
  /** `DataNegocio`, AAAA-MM-DD: o dia do pregão. */
  readonly data: string;
}

export type NegocioLido = { readonly negocio: Negocio } | { readonly motivo: string };

type Campo = "instrumento" | "acao" | "preco" | "quantidade" | "hora" | "id" | "sessao" | "data";
export type ColunasNegocios = Readonly<Record<Campo, number>>;

const NOMES: Readonly<Record<string, Campo>> = {
  CodigoInstrumento: "instrumento",
  AcaoAtualizacao: "acao",
  PrecoNegocio: "preco",
  QuantidadeNegociada: "quantidade",
  HoraFechamento: "hora",
  CodigoIdentificadorNegocio: "id",
  TipoSessaoPregao: "sessao",
  DataNegocio: "data",
};

/** Contrato futuro do mini índice: WIN + mês de vencimento (F a Z) + ano com dois dígitos. */
export const CONTRATO_WIN = /^WIN[FGHJKMNQUVXZ]\d{2}$/;

export const SESSAO_REGULAR = 1;

const ACOES: Readonly<Record<string, AcaoNegocio>> = { "0": "novo", "2": "cancelamento" };

export function lerCabecalhoNegocios(linha: string): ColunasNegocios {
  const nomes = linha
    .replace(/^\uFEFF/, "")
    .trim()
    .split(";")
    .map((n) => n.trim());
  const pos: Partial<Record<Campo, number>> = {};
  nomes.forEach((n, i) => {
    const campo = NOMES[n];
    if (campo) pos[campo] = i;
  });
  const falta = Object.entries(NOMES).find(([, campo]) => pos[campo] === undefined);
  if (falta)
    throw new RangeError(
      `não é o arquivo "Negócio a negócio" da B3: falta a coluna ${falta[0]} no cabeçalho (veja docs/dados-b3.md)`,
    );
  return pos as ColunasNegocios;
}

/** Só algarismos de 0 a 9, sem sinal nem espaço (mais rápido que regex em ~8 milhões de linhas). */
function soDigitos(texto: string): boolean {
  if (texto === "") return false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

const CASAS_PRECO = 3;

/** "209500,000" → 209500000 (milésimos). Mais de 3 casas, milhar com ponto ou sinal: null. */
export function lerPrecoMil(texto: string): number | null {
  const virgula = texto.indexOf(",");
  const inteiro = virgula < 0 ? texto : texto.slice(0, virgula);
  const casas = virgula < 0 ? "0" : texto.slice(virgula + 1);
  if (!soDigitos(inteiro) || !soDigitos(casas) || casas.length > CASAS_PRECO) return null;
  const valor = Number(inteiro) * 1000 + Number(casas.padEnd(CASAS_PRECO, "0"));
  return Number.isSafeInteger(valor) ? valor : null;
}

const SAO_PAULO = lerFuso(FUSO_B3);
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA_MS = 3_600_000;

/**
 * Meia-noite de Brasília do dia, contada a partir do meio-dia: o deslocamento do pregão
 * é o do meio do dia (na época do horário de verão, a virada era à meia-noite).
 */
function meiaNoiteDoPregao(data: string): number | null {
  const m = DATA.exec(data);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return instanteLocal({ ano, mes, dia, hora: 12, minuto: 0 }, SAO_PAULO) - 12 * HORA_MS;
}

/** "HHMMSSmmm" → ms desde a meia-noite; null se não tiver 9 algarismos ou a hora não existir. */
function msDoDia(hora: string): number | null {
  if (hora.length !== 9 || !soDigitos(hora)) return null;
  const par = (i: number) => (hora.charCodeAt(i) - 48) * 10 + hora.charCodeAt(i + 1) - 48;
  const h = par(0);
  const min = par(2);
  const s = par(4);
  if (h > 23 || min > 59 || s > 59) return null;
  return h * HORA_MS + min * 60_000 + s * 1000 + Number(hora.slice(6));
}

/** Data AAAA-MM-DD e hora HHMMSSmmm de Brasília → ms UTC. */
export function lerHoraB3(data: string, hora: string): number | null {
  const base = meiaNoiteDoPregao(data);
  const ms = msDoDia(hora);
  return base === null || ms === null ? null : base + ms;
}

const INTEIRO_POSITIVO = /^[1-9]\d*$/;

function lerCampos(campos: readonly string[], c: ColunasNegocios, base: number | null): NegocioLido {
  const texto = (k: Campo) => (campos[c[k]] ?? "").trim();
  const acao = ACOES[texto("acao")];
  if (!acao) return { motivo: `ação de atualização desconhecida: "${texto("acao")}"` };
  const precoMil = lerPrecoMil(texto("preco"));
  if (precoMil === null || precoMil <= 0) return { motivo: `preço inválido: "${texto("preco")}"` };
  const qtd = texto("quantidade");
  if (!INTEIRO_POSITIVO.test(qtd)) return { motivo: `quantidade inválida: "${qtd}"` };
  const ms = msDoDia(texto("hora"));
  if (base === null || ms === null)
    return { motivo: `data ou hora inválida: "${texto("data")} ${texto("hora")}"` };
  const sessao = texto("sessao");
  if (!INTEIRO_POSITIVO.test(sessao)) return { motivo: `sessão inválida: "${sessao}"` };
  const id = texto("id");
  if (id === "") return { motivo: "número do negócio vazio" };
  return {
    negocio: {
      instrumento: texto("instrumento"),
      acao,
      id,
      precoMil,
      quantidade: Number(qtd),
      instante: base + ms,
      sessao: Number(sessao),
      data: texto("data"),
    },
  };
}

/**
 * Leitor de linhas para um arquivo de cabeçalho `cabecalho`. Linha de instrumento que
 * não casa com `filtro` volta `null` sem ser lida (o arquivo de derivativos tem DI,
 * dólar e opções no meio). A meia-noite de cada data é calculada uma vez só.
 */
export function criarLeitorNegocios(
  cabecalho: string,
  filtro: RegExp = CONTRATO_WIN,
): (linha: string) => NegocioLido | null {
  const c = lerCabecalhoNegocios(cabecalho);
  const minimoCampos = Math.max(...Object.values(c)) + 1;
  // Só datas válidas entram no cache: um arquivo com lixo não faz o mapa crescer.
  const bases = new Map<string, number>();
  const baseDe = (data: string) => {
    const guardada = bases.get(data);
    if (guardada !== undefined) return guardada;
    const base = meiaNoiteDoPregao(data);
    if (base !== null) bases.set(data, base);
    return base;
  };
  return (linha) => {
    const campos = linha.split(";", minimoCampos);
    if (!filtro.test((campos[c.instrumento] ?? "").trim())) return null;
    if (campos.length < minimoCampos)
      return { motivo: `${campos.length} colunas, o cabeçalho tem pelo menos ${minimoCampos}` };
    return lerCampos(campos, c, baseDe((campos[c.data] ?? "").trim()));
  };
}
