/** O mínimo de logger que as integrações usam (o pino do Fastify serve). */
export interface Log {
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;
