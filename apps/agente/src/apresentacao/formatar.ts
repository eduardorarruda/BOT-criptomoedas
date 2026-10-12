import { removerControles } from "@zentrade/conhecimento";
import type { DecisaoDTO } from "@zentrade/contratos";
import { dec, formatarDolar, formatarNumero } from "@zentrade/dominio";
import type { Backtest, DecisaoDetalhe, Resumo } from "../api/cliente-api.js";

/** Textos para gente (CLI e MCP). Horários em UTC, sem ambiguidade de fuso. */
const quando = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const dolar = (texto: string): string => formatarDolar(dec(texto));
const porcento = (fracao: number): string => `${Math.round(fracao * 100)}%`;

function resumoBruto(r: Resumo): string {
  return [
    "ZenTrade — resumo",
    `Parada total: ${r.paradaTotal ? "LIGADA (nenhuma entrada nova; stop e alvo seguem valendo)" : "desligada"}`,
    `Resultado hoje: ${dolar(r.resultadoHoje)}`,
    `Exposição: ${dolar(r.exposicao)}`,
    `Maior queda (30 dias): ${dolar(r.maiorQueda30d)}`,
    `Robôs ativos: ${r.robosAtivos}`,
    `Custo de IA hoje: ${dolar(r.custoIaHoje)}`,
    `Taxas pagas hoje: ${dolar(r.taxasHoje)}`,
  ].join("\n");
}

function decisoesBrutas(lista: readonly DecisaoDTO[]): string {
  if (lista.length === 0) return "Nenhuma decisão encontrada.";
  const linhas = lista.map((d) =>
    [
      quando(d.em),
      d.id,
      d.roboId,
      d.sinal.acao,
      d.proposta?.acao ?? "-",
      d.estado,
      formatarNumero(dec(d.preco)),
    ].join("  "),
  );
  return ["quando  id  robô  sinal  proposta  estado  preço", ...linhas].join("\n");
}

function explicarProposta(d: DecisaoDTO): string[] {
  const p = d.proposta;
  if (!p) return ["Proposta da IA: nenhuma (decisão só por regras)."];
  return [
    `Proposta da IA: ${p.acao}, confiança ${porcento(p.confianca)}, tamanho ${porcento(p.tamanhoRelativo)}` +
      (p.stop ? `, stop ${formatarNumero(dec(p.stop))}` : "") +
      (p.alvo ? `, alvo ${formatarNumero(dec(p.alvo))}` : ""),
    `Justificativa: ${p.justificativa}`,
    ...(p.riscos.length > 0 ? ["Riscos:", ...p.riscos.map((r) => `  - ${r}`)] : []),
    ...(p.fontes.length > 0
      ? [
          "Fontes:",
          ...p.fontes.map((f) => `  - [${f.tipo}] ${f.titulo}${f.data ? ` (${f.data})` : ""} — id ${f.id}`),
        ]
      : []),
  ];
}

function explicarRisco(d: DecisaoDTO): string[] {
  if (d.risco.aprovada) return ["Motor de risco: aprovou."];
  return ["Motor de risco: barrou.", ...d.risco.barreiras.map((b) => `  - ${b.mensagem} (${b.codigo})`)];
}

function explicacaoBruta(d: DecisaoDetalhe): string {
  return [
    `Decisão ${d.id} — robô ${d.roboId} — ${quando(d.em)}`,
    `Sinal das regras: ${d.sinal.acao}. ${d.sinal.explicacao}`,
    `Preço: ${formatarNumero(dec(d.preco))}${d.quantidade ? ` · quantidade ${d.quantidade}` : ""}`,
    ...explicarProposta(d),
    ...explicarRisco(d),
    `Estado: ${d.estado}`,
    ...(d.ordem ? [`Ordem: ${d.ordem.id} (${d.ordem.estado})`] : []),
    ...(d.custoIaUsd ? [`Custo da IA: ${dolar(d.custoIaUsd)}`] : []),
    d.desfecho
      ? `Desfecho: ${dolar(d.desfecho.resultado)} (avaliado em ${quando(d.desfecho.avaliadoEm)})`
      : "Desfecho: ainda não avaliado.",
  ].join("\n");
}

function metricasBrutas(m: NonNullable<Backtest["metricas"]>): string[] {
  return [
    `Resultado líquido (simulado): ${dolar(m.resultadoLiquido)}`,
    `Maior queda: ${dolar(m.maiorQueda)} (${porcento(m.maiorQuedaPercentual)} do pico)`,
    `Operações: ${m.operacoes} · acertos ${m.acertos} (${porcento(m.taxaAcerto)})`,
    `Taxas pagas: ${dolar(m.taxasPagas)}`,
  ];
}

function backtestBruto(b: Backtest): string {
  return [
    `Backtest ${b.id}: ${b.estado} — ${b.simbolo} ${b.intervalo}, ${quando(b.inicio)} a ${quando(b.fim)}`,
    ...(b.metricas ? metricasBrutas(b.metricas) : []),
    ...(b.erro ? [`Erro: ${b.erro}`] : []),
  ].join("\n");
}

// Justificativa, riscos e títulos de fonte podem trazer texto de notícia: nada de
// escape de terminal ou caractere de controle chega à tela da CLI ou ao MCP.
export const formatarResumo = (r: Resumo): string => removerControles(resumoBruto(r));
export const formatarDecisoes = (lista: readonly DecisaoDTO[]): string =>
  removerControles(decisoesBrutas(lista));
export const explicarDecisao = (d: DecisaoDetalhe): string => removerControles(explicacaoBruta(d));
export const formatarBacktest = (b: Backtest): string => removerControles(backtestBruto(b));
