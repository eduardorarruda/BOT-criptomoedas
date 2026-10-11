/** Sistema de filtros das telas de dados: estado na URL, peças de tela e lógica pura. */
export { BarraFiltros, type BuscaDaBarra } from "./BarraFiltros";
export { FiltroChips, FiltroOpcao, GrupoFiltro, Interruptor, type OpcaoFiltro } from "./Chips";
export {
  AlternarDensidade,
  AlternarVisao,
  SeletorOrdem,
  type OpcaoOrdem,
  type OpcaoVisao,
} from "./Ferramentas";
export { campo, semVazios, validarBusca } from "./esquemas";
export {
  agruparPor,
  contarAtivos,
  contarPor,
  contemTexto,
  filtrarCom,
  escreverLista,
  lerLista,
  normalizarTexto,
  ordenarPor,
  paginar,
  type Direcao,
  type Grupo,
} from "./logica";
export { Paginacao } from "./Paginacao";
export {
  dentroDoPeriodo,
  descreverPeriodo,
  intervaloDoPeriodo,
  PERIODOS,
  type EscolhaPeriodo,
  type Periodo,
} from "./periodo";
export { SeletorPeriodo } from "./SeletorPeriodo";
export { SemResultados } from "./SemResultados";
export { CHAVES_DE_VISAO, useFiltrosUrl } from "./useFiltrosUrl";
export { VisoesSalvas } from "./VisoesSalvas";
