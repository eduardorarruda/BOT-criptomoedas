import type { PedidoOrdemMercado, ResultadoOrdem } from "@zentrade/contratos";
import { dec, type Lado } from "@zentrade/dominio";
import type { ClienteBinance } from "./cliente.js";
import { estadoDaOrdem, execucoesDosFills, type AtivosDoPar } from "./conversao.js";
import { ErroCorretora, ErroLimiteRequisicoes, ErroOrdemIncerta, ErroRede } from "./erros.js";
import { RespostaConsultaOrdem, RespostaNegocios, RespostaOrdemFull } from "./esquemas.js";

const ORDEM_INEXISTENTE = -2013;
const TENTATIVAS_CONSULTA = 3;
const ESPERA_CONSULTA_MS = 1_000;

const naoSabeSeChegou = (e: unknown): boolean => e instanceof ErroRede;

/**
 * Envio e consulta de ordens. Regra central: se o envio falhar sem resposta, a ordem
 * pode ter entrado. Nunca reenviar às cegas — consultar pelo idCliente.
 */
export class OrdensBinance {
  constructor(
    private readonly cliente: ClienteBinance,
    private readonly ativos: (simbolo: string) => Promise<AtivosDoPar>,
    private readonly taxaEstimada: number,
    private readonly dormir: (ms: number) => Promise<void>,
  ) {}

  async enviarMercado(pedido: PedidoOrdemMercado, quantidade: string): Promise<ResultadoOrdem> {
    const ativos = await this.ativos(pedido.simbolo);
    try {
      const r = await this.cliente.assinado(
        "POST",
        "/api/v3/order",
        {
          symbol: pedido.simbolo,
          side: pedido.lado === "COMPRA" ? "BUY" : "SELL",
          type: "MARKET",
          quantity: quantidade,
          newClientOrderId: pedido.idCliente,
          newOrderRespType: "FULL",
        },
        RespostaOrdemFull,
      );
      const { execucoes, motivo } = execucoesDosFills(
        pedido.lado,
        r.fills,
        ativos,
        this.taxaEstimada,
        r.transactTime,
      );
      return {
        idCliente: pedido.idCliente,
        idCorretora: String(r.orderId),
        estado: estadoDaOrdem(r.status, dec(r.executedQty)),
        execucoes,
        ...(motivo ? { motivo } : {}),
      };
    } catch (erro) {
      return this.tratarFalhaNoEnvio(pedido, erro);
    }
  }

  async consultar(simbolo: string, idCliente: string): Promise<ResultadoOrdem | null> {
    let r;
    try {
      r = await this.cliente.assinado(
        "GET",
        "/api/v3/order",
        { symbol: simbolo, origClientOrderId: idCliente },
        RespostaConsultaOrdem,
      );
    } catch (erro) {
      if (erro instanceof ErroCorretora && erro.codigo === ORDEM_INEXISTENTE) return null;
      throw erro;
    }
    const lado: Lado = r.side === "BUY" ? "COMPRA" : "VENDA";
    const executada = dec(r.executedQty);
    const convertidas = executada.gt(0)
      ? await this.execucoesDaOrdem(simbolo, r.orderId, lado)
      : { execucoes: [] };
    return {
      idCliente,
      idCorretora: String(r.orderId),
      estado: estadoDaOrdem(r.status, executada),
      execucoes: convertidas.execucoes,
      ...(convertidas.motivo ? { motivo: convertidas.motivo } : {}),
    };
  }

  private async execucoesDaOrdem(simbolo: string, idOrdem: number, lado: Lado) {
    const negocios = await this.cliente.assinado(
      "GET",
      "/api/v3/myTrades",
      { symbol: simbolo, orderId: idOrdem },
      RespostaNegocios,
    );
    const ativos = await this.ativos(simbolo);
    const em = negocios.reduce((max, n) => Math.max(max, n.time), 0);
    return execucoesDosFills(lado, negocios, ativos, this.taxaEstimada, em);
  }

  private async tratarFalhaNoEnvio(pedido: PedidoOrdemMercado, erro: unknown): Promise<ResultadoOrdem> {
    if (naoSabeSeChegou(erro)) return this.confirmarDepoisDeFalha(pedido, erro as ErroRede);
    // A Binance respondeu com erro (saldo, limite, filtro): a ordem não entrou.
    if (erro instanceof ErroCorretora && (erro.codigo !== null || erro instanceof ErroLimiteRequisicoes))
      return {
        idCliente: pedido.idCliente,
        idCorretora: null,
        estado: "REJEITADA",
        execucoes: [],
        motivo: erro.message,
      };
    throw erro;
  }

  private async confirmarDepoisDeFalha(pedido: PedidoOrdemMercado, falha: ErroRede): Promise<ResultadoOrdem> {
    let ultimoErro: unknown = falha;
    for (let tentativa = 0; tentativa < TENTATIVAS_CONSULTA; tentativa++) {
      if (tentativa > 0) await this.dormir(ESPERA_CONSULTA_MS * tentativa);
      try {
        const r = await this.consultar(pedido.simbolo, pedido.idCliente);
        if (r) return r;
        ultimoErro = null;
      } catch (erro) {
        ultimoErro = erro;
      }
    }
    if (ultimoErro === null)
      return {
        idCliente: pedido.idCliente,
        idCorretora: null,
        estado: "REJEITADA",
        execucoes: [],
        motivo: `O envio falhou (${falha.message}) e a ordem não consta na Binance após ${TENTATIVAS_CONSULTA} consultas; ela não foi reenviada.`,
      };
    const detalhe = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro);
    throw new ErroOrdemIncerta(
      `Não dá para saber se a ordem ${pedido.idCliente} entrou: o envio falhou (${falha.message}) e a consulta também (${detalhe}). Confira na Binance antes de operar de novo.`,
      pedido.idCliente,
    );
  }
}
