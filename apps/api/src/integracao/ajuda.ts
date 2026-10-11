import { randomBytes } from "node:crypto";
import { criarBanco, type Banco } from "@zentrade/banco";
import { criarBancoDescartavel } from "@zentrade/banco/teste";
import type { Alerta } from "../integracoes/n8n.js";
import type { PropostaCriada } from "@zentrade/contratos";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { generate } from "otplib";
import { construirApp } from "../app.js";
import { criarUsuario } from "../comandos/usuario.js";
import { lerConfig } from "../config.js";
import type { Dependencias, FilaBacktests } from "../dependencias.js";
import type { Embeddings } from "@zentrade/conhecimento";
import { antiReplayRedis } from "../integracoes/anti-replay.js";
import { armazemMemoria, criarRegistroAutomacoes } from "../integracoes/automacoes.js";
import { criarServicoConhecimento, repositorioRag } from "../integracoes/conhecimento.js";
import { criarHubEventos } from "../integracoes/eventos.js";
import { criarFilaBacktests } from "../integracoes/fila.js";
import { assinarEventos, conectarRedis, verificadorSaude } from "../integracoes/redis.js";
import { n8nComRegistro } from "../integracoes/n8n.js";
import { criarRetransmissorN8n } from "../integracoes/retransmissor.js";

export const SEGREDO_WEBHOOK = "w".repeat(40);
export const ORIGEM = "http://localhost:5173";
export const SENHA = "uma frase longa de teste";

const silencioso = { warn: () => undefined, error: () => undefined };

export interface Pessoa {
  readonly id: string;
  readonly email: string;
  readonly cookie: string;
  readonly csrf: string;
}

export interface Api {
  readonly app: FastifyInstance;
  readonly banco: Banco;
  readonly relogio: { t: number };
  readonly n8n: { propostas: PropostaCriada[]; alertas: Alerta[] };
  readonly redisUrl: string;
  /** Cria a pessoa (pelo comando) e entra. */
  pessoa(email: string): Promise<Pessoa>;
  entrar(email: string, codigo2fa?: string): Promise<LightMyRequestResponse>;
  /** Liga o 2FA da pessoa e devolve o segredo. */
  ativar2fa(p: Pessoa): Promise<string>;
  encerrar(): Promise<void>;
}

export const cookiesDe = (r: LightMyRequestResponse): string =>
  r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

/** Embeddings determinísticos de teste (1024 dimensões): nada de serviço pago. */
export const embeddingsFalsos: Embeddings = {
  dimensoes: 1024,
  gerar: async (textos) =>
    textos.map((t) => Array.from({ length: 1024 }, (_, i) => ((t.length + i) % 7) / 7)),
};

export interface OpcoesApi {
  readonly embeddings?: Embeddings;
  readonly fila?: FilaBacktests;
  /** Variáveis de ambiente a mais (ex.: N8N_USUARIO_ID). */
  readonly ambiente?: Readonly<Record<string, string>>;
  /** Dependências a mais, montadas com o banco do teste (ex.: assistente, arquivos). */
  readonly extras?: (banco: Banco, conhecimento: Dependencias["conhecimento"]) => Partial<Dependencias>;
}

export async function montarApi(o: OpcoesApi = {}): Promise<Api> {
  const descartavel = await criarBancoDescartavel();
  const redisUrl = process.env.ZT_TESTE_REDIS_URL ?? "redis://127.0.0.1:56390";
  const config = lerConfig({
    DATABASE_URL: descartavel.url,
    ZENTRADE_CHAVE_MESTRA: randomBytes(32).toString("base64"),
    REDIS_URL: redisUrl,
    N8N_WEBHOOK_SEGREDO: SEGREDO_WEBHOOK,
    ZENTRADE_ORIGEM_WEB: ORIGEM,
    LOG_LEVEL: process.env.ZT_TESTE_LOG ?? "silent",
    ...o.ambiente,
  });
  const banco = criarBanco({
    url: config.DATABASE_URL,
    chaveMestra: config.ZENTRADE_CHAVE_MESTRA,
    maximoConexoes: 5,
  });
  const redis = conectarRedis(redisUrl, "teste-api");
  const assinante = conectarRedis(redisUrl, "teste-api-eventos");
  const filaReal = criarFilaBacktests(redis);
  const n8n = { propostas: [] as PropostaCriada[], alertas: [] as Alerta[] };
  const relogio = { t: Date.now() };
  const agora = () => relogio.t;
  const automacoes = criarRegistroAutomacoes({ armazem: armazemMemoria(), agora, log: silencioso });
  const clienteN8n = n8nComRegistro(
    {
      enviarProposta: async (p: PropostaCriada) => void n8n.propostas.push(p),
      enviarAlerta: async (a: Alerta) => void n8n.alertas.push(a),
    },
    automacoes,
  );
  const hub = criarHubEventos({ donos: banco.sistema, log: silencioso });
  hub.aoEvento(criarRetransmissorN8n({ decisoes: banco.decisoes, n8n: clienteN8n, log: silencioso }));
  await assinarEventos(assinante, hub);
  const conhecimento = criarServicoConhecimento({
    repositorio: repositorioRag(banco),
    documentos: banco.conhecimento,
    embeddings: o.embeddings
      ? { embeddings: o.embeddings }
      : { indisponivel: "VOYAGE_API_KEY não está definida (use EMBEDDINGS_PROVEDOR=ollama para local)" },
  });
  const deps: Dependencias = {
    config,
    banco,
    fila: o.fila ?? filaReal,
    n8n: clienteN8n,
    conhecimento,
    automacoes,
    antiReplay: antiReplayRedis(redis),
    hub,
    saude: verificadorSaude({ redis, log: silencioso, agora }),
    agora,
    verificacaoTempoRealMs: 50,
    ...o.extras?.(banco, conhecimento),
  };
  const app = await construirApp(deps);

  const entrar = (email: string, codigo2fa?: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/sessao",
      payload: { email, senha: SENHA, ...(codigo2fa ? { codigo2fa } : {}) },
    });

  return {
    app,
    banco,
    relogio,
    n8n,
    redisUrl,
    entrar,
    async pessoa(email) {
      const u = await criarUsuario(banco, { email, nome: email.split("@")[0] ?? email, senha: SENHA });
      const r = await entrar(email);
      return { id: u.id, email, cookie: cookiesDe(r), csrf: r.json<{ csrf: string }>().csrf };
    },
    async ativar2fa(p) {
      const cab = { cookie: p.cookie, "x-csrf-token": p.csrf };
      const r = await app.inject({ method: "POST", url: "/api/v1/sessao/2fa", headers: cab });
      const { segredo } = r.json<{ segredo: string }>();
      await app.inject({
        method: "POST",
        url: "/api/v1/sessao/2fa/ativar",
        headers: cab,
        payload: { codigo: await generate({ secret: segredo }) },
      });
      return segredo;
    },
    async encerrar() {
      await app.close();
      await filaReal.fechar();
      await Promise.all([redis.quit(), assinante.quit()]);
      await banco.fechar();
      await descartavel.descartar();
    },
  };
}

/** Cabeçalhos de uma requisição da tela que altera algo. */
export const comSessao = (p: Pessoa) => ({ cookie: p.cookie, "x-csrf-token": p.csrf });
