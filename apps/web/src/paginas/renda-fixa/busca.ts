import { INDEXADORES, LIQUIDEZES, ORIGENS_TITULO, TIPOS_TITULO } from "@zentrade/contratos/valores";
import { campo, type BuscaDe } from "../../componentes/filtros/esquemas";

/**
 * O que a URL da renda fixa aceita. Fica separado dos filtros para a rota validar a
 * busca sem carregar o resto da tela (Decimal, componentes).
 */
const ABAS = ["visao", "titulos", "conectar", "cadastrar", "simuladores"] as const;
export type Aba = (typeof ABAS)[number];
export const JANELAS = ["30", "90", "365"] as const;
const SITUACOES = ["ativo", "encerrado"] as const;
const ORDENS = ["vencimento", "valor", "rendimento", "aplicacao", "nome"] as const;
const VISOES = ["cartoes", "tabela", "escada", "alocacao"] as const;

export const buscaRendaFixa = {
  aba: campo.opcao(ABAS),
  q: campo.busca(),
  tipo: campo.lista(TIPOS_TITULO),
  indexador: campo.lista(INDEXADORES),
  origem: campo.lista(ORIGENS_TITULO),
  liquidez: campo.lista(LIQUIDEZES),
  vence: campo.opcao(JANELAS),
  situacao: campo.opcao(SITUACOES),
  ordem: campo.opcao(ORDENS),
  dir: campo.opcao(["asc", "desc"] as const),
  visao: campo.opcao(VISOES),
  densidade: campo.opcao(["compacta"] as const),
};
export type BuscaRendaFixa = BuscaDe<typeof buscaRendaFixa>;
