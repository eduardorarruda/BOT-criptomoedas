import { ConfiguracaoBacktestEsquema, type DecisaoDTO, type RoboDTO } from "@zentrade/contratos/esquemas";
import { validarEstrategia } from "@zentrade/dominio";
import { ErroApi } from "../api/erros";
import type { Backtest } from "../api/esquemas";
import type { Fonte, OuvintesTempoReal } from "../api/fonte";
import { criarAleatorio, type Aleatorio } from "./aleatorio";
import { ehSimboloDemo, criarMercado } from "./mercado";
import { estadoInicialDemo, posicaoDTO, resumoDemo, type EstadoDemo } from "./estado";
import { criarSimulacao } from "./simulacao";
import { USUARIO_DEMO } from "./dados";
import { comTentativasDemo, simularBacktest } from "./backtestDemo";
import { paraDominio } from "../lib/estrategia";
import { gerarVelas } from "./velas";

/**
 * Modo de demonstração (VITE_DEMO=1): a tela inteira roda no navegador com dados
 * fictícios e um mercado simulado. Imita a API, inclusive os erros (2FA,
 * reautenticação, validação), para que os fluxos possam ser vistos sem servidor.
 */
export interface OpcoesDemo {
  readonly latenciaMs?: readonly [number, number];
  readonly agora?: () => number;
  readonly aleatorio?: Aleatorio;
  readonly tiqueMs?: number;
  readonly analiseCadaMs?: number;
  readonly primeiraAnaliseMs?: number;
  readonly etapaMs?: number;
}

const CHAVE_SESSAO = "zentrade:demo:sessao";
const CONFIRMACAO_MS = 5 * 60_000;

const erroReautenticar = (): ErroApi =>
  new ErroApi("reautenticacao_necessaria", "Por segurança, confirme sua identidade para continuar.", 403);

function lerSessao(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_SESSAO) === "1";
  } catch {
    return false;
  }
}

function gravarSessao(ativa: boolean): void {
  try {
    if (ativa) sessionStorage.setItem(CHAVE_SESSAO, "1");
    else sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {
    // sem armazenamento: a sessão do exemplo vale até recarregar
  }
}

function novoToken(aleatorio: Aleatorio): string {
  const alfabeto = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const corpo = Array.from({ length: 32 }, () => alfabeto[Math.floor(aleatorio() * alfabeto.length)]).join(
    "",
  );
  return `zt_exemplo_${corpo}`;
}

export function criarFonteDemo(opcoes: OpcoesDemo = {}): Fonte {
  const agora = opcoes.agora ?? (() => Date.now());
  const aleatorio = opcoes.aleatorio ?? criarAleatorio(2026);
  const [latMin, latMax] = opcoes.latenciaMs ?? [180, 520];
  const mercado = criarMercado(aleatorio);
  let estado: EstadoDemo = { ...estadoInicialDemo(agora()), usuario: lerSessao() ? USUARIO_DEMO : null };
  const ouvintes = new Set<OuvintesTempoReal>();
  let contador = 0;

  const atraso = async (): Promise<void> => {
    const ms = latMin + aleatorio() * (latMax - latMin);
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  };
  const emitir: OuvintesTempoReal["aoEvento"] = (e) => ouvintes.forEach((o) => o.aoEvento(e));
  const mudar = (f: (e: EstadoDemo) => EstadoDemo): void => {
    estado = f(estado);
  };
  const simulacao = criarSimulacao({
    agora,
    mercado,
    estado: () => estado,
    mudar,
    transmitir: (e) => ouvintes.forEach((o) => o.aoEvento(e)),
    novoId: (prefixo) => novoId(prefixo),
    opcoes,
  });
  const exigirConfirmacao = (): void => {
    if (agora() > estado.confirmadoAte) throw erroReautenticar();
  };
  const novoId = (prefixo: string): string => `${prefixo}-${agora().toString(36)}-${++contador}`;

  function roboOuErro(id: string): RoboDTO {
    const robo = estado.robos.find((r) => r.id === id);
    if (!robo) throw new ErroApi("nao_encontrado", "Esse robô não existe mais. Atualize a lista.", 404);
    return robo;
  }

  function decidirAprovacao(id: string, aprovar: boolean): DecisaoDTO {
    const d = estado.decisoes.find((x) => x.id === id);
    if (!d) throw new ErroApi("nao_encontrado", "Essa decisão não existe mais. Atualize a lista.", 404);
    if (d.estado !== "aguardando_aprovacao")
      throw new ErroApi("conflito", "Essa decisão já foi respondida ou expirou. Atualize a lista.", 409);
    const nova: DecisaoDTO = { ...d, estado: aprovar ? "aprovada" : "recusada" };
    mudar((e) => ({ ...e, decisoes: e.decisoes.map((x) => (x.id === id ? nova : x)) }));
    emitir({ tipo: "decisao", decisao: nova });
    if (aprovar) simulacao.executarAprovada(nova);
    return nova;
  }

  function atualizarRoboNoEstado(robo: RoboDTO): RoboDTO {
    mudar((e) => ({ ...e, robos: e.robos.map((r) => (r.id === robo.id ? robo : r)) }));
    emitir({ tipo: "robo", robo });
    return robo;
  }

  const comAtraso =
    <A extends unknown[], R>(f: (...a: A) => R) =>
    async (...a: A): Promise<Awaited<R>> => {
      await atraso();
      return await f(...a);
    };

  return {
    demo: true,

    obterSessao: comAtraso(() => estado.usuario),
    entrar: comAtraso((c) => {
      if (!c.email.includes("@") || c.senha.length === 0)
        throw new ErroApi("credenciais_invalidas", "Confira o e-mail e a senha e tente de novo.", 401);
      if (!c.codigo2fa)
        throw new ErroApi(
          "codigo2fa_necessario",
          "Digite o código de 6 dígitos do seu app autenticador.",
          401,
        );
      if (!/^\d{6}$/.test(c.codigo2fa))
        throw new ErroApi(
          "codigo2fa_invalido",
          "O código tem 6 números. Confira no app autenticador e digite de novo.",
          401,
        );
      gravarSessao(true);
      mudar((e) => ({ ...e, usuario: USUARIO_DEMO, confirmadoAte: agora() + CONFIRMACAO_MS }));
      return USUARIO_DEMO;
    }),
    sair: comAtraso(() => {
      gravarSessao(false);
      mudar((e) => ({ ...e, usuario: null, confirmadoAte: 0 }));
    }),
    confirmarIdentidade: comAtraso((c) => {
      const valor = "senha" in c ? c.senha : c.codigo2fa;
      if (valor.trim().length === 0)
        throw new ErroApi("confirmacao_invalida", "Digite sua senha ou o código do autenticador.", 401);
      mudar((e) => ({ ...e, confirmadoAte: agora() + CONFIRMACAO_MS }));
    }),

    resumo: comAtraso(() => resumoDemo(estado, agora(), mercado.preco)),
    patrimonio: comAtraso(() => [...estado.patrimonio]),
    saude: comAtraso(() => ({ ok: true, servicos: { banco: true, redis: true, motor: true, agente: true } })),

    estrategias: comAtraso(() => [...estado.estrategias]),
    criarEstrategia: comAtraso((nova) => {
      const problemas = validarEstrategia(paraDominio(nova));
      if (problemas.length)
        throw new ErroApi("estrategia_invalida", `A estratégia tem problemas: ${problemas.join("; ")}.`, 422);
      const criada = { ...nova, id: novoId("e"), versao: 1 };
      mudar((e) => ({ ...e, estrategias: [...e.estrategias, criada] }));
      return criada;
    }),
    novaVersaoEstrategia: comAtraso((id, nova) => {
      const atual = estado.estrategias.find((x) => x.id === id);
      if (!atual) throw new ErroApi("nao_encontrado", "Essa estratégia não existe mais.", 404);
      const problemas = validarEstrategia(paraDominio(nova));
      if (problemas.length)
        throw new ErroApi("estrategia_invalida", `A estratégia tem problemas: ${problemas.join("; ")}.`, 422);
      const versao = { ...nova, id, versao: atual.versao + 1 };
      mudar((e) => ({ ...e, estrategias: e.estrategias.map((x) => (x.id === id ? versao : x)) }));
      return versao;
    }),

    robos: comAtraso(() => [...estado.robos]),
    criarRobo: comAtraso((novo) => {
      const robo: RoboDTO = { ...novo, id: novoId("r"), modo: "observar", pausado: false, criadoEm: agora() };
      mudar((e) => ({ ...e, robos: [...e.robos, robo] }));
      emitir({ tipo: "robo", robo });
      return robo;
    }),
    atualizarRobo: comAtraso((id, m) => {
      const robo = roboOuErro(id);
      if (m.modo === "auto" && robo.rede === "real") exigirConfirmacao();
      return atualizarRoboNoEstado({ ...robo, ...m });
    }),
    posicao: comAtraso((id) => posicaoDTO(estado, roboOuErro(id).id)),

    decisoes: comAtraso((f = {}) =>
      estado.decisoes
        .filter((d) => (!f.roboId || d.roboId === f.roboId) && (!f.estado || d.estado === f.estado))
        .filter((d) => !f.antes || d.em < f.antes)
        .slice(0, Math.min(f.limite ?? 200, 200)),
    ),
    aprovarDecisao: comAtraso((id) => decidirAprovacao(id, true)),
    recusarDecisao: comAtraso((id) => decidirAprovacao(id, false)),

    ordens: comAtraso((roboId) => {
      const daquele = roboId
        ? new Set(estado.decisoes.filter((d) => d.roboId === roboId).map((d) => d.id))
        : null;
      return estado.ordens.filter((o) => !daquele || daquele.has(o.decisaoId));
    }),
    candles: comAtraso((simbolo, intervalo) => {
      if (!ehSimboloDemo(simbolo))
        throw new ErroApi("nao_encontrado", `Não há dados de exemplo para ${simbolo}.`, 404);
      return gerarVelas(simbolo, intervalo, mercado.precoNumero(simbolo), agora());
    }),
    definirParadaTotal: comAtraso((ligada) => {
      if (!ligada) exigirConfirmacao();
      mudar((e) => ({ ...e, paradaTotal: ligada }));
      return ligada;
    }),

    contas: comAtraso(() => [...estado.contas]),
    criarConta: comAtraso((c) => {
      exigirConfirmacao();
      if (c.apiKey.trim().length < 16 || c.apiSecret.trim().length < 16)
        throw new ErroApi(
          "chave_invalida",
          "A chave e o segredo têm pelo menos 16 caracteres. Copie de novo da corretora.",
          422,
        );
      const conta = {
        id: novoId("c"),
        corretora: c.corretora,
        rede: c.rede,
        apiKeyFinal: `…${c.apiKey.trim().slice(-4)}`,
        criadaEm: agora(),
      };
      mudar((e) => ({ ...e, contas: [...e.contas, conta] }));
      return conta;
    }),
    removerConta: comAtraso((id) => {
      mudar((e) => ({ ...e, contas: e.contas.filter((c) => c.id !== id) }));
    }),

    tokens: comAtraso(() => [...estado.tokens]),
    criarToken: comAtraso((nome, escopo) => {
      const token = { id: novoId("t"), nome, escopo, criadoEm: agora(), ultimoUsoEm: null };
      mudar((e) => ({ ...e, tokens: [...e.tokens, token] }));
      return { ...token, token: novoToken(aleatorio) };
    }),
    revogarToken: comAtraso((id) => {
      mudar((e) => ({ ...e, tokens: e.tokens.filter((t) => t.id !== id) }));
    }),

    backtests: comAtraso(() => comTentativasDemo(estado.backtests)),
    criarBacktest: comAtraso((p) => {
      const b: Backtest = {
        id: novoId("b"),
        estado: "na_fila",
        ...p,
        configuracao: ConfiguracaoBacktestEsquema.parse(p.configuracao ?? {}),
        validacao: null,
        tentativas: null,
        metricas: null,
        curva: null,
        erro: null,
        criadoEm: agora(),
        concluidoEm: null,
      };
      mudar((e) => ({ ...e, backtests: [b, ...e.backtests] }));
      setTimeout(
        () =>
          mudar((e) => ({
            ...e,
            backtests: e.backtests.map((x) => (x.id === b.id ? { ...x, estado: "rodando" } : x)),
          })),
        1500,
      );
      setTimeout(
        () =>
          mudar((e) => ({
            ...e,
            backtests: e.backtests.map((x) => (x.id === b.id ? simularBacktest(b, agora()) : x)),
          })),
        5000,
      );
      return b;
    }),
    backtest: comAtraso((id) => {
      const b = comTentativasDemo(estado.backtests).find((x) => x.id === id);
      if (!b) throw new ErroApi("nao_encontrado", "Esse backtest não existe mais.", 404);
      return b;
    }),

    documentos: comAtraso(() => [...estado.documentos]),
    criarNota: comAtraso((n) => {
      const doc = {
        id: novoId("doc"),
        fonte: "nota" as const,
        titulo: n.titulo,
        url: null,
        publicadoEm: agora(),
        criadoEm: agora(),
      };
      mudar((e) => ({ ...e, documentos: [doc, ...e.documentos] }));
      return { ...doc, novo: true, trechos: Math.max(1, Math.ceil(n.texto.length / 800)) };
    }),
    automacoes: comAtraso(() => [...estado.automacoes]),

    aoVivo: comAtraso((roboId) => {
      if (roboId) roboOuErro(roboId);
      return simulacao.historico(roboId);
    }),

    tempoReal(o) {
      ouvintes.add(o);
      o.aoEstado("conectado");
      if (ouvintes.size === 1) simulacao.ligar();
      return () => {
        ouvintes.delete(o);
        o.aoEstado("desligado");
        if (ouvintes.size === 0) simulacao.desligar();
      };
    },
  };
}
