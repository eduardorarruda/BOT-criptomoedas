CREATE TABLE "replay_analises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execucao" text NOT NULL,
	"simbolo" text NOT NULL,
	"sinal_em" timestamp with time zone NOT NULL,
	"preco" numeric(38, 18) NOT NULL,
	"sinal" jsonb NOT NULL,
	"proposta" jsonb NOT NULL,
	"veredito" text NOT NULL,
	"custo_ia_usd" numeric(38, 18) NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replay_analises_sinal" UNIQUE("execucao","simbolo","sinal_em"),
	CONSTRAINT "replay_analises_veredito" CHECK ("replay_analises"."veredito" in ('aprovou', 'vetou')),
	CONSTRAINT "replay_analises_custo" CHECK ("replay_analises"."custo_ia_usd" >= 0)
);
--> statement-breakpoint
CREATE INDEX "replay_analises_execucao" ON "replay_analises" USING btree ("execucao","sinal_em");