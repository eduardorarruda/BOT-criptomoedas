-- Servidor, login e senha da conta demo do MetaTrader 5 (dados do mini índice), cifrados em
-- envelope como as chaves da Binance. Uma por pessoa. Espelha src/esquema/mt5.ts (drizzle-kit);
-- o GRANT e o RLS são manuais, como nas demais tabelas da pessoa.
CREATE TABLE "credenciais_mt5" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"servidor_cifrado" text NOT NULL,
	"login_cifrado" text NOT NULL,
	"senha_cifrada" text NOT NULL,
	"login_final" text NOT NULL,
	"simbolo_continuo" text,
	"fuso_servidor" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"validada_em" timestamp with time zone,
	"ultimo_erro" text
);
--> statement-breakpoint
ALTER TABLE "credenciais_mt5" ADD CONSTRAINT "credenciais_mt5_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON credenciais_mt5 TO zentrade_app;
--> statement-breakpoint
ALTER TABLE credenciais_mt5 ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY credenciais_mt5_por_usuario ON credenciais_mt5 FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
