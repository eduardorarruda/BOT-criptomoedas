import type { FerramentaUsada, FonteCitada } from "@zentrade/contratos/esquemas";

/**
 * Respostas prontas do modo de demonstração: o mesmo formato que o agente manda
 * (consultas, texto em Markdown e fontes), para ver a tela sem API nem IA.
 * Os números são de exemplo.
 */
export interface RespostaDemo {
  readonly chaves: readonly string[];
  readonly ferramentas: readonly FerramentaUsada[];
  readonly texto: string;
  readonly fontes: readonly FonteCitada[];
}

const CERCA = "```";

const CARTEIRA: RespostaDemo = {
  chaves: ["carteira", "cripto", "btc", "saldo"],
  ferramentas: [
    { nome: "carteira_cripto", descricao: "Lendo a sua carteira de cripto" },
    { nome: "resumo_da_conta", descricao: "Lendo o resumo da sua conta" },
  ],
  texto: [
    "## Sua carteira cripto hoje",
    "",
    "O patrimônio em cripto está em **R$ 48.230,15**, alta de **+2,4%** nas últimas 24 h, puxada pelo BTC.",
    "",
    "| Ativo | Quantidade | Valor (R$) | Peso | 24 h |",
    "| --- | ---: | ---: | ---: | ---: |",
    "| BTC | 0,0712 | 31.420,80 | 65,1% | +3,1% |",
    "| ETH | 1,8400 | 12.106,35 | 25,1% | +1,2% |",
    "| SOL | 9,5000 | 4.703,00 | 9,8% | −0,6% |",
    "",
    "**O que chama atenção**",
    "",
    "- O BTC passou de **60%** da carteira — acima do teto de concentração que você definiu no risco.",
    "- O robô *ETH Tendência* está em espera desde ontem: o `RSI 14` ficou entre 45 e 55.",
    "",
    "Se quiser conferir pela API com um token de leitura:",
    "",
    `${CERCA}bash`,
    'curl -s -H "Authorization: Bearer $ZENTRADE_TOKEN" \\',
    "  https://seu-servidor/api/v1/carteira/cripto | jq '.ativos[] | {simbolo, peso}'",
    CERCA,
    "",
    "> Isto é um retrato dos seus dados, não uma recomendação de compra ou venda.",
  ].join("\n"),
  fontes: [
    { tipo: "nota", id: "demo-n1", titulo: "Plano de alocação 2026", data: "02/09/2026" },
    {
      tipo: "regra_corretora",
      id: "demo-r1",
      titulo: "Binance: limites de saque",
      url: "https://www.binance.com/pt-BR/fee/schedule",
    },
  ],
};

const ROBOS: RespostaDemo = {
  chaves: ["robô", "robo", "robôs", "robos", "hoje", "dia"],
  ferramentas: [
    { nome: "listar_robos", descricao: "Listando os seus robôs" },
    { nome: "decisoes_recentes", descricao: "Lendo as decisões recentes" },
  ],
  texto: [
    "Hoje os seus **3 robôs** tomaram 7 decisões; o motor de risco barrou 1.",
    "",
    "| Robô | Modo | Decisões | Resultado do dia |",
    "| --- | --- | ---: | ---: |",
    "| BTC Médias | Papel | 3 | +R$ 182,40 |",
    "| ETH Tendência | Papel | 2 | R$ 0,00 |",
    "| SOL Reversão | Pausado | 2 | −R$ 35,10 |",
    "",
    "### Destaques",
    "",
    "1. O **BTC Médias** comprou às 10:42 quando a média de 9 cruzou a de 21 para cima.",
    "2. O **SOL Reversão** foi pausado por você às 14:05, depois de duas perdas seguidas.",
    "3. A decisão barrada pedia 18% do orçamento — acima do limite de 10% por ordem.",
    "",
    "Quer que eu explique a decisão barrada em detalhe?",
  ].join("\n"),
  fontes: [{ tipo: "diario", id: "demo-d1", titulo: "Diário de 11/10/2026", data: "11/10/2026" }],
};

const RENDA_FIXA: RespostaDemo = {
  chaves: ["renda fixa", "título", "titulo", "títulos", "titulos", "vencem", "tesouro", "cdb"],
  ferramentas: [{ nome: "renda_fixa", descricao: "Lendo os seus títulos de renda fixa" }],
  texto: [
    "Você tem **4 títulos**; dois vencem nos próximos 12 meses.",
    "",
    "| Título | Vencimento | Valor hoje | Taxa |",
    "| --- | --- | ---: | --- |",
    "| CDB Banco Inter | 15/03/2027 | R$ 10.840,22 | 112% do CDI |",
    "| LCI Itaú | 02/08/2027 | R$ 5.312,90 | 94% do CDI |",
    "| Tesouro IPCA+ 2029 | 15/05/2029 | R$ 21.004,13 | IPCA + 6,1% |",
    "| Tesouro Selic 2031 | 01/03/2031 | R$ 8.200,00 | Selic + 0,1% |",
    "",
    "O primeiro vencimento é o **CDB Banco Inter**, em **15/03/2027** (daqui a cerca de 5 meses).",
    "Lembre que a LCI é isenta de IR, e o CDB paga 15% de IR sobre o rendimento (mais de 720 dias).",
  ].join("\n"),
  fontes: [{ tipo: "nota", id: "demo-n2", titulo: "Notas de corretagem — renda fixa" }],
};

const DECISAO: RespostaDemo = {
  chaves: ["decisão", "decisao", "explique", "por que", "porque", "comprou"],
  ferramentas: [
    { nome: "decisoes_recentes", descricao: "Lendo as decisões recentes" },
    { nome: "explicar_decisao", descricao: "Abrindo os detalhes de uma decisão" },
  ],
  texto: [
    "A última decisão foi do **BTC Médias**, às 16:20: **aguardar**.",
    "",
    "### Por quê",
    "",
    "- A média de 9 períodos estava *acima* da de 21, mas a distância era de só `0,08%` — abaixo do mínimo de `0,15%` da estratégia.",
    "- O RSI estava em **71**, na zona de sobrecompra.",
    "- O analista de IA propôs comprar com confiança de 0,58; o motor de risco exige 0,65.",
    "",
    "Ou seja: o sinal existia, mas fraco demais para as regras que você definiu. Nada foi enviado à corretora.",
  ].join("\n"),
  fontes: [{ tipo: "estrategia", id: "demo-e1", titulo: "Estratégia: cruzamento de médias v3" }],
};

const GERAL: RespostaDemo = {
  chaves: [],
  ferramentas: [{ nome: "buscar_conhecimento", descricao: "Buscando no seu conhecimento" }],
  texto: [
    "No modo de demonstração eu respondo com dados de exemplo.",
    "",
    "Experimente perguntar sobre:",
    "",
    "- os seus **robôs** hoje;",
    "- a sua **carteira cripto**;",
    "- os **títulos de renda fixa** que vencem;",
    "- a **última decisão** de um robô.",
    "",
    "Com o ZenTrade rodando de verdade, eu leio os seus dados e a sua base de conhecimento.",
  ].join("\n"),
  fontes: [],
};

// A ordem importa: "Explique a decisão do robô BTC" é sobre a decisão, não sobre a carteira.
const TODAS = [RENDA_FIXA, DECISAO, CARTEIRA, ROBOS] as const;

/** A resposta pronta que mais combina com a pergunta (pelas palavras-chave). */
export function respostaPara(pergunta: string): RespostaDemo {
  const p = pergunta.toLowerCase();
  return TODAS.find((r) => r.chaves.some((c) => p.includes(c))) ?? GERAL;
}
