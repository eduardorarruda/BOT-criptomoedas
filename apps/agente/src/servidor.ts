import { createHash, timingSafeEqual } from "node:crypto";
import type { PedidoAnalise, RespostaAnalise } from "@zentrade/contratos";
import { paraTexto } from "@zentrade/dominio";
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply } from "fastify";
import { ErroPropostaInvalida, type OpcoesAnalise } from "./analista.js";
import { ErroClaudeCli } from "./claude-cli/analista-cli.js";
import { ErroContas } from "./claude-cli/contas.js";
import { observadorDaAnalise, publicadorNulo, type PublicadorEventos } from "./eventos/publicador.js";
import { ErroProvedorIndisponivel } from "./provedores/analista-por-pessoa.js";
import { LimiteAnalises } from "./limite.js";
import { lerCorpoAnalise } from "./serializacao.js";

export interface AnalistaServico {
  analisar(pedido: PedidoAnalise, opcoes: OpcoesAnalise): Promise<RespostaAnalise>;
}

export interface OpcoesServidor {
  readonly analista: AnalistaServico;
  readonly segredo: string;
  /** Abaixo dos 60 s do motor, para o agente responder (504) antes de o motor desistir. */
  readonly timeoutMs?: number;
  /** Instalação de um usuário só: dono da base de conhecimento quando o pedido não diz. */
  readonly usuarioIdPadrao?: string;
  readonly logger?: FastifyBaseLogger | false;
  /** Análises ao mesmo tempo (padrão 4) e iniciadas por minuto (padrão 30): teto de custo. */
  readonly maxSimultaneas?: number;
  readonly maxPorMinuto?: number;
  readonly agora?: () => number;
  /** Para onde vão os passos ao vivo (eventos "analise"). Sem ele, não são publicados. */
  readonly publicador?: PublicadorEventos;
  /** Rotas a mais no mesmo serviço (ponte MCP, assistente). */
  readonly extras?: readonly ((app: FastifyInstance) => void)[];
}

/** O PedidoAnalise cabe com folga (até 2000 fechamentos); acima disso é erro ou abuso. */
const LIMITE_CORPO_BYTES = 256 * 1024;

class ErroTempoEsgotado extends Error {
  override name = "ErroTempoEsgotado";
}

const resumo = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Compara em tempo constante: o tempo de resposta não revela quantos caracteres batem. */
export function autorizado(cabecalho: string | undefined, segredo: string): boolean {
  return timingSafeEqual(resumo(cabecalho ?? ""), resumo(`Bearer ${segredo}`));
}

export const erro = (resposta: FastifyReply, status: number, codigo: string, mensagem: string) =>
  resposta.code(status).send({ erro: { codigo, mensagem } });

async function comPrazo<T>(ms: number, tarefa: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controle = new AbortController();
  let relogio: NodeJS.Timeout | undefined;
  const prazo = new Promise<never>((_ok, falhar) => {
    relogio = setTimeout(() => {
      // Rejeita antes de abortar: quem vence a corrida é o prazo, não o erro do aborto.
      falhar(new ErroTempoEsgotado(`a análise passou de ${ms} ms`));
      controle.abort();
    }, ms);
  });
  try {
    return await Promise.race([tarefa(controle.signal), prazo]);
  } finally {
    clearTimeout(relogio);
  }
}

function tratarFalha(e: unknown, resposta: FastifyReply, log: FastifyBaseLogger) {
  if (e instanceof ErroTempoEsgotado) {
    log.warn({ err: e }, "análise estourou o tempo");
    return erro(
      resposta,
      504,
      "tempo_esgotado",
      "A análise demorou demais. Sem proposta, o motor não opera.",
    );
  }
  if (e instanceof ErroProvedorIndisponivel || e instanceof ErroContas) {
    log.warn({ err: e }, "provedor do analista indisponível");
    return erro(resposta, 503, "provedor_indisponivel", e.message);
  }
  if (e instanceof ErroClaudeCli) {
    log.warn({ err: e, codigo: e.codigo, detalhe: e.detalhe }, "falha do Claude Code");
    return erro(resposta, 502, "falha_claude_cli", e.message);
  }
  if (e instanceof ErroPropostaInvalida) {
    log.warn({ err: e }, "proposta fora do esquema");
    return erro(resposta, 502, "proposta_invalida", e.message);
  }
  log.error({ err: e }, "falha na análise");
  return erro(
    resposta,
    502,
    "falha_agente",
    "O agente de IA falhou ao analisar. Veja o log do serviço agente.",
  );
}

/** Cada ferramenta consultada vira um evento "analise" ligado ao analiseId do pedido. */
function comObservador(pedido: PedidoAnalise, publicador: PublicadorEventos = publicadorNulo) {
  const aoUsarFerramenta = observadorDaAnalise({
    analiseId: pedido.analiseId,
    roboId: pedido.robo.id,
    publicador,
  });
  return aoUsarFerramenta ? { aoUsarFerramenta } : {};
}

/** POST /analisar: autentica, valida, aplica o teto de custo e o prazo, e devolve a proposta. */
function registrarAnalisar(app: FastifyInstance, o: OpcoesServidor): void {
  const timeoutMs = o.timeoutMs ?? 55_000;
  const limite = new LimiteAnalises(o.maxSimultaneas ?? 4, o.maxPorMinuto ?? 30, o.agora);
  app.post("/analisar", async (pedido, resposta) => {
    if (!autorizado(pedido.headers.authorization, o.segredo)) {
      return erro(resposta, 401, "nao_autorizado", "Envie Authorization: Bearer com o AGENTE_SEGREDO.");
    }
    const lido = lerCorpoAnalise(pedido.body);
    if (!lido.ok) return erro(resposta, 400, "pedido_invalido", `PedidoAnalise inválido: ${lido.erro}`);
    const usuarioId = lido.valor.usuarioId ?? o.usuarioIdPadrao;
    if (!usuarioId) {
      return erro(
        resposta,
        400,
        "pedido_invalido",
        "Informe usuarioId no pedido ou configure ZENTRADE_USUARIO_ID.",
      );
    }
    if (!limite.entrar()) {
      return erro(
        resposta,
        429,
        "limite_excedido",
        "Análises demais ao mesmo tempo ou no último minuto. O robô não opera neste sinal; tente no próximo.",
      );
    }
    try {
      const r = await comPrazo(timeoutMs, (signal) =>
        o.analista.analisar(lido.valor.pedido, {
          usuarioId,
          signal,
          ...(lido.valor.orcamento ? { orcamento: lido.valor.orcamento } : {}),
          ...comObservador(lido.valor.pedido, o.publicador),
        }),
      );
      return {
        proposta: r.proposta,
        custoUsd: paraTexto(r.custoUsd),
        ...(r.semOrcamento ? { semOrcamento: true } : {}),
      };
    } catch (e) {
      return tratarFalha(e, resposta, pedido.log);
    } finally {
      limite.sair();
    }
  });
}

/** Serviço HTTP do agente (porta 8081, só rede interna). */
export function criarServidor(o: OpcoesServidor): FastifyInstance {
  const app = o.logger
    ? Fastify({ loggerInstance: o.logger, bodyLimit: LIMITE_CORPO_BYTES })
    : Fastify({ logger: false, bodyLimit: LIMITE_CORPO_BYTES });
  app.setErrorHandler((e: { statusCode?: number; message: string }, _pedido, resposta) => {
    const status = e.statusCode ?? 500;
    if (status < 500) return erro(resposta, status, "pedido_invalido", `Pedido malformado: ${e.message}`);
    app.log.error({ err: e }, "erro inesperado");
    return erro(resposta, 500, "erro_interno", "Erro inesperado no agente. Veja o log do serviço.");
  });
  app.get("/saude", async () => ({ ok: true }));
  registrarAnalisar(app, o);
  for (const registrar of o.extras ?? []) registrar(app);
  return app;
}
