import {
  AvisoEsquema,
  DivergenciaEsquema,
  LimitesContaEsquema,
  ResultadoReconciliacaoEsquema,
  SituacaoContaEsquema,
  type AvisoDTO,
  type DivergenciaDTO,
  type LimitesContaDTO,
  type ResultadoReconciliacao,
  type SituacaoConta,
} from "@zentrade/contratos/esquemas";
import { z } from "zod";
import { criarCliente, type ClienteApi } from "../../api/cliente";
import { demoRisco } from "./demo";

/**
 * De onde a tela de Risco tira os limites da conta, as pausas, as divergências com a
 * corretora, o orçamento de IA e os avisos: a API (`/risco/...`, `/avisos`) ou a
 * demonstração. Ações que afrouxam a proteção pedem reautenticação na API.
 */
export interface FonteRisco {
  situacao(): Promise<SituacaoConta>;
  salvarLimites(l: LimitesContaDTO): Promise<LimitesContaDTO>;
  liberar(): Promise<LimitesContaDTO>;
  divergencias(): Promise<DivergenciaDTO[]>;
  reconciliar(): Promise<ResultadoReconciliacao>;
  aceitar(id: string): Promise<DivergenciaDTO>;
  avisos(): Promise<AvisoDTO[]>;
  marcarLidos(): Promise<number>;
}

const Lidos = z.object({ lidos: z.number().int() });

export function criarFonteRisco(cliente: ClienteApi = criarCliente()): FonteRisco {
  const { pedir } = cliente;
  return {
    situacao: () => pedir("GET", "/risco/conta", SituacaoContaEsquema),
    salvarLimites: (l) => pedir("PUT", "/risco/limites-conta", LimitesContaEsquema, l),
    liberar: () => pedir("POST", "/risco/liberar", LimitesContaEsquema),
    divergencias: () => pedir("GET", "/risco/divergencias", z.array(DivergenciaEsquema)),
    reconciliar: () => pedir("POST", "/risco/reconciliar", ResultadoReconciliacaoEsquema),
    aceitar: (id) =>
      pedir("POST", `/risco/divergencias/${encodeURIComponent(id)}/aceitar`, DivergenciaEsquema),
    avisos: () => pedir("GET", "/avisos", z.array(AvisoEsquema)),
    marcarLidos: async () => (await pedir("POST", "/avisos/lidos", Lidos)).lidos,
  };
}

/** A demonstração guarda o estado na memória da aba: salvar, liberar e aceitar mudam a tela. */
export function criarFonteRiscoDemo(agora: () => number = Date.now, vazio = false): FonteRisco {
  const demo = demoRisco(agora(), { vazio });
  return {
    situacao: async () => demo.situacao(agora()),
    salvarLimites: async (l) => demo.salvarLimites(l),
    liberar: async () => demo.liberar(agora()),
    divergencias: async () => demo.divergencias(),
    reconciliar: async () => demo.reconciliar(agora()),
    aceitar: async (id) => demo.aceitar(id, agora()),
    avisos: async () => demo.avisos(),
    marcarLidos: async () => demo.marcarLidos(agora()),
  };
}
