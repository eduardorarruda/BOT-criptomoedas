import type { LeituraCenarioDTO, PensamentoDTO } from "@zentrade/contratos/esquemas";
import { MoveHorizontal, TrendingDown, TrendingUp, CircleHelp, type LucideIcon } from "lucide-react";
import type { Tom } from "../componentes/Selo";
import { formatarPorcento } from "./formatar";

/**
 * O cenário de mercado como a tela mostra: ícone + palavra + cor. A cor nunca é a
 * única pista (alta e queda também mudam de ícone e de texto).
 */
export type NomeDoCenario = LeituraCenarioDTO["cenario"];

export interface ApresentacaoCenario {
  readonly rotulo: string;
  /** A frase curta para leitor de tela e dicas ("tendência de alta"). */
  readonly extenso: string;
  readonly tom: Tom;
  readonly icone: LucideIcon;
}

export const CENARIO: Record<NomeDoCenario, ApresentacaoCenario> = {
  alta: { rotulo: "Alta", extenso: "tendência de alta", tom: "ganho", icone: TrendingUp },
  queda: { rotulo: "Queda", extenso: "tendência de queda", tom: "perda", icone: TrendingDown },
  lateral: {
    rotulo: "Lateral",
    extenso: "mercado lateral, sem tendência",
    tom: "info",
    icone: MoveHorizontal,
  },
  indefinido: {
    rotulo: "Sem leitura",
    extenso: "histórico curto demais para ler o cenário",
    tom: "neutro",
    icone: CircleHelp,
  },
};

export const pct = (valor: number | null, sinal = true): string =>
  valor === null ? "—" : formatarPorcento(valor, { casas: 1, sinal });

/** Onde a bolinha da régua fica, de 0 a 100, com o centro (média parada) em 50. */
export function posicaoNaRegua(inclinacao: number | null, limiar: number | null): number | null {
  if (inclinacao === null || limiar === null || limiar <= 0) return null;
  const relativo = inclinacao / (2 * limiar);
  return Math.round(50 + Math.max(-1, Math.min(1, relativo)) * 50);
}

export interface NumeroDoCenario {
  readonly chave: string;
  readonly rotulo: string;
  readonly valor: string;
  /** Explicação em palavras simples (vai na dica e no leitor de tela). */
  readonly ajuda: string;
}

/** Os números que justificam o cenário, já com rótulo e ajuda; os que faltam ficam de fora. */
export function numerosDoCenario(c: LeituraCenarioDTO): NumeroDoCenario[] {
  const itens: (NumeroDoCenario | null)[] = [
    c.precoVsSma200 === null
      ? null
      : {
          chave: "sma200",
          rotulo: "Preço × média de 200",
          valor: pct(c.precoVsSma200),
          ajuda: "Quanto o preço está acima (+) ou abaixo (−) da média das últimas 200 velas.",
        },
    c.precoVsSma400 === null
      ? null
      : {
          chave: "sma400",
          rotulo: "Preço × média de 400",
          valor: pct(c.precoVsSma400),
          ajuda: "O mesmo, contra a média das últimas 400 velas (o fôlego mais longo).",
        },
    c.inclinacaoSma200 === null
      ? null
      : {
          chave: "inclinacao",
          rotulo: "Média de 200 em 50 velas",
          valor: pct(c.inclinacaoSma200),
          ajuda: `Quanto a média de 200 andou nas últimas 50 velas. Só conta como tendência acima de ${pct(c.limiarInclinacao, false)}.`,
        },
    c.variacao7d === null
      ? null
      : {
          chave: "sete-dias",
          rotulo:
            c.janelaVariacaoHoras && c.janelaVariacaoHoras < 167
              ? "Variação na janela"
              : "Variação em 7 dias",
          valor: pct(c.variacao7d),
          ajuda:
            c.janelaVariacaoHoras && c.janelaVariacaoHoras < 167
              ? `Quanto o preço andou nas últimas ${Math.round(c.janelaVariacaoHoras)} horas (é o histórico que o robô tem).`
              : "Quanto o preço andou nos últimos 7 dias.",
        },
    c.atrPct === null
      ? null
      : {
          chave: "atr",
          rotulo: "Volatilidade (ATR)",
          valor:
            c.atrPercentil === null
              ? pct(c.atrPct, false)
              : `${pct(c.atrPct, false)} · p${Math.round(c.atrPercentil)}`,
          ajuda:
            `Quanto o preço costuma andar por vela. ${c.atrPercentil === null ? "" : `Está mais agitado que ${Math.round(c.atrPercentil)}% das velas recentes.`}`.trim(),
        },
    c.eficiencia === null
      ? null
      : {
          chave: "eficiencia",
          rotulo: "Eficiência da tendência",
          valor: c.eficiencia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ajuda: "De 0 a 1: perto de 1 o preço andou em linha reta; perto de 0 foi e voltou.",
        },
  ];
  return itens.filter((i): i is NumeroDoCenario => i !== null);
}

export type SituacaoRobo = "comprando" | "saindo" | "posicionado" | "fora";

export interface ResumoRobo {
  readonly situacao: SituacaoRobo;
  readonly rotulo: string;
  readonly tom: Tom;
  /** A conclusão sem o verbo do começo ("preço abaixo da média de 200"). */
  readonly motivo: string;
}

const ROTULO_SITUACAO: Record<SituacaoRobo, { rotulo: string; tom: Tom }> = {
  comprando: { rotulo: "Compra", tom: "marca" },
  saindo: { rotulo: "Sai", tom: "atencao" },
  posicionado: { rotulo: "Posicionado", tom: "info" },
  fora: { rotulo: "Fora", tom: "neutro" },
};

const PREFIXO = /^(Fico de fora|Mantenho a posição|Compro|Saio [^:]+):\s*/;

/** "Fora — preço abaixo da média de 200": o que o robô está fazendo e por quê, numa linha. */
export function resumoDoRobo(p: PensamentoDTO): ResumoRobo {
  const situacao: SituacaoRobo =
    p.sinal === "COMPRAR"
      ? "comprando"
      : p.sinal === "VENDER"
        ? "saindo"
        : p.posicionado
          ? "posicionado"
          : "fora";
  return {
    situacao,
    ...ROTULO_SITUACAO[situacao],
    motivo: p.conclusao.replace(PREFIXO, "").replace(/\.$/, ""),
  };
}
