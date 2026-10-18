-- Upload dos .zip "Negócio a negócio" baixados à mão no BDI da B3 (o sistema nunca
-- baixa nada de arquivos.b3.com.br: a B3 proíbe coleta automatizada das páginas do
-- BDI). A API grava a linha ao receber o arquivo e enfileira; o motor processa
-- (reusa apps/motor/src/dados-b3) e grava o resumo ou o erro aqui. "caminho" é do
-- arquivo temporário (apagado ao terminar); usuario_id é de quem enviou (RLS), mas o
-- dado gravado nos candles é de mercado, igual para todos. Espelha
-- src/esquema/mercado.ts (gerado pelo drizzle-kit); o CHECK, o GRANT e o RLS são
-- manuais, como nas demais tabelas da pessoa.
CREATE TABLE "importacoes_b3" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome_arquivo" text NOT NULL,
	"caminho" text NOT NULL,
	"estado" text DEFAULT 'na_fila' NOT NULL,
	"resumo" jsonb,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone,
	CONSTRAINT "importacoes_b3_estado" CHECK ("importacoes_b3"."estado" in ('na_fila', 'lendo', 'concluida', 'falhou'))
);
--> statement-breakpoint
ALTER TABLE "importacoes_b3" ADD CONSTRAINT "importacoes_b3_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "importacoes_b3_usuario" ON "importacoes_b3" USING btree ("usuario_id","criado_em");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON importacoes_b3 TO zentrade_app;
--> statement-breakpoint
ALTER TABLE importacoes_b3 ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY importacoes_b3_por_usuario ON importacoes_b3 FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());