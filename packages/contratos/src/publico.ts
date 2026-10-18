import { FUSO_PADRAO } from "@zentrade/dominio";
import { z } from "zod";
import { NomeFusoEsquema } from "./fuso.js";

/**
 * `GET /publico/config`: o que qualquer pessoa pode saber da instância sem entrar.
 * Só o contato de quem responde pelos dados (LGPD), a versão e o fuso; nada sensível.
 */
export const ContatoLgpdEsquema = z.object({
  nome: z.string().min(1).max(200),
  email: z.email().max(254),
});
export type ContatoLgpd = z.infer<typeof ContatoLgpdEsquema>;

export const ConfigPublicaEsquema = z.object({
  /** Quem opera a instância e decide sobre os dados (controlador). `null` = não configurado. */
  controlador: ContatoLgpdEsquema.nullable(),
  /** Encarregado (DPO). `null` = o próprio controlador atende. */
  encarregado: ContatoLgpdEsquema.nullable(),
  versao: z.string().min(1).max(40),
  /** O fuso da instância (ZENTRADE_FUSO): o "hoje" da tela é o mesmo do motor e da API. */
  fuso: NomeFusoEsquema.default(FUSO_PADRAO),
});
export type ConfigPublica = z.infer<typeof ConfigPublicaEsquema>;
