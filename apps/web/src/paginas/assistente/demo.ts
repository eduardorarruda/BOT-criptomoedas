import type {
  ConversaResumo,
  EstadoAssistente,
  EventoChat,
  MensagemAssistente,
} from "@zentrade/contratos/esquemas";
import { ErroApi } from "../../api/erros";
import type { ApiAssistente } from "./api";
import { tituloDaPergunta } from "./conversas";
import { respostaPara, type RespostaDemo } from "./demoRespostas";

/**
 * O assistente no modo de demonstração: conversas em memória e respostas prontas que
 * chegam aos pedaços, como o agente de verdade manda (consultas, texto e fontes).
 * Nada sai do navegador e nenhuma IA é chamada.
 */
interface Opcoes {
  /** Pausa base entre os pedaços da resposta (0 nos testes). */
  readonly atrasoMs?: number;
  readonly agora?: () => number;
}

interface ConversaDemo {
  readonly resumo: ConversaResumo;
  readonly mensagens: readonly MensagemAssistente[];
}

const DIA = 86_400_000;
const MODELO_DEMO = "claude-opus-5";
const TAMANHO_PEDACO = 6;
const PREVIA = 120;

const ESTADO_INICIAL: EstadoAssistente = {
  config: { provedor: "api", modelo: null, contaCli: null },
  agenteNoAr: true,
  provedores: { api: true, cli: true },
  provedorPadrao: "api",
  contasCli: [{ id: "pessoal", nome: "pessoal", logada: true }],
  modelos: {
    api: [
      { id: "claude-opus-5", nome: "Opus 5", descricao: "o mais capaz" },
      { id: "claude-sonnet-5", nome: "Sonnet 5", descricao: "rápido e equilibrado" },
    ],
    cli: [
      { id: "opus", nome: "Opus", descricao: "o mais capaz do plano" },
      { id: "sonnet", nome: "Sonnet", descricao: "rápido" },
    ],
  },
};

/** Espera um pouco; se a pessoa parar a resposta, acorda na hora. */
function esperar(ms: number, sinal: AbortSignal): Promise<void> {
  if (ms <= 0 || sinal.aborted) return Promise.resolve();
  return new Promise((resolver) => {
    const relogio = setTimeout(resolver, ms);
    sinal.addEventListener(
      "abort",
      () => {
        clearTimeout(relogio);
        resolver();
      },
      { once: true },
    );
  });
}

/** Pedaços de tamanho parecido com os do modelo, sem cortar no meio de uma palavra longa demais. */
function pedacos(texto: string): string[] {
  const lista: string[] = [];
  let atual = "";
  for (const parte of texto.split(/(\s+)/)) {
    atual += parte;
    if (atual.length >= TAMANHO_PEDACO) {
      lista.push(atual);
      atual = "";
    }
  }
  if (atual) lista.push(atual);
  return lista;
}

export function criarApiAssistenteDemo(opcoes: Opcoes = {}): ApiAssistente {
  const atraso = opcoes.atrasoMs ?? 28;
  const agora = opcoes.agora ?? (() => Date.now());
  let estado = ESTADO_INICIAL;
  let conversas = new Map<string, ConversaDemo>();
  let sequencia = 0;
  const novoId = (prefixo: string) => `${prefixo}-demo-${++sequencia}`;

  const mensagem = (
    papel: MensagemAssistente["papel"],
    texto: string,
    extra: Partial<MensagemAssistente> = {},
  ): MensagemAssistente => ({
    id: novoId(papel === "usuario" ? "u" : "a"),
    papel,
    texto,
    fontes: [],
    ferramentas: [],
    situacao: "ok",
    erro: null,
    provedor: papel === "assistente" ? estado.config.provedor : null,
    modelo: papel === "assistente" ? (estado.config.modelo ?? MODELO_DEMO) : null,
    criadaEm: agora(),
    ...extra,
  });

  const resposta = (r: RespostaDemo, extra: Partial<MensagemAssistente> = {}) =>
    mensagem("assistente", r.texto, { ferramentas: [...r.ferramentas], fontes: [...r.fontes], ...extra });

  const obter = (id: string): ConversaDemo => {
    const c = conversas.get(id);
    if (!c) throw new ErroApi("nao_encontrado", "Essa conversa não existe mais.", 404);
    return c;
  };

  const gravar = (id: string, novas: readonly MensagemAssistente[], tituloNovo?: string) => {
    const c = obter(id);
    const ultima = novas.at(-1);
    const resumo: ConversaResumo = {
      ...c.resumo,
      titulo: tituloNovo ?? c.resumo.titulo,
      previa: (ultima?.texto ?? c.resumo.previa).replace(/\s+/g, " ").slice(0, PREVIA),
      atualizadaEm: agora(),
    };
    conversas = new Map(conversas).set(id, { resumo, mensagens: [...c.mensagens, ...novas] });
  };

  const semear = (id: string, pergunta: string, diasAtras: number) => {
    const quando = agora() - diasAtras * DIA - 40 * 60_000;
    const r = respostaPara(pergunta);
    const resumo: ConversaResumo = {
      id,
      titulo: tituloDaPergunta(pergunta),
      previa: r.texto.replace(/\s+/g, " ").slice(0, PREVIA),
      criadaEm: quando,
      atualizadaEm: quando,
    };
    const mensagens = [
      mensagem("usuario", pergunta, { criadaEm: quando }),
      resposta(r, { criadaEm: quando + 9000 }),
    ];
    conversas = new Map(conversas).set(id, { resumo, mensagens });
  };
  semear("exemplo-saque", "Taxas de saque da Binance", 24);
  semear("exemplo-decisao", "Explique a última decisão do robô BTC Médias", 3);
  semear("exemplo-carteira", "Resumo da minha carteira cripto", 0);

  async function* enviar(conversaId: string, texto: string, sinal: AbortSignal): AsyncGenerator<EventoChat> {
    const c = obter(conversaId);
    const titulo = c.mensagens.length === 0 ? tituloDaPergunta(texto) : undefined;
    const usuario = mensagem("usuario", texto);
    gravar(conversaId, [usuario], titulo);
    yield { tipo: "inicio", usuario };
    const r = respostaPara(texto);
    let escrito = "";
    const interromper = () => {
      gravar(conversaId, [
        resposta(r, { texto: escrito, situacao: "interrompida", erro: "A resposta foi interrompida." }),
      ]);
    };
    await esperar(atraso * 12, sinal);
    for (const f of r.ferramentas) {
      if (sinal.aborted) return interromper();
      yield { tipo: "ferramenta", ...f };
      await esperar(atraso * 30, sinal);
    }
    for (const pedaco of pedacos(r.texto)) {
      if (sinal.aborted) return interromper();
      escrito += pedaco;
      yield { tipo: "texto", delta: pedaco };
      await esperar(atraso, sinal);
    }
    if (sinal.aborted) return interromper();
    yield { tipo: "fontes", fontes: [...r.fontes] };
    const final = resposta(r);
    gravar(conversaId, [final]);
    yield { tipo: "fim", mensagem: final };
  }

  return {
    estado: async () => estado,
    mudarConfig: async (m) => {
      const { config } = estado;
      estado = {
        ...estado,
        config: {
          provedor: m.provedor ?? config.provedor,
          modelo: m.modelo === undefined ? config.modelo : m.modelo,
          contaCli: m.contaCli === undefined ? config.contaCli : m.contaCli,
        },
      };
      return estado;
    },
    conversas: async () =>
      [...conversas.values()].map((c) => c.resumo).sort((a, b) => b.atualizadaEm - a.atualizadaEm),
    conversa: async (id) => {
      const c = obter(id);
      return { ...c.resumo, mensagens: [...c.mensagens] };
    },
    criarConversa: async () => {
      const id = novoId("c");
      const resumo: ConversaResumo = {
        id,
        titulo: "Nova conversa",
        previa: "",
        criadaEm: agora(),
        atualizadaEm: agora(),
      };
      conversas = new Map(conversas).set(id, { resumo, mensagens: [] });
      return resumo;
    },
    renomear: async (id, titulo) => {
      const c = obter(id);
      const resumo = { ...c.resumo, titulo };
      conversas = new Map(conversas).set(id, { ...c, resumo });
      return resumo;
    },
    apagar: async (id) => {
      obter(id);
      const copia = new Map(conversas);
      copia.delete(id);
      conversas = copia;
    },
    enviar,
  };
}

let compartilhada: ApiAssistente | null = null;

/** Uma só por aba: as conversas continuam ao trocar de tela e voltar. */
export function apiAssistenteDemo(): ApiAssistente {
  compartilhada ??= criarApiAssistenteDemo();
  return compartilhada;
}
