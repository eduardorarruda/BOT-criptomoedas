import type { Conversa, EventoChat, FonteCitada, MensagemAssistente } from "@zentrade/contratos/esquemas";

/**
 * A resposta enquanto ela chega, como um redutor puro: cada evento do fluxo (SSE) ou
 * ação da pessoa (parar) gera um estado novo. A tela só desenha o que está aqui.
 */
export type SituacaoResposta = "pensando" | "escrevendo" | "concluida" | "erro" | "interrompida";

/** Uma consulta do assistente aos dados. `inicioTexto` diz quanto texto já tinha chegado. */
export interface Etapa {
  readonly nome: string;
  readonly descricao: string;
  readonly inicioTexto: number;
}

export interface RespostaAoVivo {
  readonly conversaId: string;
  readonly pergunta: string;
  readonly iniciadaEm: number;
  /** A pergunta como a API gravou (evento "inicio"); null até lá. */
  readonly usuario: MensagemAssistente | null;
  readonly texto: string;
  readonly etapas: readonly Etapa[];
  readonly fontes: readonly FonteCitada[];
  readonly situacao: SituacaoResposta;
  readonly erro: string | null;
  /** A resposta como a API gravou (evento "fim"). */
  readonly final: MensagemAssistente | null;
}

export type AcaoResposta =
  | { readonly tipo: "evento"; readonly evento: EventoChat }
  | { readonly tipo: "falhou"; readonly mensagem: string }
  | { readonly tipo: "parou" };

export type EstadoEtapa = "rodando" | "feita" | "parada";

export function novaResposta(conversaId: string, pergunta: string, agora = Date.now()): RespostaAoVivo {
  return {
    conversaId,
    pergunta,
    iniciadaEm: agora,
    usuario: null,
    texto: "",
    etapas: [],
    fontes: [],
    situacao: "pensando",
    erro: null,
    final: null,
  };
}

export const emAndamento = (r: RespostaAoVivo): boolean =>
  r.situacao === "pensando" || r.situacao === "escrevendo";

function aplicarEvento(r: RespostaAoVivo, e: EventoChat): RespostaAoVivo {
  switch (e.tipo) {
    case "inicio":
      return { ...r, usuario: e.usuario };
    case "texto":
      return { ...r, texto: r.texto + e.delta, situacao: "escrevendo" };
    case "ferramenta":
      return {
        ...r,
        situacao: "pensando",
        etapas: [...r.etapas, { nome: e.nome, descricao: e.descricao, inicioTexto: r.texto.length }],
      };
    case "fontes":
      return { ...r, fontes: e.fontes };
    case "fim":
      return { ...r, final: e.mensagem, situacao: "concluida" };
  }
}

export function reduzirResposta(r: RespostaAoVivo, a: AcaoResposta): RespostaAoVivo {
  if (!emAndamento(r)) return r;
  switch (a.tipo) {
    case "evento":
      return aplicarEvento(r, a.evento);
    case "falhou":
      return { ...r, situacao: "erro", erro: a.mensagem };
    case "parou":
      return { ...r, situacao: "interrompida" };
  }
}

/**
 * O agente só avisa quando uma consulta começa. Ela terminou quando veio outra
 * consulta, quando chegou texto depois dela, ou quando a resposta acabou bem.
 */
export function estadoDaEtapa(r: RespostaAoVivo, i: number): EstadoEtapa {
  const etapa = r.etapas[i];
  if (!etapa) return "feita";
  if (r.situacao === "concluida") return "feita";
  const terminou = i < r.etapas.length - 1 || r.texto.length > etapa.inicioTexto;
  if (terminou) return "feita";
  return emAndamento(r) ? "rodando" : "parada";
}

/** A conversa no cache ganha a pergunta e a resposta gravadas, sem recarregar tudo. */
export function comMensagens(
  c: Conversa | undefined,
  novas: readonly MensagemAssistente[],
): Conversa | undefined {
  if (!c) return c;
  const ids = new Set(c.mensagens.map((m) => m.id));
  return { ...c, mensagens: [...c.mensagens, ...novas.filter((m) => !ids.has(m.id))] };
}

const SEPARADOR_TABELA = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/**
 * Durante o streaming, uma tabela só vira tabela quando chega a linha separadora
 * (`| --- |`). Até lá ela ficaria como texto cru cheio de barras; então o último
 * bloco fica guardado por um instante, até dar para desenhar a tabela.
 */
export function textoParaMostrar(texto: string): string {
  const quebra = texto.lastIndexOf("\n\n");
  const inicio = quebra >= 0 ? quebra + 2 : 0;
  const bloco = texto.slice(inicio);
  if (!bloco.trimStart().startsWith("|")) return texto;
  const segunda = bloco.split("\n")[1];
  if (segunda !== undefined && SEPARADOR_TABELA.test(segunda)) return texto;
  return texto.slice(0, inicio);
}
