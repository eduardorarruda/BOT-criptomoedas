import {
  problemasDoTipo,
  type InvestimentoImobiliario,
  type LancamentoImobiliario,
  type MudancaInvestimentoImobiliario,
  type NovoInvestimentoImobiliario,
  type NovoLancamentoImobiliario,
} from "@zentrade/contratos";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ErroDados, umaLinha } from "../erros.js";
import {
  financiamentosImobiliarios,
  investimentosImobiliarios,
  lancamentosImobiliarios,
} from "../esquema/index.js";
import { auditar } from "./auditoria.js";
import {
  colunasDoFinanciamento,
  colunasDoInvestimento,
  colunasDoLancamento,
  investimentoDeLinha,
  lancamentoDeLinha,
} from "./imobiliario-conversao.js";

/** Um investimento com todos os seus lançamentos, em ordem de data. */
export interface RegistroImobiliario {
  readonly investimento: InvestimentoImobiliario;
  readonly lancamentos: LancamentoImobiliario[];
}

/**
 * Conferência feita por quem chama, dentro da transação, sobre o estado que vai ficar
 * gravado (ex.: a API refaz as contas e recusa venda de cotas que não existem). Se
 * lançar, nada é gravado.
 */
export type ValidarRegistro = (registro: RegistroImobiliario) => void;

export const LIMITE_INVESTIMENTOS_IMOBILIARIOS = 500;
const LIMITE_LANCAMENTOS = 5000;

const naoEncontrado = () => new ErroDados("nao_encontrado", "investimento não encontrado; confira o id");

function exigirTipoValido(d: Parameters<typeof problemasDoTipo>[0]): void {
  const problemas = problemasDoTipo(d);
  if (problemas.length > 0) {
    throw new ErroDados("invalido", `investimento inválido: ${problemas.map((p) => p.mensagem).join("; ")}`);
  }
}

async function registrosDe(tx: Tx, ids?: readonly string[]): Promise<RegistroImobiliario[]> {
  const filtro = ids ? inArray(investimentosImobiliarios.id, [...ids]) : undefined;
  const linhas = await tx
    .select({ i: investimentosImobiliarios, f: financiamentosImobiliarios })
    .from(investimentosImobiliarios)
    .leftJoin(
      financiamentosImobiliarios,
      eq(financiamentosImobiliarios.investimentoId, investimentosImobiliarios.id),
    )
    .where(filtro)
    .orderBy(asc(investimentosImobiliarios.criadoEm))
    .limit(LIMITE_INVESTIMENTOS_IMOBILIARIOS);
  if (linhas.length === 0) return [];
  const lancamentos = await tx
    .select()
    .from(lancamentosImobiliarios)
    .where(
      inArray(
        lancamentosImobiliarios.investimentoId,
        linhas.map((l) => l.i.id),
      ),
    )
    .orderBy(asc(lancamentosImobiliarios.data), asc(lancamentosImobiliarios.criadoEm))
    .limit(LIMITE_LANCAMENTOS * linhas.length);
  return linhas.map(({ i, f }) => ({
    investimento: investimentoDeLinha(i, f),
    lancamentos: lancamentos.filter((l) => l.investimentoId === i.id).map(lancamentoDeLinha),
  }));
}

async function obterNa(tx: Tx, id: string): Promise<RegistroImobiliario | null> {
  const [registro] = await registrosDe(tx, [id]);
  return registro ?? null;
}

/** Trava a linha do investimento: lançamentos simultâneos no mesmo investimento entram em fila. */
async function travar(tx: Tx, id: string): Promise<void> {
  const [linha] = await tx
    .select({ id: investimentosImobiliarios.id })
    .from(investimentosImobiliarios)
    .where(eq(investimentosImobiliarios.id, id))
    .for("update");
  if (!linha) throw naoEncontrado();
}

async function contarLancamentos(tx: Tx, id: string): Promise<number> {
  const [linha] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(lancamentosImobiliarios)
    .where(eq(lancamentosImobiliarios.investimentoId, id));
  return linha?.n ?? 0;
}

async function inserirLancamentos(
  tx: Tx,
  usuarioId: string,
  investimentoId: string,
  novos: readonly NovoLancamentoImobiliario[],
): Promise<string[]> {
  if (novos.length === 0) return [];
  if ((await contarLancamentos(tx, investimentoId)) + novos.length > LIMITE_LANCAMENTOS) {
    throw new ErroDados("invalido", `cada investimento aceita até ${LIMITE_LANCAMENTOS} lançamentos`);
  }
  const linhas = await tx
    .insert(lancamentosImobiliarios)
    .values(novos.map((l) => ({ usuarioId, investimentoId, ...colunasDoLancamento(l) })))
    .returning({ id: lancamentosImobiliarios.id });
  return linhas.map((l) => l.id);
}

async function gravarFinanciamento(
  tx: Tx,
  usuarioId: string,
  investimentoId: string,
  f: NovoInvestimentoImobiliario["financiamento"],
): Promise<void> {
  if (f === undefined) return;
  await tx
    .delete(financiamentosImobiliarios)
    .where(eq(financiamentosImobiliarios.investimentoId, investimentoId));
  if (f === null) return;
  await tx
    .insert(financiamentosImobiliarios)
    .values({ investimentoId, usuarioId, ...colunasDoFinanciamento(f) });
}

async function contar(tx: Tx): Promise<number> {
  const [linha] = await tx.select({ n: sql<number>`count(*)::int` }).from(investimentosImobiliarios);
  return linha?.n ?? 0;
}

async function criarNa(
  tx: Tx,
  usuarioId: string,
  novo: NovoInvestimentoImobiliario,
  validar?: ValidarRegistro,
) {
  exigirTipoValido(novo);
  if ((await contar(tx)) >= LIMITE_INVESTIMENTOS_IMOBILIARIOS) {
    throw new ErroDados("invalido", `limite de ${LIMITE_INVESTIMENTOS_IMOBILIARIOS} investimentos atingido`);
  }
  const { id } = umaLinha(
    await tx
      .insert(investimentosImobiliarios)
      .values({
        usuarioId,
        tipo: novo.tipo,
        moeda: novo.moeda ?? "BRL",
        nome: novo.nome,
        ...colunasDoInvestimento(novo),
      })
      .returning({ id: investimentosImobiliarios.id }),
  );
  await gravarFinanciamento(tx, usuarioId, id, novo.financiamento ?? null);
  await inserirLancamentos(tx, usuarioId, id, novo.lancamentosIniciais ?? []);
  const registro = (await obterNa(tx, id)) as RegistroImobiliario;
  validar?.(registro);
  await auditar(tx, usuarioId, "imobiliario_criado", id, { tipo: novo.tipo });
  return registro;
}

async function atualizarNa(
  tx: Tx,
  usuarioId: string,
  id: string,
  mudanca: MudancaInvestimentoImobiliario,
  validar?: ValidarRegistro,
) {
  await travar(tx, id);
  const atual = (await obterNa(tx, id)) as RegistroImobiliario;
  exigirTipoValido({ ...atual.investimento, ...mudanca });
  await tx
    .update(investimentosImobiliarios)
    .set({ ...colunasDoInvestimento(mudanca), atualizadoEm: new Date() })
    .where(eq(investimentosImobiliarios.id, id));
  await gravarFinanciamento(tx, usuarioId, id, mudanca.financiamento);
  const registro = (await obterNa(tx, id)) as RegistroImobiliario;
  validar?.(registro);
  await auditar(tx, usuarioId, "imobiliario_alterado", id, { campos: Object.keys(mudanca) });
  return registro;
}

async function removerNa(tx: Tx, usuarioId: string, id: string): Promise<void> {
  const apagados = await tx
    .delete(investimentosImobiliarios)
    .where(eq(investimentosImobiliarios.id, id))
    .returning({ tipo: investimentosImobiliarios.tipo });
  if (apagados.length === 0) throw naoEncontrado();
  await auditar(tx, usuarioId, "imobiliario_removido", id, { tipo: apagados[0]?.tipo });
}

async function adicionarLancamentoNa(
  tx: Tx,
  usuarioId: string,
  investimentoId: string,
  novo: NovoLancamentoImobiliario,
  validar?: ValidarRegistro,
): Promise<LancamentoImobiliario> {
  await travar(tx, investimentoId);
  const [lancamentoId] = await inserirLancamentos(tx, usuarioId, investimentoId, [novo]);
  const registro = (await obterNa(tx, investimentoId)) as RegistroImobiliario;
  validar?.(registro);
  await tx
    .update(investimentosImobiliarios)
    .set({ atualizadoEm: new Date() })
    .where(eq(investimentosImobiliarios.id, investimentoId));
  return registro.lancamentos.find((l) => l.id === lancamentoId) as LancamentoImobiliario;
}

async function removerLancamentoNa(
  tx: Tx,
  investimentoId: string,
  lancamentoId: string,
  validar?: ValidarRegistro,
): Promise<void> {
  await travar(tx, investimentoId);
  const apagados = await tx
    .delete(lancamentosImobiliarios)
    .where(
      and(
        eq(lancamentosImobiliarios.id, lancamentoId),
        eq(lancamentosImobiliarios.investimentoId, investimentoId),
      ),
    )
    .returning({ id: lancamentosImobiliarios.id });
  if (apagados.length === 0) throw new ErroDados("nao_encontrado", "lançamento não encontrado; confira o id");
  validar?.((await obterNa(tx, investimentoId)) as RegistroImobiliario);
}

/** Tudo roda como a pessoa (RLS): sem WHERE por usuario_id, as policies filtram. */
export function repositorioImobiliario(db: Db) {
  return {
    /** Todos os investimentos da pessoa, com financiamento e lançamentos. */
    listar: (usuarioId: string): Promise<RegistroImobiliario[]> =>
      comoUsuario(db, usuarioId, (tx) => registrosDe(tx)),
    obter: (usuarioId: string, id: string): Promise<RegistroImobiliario | null> =>
      comoUsuario(db, usuarioId, (tx) => obterNa(tx, id)),
    criar: (usuarioId: string, novo: NovoInvestimentoImobiliario, validar?: ValidarRegistro) =>
      comoUsuario(db, usuarioId, (tx) => criarNa(tx, usuarioId, novo, validar)),
    atualizar: (
      usuarioId: string,
      id: string,
      m: MudancaInvestimentoImobiliario,
      validar?: ValidarRegistro,
    ) => comoUsuario(db, usuarioId, (tx) => atualizarNa(tx, usuarioId, id, m, validar)),
    remover: (usuarioId: string, id: string): Promise<void> =>
      comoUsuario(db, usuarioId, (tx) => removerNa(tx, usuarioId, id)),
    adicionarLancamento: (
      usuarioId: string,
      id: string,
      l: NovoLancamentoImobiliario,
      validar?: ValidarRegistro,
    ) => comoUsuario(db, usuarioId, (tx) => adicionarLancamentoNa(tx, usuarioId, id, l, validar)),
    removerLancamento: (usuarioId: string, id: string, lancamentoId: string, validar?: ValidarRegistro) =>
      comoUsuario(db, usuarioId, (tx) => removerLancamentoNa(tx, id, lancamentoId, validar)),
  };
}

export type RepositorioImobiliario = ReturnType<typeof repositorioImobiliario>;
