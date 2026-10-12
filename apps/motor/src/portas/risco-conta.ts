import type { PortaRiscoConta } from "@zentrade/contratos";
import { contaIndisponivel, type EstadoConta } from "@zentrade/dominio";
import type { Registro } from "../nucleo/tipos.js";

/**
 * A porta da conta sem derrubar a decisão: se o banco falhar, devolve um estado
 * "indisponível", que barra só a compra. Venda e stop seguem — o estado do risco é
 * montado para os dois lados, e um erro aqui não pode segurar uma saída.
 */
export function riscoContaSeguro(porta: PortaRiscoConta, registro: Registro): PortaRiscoConta {
  return {
    async estado(roboId: string, agora: number): Promise<EstadoConta> {
      try {
        return await porta.estado(roboId, agora);
      } catch (erro) {
        registro.error({ erro, roboId }, "estado da conta indisponível: compras barradas, vendas seguem");
        const motivo = erro instanceof Error ? erro.message : String(erro);
        return contaIndisponivel(agora, motivo);
      }
    },
  };
}
