import { MS_POR_INTERVALO } from "@zentrade/contratos";
import type { LinhaIgnorada } from "./csv.js";
import { CONTRATO_WIN, SESSAO_REGULAR, criarLeitorNegocios, type Negocio } from "./negocios.js";
import { noPregaoB3 } from "./pregao.js";

/**
 * Lê o arquivo "Negócio a negócio" da B3 linha a linha (são ~7 milhões de linhas por dia
 * no WIN) e já agrega cada contrato do WIN em barras de 5 minutos: nada do arquivo fica
 * na memória além de uma barra por contrato e intervalo com negócio.
 *
 * - só a sessão regular (`TipoSessaoPregao` 1) entra; o after hours é contado e ignorado;
 * - negócio cancelado (linha com ação 2 e o mesmo número) não entra: como o cancelamento
 *   pode vir depois do negócio, o arquivo é lido de novo, só quando houver cancelamento;
 * - a barra fica com o primeiro e o último negócio pelo horário (e, no mesmo milissegundo,
 *   pelo número do negócio), não pela ordem das linhas;
 * - barra fora do pregão regular (`noPregaoB3`: 09:00 até antes de 18:25, que deixa de
 *   fora o leilão de fechamento) é contada, mas não volta.
 */
export interface BarraMil {
  readonly abertura: number;
  readonly abreMil: number;
  readonly maximaMil: number;
  readonly minimaMil: number;
  readonly fechaMil: number;
  /** Em contratos. */
  readonly volume: number;
  readonly negocios: number;
}

export interface ContratoNoDia {
  readonly instrumento: string;
  /** Negócios e contratos da sessão regular do dia, já sem os cancelados. */
  readonly negocios: number;
  readonly quantidade: number;
  /** Só as do pregão regular, em ordem. */
  readonly barras: readonly BarraMil[];
  readonly negociosNoPregao: number;
  readonly negociosForaDoPregao: number;
  /** O último negócio do dia, contando o leilão de fechamento (o "fechamento" do BDI). */
  readonly ultimoMil: number;
}

export interface DiaDeNegocios {
  readonly data: string;
  /** Do mais negociado (em contratos) ao menos negociado. */
  readonly contratos: readonly ContratoNoDia[];
}

export interface LeituraNegocios {
  readonly dias: readonly DiaDeNegocios[];
  /** Linhas de negócio lidas (de todos os ativos), sem o cabeçalho. */
  readonly linhas: number;
  readonly ignoradas: readonly LinhaIgnorada[];
  readonly totalIgnoradas: number;
  readonly outraSessao: number;
  /** Chaves `data|instrumento|número` dos negócios do WIN cancelados no arquivo. */
  readonly cancelamentos: ReadonlySet<string>;
  /** Negócios que estavam em `excluir` e ficaram de fora. */
  readonly cancelados: number;
}

const M5 = MS_POR_INTERVALO["5m"];
const MAXIMO_IGNORADAS = 20;

/** Um negócio no tempo: horário e, no mesmo milissegundo, o número do negócio. */
interface Marca {
  readonly instante: number;
  readonly ordem: number;
  readonly precoMil: number;
}

const antes = (a: Marca, b: Marca) =>
  a.instante < b.instante || (a.instante === b.instante && a.ordem < b.ordem);

// As estruturas de acumulação abaixo são mutáveis de propósito: são milhões de negócios
// por arquivo, e uma cópia por negócio custaria mais do que a leitura inteira. Elas não
// saem deste módulo: o resultado é montado em objetos novos no fim.
interface BarraAcumulada {
  primeiro: Marca;
  ultimo: Marca;
  maximaMil: number;
  minimaMil: number;
  volume: number;
  negocios: number;
}

interface ContratoAcumulado {
  negocios: number;
  quantidade: number;
  ultimo: Marca;
  readonly barras: Map<number, BarraAcumulada>;
}

export const chaveNegocio = (n: Pick<Negocio, "data" | "instrumento" | "id">) =>
  `${n.data}|${n.instrumento}|${n.id}`;

function somar(c: ContratoAcumulado, n: Negocio): void {
  const marca: Marca = { instante: n.instante, ordem: Number(n.id) || 0, precoMil: n.precoMil };
  c.negocios++;
  c.quantidade += n.quantidade;
  if (antes(c.ultimo, marca)) c.ultimo = marca;
  const abertura = n.instante - (n.instante % M5);
  const b = c.barras.get(abertura);
  if (!b) {
    c.barras.set(abertura, {
      primeiro: marca,
      ultimo: marca,
      maximaMil: n.precoMil,
      minimaMil: n.precoMil,
      volume: n.quantidade,
      negocios: 1,
    });
    return;
  }
  if (antes(marca, b.primeiro)) b.primeiro = marca;
  if (antes(b.ultimo, marca)) b.ultimo = marca;
  b.maximaMil = Math.max(b.maximaMil, n.precoMil);
  b.minimaMil = Math.min(b.minimaMil, n.precoMil);
  b.volume += n.quantidade;
  b.negocios++;
}

function fecharContrato(instrumento: string, c: ContratoAcumulado): ContratoNoDia {
  const todas = [...c.barras.entries()].sort(([a], [b]) => a - b);
  const noPregao = todas.filter(([abertura]) => noPregaoB3(abertura));
  const negociosNoPregao = noPregao.reduce((s, [, b]) => s + b.negocios, 0);
  return {
    instrumento,
    negocios: c.negocios,
    quantidade: c.quantidade,
    barras: noPregao.map(([abertura, b]) => ({
      abertura,
      abreMil: b.primeiro.precoMil,
      maximaMil: b.maximaMil,
      minimaMil: b.minimaMil,
      fechaMil: b.ultimo.precoMil,
      volume: b.volume,
      negocios: b.negocios,
    })),
    negociosNoPregao,
    negociosForaDoPregao: c.negocios - negociosNoPregao,
    ultimoMil: c.ultimo.precoMil,
  };
}

function fecharDias(porDia: ReadonlyMap<string, ReadonlyMap<string, ContratoAcumulado>>): DiaDeNegocios[] {
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, contratos]) => ({
      data,
      contratos: [...contratos.entries()]
        .map(([nome, c]) => fecharContrato(nome, c))
        .sort((a, b) => b.quantidade - a.quantidade || a.instrumento.localeCompare(b.instrumento)),
    }));
}

function contratoNovo(n: Negocio): ContratoAcumulado {
  return {
    negocios: 0,
    quantidade: 0,
    ultimo: { instante: -Infinity, ordem: 0, precoMil: n.precoMil },
    barras: new Map(),
  };
}

/** O estado de uma leitura: os contratos por dia e as contagens do que ficou de fora. */
function criarAcumulador(excluir: ReadonlySet<string>) {
  const porDia = new Map<string, Map<string, ContratoAcumulado>>();
  const cancelamentos = new Set<string>();
  const ignoradas: LinhaIgnorada[] = [];
  const conta = { totalIgnoradas: 0, outraSessao: 0, cancelados: 0 };

  function adicionar(n: Negocio): void {
    if (n.acao === "cancelamento") {
      cancelamentos.add(chaveNegocio(n));
      return;
    }
    if (n.sessao !== SESSAO_REGULAR) {
      conta.outraSessao++;
      return;
    }
    if (excluir.size > 0 && excluir.has(chaveNegocio(n))) {
      conta.cancelados++;
      return;
    }
    const dia = porDia.get(n.data) ?? new Map<string, ContratoAcumulado>();
    porDia.set(n.data, dia);
    const c = dia.get(n.instrumento) ?? contratoNovo(n);
    dia.set(n.instrumento, c);
    somar(c, n);
  }

  function ignorar(linha: number, motivo: string): void {
    conta.totalIgnoradas++;
    if (ignoradas.length < MAXIMO_IGNORADAS) ignoradas.push({ linha, motivo });
  }

  const resultado = (linhas: number): LeituraNegocios => ({
    dias: fecharDias(porDia),
    linhas,
    ignoradas,
    ...conta,
    cancelamentos,
  });

  return { adicionar, ignorar, resultado };
}

/**
 * Uma leitura do arquivo (as linhas em blocos, na ordem); negócios em `excluir` (chaves
 * de `chaveNegocio`) ficam de fora.
 */
export async function lerNegociosWin(
  blocos: AsyncIterable<readonly string[]>,
  excluir: ReadonlySet<string> = new Set(),
): Promise<LeituraNegocios> {
  const acc = criarAcumulador(excluir);
  let ler: ReturnType<typeof criarLeitorNegocios> | undefined;
  let numero = 0;
  let lidas = 0;
  for await (const bloco of blocos)
    for (const linha of bloco) {
      numero++;
      if (linha.trim() === "") continue;
      if (!ler) {
        ler = criarLeitorNegocios(linha, CONTRATO_WIN);
        continue;
      }
      lidas++;
      const lido = ler(linha);
      if (lido === null) continue;
      if ("motivo" in lido) acc.ignorar(numero, lido.motivo);
      else acc.adicionar(lido.negocio);
    }
  if (!ler) throw new RangeError("o arquivo de negócios está vazio");
  return acc.resultado(lidas);
}

export interface LeituraCompleta extends LeituraNegocios {
  /** 1, ou 2 quando houve cancelamento e o arquivo foi lido de novo sem os cancelados. */
  readonly passadas: 1 | 2;
}

/**
 * Lê o arquivo (por `abrir`, que devolve as linhas do começo, em blocos, a cada chamada).
 * Se houver cancelamento de negócio do WIN, lê de novo deixando de fora os cancelados.
 */
export async function lerArquivoNegocios(
  abrir: () => AsyncIterable<readonly string[]>,
): Promise<LeituraCompleta> {
  const primeira = await lerNegociosWin(abrir());
  if (primeira.cancelamentos.size === 0) return { ...primeira, passadas: 1 };
  const segunda = await lerNegociosWin(abrir(), primeira.cancelamentos);
  return { ...segunda, passadas: 2 };
}
