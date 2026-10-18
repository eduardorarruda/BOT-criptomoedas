import {
  CoberturaWinEsquema,
  DecisaoEsquema,
  EstrategiaEsquema,
  OrdemEsquema,
  PosicaoEsquema,
  RoboEsquema,
} from "@zentrade/contratos/esquemas";
import { z } from "zod";
import { criarCliente, type ClienteApi } from "./cliente";
import { ehErroApi } from "./erros";
import {
  AutomacaoEsquema,
  BacktestEsquema,
  CandleApiEsquema,
  ContaCorretoraEsquema,
  DocumentoEsquema,
  DocumentoIngeridoEsquema,
  ParadaTotalEsquema,
  PontoPatrimonioEsquema,
  RespostaAoVivoEsquema,
  ResumoEsquema,
  SaudeEsquema,
  SessaoEsquema,
  TokenApiEsquema,
  TokenCriadoEsquema,
} from "./esquemas";
import {
  ConfigPublicaEsquema,
  SegredoDoisFatoresEsquema,
  type Sessao,
  type Usuario,
} from "@zentrade/contratos/esquemas";
import type { Fonte } from "./fonte";
import { conectarTempoReal } from "./tempoReal";

/** A API de verdade, conforme docs/contrato-api.md. */
export function criarFonteApi(cliente: ClienteApi = criarCliente()): Fonte {
  const { pedir } = cliente;
  const lista = <T>(e: z.ZodType<T>) => z.array(e);

  /** Toda escrita leva o csrf da sessão: guardamos o que a API devolve. */
  function lembrar(s: Sessao): Usuario {
    cliente.definirCsrf?.(s.csrf);
    return s.usuario;
  }

  async function obterSessao(): Promise<Usuario | null> {
    try {
      return lembrar(await pedir("GET", "/sessao", SessaoEsquema));
    } catch (e) {
      if (ehErroApi(e) && e.codigo === "nao_autenticado") return null;
      throw e;
    }
  }

  return {
    demo: false,
    obterSessao,
    entrar: async (c) => lembrar(await pedir("POST", "/sessao", SessaoEsquema, c)),
    sair: async () => {
      await pedir("DELETE", "/sessao", null);
      cliente.definirCsrf?.(null);
    },
    confirmarIdentidade: async (c) => {
      await pedir("POST", "/sessao/confirmar", null, c);
    },
    iniciarDoisFatores: () => pedir("POST", "/sessao/2fa", SegredoDoisFatoresEsquema),
    ativarDoisFatores: async (codigo) => {
      await pedir("POST", "/sessao/2fa/ativar", null, { codigo });
    },

    resumo: () => pedir("GET", "/resumo", ResumoEsquema),
    patrimonio: () => pedir("GET", "/patrimonio", lista(PontoPatrimonioEsquema)),
    saude: () => pedir("GET", "/saude", SaudeEsquema),
    configPublica: () => pedir("GET", "/publico/config", ConfigPublicaEsquema),

    estrategias: () => pedir("GET", "/estrategias", lista(EstrategiaEsquema)),
    criarEstrategia: (e) => pedir("POST", "/estrategias", EstrategiaEsquema, e),
    novaVersaoEstrategia: (id, e) =>
      pedir("POST", `/estrategias/${encodeURIComponent(id)}/versoes`, EstrategiaEsquema, e),

    robos: () => pedir("GET", "/robos", lista(RoboEsquema)),
    criarRobo: (r) => pedir("POST", "/robos", RoboEsquema, { ...r, modo: "observar" }),
    atualizarRobo: (id, m) => pedir("PATCH", `/robos/${encodeURIComponent(id)}`, RoboEsquema, m),
    posicao: (id) => pedir("GET", `/robos/${encodeURIComponent(id)}/posicao`, PosicaoEsquema),

    decisoes: (f = {}) => pedir("GET", "/decisoes", lista(DecisaoEsquema), undefined, { ...f }),
    aprovarDecisao: (id) => pedir("POST", `/decisoes/${encodeURIComponent(id)}/aprovar`, DecisaoEsquema),
    recusarDecisao: (id) => pedir("POST", `/decisoes/${encodeURIComponent(id)}/recusar`, DecisaoEsquema),

    ordens: (roboId) => pedir("GET", "/ordens", lista(OrdemEsquema), undefined, { roboId }),
    candles: (simbolo, intervalo) =>
      pedir("GET", `/mercado/${encodeURIComponent(simbolo)}/candles`, lista(CandleApiEsquema), undefined, {
        intervalo,
      }),
    definirParadaTotal: async (ligada) =>
      (await pedir("POST", "/parada-total", ParadaTotalEsquema, { ligada })).ligada,

    contas: () => pedir("GET", "/contas-corretora", lista(ContaCorretoraEsquema)),
    criarConta: (c) => pedir("POST", "/contas-corretora", ContaCorretoraEsquema, c),
    removerConta: async (id) => {
      await pedir("DELETE", `/contas-corretora/${encodeURIComponent(id)}`, null);
    },

    tokens: () => pedir("GET", "/tokens", lista(TokenApiEsquema)),
    criarToken: (nome, escopo) => pedir("POST", "/tokens", TokenCriadoEsquema, { nome, escopo }),
    revogarToken: async (id) => {
      await pedir("DELETE", `/tokens/${encodeURIComponent(id)}`, null);
    },

    backtests: () => pedir("GET", "/backtests", lista(BacktestEsquema)),
    criarBacktest: (p) => pedir("POST", "/backtests", BacktestEsquema, p),
    backtest: (id) => pedir("GET", `/backtests/${encodeURIComponent(id)}`, BacktestEsquema),
    dadosWin: () => pedir("GET", "/backtests/dados-win", lista(CoberturaWinEsquema)),

    documentos: () => pedir("GET", "/conhecimento/documentos", lista(DocumentoEsquema)),
    criarNota: (n) => pedir("POST", "/conhecimento/notas", DocumentoIngeridoEsquema, n),
    automacoes: () => pedir("GET", "/automacoes", lista(AutomacaoEsquema)),

    aoVivo: async (roboId) =>
      (
        await pedir(
          "GET",
          roboId ? `/aovivo/${encodeURIComponent(roboId)}/recentes` : "/aovivo/recentes",
          RespostaAoVivoEsquema,
        )
      ).eventos,

    tempoReal: (o) => conectarTempoReal(o),
  };
}
