/**
 * Divisor recursivo de texto para o RAG. Tenta a fronteira mais "natural" primeiro
 * (seção, parágrafo, frase) e só desce para palavras quando um pedaço não cabe. Nunca
 * corta no meio de uma palavra: uma palavra maior que o máximo (uma URL enorme) vira
 * um trecho sozinha, maior que o limite, em vez de ser partida.
 *
 * Cada seção markdown começa um trecho novo: um trecho que mistura "Taxas" com
 * "Limites de saque" confunde a busca e a citação.
 */
export interface OpcoesDivisor {
  /** Tamanho máximo de cada trecho, em caracteres. */
  readonly tamanhoMaximo: number;
  /** Quantos caracteres do fim de um trecho se repetem no começo do seguinte. */
  readonly sobreposicao: number;
}

export const OPCOES_DIVISOR_PADRAO: OpcoesDivisor = { tamanhoMaximo: 1200, sobreposicao: 120 };

interface Nivel {
  readonly separar: (texto: string) => readonly string[];
  readonly juntar: string;
}

const NIVEIS: readonly Nivel[] = [
  { separar: (t) => t.split(/\n[ \t]*\n/), juntar: "\n\n" },
  { separar: (t) => t.split(/(?<=[.!?…])\s+/), juntar: " " },
  { separar: (t) => t.split(/\s+/), juntar: " " },
];

const limpar = (pecas: readonly string[]): string[] => pecas.map((p) => p.trim()).filter((p) => p !== "");

const comprimento = (pecas: readonly string[], sep: string): number =>
  pecas.reduce((s, p) => s + p.length, 0) + sep.length * Math.max(0, pecas.length - 1);

function validar(o: OpcoesDivisor): void {
  if (!Number.isInteger(o.tamanhoMaximo) || o.tamanhoMaximo < 1) {
    throw new RangeError(`tamanhoMaximo inválido (${o.tamanhoMaximo}): use um inteiro positivo, ex.: 1200`);
  }
  if (!Number.isInteger(o.sobreposicao) || o.sobreposicao < 0 || o.sobreposicao >= o.tamanhoMaximo) {
    throw new RangeError(
      `sobreposicao inválida (${o.sobreposicao}): use um inteiro entre 0 e tamanhoMaximo - 1, ex.: 120`,
    );
  }
}

/** Fim do grupo que cabe na sobreposição e ainda deixa espaço para a próxima peça. */
function cauda(grupo: readonly string[], proxima: string, sep: string, o: OpcoesDivisor): string[] {
  let inicio = 0;
  const resto = (): string[] => grupo.slice(inicio);
  while (
    inicio < grupo.length &&
    (comprimento(resto(), sep) > o.sobreposicao || comprimento([...resto(), proxima], sep) > o.tamanhoMaximo)
  ) {
    inicio++;
  }
  return resto();
}

/** Junta peças pequenas, em ordem, em trechos de até `tamanhoMaximo`, com sobreposição. */
function juntar(pecas: readonly string[], sep: string, o: OpcoesDivisor): string[] {
  const trechos: string[] = [];
  let grupo: string[] = [];
  for (const peca of pecas) {
    if (grupo.length > 0 && comprimento([...grupo, peca], sep) > o.tamanhoMaximo) {
      trechos.push(grupo.join(sep));
      grupo = cauda(grupo, peca, sep, o);
    }
    grupo = [...grupo, peca];
  }
  return grupo.length > 0 ? [...trechos, grupo.join(sep)] : trechos;
}

function dividirNoNivel(texto: string, nivel: number, o: OpcoesDivisor): string[] {
  if (texto.length <= o.tamanhoMaximo) return [texto];
  const regra = NIVEIS[nivel];
  if (!regra) return [texto]; // uma palavra só, maior que o máximo: fica inteira
  const pecas = limpar(regra.separar(texto));
  if (pecas.length <= 1) return dividirNoNivel(texto, nivel + 1, o);

  const trechos: string[] = [];
  let pequenas: string[] = [];
  for (const peca of pecas) {
    if (peca.length <= o.tamanhoMaximo) {
      pequenas = [...pequenas, peca];
      continue;
    }
    trechos.push(...juntar(pequenas, regra.juntar, o), ...dividirNoNivel(peca, nivel + 1, o));
    pequenas = [];
  }
  return [...trechos, ...juntar(pequenas, regra.juntar, o)];
}

export function dividirTexto(texto: string, opcoes: OpcoesDivisor = OPCOES_DIVISOR_PADRAO): string[] {
  validar(opcoes);
  const secoes = limpar(texto.split(/\n(?=#{1,6}\s)/));
  return secoes.flatMap((secao) => dividirNoNivel(secao, 0, opcoes));
}
