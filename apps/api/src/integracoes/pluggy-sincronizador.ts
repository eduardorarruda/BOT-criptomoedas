import type { ContagemSincronizacao, DadosItem, ItemPluggyLinha, TituloSincronizado } from "@zentrade/banco";
import { ErroApi } from "../erros.js";
import { normalizarInvestimentos } from "./pluggy-normalizacao.js";
import { ErroPluggy, type ClientePluggy, type ItemPluggyApi } from "./pluggy.js";

/**
 * Liga a Pluggy ao banco: emite o connect token do widget, registra o item da pessoa
 * e sincroniza os investimentos (sob demanda e periodicamente).
 *
 * Nunca apaga o item na Pluggy: no MeuPluggy (gratuito, uso pessoal) só dá para
 * conectar bancos nos 15 dias de teste da conta de desenvolvedor; apagar lá seria
 * perder o acesso de vez. "Remover" aqui só desliga a conexão no ZenTrade.
 */
export const INTERVALO_SINCRONIZACAO_MS = 6 * 3_600_000;
const ESPERA_ATUALIZACAO_MS = 120_000;
const INTERVALO_CONSULTA_MS = 3_000;

export interface ArmazemPluggy {
  registrar(usuarioId: string, d: DadosItem): Promise<void>;
  obter(usuarioId: string, id: string): Promise<ItemPluggyLinha | null>;
  aplicarSincronizacao(
    usuarioId: string,
    itemId: string,
    titulos: readonly TituloSincronizado[],
    completo: boolean,
  ): Promise<ContagemSincronizacao>;
  marcarSincronizacao(usuarioId: string, id: string, em: Date, erro: string | null): Promise<void>;
  todos(): Promise<{ id: string; usuarioId: string }[]>;
}

export interface ResultadoSincronizacaoPluggy extends ContagemSincronizacao {
  readonly item: ItemPluggyLinha;
  readonly ignorados: number;
}

export interface SincronizadorPluggy {
  readonly configurada: boolean;
  connectToken(usuarioId: string, itemId?: string): Promise<string>;
  registrar(usuarioId: string, itemId: string): Promise<ResultadoSincronizacaoPluggy>;
  sincronizar(
    usuarioId: string,
    itemId: string,
    pedirAoBanco?: boolean,
  ): Promise<ResultadoSincronizacaoPluggy>;
  sincronizarTodos(): Promise<void>;
  agendar(intervaloMs?: number): () => void;
}

export interface OpcoesSincronizador {
  readonly cliente: ClientePluggy | null;
  readonly armazem: ArmazemPluggy;
  readonly agora: () => number;
  readonly hoje: () => string;
  readonly log: { warn(obj: object, msg: string): void };
  readonly esperar?: (ms: number) => Promise<void>;
}

const naoConfigurada = () =>
  new ErroApi(
    503,
    "pluggy_nao_configurada",
    "a Pluggy não está configurada nesta instalação: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env da API e reinicie",
  );

/** Erro da Pluggy vira resposta 502 com a frase explicada; o resto segue como está. */
function traduzir(e: unknown): unknown {
  if (e instanceof ErroPluggy) return new ErroApi(e.status === 404 ? 404 : 502, "pluggy_falhou", e.message);
  return e;
}

const instante = (v: string | null | undefined): Date | null => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const dadosDoItem = (i: ItemPluggyApi): DadosItem => ({
  id: i.id,
  instituicao: i.connector.name,
  conectorId: i.connector.id,
  logoUrl: i.connector.imageUrl ?? null,
  situacao: i.status,
  erro: i.error?.message ?? null,
  atualizadoNoBanco: instante(i.lastUpdatedAt),
  consentimentoExpira: instante(i.consentExpiresAt),
});

export function criarSincronizadorPluggy(o: OpcoesSincronizador): SincronizadorPluggy {
  const emAndamento = new Map<string, Promise<ResultadoSincronizacaoPluggy>>();
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const exigir = (): ClientePluggy => {
    if (!o.cliente) throw naoConfigurada();
    return o.cliente;
  };

  async function aguardarAtualizacao(cliente: ClientePluggy, itemId: string): Promise<ItemPluggyApi> {
    const fim = o.agora() + ESPERA_ATUALIZACAO_MS;
    for (;;) {
      const item = await cliente.item(itemId);
      if (item.status !== "UPDATING" || o.agora() + INTERVALO_CONSULTA_MS > fim) return item;
      await esperar(INTERVALO_CONSULTA_MS);
    }
  }

  async function executar(
    usuarioId: string,
    itemId: string,
    pedirAoBanco: boolean,
  ): Promise<ResultadoSincronizacaoPluggy> {
    const cliente = exigir();
    try {
      const pediu = pedirAoBanco && (await cliente.pedirAtualizacao(itemId));
      const item = pediu ? await aguardarAtualizacao(cliente, itemId) : await cliente.item(itemId);
      await o.armazem.registrar(usuarioId, dadosDoItem(item));
      const { titulos, ignorados } = normalizarInvestimentos(await cliente.investimentos(itemId), o.hoje());
      // Só um item que terminou de atualizar garante a lista completa: senão nada é encerrado.
      const contagem = await o.armazem.aplicarSincronizacao(
        usuarioId,
        itemId,
        titulos,
        item.status === "UPDATED",
      );
      await o.armazem.marcarSincronizacao(usuarioId, itemId, new Date(o.agora()), null);
      const linha = await o.armazem.obter(usuarioId, itemId);
      if (!linha) throw new Error("o item sumiu durante a sincronização");
      return { ...contagem, ignorados, item: linha };
    } catch (e) {
      const erro = traduzir(e);
      const mensagem = erro instanceof Error ? erro.message : "falha desconhecida";
      await o.armazem
        .marcarSincronizacao(usuarioId, itemId, new Date(o.agora()), mensagem)
        .catch(() => undefined);
      throw erro;
    }
  }

  function sincronizar(
    usuarioId: string,
    itemId: string,
    pedirAoBanco = false,
  ): Promise<ResultadoSincronizacaoPluggy> {
    const chave = `${usuarioId}:${itemId}`;
    const atual = emAndamento.get(chave);
    if (atual) return atual;
    const execucao = executar(usuarioId, itemId, pedirAoBanco).finally(() => emAndamento.delete(chave));
    emAndamento.set(chave, execucao);
    return execucao;
  }

  async function sincronizarTodos(): Promise<void> {
    if (!o.cliente) return;
    for (const { id, usuarioId } of await o.armazem.todos()) {
      await sincronizar(usuarioId, id).catch((e: unknown) =>
        o.log.warn({ itemId: id, erro: (e as Error).message }, "sincronização periódica da Pluggy falhou"),
      );
    }
  }

  return {
    configurada: o.cliente !== null,
    async connectToken(usuarioId, itemId) {
      try {
        return await exigir().connectToken(usuarioId, itemId);
      } catch (e) {
        throw traduzir(e);
      }
    },
    async registrar(usuarioId, itemId) {
      const cliente = exigir();
      const item = await cliente.item(itemId).catch((e: unknown) => {
        throw traduzir(e);
      });
      // O connect token leva o id da pessoa: um item criado para outra pessoa não entra aqui.
      if (item.clientUserId && item.clientUserId !== usuarioId) {
        throw new ErroApi(403, "item_de_outra_pessoa", "esta conexão da Pluggy foi criada para outra pessoa");
      }
      await o.armazem.registrar(usuarioId, dadosDoItem(item));
      return sincronizar(usuarioId, itemId);
    },
    sincronizar,
    sincronizarTodos,
    agendar(intervaloMs = INTERVALO_SINCRONIZACAO_MS) {
      const relogio = setInterval(() => {
        sincronizarTodos().catch((e: unknown) =>
          o.log.warn({ err: e }, "sincronização periódica da Pluggy falhou"),
        );
      }, intervaloMs);
      relogio.unref();
      return () => clearInterval(relogio);
    },
  };
}
