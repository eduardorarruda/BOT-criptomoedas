import { campo, type BuscaDe } from "../../componentes/filtros/esquemas";
import type { Coluna } from "./tabela";

/**
 * O que a URL da carteira aceita. Fica separado dos filtros para a rota validar a
 * busca sem carregar o resto da tela (Decimal, componentes).
 */
const COLUNAS_ORDEM = [
  "ativo",
  "quantidade",
  "precoMedio",
  "custoPosicao",
  "preco",
  "valorAtual",
  "naoRealizado",
  "realizadoBruto",
  "realizadoLiquido",
  "taxas",
  "retorno",
  "alocacao",
  "comprado",
  "vendido",
] as const satisfies readonly Coluna[];
const VISOES = ["tabela", "cartoes", "alocacao"] as const;

export const buscaCarteira = {
  rede: campo.opcao(["real", "testnet"] as const),
  parcela: campo.opcao(["robo", "manual"] as const),
  q: campo.busca(),
  saldo: campo.ligado(),
  realizado: campo.ligado(),
  avisos: campo.ligado(),
  ordem: campo.opcao(COLUNAS_ORDEM),
  dir: campo.opcao(["asc", "desc"] as const),
  visao: campo.opcao(VISOES),
};
export type BuscaCarteira = BuscaDe<typeof buscaCarteira>;
