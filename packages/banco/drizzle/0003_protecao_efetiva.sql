ALTER TABLE "decisoes" ADD COLUMN "stop_efetivo" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "decisoes" ADD COLUMN "alvo_efetivo" numeric(38, 18);--> statement-breakpoint
-- Manual: a reconciliação do motor procura as ordens PENDENTE do robô a cada partida.
CREATE INDEX "ordens_pendentes" ON "ordens" ("robo_id", "criada_em") WHERE estado = 'PENDENTE';
