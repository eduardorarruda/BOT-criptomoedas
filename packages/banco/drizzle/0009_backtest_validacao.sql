-- Backtest honesto: a configuração que de fato rodou (custos, limites, validação) e o
-- resultado da validação (dentro/fora da amostra, walk-forward, Monte Carlo, avisos).
-- Colunas novas são nulas nos backtests antigos, que continuam aparecendo na tela.
-- O índice conta as tentativas de uma estratégia (Sharpe deflacionado). RLS: a tabela
-- já filtra por usuario_id (0002).
ALTER TABLE "backtests" ADD COLUMN "configuracao" jsonb;--> statement-breakpoint
ALTER TABLE "backtests" ADD COLUMN "validacao" jsonb;--> statement-breakpoint
CREATE INDEX "backtests_estrategia" ON "backtests" USING btree ("usuario_id","estrategia_id","criado_em");
