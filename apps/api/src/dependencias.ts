import type { Banco } from "@zentrade/banco";
import type { Config } from "./config.js";
import type { AntiReplay } from "./integracoes/anti-replay.js";
import type { ClienteAssistente } from "./integracoes/assistente.js";
import type { ServicoArquivos } from "./integracoes/conhecimento-arquivos.js";
import type { RegistroAutomacoes } from "./integracoes/automacoes.js";
import type { ServicoConhecimento } from "./integracoes/conhecimento.js";
import type { ServicoCarteira } from "./integracoes/binance-carteira.js";
import type { FabricaConta } from "./integracoes/binance-conta.js";
import type { HubEventos } from "./integracoes/eventos.js";
import type { ClienteCotacoesB3 } from "./integracoes/cotacoes-b3.js";
import type { CentralAlertas } from "./integracoes/alertas.js";
import type { ClienteN8n } from "./integracoes/n8n.js";
import type { Reconciliador } from "./integracoes/reconciliacao.js";
import type { ServicosRendaFixa } from "./rotas/renda-fixa-servico.js";

export interface FilaBacktests {
  adicionar(backtestId: string): Promise<void>;
}

export interface FilaImportacoesB3 {
  adicionar(importacaoId: string): Promise<void>;
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
  readonly filaImportacoesB3: FilaImportacoesB3;
  /** Pasta compartilhada com o motor onde o .zip da B3 fica até ser processado. */
  readonly diretorioImportacoesB3: string;
  readonly n8n: ClienteN8n;
  readonly conhecimento: ServicoConhecimento;
  readonly automacoes: RegistroAutomacoes;
  readonly antiReplay: AntiReplay;
  readonly hub: HubEventos;
  readonly saude: VerificadorSaude;
  readonly agora: () => number;
  /** Carteira da Binance. Sem isto, as rotas montam a padrão (Binance de verdade, pelo fetch global). */
  readonly carteira?: ServicoCarteira;
  /** Índices do Banco Central e Pluggy. Sem isso, as rotas de renda fixa explicam o que falta. */
  readonly rendaFixa?: ServicosRendaFixa;
  /** Cotações de FIIs (brapi). Ausente = sem cotação automática. */
  readonly cotacoesB3?: ClienteCotacoesB3;
  /** De quanto em quanto tempo o WebSocket confere se a sessão (ou o token) ainda vale. Padrão 30 s. */
  readonly verificacaoTempoRealMs?: number;
  /** Assistente (chat) no agente. Ausente = rotas do assistente respondem 503. */
  readonly assistente?: ClienteAssistente | null;
  /** Arquivos, links e busca na base de conhecimento. Ausente = essas rotas respondem 503. */
  readonly arquivos?: ServicoArquivos;
  /** Alertas (dedup, aviso na tela, n8n). Ausente = a reconciliação não avisa. */
  readonly alertas?: CentralAlertas;
  /** Conferência com a corretora. Sem isto, as rotas montam a padrão (Binance de verdade). */
  readonly reconciliador?: Reconciliador;
  /** Conta da Binance da conferência padrão (os testes passam uma Binance simulada). */
  readonly criarContaBinance?: FabricaConta;
}
