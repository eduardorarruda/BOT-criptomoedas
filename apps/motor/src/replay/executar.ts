import type { PedidoAnalise, PortaAgente, PropostaAgente } from "@zentrade/contratos";
import { paraTexto, type Valor } from "@zentrade/dominio";
import type { AnaliseReplay, NovaAnaliseReplay } from "@zentrade/banco";
import type { SinalReplay } from "./sinais.js";

export interface OpcoesExecucao {
  readonly execucao: string;
  /** No máximo tantas análises (os primeiros sinais, em ordem cronológica). */
  readonly maximo: number;
  readonly custoMaximoUsd: number;
  /** Sem isto o comando só mostra o que faria e quanto custaria. */
  readonly confirmar: boolean;
  readonly paralelo: number;
  /** Custo médio por análise, só para a estimativa antes de confirmar. */
  readonly custoEstimadoPorAnaliseUsd: number;
  /** Para depois de tantas falhas seguidas do agente (não queima orçamento à toa). */
  readonly falhasSeguidasMaximas: number;
  /** Só testes: aceita proposta sem cenários (o agente fixo não os tem). */
  readonly aceitarSemCenarios?: boolean;
}

export interface Armazem {
  gravar(a: NovaAnaliseReplay): Promise<void>;
  listar(execucao: string): Promise<AnaliseReplay[]>;
  custoTotal(execucao: string): Promise<Valor>;
}

export interface DependenciasExecucao {
  readonly agente: PortaAgente;
  readonly armazem: Armazem;
  readonly pedidoDe: (s: SinalReplay) => PedidoAnalise;
  readonly escrever: (linha: string) => void;
}

export type MotivoParada =
  "concluido" | "sem_confirmacao" | "teto_de_custo" | "falhas_seguidas" | "sem_orcamento";

export interface ResumoExecucao {
  readonly sinaisNaJanela: number;
  readonly selecionados: number;
  /** Sinais que passaram do `maximo` e ficaram sem análise. */
  readonly sobraram: number;
  readonly jaAnalisados: number;
  readonly analisadosAgora: number;
  readonly falhas: number;
  readonly custoDestaRodadaUsd: number;
  readonly custoTotalUsd: number;
  readonly estimativaUsd: number;
  readonly parou: MotivoParada;
}

/** Chave estável de um sinal: símbolo e instante da decisão. */
export const chaveDoSinal = (simbolo: string, ate: number): string => `${simbolo}|${ate}`;

const ordemCronologica = (a: SinalReplay, b: SinalReplay) =>
  a.ate - b.ate || a.simbolo.localeCompare(b.simbolo);

function sinalGravavel(s: SinalReplay["sinal"]): Record<string, string> {
  return { acao: s.acao, explicacao: s.explicacao, stop: paraTexto(s.stop), alvo: paraTexto(s.alvo) };
}

/**
 * Aprovou = a proposta final do agente é comprar E a regra dos cenários não barrou (valor
 * esperado > 0, cenário favorável no limiar) E não há veto grave. Sem avaliação dos
 * cenários (só no agente fixo dos testes; no real isso já é falha), vale a ação. Qualquer outra coisa
 * (aguardar, vender, comprar barrado pelos cenários) é veto.
 */
export function aprovouEntrada(p: PropostaAgente): boolean {
  return p.acao === "comprar" && p.avaliacao?.aprovada !== false && !p.vetoGrave;
}

const dataHora = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

/**
 * O replay: seleciona os primeiros `maximo` sinais (cronológico, todos os símbolos),
 * pula os já analisados (a rodada é retomável e idempotente), estima o custo e só segue
 * com `confirmar`. Cada análise vai ao agente com o pedido montado até o candle do sinal e
 * é gravada na tabela do replay; nunca há ordem nem decisão ao vivo. Para ao bater o teto
 * de custo, ao ficar sem orçamento de IA ou depois de falhas seguidas.
 */
export async function executarReplay(
  sinais: readonly SinalReplay[],
  o: OpcoesExecucao,
  d: DependenciasExecucao,
): Promise<ResumoExecucao> {
  const ordenados = [...sinais].sort(ordemCronologica);
  const selecionados = ordenados.slice(0, o.maximo);
  const feitos = new Set((await d.armazem.listar(o.execucao)).map((a) => chaveDoSinal(a.simbolo, a.sinalEm)));
  const pendentes = selecionados.filter((s) => !feitos.has(chaveDoSinal(s.simbolo, s.ate)));
  const custoAnterior = (await d.armazem.custoTotal(o.execucao)).toNumber();
  const estimativaUsd = pendentes.length * o.custoEstimadoPorAnaliseUsd;
  const base = {
    sinaisNaJanela: ordenados.length,
    selecionados: selecionados.length,
    sobraram: ordenados.length - selecionados.length,
    jaAnalisados: selecionados.length - pendentes.length,
    estimativaUsd,
  };
  d.escrever(
    `${ordenados.length} sinais na janela; ${selecionados.length} selecionados (${base.sobraram} passam do máximo de ${o.maximo}); ${base.jaAnalisados} já analisados; ${pendentes.length} por analisar, estimativa de US$ ${estimativaUsd.toFixed(2)} (teto US$ ${o.custoMaximoUsd}; já gasto US$ ${custoAnterior.toFixed(2)}).`,
  );
  if (!o.confirmar) {
    d.escrever("Nada foi enviado ao agente. Rode de novo com --confirmar para analisar.");
    return {
      ...base,
      analisadosAgora: 0,
      falhas: 0,
      custoDestaRodadaUsd: 0,
      custoTotalUsd: custoAnterior,
      parou: "sem_confirmacao",
    };
  }

  let proximo = 0;
  let gasto = custoAnterior;
  let feitosAgora = 0;
  let falhas = 0;
  let falhasSeguidas = 0;
  let parou: MotivoParada = "concluido";
  const parar = (motivo: MotivoParada) => {
    if (parou === "concluido") parou = motivo;
  };

  const analisar = async (s: SinalReplay, n: number): Promise<void> => {
    const rotulo = `[${n + 1}/${pendentes.length}] ${s.simbolo} ${dataHora(s.ate)}Z`;
    try {
      const r = await d.agente.analisar(d.pedidoDe(s));
      gasto += r.custoUsd.toNumber();
      if (r.semOrcamento) return parar("sem_orcamento");
      if (!o.aceitarSemCenarios && r.proposta.cenarios === undefined)
        throw new Error(`o agente não analisou (${r.proposta.justificativa.slice(0, 160)})`);
      const aprovou = aprovouEntrada(r.proposta);
      await d.armazem.gravar({
        execucao: o.execucao,
        simbolo: s.simbolo,
        sinalEm: s.ate,
        preco: s.preco,
        sinal: sinalGravavel(s.sinal),
        proposta: r.proposta,
        veredito: aprovou ? "aprovou" : "vetou",
        custoIaUsd: r.custoUsd,
      });
      feitosAgora++;
      falhasSeguidas = 0;
      d.escrever(
        `${rotulo}: ${aprovou ? "aprovou" : "vetou"} (US$ ${r.custoUsd.toFixed(2)}; total US$ ${gasto.toFixed(2)})`,
      );
    } catch (erro) {
      falhas++;
      falhasSeguidas++;
      d.escrever(`${rotulo}: FALHOU (${erro instanceof Error ? erro.message.slice(0, 200) : String(erro)})`);
      if (falhasSeguidas >= o.falhasSeguidasMaximas) parar("falhas_seguidas");
    }
  };

  const trabalhador = async (): Promise<void> => {
    while (parou === "concluido" && proximo < pendentes.length) {
      if (gasto >= o.custoMaximoUsd) return parar("teto_de_custo");
      const n = proximo++;
      await analisar(pendentes[n] as SinalReplay, n);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.paralelo) }, trabalhador));

  return {
    ...base,
    analisadosAgora: feitosAgora,
    falhas,
    custoDestaRodadaUsd: gasto - custoAnterior,
    custoTotalUsd: gasto,
    parou,
  };
}
