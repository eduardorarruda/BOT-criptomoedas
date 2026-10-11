-- Extensões antes de qualquer tabela: trechos usa vector(1024) e candles vira hypertable.
CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
