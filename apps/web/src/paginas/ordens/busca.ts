import type { EstadoOrdem } from "@zentrade/contratos/esquemas";
import { campo, type BuscaDe } from "../../componentes/filtros/esquemas";
import { ID, SIMBOLO } from "../decisoes/busca";

/**
 * O que a URL das ordens aceita. Fica separado dos filtros para a rota validar a
 * busca sem carregar o resto da tela (Decimal, componentes).
 */
export const LADOS = ["COMPRA", "VENDA"] as const;
export const ESTADOS_ORDEM: readonly EstadoOrdem[] = [
  "PREENCHIDA",
  "PARCIAL",
  "PENDENTE",
  "REJEITADA",
  "CANCELADA",
];
const ORDENS = ["data", "valor", "taxa"] as const;
const AGRUPAMENTOS = ["nenhum", "dia", "robo"] as const;

export const buscaOrdens = {
  q: campo.busca(),
  robo: campo.listaLivre(ID),
  simbolo: campo.listaLivre(SIMBOLO),
  lado: campo.lista(LADOS),
  estado: campo.lista(ESTADOS_ORDEM),
  periodo: campo.periodo(),
  de: campo.dia(),
  ate: campo.dia(),
  ordem: campo.opcao(ORDENS),
  dir: campo.opcao(["asc", "desc"] as const),
  agrupar: campo.opcao(AGRUPAMENTOS),
  pagina: campo.pagina(),
};
export type BuscaOrdens = BuscaDe<typeof buscaOrdens>;
