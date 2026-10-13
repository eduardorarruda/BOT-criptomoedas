import type { EstadoDecisao } from "@zentrade/contratos/esquemas";
import { campo, type BuscaDe } from "../../componentes/filtros/esquemas";

/**
 * O que a URL do diário de decisões aceita. Fica separado dos filtros para a rota validar a
 * busca sem carregar o resto da tela (Decimal, componentes).
 */
export const ACOES = ["COMPRAR", "VENDER", "AGUARDAR"] as const;
export const ESTADOS: readonly EstadoDecisao[] = [
  "aguardando_aprovacao",
  "executada",
  "barrada",
  "registrada",
  "aprovada",
  "recusada",
  "expirada",
  "falhou",
];
export const DESFECHOS = ["ganho", "perda", "sem"] as const;
export type Desfecho = (typeof DESFECHOS)[number];
export const ORDENS = ["data", "valor", "resultado", "custo"] as const;
export const AGRUPAMENTOS = ["dia", "robo", "nenhum"] as const;
export const VISOES = ["cartoes", "tabela"] as const;

export const ID = /^[\w.:-]{1,64}$/;
export const SIMBOLO = /^[A-Z0-9]{2,20}$/;

export const buscaDecisoes = {
  q: campo.busca(),
  robo: campo.listaLivre(ID),
  simbolo: campo.listaLivre(SIMBOLO),
  acao: campo.lista(ACOES),
  estado: campo.lista(ESTADOS),
  desfecho: campo.lista(DESFECHOS),
  periodo: campo.periodo(),
  de: campo.dia(),
  ate: campo.dia(),
  ordem: campo.opcao(ORDENS),
  dir: campo.opcao(["asc", "desc"] as const),
  agrupar: campo.opcao(AGRUPAMENTOS),
  visao: campo.opcao(VISOES),
  densidade: campo.opcao(["compacta"] as const),
  pagina: campo.pagina(),
};
export type BuscaDecisoes = BuscaDe<typeof buscaDecisoes>;
