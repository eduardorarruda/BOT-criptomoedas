-- Agregados em "tempo real": juntam o que já foi materializado com os candles de 1m
-- mais recentes. Sem isto, a última hora (e um banco recém-criado) aparecia vazia no
-- gráfico até a política de refresh rodar.
ALTER MATERIALIZED VIEW candles_5m SET (timescaledb.materialized_only = false);
--> statement-breakpoint
ALTER MATERIALIZED VIEW candles_1h SET (timescaledb.materialized_only = false);
