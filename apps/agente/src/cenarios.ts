import type {
  AvaliacaoCenarios,
  Cenario,
  NomeCenario,
  PedidoAnalise,
  PropostaAgente,
  PropostaGerada,
} from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { pct, pctSinal } from "./pedido/formato.js";

/**
 * Probabilidade mínima do cenário favorável para a proposta abrir posição. Configurável
 * (AGENTE_CENARIO_LIMIAR); a calibração real vem do placar das decisões. O critério
 * principal é o valor esperado líquido > 0: estratégias de tendência acertam ~30% e
 * ganham pelos ganhos grandes, então um limiar alto (os 60% de antes) barrava quase
 * todo sinal delas, mesmo com valor esperado positivo. O limiar só evita apostar em
 * cenário que o próprio modelo acha quase impossível.
 */
export const LIMIAR_PADRAO = 0.3;
const LIMITE_JUSTIFICATIVA = 2000;
const CASAS = 6;

/** Σ probabilidade × resultado, em decimal exato (o modelo não faz esta conta). */
export function valorEsperado(cenarios: readonly Cenario[]): number {
  return cenarios
    .reduce((soma, c) => soma.plus(dec(c.probabilidade).times(dec(c.resultadoEstimado))), dec(0))
    .toDecimalPlaces(CASAS)
    .toNumber();
}

type Sentido = "comprado" | "vendido";

/** O lado da operação: o que o motor disse; senão, comprado (o à vista de cripto). */
function sentidoDa(pedido: PedidoAnalise, proposta: PropostaGerada): Sentido {
  if (pedido.operacao) return pedido.operacao.sentido;
  return proposta.acao === "vender" && pedido.posicao.quantidade.isZero() ? "vendido" : "comprado";
}

/** Abre (ou aumenta) posição: sem posição e propondo operar. Vender para sair reduz risco. */
const abrePosicao = (pedido: PedidoAnalise, proposta: PropostaGerada): boolean =>
  pedido.posicao.quantidade.isZero() && proposta.acao !== "aguardar";

function avaliar(proposta: PropostaGerada, pedido: PedidoAnalise, limiar: number): AvaliacaoCenarios {
  const favoravel: NomeCenario = sentidoDa(pedido, proposta) === "comprado" ? "alta" : "baixa";
  const probabilidadeFavoravel = proposta.cenarios.find((c) => c.nome === favoravel)?.probabilidade ?? 0;
  const ve = valorEsperado(proposta.cenarios);
  const base = { valorEsperado: ve, favoravel, probabilidadeFavoravel, limiar };
  if (!abrePosicao(pedido, proposta)) {
    const motivo =
      proposta.acao === "aguardar"
        ? "a proposta é aguardar: a regra dos cenários só vale para abrir posição"
        : "vender para sair da posição reduz o risco: a regra dos cenários não barra a saída";
    return { ...base, aplicada: false, aprovada: true, motivo };
  }
  if (ve <= 0)
    return {
      ...base,
      aplicada: true,
      aprovada: false,
      motivo: `valor esperado líquido ${pctSinal(ve / 100)} não é positivo`,
    };
  if (probabilidadeFavoravel < limiar)
    return {
      ...base,
      aplicada: true,
      aprovada: false,
      motivo: `probabilidade do cenário de ${favoravel} ${pct(probabilidadeFavoravel, 0)} < limiar de ${pct(limiar, 0)}`,
    };
  return {
    ...base,
    aplicada: true,
    aprovada: true,
    motivo: `valor esperado líquido ${pctSinal(ve / 100)} e cenário de ${favoravel} com ${pct(probabilidadeFavoravel, 0)} (limiar ${pct(limiar, 0)})`,
  };
}

/**
 * A regra determinística sobre as "prévias de futuro": só abre posição com valor
 * esperado líquido > 0 E cenário favorável com probabilidade ≥ limiar; senão,
 * "aguardar" com o motivo (cenários e contra-argumento ficam, para a tela e o placar).
 * Aprovada, a confiança não passa da probabilidade do cenário favorável.
 */
export function aplicarRegraDosCenarios(
  proposta: PropostaGerada,
  pedido: PedidoAnalise,
  limiar: number = LIMIAR_PADRAO,
): PropostaAgente {
  const avaliacao = avaliar(proposta, pedido, limiar);
  if (!avaliacao.aplicada) return { ...proposta, avaliacao };
  if (avaliacao.aprovada)
    return {
      ...proposta,
      confianca: Math.min(proposta.confianca, avaliacao.probabilidadeFavoravel),
      avaliacao,
    };
  const { stop: _stop, alvo: _alvo, ...semPrecos } = proposta;
  return {
    ...semPrecos,
    acao: "aguardar",
    confianca: 0,
    tamanhoRelativo: 0,
    justificativa: `Regra dos cenários: ${avaliacao.motivo}. ${proposta.justificativa}`.slice(
      0,
      LIMITE_JUSTIFICATIVA,
    ),
    avaliacao,
  };
}
