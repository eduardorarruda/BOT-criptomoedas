-- Base de conhecimento sem provedor de embeddings (EMBEDDINGS_PROVEDOR=nenhum) e busca
-- por palavras melhor em português. Espelha src/esquema/conhecimento.ts.
-- 1) trechos.embedding aceita NULL: a ingestão grava o texto sem vetor e o comando
--    reindexar-conhecimento calcula os vetores depois (índice parcial para achar os que faltam);
-- 2) zentrade_pt: português sem acento (unaccent + radical), para "acoes" achar "ações";
-- 3) trechos.busca e o novo documentos.busca (título) guardam as duas leituras: 'portuguese'
--    (junta operação/operações) e zentrade_pt (ignora acento).
-- RLS e permissões de trechos e documentos não mudam (policies por usuario_id da 0002).
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'zentrade_pt') THEN
    CREATE TEXT SEARCH CONFIGURATION zentrade_pt (COPY = portuguese);
    ALTER TEXT SEARCH CONFIGURATION zentrade_pt
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "trechos" ALTER COLUMN "embedding" DROP NOT NULL;--> statement-breakpoint
-- Apagar a coluna leva junto o índice trechos_busca_gin; ele é recriado abaixo.
ALTER TABLE "trechos" drop column "busca";--> statement-breakpoint
ALTER TABLE "trechos" ADD COLUMN "busca" "tsvector" GENERATED ALWAYS AS (to_tsvector('portuguese', texto) || to_tsvector('zentrade_pt', texto)) STORED;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "busca" "tsvector" GENERATED ALWAYS AS (to_tsvector('portuguese', titulo) || to_tsvector('zentrade_pt', titulo)) STORED;--> statement-breakpoint
CREATE INDEX trechos_busca_gin ON trechos USING gin (busca);
--> statement-breakpoint
CREATE INDEX documentos_busca_gin ON documentos USING gin (busca);
--> statement-breakpoint
CREATE INDEX trechos_sem_vetor ON trechos (usuario_id, id) WHERE embedding IS NULL;
