import type { Evento } from "@zentrade/contratos";
import type { DadosProposta } from "@zentrade/banco";
import type { ClienteN8n } from "./n8n.js";
import type { Log } from "./tipos.js";

const LIMITE_RESUMO = 1000;
const LIMITE_LEMBRADAS = 5000;

/**
 * Quando o motor registra uma decisão em `aguardando_aprovacao` (modo Sugerir), a API
 * manda a proposta ao n8n, que pergunta à pessoa (Telegram, e-mail...). A resposta
 * volta pelo webhook /webhooks/n8n/aprovacao. Falha aqui nunca derruba a API.
 */
export function criarRetransmissorN8n(o: {
  decisoes: { paraProposta(id: string): Promise<DadosProposta | null> };
  n8n: ClienteN8n;
  log: Log;
}): (evento: Evento) => Promise<void> {
  const enviadas = new Set<string>();

  return async (evento) => {
    if (evento.tipo !== "decisao" || evento.decisao.estado !== "aguardando_aprovacao") return;
    const { id, sinal } = evento.decisao;
    if (sinal.acao === "AGUARDAR" || enviadas.has(id)) return;
    try {
      const dados = await o.decisoes.paraProposta(id);
      if (!dados) {
        o.log.warn({ decisaoId: id }, "proposta não enviada ao n8n: decisão sem prazo ou quantidade");
        return;
      }
      await o.n8n.enviarProposta({
        decisaoId: id,
        roboId: dados.roboId,
        simbolo: dados.simbolo,
        acao: sinal.acao,
        quantidade: dados.quantidade,
        preco: dados.preco,
        resumo: dados.explicacao.slice(0, LIMITE_RESUMO),
        expiraEm: dados.expiraEm,
      });
      if (enviadas.size >= LIMITE_LEMBRADAS) enviadas.clear();
      enviadas.add(id);
    } catch (erro) {
      o.log.error({ err: erro, decisaoId: id }, "falha ao enviar proposta ao n8n");
    }
  };
}
