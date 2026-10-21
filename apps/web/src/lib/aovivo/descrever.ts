import type { Evento } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import type { Tom } from "../../componentes/Selo";
import { formatarDinheiro, formatarPreco, formatarQuantidade } from "../formatar";
import { ESTADO_DECISAO } from "../rotulos";
import type { Categoria } from "./eventos";

/**
 * Cada evento vira uma linha da linha do tempo: título curto, detalhe com o porquê e
 * o tom (cor + ícone, nunca só a cor). Texto para a pessoa, sem jargão de sistema.
 */
export interface Descricao {
  readonly categoria: Categoria;
  readonly titulo: string;
  readonly detalhe?: string;
  readonly tom: Tom;
}

type De<T extends Evento["tipo"]> = Extract<Evento, { tipo: T }>;

const INTERVALO: Record<string, string> = {
  "1m": "1 min",
  "5m": "5 min",
  "15m": "15 min",
  "30m": "30 min",
  "1h": "1 h",
  "4h": "4 h",
  "1d": "1 dia",
};

const PROPOSTA: Record<
  NonNullable<De<"analise">["resultado"]>,
  { readonly texto: string; readonly tom: Tom }
> = {
  comprar: { texto: "A IA propôs comprar", tom: "marca" },
  vender: { texto: "A IA propôs vender", tom: "marca" },
  aguardar: { texto: "A IA propôs aguardar", tom: "neutro" },
  falhou: { texto: "A análise falhou: o robô não opera", tom: "perda" },
};

function candle(e: De<"candle">): Descricao {
  const subiu = dec(e.candle.fecha).gte(e.candle.abre);
  return {
    categoria: "candle",
    titulo: `Candle de ${INTERVALO[e.intervalo] ?? e.intervalo} fechou ${subiu ? "em alta" : "em baixa"}`,
    detalhe: `Abriu ${formatarPreco(e.candle.abre)} · fechou ${formatarPreco(e.candle.fecha)} · máx. ${formatarPreco(e.candle.maxima)} · mín. ${formatarPreco(e.candle.minima)}`,
    tom: "neutro",
  };
}

function sinal(e: De<"sinal">): Descricao {
  const titulo = {
    COMPRAR: "A regra deu sinal de compra",
    VENDER: "A regra deu sinal de venda",
    AGUARDAR: "A regra diz aguardar",
  }[e.acao];
  return {
    categoria: "sinal",
    titulo,
    detalhe: e.explicacao,
    tom: e.acao === "AGUARDAR" ? "neutro" : "atencao",
  };
}

function analise(e: De<"analise">): Descricao {
  if (e.concluida) {
    const p = PROPOSTA[e.resultado ?? "aguardar"];
    return { categoria: "analise", titulo: p.texto, tom: p.tom };
  }
  if (e.etapa)
    return { categoria: "analise", titulo: "A IA consultou", detalhe: e.etapa.descricao, tom: "neutro" };
  return { categoria: "analise", titulo: "A IA começou a analisar", tom: "neutro" };
}

function ordem(e: De<"ordem">): Descricao {
  const o = e.ordem;
  const lado = o.lado === "COMPRA" ? "compra" : "venda";
  const qtd = formatarQuantidade(o.quantidade);
  if (o.estado === "REJEITADA" || o.estado === "CANCELADA")
    return {
      categoria: "ordem",
      titulo: `Ordem de ${lado} ${o.estado === "REJEITADA" ? "rejeitada" : "cancelada"}`,
      ...(o.motivo ? { detalhe: o.motivo } : {}),
      tom: "perda",
    };
  const ex = o.execucoes.at(-1);
  if (!ex)
    return {
      categoria: "ordem",
      titulo: `Ordem de ${lado} enviada`,
      detalhe: o.motivo ?? `${qtd} ${o.simbolo} a mercado`,
      tom: "atencao",
    };
  return {
    categoria: "ordem",
    titulo: `Ordem de ${lado} executada`,
    detalhe: `${qtd} ${o.simbolo} a ${formatarPreco(ex.preco)} · taxa ${formatarDinheiro(ex.taxaCotacao, { casas: 4 })}`,
    tom: "marca",
  };
}

function posicao(e: De<"posicao">): Descricao {
  const zerada = !dec(e.quantidade).gt(0);
  const realizado = formatarDinheiro(e.resultadoRealizado, { sinal: true });
  return {
    categoria: "posicao",
    titulo: zerada ? "Posição fechada" : "Posição atualizada",
    detalhe: zerada
      ? `Resultado realizado ${realizado} (taxas ${formatarDinheiro(e.taxasPagas)})`
      : `${formatarQuantidade(e.quantidade)} a ${formatarPreco(e.precoMedio)} em média · realizado ${realizado}`,
    tom: zerada ? (dec(e.resultadoRealizado).isNegative() ? "perda" : "ganho") : "marca",
  };
}

export function descrever(e: Evento): Descricao | null {
  switch (e.tipo) {
    case "candle":
      return candle(e);
    case "sinal":
      return sinal(e);
    case "analise":
      return analise(e);
    case "decisao": {
      const r = ESTADO_DECISAO[e.decisao.estado];
      return {
        categoria: "decisao",
        titulo: `Decisão: ${r.texto.toLowerCase()}`,
        detalhe: e.decisao.proposta?.justificativa ?? e.decisao.sinal.explicacao,
        tom: r.tom,
      };
    }
    case "risco":
      return { categoria: "risco", titulo: "O risco barrou", detalhe: e.barreira.mensagem, tom: "atencao" };
    case "ordem":
      return ordem(e);
    case "posicao":
      return posicao(e);
    default:
      return null;
  }
}
