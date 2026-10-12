-- Limites da conta, divergências com a corretora, avisos e o livro do gasto com IA.
-- Espelha src/esquema/risco-conta.ts (gerado pelo drizzle-kit); o fim (GRANT e RLS) é
-- manual, como nas demais tabelas da pessoa: zentrade_app só vê as linhas de app.usuario_id.
CREATE TABLE "avisos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"gravidade" text NOT NULL,
	"titulo" text NOT NULL,
	"mensagem" text NOT NULL,
	"chave" text NOT NULL,
	"robo_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"lido_em" timestamp with time zone,
	"enviado" boolean DEFAULT false NOT NULL,
	CONSTRAINT "avisos_gravidade" CHECK ("avisos"."gravidade" in ('info', 'atencao', 'critico')),
	CONSTRAINT "avisos_tipo" CHECK (tipo in ('stop_atingido', 'perda_diaria_robo', 'perda_diaria_conta', 'pausa_sequencia_stops', 'pausa_queda', 'ordem_rejeitada', 'ordem_incerta', 'robo_nao_ligou', 'websocket_fora', 'divergencia_saldo', 'orcamento_ia_80', 'orcamento_ia_100'))
);
--> statement-breakpoint
CREATE TABLE "divergencias_saldo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rede" text NOT NULL,
	"ativo" text NOT NULL,
	"esperado" numeric(38, 18) NOT NULL,
	"na_corretora" numeric(38, 18) NOT NULL,
	"falta" numeric(38, 18) NOT NULL,
	"estado" text DEFAULT 'aberta' NOT NULL,
	"detectada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvida_em" timestamp with time zone,
	"resolvida_por" text,
	CONSTRAINT "divergencias_saldo_rede" CHECK ("divergencias_saldo"."rede" in ('testnet', 'real')),
	CONSTRAINT "divergencias_saldo_estado" CHECK ("divergencias_saldo"."estado" in ('aberta', 'aceita', 'resolvida')),
	CONSTRAINT "divergencias_saldo_falta" CHECK ("divergencias_saldo"."falta" > 0)
);
--> statement-breakpoint
CREATE TABLE "gastos_ia" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gastos_ia_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"origem" text NOT NULL,
	"custo_usd" numeric(38, 18) NOT NULL,
	CONSTRAINT "gastos_ia_origem" CHECK ("gastos_ia"."origem" in ('analise', 'assistente')),
	CONSTRAINT "gastos_ia_custo" CHECK ("gastos_ia"."custo_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "limites_conta" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"perda_diaria_maxima" numeric(38, 18),
	"incluir_nao_realizado" boolean DEFAULT false NOT NULL,
	"exposicao_maxima" numeric(38, 18),
	"posicoes_abertas_max" integer,
	"queda_maxima" numeric(38, 18),
	"queda_janela_horas" integer DEFAULT 72 NOT NULL,
	"sequencia_stops_max" integer,
	"sequencia_stops_janela_horas" integer DEFAULT 24 NOT NULL,
	"sequencia_stops_escopo" text DEFAULT 'ambos' NOT NULL,
	"orcamento_ia_mensal_usd" numeric(38, 18),
	"orcamento_ia_diario_usd" numeric(38, 18),
	"liberada_em" timestamp with time zone,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limites_conta_valores_positivos" CHECK (coalesce("limites_conta"."perda_diaria_maxima", 1) > 0 and coalesce("limites_conta"."exposicao_maxima", 1) > 0
        and coalesce("limites_conta"."queda_maxima", 1) > 0 and coalesce("limites_conta"."orcamento_ia_mensal_usd", 1) > 0
        and coalesce("limites_conta"."orcamento_ia_diario_usd", 1) > 0),
	CONSTRAINT "limites_conta_posicoes" CHECK ("limites_conta"."posicoes_abertas_max" between 1 and 100),
	CONSTRAINT "limites_conta_queda_janela" CHECK ("limites_conta"."queda_janela_horas" between 1 and 720),
	CONSTRAINT "limites_conta_stops" CHECK ("limites_conta"."sequencia_stops_max" between 1 and 50),
	CONSTRAINT "limites_conta_stops_janela" CHECK ("limites_conta"."sequencia_stops_janela_horas" between 1 and 168),
	CONSTRAINT "limites_conta_stops_escopo" CHECK ("limites_conta"."sequencia_stops_escopo" in ('robo', 'conta', 'ambos'))
);
--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergencias_saldo" ADD CONSTRAINT "divergencias_saldo_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos_ia" ADD CONSTRAINT "gastos_ia_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limites_conta" ADD CONSTRAINT "limites_conta_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avisos_usuario_criado" ON "avisos" USING btree ("usuario_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "divergencias_saldo_aberta_unica" ON "divergencias_saldo" USING btree ("usuario_id","rede","ativo") WHERE "divergencias_saldo"."estado" = 'aberta';--> statement-breakpoint
CREATE INDEX "divergencias_saldo_usuario" ON "divergencias_saldo" USING btree ("usuario_id","detectada_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gastos_ia_usuario_em" ON "gastos_ia" USING btree ("usuario_id","em" DESC NULLS LAST);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON limites_conta, divergencias_saldo, avisos TO zentrade_app;
--> statement-breakpoint
-- O livro de gasto só cresce: o agente grava, ninguém apaga nem reescreve pelo papel da aplicação.
GRANT SELECT, INSERT ON gastos_ia TO zentrade_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE gastos_ia_id_seq TO zentrade_app;
--> statement-breakpoint
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['limites_conta', 'divergencias_saldo', 'avisos', 'gastos_ia']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO zentrade_app USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id())',
      tabela || '_por_usuario', tabela);
  END LOOP;
END
$$;
