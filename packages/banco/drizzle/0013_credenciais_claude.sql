-- O Claude da própria pessoa: o token do `claude setup-token`, cifrado em envelope
-- (AES-256-GCM, ZENTRADE_CHAVE_MESTRA) como as chaves da corretora. Um por pessoa.
-- Espelha src/esquema/assistente.ts (gerado pelo drizzle-kit); o fim (GRANT e RLS) é
-- manual, como nas demais tabelas da pessoa: zentrade_app só vê a linha de app.usuario_id.
CREATE TABLE "credenciais_claude" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"token_cifrado" text NOT NULL,
	"token_final" text NOT NULL,
	"origem" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"validada_em" timestamp with time zone,
	"ultimo_erro" text,
	CONSTRAINT "credenciais_claude_origem" CHECK (origem in ('conexao', 'colado'))
);
--> statement-breakpoint
ALTER TABLE "credenciais_claude" ADD CONSTRAINT "credenciais_claude_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON credenciais_claude TO zentrade_app;
--> statement-breakpoint
ALTER TABLE credenciais_claude ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY credenciais_claude_por_usuario ON credenciais_claude FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
