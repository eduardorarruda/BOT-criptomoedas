import {
  PedidoAlugarComprarEsquema,
  PedidoGanhoCapitalEsquema,
  PedidoRentabilidadeEsquema,
  PedidoSimulacaoFiiEsquema,
  PedidoSimulacaoFinanciamentoEsquema,
} from "@zentrade/contratos";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  alugarOuComprar,
  ganhoCapitalImovel,
  rentabilidadeImovel,
  simularFii,
  simulacaoFinanciamentoEmTexto,
  type FinanciamentoSimulado,
} from "@zentrade/financas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { z } from "zod";
import { traduzir } from "./imobiliario-servico.js";

/**
 * Simuladores (`POST /imobiliario/simulacoes/*`): só contas, nada é gravado. Aceitam
 * token `leitura`. Cada resposta traz `premissas`: a simulação vale o que valem elas.
 */
const ehValor = (v: unknown): v is Valor =>
  typeof v === "object" && v !== null && "toDecimalPlaces" in v && "isFinite" in v;

/** Valor → texto aos centavos, em qualquer profundidade (o resto passa igual). */
export function emTexto(v: unknown): unknown {
  if (ehValor(v)) return paraTexto(v.toDecimalPlaces(2, 4));
  if (Array.isArray(v)) return v.map(emTexto);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, emTexto(x)]));
  return v;
}

const opcional = (t: string | undefined): Valor | undefined => (t === undefined ? undefined : dec(t));
/** Chaves que podem ser `undefined` viram opcionais de verdade (exactOptionalPropertyTypes). */
type Limpo<T> = { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};
const limpo = <T extends object>(o: T): Limpo<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Limpo<T>;

function financiamento(
  f: z.infer<typeof PedidoAlugarComprarEsquema>["financiamento"],
): FinanciamentoSimulado | undefined {
  if (!f) return undefined;
  return limpo({
    sistema: f.sistema,
    taxaAnual: f.taxaAnual,
    prazoMeses: f.prazoMeses,
    seguroTaxaMensalSaldo: f.seguroTaxaMensalSaldo,
    seguroFixoMensal: opcional(f.seguroFixoMensal),
    taxaAdministracaoMensal: opcional(f.taxaAdministracaoMensal),
  });
}

type Pedido<E extends z.ZodType> = z.infer<E>;

const simularAlugarComprar = (b: Pedido<typeof PedidoAlugarComprarEsquema>) =>
  alugarOuComprar(
    limpo({
      ...b,
      valorImovel: dec(b.valorImovel),
      entrada: dec(b.entrada),
      custosCompra: dec(b.custosCompra),
      aluguelMensal: dec(b.aluguelMensal),
      custosProprietarioMensais: dec(b.custosProprietarioMensais),
      financiamento: financiamento(b.financiamento),
    }),
  );

const simularRentabilidade = (b: Pedido<typeof PedidoRentabilidadeEsquema>) =>
  rentabilidadeImovel(
    limpo({
      ...b,
      valorCompra: dec(b.valorCompra),
      custosAquisicao: dec(b.custosAquisicao),
      reforma: opcional(b.reforma),
      entrada: opcional(b.entrada),
      rendaMensal: dec(b.rendaMensal),
      despesasMensais: opcional(b.despesasMensais),
      financiamento: financiamento(b.financiamento),
    }),
  );

const simularCotas = (b: Pedido<typeof PedidoSimulacaoFiiEsquema>) =>
  simularFii(
    limpo({
      ...b,
      precoCota: dec(b.precoCota),
      rendimentoMensalPorCota: dec(b.rendimentoMensalPorCota),
      rendaAlvo: opcional(b.rendaAlvo),
    }),
  );

const simularGanhoCapital = (b: Pedido<typeof PedidoGanhoCapitalEsquema>) =>
  ganhoCapitalImovel(
    limpo({
      ...b,
      valorVenda: dec(b.valorVenda),
      custosVenda: opcional(b.custosVenda),
      custoAquisicao: dec(b.custoAquisicao),
      benfeitorias: opcional(b.benfeitorias),
      valorReinvestido: opcional(b.valorReinvestido),
    }),
  );

const leitura = { config: { acesso: "leitura" as const } };
const BASE = "/imobiliario/simulacoes";

export const rotasSimulacoesImobiliario: FastifyPluginAsyncZod = async (app) => {
  app.post(
    `${BASE}/financiamento`,
    { ...leitura, schema: { body: PedidoSimulacaoFinanciamentoEsquema } },
    async (req) => traduzir(() => simulacaoFinanciamentoEmTexto(req.body)),
  );
  app.post(
    `${BASE}/alugar-comprar`,
    { ...leitura, schema: { body: PedidoAlugarComprarEsquema } },
    async (req) => traduzir(() => emTexto(simularAlugarComprar(req.body))),
  );
  app.post(
    `${BASE}/rentabilidade`,
    { ...leitura, schema: { body: PedidoRentabilidadeEsquema } },
    async (req) => traduzir(() => emTexto(simularRentabilidade(req.body))),
  );
  app.post(`${BASE}/fii`, { ...leitura, schema: { body: PedidoSimulacaoFiiEsquema } }, async (req) =>
    traduzir(() => emTexto(simularCotas(req.body))),
  );
  app.post(
    `${BASE}/ganho-capital`,
    { ...leitura, schema: { body: PedidoGanhoCapitalEsquema } },
    async (req) => traduzir(() => emTexto(simularGanhoCapital(req.body))),
  );
};
