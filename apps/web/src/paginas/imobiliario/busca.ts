import { TIPOS_IMOBILIARIO } from "@zentrade/contratos/valores";
import { campo, type BuscaDe } from "../../componentes/filtros/esquemas";

/**
 * O que a URL do imobiliário aceita. Fica separado dos filtros para a rota validar a
 * busca sem carregar o resto da tela (Decimal, componentes).
 */
export const MOEDAS = ["BRL", "USD"] as const;
export const ORDENS = ["valor", "resultado", "tir", "dy", "renda", "nome"] as const;
const VISOES = ["cartoes", "tabela", "alocacao"] as const;

export const buscaImobiliario = {
  q: campo.busca(),
  tipo: campo.lista(TIPOS_IMOBILIARIO),
  moeda: campo.lista(MOEDAS),
  financiamento: campo.opcao(["com", "sem"] as const),
  situacao: campo.opcao(["ativo", "encerrado"] as const),
  ordem: campo.opcao(ORDENS),
  dir: campo.opcao(["asc", "desc"] as const),
  visao: campo.opcao(VISOES),
};
export type BuscaImobiliario = BuscaDe<typeof buscaImobiliario>;
