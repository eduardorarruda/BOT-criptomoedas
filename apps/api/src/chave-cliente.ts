import { normalizeIP } from "@fastify/rate-limit";

/** IP do cliente para o limite de tentativas (IPv6 agrupado por /64). Sem IP (injeção em teste), um balde só. */
export const chaveDoCliente = (req: { ip?: string }): string => (req.ip ? normalizeIP(req.ip) : "sem-ip");
