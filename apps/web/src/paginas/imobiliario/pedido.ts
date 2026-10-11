import type {
  FinanciamentoImobiliario,
  NovoInvestimentoImobiliario,
  NovoLancamentoImobiliario,
  TipoImobiliario,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { lerPercentualDigitado, lerReaisDigitado, TIPOS } from "./formato";

/**
 * Do formulário guiado (textos digitados) para o pedido da API. Cada tipo declara os
 * seus campos; a compra e os custos viram lançamentos iniciais, e o financiamento,
 * quando há, entra junto. Erros saem por campo, com a frase para a pessoa.
 */
export type TipoCampo = "texto" | "reais" | "pct" | "data" | "inteiro";

export interface DefinicaoCampo {
  readonly chave: string;
  readonly rotulo: string;
  readonly tipo: TipoCampo;
  readonly obrigatorio?: boolean;
  readonly dica?: string;
}

export type Campos = Readonly<Record<string, string | undefined>>;

const c = (
  chave: string,
  rotulo: string,
  tipo: TipoCampo,
  extra: Partial<DefinicaoCampo> = {},
): DefinicaoCampo => ({
  chave,
  rotulo,
  tipo,
  ...extra,
});

const COMPRA = [
  c("dataCompra", "Data da compra", "data", { obrigatorio: true }),
  c("valorCompra", "Valor de compra", "reais", {
    obrigatorio: true,
    dica: "Preço do imóvel, com a parte financiada.",
  }),
  c("itbi", "ITBI", "reais"),
  c("escritura", "Escritura e registro", "reais"),
  c("reforma", "Reforma", "reais", { dica: "Reformas feitas depois entram como lançamento." }),
];
const VALORIZACAO = c("valorizacaoAnual", "Valorização ao ano", "pct", {
  dica: "Premissa sua, para estimar o valor atual quando você não informa um.",
});
const VALOR_ATUAL = c("valorAtual", "Valor atual do imóvel", "reais", {
  dica: "Avaliação recente, se tiver.",
});

export const CAMPOS_POR_TIPO: Record<TipoImobiliario, readonly DefinicaoCampo[]> = {
  aluguel: [
    ...COMPRA,
    c("aluguelPrevisto", "Aluguel mensal", "reais"),
    c("taxaAdministracao", "Taxa da administradora", "pct"),
    VALORIZACAO,
    VALOR_ATUAL,
  ],
  temporada: [
    ...COMPRA,
    c("diaria", "Diária média", "reais", { obrigatorio: true }),
    c("ocupacao", "Ocupação esperada", "pct", {
      obrigatorio: true,
      dica: "Fração das noites do mês ocupadas.",
    }),
    c("taxaPlataforma", "Taxa da plataforma", "pct"),
    VALORIZACAO,
    VALOR_ATUAL,
  ],
  flip: [
    ...COMPRA,
    c("precoVendaAlvo", "Preço de venda esperado", "reais"),
    c("prazoMeses", "Prazo até vender (meses)", "inteiro"),
    VALOR_ATUAL,
  ],
  terreno: [...COMPRA.slice(0, 4), VALORIZACAO, VALOR_ATUAL],
  planta: [
    c("dataCompra", "Data do sinal", "data", { obrigatorio: true }),
    c("valorCompra", "Sinal pago", "reais", {
      obrigatorio: true,
      dica: "As parcelas da obra entram depois, como lançamentos.",
    }),
    c("dataEntrega", "Entrega prevista", "data"),
    VALORIZACAO,
    VALOR_ATUAL,
  ],
  fii: [
    c("ticker", "Ticker", "texto", { obrigatorio: true, dica: "Como na B3, por exemplo HGLG11." }),
    c("dataCompra", "Data da compra", "data", { obrigatorio: true }),
    c("cotas", "Cotas compradas", "inteiro", { obrigatorio: true }),
    c("valorCompra", "Total pago", "reais", { obrigatorio: true, dica: "Com corretagem e emolumentos." }),
    c("valorAtual", "Preço atual por cota", "reais", {
      dica: "Opcional; com BRAPI_TOKEN a API busca a cotação.",
    }),
  ],
  reit: [
    c("ticker", "Ticker", "texto", { obrigatorio: true, dica: "Como na bolsa americana, por exemplo O." }),
    c("dataCompra", "Data da compra", "data", { obrigatorio: true }),
    c("cotas", "Cotas compradas", "inteiro", { obrigatorio: true }),
    c("valorCompra", "Total pago em dólar", "reais", { obrigatorio: true }),
    c("cambio", "Câmbio do dia (R$ por US$)", "reais", { obrigatorio: true }),
    c("valorAtual", "Preço atual por cota em dólar", "reais"),
    c("cambioAtual", "Câmbio atual (R$ por US$)", "reais"),
  ],
  crowdfunding: [
    c("dataCompra", "Data do aporte", "data", { obrigatorio: true }),
    c("valorCompra", "Valor aportado", "reais", { obrigatorio: true }),
    c("valorAtual", "Saldo atual informado pela plataforma", "reais"),
  ],
  consorcio: [
    c("valorCarta", "Valor da carta de crédito", "reais", { obrigatorio: true }),
    c("prazoMeses", "Prazo do grupo (meses)", "inteiro", { obrigatorio: true }),
    c("taxaAdministracao", "Taxa de administração total", "pct", {
      obrigatorio: true,
      dica: "Sobre a carta, no prazo todo.",
    }),
    c("fundoReserva", "Fundo de reserva", "pct"),
    c("contempladoEm", "Contemplado em", "data", { dica: "Deixe vazio enquanto não for contemplado." }),
  ],
};

export const CAMPOS_FINANCIAMENTO: readonly DefinicaoCampo[] = [
  c("valorFinanciado", "Valor financiado", "reais", { obrigatorio: true }),
  c("taxaAnual", "Juros ao ano (efetivos)", "pct", { obrigatorio: true }),
  c("prazoFinanciamento", "Prazo (meses)", "inteiro", { obrigatorio: true }),
  c("primeiraParcela", "Vencimento da 1ª parcela", "data", { obrigatorio: true }),
  c("seguroTaxaMensalSaldo", "Seguro sobre o saldo, ao mês", "pct", { dica: "O MIP, por exemplo 0,025." }),
  c("seguroFixoMensal", "Seguro fixo por mês", "reais", { dica: "O DFI, por exemplo." }),
  c("taxaAdministracaoMensal", "Tarifa mensal do contrato", "reais"),
];

const MENSAGEM: Record<TipoCampo, string> = {
  texto: "Preencha este campo.",
  reais: "Digite um valor, por exemplo 1.234,56.",
  pct: "Digite um percentual, por exemplo 10,5.",
  data: "Escolha uma data válida.",
  inteiro: "Digite um número inteiro.",
};

type Lido = string | number | null;

function ler(d: DefinicaoCampo, bruto: string | undefined): { valor: Lido; erro?: string } {
  const t = (bruto ?? "").trim();
  if (t === "") return d.obrigatorio ? { valor: null, erro: MENSAGEM[d.tipo] } : { valor: null };
  const valor = lerTipo(d.tipo, t);
  return valor === null ? { valor: null, erro: MENSAGEM[d.tipo] } : { valor };
}

function lerTipo(tipo: TipoCampo, t: string): Lido {
  if (tipo === "texto") return t;
  if (tipo === "reais") {
    const v = lerReaisDigitado(t);
    return v !== null && !v.startsWith("-") ? v : null;
  }
  if (tipo === "pct") return lerPercentualDigitado(t);
  if (tipo === "inteiro") return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null;
}

function lerTodos(defs: readonly DefinicaoCampo[], campos: Campos, erros: Record<string, string>) {
  const lidos: Record<string, Lido> = {};
  for (const d of defs) {
    const r = ler(d, campos[d.chave]);
    if (r.erro) erros[d.chave] = r.erro;
    lidos[d.chave] = r.valor;
  }
  return lidos;
}

function financiamento(
  campos: Campos,
  erros: Record<string, string>,
  compra: Lido,
): FinanciamentoImobiliario | null {
  if (campos.financiado !== "sim") return null;
  const f = lerTodos(CAMPOS_FINANCIAMENTO, campos, erros);
  if (
    typeof f.valorFinanciado === "string" &&
    typeof compra === "string" &&
    dec(f.valorFinanciado).gt(compra)
  ) {
    erros.valorFinanciado = "O valor financiado não pode passar do valor de compra.";
  }
  if (typeof f.prazoFinanciamento === "number" && f.prazoFinanciamento > 600)
    erros.prazoFinanciamento = "Até 600 meses.";
  return {
    sistema: campos.sistema === "PRICE" ? "PRICE" : "SAC",
    valorFinanciado: String(f.valorFinanciado),
    taxaAnual: Number(f.taxaAnual),
    prazoMeses: Number(f.prazoFinanciamento),
    primeiraParcela: String(f.primeiraParcela),
    ...(f.seguroTaxaMensalSaldo !== null ? { seguroTaxaMensalSaldo: Number(f.seguroTaxaMensalSaldo) } : {}),
    ...(f.seguroFixoMensal !== null ? { seguroFixoMensal: String(f.seguroFixoMensal) } : {}),
    ...(f.taxaAdministracaoMensal !== null
      ? { taxaAdministracaoMensal: String(f.taxaAdministracaoMensal) }
      : {}),
  };
}

function lancamentosIniciais(
  tipo: TipoImobiliario,
  v: Record<string, Lido>,
  fin: FinanciamentoImobiliario | null,
): NovoLancamentoImobiliario[] {
  if (tipo === "consorcio" || typeof v.valorCompra !== "string" || typeof v.dataCompra !== "string")
    return [];
  const data = v.dataCompra;
  if (tipo === "fii" || tipo === "reit") {
    const cambio = typeof v.cambio === "string" ? { cambio: v.cambio } : {};
    return [
      {
        data,
        tipo: "aporte",
        categoria: "compra",
        valor: v.valorCompra,
        quantidade: String(v.cotas),
        ...cambio,
      },
    ];
  }
  const proprio = fin ? dec(v.valorCompra).minus(fin.valorFinanciado) : dec(v.valorCompra);
  const categoria = fin
    ? "entrada"
    : tipo === "planta"
      ? "sinal"
      : tipo === "crowdfunding"
        ? "aporte"
        : "compra";
  const lista: NovoLancamentoImobiliario[] = proprio.gt(0)
    ? [{ data, tipo: "aporte", categoria, valor: proprio.toFixed() }]
    : [];
  for (const custo of ["itbi", "escritura", "reforma"] as const) {
    const valor = v[custo];
    if (typeof valor === "string" && dec(valor).gt(0))
      lista.push({ data, tipo: "aporte", categoria: custo, valor });
  }
  return lista;
}

const PARAMETROS = [
  "ticker",
  "valorAtual",
  "cambioAtual",
  "valorizacaoAnual",
  "aluguelPrevisto",
  "taxaAdministracao",
  "diaria",
  "ocupacao",
  "taxaPlataforma",
  "precoVendaAlvo",
  "prazoMeses",
  "dataEntrega",
  "valorCarta",
  "fundoReserva",
  "contempladoEm",
] as const;

export function montarPedido(
  tipo: TipoImobiliario,
  campos: Campos,
): { pedido: NovoInvestimentoImobiliario | null; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const nome = (campos.nome ?? "").trim();
  if (nome === "") erros.nome = "Dê um nome para reconhecer o investimento.";
  const v = lerTodos(CAMPOS_POR_TIPO[tipo], campos, erros);
  const fin =
    TIPOS[tipo].grupo === "imovel" && tipo !== "planta"
      ? financiamento(campos, erros, v.valorCompra ?? null)
      : null;
  if (Object.keys(erros).length > 0) return { pedido: null, erros };
  const parametros = Object.fromEntries(
    PARAMETROS.filter((k) => v[k] !== null && v[k] !== undefined).map((k) => [k, v[k]]),
  );
  const pedido = {
    tipo,
    nome,
    ...(tipo === "reit" ? { moeda: "USD" as const } : {}),
    ...parametros,
    ...(fin ? { financiamento: fin } : {}),
    lancamentosIniciais: lancamentosIniciais(tipo, v, fin),
  } as NovoInvestimentoImobiliario;
  return { pedido, erros };
}
