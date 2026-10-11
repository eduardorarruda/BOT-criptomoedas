-- Migração manual (sem snapshot do drizzle-kit): renda fixa, Pluggy e o cache dos
-- índices do Banco Central. Espelha src/esquema/renda-fixa.ts.
CREATE TABLE "indicadores" (
	"serie" text NOT NULL,
	"dia" date NOT NULL,
	"valor" numeric(38, 18) NOT NULL,
	"dia_fim" date,
	CONSTRAINT "indicadores_pk" PRIMARY KEY("serie","dia"),
	CONSTRAINT "indicadores_serie" CHECK ("indicadores"."serie" in ('CDI', 'SELIC', 'SELIC_META', 'IPCA', 'POUPANCA', 'TR'))
);
--> statement-breakpoint
CREATE TABLE "indicadores_atualizacao" (
	"serie" text PRIMARY KEY NOT NULL,
	"verificado_em" timestamp with time zone NOT NULL,
	"ultimo_dia" date,
	"erro" text
);
--> statement-breakpoint
CREATE TABLE "pluggy_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"instituicao" text NOT NULL,
	"conector_id" integer,
	"logo_url" text,
	"situacao" text NOT NULL,
	"erro" text,
	"atualizado_no_banco" timestamp with time zone,
	"consentimento_expira" timestamp with time zone,
	"ultima_sincronizacao" timestamp with time zone,
	"erro_sincronizacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pluggy_itens_id_usuario" UNIQUE("id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "titulos_renda_fixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"item_id" text,
	"externo_id" text,
	"grupo" text,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"emissor" text,
	"emissor_cnpj" text,
	"indexador" text NOT NULL,
	"percentual_indexador" numeric(38, 18),
	"taxa_anual" numeric(38, 18),
	"data_aplicacao" date NOT NULL,
	"vencimento" date,
	"carencia_ate" date,
	"valor_aplicado" numeric(38, 18) NOT NULL,
	"liquidez" text NOT NULL,
	"informado_em" date,
	"bruto_informado" numeric(38, 18),
	"liquido_informado" numeric(38, 18),
	"ir_informado" numeric(38, 18),
	"iof_informado" numeric(38, 18),
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titulos_renda_fixa_externo" UNIQUE("usuario_id","externo_id"),
	CONSTRAINT "titulos_renda_fixa_origem" CHECK ("titulos_renda_fixa"."origem" in ('manual', 'pluggy')),
	CONSTRAINT "titulos_renda_fixa_tipo" CHECK ("titulos_renda_fixa"."tipo" in ('CDB', 'LC', 'LCI', 'LCA', 'CRI', 'CRA', 'DEBENTURE', 'DEBENTURE_INCENTIVADA', 'TESOURO_SELIC', 'TESOURO_PREFIXADO', 'TESOURO_IPCA', 'POUPANCA', 'CAIXINHA', 'OUTRO')),
	CONSTRAINT "titulos_renda_fixa_indexador" CHECK ("titulos_renda_fixa"."indexador" in ('CDI', 'SELIC', 'IPCA', 'PREFIXADO', 'POUPANCA')),
	CONSTRAINT "titulos_renda_fixa_liquidez" CHECK ("titulos_renda_fixa"."liquidez" in ('diaria', 'vencimento', 'carencia')),
	CONSTRAINT "titulos_renda_fixa_situacao" CHECK ("titulos_renda_fixa"."situacao" in ('ativo', 'encerrado')),
	CONSTRAINT "titulos_renda_fixa_valor" CHECK ("titulos_renda_fixa"."valor_aplicado" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pluggy_itens" ADD CONSTRAINT "pluggy_itens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "titulos_renda_fixa" ADD CONSTRAINT "titulos_renda_fixa_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "titulos_renda_fixa" ADD CONSTRAINT "titulos_renda_fixa_item_fk" FOREIGN KEY ("item_id","usuario_id") REFERENCES "public"."pluggy_itens"("id","usuario_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pluggy_itens_usuario" ON "pluggy_itens" USING btree ("usuario_id");
--> statement-breakpoint
CREATE INDEX "titulos_renda_fixa_usuario" ON "titulos_renda_fixa" USING btree ("usuario_id","situacao");
--> statement-breakpoint
-- Índices do BCB: a API (papel zentrade_app) só lê; quem grava é o atualizador, com a conexão de sistema.
GRANT SELECT ON indicadores, indicadores_atualizacao TO zentrade_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pluggy_itens, titulos_renda_fixa TO zentrade_app;
--> statement-breakpoint
ALTER TABLE pluggy_itens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pluggy_itens_por_usuario ON pluggy_itens FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
--> statement-breakpoint
ALTER TABLE titulos_renda_fixa ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY titulos_renda_fixa_por_usuario ON titulos_renda_fixa FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
