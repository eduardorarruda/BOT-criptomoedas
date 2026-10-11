import {
  PedidoRespostaAgenteEsquema,
  type EstadoAgenteAssistente,
  type EventoRespostaAgente,
  type PedidoRespostaAgente,
} from "@zentrade/contratos";
import type { FastifyInstance } from "fastify";
import { LimiteAnalises } from "../limite.js";
import { autorizado, erro } from "../servidor.js";
import type { Emitir } from "./servico-chat.js";

export interface ServicoResposta {
  responder(pedido: PedidoRespostaAgente, emitir: Emitir, sinal: AbortSignal): Promise<void>;
}

export interface OpcoesRotasAssistente {
  readonly segredo: string;
  readonly servico: ServicoResposta;
  readonly estado: () => EstadoAgenteAssistente;
  /** Prazo de uma resposta inteira (padrão 5 min). */
  readonly tempoMs?: number;
  readonly maxSimultaneas?: number;
  readonly maxPorMinuto?: number;
}

/**
 * Rotas do assistente no agente (rede interna; quem chama é a API, que autentica a pessoa
 * e manda o usuarioId). A resposta sai em NDJSON — um EventoRespostaAgente por linha —
 * conforme o modelo escreve. Se a API desconectar, a resposta é cancelada.
 */
export function registrarRotasAssistente(app: FastifyInstance, o: OpcoesRotasAssistente): void {
  const limite = new LimiteAnalises(o.maxSimultaneas ?? 4, o.maxPorMinuto ?? 20);

  app.get("/assistente/estado", async (req, resposta) => {
    if (!autorizado(req.headers.authorization, o.segredo)) {
      return erro(resposta, 401, "nao_autorizado", "Envie Authorization: Bearer com o AGENTE_SEGREDO.");
    }
    return o.estado();
  });

  app.post("/assistente/responder", async (req, resposta) => {
    if (!autorizado(req.headers.authorization, o.segredo)) {
      return erro(resposta, 401, "nao_autorizado", "Envie Authorization: Bearer com o AGENTE_SEGREDO.");
    }
    const lido = PedidoRespostaAgenteEsquema.safeParse(req.body);
    if (!lido.success)
      return erro(resposta, 400, "pedido_invalido", `Pedido do assistente inválido: ${lido.error.message}`);
    if (!limite.entrar()) {
      return erro(
        resposta,
        429,
        "limite_excedido",
        "Muitas respostas do assistente ao mesmo tempo. Tente daqui a pouco.",
      );
    }
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), o.tempoMs ?? 300_000);
    resposta.hijack();
    // A API desconectou antes do fim: para de gerar (e de gastar).
    resposta.raw.on("close", () => {
      if (!resposta.raw.writableFinished) controle.abort();
    });
    resposta.raw.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    });
    const emitir = (e: EventoRespostaAgente) => {
      if (!resposta.raw.destroyed) resposta.raw.write(`${JSON.stringify(e)}\n`);
    };
    try {
      await o.servico.responder(lido.data, emitir, controle.signal);
    } finally {
      clearTimeout(prazo);
      limite.sair();
      resposta.raw.end();
    }
  });
}
