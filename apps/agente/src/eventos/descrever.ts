/**
 * Frase curta, em português, do que o agente está fazendo — o que aparece no passo a
 * passo ao vivo da tela. Nunca leva dado sensível: no máximo o termo buscado.
 */
const FIXAS: Readonly<Record<string, string>> = {
  retrato_mercado: "Olhando o preço e os indicadores (médias e RSI)",
  posicao_e_orcamento: "Conferindo a posição e o orçamento de risco",
  historico_decisoes: "Relendo como terminaram as decisões anteriores deste robô",
  resumo_da_conta: "Lendo o resumo da sua conta",
  listar_robos: "Listando os seus robôs",
  decisoes_recentes: "Lendo as decisões recentes",
  explicar_decisao: "Abrindo os detalhes de uma decisão",
  ordens_recentes: "Lendo as ordens recentes",
  carteira_cripto: "Lendo a sua carteira de cripto",
  renda_fixa: "Lendo os seus títulos de renda fixa",
  investimentos_imobiliarios: "Lendo os seus investimentos imobiliários",
};

const LIMITE_TERMO = 80;

function termo(entrada: Record<string, unknown>): string | null {
  const consulta = entrada["consulta"];
  if (typeof consulta !== "string" || consulta.trim() === "") return null;
  const limpa = consulta.replace(/\s+/g, " ").trim();
  return limpa.length > LIMITE_TERMO ? `${limpa.slice(0, LIMITE_TERMO - 1)}…` : limpa;
}

export function descreverEtapa(nome: string, entrada: Record<string, unknown> = {}): string {
  if (nome === "buscar_conhecimento") {
    const t = termo(entrada);
    return t ? `Buscando no seu conhecimento: “${t}”` : "Buscando no seu conhecimento";
  }
  return FIXAS[nome] ?? `Consultando ${nome.replace(/_/g, " ")}`;
}
