-- Proteções que o motor deixa no livro da corretora (stop-limit ou OCO) para a posição
-- aberta de cada robô. Espelha src/esquema/operacao.ts. O índice parcial garante no
-- máximo uma viva (PENDENTE ou ATIVA) por robô. RLS por usuario_id, como nas demais
-- tabelas da pessoa; quem escreve é o motor (acesso de sistema), então a aplicação só lê.
CREATE TABLE "protecoes_corretora" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"robo_id" uuid NOT NULL,
	"decisao_id" uuid NOT NULL,
	"simbolo" text NOT NULL,
	"id_lista" text NOT NULL,
	"id_stop" text NOT NULL,
	"id_alvo" text,
	"id_corretora" text,
	"quantidade" numeric(38, 18) NOT NULL,
	"stop" numeric(38, 18) NOT NULL,
	"limite" numeric(38, 18) NOT NULL,
	"alvo" numeric(38, 18),
	"estado" text DEFAULT 'PENDENTE' NOT NULL,
	"motivo" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protecoes_corretora_id_lista" UNIQUE("id_lista"),
	CONSTRAINT "protecoes_corretora_estado" CHECK ("protecoes_corretora"."estado" in ('PENDENTE', 'ATIVA', 'EXECUTADA', 'CANCELADA', 'REJEITADA')),
	CONSTRAINT "protecoes_corretora_quantidade" CHECK ("protecoes_corretora"."quantidade" > 0),
	CONSTRAINT "protecoes_corretora_limite" CHECK ("protecoes_corretora"."limite" <= "protecoes_corretora"."stop"),
	CONSTRAINT "protecoes_corretora_alvo" CHECK (("protecoes_corretora"."alvo" is null) = ("protecoes_corretora"."id_alvo" is null))
);
--> statement-breakpoint
ALTER TABLE "protecoes_corretora" ADD CONSTRAINT "protecoes_corretora_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protecoes_corretora" ADD CONSTRAINT "protecoes_corretora_robo_fk" FOREIGN KEY ("robo_id","usuario_id") REFERENCES "public"."robos"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protecoes_corretora" ADD CONSTRAINT "protecoes_corretora_decisao_fk" FOREIGN KEY ("decisao_id","usuario_id") REFERENCES "public"."decisoes"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "protecoes_corretora_viva" ON "protecoes_corretora" USING btree ("robo_id") WHERE "protecoes_corretora"."estado" in ('PENDENTE', 'ATIVA');--> statement-breakpoint
CREATE INDEX "protecoes_corretora_robo_criada" ON "protecoes_corretora" USING btree ("robo_id","criada_em" DESC NULLS LAST);--> statement-breakpoint
GRANT SELECT ON protecoes_corretora TO zentrade_app;
--> statement-breakpoint
ALTER TABLE protecoes_corretora ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY protecoes_corretora_por_usuario ON protecoes_corretora FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
