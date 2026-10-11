import { PatrimonioEsquema, type Patrimonio } from "@zentrade/contratos/esquemas";
import { criarCliente, type ClienteApi } from "../../api/cliente";
import { patrimonioDemo } from "./demo";

/**
 * De onde a tela do patrimônio tira os dados: a API (GET /patrimonio/consolidado) ou a
 * demonstração. Só leitura.
 */
export interface FontePatrimonio {
  patrimonio(): Promise<Patrimonio>;
}

export function criarFontePatrimonio(cliente: ClienteApi = criarCliente()): FontePatrimonio {
  return { patrimonio: () => cliente.pedir("GET", "/patrimonio/consolidado", PatrimonioEsquema) };
}

export function criarFontePatrimonioDemo(): FontePatrimonio {
  return { patrimonio: async () => patrimonioDemo() };
}
