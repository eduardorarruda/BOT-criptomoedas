-- Agenda de eventos de mercado (Copom, payroll, eleição…) e o filtro opcional de dia de evento
-- por robô (robos.dias_de_evento, padrão 'ignorar'). Espelha src/esquema/eventos-mercado.ts
-- (gerado pelo drizzle-kit); o GRANT e o RLS no fim são manuais, como nas demais tabelas da pessoa.
CREATE TABLE "eventos_mercado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"data" date NOT NULL,
	"mercado" text NOT NULL,
	"titulo" text NOT NULL,
	"impacto" text NOT NULL,
	"origem" text DEFAULT 'manual' NOT NULL,
	"de" text,
	"ate" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_mercado_unico" UNIQUE("usuario_id","data","mercado","titulo"),
	CONSTRAINT "eventos_mercado_mercado" CHECK ("eventos_mercado"."mercado" in ('win', 'cripto', 'todos')),
	CONSTRAINT "eventos_mercado_impacto" CHECK ("eventos_mercado"."impacto" in ('alto', 'medio')),
	CONSTRAINT "eventos_mercado_origem" CHECK ("eventos_mercado"."origem" in ('manual', 'sugerido')),
	CONSTRAINT "eventos_mercado_titulo" CHECK (char_length(btrim("eventos_mercado"."titulo")) between 1 and 120),
	CONSTRAINT "eventos_mercado_janela" CHECK (("eventos_mercado"."de" is null and "eventos_mercado"."ate" is null) or ("eventos_mercado"."de" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "eventos_mercado"."ate" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "eventos_mercado"."de" <= "eventos_mercado"."ate"))
);
--> statement-breakpoint
ALTER TABLE "robos" ADD COLUMN "dias_de_evento" text DEFAULT 'ignorar' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos_mercado" ADD CONSTRAINT "eventos_mercado_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_mercado_usuario_data" ON "eventos_mercado" USING btree ("usuario_id","data");--> statement-breakpoint
ALTER TABLE "robos" ADD CONSTRAINT "robos_dias_de_evento" CHECK ("robos"."dias_de_evento" in ('ignorar', 'bloquear', 'reduzir'));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON eventos_mercado TO zentrade_app;
--> statement-breakpoint
ALTER TABLE eventos_mercado ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY eventos_mercado_por_usuario ON eventos_mercado FOR ALL TO zentrade_app
  USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
