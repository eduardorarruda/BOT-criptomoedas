-- Migração manual (escrita à mão, sem snapshot do drizzle-kit): assistente e conhecimento por arquivo.
-- 1) configuração do "cérebro" por pessoa (API da Anthropic ou Claude Code do plano dela);
-- 2) conversas e mensagens do assistente;
-- 3) origem dos documentos do RAG (arquivo, link, texto, automação);
-- 4) RLS por usuario_id em tudo, como nas outras tabelas da pessoa.

CREATE TABLE "assistente_config" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"provedor" text DEFAULT 'api' NOT NULL,
	"modelo" text,
	"conta_cli" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistente_config_provedor" CHECK (provedor in ('api', 'cli')),
	CONSTRAINT "assistente_config_usuario_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "assistente_conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistente_conversas_id_usuario" UNIQUE ("id", "usuario_id"),
	CONSTRAINT "assistente_conversas_usuario_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "assistente_conversas_usuario" ON "assistente_conversas" ("usuario_id", "atualizada_em");
--> statement-breakpoint
CREATE TABLE "assistente_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"texto" text NOT NULL,
	"fontes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ferramentas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"situacao" text DEFAULT 'ok' NOT NULL,
	"erro" text,
	"provedor" text,
	"modelo" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistente_mensagens_papel" CHECK (papel in ('usuario', 'assistente')),
	CONSTRAINT "assistente_mensagens_situacao" CHECK (situacao in ('ok', 'erro', 'interrompida')),
	CONSTRAINT "assistente_mensagens_usuario_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE cascade,
	-- usuario_id na chave: uma mensagem nunca cai na conversa de outra pessoa.
	CONSTRAINT "assistente_mensagens_conversa_fk" FOREIGN KEY ("conversa_id", "usuario_id")
		REFERENCES "assistente_conversas"("id", "usuario_id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "assistente_mensagens_conversa" ON "assistente_mensagens" ("conversa_id", "criada_em");
--> statement-breakpoint
CREATE TABLE "documentos_origem" (
	"documento_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"nome_arquivo" text,
	"tipo_arquivo" text,
	"bytes" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_origem_origem" CHECK (origem in ('texto', 'arquivo', 'link', 'automacao')),
	CONSTRAINT "documentos_origem_tipo" CHECK (tipo_arquivo is null or tipo_arquivo in ('pdf', 'docx', 'md', 'txt', 'html')),
	CONSTRAINT "documentos_origem_usuario_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE cascade,
	CONSTRAINT "documentos_origem_documento_fk" FOREIGN KEY ("documento_id", "usuario_id")
		REFERENCES "documentos"("id", "usuario_id") ON DELETE cascade
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON assistente_config, assistente_conversas, assistente_mensagens,
  documentos_origem TO zentrade_app;
--> statement-breakpoint
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['assistente_config', 'assistente_conversas', 'assistente_mensagens',
    'documentos_origem']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO zentrade_app USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id())',
      tabela || '_por_usuario', tabela);
  END LOOP;
END
$$;
