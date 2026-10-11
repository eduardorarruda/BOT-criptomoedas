import { NovaMensagemEsquema, type EventoChat, type MensagemAssistente } from "@zentrade/contratos";
import type { FastifyBaseLogger, FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import { montarResposta, type ClienteAssistente } from "../integracoes/assistente.js";
import { TITULO_PADRAO } from "./assistente.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

/** Quantas mensagens anteriores vão como contexto para o modelo. */
const HISTORICO = 20;
const LIMITE_RESPOSTAS = { max: 20, timeWindow: "1 minute" } as const;

/** Uma resposta por conversa de cada vez (duas abas, duplo clique). */
const ocupadas = new Set<string>();

const tituloDe = (texto: string): string => {
  const linha = texto.replace(/\s+/g, " ").trim();
  return linha.length > 60 ? `${linha.slice(0, 59)}…` : linha;
};

/** Abre o fluxo de eventos (SSE) direto no socket: a resposta vai saindo enquanto o modelo escreve. */
function abrirSse(reply: FastifyReply): (e: EventoChat) => void {
  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-accel-buffering": "no",
    connection: "keep-alive",
  });
  return (e) => {
    if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
  };
}

interface Rodada {
  readonly usuarioId: string;
  readonly conversaId: string;
  readonly pergunta: string;
  readonly historico: { papel: MensagemAssistente["papel"]; texto: string }[];
}

/** Repassa os eventos do agente para a tela e devolve a resposta montada, mesmo se falhar no meio. */
async function transmitir(
  assistente: ClienteAssistente,
  r: Rodada,
  enviar: (e: EventoChat) => void,
  sinal: AbortSignal,
  log: FastifyBaseLogger,
) {
  const resposta = montarResposta();
  try {
    const eventos = assistente.responder(
      { usuarioId: r.usuarioId, historico: r.historico, pergunta: r.pergunta },
      sinal,
    );
    for await (const e of eventos) {
      resposta.aplicar(e);
      if (e.tipo === "texto" || e.tipo === "ferramenta" || e.tipo === "fontes") enviar(e);
    }
  } catch (erro) {
    if (!sinal.aborted) log.error({ err: erro }, "falha ao falar com o agente no assistente");
    resposta.falhar(
      sinal.aborted ? "interrompida" : "erro",
      sinal.aborted
        ? "A resposta foi interrompida antes do fim."
        : "Não consegui falar com o agente de IA agora.",
    );
  }
  if (sinal.aborted) resposta.falhar("interrompida", "A resposta foi interrompida antes do fim.");
  return resposta.resultado();
}

/** Confere tudo antes de abrir o fluxo: conversa da pessoa, agente configurado, sem resposta em andamento. */
async function conferir(deps: Dependencias, usuarioId: string, conversaId: string) {
  const conversa = ouNaoEncontrado(
    await deps.banco.assistente.obterConversa(usuarioId, conversaId),
    "conversa",
  );
  if (!deps.assistente) {
    throw new ErroApi(
      503,
      "assistente_indisponivel",
      "o assistente está desligado: configure AGENTE_URL e AGENTE_SEGREDO na API",
    );
  }
  if (ocupadas.has(conversaId)) {
    throw new ErroApi(409, "resposta_em_andamento", "esta conversa já está respondendo; espere terminar");
  }
  return { conversa, agente: deps.assistente };
}

/** Grava a pergunta (e dá título à conversa nova) e devolve o histórico de antes dela. */
async function registrarPergunta(
  deps: Dependencias,
  usuarioId: string,
  conversaId: string,
  texto: string,
  nova: boolean,
) {
  const { assistente } = deps.banco;
  const historico = await assistente.historico(usuarioId, conversaId, HISTORICO);
  const usuario = await assistente.acrescentarMensagem(usuarioId, conversaId, { papel: "usuario", texto });
  if (nova) await assistente.renomearConversa(usuarioId, conversaId, tituloDe(texto));
  return { historico, usuario };
}

/**
 * `POST /assistente/conversas/:id/mensagens`: grava a pergunta, pede a resposta ao
 * agente e devolve tudo em SSE (`inicio`, pedaços de `texto`, `ferramenta`, `fontes` e
 * `fim` com a resposta gravada). Fechar a aba interrompe a resposta; o que já veio fica.
 */
export const rotasAssistenteMensagens: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (
  app,
  { deps },
) => {
  app.post(
    "/assistente/conversas/:id/mensagens",
    {
      config: { acesso: "sessao", rateLimit: LIMITE_RESPOSTAS },
      schema: { params: ParamId, body: NovaMensagemEsquema },
    },
    async (req, reply) => {
      const usuarioId = usuarioIdDe(req);
      const conversaId = exigirUuid(req.params.id, "conversa");
      const { conversa, agente } = await conferir(deps, usuarioId, conversaId);
      ocupadas.add(conversaId);
      try {
        const nova = conversa.titulo === TITULO_PADRAO && conversa.mensagens.length === 0;
        const { historico, usuario } = await registrarPergunta(
          deps,
          usuarioId,
          conversaId,
          req.body.texto,
          nova,
        );
        const enviar = abrirSse(reply);
        enviar({ tipo: "inicio", usuario });
        const controle = new AbortController();
        reply.raw.on("close", () => {
          if (!reply.raw.writableFinished) controle.abort();
        });
        const rodada = { usuarioId, conversaId, pergunta: req.body.texto, historico };
        const final = await transmitir(agente, rodada, enviar, controle.signal, req.log);
        const mensagem = await deps.banco.assistente.acrescentarMensagem(usuarioId, conversaId, {
          papel: "assistente",
          ...final,
        });
        enviar({ tipo: "fim", mensagem });
      } catch (erro) {
        if (!reply.sent && !reply.raw.headersSent) throw erro;
        req.log.error({ err: erro }, "falha ao gravar a resposta do assistente");
      } finally {
        ocupadas.delete(conversaId);
        if (reply.raw.headersSent) reply.raw.end();
      }
    },
  );
};
