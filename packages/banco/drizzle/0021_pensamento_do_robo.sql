CREATE TABLE "pensamentos_atuais" (
	"robo_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"em" timestamp with time zone NOT NULL,
	"cenario" text NOT NULL,
	"sinal" text NOT NULL,
	"pensamento" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pensamentos_atuais_cenario" CHECK ("pensamentos_atuais"."cenario" in ('alta', 'queda', 'lateral', 'indefinido'))
);
--> statement-breakpoint
CREATE TABLE "pensamentos_historico" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pensamentos_historico_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" uuid NOT NULL,
	"robo_id" uuid NOT NULL,
	"em" timestamp with time zone NOT NULL,
	"cenario" text NOT NULL,
	"sinal" text NOT NULL,
	"motivo" text NOT NULL,
	"pensamento" jsonb NOT NULL,
	CONSTRAINT "pensamentos_historico_cenario" CHECK ("pensamentos_historico"."cenario" in ('alta', 'queda', 'lateral', 'indefinido')),
	CONSTRAINT "pensamentos_historico_motivo" CHECK ("pensamentos_historico"."motivo" in ('inicio', 'cenario', 'sinal'))
);
--> statement-breakpoint
ALTER TABLE "pensamentos_atuais" ADD CONSTRAINT "pensamentos_atuais_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensamentos_atuais" ADD CONSTRAINT "pensamentos_atuais_robo_fk" FOREIGN KEY ("robo_id","usuario_id") REFERENCES "public"."robos"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensamentos_historico" ADD CONSTRAINT "pensamentos_historico_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensamentos_historico" ADD CONSTRAINT "pensamentos_historico_robo_fk" FOREIGN KEY ("robo_id","usuario_id") REFERENCES "public"."robos"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pensamentos_historico_robo_em" ON "pensamentos_historico" USING btree ("robo_id","em" DESC NULLS LAST);
--> statement-breakpoint
-- Espelha src/esquema/pensamento.ts (gerado pelo drizzle-kit); o fim (GRANT e RLS) é manual.
-- O motor grava com acesso de sistema; a aplicação (zentrade_app) só lê as linhas de app.usuario_id.
GRANT SELECT ON pensamentos_atuais, pensamentos_historico TO zentrade_app;
--> statement-breakpoint
ALTER TABLE pensamentos_atuais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pensamentos_atuais_por_usuario ON pensamentos_atuais FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
--> statement-breakpoint
ALTER TABLE pensamentos_historico ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pensamentos_historico_por_usuario ON pensamentos_historico FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
