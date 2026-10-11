-- Carteira da Binance: negociações importadas da conta de cada pessoa, a foto dos
-- saldos e o estado da sincronização. Escrita à mão (o snapshot do drizzle-kit é
-- reconciliado na integração). Dinheiro em NUMERIC(38,18); RLS por usuario_id.
CREATE TABLE "carteira_negociacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rede" text NOT NULL,
	"simbolo" text NOT NULL,
	"base" text NOT NULL,
	"cotacao" text NOT NULL,
	"id_negociacao" bigint NOT NULL,
	"id_ordem" bigint NOT NULL,
	"id_cliente" text,
	"origem" text NOT NULL,
	"lado" text NOT NULL,
	"preco" numeric(38, 18) NOT NULL,
	"quantidade" numeric(38, 18) NOT NULL,
	"valor_cotacao" numeric(38, 18) NOT NULL,
	"taxa" numeric(38, 18) NOT NULL,
	"ativo_taxa" text NOT NULL,
	"cotacao_usdt" numeric(38, 18),
	"taxa_usdt" numeric(38, 18),
	"em" timestamp with time zone NOT NULL,
	"importada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carteira_negociacoes_unica" UNIQUE("usuario_id","rede","simbolo","id_negociacao"),
	CONSTRAINT "carteira_negociacoes_rede" CHECK ("carteira_negociacoes"."rede" in ('testnet', 'real')),
	CONSTRAINT "carteira_negociacoes_origem" CHECK ("carteira_negociacoes"."origem" in ('robo', 'manual')),
	CONSTRAINT "carteira_negociacoes_lado" CHECK ("carteira_negociacoes"."lado" in ('COMPRA', 'VENDA')),
	CONSTRAINT "carteira_negociacoes_quantidade_positiva" CHECK ("carteira_negociacoes"."quantidade" > 0)
);
--> statement-breakpoint
CREATE TABLE "carteira_saldos" (
	"usuario_id" uuid NOT NULL,
	"rede" text NOT NULL,
	"ativo" text NOT NULL,
	"livre" numeric(38, 18) NOT NULL,
	"bloqueado" numeric(38, 18) NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carteira_saldos_pk" PRIMARY KEY("usuario_id","rede","ativo"),
	CONSTRAINT "carteira_saldos_rede" CHECK ("carteira_saldos"."rede" in ('testnet', 'real'))
);
--> statement-breakpoint
CREATE TABLE "carteira_sincronizacoes" (
	"usuario_id" uuid NOT NULL,
	"rede" text NOT NULL,
	"em" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"erro" text,
	"negociacoes" integer DEFAULT 0 NOT NULL,
	"simbolos" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "carteira_sincronizacoes_pk" PRIMARY KEY("usuario_id","rede"),
	CONSTRAINT "carteira_sincronizacoes_rede" CHECK ("carteira_sincronizacoes"."rede" in ('testnet', 'real'))
);
--> statement-breakpoint
ALTER TABLE "carteira_negociacoes" ADD CONSTRAINT "carteira_negociacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "carteira_saldos" ADD CONSTRAINT "carteira_saldos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "carteira_sincronizacoes" ADD CONSTRAINT "carteira_sincronizacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "carteira_negociacoes_base" ON "carteira_negociacoes" USING btree ("usuario_id","rede","base");
--> statement-breakpoint
CREATE INDEX "carteira_negociacoes_cotacao" ON "carteira_negociacoes" USING btree ("usuario_id","rede","cotacao");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON carteira_negociacoes, carteira_saldos, carteira_sincronizacoes TO zentrade_app;
--> statement-breakpoint
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['carteira_negociacoes', 'carteira_saldos', 'carteira_sincronizacoes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO zentrade_app USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id())',
      tabela || '_por_usuario', tabela);
  END LOOP;
END
$$;
