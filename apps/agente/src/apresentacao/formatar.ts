import type { DecisaoDTO } from "@zentrade/contratos";
import { dec, formatarDolar, formatarNumero } from "@zentrade/dominio";
import type { Backtest, DecisaoDetalhe, Resumo } from "../api/cliente-api.js";

/** Textos para gente (CLI e MCP). Horários em UTC, sem ambiguidade de fuso. */
const quando = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const dolar = (texto: string): string => formatarDolar(dec(texto));
const porcento = (fracao: number): string => `${Math.round(fracao * 100)}%`;

export function formatarResumo(r: Resumo): string {
  return [
    "ZenTrade — resumo",
    `Parada total: ${r.paradaTotal ? "LIGADA (nenhuma ordem sai)" : "desligada"}`,
    `Resultado hoje: ${dolar(r.resultadoHoje)}`,
    `Exposição: ${dolar(r.exposicao)}`,
    `Maior queda (30 dias): ${dolar(r.maiorQueda30d)}`,
    `Robôs ativos: ${r.robosAtivos}`,
    `Custo de IA hoje: ${dolar(r.custoIaHoje)}`,
  ].join("\n");
}

export function formatarDecisoes(lista: readonly DecisaoDTO[]): string {
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

export function explicarDecisao(d: DecisaoDetalhe): string {
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

export function formatarBacktest(b: Backtest): string {
  const { id, estado, ...resto } = b;
  const detalhes = Object.keys(resto).length > 0 ? `\n${JSON.stringify(resto, null, 2)}` : "";
  return `Backtest ${id}: ${estado}${detalhes}`;
}
