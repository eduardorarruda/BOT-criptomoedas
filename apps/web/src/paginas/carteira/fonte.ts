import {
  CarteiraAtivoEsquema,
  CarteiraEsquema,
  SincronizacaoEsquema,
  StatusBinanceEsquema,
  type Carteira,
  type CarteiraAtivo,
  type RedeConta,
  type Sincronizacao,
  type StatusBinance,
} from "@zentrade/contratos/esquemas";
import { criarCliente, type ClienteApi } from "../../api/cliente";
import { ErroApi } from "../../api/erros";
import { ativoDemo, carteiraDemo, statusDemo } from "./demo";

/**
 * De onde a tela da carteira tira os dados: a API (GET /carteira, GET /carteira/:ativo,
 * POST /carteira/sincronizar, GET /binance/status) ou a demonstração. O CSRF das
 * escritas vem do cookie zt_csrf, como no resto da tela.
 */
export interface FonteCarteira {
  carteira(rede?: RedeConta): Promise<Carteira>;
  ativo(ativo: string, rede?: RedeConta): Promise<CarteiraAtivo>;
  sincronizar(rede?: RedeConta): Promise<Sincronizacao>;
  status(): Promise<StatusBinance>;
}

export function criarFonteCarteira(cliente: ClienteApi = criarCliente()): FonteCarteira {
  const { pedir } = cliente;
  return {
    carteira: (rede) => pedir("GET", "/carteira", CarteiraEsquema, undefined, { rede }),
    ativo: (ativo, rede) =>
      pedir("GET", `/carteira/${encodeURIComponent(ativo)}`, CarteiraAtivoEsquema, undefined, { rede }),
    sincronizar: (rede) => pedir("POST", "/carteira/sincronizar", SincronizacaoEsquema, rede ? { rede } : {}),
    status: () => pedir("GET", "/binance/status", StatusBinanceEsquema),
  };
}

export function criarFonteCarteiraDemo(): FonteCarteira {
  return {
    carteira: async () => carteiraDemo(),
    ativo: async (ativo) => {
      const a = ativoDemo(ativo);
      if (!a) throw new ErroApi("nao_encontrado", "Essa moeda não está na carteira de demonstração.", 404);
      return a;
    },
    sincronizar: async () => ({
      rede: "testnet",
      em: Date.now(),
      negociacoesNovas: 0,
      simbolos: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
      saldos: 4,
      parcial: false,
      avisos: ["Modo de demonstração: nada foi lido da Binance."],
    }),
    status: async () => statusDemo(),
  };
}
