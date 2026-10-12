import type { ResumoTrecho, ValidacaoPedido, WalkForward } from "@zentrade/contratos";
import { momentos } from "@zentrade/financas";
import { resumoDoTrecho, type DadosValidacao, type Trecho } from "./trechos.js";

export interface JanelaPlanejada {
  readonly indice: number;
  readonly dentro: Trecho;
  readonly fora: Trecho;
}

/**
 * Janelas do walk-forward (Pardo). Cada janela tem um trecho de referência ("dentro")
 * seguido de um trecho de teste ("fora"); os testes não se sobrepõem e cobrem o fim do
 * período. Com k janelas e fração f dentro: fora = T / (k + f/(1 − f)), dentro =
 * fora × f/(1 − f). `rolante`: o trecho de dentro anda junto (mesmo tamanho);
 * `ancorada`: começa sempre no início do período e cresce.
 */
export function janelasWalkForward(
  inicio: number,
  fim: number,
  o: { readonly janelas: number; readonly modo: "rolante" | "ancorada"; readonly fracaoDentro: number },
): JanelaPlanejada[] {
  const razao = o.fracaoDentro / (1 - o.fracaoDentro);
  const fora = (fim - inicio) / (o.janelas + razao);
  const dentro = fora * razao;
  const em = (x: number) => Math.round(inicio + x);
  return Array.from({ length: o.janelas }, (_, i) => {
    const comeco = dentro + i * fora;
    const fimFora = i === o.janelas - 1 ? fim : em(comeco + fora);
    return {
      indice: i,
      dentro: { inicio: o.modo === "ancorada" ? inicio : em(comeco - dentro), fim: em(comeco) },
      fora: { inicio: em(comeco), fim: fimFora },
    };
  });
}

const DIA = 86_400_000;

/** Eficiência do walk-forward: retorno por dia fora ÷ retorno por dia dentro. */
export function eficiencia(dentro: ResumoTrecho, fora: ResumoTrecho): number | null {
  const diasDentro = (dentro.fim - dentro.inicio) / DIA;
  const diasFora = (fora.fim - fora.inicio) / DIA;
  if (!(dentro.retorno > 0) || diasDentro <= 0 || diasFora <= 0) return null;
  return fora.retorno / diasFora / (dentro.retorno / diasDentro);
}

const mediaOuNulo = (v: readonly number[]): number | null =>
  v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length;

export function estabilidade(janelas: WalkForward["janelas"]): WalkForward["estabilidade"] {
  const retornos = momentos(janelas.map((j) => j.fora.retorno));
  const sharpes = janelas.map((j) => j.fora.sharpe).filter((s): s is number => s !== null);
  const s = momentos(sharpes);
  return {
    mediaRetorno: retornos.media,
    desvioRetorno: retornos.desvio,
    mediaSharpe: sharpes.length === 0 ? null : s.media,
    desvioSharpe: sharpes.length === 0 ? null : s.desvio,
    fracaoPositivas:
      janelas.length === 0 ? 0 : janelas.filter((j) => j.fora.retorno > 0).length / janelas.length,
    eficienciaMedia: mediaOuNulo(janelas.map((j) => j.eficiencia).filter((e): e is number => e !== null)),
  };
}

/**
 * Sem otimizador de parâmetros, o walk-forward avalia a MESMA estratégia em cada janela:
 * mostra se o resultado se repete no tempo ou se veio de um trecho só.
 */
export function validarWalkForward(
  d: DadosValidacao,
  inicio: number,
  fim: number,
  v: Pick<ValidacaoPedido, "janelas" | "modoJanelas" | "fracaoDentroDaAmostra">,
): WalkForward {
  const plano = janelasWalkForward(inicio, fim, {
    janelas: v.janelas,
    modo: v.modoJanelas,
    fracaoDentro: v.fracaoDentroDaAmostra,
  });
  const janelas = plano.map((j) => {
    const dentro = resumoDoTrecho(d, j.dentro);
    const fora = resumoDoTrecho(d, j.fora);
    return { indice: j.indice, dentro, fora, eficiencia: eficiencia(dentro, fora) };
  });
  return { modo: v.modoJanelas, janelas, estabilidade: estabilidade(janelas) };
}
