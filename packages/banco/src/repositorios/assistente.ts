import {
  CONFIG_ASSISTENTE_PADRAO,
  type ConfigAssistente,
  type Conversa,
  type ConversaResumo,
  type FerramentaUsada,
  type FonteCitada,
  type MensagemAssistente,
  type MudancaConfigAssistente,
} from "@zentrade/contratos";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ms } from "../conversao.js";
import { codigoPostgres, ErroDados, umaLinha, VIOLACAO_CHAVE_ESTRANGEIRA } from "../erros.js";
import { assistenteConfig, assistenteConversas, assistenteMensagens } from "../esquema/index.js";
import { limitar } from "./lista.js";

/** Mensagem nova de uma conversa (a da pessoa ou a resposta, já terminada). */
export interface NovaMensagem {
  readonly papel: MensagemAssistente["papel"];
  readonly texto: string;
  readonly fontes?: readonly FonteCitada[];
  readonly ferramentas?: readonly FerramentaUsada[];
  readonly situacao?: MensagemAssistente["situacao"];
  readonly erro?: string | null;
  readonly provedor?: MensagemAssistente["provedor"];
  readonly modelo?: string | null;
}

export interface TurnoHistorico {
  readonly papel: MensagemAssistente["papel"];
  readonly texto: string;
}

const MENSAGENS_POR_CONVERSA = 500;
const TAMANHO_PREVIA = 200;

type LinhaMensagem = typeof assistenteMensagens.$inferSelect;
type LinhaConversa = typeof assistenteConversas.$inferSelect;

const paraMensagem = (m: LinhaMensagem): MensagemAssistente => ({
  id: m.id,
  papel: m.papel,
  texto: m.texto,
  fontes: m.fontes as FonteCitada[],
  ferramentas: m.ferramentas as FerramentaUsada[],
  situacao: m.situacao,
  erro: m.erro,
  provedor: m.provedor,
  modelo: m.modelo,
  criadaEm: ms(m.criadaEm),
});

const paraResumo = (c: LinhaConversa, previa: string | null): ConversaResumo => ({
  id: c.id,
  titulo: c.titulo,
  previa: (previa ?? "").slice(0, TAMANHO_PREVIA),
  criadaEm: ms(c.criadaEm),
  atualizadaEm: ms(c.atualizadaEm),
});

const previaDa = sql<string | null>`(
  select left(m.texto, ${TAMANHO_PREVIA}) from assistente_mensagens m
  where m.conversa_id = assistente_conversas.id
  order by m.criada_em desc, m.id desc limit 1)`;

async function lerGravada(tx: Tx): Promise<ConfigAssistente | null> {
  const [linha] = await tx.select().from(assistenteConfig);
  return linha ? { provedor: linha.provedor, modelo: linha.modelo, contaCli: linha.contaCli } : null;
}

const lerConfig = async (tx: Tx): Promise<ConfigAssistente> =>
  (await lerGravada(tx)) ?? CONFIG_ASSISTENTE_PADRAO;

async function resumoNa(tx: Tx, id: string): Promise<ConversaResumo | null> {
  const [linha] = await tx
    .select({ c: assistenteConversas, previa: previaDa })
    .from(assistenteConversas)
    .where(eq(assistenteConversas.id, id));
  return linha ? paraResumo(linha.c, linha.previa) : null;
}

async function inserirMensagem(
  tx: Tx,
  usuarioId: string,
  conversaId: string,
  m: NovaMensagem,
): Promise<LinhaMensagem> {
  try {
    return umaLinha(
      await tx
        .insert(assistenteMensagens)
        .values({
          conversaId,
          usuarioId,
          papel: m.papel,
          texto: m.texto,
          fontes: [...(m.fontes ?? [])],
          ferramentas: [...(m.ferramentas ?? [])],
          situacao: m.situacao ?? "ok",
          erro: m.erro ?? null,
          provedor: m.provedor ?? null,
          modelo: m.modelo ?? null,
        })
        .returning(),
    );
  } catch (erro) {
    if (codigoPostgres(erro) === VIOLACAO_CHAVE_ESTRANGEIRA) {
      throw new ErroDados("nao_encontrado", "conversa não encontrada; confira o id");
    }
    throw erro;
  }
}

/** Qual "cérebro" responde por esta pessoa (API ou Claude Code, modelo e conta). */
function configuracao(db: Db) {
  return {
    config: (usuarioId: string): Promise<ConfigAssistente> => comoUsuario(db, usuarioId, lerConfig),

    /** A configuração que a pessoa gravou, ou null se ela nunca escolheu (vale o padrão do serviço). */
    configGravada: (usuarioId: string): Promise<ConfigAssistente | null> =>
      comoUsuario(db, usuarioId, lerGravada),

    salvarConfig: (usuarioId: string, mudanca: MudancaConfigAssistente): Promise<ConfigAssistente> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const atual = await lerConfig(tx);
        const nova: ConfigAssistente = {
          provedor: mudanca.provedor ?? atual.provedor,
          modelo: mudanca.modelo === undefined ? atual.modelo : mudanca.modelo,
          contaCli: mudanca.contaCli === undefined ? atual.contaCli : mudanca.contaCli,
        };
        await tx
          .insert(assistenteConfig)
          .values({ usuarioId, ...nova })
          .onConflictDoUpdate({
            target: assistenteConfig.usuarioId,
            set: { ...nova, atualizadoEm: sql`now()` },
          });
        return nova;
      }),
  };
}

/** Leituras das conversas: lista, uma conversa inteira e o histórico recente. */
function leituras(db: Db) {
  return {
    listarConversas: (usuarioId: string, limite?: number): Promise<ConversaResumo[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linhas = await tx
          .select({ c: assistenteConversas, previa: previaDa })
          .from(assistenteConversas)
          .orderBy(desc(assistenteConversas.atualizadaEm), desc(assistenteConversas.id))
          .limit(limitar(limite));
        return linhas.map((l) => paraResumo(l.c, l.previa));
      }),

    obterConversa: (usuarioId: string, id: string): Promise<Conversa | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const resumo = await resumoNa(tx, id);
        if (!resumo) return null;
        const mensagens = await tx
          .select()
          .from(assistenteMensagens)
          .where(eq(assistenteMensagens.conversaId, id))
          .orderBy(asc(assistenteMensagens.criadaEm), asc(assistenteMensagens.id))
          .limit(MENSAGENS_POR_CONVERSA);
        return { ...resumo, mensagens: mensagens.map(paraMensagem) };
      }),

    /** As últimas `limite` mensagens que deram certo, da mais antiga para a mais nova. */
    historico: (usuarioId: string, conversaId: string, limite: number): Promise<TurnoHistorico[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linhas = await tx
          .select({ papel: assistenteMensagens.papel, texto: assistenteMensagens.texto })
          .from(assistenteMensagens)
          .where(and(eq(assistenteMensagens.conversaId, conversaId), eq(assistenteMensagens.situacao, "ok")))
          .orderBy(desc(assistenteMensagens.criadaEm), desc(assistenteMensagens.id))
          .limit(limite);
        return linhas.reverse();
      }),
  };
}

/** Escritas das conversas: criar, renomear, apagar e acrescentar mensagem. */
function escritas(db: Db) {
  return {
    criarConversa: (usuarioId: string, titulo: string): Promise<ConversaResumo> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const c = umaLinha(await tx.insert(assistenteConversas).values({ usuarioId, titulo }).returning());
        return paraResumo(c, null);
      }),

    renomearConversa: (usuarioId: string, id: string, titulo: string): Promise<ConversaResumo | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [c] = await tx
          .update(assistenteConversas)
          .set({ titulo })
          .where(eq(assistenteConversas.id, id))
          .returning({ id: assistenteConversas.id });
        return c ? resumoNa(tx, id) : null;
      }),

    apagarConversa: (usuarioId: string, id: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const apagadas = await tx
          .delete(assistenteConversas)
          .where(eq(assistenteConversas.id, id))
          .returning({ id: assistenteConversas.id });
        return apagadas.length > 0;
      }),

    /** Grava a mensagem e marca a conversa como atualizada agora. */
    acrescentarMensagem: (
      usuarioId: string,
      conversaId: string,
      m: NovaMensagem,
    ): Promise<MensagemAssistente> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linha = await inserirMensagem(tx, usuarioId, conversaId, m);
        await tx
          .update(assistenteConversas)
          .set({ atualizadaEm: sql`now()` })
          .where(and(eq(assistenteConversas.id, conversaId), eq(assistenteConversas.usuarioId, usuarioId)));
        return paraMensagem(linha);
      }),
  };
}

/** Configuração do "cérebro" e conversas do assistente, sempre sob RLS (comoUsuario). */
export function repositorioAssistente(db: Db) {
  return { ...configuracao(db), ...leituras(db), ...escritas(db) };
}

export type RepositorioAssistente = ReturnType<typeof repositorioAssistente>;
