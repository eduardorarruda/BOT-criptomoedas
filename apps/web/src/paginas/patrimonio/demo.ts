import type { ClassePatrimonioResumo, Patrimonio } from "@zentrade/contratos/esquemas";
import { dec, paraTexto } from "@zentrade/dominio";
import { consolidarPatrimonio, converterParaReais } from "@zentrade/financas";

/**
 * Patrimônio de demonstração (modo demo, sem API): números de exemplo, somados com a
 * mesma consolidação da API para o total e as fatias fecharem.
 */
const CAMBIO = dec("5.43");
const USDT = "1840.25";
const MINUTO = 60_000;

type Classe = Omit<ClassePatrimonioResumo, "fracao">;

const classes = (agora: number): Classe[] => [
  {
    classe: "cripto",
    situacao: "completa",
    valor: paraTexto(converterParaReais(dec(USDT), CAMBIO)),
    investido: null,
    itens: 4,
    atualizadoEm: agora - 2 * MINUTO,
    moedaOrigem: { moeda: "USDT", valor: USDT },
    avisos: [],
  },
  {
    classe: "renda_fixa",
    situacao: "completa",
    valor: "48210.37",
    investido: "45000",
    itens: 5,
    atualizadoEm: agora - 3 * 60 * MINUTO,
    moedaOrigem: null,
    avisos: [],
  },
  {
    classe: "imobiliario",
    situacao: "completa",
    valor: "312400",
    investido: "285000",
    itens: 3,
    atualizadoEm: agora - 26 * 60 * MINUTO,
    moedaOrigem: null,
    avisos: [],
  },
];

export function patrimonioDemo(agora: number = Date.now()): Patrimonio {
  const lista = classes(agora);
  const c = consolidarPatrimonio(
    lista.map((x) => ({ classe: x.classe, situacao: x.situacao, valor: x.valor ? dec(x.valor) : null })),
  );
  return {
    moeda: "BRL",
    total: paraTexto(c.total),
    parcial: c.parcial,
    calculadoEm: agora,
    cambio: { par: "USDTBRL", preco: paraTexto(CAMBIO), em: agora - 2 * MINUTO, fonte: "binance" },
    classes: lista.map((x, i) => {
      const f = c.fatias[i]?.fracao ?? null;
      return { ...x, fracao: f === null ? null : paraTexto(f.toDecimalPlaces(6)) };
    }),
    avisos: ["Modo de demonstração: números de exemplo, nenhuma conta foi lida."],
  };
}
