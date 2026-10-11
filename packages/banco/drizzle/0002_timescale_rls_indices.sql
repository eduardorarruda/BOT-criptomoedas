-- Migração manual: o que o drizzle-kit não gera.
-- 1) candles como hypertable (compressão, retenção e agregados contínuos de 5m e 1h a partir de 1m);
-- 2) índices de busca do RAG (hnsw e gin);
-- 3) imutabilidade das versões de estratégia e da auditoria; auditoria encadeada por hash;
-- 4) Row Level Security por usuario_id, lido do setting de sessão app.usuario_id.

SELECT create_hypertable('candles', by_range('abertura', INTERVAL '7 days'));
--> statement-breakpoint
ALTER TABLE candles SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'simbolo, intervalo',
  timescaledb.compress_orderby = 'abertura DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('candles', INTERVAL '30 days');
--> statement-breakpoint
-- Candles brutos ficam 3 anos; os agregados de 5m e 1h guardam o histórico mais longo.
SELECT add_retention_policy('candles', INTERVAL '3 years');
--> statement-breakpoint
CREATE MATERIALIZED VIEW candles_5m WITH (timescaledb.continuous) AS
SELECT simbolo,
       time_bucket(INTERVAL '5 minutes', abertura) AS abertura,
       first(abre, abertura) AS abre,
       max(maxima) AS maxima,
       min(minima) AS minima,
       last(fecha, abertura) AS fecha,
       sum(volume) AS volume
FROM candles
WHERE intervalo = '1m'
GROUP BY simbolo, time_bucket(INTERVAL '5 minutes', abertura)
WITH NO DATA;
--> statement-breakpoint
CREATE MATERIALIZED VIEW candles_1h WITH (timescaledb.continuous) AS
SELECT simbolo,
       time_bucket(INTERVAL '1 hour', abertura) AS abertura,
       first(abre, abertura) AS abre,
       max(maxima) AS maxima,
       min(minima) AS minima,
       last(fecha, abertura) AS fecha,
       sum(volume) AS volume
FROM candles
WHERE intervalo = '1m'
GROUP BY simbolo, time_bucket(INTERVAL '1 hour', abertura)
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('candles_5m',
  start_offset => INTERVAL '2 days', end_offset => INTERVAL '5 minutes', schedule_interval => INTERVAL '5 minutes');
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('candles_1h',
  start_offset => INTERVAL '7 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '30 minutes');
--> statement-breakpoint
CREATE INDEX trechos_embedding_hnsw ON trechos USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX trechos_busca_gin ON trechos USING gin (busca);
--> statement-breakpoint
CREATE INDEX decisoes_aguardando ON decisoes (expira_em) WHERE estado = 'aguardando_aprovacao';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION barrar_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a tabela % só aceita inclusão: registros gravados não mudam nem somem', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER estrategia_versoes_imutavel BEFORE UPDATE OR DELETE ON estrategia_versoes
  FOR EACH ROW EXECUTE FUNCTION barrar_alteracao();
--> statement-breakpoint
CREATE TRIGGER auditoria_imutavel BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION barrar_alteracao();
--> statement-breakpoint
-- O mesmo cálculo serve ao gatilho e à verificação da cadeia.
CREATE OR REPLACE FUNCTION auditoria_hash(anterior text, usuario uuid, em timestamptz, acao text, alvo text, detalhes jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|', anterior, coalesce(usuario::text, ''),
    (extract(epoch FROM em) * 1000)::bigint::text, acao, coalesce(alvo, ''), detalhes::text), 'UTF8')), 'hex')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION auditoria_encadear() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ultimo record;
BEGIN
  -- Uma cadeia por pessoa; a trava serializa inclusões concorrentes da mesma cadeia.
  PERFORM pg_advisory_xact_lock(hashtextextended('zentrade.auditoria:' || coalesce(NEW.usuario_id::text, 'sistema'), 0));
  SELECT a.sequencia, a.hash INTO ultimo FROM auditoria a
   WHERE a.usuario_id IS NOT DISTINCT FROM NEW.usuario_id
   ORDER BY a.sequencia DESC LIMIT 1;
  NEW.sequencia := coalesce(ultimo.sequencia, 0) + 1;
  NEW.hash_anterior := coalesce(ultimo.hash, repeat('0', 64));
  NEW.hash := auditoria_hash(NEW.hash_anterior, NEW.usuario_id, NEW.em, NEW.acao, NEW.alvo, NEW.detalhes);
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER auditoria_encadear BEFORE INSERT ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_encadear();
--> statement-breakpoint
-- Papel sem login usado pela API a cada requisição (SET LOCAL ROLE): sem BYPASSRLS,
-- então as policies abaixo valem mesmo quando a conexão é do dono das tabelas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentrade_app') THEN
    CREATE ROLE zentrade_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT zentrade_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO zentrade_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sessoes, tokens_api, contas_corretora, configuracao_global,
  estrategias, robos, decisoes, ordens, execucoes, backtests, documentos, trechos TO zentrade_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON estrategia_versoes, auditoria TO zentrade_app;
--> statement-breakpoint
GRANT SELECT, UPDATE (nome, senha_hash, segredo_2fa, dois_fatores) ON usuarios TO zentrade_app;
--> statement-breakpoint
GRANT SELECT ON candles, candles_5m, candles_1h TO zentrade_app;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO zentrade_app;
--> statement-breakpoint
-- NULLIF: depois de um SET LOCAL o setting volta como '' (não NULL), e ''::uuid quebraria.
CREATE OR REPLACE FUNCTION app_usuario_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.usuario_id', true), '')::uuid
$$;
--> statement-breakpoint
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY usuarios_proprio ON usuarios FOR ALL TO zentrade_app
  USING (id = app_usuario_id()) WITH CHECK (id = app_usuario_id());
--> statement-breakpoint
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['sessoes', 'tokens_api', 'contas_corretora', 'configuracao_global', 'auditoria',
    'estrategias', 'estrategia_versoes', 'robos', 'decisoes', 'ordens', 'execucoes', 'backtests',
    'documentos', 'trechos']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO zentrade_app USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id())',
      tabela || '_por_usuario', tabela);
  END LOOP;
END
$$;
