-- Placar do Claude: o desfecho de cada decisão de entrada que passou pelo agente
-- (aprovou ou vetou), real ou contrafactual. Espelha src/esquema/placar.ts (gerado pelo
-- drizzle-kit); o fim (índice das candidatas, GRANT e RLS) é manual. O motor grava com
-- acesso de sistema; a aplicação (zentrade_app) só lê as linhas de app.usuario_id.
CREATE TABLE "avaliacoes_decisao" (
	"decisao_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"claude" text NOT NULL,
	"confianca" numeric(38, 18) NOT NULL,
	"fonte" text NOT NULL,
	"situacao" text NOT NULL,
	"motivo" text,
	"quantidade" numeric(38, 18),
	"preco_entrada" numeric(38, 18),
	"preco_saida" numeric(38, 18),
	"resultado" numeric(38, 18),
	"retorno" numeric(38, 18),
	"barras" integer DEFAULT 0 NOT NULL,
	"moeda" text NOT NULL,
	"avaliada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avaliacoes_decisao_claude" CHECK ("avaliacoes_decisao"."claude" in ('aprovou', 'vetou')),
	CONSTRAINT "avaliacoes_decisao_fonte" CHECK ("avaliacoes_decisao"."fonte" in ('real', 'contrafactual')),
	CONSTRAINT "avaliacoes_decisao_situacao" CHECK ("avaliacoes_decisao"."situacao" in ('concluida', 'pendente')),
	CONSTRAINT "avaliacoes_decisao_motivo" CHECK ("avaliacoes_decisao"."motivo" is null or "avaliacoes_decisao"."motivo" in ('stop', 'alvo', 'regra', 'tempo', 'zeragem', 'horizonte')),
	CONSTRAINT "avaliacoes_decisao_confianca" CHECK ("avaliacoes_decisao"."confianca" between 0 and 1),
	CONSTRAINT "avaliacoes_decisao_concluida" CHECK ("avaliacoes_decisao"."situacao" = 'pendente' or ("avaliacoes_decisao"."resultado" is not null and "avaliacoes_decisao"."retorno" is not null))
);
--> statement-breakpoint
ALTER TABLE "avaliacoes_decisao" ADD CONSTRAINT "avaliacoes_decisao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes_decisao" ADD CONSTRAINT "avaliacoes_decisao_decisao_fk" FOREIGN KEY ("decisao_id","usuario_id") REFERENCES "public"."decisoes"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avaliacoes_decisao_usuario" ON "avaliacoes_decisao" USING btree ("usuario_id","avaliada_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "avaliacoes_decisao_pendentes" ON "avaliacoes_decisao" USING btree ("decisao_id") WHERE "avaliacoes_decisao"."situacao" = 'pendente';
--> statement-breakpoint
-- As candidatas do avaliador: entradas com proposta do agente, das mais novas às mais velhas.
CREATE INDEX decisoes_placar ON decisoes (em DESC) WHERE proposta IS NOT NULL AND sinal->>'acao' = 'COMPRAR';
--> statement-breakpoint
GRANT SELECT ON avaliacoes_decisao TO zentrade_app;
--> statement-breakpoint
ALTER TABLE avaliacoes_decisao ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY avaliacoes_decisao_por_usuario ON avaliacoes_decisao FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
