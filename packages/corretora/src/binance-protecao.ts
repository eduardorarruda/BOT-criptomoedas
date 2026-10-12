import type {
  IdsProtecao,
  PedidoProtecao,
  PernaProtecao,
  ResultadoOrdem,
  ResultadoProtecao,
} from "@zentrade/contratos";
import { paraTexto } from "@zentrade/dominio";
import type { ClienteBinance } from "./cliente.js";
import type { OrdemConsultada, OrdensBinance } from "./binance-ordens.js";
import { ErroCorretora, ErroLimiteRequisicoes, ErroOrdemIncerta, ErroRede } from "./erros.js";
import { RespostaCancelamento, RespostaOco, RespostaOrdemResultado } from "./esquemas.js";

const CANCELAMENTO_RECUSADO = -2011; // "Unknown order sent.": já executou ou já saiu do livro
const TENTATIVAS_CONSULTA = 3;
const ESPERA_CONSULTA_MS = 1_000;
/** Status em que a perna ainda pode executar. */
const NO_LIVRO = new Set(["NEW", "PENDING_NEW", "PARTIALLY_FILLED", "PENDING_CANCEL"]);

type NomePerna = PernaProtecao["perna"];

const pernasDoPedido = (ids: IdsProtecao): [NomePerna, string][] => [
  ["stop", ids.stop],
  ...(ids.alvo ? [["alvo", ids.alvo] as [NomePerna, string]] : []),
];

const pernaNova = (perna: NomePerna, idCliente: string, orderId: number | null): PernaProtecao => ({
  perna,
  ordem: {
    idCliente,
    idCorretora: orderId === null ? null : String(orderId),
    estado: "PENDENTE",
    execucoes: [],
  } satisfies ResultadoOrdem,
});

const rejeitada = (ids: IdsProtecao, motivo: string): ResultadoProtecao => ({
  estado: "REJEITADA",
  idCorretora: null,
  pernas: pernasDoPedido(ids).map(([perna, id]) => ({
    perna,
    ordem: { idCliente: id, idCorretora: null, estado: "REJEITADA", execucoes: [] },
  })),
  motivo,
});

/** Junta as pernas consultadas: ATIVA se alguma segue no livro; EXECUTADA se uma executou por inteiro. */
function comporProtecao(pernas: readonly (readonly [NomePerna, OrdemConsultada])[]): ResultadoProtecao {
  const ativa = pernas.some(([, c]) => NO_LIVRO.has(c.status));
  const executada = pernas.some(([, c]) => c.status === "FILLED");
  const lista = pernas.find(([, c]) => c.idLista >= 0)?.[1].idLista;
  return {
    estado: ativa ? "ATIVA" : executada ? "EXECUTADA" : "CANCELADA",
    idCorretora: lista !== undefined ? String(lista) : (pernas[0]?.[1].resultado.idCorretora ?? null),
    pernas: pernas.map(([perna, c]) => ({ perna, ordem: c.resultado })),
  };
}

/**
 * Proteção que fica no livro da Binance Spot: STOP_LOSS_LIMIT sozinho ou OCO pelo
 * endpoint novo (POST /api/v3/orderList/oco: perna de cima LIMIT_MAKER no alvo, de
 * baixo STOP_LOSS_LIMIT). Mesma regra das ordens a mercado: falha sem resposta não
 * recoloca às cegas — confere pelos ids. Preços e quantidade já chegam arredondados
 * no passo da corretora (tickSize e stepSize).
 */
export class ProtecaoBinance {
  constructor(
    private readonly cliente: ClienteBinance,
    private readonly ordens: OrdensBinance,
    private readonly dormir: (ms: number) => Promise<void>,
  ) {}

  async colocar(p: PedidoProtecao): Promise<ResultadoProtecao> {
    try {
      return p.alvo ? await this.colocarOco(p, paraTexto(p.alvo)) : await this.colocarStop(p);
    } catch (erro) {
      if (erro instanceof ErroRede) return this.confirmarDepoisDeFalha(p, erro);
      // A Binance respondeu com erro (preço, saldo, filtro): nada entrou no livro.
      if (erro instanceof ErroCorretora && (erro.codigo !== null || erro instanceof ErroLimiteRequisicoes))
        return rejeitada(p.ids, erro.message);
      throw erro;
    }
  }

  async consultar(simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null> {
    const pernas: (readonly [NomePerna, OrdemConsultada])[] = [];
    for (const [perna, id] of pernasDoPedido(ids)) {
      const c = await this.ordens.consultarDetalhada(simbolo, id);
      if (c) pernas.push([perna, c]);
    }
    return pernas.length === 0 ? null : comporProtecao(pernas);
  }

  /** Cancela a lista (OCO) ou a ordem e devolve o estado final, consultado depois. */
  async cancelar(simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null> {
    try {
      if (ids.alvo)
        await this.cliente.assinado(
          "DELETE",
          "/api/v3/orderList",
          { symbol: simbolo, listClientOrderId: ids.lista },
          RespostaCancelamento,
        );
      else
        await this.cliente.assinado(
          "DELETE",
          "/api/v3/order",
          { symbol: simbolo, origClientOrderId: ids.stop },
          RespostaCancelamento,
        );
    } catch (erro) {
      if (!(erro instanceof ErroCorretora && erro.codigo === CANCELAMENTO_RECUSADO)) throw erro;
    }
    return this.consultar(simbolo, ids);
  }

  private async colocarOco(p: PedidoProtecao, alvo: string): Promise<ResultadoProtecao> {
    const r = await this.cliente.assinado(
      "POST",
      "/api/v3/orderList/oco",
      {
        symbol: p.simbolo,
        side: "SELL",
        quantity: paraTexto(p.quantidade),
        listClientOrderId: p.ids.lista,
        aboveType: "LIMIT_MAKER",
        abovePrice: alvo,
        aboveClientOrderId: p.ids.alvo,
        belowType: "STOP_LOSS_LIMIT",
        belowStopPrice: paraTexto(p.stop),
        belowPrice: paraTexto(p.limite),
        belowTimeInForce: "GTC",
        belowClientOrderId: p.ids.stop,
        newOrderRespType: "RESULT",
      },
      RespostaOco,
    );
    const orderId = (id: string) => r.orderReports.find((o) => o.clientOrderId === id)?.orderId ?? null;
    if (r.orderReports.some((o) => o.status !== "NEW")) return this.estadoAgora(p);
    return {
      estado: "ATIVA",
      idCorretora: String(r.orderListId),
      pernas: pernasDoPedido(p.ids).map(([perna, id]) => pernaNova(perna, id, orderId(id))),
    };
  }

  private async colocarStop(p: PedidoProtecao): Promise<ResultadoProtecao> {
    const r = await this.cliente.assinado(
      "POST",
      "/api/v3/order",
      {
        symbol: p.simbolo,
        side: "SELL",
        type: "STOP_LOSS_LIMIT",
        timeInForce: "GTC",
        quantity: paraTexto(p.quantidade),
        price: paraTexto(p.limite),
        stopPrice: paraTexto(p.stop),
        newClientOrderId: p.ids.stop,
        newOrderRespType: "RESULT",
      },
      RespostaOrdemResultado,
    );
    if (r.status !== "NEW") return this.estadoAgora(p);
    return {
      estado: "ATIVA",
      idCorretora: String(r.orderId),
      pernas: [pernaNova("stop", p.ids.stop, r.orderId)],
    };
  }

  /** Raro (executou ou expirou na hora): o estado e as execuções vêm da consulta. */
  private async estadoAgora(p: PedidoProtecao): Promise<ResultadoProtecao> {
    return (await this.consultar(p.simbolo, p.ids)) ?? rejeitada(p.ids, "A Binance não devolveu a proteção.");
  }

  private async confirmarDepoisDeFalha(p: PedidoProtecao, falha: ErroRede): Promise<ResultadoProtecao> {
    let ultimoErro: unknown = falha;
    for (let tentativa = 0; tentativa < TENTATIVAS_CONSULTA; tentativa++) {
      if (tentativa > 0) await this.dormir(ESPERA_CONSULTA_MS * tentativa);
      try {
        const r = await this.consultar(p.simbolo, p.ids);
        if (r) return r;
        ultimoErro = null;
      } catch (erro) {
        ultimoErro = erro;
      }
    }
    if (ultimoErro === null)
      return rejeitada(
        p.ids,
        `O envio da proteção falhou (${falha.message}) e ela não consta na Binance após ${TENTATIVAS_CONSULTA} consultas; não foi recolocada às cegas.`,
      );
    const detalhe = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro);
    throw new ErroOrdemIncerta(
      `Não dá para saber se a proteção ${p.ids.lista} entrou: o envio falhou (${falha.message}) e a consulta também (${detalhe}). Confira as ordens abertas na Binance.`,
      p.ids.lista,
    );
  }
}
