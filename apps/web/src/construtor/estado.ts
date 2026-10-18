import type { CamposEstrategia, EstrategiaDTO } from "@zentrade/contratos/esquemas";
import {
  validarEstrategia,
  validarRegra,
  type Direcao,
  type ModeloEstrategia,
  type Regra,
} from "@zentrade/dominio";
import type { NovaEstrategia } from "../api/fonte";
import { paraDominio } from "../lib/estrategia";
import {
  alternarGrupo,
  deRegra,
  desfazerNao,
  envolverEmNao,
  inserir,
  localizar,
  mover,
  moverEntreIrmaos,
  novoComparar,
  novoGrupo,
  novoId,
  novoNao,
  paraRegra,
  remover,
  atualizar,
  type NoComparar,
  type NoEditor,
} from "./arvore";
import { condicaoPronta, type CondicaoPronta } from "./prontas";
import { fracaoDe, lerSaidas, percentual, SAIDAS_PADRAO, saidasDe, type EstadoSaidas } from "./saidas";

export { fracaoDe } from "./saidas";

/**
 * Estado do construtor (nome, direção, árvores de entrada e saída de cada lado,
 * stop/alvo/taxa e as saídas como digitados) e o redutor que o muda. Puro: a tela
 * só despacha ações.
 *
 * As regras vendidas ficam guardadas na tela mesmo voltando para "só comprado"
 * (para não perder o que foi montado), mas só vão para a estratégia quando a
 * direção usa o lado vendido.
 */
export type Bloco = "comparar" | "e" | "ou" | "nao" | CondicaoPronta["id"];
export type Arvore = "entrada" | "saida" | "entradaVendida" | "saidaVendida";

export interface EstadoConstrutor {
  readonly id: string | null;
  readonly versao: number;
  readonly nome: string;
  readonly direcao: Direcao;
  readonly entrada: NoEditor;
  readonly saida: NoEditor | null;
  readonly entradaVendida: NoEditor | null;
  readonly saidaVendida: NoEditor | null;
  readonly editando: Arvore;
  readonly stop: string;
  readonly alvo: string;
  readonly taxa: string;
  readonly saidas: EstadoSaidas;
}

export type Acao =
  | { readonly tipo: "nome"; readonly nome: string }
  | { readonly tipo: "parametro"; readonly campo: "stop" | "alvo" | "taxa"; readonly valor: string }
  | { readonly tipo: "saidas"; readonly mudanca: Partial<EstadoSaidas> }
  | { readonly tipo: "editar"; readonly arvore: Arvore }
  | { readonly tipo: "ligarSaida"; readonly ligada: boolean }
  | { readonly tipo: "direcao"; readonly direcao: Direcao }
  | { readonly tipo: "ligarSaidaVendida"; readonly ligada: boolean }
  | { readonly tipo: "adicionar"; readonly destinoId: string; readonly indice: number; readonly bloco: Bloco }
  | { readonly tipo: "mover"; readonly id: string; readonly destinoId: string; readonly indice: number }
  | { readonly tipo: "moverIrmao"; readonly id: string; readonly delta: -1 | 1 }
  | { readonly tipo: "remover"; readonly id: string }
  | { readonly tipo: "nao"; readonly id: string }
  | { readonly tipo: "alternarGrupo"; readonly id: string }
  | { readonly tipo: "trocarNo"; readonly no: NoEditor }
  | { readonly tipo: "carregar"; readonly estado: EstadoConstrutor };

export function estadoVazio(): EstadoConstrutor {
  return {
    id: null,
    versao: 0,
    nome: "",
    direcao: "comprado",
    entrada: novoGrupo("e", [novoComparar()]),
    saida: null,
    entradaVendida: null,
    saidaVendida: null,
    editando: "entrada",
    stop: "2,5",
    alvo: "3",
    taxa: "0,1",
    saidas: SAIDAS_PADRAO,
  };
}

interface Identidade {
  readonly id: string | null;
  readonly versao: number;
  readonly nome: string;
}

/** A árvore que abre primeiro: a entrada do lado que a direção usa. */
const principal = (d: Direcao): Arvore => (d === "vendido" ? "entradaVendida" : "entrada");

function deCampos(e: CamposEstrategia, identidade: Identidade): EstadoConstrutor {
  const direcao: Direcao = e.direcao ?? "comprado";
  return {
    ...identidade,
    direcao,
    entrada: deRegra(e.entrada),
    saida: e.saida ? deRegra(e.saida) : null,
    entradaVendida: e.entradaVendida ? deRegra(e.entradaVendida) : null,
    saidaVendida: e.saidaVendida ? deRegra(e.saidaVendida) : null,
    editando: principal(direcao),
    stop: percentual(e.stop),
    alvo: percentual(e.alvoLiquido),
    taxa: percentual(e.taxa),
    saidas: saidasDe(e),
  };
}

export const deEstrategia = (e: EstrategiaDTO): EstadoConstrutor =>
  deCampos(e, { id: e.id, versao: e.versao, nome: e.nome });

/** Começar de um modelo: uma estratégia NOVA (sem id), já montada, com o nome do modelo. */
export const deModelo = (m: ModeloEstrategia): EstadoConstrutor =>
  deCampos(m.estrategia, { id: null, versao: 0, nome: m.nome });

function deCondicaoPronta(id: string): NoComparar | null {
  const pronta = condicaoPronta(id);
  if (!pronta) return null;
  const { esquerda, comparador, direita } = pronta;
  return { id: novoId(), tipo: "comparar", esquerda, comparador, direita };
}

export function criarBloco(b: Bloco): NoEditor {
  if (b === "comparar") return novoComparar();
  if (b === "nao") return novoNao();
  if (b === "e" || b === "ou") return novoGrupo(b);
  return deCondicaoPronta(b) ?? novoComparar();
}

function naArvore(e: EstadoConstrutor, f: (raiz: NoEditor) => NoEditor): EstadoConstrutor {
  const raiz = e[e.editando];
  return raiz ? { ...e, [e.editando]: f(raiz) } : e;
}

const usaComprado = (d: Direcao): boolean => d !== "vendido";
const usaVendido = (d: Direcao): boolean => d !== "comprado";

/** Começo da regra vendida: o espelho do começo da comprada (RSI acima de 70). */
function novaEntradaVendida(): NoEditor {
  const comparar = novoComparar();
  return novoGrupo("e", [{ ...comparar, comparador: ">", direita: { tipo: "numero", valor: 70 } }]);
}

/**
 * As árvores que a tela mostra, na ordem das abas. No "só vendido", a entrada
 * comprada fica guardada sem uso e só aparece se tiver problema (senão ela
 * travaria o salvar sem a pessoa ver por quê), até a pessoa sair da aba dela.
 */
export function arvoresVisiveis(e: EstadoConstrutor): Arvore[] {
  const comprada = usaComprado(e.direcao) || e.editando === "entrada" || paraRegraValida(e.entrada) === null;
  return [
    ...(comprada ? (["entrada"] as const) : []),
    ...(usaComprado(e.direcao) && e.saida ? (["saida"] as const) : []),
    ...(usaVendido(e.direcao) && e.entradaVendida ? (["entradaVendida"] as const) : []),
    ...(usaVendido(e.direcao) && e.saidaVendida ? (["saidaVendida"] as const) : []),
  ];
}

function mudarDirecao(e: EstadoConstrutor, direcao: Direcao): EstadoConstrutor {
  const criada = usaVendido(direcao) && !e.entradaVendida;
  const novo = { ...e, direcao, entradaVendida: criada ? novaEntradaVendida() : e.entradaVendida };
  if (criada) return { ...novo, editando: "entradaVendida" };
  return arvoresVisiveis(novo).includes(e.editando) ? novo : { ...novo, editando: principal(direcao) };
}

export function redutor(e: EstadoConstrutor, a: Acao): EstadoConstrutor {
  switch (a.tipo) {
    case "nome":
      return { ...e, nome: a.nome };
    case "parametro":
      return { ...e, [a.campo]: a.valor };
    case "saidas":
      return { ...e, saidas: { ...e.saidas, ...a.mudanca } };
    case "editar":
      return { ...e, editando: a.arvore };
    case "ligarSaida":
      return a.ligada
        ? { ...e, saida: e.saida ?? novoGrupo("ou", [novoComparar()]), editando: "saida" }
        : { ...e, saida: null, editando: e.editando === "saida" ? "entrada" : e.editando };
    case "direcao":
      return mudarDirecao(e, a.direcao);
    case "ligarSaidaVendida":
      return a.ligada
        ? {
            ...e,
            saidaVendida: e.saidaVendida ?? novoGrupo("ou", [novoComparar()]),
            editando: "saidaVendida",
          }
        : {
            ...e,
            saidaVendida: null,
            editando: e.editando === "saidaVendida" ? "entradaVendida" : e.editando,
          };
    case "adicionar":
      return naArvore(e, (r) => inserir(r, a.destinoId, a.indice, criarBloco(a.bloco)));
    case "mover":
      return naArvore(e, (r) => mover(r, a.id, a.destinoId, a.indice));
    case "moverIrmao":
      return naArvore(e, (r) => moverEntreIrmaos(r, a.id, a.delta));
    case "remover":
      return naArvore(e, (r) => remover(r, a.id));
    case "nao":
      return naArvore(e, (r) => {
        const no = localizar(r, a.id)?.no;
        return no?.tipo === "nao" ? desfazerNao(r, a.id) : envolverEmNao(r, a.id);
      });
    case "alternarGrupo":
      return naArvore(e, (r) => alternarGrupo(r, a.id));
    case "trocarNo":
      return naArvore(e, (r) => atualizar(r, a.no.id, () => a.no));
    case "carregar":
      return a.estado;
  }
}

export interface Montagem {
  readonly estrategia: NovaEstrategia | null;
  readonly problemas: readonly string[];
}

/** A regra do domínio, só se ela converte e passa no validarRegra. */
function paraRegraValida(no: NoEditor): Regra | null {
  const { regra } = paraRegra(no);
  return regra && validarRegra(regra).length === 0 ? regra : null;
}

interface Lida {
  /** A regra convertida (mesmo com problema do domínio, para o validarEstrategia ver o resto). */
  readonly regra: Regra | null;
  readonly problemas: readonly string[];
  /** Os problemas do domínio sem prefixo, para não repetir os do validarEstrategia. */
  readonly doDominio: readonly string[];
}

/** Converte e valida uma árvore, com o prefixo do lado ("entrada vendida: …"). */
function lerArvore(no: NoEditor, prefixo: string): Lida {
  const convertida = paraRegra(no);
  if (!convertida.regra)
    return { regra: null, problemas: convertida.problemas.map((p) => `${prefixo}: ${p}`), doDominio: [] };
  const doDominio = validarRegra(convertida.regra);
  return {
    regra: convertida.regra,
    problemas: doDominio.map((p) => `${prefixo}: ${p}`),
    doDominio,
  };
}

const PREFIXO: Record<Arvore, string> = {
  entrada: "entrada",
  saida: "saída",
  entradaVendida: "entrada vendida",
  saidaVendida: "saída vendida",
};

/** As árvores que vão para a estratégia nesta direção (a entrada comprada sempre vai). */
function arvoresUsadas(e: EstadoConstrutor): readonly (readonly [Arvore, NoEditor])[] {
  const comprado = usaComprado(e.direcao);
  const vendido = usaVendido(e.direcao);
  return [
    ["entrada", e.entrada],
    ...(comprado && e.saida ? [["saida", e.saida] as const] : []),
    ...(vendido && e.entradaVendida ? [["entradaVendida", e.entradaVendida] as const] : []),
    ...(vendido && e.saidaVendida ? [["saidaVendida", e.saidaVendida] as const] : []),
  ];
}

/** As árvores que vão para a estratégia (para contar as partes usadas na prévia). */
export const nosUsados = (e: EstadoConstrutor): readonly NoEditor[] => arvoresUsadas(e).map(([, no]) => no);

function lerRegras(e: EstadoConstrutor) {
  const prefixo = (a: Arvore): string =>
    a === "entrada" && e.direcao === "vendido"
      ? "entrada comprada (guardada, sem uso no só vendido)"
      : PREFIXO[a];
  const lidas = arvoresUsadas(e).map(([a, no]) => [a, lerArvore(no, prefixo(a))] as const);
  const regras: Partial<Record<Arvore, Regra>> = Object.fromEntries(
    lidas.flatMap(([a, l]) => (l.regra ? [[a, l.regra] as const] : [])),
  );
  return {
    regras,
    completas: lidas.every(([, l]) => l.regra !== null),
    problemas: lidas.flatMap(([, l]) => l.problemas),
    doDominio: new Set(lidas.flatMap(([, l]) => l.doDominio)),
  };
}

/** Junta tudo e valida com o domínio (validarRegra e validarEstrategia), saídas incluídas. */
export function montar(e: EstadoConstrutor): Montagem {
  const problemas: string[] = [];
  if (!e.nome.trim()) problemas.push("dê um nome à estratégia");
  if (e.nome.trim().length > 80) problemas.push("o nome tem mais de 80 letras");
  const lidas = lerRegras(e);
  problemas.push(...lidas.problemas);
  const stop = fracaoDe(e.stop);
  const alvo = fracaoDe(e.alvo);
  const taxa = fracaoDe(e.taxa);
  if (stop === null) problemas.push("o stop precisa ser um número, como 2,5");
  if (alvo === null) problemas.push("o alvo precisa ser um número, como 3");
  if (taxa === null) problemas.push("a taxa precisa ser um número, como 0,1");
  const saidas = lerSaidas(e.saidas);
  problemas.push(...saidas.problemas);
  const { entrada, saida, entradaVendida, saidaVendida } = lidas.regras;
  if (
    !entrada ||
    !lidas.completas ||
    stop === null ||
    alvo === null ||
    taxa === null ||
    saidas.problemas.length
  ) {
    return { estrategia: null, problemas: [...new Set(problemas)] };
  }
  // Estratégia comprada sai igual a antes: sem a chave da direção nem as regras vendidas.
  const estrategia: NovaEstrategia = {
    nome: e.nome.trim(),
    ...(e.direcao !== "comprado" ? { direcao: e.direcao } : {}),
    entrada,
    ...(saida ? { saida } : {}),
    ...(entradaVendida ? { entradaVendida } : {}),
    ...(saidaVendida ? { saidaVendida } : {}),
    stop,
    alvoLiquido: alvo,
    taxa,
    ...saidas.campos,
  };
  const doDominio = validarEstrategia(paraDominio(estrategia)).filter((p) => !lidas.doDominio.has(p));
  const todos = [...new Set([...problemas, ...doDominio])];
  return todos.length ? { estrategia: null, problemas: todos } : { estrategia, problemas: [] };
}
