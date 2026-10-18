import type { Valor } from "../dinheiro.js";
import { formatarNumero } from "../formatar.js";
import { PRECISAO_META, type FaixaCalibracao, type MetricasPlacar, type Proporcao } from "./metricas.js";

/**
 * O placar em poucas frases, para o próprio Claude ler antes de decidir (pela
 * ferramenta de histórico) e para quem lê o diário. Só fatos medidos; nada de
 * recomendação.
 */

const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const porcento = (fracao: number): string => `${pct.format(fracao * 100)}%`;
const confianca = (x: number): string =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);

const intervalo = (p: Proporcao): string =>
  p.intervalo
    ? `, intervalo de 95%: ${porcento(p.intervalo.inferior)} a ${porcento(p.intervalo.superior)}`
    : "";

function frasesDeAcerto(m: MetricasPlacar, onde: string): string {
  const a = m.aprovacoes;
  const v = m.vetos;
  const aprovou =
    a.total === 0
      ? "você não aprovou nenhum"
      : `você aprovou ${a.total} e acertou ${a.acertos} (${porcento(a.taxa ?? 0)}${intervalo(a)})`;
  const vetou =
    v.total === 0
      ? "não vetou nenhum"
      : `vetou ${v.total} e ${v.acertos} ${v.acertos === 1 ? "veto estava certo" : "vetos estavam certos"} (${porcento(v.taxa ?? 0)})`;
  const sufixo = onde ? ` ${onde}` : "";
  return `Nos últimos ${m.avaliadas} sinais avaliados${sufixo}, ${aprovou}; ${vetou}.`;
}

function fraseDeDinheiro(m: MetricasPlacar): string | null {
  if (!m.dinheiro || !m.moeda) return null;
  const em = (v: Valor) => `${formatarNumero(v)} ${m.moeda}`;
  const d = m.dinheiro;
  const efeito = d.agregado.gte(0) ? `você agregou ${em(d.agregado)}` : `você tirou ${em(d.agregado.neg())}`;
  return `Em dinheiro, suas aprovações somaram ${em(d.aprovadas)}; aprovar tudo teria dado ${em(d.seAprovasseTudo)} (${efeito}).`;
}

function fraseDePayoff(m: MetricasPlacar): string | null {
  const p = m.payoff;
  if (!p || !m.moeda || p.acertoNecessario === null) return null;
  return `Ganho médio ${formatarNumero(p.ganhoMedio)} e perda média ${formatarNumero(p.perdaMedia)} ${m.moeda}: com esse payoff, para empatar é preciso acertar ${porcento(p.acertoNecessario)}.`;
}

const faixa = (f: FaixaCalibracao): string =>
  `${confianca(f.de)}–${confianca(f.ate)}: disse ${porcento(f.confiancaMedia ?? 0)}, acertou ${porcento(f.acerto ?? 0)} (${f.decisoes})`;

function fraseDeCalibracao(m: MetricasPlacar): string | null {
  if (m.calibracao.brier === null) return null;
  const faixas = m.calibracao.faixas.filter((f) => f.decisoes > 0).map(faixa);
  return `Calibração (Brier ${formatarNumero(m.calibracao.brier)}; 0 é perfeito, 0,25 é chutar 50%): ${faixas.join("; ")}.`;
}

function fraseDeLimite(m: MetricasPlacar): string | null {
  if (m.aprovacoes.total === 0) return null;
  const l = m.limite;
  if (!l)
    return `Por enquanto, nenhum limite de confiança chegou a ${porcento(PRECISAO_META)} de precisão nas aprovações.`;
  return `Com confiança ≥ ${confianca(l.limite)}, as aprovações acertaram ${porcento(l.precisao)} (${l.acertos} de ${l.aprovacoes}).`;
}

/** O placar em texto. `onde` completa a primeira frase ("neste robô", "em rompimento 5m"). */
export function resumoDoPlacar(m: MetricasPlacar, onde: string): string {
  if (m.avaliadas === 0)
    return `Ainda não há sinais avaliados${onde ? ` ${onde}` : ""}${m.pendentes ? ` (${m.pendentes} pendente(s))` : ""}.`;
  const frases = [
    frasesDeAcerto(m, onde),
    fraseDeDinheiro(m),
    fraseDePayoff(m),
    fraseDeCalibracao(m),
    fraseDeLimite(m),
    m.pendentes > 0
      ? `${m.pendentes} ${m.pendentes === 1 ? "pendente" : "pendentes"} ainda sem desfecho.`
      : null,
    m.aviso,
  ];
  return frases.filter((f): f is string => f !== null).join(" ");
}
