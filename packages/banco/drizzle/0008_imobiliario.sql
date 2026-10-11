-- Migração manual (sem snapshot do drizzle-kit): investimentos imobiliários por pessoa.
-- Espelha src/esquema/imobiliario.ts. Dinheiro e frações em NUMERIC(38,18); datas de
-- calendário em DATE. RLS por usuario_id, como nas demais tabelas da pessoa.
CREATE TABLE "investimentos_imobiliarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"moeda" text DEFAULT 'BRL' NOT NULL,
	"nome" text NOT NULL,
	"ticker" text,
	"observacoes" text,
	"valor_atual" numeric(38, 18),
	"valor_atual_em" date,
	"cambio_atual" numeric(38, 18),
	"valorizacao_anual" numeric(38, 18),
	"aluguel_previsto" numeric(38, 18),
	"taxa_administracao" numeric(38, 18),
	"diaria" numeric(38, 18),
	"ocupacao" numeric(38, 18),
	"taxa_plataforma" numeric(38, 18),
	"preco_venda_alvo" numeric(38, 18),
	"prazo_meses" integer,
	"data_entrega" date,
	"valor_carta" numeric(38, 18),
	"fundo_reserva" numeric(38, 18),
	"contemplado_em" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investimentos_imobiliarios_id_usuario" UNIQUE("id","usuario_id"),
	CONSTRAINT "investimentos_imobiliarios_tipo" CHECK ("investimentos_imobiliarios"."tipo" in ('aluguel', 'temporada', 'flip', 'terreno', 'planta', 'fii', 'reit', 'crowdfunding', 'consorcio')),
	CONSTRAINT "investimentos_imobiliarios_moeda" CHECK ("investimentos_imobiliarios"."moeda" in ('BRL', 'USD')),
	CONSTRAINT "investimentos_imobiliarios_valor_atual" CHECK ("investimentos_imobiliarios"."valor_atual" >= 0)
);
--> statement-breakpoint
CREATE TABLE "financiamentos_imobiliarios" (
	"investimento_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"sistema" text NOT NULL,
	"valor_financiado" numeric(38, 18) NOT NULL,
	"taxa_anual" numeric(38, 18) NOT NULL,
	"prazo_meses" integer NOT NULL,
	"primeira_parcela" date NOT NULL,
	"seguro_taxa_mensal_saldo" numeric(38, 18),
	"seguro_fixo_mensal" numeric(38, 18),
	"taxa_administracao_mensal" numeric(38, 18),
	"custos_iniciais" numeric(38, 18),
	CONSTRAINT "financiamentos_imobiliarios_sistema" CHECK ("financiamentos_imobiliarios"."sistema" in ('SAC', 'PRICE')),
	CONSTRAINT "financiamentos_imobiliarios_valor" CHECK ("financiamentos_imobiliarios"."valor_financiado" > 0),
	CONSTRAINT "financiamentos_imobiliarios_prazo" CHECK ("financiamentos_imobiliarios"."prazo_meses" between 1 and 600)
);
--> statement-breakpoint
CREATE TABLE "lancamentos_imobiliarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"investimento_id" uuid NOT NULL,
	"data" date NOT NULL,
	"tipo" text NOT NULL,
	"categoria" text NOT NULL,
	"valor" numeric(38, 18) NOT NULL,
	"quantidade" numeric(38, 18),
	"cambio" numeric(38, 18),
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamentos_imobiliarios_tipo" CHECK ("lancamentos_imobiliarios"."tipo" in ('aporte', 'receita', 'despesa', 'resgate', 'imposto')),
	CONSTRAINT "lancamentos_imobiliarios_valor" CHECK ("lancamentos_imobiliarios"."valor" > 0),
	CONSTRAINT "lancamentos_imobiliarios_quantidade" CHECK ("lancamentos_imobiliarios"."quantidade" > 0),
	CONSTRAINT "lancamentos_imobiliarios_cambio" CHECK ("lancamentos_imobiliarios"."cambio" > 0)
);
--> statement-breakpoint
ALTER TABLE "investimentos_imobiliarios" ADD CONSTRAINT "investimentos_imobiliarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financiamentos_imobiliarios" ADD CONSTRAINT "financiamentos_imobiliarios_investimento_fk" FOREIGN KEY ("investimento_id","usuario_id") REFERENCES "public"."investimentos_imobiliarios"("id","usuario_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lancamentos_imobiliarios" ADD CONSTRAINT "lancamentos_imobiliarios_investimento_fk" FOREIGN KEY ("investimento_id","usuario_id") REFERENCES "public"."investimentos_imobiliarios"("id","usuario_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "investimentos_imobiliarios_usuario" ON "investimentos_imobiliarios" USING btree ("usuario_id","criado_em");
--> statement-breakpoint
CREATE INDEX "lancamentos_imobiliarios_investimento_data" ON "lancamentos_imobiliarios" USING btree ("investimento_id","data");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON investimentos_imobiliarios, financiamentos_imobiliarios,
  lancamentos_imobiliarios TO zentrade_app;
--> statement-breakpoint
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['investimentos_imobiliarios', 'financiamentos_imobiliarios', 'lancamentos_imobiliarios']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO zentrade_app USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id())',
      tabela || '_por_usuario', tabela);
  END LOOP;
END
$$;
