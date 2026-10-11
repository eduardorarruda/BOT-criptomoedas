import type { LinhaTitulo } from "@zentrade/banco";
import type { ResumoRendaFixa, TituloDetalhe, TituloRendaFixa } from "@zentrade/contratos";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  comPremissasInformadas,
  consolidar,
  posicaoDoTitulo,
  premissasDosIndices,
  projetar,
  rendimentoNoPeriodo,
  vencimentos,
  type Indices,
  type Posicao,
  type PremissasInformadas,
  type Titulo,
} from "@zentrade/financas";
import type { Dependencias } from "../dependencias.js";
import type { AtualizadorIndicadores } from "../integracoes/bcb-atualizador.js";
import { carregarIndices, resumirIndicadores } from "../integracoes/bcb-indices.js";
import type { SincronizadorPluggy } from "../integracoes/pluggy-sincronizador.js";
import { paraTitulo, projecaoDto, tituloDto } from "./renda-fixa-conversao.js";

/** O que a renda fixa usa de fora (BCB e Pluggy). Opcional nas dependências: sem isso, as rotas explicam. */
export interface ServicosRendaFixa {
  readonly indicadores: AtualizadorIndicadores;
  readonly pluggy: SincronizadorPluggy;
}

const diaSaoPaulo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Hoje" da renda fixa é o dia no Brasil, não em UTC. */
export const hojeEm = (ms: number): string => diaSaoPaulo.format(new Date(ms));

interface Carteira {
  readonly hoje: string;
  readonly linhas: readonly LinhaTitulo[];
  readonly titulos: readonly Titulo[];
  readonly posicoes: readonly Posicao[];
  readonly indices: Indices;
  readonly ipcaProjetado: Valor | undefined;
}

async function carregar(deps: Dependencias, linhas: readonly LinhaTitulo[]): Promise<Carteira> {
  const hoje = hojeEm(deps.agora());
  const desde = linhas.reduce((min, l) => (l.dataAplicacao < min ? l.dataAplicacao : min), hoje);
  const indices = await carregarIndices(deps.banco.indicadores, desde);
  // Para o mês do IPCA ainda não publicado: o acumulado de 12 meses, dito no aviso.
  const ipcaProjetado = premissasDosIndices(indices, hoje).ipcaAnual?.valor;
  const titulos = linhas.map(paraTitulo);
  const opcoes = { hoje, ...(ipcaProjetado ? { ipcaProjetadoAnual: ipcaProjetado } : {}) };
  const posicoes = titulos.map((t) => posicaoDoTitulo(t, indices, opcoes));
  return { hoje, linhas, titulos, posicoes, indices, ipcaProjetado };
}

export async function listarTitulos(deps: Dependencias, usuarioId: string): Promise<TituloRendaFixa[]> {
  const c = await carregar(deps, await deps.banco.rendaFixa.listar(usuarioId));
  return c.linhas.map((l, i) => tituloDto(l, c.posicoes[i] as Posicao));
}

export async function tituloComPosicao(deps: Dependencias, l: LinhaTitulo): Promise<TituloRendaFixa> {
  const c = await carregar(deps, [l]);
  return tituloDto(l, c.posicoes[0] as Posicao);
}

export interface OpcoesDetalhe extends PremissasInformadas {
  readonly horizonteMeses?: number;
}

export async function detalharTitulo(
  deps: Dependencias,
  l: LinhaTitulo,
  o: OpcoesDetalhe,
): Promise<TituloDetalhe> {
  const c = await carregar(deps, [l]);
  const posicao = c.posicoes[0] as Posicao;
  const titulo = c.titulos[0] as Titulo;
  const premissas = comPremissasInformadas(premissasDosIndices(c.indices, c.hoje), o);
  const projecao = posicao.disponivel
    ? projecaoDto(
        projetar(titulo, posicao, premissas, o.horizonteMeses ? { horizonteMeses: o.horizonteMeses } : {}),
      )
    : { disponivel: false as const, motivo: posicao.motivo };
  return { ...tituloDto(l, posicao), projecao };
}

const dinheiro = (v: Valor): string => paraTexto(v.toDecimalPlaces(2));
const pct = (v: Valor): string => paraTexto(v.toDecimalPlaces(6));

/** Soma do rendimento do mês; `null` se algum título não tiver índice para a conta. */
function rendimentoDoMes(c: Carteira): string | null {
  const inicioMes = `${c.hoje.slice(0, 7)}-01`;
  let total = dec(0);
  for (const t of c.titulos) {
    const r = rendimentoNoPeriodo(t, c.indices, inicioMes, c.hoje, c.ipcaProjetado);
    if (r === null) return null;
    total = total.plus(r);
  }
  return dinheiro(total);
}

export async function resumoDaCarteira(deps: Dependencias, usuarioId: string): Promise<ResumoRendaFixa> {
  const c = await carregar(deps, await deps.banco.rendaFixa.listar(usuarioId));
  const s = consolidar(c.titulos, c.posicoes, c.hoje);
  const alocacao = (a: { chave: string; bruto: Valor; fracao: Valor }) => ({
    chave: a.chave,
    bruto: dinheiro(a.bruto),
    fracao: paraTexto(a.fracao.toDecimalPlaces(6)),
  });
  return {
    hoje: c.hoje,
    quantidade: s.quantidade,
    indisponiveis: [...s.indisponiveis],
    aplicado: dinheiro(s.aplicado),
    bruto: dinheiro(s.bruto),
    iof: dinheiro(s.iof),
    ir: dinheiro(s.ir),
    liquido: dinheiro(s.liquido),
    rendimentoBruto: dinheiro(s.rendimentoBruto),
    rendimentoLiquido: dinheiro(s.rendimentoLiquido),
    rentabilidadeBrutaPct: pct(s.rentabilidadeBrutaPct),
    rentabilidadeLiquidaPct: pct(s.rentabilidadeLiquidaPct),
    rendimentoMes: rendimentoDoMes(c),
    porTipo: s.porTipo.map(alocacao),
    porIndexador: s.porIndexador.map(alocacao),
    proximoVencimento: s.proximoVencimento,
    vencimentos: vencimentos(c.titulos, c.hoje),
    indicadores: await resumirIndicadores(deps.banco.indicadores, c.hoje),
  };
}
