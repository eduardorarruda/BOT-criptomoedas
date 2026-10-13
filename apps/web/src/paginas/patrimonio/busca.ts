import { CLASSES_PATRIMONIO } from "@zentrade/contratos/valores";
import { campo, type BuscaDe } from "../../componentes/filtros/esquemas";

/**
 * O que a URL do patrimônio aceita. Fica separado dos filtros para a rota validar a
 * busca sem carregar o resto da tela (Decimal, componentes).
 */
export const VISOES = ["cartoes", "tabela"] as const;

export const buscaPatrimonio = {
  classes: campo.lista(CLASSES_PATRIMONIO),
  visao: campo.opcao(VISOES),
};
export type BuscaPatrimonio = BuscaDe<typeof buscaPatrimonio>;
