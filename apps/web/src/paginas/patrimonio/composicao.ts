import type {
  ClassePatrimonio,
  ClassePatrimonioResumo,
  Patrimonio,
  SituacaoClasse,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import type { Tom } from "../../componentes/Selo";
import { formatarDinheiro, TRACO } from "../../lib/formatar";
import type { Fatia } from "../carteira/alocacao";
import { reais } from "../renda-fixa/formato";

/** Como a tela do patrimônio nomeia, liga e descreve cada classe. */
export const ROTULO_CLASSE: Record<ClassePatrimonio, string> = {
  cripto: "Cripto",
  renda_fixa: "Renda fixa",
  imobiliario: "Imobiliário",
};

export const ROTA_CLASSE = {
  cripto: "/carteira",
  renda_fixa: "/renda-fixa",
  imobiliario: "/imobiliario",
} as const satisfies Record<ClassePatrimonio, string>;

const ITENS: Record<ClassePatrimonio, readonly [string, string]> = {
  cripto: ["moeda", "moedas"],
  renda_fixa: ["título", "títulos"],
  imobiliario: ["investimento", "investimentos"],
};

export const SITUACAO: Record<SituacaoClasse, { readonly texto: string; readonly tom: Tom }> = {
  vazia: { texto: "Nada cadastrado", tom: "neutro" },
  completa: { texto: "Completo", tom: "marca" },
  parcial: { texto: "Parte fora do total", tom: "atencao" },
  indisponivel: { texto: "Fora do total", tom: "atencao" },
};

export interface FatiaClasse extends Fatia {
  readonly classe: ClassePatrimonio;
}

/** As classes que pesam na composição, na ordem fixa (a cor de cada uma não muda entre visitas). */
export const fatiasDoPatrimonio = (p: Patrimonio): FatiaClasse[] =>
  p.classes
    .filter((c): c is ClassePatrimonioResumo & { fracao: string } => c.fracao !== null && dec(c.fracao).gt(0))
    .map((c) => ({ classe: c.classe, rotulo: ROTULO_CLASSE[c.classe], fracao: c.fracao }));

export const nadaCadastrado = (p: Patrimonio): boolean => p.classes.every((c) => c.situacao === "vazia");

export function descreverItens(classe: ClassePatrimonio, n: number): string {
  const [um, varios] = ITENS[classe];
  return `${n} ${n === 1 ? um : varios}`;
}

/** Em reais; sem valor em reais, o que houver na moeda de origem (cripto em USDT). */
export function valorDaClasse(c: ClassePatrimonioResumo): string {
  if (c.valor !== null) return reais(c.valor);
  if (c.moedaOrigem) return `${formatarDinheiro(c.moedaOrigem.valor)} em ${c.moedaOrigem.moeda}`;
  return TRACO;
}
