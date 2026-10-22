ALTER TABLE "robos" ADD COLUMN "agente" text DEFAULT 'decide' NOT NULL;--> statement-breakpoint
ALTER TABLE "robos" ADD CONSTRAINT "robos_agente" CHECK ("robos"."agente" in ('decide', 'desligado'));