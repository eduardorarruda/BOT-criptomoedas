import type { NovoTitulo } from "@zentrade/contratos/esquemas";
import { dec, type Valor } from "@zentrade/dominio";
import { listarDiasUteis, somarDias, somarMeses, type Indices } from "@zentrade/financas";

/**
 * Dados de mentira da demonstração: séries parecidas com as do Banco Central e uma
 * carteira de exemplo. Servem para ver a tela funcionando, não para decidir nada.
 */
const INICIO = "2024-01-02";

/** CDI diário (% ao dia) por ano: aproximações de 10,5%, 13,9% e 13,65% ao ano. */
const CDI_POR_ANO: Readonly<Record<string, string>> = {
  "2024": "0.0397",
  "2025": "0.0517",
  "2026": "0.050788",
};

function diarias(ate: string, ajuste: string): Map<string, Valor> {
  return new Map(
    listarDiasUteis(INICIO, ate).map((d) => [d, dec(CDI_POR_ANO[d.slice(0, 4)] ?? "0.050788").plus(ajuste)]),
  );
}

function mensal(ate: string): Map<string, Valor> {
  const mapa = new Map<string, Valor>();
  // O IPCA de um mês sai no mês seguinte: o último publicado é o de dois meses atrás.
  for (let m = "2024-01-01"; m <= somarMeses(`${ate.slice(0, 7)}-01`, -2); m = somarMeses(m, 1)) {
    mapa.set(m.slice(0, 7), dec(m.slice(5, 7) === "08" ? "-0.12" : "0.38"));
  }
  return mapa;
}

function poupanca(ate: string): Map<string, Valor> {
  const mapa = new Map<string, Valor>();
  for (let d = INICIO; d <= ate; d = somarDias(d, 1)) mapa.set(d, dec("0.6698"));
  return mapa;
}

export function indicesDemo(hoje: string): Indices {
  const ontem = somarDias(hoje, -1);
  return {
    cdi: diarias(ontem, "0"),
    selic: diarias(ontem, "0.0004"),
    ipca: mensal(hoje),
    poupanca: poupanca(hoje),
  };
}

const titulo = (
  t: Partial<NovoTitulo> &
    Pick<NovoTitulo, "tipo" | "nome" | "indexador" | "dataAplicacao" | "valorAplicado">,
): NovoTitulo => ({
  emissor: null,
  percentualIndexador: null,
  taxaAnual: null,
  vencimento: null,
  carenciaAte: null,
  liquidez: "vencimento",
  ...t,
});

/** Carteira de exemplo (fictícia). As datas são relativas a hoje para os números fazerem sentido. */
export function carteiraDemo(hoje: string): (NovoTitulo & { grupo?: string; origem?: "pluggy" })[] {
  const ha = (meses: number) => somarMeses(hoje, -meses);
  const daqui = (meses: number) => somarMeses(hoje, meses);
  // Os que vieram "pela Pluggy" na demonstração: só para o filtro de origem ter o que mostrar.
  const pluggy = <T extends NovoTitulo>(t: T) => ({ ...t, origem: "pluggy" as const });
  return [
    titulo({
      tipo: "CDB",
      nome: "CDB Banco Exemplo 110%",
      emissor: "Banco Exemplo",
      indexador: "CDI",
      percentualIndexador: "110",
      dataAplicacao: ha(19),
      vencimento: daqui(17),
      valorAplicado: "15000",
    }),
    titulo({
      tipo: "LCA",
      nome: "LCA Agro Exemplo 95%",
      emissor: "Banco Agro Exemplo",
      indexador: "CDI",
      percentualIndexador: "95",
      dataAplicacao: ha(8),
      vencimento: daqui(4),
      valorAplicado: "8000",
    }),
    titulo({
      tipo: "TESOURO_SELIC",
      nome: "Tesouro Selic 2029",
      emissor: "Tesouro Nacional",
      indexador: "SELIC",
      percentualIndexador: "100",
      taxaAnual: "0.08",
      dataAplicacao: ha(23),
      vencimento: "2029-03-01",
      valorAplicado: "12000",
      liquidez: "diaria",
    }),
    titulo({
      tipo: "TESOURO_IPCA",
      nome: "Tesouro IPCA+ 2035",
      emissor: "Tesouro Nacional",
      indexador: "IPCA",
      taxaAnual: "6.8",
      dataAplicacao: ha(16),
      vencimento: "2035-05-15",
      valorAplicado: "5000",
    }),
    titulo({
      tipo: "TESOURO_PREFIXADO",
      nome: "Tesouro Prefixado 2031",
      emissor: "Tesouro Nacional",
      indexador: "PREFIXADO",
      taxaAnual: "13.2",
      dataAplicacao: ha(6),
      vencimento: "2031-01-01",
      valorAplicado: "4000",
    }),
    {
      ...titulo({
        tipo: "CAIXINHA",
        nome: "Caixinhas · 100% do CDI",
        emissor: "Instituição Exemplo",
        indexador: "CDI",
        percentualIndexador: "100",
        dataAplicacao: ha(10),
        valorAplicado: "3000",
        liquidez: "diaria",
      }),
      grupo: "demo-caixinha:100",
    },
    {
      ...titulo({
        tipo: "CAIXINHA",
        nome: "Caixinhas · 100% do CDI",
        emissor: "Instituição Exemplo",
        indexador: "CDI",
        percentualIndexador: "100",
        dataAplicacao: ha(2),
        valorAplicado: "1200",
        liquidez: "diaria",
      }),
      grupo: "demo-caixinha:100",
    },
    pluggy(
      titulo({
        tipo: "CDB",
        nome: "CDB Banco Digital 102%",
        emissor: "Banco Digital Exemplo",
        indexador: "CDI",
        percentualIndexador: "102",
        dataAplicacao: ha(11),
        vencimento: somarDias(hoje, 20),
        valorAplicado: "7000",
      }),
    ),
    pluggy(
      titulo({
        tipo: "LCI",
        nome: "LCI Imobiliária 92%",
        emissor: "Banco Digital Exemplo",
        indexador: "CDI",
        percentualIndexador: "92",
        dataAplicacao: ha(7),
        vencimento: daqui(26),
        valorAplicado: "6000",
        liquidez: "carencia",
        carenciaAte: daqui(2),
      }),
    ),
    titulo({
      tipo: "CRA",
      nome: "CRA Agro IPCA+ 2028",
      emissor: "Securitizadora Exemplo",
      indexador: "IPCA",
      taxaAnual: "6.2",
      dataAplicacao: ha(9),
      vencimento: daqui(30),
      valorAplicado: "5000",
    }),
    titulo({
      tipo: "CDB",
      nome: "CDB Prefixado 12,4% (vencido)",
      emissor: "Banco Exemplo",
      indexador: "PREFIXADO",
      taxaAnual: "12.4",
      dataAplicacao: ha(26),
      vencimento: ha(2),
      valorAplicado: "4500",
    }),
    titulo({
      tipo: "POUPANCA",
      nome: "Poupança",
      emissor: "Banco Exemplo",
      indexador: "POUPANCA",
      dataAplicacao: ha(14),
      valorAplicado: "2000",
      liquidez: "diaria",
    }),
  ];
}
