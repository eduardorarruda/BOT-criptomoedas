/**
 * O fuso da instância (ZENTRADE_FUSO): o que é "hoje" para a perda do dia, o resultado
 * do dia, o orçamento de IA e o que o assistente diz. Instantes continuam em ms UTC;
 * só os limites de dia e de mês mudam. Funciona com fusos que têm horário de verão
 * (dias de 23 e 25 horas): nada aqui supõe que um dia tem 24 h.
 */
export const FUSO_PADRAO = "America/Sao_Paulo";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
/** As mudanças de fuso caem em múltiplos de 15 min em UTC (hora cheia local, fusos de :30 e :45). */
const BLOCO = 15 * MINUTO;
const LIMITE_CACHE = 200_000;
/** Nome IANA (Regiao/Cidade, Etc/GMT+3) ou UTC: nada de abreviação (EST) nem deslocamento solto. */
const NOME_IANA = /^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+)+)$/;

interface Relogio {
  readonly formato: Intl.DateTimeFormat;
  readonly deslocamentos: Map<number, number>;
}

const relogios = new Map<string, Relogio>();

function erroFuso(nome: string): RangeError {
  return new RangeError(
    `fuso desconhecido: "${nome}". Use um nome IANA, como America/Sao_Paulo (horário de Brasília), America/New_York ou UTC.`,
  );
}

function criarFormato(nome: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: nome,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
}

/** O nome canônico (America/Sao_Paulo) de um fuso válido; RangeError com explicação se não for. */
export function exigirFuso(nome: string): string {
  const t = nome.trim();
  if (!NOME_IANA.test(t)) throw erroFuso(nome);
  try {
    return criarFormato(t).resolvedOptions().timeZone;
  } catch {
    throw erroFuso(nome);
  }
}

export function fusoValido(nome: string): boolean {
  try {
    exigirFuso(nome);
    return true;
  } catch {
    return false;
  }
}

function relogio(fuso: string): Relogio {
  const salvo = relogios.get(fuso);
  if (salvo) return salvo;
  const novo = { formato: criarFormato(exigirFuso(fuso)), deslocamentos: new Map<number, number>() };
  relogios.set(fuso, novo);
  return novo;
}

/** Hora local − UTC, em ms, no instante dado (guardada por bloco de 15 min). */
export function deslocamentoNoFuso(ms: number, fuso: string): number {
  const r = relogio(fuso);
  const bloco = Math.floor(ms / BLOCO);
  const salvo = r.deslocamentos.get(bloco);
  if (salvo !== undefined) return salvo;
  const inicio = bloco * BLOCO;
  const p = Object.fromEntries(r.formato.formatToParts(inicio).map((x) => [x.type, Number(x.value)]));
  const local = Date.UTC(
    p["year"] ?? 1970,
    (p["month"] ?? 1) - 1,
    p["day"] ?? 1,
    p["hour"] ?? 0,
    p["minute"] ?? 0,
    p["second"] ?? 0,
  );
  if (r.deslocamentos.size >= LIMITE_CACHE) r.deslocamentos.clear();
  r.deslocamentos.set(bloco, local - inicio);
  return local - inicio;
}

export interface HoraNoFuso {
  /** Data local, "AAAA-MM-DD". */
  readonly dia: string;
  readonly ano: number;
  /** 1 a 12. */
  readonly mes: number;
  readonly diaDoMes: number;
  readonly hora: number;
  readonly minuto: number;
  /** Minutos desde a meia-noite local. */
  readonly minutos: number;
  /** 0 = domingo. */
  readonly diaSemana: number;
}

/** Data e hora de parede no fuso. */
export function horaNoFuso(ms: number, fuso: string): HoraNoFuso {
  const local = new Date(ms + deslocamentoNoFuso(ms, fuso));
  const hora = local.getUTCHours();
  const minuto = local.getUTCMinutes();
  return {
    dia: local.toISOString().slice(0, 10),
    ano: local.getUTCFullYear(),
    mes: local.getUTCMonth() + 1,
    diaDoMes: local.getUTCDate(),
    hora,
    minuto,
    minutos: hora * 60 + minuto,
    diaSemana: local.getUTCDay(),
  };
}

/** "AAAA-MM-DD" do dia local. */
export const diaNoFuso = (ms: number, fuso: string): string =>
  new Date(ms + deslocamentoNoFuso(ms, fuso)).toISOString().slice(0, 10);

/** "AAAA-MM" do mês local. */
export const mesNoFuso = (ms: number, fuso: string): string => diaNoFuso(ms, fuso).slice(0, 7);

/** O dia local como número (dias desde 1970): para comparar dias sem montar texto. */
export const chaveDiaNoFuso = (ms: number, fuso: string): number =>
  Math.floor((ms + deslocamentoNoFuso(ms, fuso)) / DIA);

/**
 * O primeiro instante (ms UTC) do dia local `ano-mes-dia`. Tenta o deslocamento da
 * meia-noite (o caso comum) e confere; numa virada de horário à meia-noite (o Brasil
 * até 2019) ou num dia que não existiu, procura por bisseção o primeiro instante do dia.
 */
function inicioDoDiaLocal(ano: number, mes: number, dia: number, fuso: string): number {
  const meiaNoite = Date.UTC(ano, mes - 1, dia);
  const alvo = Math.floor(meiaNoite / DIA);
  const ehInicio = (t: number) => chaveDiaNoFuso(t, fuso) === alvo && chaveDiaNoFuso(t - 1, fuso) < alvo;
  const primeiro = meiaNoite - deslocamentoNoFuso(meiaNoite, fuso);
  if (ehInicio(primeiro)) return primeiro;
  const segundo = meiaNoite - deslocamentoNoFuso(primeiro, fuso);
  if (ehInicio(segundo)) return segundo;
  // Os deslocamentos ficam entre −12 h e +14 h: o começo do dia está nesta janela.
  let antes = meiaNoite - 16 * HORA;
  let depois = meiaNoite + 16 * HORA;
  while (depois - antes > 1) {
    const meio = Math.floor((antes + depois) / 2);
    if (chaveDiaNoFuso(meio, fuso) >= alvo) depois = meio;
    else antes = meio;
  }
  return depois;
}

/** 00:00 (hora local) do dia de `ms`: o "hoje" começa aqui. */
export function inicioDoDiaNoFuso(ms: number, fuso: string): number {
  const h = horaNoFuso(ms, fuso);
  return inicioDoDiaLocal(h.ano, h.mes, h.diaDoMes, fuso);
}

/** 00:00 (hora local) do dia seguinte ao de `ms`: quando o "hoje" vira. */
export function inicioDoProximoDiaNoFuso(ms: number, fuso: string): number {
  const h = horaNoFuso(ms, fuso);
  return inicioDoDiaLocal(h.ano, h.mes, h.diaDoMes + 1, fuso);
}

/** 00:00 (hora local) do dia 1 do mês de `ms`. */
export function inicioDoMesNoFuso(ms: number, fuso: string): number {
  const h = horaNoFuso(ms, fuso);
  return inicioDoDiaLocal(h.ano, h.mes, 1, fuso);
}

/** 00:00 (hora local) do dia 1 do mês seguinte ao de `ms`. */
export function inicioDoProximoMesNoFuso(ms: number, fuso: string): number {
  const h = horaNoFuso(ms, fuso);
  return inicioDoDiaLocal(h.ano, h.mes + 1, 1, fuso);
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-01" → 00:00 local daquele dia, em ms UTC. Recusa data que não existe. */
export function inicioDoDiaDaData(data: string, fuso: string): number {
  const m = DATA.exec(data);
  const [ano, mes, dia] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (!m || d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
    throw new RangeError(`data inválida: "${data}" (use AAAA-MM-DD, como 2026-10-17)`);
  return inicioDoDiaLocal(ano, mes, dia, fuso);
}

const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

/** "17/10/2026" (ou "17/10" com `curta`) no fuso. */
export function formatarDataNoFuso(ms: number, fuso: string, o: { readonly curta?: boolean } = {}): string {
  const h = horaNoFuso(ms, fuso);
  const diaMes = `${doisDigitos(h.diaDoMes)}/${doisDigitos(h.mes)}`;
  return o.curta ? diaMes : `${diaMes}/${h.ano}`;
}

/** "17/10/2026 22:52" no fuso. */
export function formatarDataHoraNoFuso(ms: number, fuso: string): string {
  const h = horaNoFuso(ms, fuso);
  return `${formatarDataNoFuso(ms, fuso)} ${doisDigitos(h.hora)}:${doisDigitos(h.minuto)}`;
}

/**
 * O "agora" para quem lê (o assistente, o analista): a hora local com o dia da semana, o
 * fuso e o UTC, sem ambiguidade. Ex.: "sábado, 17/10/2026 22:52 (America/Sao_Paulo; UTC
 * 2026-10-18T01:52Z)".
 */
export function descreverAgora(ms: number, fuso: string): string {
  const h = horaNoFuso(ms, fuso);
  const utc = `${new Date(ms).toISOString().slice(0, 16)}Z`;
  return `${DIAS_DA_SEMANA[h.diaSemana]}, ${formatarDataHoraNoFuso(ms, fuso)} (${exigirFuso(fuso)}; UTC ${utc})`;
}

/** O nome do fuso para gente, em pt-BR: "horário de Brasília", "horário do Leste", "UTC". */
export function nomeDoFuso(fuso: string): string {
  const nome = exigirFuso(fuso);
  if (nome === "UTC" || nome === "Etc/UTC") return "UTC";
  const parte = new Intl.DateTimeFormat("pt-BR", { timeZone: nome, timeZoneName: "longGeneric" })
    .formatToParts(0)
    .find((p) => p.type === "timeZoneName")?.value;
  if (!parte || /^GMT|^UTC/.test(parte)) return nome;
  const semPadrao = parte.replace(" Padrão", "");
  return semPadrao.charAt(0).toLowerCase() + semPadrao.slice(1);
}
