import type {
  Carteira,
  CarteiraAtivo,
  MoedaCarteira,
  NegociacaoCarteira,
  ParcelaCarteira,
  ResumoParcela,
  StatusBinance,
} from "@zentrade/contratos/esquemas";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";

/**
 * Carteira de demonstração (modo demo, sem API): números inventados, mas coerentes —
 * calculados com o mesmo preço médio ponderado da carteira de verdade.
 */
interface Neg {
  readonly lado: "COMPRA" | "VENDA";
  readonly qtd: string;
  readonly preco: string;
  readonly taxa: string;
  readonly origem: "robo" | "manual";
  readonly em: number;
}

const HORA = 3_600_000;
const BASE = Date.UTC(2026, 8, 1, 14);
const t = (v: Valor): string => paraTexto(v.toDecimalPlaces(8));
const ZERO = dec(0);

function parcela(negs: readonly Neg[], preco: Valor): ParcelaCarteira {
  let q = ZERO;
  let custo = ZERO;
  let bruto = ZERO;
  let taxas = ZERO;
  let compradoQ = ZERO;
  let compradoV = ZERO;
  let vendidoQ = ZERO;
  let vendidoV = ZERO;
  for (const n of negs) {
    const qtd = dec(n.qtd);
    const p = dec(n.preco);
    taxas = taxas.plus(dec(n.taxa));
    if (n.lado === "COMPRA") {
      [q, custo, compradoQ, compradoV] = [
        q.plus(qtd),
        custo.plus(qtd.times(p)),
        compradoQ.plus(qtd),
        compradoV.plus(qtd.times(p)),
      ];
      continue;
    }
    const saida = custo.times(qtd).div(q);
    [bruto, q, custo, vendidoQ, vendidoV] = [
      bruto.plus(qtd.times(p)).minus(saida),
      q.minus(qtd),
      custo.minus(saida),
      vendidoQ.plus(qtd),
      vendidoV.plus(qtd.times(p)),
    ];
  }
  const valor = q.times(preco);
  const liquido = bruto.minus(taxas).plus(valor.minus(custo));
  return {
    quantidadeComprada: t(compradoQ),
    custoComprado: t(compradoV),
    quantidadeVendida: t(vendidoQ),
    valorVendido: t(vendidoV),
    quantidade: t(q),
    precoMedio: q.isZero() ? null : t(custo.div(q)),
    custoPosicao: t(custo),
    valorAtual: t(valor),
    resultadoRealizadoBruto: t(bruto),
    resultadoRealizadoLiquido: t(bruto.minus(taxas)),
    resultadoNaoRealizado: t(valor.minus(custo)),
    resultadoLiquido: t(liquido),
    taxas: t(taxas),
    retorno: compradoV.isZero() ? null : paraTexto(liquido.div(compradoV).toDecimalPlaces(10)),
    quantidadeVendidaSemCusto: "0",
    negociacoes: negs.length,
    semConversao: 0,
  };
}

interface DadosMoeda {
  readonly preco: string;
  /** Saldo além das negociações (depósito): fica com custo desconhecido. */
  readonly extra: string;
  readonly negs: readonly Neg[];
}

const NEGOCIACOES = {
  BTC: {
    preco: "62480",
    extra: "0",
    negs: [
      { lado: "COMPRA", qtd: "0.012", preco: "58200", taxa: "0.6984", origem: "robo", em: BASE },
      {
        lado: "COMPRA",
        qtd: "0.008",
        preco: "60150",
        taxa: "0.4812",
        origem: "manual",
        em: BASE + 90 * HORA,
      },
      { lado: "VENDA", qtd: "0.006", preco: "63900", taxa: "0.3834", origem: "robo", em: BASE + 300 * HORA },
    ],
  },
  ETH: {
    preco: "2412.5",
    extra: "0.15",
    negs: [
      { lado: "COMPRA", qtd: "0.5", preco: "2550", taxa: "1.275", origem: "manual", em: BASE + 20 * HORA },
      { lado: "COMPRA", qtd: "0.3", preco: "2380", taxa: "0.714", origem: "robo", em: BASE + 200 * HORA },
    ],
  },
  SOL: {
    preco: "148.2",
    extra: "0",
    negs: [
      { lado: "COMPRA", qtd: "3", preco: "139.4", taxa: "0.4182", origem: "robo", em: BASE + 400 * HORA },
    ],
  },
} satisfies Record<string, DadosMoeda>;

const dadosDe = (ativo: string): DadosMoeda | undefined => (NEGOCIACOES as Record<string, DadosMoeda>)[ativo];

function moedaDemo(ativo: string, d: DadosMoeda): MoedaCarteira {
  const preco = dec(d.preco);
  const total = parcela(d.negs, preco);
  const saldo = dec(total.quantidade).plus(dec(d.extra));
  const semCusto = dec(d.extra);
  return {
    ativo,
    preco: d.preco,
    referencia: false,
    saldo: { livre: t(saldo), bloqueado: "0", total: t(saldo) },
    valorSaldo: t(saldo.times(preco)),
    quantidadeSemCusto: t(semCusto),
    valorSemCusto: t(semCusto.times(preco)),
    quantidadeForaDoSaldo: "0",
    alocacao: null,
    robo: parcela(
      d.negs.filter((n) => n.origem === "robo"),
      preco,
    ),
    manual: parcela(
      d.negs.filter((n) => n.origem === "manual"),
      preco,
    ),
    total,
    avisos: semCusto.gt(0)
      ? [
          `${t(semCusto).replace(".", ",")} ${ativo} no saldo sem negociação que explique (depósito ou transferência): custo desconhecido, fora do preço médio e do resultado.`,
        ]
      : [],
  };
}

const USDT: MoedaCarteira = {
  ...moedaDemo("SOL", NEGOCIACOES.SOL),
  ativo: "USDT",
  preco: "1",
  referencia: true,
  saldo: { livre: "412.37", bloqueado: "0", total: "412.37" },
  valorSaldo: "412.37",
  quantidadeSemCusto: "0",
  valorSemCusto: "0",
  avisos: [],
  robo: parcela([], dec(1)),
  manual: parcela([], dec(1)),
  total: parcela([], dec(1)),
};

function resumoParcela(ps: readonly ParcelaCarteira[]): ResumoParcela {
  const somar = (f: (p: ParcelaCarteira) => string | null) =>
    ps.reduce((s, p) => s.plus(dec(f(p) ?? "0")), ZERO);
  const naoRealizado = somar((p) => p.resultadoNaoRealizado);
  const comprado = somar((p) => p.custoComprado);
  const liquido = somar((p) => p.resultadoRealizadoLiquido).plus(naoRealizado);
  return {
    custoComprado: t(comprado),
    custoPosicao: t(somar((p) => p.custoPosicao)),
    valorAtual: t(somar((p) => p.valorAtual)),
    resultadoRealizadoBruto: t(somar((p) => p.resultadoRealizadoBruto)),
    resultadoRealizadoLiquido: t(somar((p) => p.resultadoRealizadoLiquido)),
    resultadoNaoRealizado: t(naoRealizado),
    resultadoBruto: t(somar((p) => p.resultadoRealizadoBruto).plus(naoRealizado)),
    resultadoLiquido: t(liquido),
    taxas: t(somar((p) => p.taxas)),
    retorno: comprado.isZero() ? null : paraTexto(liquido.div(comprado).toDecimalPlaces(10)),
  };
}

export function carteiraDemo(agora: number = Date.now()): Carteira {
  const moedas = [...Object.entries(NEGOCIACOES).map(([a, d]) => moedaDemo(a, d)), USDT];
  const valorConta = moedas.reduce((s, m) => s.plus(dec(m.valorSaldo ?? "0")), ZERO);
  const comAlocacao = moedas
    .map((m) => ({
      ...m,
      alocacao: paraTexto(
        dec(m.valorSaldo ?? "0")
          .div(valorConta)
          .toDecimalPlaces(10),
      ),
    }))
    .sort((a, b) => dec(b.valorSaldo ?? "0").comparedTo(dec(a.valorSaldo ?? "0")));
  const naoRef = comAlocacao.filter((m) => !m.referencia);
  return {
    conectada: true,
    rede: "testnet",
    redes: ["testnet"],
    moedaReferencia: "USDT",
    sincronizacao: { em: agora - 4 * 60_000, ok: true, erro: null, negociacoes: 0 },
    precosEm: agora,
    resumo: {
      robo: resumoParcela(naoRef.map((m) => m.robo)),
      manual: resumoParcela(naoRef.map((m) => m.manual)),
      total: resumoParcela(naoRef.map((m) => m.total)),
      valorConta: t(valorConta),
      valorSemCusto: t(naoRef.reduce((s, m) => s.plus(dec(m.valorSemCusto ?? "0")), ZERO)),
      caixa: "412.37",
    },
    moedas: comAlocacao,
    avisos: ["Modo de demonstração: números de exemplo, nenhuma conta da Binance foi lida."],
  };
}

export function ativoDemo(ativo: string): CarteiraAtivo | null {
  const moeda = carteiraDemo().moedas.find((m) => m.ativo === ativo);
  if (!moeda) return null;
  const negs = dadosDe(ativo)?.negs ?? [];
  const negociacoes: NegociacaoCarteira[] = negs.map((n, i) => ({
    id: `${ativo}USDT:${i + 1}`,
    simbolo: `${ativo}USDT`,
    base: ativo,
    cotacao: "USDT",
    lado: n.lado,
    preco: n.preco,
    quantidade: n.qtd,
    valorCotacao: t(dec(n.qtd).times(dec(n.preco))),
    taxa: n.taxa,
    ativoTaxa: "USDT",
    taxaUsdt: n.taxa,
    cotacaoUsdt: "1",
    origem: n.origem,
    idOrdem: String(1000 + i),
    em: n.em,
  }));
  return { rede: "testnet", precosEm: Date.now(), moeda, negociacoes: negociacoes.reverse() };
}

export const statusDemo = (): StatusBinance => ({
  contas: [
    {
      id: "demo",
      rede: "testnet",
      apiKeyFinal: "…demo",
      conectada: true,
      erro: null,
      podeNegociar: true,
      podeSacar: null,
      ipRestrito: null,
      permissoesLidas: false,
      sincronizacao: { em: Date.now() - 4 * 60_000, ok: true, erro: null, negociacoes: 0 },
      avisos: ["A testnet não informa as permissões da chave (não tem /sapi)."],
    },
  ],
});
