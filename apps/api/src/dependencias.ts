import type { Banco } from "@zentrade/banco";
import type { Config } from "./config.js";
import type { AntiReplay } from "./integracoes/anti-replay.js";
import type { RegistroAutomacoes } from "./integracoes/automacoes.js";
import type { ServicoConhecimento } from "./integracoes/conhecimento.js";
import type { HubEventos } from "./integracoes/eventos.js";
import type { ClienteCotacoesB3 } from "./integracoes/cotacoes-b3.js";
import type { ClienteN8n } from "./integracoes/n8n.js";

export interface FilaBacktests {
  adicionar(backtestId: string): Promise<void>;
}

/** Checagens de saúde que dependem de Redis e de outros serviços. */
export interface VerificadorSaude {
  redis(): Promise<boolean>;
  /** Segundos desde a última batida do motor; `null` se ele nunca bateu. */
  motorVivoHaSegundos(): Promise<number | null>;
  /** `null` quando AGENTE_URL não foi configurada. */
  agente(): Promise<boolean | null>;
}

/** Tudo o que a API usa de fora. Injetado: os testes trocam o que precisarem. */
export interface Dependencias {
  readonly config: Config;
  readonly banco: Banco;
  readonly fila: FilaBacktests;
  readonly n8n: ClienteN8n;
  readonly conhecimento: ServicoConhecimento;
  readonly automacoes: RegistroAutomacoes;
  readonly antiReplay: AntiReplay;
  readonly hub: HubEventos;
  readonly saude: VerificadorSaude;
  readonly agora: () => number;
  /** Cotações de FIIs (brapi). Ausente = sem cotação automática. */
  readonly cotacoesB3?: ClienteCotacoesB3;
  /** De quanto em quanto tempo o WebSocket confere se a sessão (ou o token) ainda vale. Padrão 30 s. */
  readonly verificacaoTempoRealMs?: number;
}
