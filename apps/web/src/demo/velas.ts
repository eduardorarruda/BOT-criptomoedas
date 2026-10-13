import { MS_POR_INTERVALO, type Intervalo } from "@zentrade/contratos/esquemas";
import type { CandleApi } from "../api/esquemas";
import { criarAleatorio, normal } from "./aleatorio";
import { PRECO_BASE, VOLATILIDADE, type SimboloDemo } from "./dados";

/**
 * Velas de exemplo: passeio aleatório com semente, terminando exatamente no preço
 * atual do mercado simulado. Os números são sintéticos; viram texto decimal aqui e
 * daí em diante só são tratados como texto/Decimal.
 */
const casasDoSimbolo = (preco: number): number => (preco >= 100 ? 2 : 4);
export const textoPreco = (preco: number): string => preco.toFixed(casasDoSimbolo(preco));

interface VelaBruta {
  readonly abertura: number;
  readonly abre: number;
  readonly maxima: number;
  readonly minima: number;
  readonly fecha: number;
  readonly volume: number;
}

function sementeDe(simbolo: string, intervalo: string): number {
  return [...`${simbolo}:${intervalo}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
}

function passeio(simbolo: SimboloDemo, intervalo: Intervalo, quantidade: number, fim: number): VelaBruta[] {
  const aleatorio = criarAleatorio(sementeDe(simbolo, intervalo));
  const passo = MS_POR_INTERVALO[intervalo];
  const escala = VOLATILIDADE[simbolo] * Math.sqrt(passo / 60_000) * 0.6;
  const inicio = Math.floor(fim / passo) * passo - (quantidade - 1) * passo;
  const velas: VelaBruta[] = [];
  let preco = PRECO_BASE[simbolo];
  for (let i = 0; i < quantidade; i++) {
    const abre = preco;
    const fecha = abre * (1 + normal(aleatorio) * escala + Math.sin(i / 18) * escala * 0.25);
    const maxima = Math.max(abre, fecha) * (1 + Math.abs(normal(aleatorio)) * escala * 0.5);
    const minima = Math.min(abre, fecha) * (1 - Math.abs(normal(aleatorio)) * escala * 0.5);
    velas.push({ abertura: inicio + i * passo, abre, maxima, minima, fecha, volume: 50 + aleatorio() * 400 });
    preco = fecha;
  }
  return velas;
}

const paraTexto = (v: VelaBruta, fator: number): CandleApi => ({
  abertura: v.abertura,
  abre: textoPreco(v.abre * fator),
  maxima: textoPreco(v.maxima * fator),
  minima: textoPreco(v.minima * fator),
  fecha: textoPreco(v.fecha * fator),
  volume: v.volume.toFixed(3),
});

export function gerarVelas(
  simbolo: SimboloDemo,
  intervalo: Intervalo,
  precoAtual: number,
  fim: number,
  quantidade = 240,
): CandleApi[] {
  const brutas = passeio(simbolo, intervalo, quantidade, fim);
  const ultima = brutas[brutas.length - 1];
  const fator = ultima ? precoAtual / ultima.fecha : 1;
  return brutas.map((v) => paraTexto(v, fator));
}

/** Fechamentos em número, para a prévia do construtor (o domínio avalia em número). */
