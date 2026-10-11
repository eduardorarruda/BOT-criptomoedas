import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { decimal, instante } from "./tipos.js";

/**
 * Investimentos imobiliários de cada pessoa. O cadastro guarda as premissas do tipo
 * (valor atual informado, valorização, diária, carta do consórcio…); o que acontece
 * no tempo (compra, aluguel, despesa, venda) são lançamentos. Dinheiro em NUMERIC;
 * frações (taxas, ocupação) também em NUMERIC, convertidas para number na saída.
 * As FKs levam usuario_id junto, como no resto do esquema (a checagem de FK não
 * passa pelo RLS).
 */
const TIPOS_INVESTIMENTO = [
  "aluguel",
  "temporada",
  "flip",
  "terreno",
  "planta",
  "fii",
  "reit",
  "crowdfunding",
  "consorcio",
] as const;
const TIPOS_LANCAMENTO = ["aporte", "receita", "despesa", "resgate", "imposto"] as const;

const lista = (valores: readonly string[]) => sql.raw(valores.map((v) => `'${v}'`).join(", "));
const dia = (nome: string) => date(nome, { mode: "string" });

export const investimentosImobiliarios = pgTable(
  "investimentos_imobiliarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: TIPOS_INVESTIMENTO }).notNull(),
    moeda: text("moeda", { enum: ["BRL", "USD"] })
      .notNull()
      .default("BRL"),
    nome: text("nome").notNull(),
    ticker: text("ticker"),
    observacoes: text("observacoes"),
    valorAtual: decimal("valor_atual"),
    valorAtualEm: dia("valor_atual_em"),
    cambioAtual: decimal("cambio_atual"),
    valorizacaoAnual: decimal("valorizacao_anual"),
    aluguelPrevisto: decimal("aluguel_previsto"),
    taxaAdministracao: decimal("taxa_administracao"),
    diaria: decimal("diaria"),
    ocupacao: decimal("ocupacao"),
    taxaPlataforma: decimal("taxa_plataforma"),
    precoVendaAlvo: decimal("preco_venda_alvo"),
    prazoMeses: integer("prazo_meses"),
    dataEntrega: dia("data_entrega"),
    valorCarta: decimal("valor_carta"),
    fundoReserva: decimal("fundo_reserva"),
    contempladoEm: dia("contemplado_em"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
    atualizadoEm: instante("atualizado_em").notNull().defaultNow(),
  },
  (t) => [
    unique("investimentos_imobiliarios_id_usuario").on(t.id, t.usuarioId),
    index("investimentos_imobiliarios_usuario").on(t.usuarioId, t.criadoEm),
    check("investimentos_imobiliarios_tipo", sql`${t.tipo} in (${lista(TIPOS_INVESTIMENTO)})`),
    check("investimentos_imobiliarios_moeda", sql`${t.moeda} in ('BRL', 'USD')`),
    check("investimentos_imobiliarios_valor_atual", sql`${t.valorAtual} >= 0`),
  ],
);

export const financiamentosImobiliarios = pgTable(
  "financiamentos_imobiliarios",
  {
    investimentoId: uuid("investimento_id").primaryKey(),
    usuarioId: uuid("usuario_id").notNull(),
    sistema: text("sistema", { enum: ["SAC", "PRICE"] }).notNull(),
    valorFinanciado: decimal("valor_financiado").notNull(),
    taxaAnual: decimal("taxa_anual").notNull(),
    prazoMeses: integer("prazo_meses").notNull(),
    primeiraParcela: dia("primeira_parcela").notNull(),
    seguroTaxaMensalSaldo: decimal("seguro_taxa_mensal_saldo"),
    seguroFixoMensal: decimal("seguro_fixo_mensal"),
    taxaAdministracaoMensal: decimal("taxa_administracao_mensal"),
    custosIniciais: decimal("custos_iniciais"),
  },
  (t) => [
    foreignKey({
      name: "financiamentos_imobiliarios_investimento_fk",
      columns: [t.investimentoId, t.usuarioId],
      foreignColumns: [investimentosImobiliarios.id, investimentosImobiliarios.usuarioId],
    }).onDelete("cascade"),
    check("financiamentos_imobiliarios_sistema", sql`${t.sistema} in ('SAC', 'PRICE')`),
    check("financiamentos_imobiliarios_valor", sql`${t.valorFinanciado} > 0`),
    check("financiamentos_imobiliarios_prazo", sql`${t.prazoMeses} between 1 and 600`),
  ],
);

export const lancamentosImobiliarios = pgTable(
  "lancamentos_imobiliarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id").notNull(),
    investimentoId: uuid("investimento_id").notNull(),
    data: dia("data").notNull(),
    tipo: text("tipo", { enum: TIPOS_LANCAMENTO }).notNull(),
    categoria: text("categoria").notNull(),
    /** Na moeda do investimento; sempre positivo (o tipo diz se entra ou sai). */
    valor: decimal("valor").notNull(),
    quantidade: decimal("quantidade"),
    cambio: decimal("cambio"),
    descricao: text("descricao"),
    criadoEm: instante("criado_em").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "lancamentos_imobiliarios_investimento_fk",
      columns: [t.investimentoId, t.usuarioId],
      foreignColumns: [investimentosImobiliarios.id, investimentosImobiliarios.usuarioId],
    }).onDelete("cascade"),
    index("lancamentos_imobiliarios_investimento_data").on(t.investimentoId, t.data),
    check("lancamentos_imobiliarios_tipo", sql`${t.tipo} in (${lista(TIPOS_LANCAMENTO)})`),
    check("lancamentos_imobiliarios_valor", sql`${t.valor} > 0`),
    check("lancamentos_imobiliarios_quantidade", sql`${t.quantidade} > 0`),
    check("lancamentos_imobiliarios_cambio", sql`${t.cambio} > 0`),
  ],
);
