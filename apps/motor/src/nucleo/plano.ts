import type { PropostaAgente, RoboConfig } from "@zentrade/contratos";
import {
  avaliarRisco,
  dec,
  fatorDoModoDeEvento,
  type Barreira,
  type EstadoRisco,
  type FiltrosAtivo,
  type FinalidadeOrdem,
  type Lado,
  type Posicao,
  type Sinal,
  type Valor,
} from "@zentrade/dominio";
import { ativosDoSimbolo } from "@zentrade/corretora";
import {
  ajusteDaPosicao,
  protecaoConservadora,
  quantidadeCompra,
  quantidadeVenda,
  type AjustePosicao,
} from "./protecao.js";
import type { Dependencias } from "./tipos.js";

export interface Plano {
  readonly lado: Lado;
  /** Decide quais barreiras do risco valem (proteção não é barrada por pausa nem frequência). */
  readonly finalidade: FinalidadeOrdem;
  readonly quantidade: Valor;
  readonly stop?: Valor;
  readonly alvo?: Valor;
  readonly confianca: number;
  readonly ajuste?: AjustePosicao;
  /** Título do evento que reduziu a entrada à metade (filtro de dia de evento no modo "reduzir"). */
  readonly reducaoPorEvento?: string;
}

export interface Avaliacao {
  readonly aprovada: boolean;
  readonly barreiras: readonly Barreira[];
}

type SinalOperacao = Extract<Sinal, { acao: "COMPRAR" | "VENDER" }>;

const menor = (a: Valor, b: Valor): Valor => (a.lt(b) ? a : b);

async function planejarCompra(
  deps: Dependencias,
  robo: RoboConfig,
  sinal: Extract<Sinal, { acao: "COMPRAR" }>,
  ctx: { preco: Valor; filtros: FiltrosAtivo; estado: EstadoRisco; proposta: PropostaAgente | undefined },
): Promise<Plano> {
  const taxa = robo.estrategia.taxa;
  const protecao = protecaoConservadora(sinal, ctx.proposta, ctx.preco, taxa);
  const saldo = await deps.corretora.saldoLivre(ativosDoSimbolo(robo.simbolo).cotacao);
  const restante = robo.limites.exposicaoMaxima.minus(ctx.estado.exposicaoAtual);
  const disponivel = restante.lte(0) ? dec(0) : menor(saldo, restante);
  const quantidade = quantidadeCompra(
    {
      preco: ctx.preco,
      stop: protecao.stop,
      riscoMaximo: robo.riscoPorOperacao,
      disponivel,
      filtros: ctx.filtros,
      taxa,
      ...(sinal.distanciaRisco ? { distanciaRisco: sinal.distanciaRisco } : {}),
    },
    (ctx.proposta?.tamanhoRelativo ?? 1) * fatorDoModoDeEvento(ctx.estado.diaDeEvento?.modo ?? "ignorar"),
  );
  return {
    lado: "COMPRA",
    finalidade: "entrada",
    quantidade,
    ...protecao,
    confianca: ctx.proposta?.confianca ?? 1,
    ajuste: ajusteDaPosicao(protecao, ctx.preco, taxa),
    ...(ctx.estado.diaDeEvento?.modo === "reduzir"
      ? { reducaoPorEvento: ctx.estado.diaDeEvento.titulo }
      : {}),
  };
}

/** Quantidade, stop e alvo da ordem. Venda: a posição inteira; sair reduz risco. */
export function planejar(
  deps: Dependencias,
  robo: RoboConfig,
  sinal: SinalOperacao,
  ctx: {
    preco: Valor;
    posicao: Posicao;
    filtros: FiltrosAtivo;
    estado: EstadoRisco;
    proposta: PropostaAgente | undefined;
  },
): Promise<Plano> {
  if (sinal.acao === "COMPRAR") return planejarCompra(deps, robo, sinal, ctx);
  return Promise.resolve({
    lado: "VENDA",
    // Stop e alvo cumprem o combinado na entrada; regra de saída e tempo são decisões novas.
    finalidade: sinal.motivo === "stop" || sinal.motivo === "alvo" ? "protecao" : "saida",
    quantidade: quantidadeVenda(ctx.posicao.quantidade, ctx.filtros),
    confianca: ctx.proposta?.confianca ?? 1,
  });
}

/** O motor de risco do domínio tem a palavra final. */
export function avaliar(
  robo: RoboConfig,
  plano: Plano,
  preco: Valor,
  estado: EstadoRisco,
  filtros: FiltrosAtivo,
): Avaliacao {
  const r = avaliarRisco(
    {
      lado: plano.lado,
      finalidade: plano.finalidade,
      quantidade: plano.quantidade,
      precoReferencia: preco,
      confianca: plano.confianca,
      ...(plano.stop ? { stop: plano.stop } : {}),
      ...(plano.alvo ? { alvo: plano.alvo } : {}),
    },
    estado,
    robo.limites,
    filtros,
    robo.estrategia.taxa,
  );
  if (r.aprovada) return { aprovada: true, barreiras: [] };
  const semTamanho = plano.lado === "COMPRA" && plano.quantidade.isZero();
  const explicacao: Barreira[] = semTamanho
    ? [
        {
          codigo: "quantidade_invalida",
          mensagem:
            "Nem a quantidade mínima da corretora cabe no risco por operação, no saldo livre e na exposição restante.",
        },
      ]
    : [];
  return {
    aprovada: false,
    barreiras: [
      ...explicacao,
      ...r.barreiras.filter((b) => !semTamanho || b.codigo !== "quantidade_invalida"),
    ],
  };
}
