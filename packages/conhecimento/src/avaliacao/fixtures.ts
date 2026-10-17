import type { FonteConhecimento } from "../tipos.js";
import type { CasoAvaliacao } from "./recall.js";

/**
 * Base sintética para medir a busca. Os textos imitam o que o ZenTrade guarda: regras
 * da corretora, diário de decisões, notas, estratégias e notícias. As perguntas usam
 * palavras diferentes das do texto sempre que possível, para não medir só "achar a
 * mesma frase".
 */
export interface DocumentoFixture {
  readonly fonte: FonteConhecimento;
  readonly titulo: string;
  readonly diasAtras: number;
  readonly texto: string;
}

export const DOCUMENTOS_AVALIACAO: readonly DocumentoFixture[] = [
  {
    fonte: "regra_corretora",
    titulo: "Taxas de negociação à vista",
    diasAtras: 40,
    texto:
      "# Taxas de negociação\nNo mercado à vista a taxa padrão é 0,1% por ordem executada, tanto para quem compra quanto para quem vende.\n\n## Desconto com BNB\nPagar a taxa com BNB dá 25% de desconto.",
  },
  {
    fonte: "regra_corretora",
    titulo: "Saques de USDT",
    diasAtras: 60,
    texto:
      "# Saques\nO saque mínimo de USDT é 10 USDT. Na rede TRC20 a tarifa de saque é 1 USDT; na rede ERC20 a tarifa varia com o gás do Ethereum.",
  },
  {
    fonte: "regra_corretora",
    titulo: "Filtros de ordem LOT_SIZE e MIN_NOTIONAL",
    diasAtras: 90,
    texto:
      "Cada par tem filtros. LOT_SIZE define o passo da quantidade: a quantidade precisa ser múltipla do passo. MIN_NOTIONAL define o valor mínimo da ordem em USDT, hoje 5 USDT para BTCUSDT.",
  },
  {
    fonte: "regra_corretora",
    titulo: "Limites de requisição da API",
    diasAtras: 120,
    texto:
      "A API aceita até 1200 de peso por minuto por IP. Passar do limite devolve HTTP 429; insistir depois do 429 gera banimento temporário com HTTP 418.",
  },
  {
    fonte: "diario",
    titulo: "Decisão 101: compra de BTC abaixo da média",
    diasAtras: 20,
    texto:
      "O preço do BTC ficou 2% abaixo da média móvel de 20 períodos com RSI em 28. A compra foi aprovada e o alvo foi atingido em 9 horas com lucro líquido de 0,6% depois das taxas.",
  },
  {
    fonte: "diario",
    titulo: "Decisão 117: stop atingido em ETH",
    diasAtras: 12,
    texto:
      "Compra de ETH depois de queda forte. O mercado continuou caindo e o stop de 2% foi atingido em 40 minutos. Lição: não comprar ETH enquanto o BTC está em queda acelerada.",
  },
  {
    fonte: "diario",
    titulo: "Decisão 130: risco barrou compra por exposição",
    diasAtras: 5,
    texto:
      "O sinal de compra em SOL veio com confiança alta, mas o motor de risco barrou: a exposição total iria passar do máximo configurado de 1000 USDT.",
  },
  {
    fonte: "estrategia",
    titulo: "Estratégia reversão à média",
    diasAtras: 200,
    texto:
      "Compra quando o preço fecha abaixo da SMA de 20 vezes 0,98 e o RSI de 14 está abaixo de 30. Vende no alvo líquido de 0,5% ou no stop de 2%. Funciona melhor em mercado lateral.",
  },
  {
    fonte: "estrategia",
    titulo: "Estratégia cruzamento de médias exponenciais",
    diasAtras: 150,
    texto:
      "Compra quando a EMA de 9 cruza acima da EMA de 21 e vende quando cruza abaixo. Segue tendência; perde dinheiro em mercado lateral por causa de sinais falsos.",
  },
  {
    fonte: "nota",
    titulo: "Nota: horário de menor liquidez",
    diasAtras: 30,
    texto:
      "Entre 2h e 5h da manhã (horário de Brasília) o livro de ofertas fica raso e o spread aumenta. Evitar ordens grandes nesse horário.",
  },
  {
    fonte: "nota",
    titulo: "Nota: imposto sobre cripto",
    diasAtras: 45,
    texto:
      "Vendas de criptoativos acima de 35 mil reais no mês pagam imposto de renda sobre o ganho de capital. Guardar os comprovantes de cada operação.",
  },
  {
    fonte: "noticia",
    titulo: "Banco central sinaliza alta de juros",
    diasAtras: 1,
    texto:
      "O banco central americano sinalizou nova alta de juros. Historicamente, juros mais altos reduzem o apetite por risco e pressionam o preço do bitcoin.",
  },
  {
    fonte: "noticia",
    titulo: "Corretora anuncia manutenção programada",
    diasAtras: 2,
    texto:
      "A corretora fará manutenção programada no sábado das 3h às 5h. Depósitos, saques e negociação ficam suspensos durante a janela.",
  },
  {
    fonte: "noticia",
    titulo: "ETF de ether recebe aportes recordes",
    diasAtras: 3,
    texto:
      "Fundos de ether negociados em bolsa receberam aportes recordes na semana, puxados por investidores institucionais.",
  },
];

export const PERGUNTAS_AVALIACAO: readonly CasoAvaliacao[] = [
  {
    pergunta: "quanto custa a taxa por ordem no mercado à vista?",
    esperados: ["Taxas de negociação à vista"],
  },
  { pergunta: "dá desconto pagar a taxa com BNB?", esperados: ["Taxas de negociação à vista"] },
  { pergunta: "qual o saque mínimo de USDT e a tarifa na TRC20?", esperados: ["Saques de USDT"] },
  {
    pergunta: "por que a quantidade da ordem precisa ser múltipla do passo?",
    esperados: ["Filtros de ordem LOT_SIZE e MIN_NOTIONAL"],
  },
  {
    pergunta: "qual o valor mínimo da ordem em BTCUSDT?",
    esperados: ["Filtros de ordem LOT_SIZE e MIN_NOTIONAL"],
  },
  { pergunta: "o que acontece depois do HTTP 429 da API?", esperados: ["Limites de requisição da API"] },
  {
    pergunta: "já compramos BTC abaixo da média com RSI baixo? como terminou?",
    esperados: ["Decisão 101: compra de BTC abaixo da média"],
  },
  {
    pergunta: "teve stop atingido em ETH depois de queda?",
    esperados: ["Decisão 117: stop atingido em ETH"],
  },
  {
    pergunta: "o risco já barrou compra por causa da exposição máxima?",
    esperados: ["Decisão 130: risco barrou compra por exposição"],
  },
  {
    pergunta: "como funciona a estratégia de reversão à média com SMA e RSI?",
    esperados: ["Estratégia reversão à média"],
  },
  {
    pergunta: "estratégia de EMA perde dinheiro em mercado lateral?",
    esperados: ["Estratégia cruzamento de médias exponenciais", "Estratégia reversão à média"],
  },
  { pergunta: "qual horário tem livro raso e spread maior?", esperados: ["Nota: horário de menor liquidez"] },
  { pergunta: "quando pago imposto de renda vendendo cripto?", esperados: ["Nota: imposto sobre cripto"] },
  {
    pergunta: "alta de juros afeta o preço do bitcoin?",
    esperados: ["Banco central sinaliza alta de juros"],
  },
  {
    pergunta: "a corretora vai parar para manutenção no sábado?",
    esperados: ["Corretora anuncia manutenção programada"],
  },
];

/** Abaixo disso a busca piorou: o teste falha. */
export const RECALL_MINIMO = 0.85;

/** O mesmo, sem embeddings (EMBEDDINGS_PROVEDOR=nenhum): só o full-text em português. */
export const RECALL_MINIMO_PALAVRAS = 0.9;
