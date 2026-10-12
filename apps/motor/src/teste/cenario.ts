import type { PortaAgente, PortaCandles, PortaRiscoConta, RoboConfig } from "@zentrade/contratos";
import { PapelCorretora } from "@zentrade/corretora";
import { dec, type Estrategia } from "@zentrade/dominio";
import type { Dependencias, Registro } from "../nucleo/tipos.js";
import { OPCOES_PADRAO } from "../nucleo/tipos.js";
import { AgenteFixo, type ComportamentoAgente } from "../portas/agente-fixo.js";
import {
  AprovacaoMemoria,
  DecisoesMemoria,
  EventosMemoria,
  OrdensMemoria,
  RobosMemoria,
} from "../portas/memoria.js";
import { RelogioManual } from "../relogio.js";
import { RoboAoVivo } from "../robo.js";
import { candle } from "./candles.js";

export const T0 = Date.UTC(2026, 9, 10, 12, 0);
export const MIN = 60_000;
export const QUINZE = 15 * MIN;

/** Compra quando o preço cai abaixo de 95; stop 2%, alvo líquido 1%, taxa 0,1%. */
export const ESTRATEGIA: Estrategia = {
  entrada: {
    tipo: "comparar",
    esquerda: { tipo: "preco" },
    comparador: "<",
    direita: { tipo: "numero", valor: 95 },
  },
  stop: 0.02,
  alvoLiquido: 0.01,
  taxa: 0.001,
};

export function registroDeTeste() {
  const erros: { obj: object; msg: string }[] = [];
  const registro: Registro = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (obj, msg) => erros.push({ obj, msg }),
  };
  return { registro, erros };
}

/** Agente que o teste troca no meio do cenário. */
export class AgenteTrocavel implements PortaAgente {
  constructor(public atual: PortaAgente) {}
  analisar(...args: Parameters<PortaAgente["analisar"]>) {
    return this.atual.analisar(...args);
  }
  trocar(c: ComportamentoAgente | PortaAgente) {
    this.atual = typeof c === "string" ? new AgenteFixo(c) : c;
  }
}

export interface OpcoesCenario {
  readonly modo?: RoboConfig["modo"];
  readonly agente?: ComportamentoAgente | PortaAgente;
  readonly agenteObrigatorio?: boolean;
  readonly saldo?: string;
  readonly aoSolicitar?: (decisaoId: string, decisoes: DecisoesMemoria) => void;
  readonly candlesHistorico?: number;
  readonly tamanhoHistorico?: number;
  /** Troca o "dormir" da consulta de aprovação (padrão: avança o relógio na hora). */
  readonly dormir?: (ms: number) => Promise<void>;
  readonly candles?: PortaCandles;
  readonly riscoConta?: PortaRiscoConta;
}

export const USUARIO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

export function montarCenario(o: OpcoesCenario = {}) {
  const relogio = new RelogioManual(T0);
  const papel = new PapelCorretora({
    saldos: { USDT: dec(o.saldo ?? "1000") },
    taxa: 0.001,
    deslizamentoBps: 0,
    agora: () => relogio.agora(),
  });
  const robo: RoboConfig = {
    id: "r1",
    usuarioId: USUARIO,
    simbolo: "BTCUSDT",
    intervalo: "15m",
    modo: o.modo ?? "auto",
    rede: "papel",
    estrategia: ESTRATEGIA,
    limites: {
      perdaDiariaMaxima: dec(50),
      exposicaoMaxima: dec(1000),
      ordensPorHoraMax: 10,
      pausaAposPerdaMs: 0,
      confiancaMinima: 0.5,
    },
    riscoPorOperacao: dec(10),
  };
  const decisoes = new DecisoesMemoria();
  const agente = new AgenteTrocavel(new AgenteFixo("sempre_concorda"));
  if (o.agente) agente.trocar(o.agente);
  const { registro, erros } = registroDeTeste();
  const deps = {
    corretora: papel,
    robos: new RobosMemoria([robo]),
    decisoes,
    ordens: new OrdensMemoria(relogio),
    agente,
    eventos: new EventosMemoria(),
    aprovacao: new AprovacaoMemoria((id) => o.aoSolicitar?.(id, decisoes)),
    ...(o.candles ? { candles: o.candles } : {}),
    ...(o.riscoConta ? { riscoConta: o.riscoConta } : {}),
    relogio,
    registro,
    dormir: o.dormir ?? relogio.dormir,
    opcoes: {
      ...OPCOES_PADRAO,
      agenteObrigatorio: o.agenteObrigatorio ?? true,
      tamanhoHistorico: o.tamanhoHistorico ?? 100,
    },
  } satisfies Dependencias;

  const inicioAoVivo = T0 - QUINZE * (o.candlesHistorico ?? 30);
  for (let t = inicioAoVivo; t < T0; t += QUINZE) papel.alimentar("BTCUSDT", "15m", candle(t, 100, QUINZE));
  let proximo15 = T0;
  let proximo1 = T0;
  let aoVivo = new RoboAoVivo(robo, deps);
  /** Espera tudo (decisão e aprovação) ou só a decisão em andamento. */
  const esperar = (tudo: boolean) => (tudo ? aoVivo.ocioso() : aoVivo.nucleo.semDecisaoEmAndamento());

  return {
    ...deps,
    deps,
    papel,
    robo,
    agente,
    erros,
    get aoVivo() {
      return aoVivo;
    },
    /** Simula o processo caindo e voltando: robô novo (memória zerada), mesmas portas e corretora. */
    async reiniciar() {
      await aoVivo.parar();
      aoVivo = new RoboAoVivo(robo, deps);
      await aoVivo.iniciar();
      return aoVivo;
    },
    /** Fecha o próximo candle de 15 min no preço dado e espera o robô decidir. */
    async fecharIntervalo(preco: number | string, entregar = true, tudo = true) {
      const c = candle(proximo15, preco, QUINZE);
      proximo15 += QUINZE;
      relogio.definir(Math.max(relogio.agora(), c.fechamento + 1));
      if (entregar) papel.alimentar("BTCUSDT", "15m", c);
      await esperar(tudo);
      return c;
    },
    async fecharMinuto(preco: number | string, tudo = true) {
      const c = candle(proximo1, preco, MIN);
      proximo1 += MIN;
      relogio.definir(Math.max(relogio.agora(), c.fechamento + 1));
      papel.alimentar("BTCUSDT", "1m", c);
      await esperar(tudo);
      return c;
    },
    ordensEnviadas: () => deps.ordens.todas(),
  };
}
