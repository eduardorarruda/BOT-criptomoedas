import type {
  DecisaoDTO,
  Evento,
  OrdemDTO,
  PensamentoAtualDTO,
  PensamentoDTO,
  RoboDTO,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import type { RegistroAoVivo } from "../api/esquemas";
import { juntarRegistros, roboDoEvento } from "../lib/aovivo/eventos";
import { decisaoDaAnalise, decisaoDeVenda, etapasPara, eventoEtapa } from "./analise";
import { ehSimboloDemo, type Mercado } from "./mercado";
import { exposicaoAtual, posicaoDerivada, posicaoDTO, type EstadoDemo } from "./estado";
import { pensamentoDoCiclo, pensamentosIniciais } from "./pensamentos";
import { gerarVelas } from "./velas";

/**
 * O "motor" do exemplo: a cada ciclo, um robô fecha um candle, avalia a regra e,
 * quando há sinal, o agente analisa passo a passo antes da decisão, da ordem e da
 * posição — a mesma sequência de eventos do motor de verdade. Também guarda o
 * histórico curto que a tela "Ao vivo" pede ao abrir.
 */
interface OpcoesSimulacao {
  readonly tiqueMs?: number;
  readonly analiseCadaMs?: number;
  readonly primeiraAnaliseMs?: number;
  readonly etapaMs?: number;
}

interface Contexto {
  readonly agora: () => number;
  readonly mercado: Mercado;
  readonly estado: () => EstadoDemo;
  readonly mudar: (f: (e: EstadoDemo) => EstadoDemo) => void;
  readonly transmitir: (e: Evento) => void;
  readonly novoId: (prefixo: string) => string;
  readonly opcoes: OpcoesSimulacao;
}

export interface Simulacao {
  ligar(): void;
  desligar(): void;
  executarAprovada(d: DecisaoDTO): void;
  historico(roboId?: string): RegistroAoVivo[];
  /** O que cada robô pensou na última vela (muda a cada ciclo). */
  pensamentos(): PensamentoAtualDTO[];
}

const TETO_HISTORICO = 400;
const ATRASO_EXECUCAO_MS = 700;

const SEMENTE_DECISOES = 24;

/** O histórico do exemplo já abre com as últimas decisões e ordens de cada robô. */
function semente(e: EstadoDemo): readonly RegistroAoVivo[] {
  const decisoes = [...e.decisoes].sort((a, b) => b.em - a.em).slice(0, SEMENTE_DECISOES);
  const ids = new Set(decisoes.map((d) => d.id));
  const registros: RegistroAoVivo[] = [
    ...decisoes.map((d) => ({ recebidoEm: d.em, evento: { tipo: "decisao" as const, decisao: d } })),
    ...e.ordens
      .filter((o) => ids.has(o.decisaoId))
      .map((o) => ({ recebidoEm: o.criadaEm + 1, evento: { tipo: "ordem" as const, ordem: o } })),
  ];
  return juntarRegistros([], registros, TETO_HISTORICO);
}

export function criarSimulacao(c: Contexto): Simulacao {
  let registros: readonly RegistroAoVivo[] = semente(c.estado());
  let relogios: ReturnType<typeof setInterval>[] = [];
  let vez = 0;
  let pensados: readonly PensamentoAtualDTO[] = pensamentosIniciais(c.estado().robos, c.agora());

  const roboDaDecisao = (id: string): string | undefined =>
    c.estado().decisoes.find((d) => d.id === id)?.roboId;

  function emitir(e: Evento): void {
    if (e.tipo === "pensamento")
      pensados = pensados.map((p) => (p.roboId === e.roboId ? { ...p, pensamento: e.pensamento } : p));
    if (roboDoEvento(e, roboDaDecisao))
      registros = juntarRegistros(registros, [{ recebidoEm: c.agora(), evento: e }], TETO_HISTORICO);
    c.transmitir(e);
  }

  function ordemPara(d: DecisaoDTO, simbolo: string, estado: OrdemDTO["estado"]): OrdemDTO {
    const quantidade = d.quantidade ?? "0";
    const taxa = dec(d.preco).times(quantidade).times("0.001").toFixed(8);
    const executada = estado === "PREENCHIDA";
    return {
      id: `o-${d.id}`,
      decisaoId: d.id,
      idCliente: `zt-${d.id}`.slice(0, 36),
      simbolo,
      lado: d.sinal.acao === "VENDER" ? "VENDA" : "COMPRA",
      quantidade,
      estado,
      criadaEm: c.agora(),
      execucoes: executada ? [{ preco: d.preco, quantidade, taxaCotacao: taxa, em: c.agora() }] : [],
    };
  }

  /** Ordem enviada → executada → decisão executada → posição derivada. */
  function executar(d: DecisaoDTO, robo: RoboDTO): void {
    emitir({ tipo: "ordem", ordem: ordemPara(d, robo.simbolo, "PENDENTE") });
    const ordem = ordemPara(d, robo.simbolo, "PREENCHIDA");
    const executada: DecisaoDTO = { ...d, estado: "executada", ordemId: ordem.id };
    c.mudar((e) => ({
      ...e,
      decisoes: e.decisoes.map((x) => (x.id === d.id ? executada : x)),
      ordens: [ordem, ...e.ordens],
    }));
    emitir({ tipo: "ordem", ordem });
    emitir({ tipo: "decisao", decisao: executada });
    emitir({ ...posicaoDTO(c.estado(), robo.id), tipo: "posicao", em: c.agora() });
  }

  /** A decisão nasce com o cenário e as condições que o robô tinha na última vela. */
  function comPensamento(d: DecisaoDTO, robo: RoboDTO): DecisaoDTO {
    const p = pensados.find((x) => x.roboId === robo.id)?.pensamento;
    if (!p) return d;
    return { ...d, regime: p.cenario, ...(p.condicoes ? { condicoes: p.condicoes } : {}) };
  }

  function registrarDecisao(original: DecisaoDTO, robo: RoboDTO): void {
    const d = comPensamento(original, robo);
    const vaiExecutar = d.estado === "executada";
    const nasce: DecisaoDTO = vaiExecutar ? { ...d, estado: "aprovada" } : d;
    c.mudar((e) => ({ ...e, decisoes: [nasce, ...e.decisoes] }));
    emitir({ tipo: "decisao", decisao: nasce });
    d.risco.barreiras.forEach((b) => emitir({ tipo: "risco", roboId: robo.id, barreira: b, em: d.em }));
    if (vaiExecutar) executar(nasce, robo);
  }

  function proximoRobo(): RoboDTO | null {
    const e = c.estado();
    const ativos = e.robos.filter((r) => !r.pausado);
    if (e.paradaTotal || ativos.length === 0) return null;
    return ativos[vez++ % ativos.length] ?? null;
  }

  function fecharCandle(robo: RoboDTO): string {
    const preco = c.mercado.preco(robo.simbolo);
    if (!ehSimboloDemo(robo.simbolo)) return preco;
    const velas = gerarVelas(robo.simbolo, robo.intervalo, c.mercado.precoNumero(robo.simbolo), c.agora(), 3);
    const fechada = velas.at(-2);
    if (fechada)
      emitir({
        tipo: "candle",
        roboId: robo.id,
        simbolo: robo.simbolo,
        intervalo: robo.intervalo,
        candle: fechada,
      });
    return preco;
  }

  /** Análise passo a passo; no fim, a decisão sai de `decidir`. */
  function analisar(robo: RoboDTO, decidir: (id: string) => DecisaoDTO): void {
    const analiseId = c.novoId("a");
    const passo = c.opcoes.etapaMs ?? 1300;
    const etapas = etapasPara(robo, c.mercado.preco(robo.simbolo));
    emitir({ tipo: "analise", analiseId, roboId: robo.id, concluida: false });
    etapas.forEach((etapa, i) => {
      setTimeout(() => emitir(eventoEtapa(analiseId, robo, etapa, c.agora())), passo * (i + 1));
    });
    setTimeout(
      () => {
        const id = c.novoId("d");
        const d = decidir(id);
        const resultado = d.proposta?.acao ?? "falhou";
        emitir({ tipo: "analise", analiseId, roboId: robo.id, concluida: true, resultado, decisaoId: id });
        registrarDecisao(d, robo);
      },
      passo * (etapas.length + 1),
    );
  }

  function sinal(robo: RoboDTO, acao: "COMPRAR" | "VENDER" | "AGUARDAR", explicacao: string, preco: string) {
    emitir({ tipo: "sinal", roboId: robo.id, acao, explicacao, preco, em: c.agora() });
    const base: PensamentoDTO | undefined = pensados.find((p) => p.roboId === robo.id)?.pensamento;
    if (base)
      emitir({
        tipo: "pensamento",
        roboId: robo.id,
        pensamento: pensamentoDoCiclo(base, acao, explicacao, preco, c.agora()),
      });
  }

  /** Um ciclo: compra, venda da posição aberta ou só "aguardar", alternando. */
  function ciclo(): void {
    const robo = proximoRobo();
    if (!robo) return;
    const preco = fecharCandle(robo);
    const aberta = posicaoDerivada(c.estado(), robo.id).quantidade.gt(0);
    const tipo = vez % 3;
    if (tipo === 2) {
      sinal(robo, "AGUARDAR", "RSI(14) em 48: a regra de entrada pede abaixo de 30", preco);
      return;
    }
    if (tipo === 0 && aberta && robo.modo === "auto") {
      sinal(robo, "VENDER", `preço ${preco} chegou ao alvo líquido`, preco);
      const qtd = posicaoDerivada(c.estado(), robo.id).quantidade.toFixed();
      analisar(robo, (id) => decisaoDeVenda(id, robo, preco, c.agora(), qtd));
      return;
    }
    sinal(robo, "COMPRAR", `sinal de entrada de ${robo.nome}: RSI(14) abaixo de 30`, preco);
    const exposicao = exposicaoAtual(c.estado(), c.mercado.preco);
    analisar(robo, (id) => decisaoDaAnalise(id, robo, preco, c.agora(), exposicao));
  }

  return {
    ligar() {
      const tique = setInterval(() => {
        c.mercado.tique(c.agora()).forEach((t) => emitir({ tipo: "preco", ...t }));
      }, c.opcoes.tiqueMs ?? 2000);
      const primeira = setTimeout(ciclo, c.opcoes.primeiraAnaliseMs ?? 6000);
      const ciclos = setInterval(ciclo, c.opcoes.analiseCadaMs ?? 26_000);
      relogios = [tique, primeira, ciclos];
    },
    desligar() {
      relogios.forEach((r) => clearInterval(r));
      relogios = [];
    },
    executarAprovada(d) {
      const robo = c.estado().robos.find((r) => r.id === d.roboId);
      if (robo) setTimeout(() => executar(d, robo), ATRASO_EXECUCAO_MS);
    },
    pensamentos: () => [...pensados],
    historico(roboId) {
      return registros.filter((r) => !roboId || roboDoEvento(r.evento, roboDaDecisao) === roboId);
    },
  };
}
