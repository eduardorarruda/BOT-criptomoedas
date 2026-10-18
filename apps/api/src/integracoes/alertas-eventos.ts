import type { AlertaEmitido, Evento, GravidadeAlerta, OrdemDTO, TipoAlerta } from "@zentrade/contratos";
import { diaNoFuso } from "@zentrade/dominio";
import type { CentralAlertas } from "./alertas.js";
import type { Log } from "./tipos.js";

export interface ConsultasAlertas {
  descreverRobo(roboId: string): Promise<{ nome: string; simbolo: string; usuarioId: string } | null>;
  donoDaDecisao(decisaoId: string): Promise<string | null>;
  motivoDaDecisao(decisaoId: string): Promise<string | null>;
}

interface Regra {
  readonly tipo: TipoAlerta;
  readonly gravidade: GravidadeAlerta;
  readonly titulo: (robo: string) => string;
  /** Uma por dia, por robô, ou por pausa: a dedup da central faz o resto. */
  readonly chave: (roboId: string, dia: string) => string;
}

/** Barreiras do risco que viram alerta. As outras (frequência, confiança...) ficam só na tela. */
const BARREIRAS: Readonly<Record<string, Regra>> = {
  perda_diaria: {
    tipo: "perda_diaria_robo",
    gravidade: "atencao",
    titulo: (r) => `Perda do dia no limite: ${r}`,
    chave: (roboId, dia) => `perda_diaria:${roboId}:${dia}`,
  },
  conta_perda_diaria: {
    tipo: "perda_diaria_conta",
    gravidade: "critico",
    titulo: () => "Perda do dia da conta no limite",
    chave: (_r, dia) => `conta_perda_diaria:${dia}`,
  },
  sequencia_stops: {
    tipo: "pausa_sequencia_stops",
    gravidade: "atencao",
    titulo: () => "Compras pausadas: sequência de stops na conta",
    chave: () => "sequencia_stops:conta",
  },
  sequencia_stops_robo: {
    tipo: "pausa_sequencia_stops",
    gravidade: "atencao",
    titulo: (r) => `Compras pausadas: sequência de stops em ${r}`,
    chave: (roboId) => `sequencia_stops:${roboId}`,
  },
  conta_queda: {
    tipo: "pausa_queda",
    gravidade: "critico",
    titulo: () => "Compras pausadas: queda máxima da conta",
    chave: () => "conta_queda",
  },
};

const INCERTA = /estado incerto/i;

function alertaDaOrdem(
  o: OrdemDTO,
): Pick<AlertaEmitido, "tipo" | "gravidade" | "titulo" | "mensagem" | "chave"> | null {
  const lado = o.lado === "COMPRA" ? "Compra" : "Venda";
  if (o.estado === "REJEITADA")
    return {
      tipo: "ordem_rejeitada",
      gravidade: "atencao",
      titulo: `Ordem rejeitada: ${o.simbolo}`,
      mensagem: `${lado} de ${o.quantidade} ${o.simbolo} foi rejeitada pela corretora: ${o.motivo ?? "sem motivo informado"}.`,
      chave: `ordem_rejeitada:${o.idCliente}`,
    };
  if (o.estado === "PENDENTE" && o.motivo && INCERTA.test(o.motivo))
    return {
      tipo: "ordem_incerta",
      gravidade: "critico",
      titulo: `Ordem em estado incerto: ${o.simbolo}`,
      mensagem: `${lado} de ${o.quantidade} ${o.simbolo}: ${o.motivo} O robô não decide até conferir; confira na Binance se ela entrou.`,
      chave: `ordem_incerta:${o.idCliente}`,
    };
  return null;
}

/**
 * Ouve o canal de eventos e transforma o que importa em alerta: stop atingido, perda do
 * dia no limite, pausas da conta, ordem rejeitada ou incerta, e os alertas que o motor e
 * o agente já emitem prontos (robô que não liga, WebSocket fora, orçamento de IA).
 * Nunca lança: falha vai para o log.
 */
export function criarTradutorAlertas(o: {
  readonly central: CentralAlertas;
  readonly consultas: ConsultasAlertas;
  readonly log: Log;
  /** O fuso da instância: "um aviso por dia" é por dia local, não por dia UTC. */
  readonly fuso: string;
}): (evento: Evento) => Promise<void> {
  const { central, consultas } = o;

  async function doRisco(e: Extract<Evento, { tipo: "risco" }>): Promise<void> {
    const regra = BARREIRAS[e.barreira.codigo];
    if (!regra) return;
    const robo = await consultas.descreverRobo(e.roboId);
    if (!robo) return;
    await central.emitir({
      tipo: regra.tipo,
      gravidade: regra.gravidade,
      titulo: regra.titulo(robo.nome),
      mensagem: e.barreira.mensagem,
      chave: regra.chave(e.roboId, diaNoFuso(e.em, o.fuso)),
      usuarioId: robo.usuarioId,
      roboId: e.roboId,
      em: e.em,
    });
  }

  async function daOrdem(e: Extract<Evento, { tipo: "ordem" }>): Promise<void> {
    const alerta = alertaDaOrdem(e.ordem);
    if (!alerta) return;
    const usuarioId = await consultas.donoDaDecisao(e.ordem.decisaoId);
    if (!usuarioId) return;
    await central.emitir({ ...alerta, usuarioId, em: e.ordem.criadaEm });
  }

  async function daDecisao(e: Extract<Evento, { tipo: "decisao" }>): Promise<void> {
    const d = e.decisao;
    if (d.estado !== "executada" || d.sinal.acao !== "VENDER") return;
    if ((await consultas.motivoDaDecisao(d.id)) !== "stop") return;
    const robo = await consultas.descreverRobo(d.roboId);
    if (!robo) return;
    await central.emitir({
      tipo: "stop_atingido",
      gravidade: "atencao",
      titulo: `Stop atingido: ${robo.nome}`,
      mensagem: `${robo.nome} (${robo.simbolo}) vendeu a posição no stop, perto de ${d.preco}. ${d.sinal.explicacao}`,
      chave: `stop:${d.id}`,
      usuarioId: robo.usuarioId,
      roboId: d.roboId,
      em: d.em,
    });
  }

  return async (evento) => {
    try {
      if (evento.tipo === "alerta") await central.emitir(evento.alerta);
      else if (evento.tipo === "risco") await doRisco(evento);
      else if (evento.tipo === "ordem") await daOrdem(evento);
      else if (evento.tipo === "decisao") await daDecisao(evento);
    } catch (erro) {
      o.log.error({ err: erro, tipo: evento.tipo }, "falha ao transformar o evento em alerta");
    }
  };
}
