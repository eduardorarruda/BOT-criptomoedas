CREATE TABLE "auditoria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" uuid,
	"sequencia" integer DEFAULT 0 NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"acao" text NOT NULL,
	"alvo" text,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hash_anterior" text DEFAULT '' NOT NULL,
	"hash" text DEFAULT '' NOT NULL,
	CONSTRAINT "auditoria_sequencia_unica" UNIQUE NULLS NOT DISTINCT("usuario_id","sequencia")
);
--> statement-breakpoint
CREATE TABLE "configuracao_global" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"parada_total" boolean DEFAULT false NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_corretora" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"corretora" text NOT NULL,
	"rede" text NOT NULL,
	"api_key_cifrada" text NOT NULL,
	"api_secret_cifrado" text NOT NULL,
	"api_key_final" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_corretora_unica" UNIQUE("usuario_id","corretora","rede"),
	CONSTRAINT "contas_corretora_corretora" CHECK ("contas_corretora"."corretora" in ('binance')),
	CONSTRAINT "contas_corretora_rede" CHECK ("contas_corretora"."rede" in ('testnet', 'real'))
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"csrf" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"reautenticada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"hash" text NOT NULL,
	"escopo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone,
	CONSTRAINT "tokens_api_hash_unico" UNIQUE("hash"),
	CONSTRAINT "tokens_api_escopo" CHECK ("tokens_api"."escopo" in ('leitura', 'operar'))
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"senha_hash" text NOT NULL,
	"segredo_2fa" text,
	"dois_fatores" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unico" UNIQUE("email"),
	CONSTRAINT "usuarios_email_minusculo" CHECK ("usuarios"."email" = lower("usuarios"."email"))
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"fonte" text NOT NULL,
	"titulo" text NOT NULL,
	"url" text,
	"publicado_em" timestamp with time zone NOT NULL,
	"hash_conteudo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_usuario_hash" UNIQUE("usuario_id","hash_conteudo"),
	CONSTRAINT "documentos_id_usuario" UNIQUE("id","usuario_id"),
	CONSTRAINT "documentos_fonte" CHECK (fonte in ('diario', 'noticia', 'regra_corretora', 'estrategia', 'nota'))
);
--> statement-breakpoint
CREATE TABLE "trechos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"texto" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"busca" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', texto)) STORED,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"simbolo" text NOT NULL,
	"intervalo" text NOT NULL,
	"abertura" timestamp with time zone NOT NULL,
	"fechamento" timestamp with time zone NOT NULL,
	"abre" numeric(38, 18) NOT NULL,
	"maxima" numeric(38, 18) NOT NULL,
	"minima" numeric(38, 18) NOT NULL,
	"fecha" numeric(38, 18) NOT NULL,
	"volume" numeric(38, 18) NOT NULL,
	CONSTRAINT "candles_pk" PRIMARY KEY("simbolo","intervalo","abertura")
);
--> statement-breakpoint
CREATE TABLE "backtests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"estrategia_id" uuid NOT NULL,
	"estrategia_versao" integer NOT NULL,
	"simbolo" text NOT NULL,
	"intervalo" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'na_fila' NOT NULL,
	"metricas" jsonb,
	"curva" jsonb,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone,
	CONSTRAINT "backtests_estado" CHECK ("backtests"."estado" in ('na_fila', 'rodando', 'concluido', 'falhou')),
	CONSTRAINT "backtests_periodo" CHECK ("backtests"."fim" > "backtests"."inicio")
);
--> statement-breakpoint
CREATE TABLE "decisoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"robo_id" uuid NOT NULL,
	"em" timestamp with time zone NOT NULL,
	"sinal" jsonb NOT NULL,
	"proposta" jsonb,
	"quantidade" numeric(38, 18),
	"preco" numeric(38, 18) NOT NULL,
	"risco" jsonb NOT NULL,
	"estado" text NOT NULL,
	"custo_ia_usd" numeric(38, 18),
	"expira_em" timestamp with time zone,
	"decidida_por" text,
	"resultado" numeric(38, 18),
	"avaliada_em" timestamp with time zone,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisoes_id_usuario" UNIQUE("id","usuario_id"),
	CONSTRAINT "decisoes_estado" CHECK (estado in ('registrada', 'barrada', 'aguardando_aprovacao', 'aprovada', 'recusada', 'expirada', 'executada', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "estrategia_versoes" (
	"estrategia_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"regra" jsonb NOT NULL,
	"stop" numeric(38, 18) NOT NULL,
	"alvo_liquido" numeric(38, 18) NOT NULL,
	"taxa" numeric(38, 18) NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrategia_versoes_pk" PRIMARY KEY("estrategia_id","versao"),
	CONSTRAINT "estrategia_versoes_id_usuario" UNIQUE("estrategia_id","versao","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "estrategias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"versao_atual" integer DEFAULT 1 NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrategias_id_usuario" UNIQUE("id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "execucoes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "execucoes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" uuid NOT NULL,
	"ordem_id" uuid NOT NULL,
	"sequencia" integer NOT NULL,
	"preco" numeric(38, 18) NOT NULL,
	"quantidade" numeric(38, 18) NOT NULL,
	"taxa_cotacao" numeric(38, 18) NOT NULL,
	"em" timestamp with time zone NOT NULL,
	CONSTRAINT "execucoes_ordem_sequencia" UNIQUE("ordem_id","sequencia"),
	CONSTRAINT "execucoes_quantidade_positiva" CHECK ("execucoes"."quantidade" > 0)
);
--> statement-breakpoint
CREATE TABLE "ordens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"robo_id" uuid NOT NULL,
	"decisao_id" uuid NOT NULL,
	"id_cliente" text NOT NULL,
	"id_corretora" text,
	"simbolo" text NOT NULL,
	"lado" text NOT NULL,
	"quantidade" numeric(38, 18) NOT NULL,
	"estado" text DEFAULT 'PENDENTE' NOT NULL,
	"motivo" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ordens_id_usuario" UNIQUE("id","usuario_id"),
	CONSTRAINT "ordens_id_cliente_unico" UNIQUE("id_cliente"),
	CONSTRAINT "ordens_lado" CHECK ("ordens"."lado" in ('COMPRA', 'VENDA')),
	CONSTRAINT "ordens_estado" CHECK ("ordens"."estado" in ('PENDENTE', 'PARCIAL', 'PREENCHIDA', 'REJEITADA', 'CANCELADA'))
);
--> statement-breakpoint
CREATE TABLE "robos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"simbolo" text NOT NULL,
	"intervalo" text NOT NULL,
	"modo" text DEFAULT 'observar' NOT NULL,
	"rede" text NOT NULL,
	"estrategia_id" uuid NOT NULL,
	"estrategia_versao" integer NOT NULL,
	"perda_diaria_maxima" numeric(38, 18) NOT NULL,
	"exposicao_maxima" numeric(38, 18) NOT NULL,
	"risco_por_operacao" numeric(38, 18) NOT NULL,
	"ordens_por_hora_max" integer NOT NULL,
	"pausa_apos_perda_min" integer NOT NULL,
	"confianca_minima" numeric(38, 18) NOT NULL,
	"pausado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "robos_id_usuario" UNIQUE("id","usuario_id"),
	CONSTRAINT "robos_intervalo" CHECK ("robos"."intervalo" in ('1m', '5m', '15m', '1h', '4h', '1d')),
	CONSTRAINT "robos_modo" CHECK ("robos"."modo" in ('observar', 'sugerir', 'auto')),
	CONSTRAINT "robos_rede" CHECK ("robos"."rede" in ('papel', 'testnet', 'real'))
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracao_global" ADD CONSTRAINT "configuracao_global_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_corretora" ADD CONSTRAINT "contas_corretora_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_api" ADD CONSTRAINT "tokens_api_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trechos" ADD CONSTRAINT "trechos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trechos" ADD CONSTRAINT "trechos_documento_fk" FOREIGN KEY ("documento_id","usuario_id") REFERENCES "public"."documentos"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtests" ADD CONSTRAINT "backtests_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtests" ADD CONSTRAINT "backtests_estrategia_versao_fk" FOREIGN KEY ("estrategia_id","estrategia_versao","usuario_id") REFERENCES "public"."estrategia_versoes"("estrategia_id","versao","usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisoes" ADD CONSTRAINT "decisoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisoes" ADD CONSTRAINT "decisoes_robo_fk" FOREIGN KEY ("robo_id","usuario_id") REFERENCES "public"."robos"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estrategia_versoes" ADD CONSTRAINT "estrategia_versoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estrategia_versoes" ADD CONSTRAINT "estrategia_versoes_estrategia_fk" FOREIGN KEY ("estrategia_id","usuario_id") REFERENCES "public"."estrategias"("id","usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estrategias" ADD CONSTRAINT "estrategias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucoes" ADD CONSTRAINT "execucoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucoes" ADD CONSTRAINT "execucoes_ordem_fk" FOREIGN KEY ("ordem_id","usuario_id") REFERENCES "public"."ordens"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens" ADD CONSTRAINT "ordens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens" ADD CONSTRAINT "ordens_robo_fk" FOREIGN KEY ("robo_id","usuario_id") REFERENCES "public"."robos"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens" ADD CONSTRAINT "ordens_decisao_fk" FOREIGN KEY ("decisao_id","usuario_id") REFERENCES "public"."decisoes"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robos" ADD CONSTRAINT "robos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robos" ADD CONSTRAINT "robos_estrategia_versao_fk" FOREIGN KEY ("estrategia_id","estrategia_versao","usuario_id") REFERENCES "public"."estrategia_versoes"("estrategia_id","versao","usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessoes_usuario" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tokens_api_usuario" ON "tokens_api" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "trechos_usuario_documento" ON "trechos" USING btree ("usuario_id","documento_id");--> statement-breakpoint
CREATE INDEX "backtests_usuario" ON "backtests" USING btree ("usuario_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "decisoes_usuario_em" ON "decisoes" USING btree ("usuario_id","em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "decisoes_robo_em" ON "decisoes" USING btree ("robo_id","em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ordens_robo_criada" ON "ordens" USING btree ("robo_id","criada_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "robos_usuario" ON "robos" USING btree ("usuario_id");