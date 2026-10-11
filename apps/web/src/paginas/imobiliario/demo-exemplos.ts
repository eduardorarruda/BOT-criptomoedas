import type { NovoInvestimentoImobiliario, NovoLancamentoImobiliario } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { diaUtc, isoDeMs, somarMesesMs } from "@zentrade/financas";

/**
 * Carteira fictícia do modo de demonstração, com datas relativas a hoje. Valores
 * inventados para mostrar a tela; não são sugestão de nada.
 */
type Lancamento = NovoLancamentoImobiliario;

const mesesAtras = (hoje: string, meses: number, dia = 10): string => {
  const base = new Date(diaUtc(hoje));
  return isoDeMs(somarMesesMs(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), dia), -meses));
};

/** Um lançamento por mês, de `de` meses atrás até `ate` meses atrás. */
function mensais(hoje: string, de: number, ate: number, f: (i: number) => Lancamento | null): Lancamento[] {
  const lista: Lancamento[] = [];
  for (let m = de; m >= ate; m--) {
    const l = f(de - m);
    if (l) lista.push({ ...l, data: mesesAtras(hoje, m, Number(l.data) || 10) });
  }
  return lista;
}

const l = (tipo: Lancamento["tipo"], categoria: string, valor: string, extra: Partial<Lancamento> = {}) =>
  ({ data: "10", tipo, categoria, valor, ...extra }) as Lancamento;

function apartamento(hoje: string): NovoInvestimentoImobiliario {
  return {
    tipo: "aluguel",
    nome: "Apartamento Vila Mariana",
    valorAtual: "565000",
    valorAtualEm: mesesAtras(hoje, 1),
    aluguelPrevisto: "2600",
    taxaAdministracao: 0.08,
    financiamento: {
      sistema: "SAC",
      valorFinanciado: "364000",
      taxaAnual: 0.1149,
      prazoMeses: 360,
      primeiraParcela: mesesAtras(hoje, 25),
      seguroTaxaMensalSaldo: 0.00022,
      seguroFixoMensal: "38",
      taxaAdministracaoMensal: "25",
    },
    lancamentosIniciais: [
      { data: mesesAtras(hoje, 26), tipo: "aporte", categoria: "entrada", valor: "156000" },
      { data: mesesAtras(hoje, 26), tipo: "aporte", categoria: "itbi", valor: "15600" },
      { data: mesesAtras(hoje, 26), tipo: "aporte", categoria: "escritura", valor: "6200" },
      ...mensais(hoje, 23, 1, (i) => (i === 7 ? null : l("receita", "aluguel", i < 12 ? "2600" : "2730"))),
      ...mensais(hoje, 23, 1, (i) =>
        i === 7 ? null : l("despesa", "administracao", i < 12 ? "208" : "218.40"),
      ),
      {
        data: mesesAtras(hoje, 16),
        tipo: "despesa",
        categoria: "condominio",
        valor: "780",
        descricao: "mês vago",
      },
      {
        data: mesesAtras(hoje, 9),
        tipo: "despesa",
        categoria: "manutencao",
        valor: "1450",
        descricao: "aquecedor",
      },
    ],
  };
}

function temporada(hoje: string): NovoInvestimentoImobiliario {
  const sazonal = [6100, 5200, 3400, 2500, 2100, 1900, 2600, 2300, 2800, 3300, 4100, 6900];
  return {
    tipo: "temporada",
    nome: "Studio em Ubatuba",
    diaria: "290",
    ocupacao: 0.52,
    taxaPlataforma: 0.15,
    valorizacaoAnual: 0.05,
    lancamentosIniciais: [
      { data: mesesAtras(hoje, 19), tipo: "aporte", categoria: "compra", valor: "305000" },
      { data: mesesAtras(hoje, 19), tipo: "aporte", categoria: "itbi", valor: "9150" },
      {
        data: mesesAtras(hoje, 18),
        tipo: "aporte",
        categoria: "reforma",
        valor: "24000",
        descricao: "mobília",
      },
      ...mensais(hoje, 16, 1, (i) => l("receita", "diaria", String(sazonal[i % 12]))),
      ...mensais(hoje, 16, 1, (i) =>
        l(
          "despesa",
          "plataforma",
          dec(sazonal[i % 12] ?? 0)
            .times(0.15)
            .toFixed(2),
        ),
      ),
      ...mensais(hoje, 16, 1, () => l("despesa", "condominio", "540")),
    ],
  };
}

function fii(hoje: string): NovoInvestimentoImobiliario {
  const cotas = (i: number) => (i < 6 ? 60 : i < 12 ? 120 : 180);
  return {
    tipo: "fii",
    nome: "Galpões logísticos",
    ticker: "HGLG11",
    valorAtual: "161.80",
    lancamentosIniciais: [
      { data: mesesAtras(hoje, 18, 3), tipo: "aporte", categoria: "compra", valor: "9480", quantidade: "60" },
      { data: mesesAtras(hoje, 12, 3), tipo: "aporte", categoria: "compra", valor: "9720", quantidade: "60" },
      { data: mesesAtras(hoje, 6, 3), tipo: "aporte", categoria: "compra", valor: "9540", quantidade: "60" },
      ...mensais(hoje, 17, 1, (i) =>
        l("receita", "provento", dec("1.10").times(cotas(i)).toFixed(2), { data: "15" }),
      ),
    ],
  };
}

function plantaEReit(hoje: string): NovoInvestimentoImobiliario[] {
  return [
    {
      tipo: "planta",
      nome: "Torre Jade — na planta",
      valorizacaoAnual: 0.07,
      dataEntrega: mesesAtras(hoje, -14),
      lancamentosIniciais: [
        { data: mesesAtras(hoje, 12), tipo: "aporte", categoria: "sinal", valor: "42000" },
        ...mensais(hoje, 11, 0, () => l("aporte", "parcela", "1850")),
      ],
    },
    {
      tipo: "reit",
      nome: "Realty Income",
      ticker: "O",
      moeda: "USD",
      valorAtual: "57.80",
      cambioAtual: "5.45",
      lancamentosIniciais: [
        {
          data: mesesAtras(hoje, 10, 5),
          tipo: "aporte",
          categoria: "compra",
          valor: "1120",
          quantidade: "20",
          cambio: "5.62",
        },
        ...mensais(hoje, 9, 1, () => l("receita", "dividendo", "5.27", { cambio: "5.50", data: "15" })),
      ],
    },
  ];
}

function cartaEFlip(hoje: string): NovoInvestimentoImobiliario[] {
  return [
    {
      tipo: "consorcio",
      nome: "Consórcio — carta de 250 mil",
      valorCarta: "250000",
      prazoMeses: 180,
      taxaAdministracao: 0.17,
      fundoReserva: 0.02,
      lancamentosIniciais: mensais(hoje, 9, 0, () => l("aporte", "parcela", "1653.89")),
    },
    {
      tipo: "flip",
      nome: "Casa para reformar (vendida)",
      precoVendaAlvo: "395000",
      prazoMeses: 10,
      lancamentosIniciais: [
        { data: mesesAtras(hoje, 14), tipo: "aporte", categoria: "compra", valor: "278000" },
        { data: mesesAtras(hoje, 14), tipo: "aporte", categoria: "itbi", valor: "8340" },
        { data: mesesAtras(hoje, 12), tipo: "aporte", categoria: "reforma", valor: "46500" },
        {
          data: mesesAtras(hoje, 3),
          tipo: "resgate",
          categoria: "venda",
          valor: "376250",
          descricao: "líquido da corretagem",
        },
        { data: mesesAtras(hoje, 2), tipo: "imposto", categoria: "ganho de capital", valor: "4610" },
      ],
    },
  ];
}

export function exemplosDemo(hoje: string): NovoInvestimentoImobiliario[] {
  return [apartamento(hoje), temporada(hoje), fii(hoje), ...plantaEReit(hoje), ...cartaEFlip(hoje)];
}
