import { exigirFuso, FUSO_PADRAO, fusoValido } from "@zentrade/dominio";
import { z } from "zod";

/**
 * Um fuso horário por nome IANA (America/Sao_Paulo), conferido com o Intl e devolvido no
 * nome canônico. É o que define "hoje" na instância: a perda do dia, o resultado do dia,
 * o orçamento de IA e o que o assistente diz.
 */
export const FusoEsquema = z.string().transform((v, ctx) => {
  try {
    return exigirFuso(v);
  } catch (erro) {
    ctx.addIssue({ code: "custom", message: (erro as Error).message });
    return z.NEVER;
  }
});

/** ZENTRADE_FUSO (motor, API e agente): sem a variável, o horário de Brasília. */
export const FusoInstanciaEsquema = FusoEsquema.default(FUSO_PADRAO);

/**
 * Um nome de fuso já canônico, sem transformar (vai nas respostas da API, que o
 * serializador codifica de volta): o que a tela recebe em `GET /publico/config`.
 */
export const NomeFusoEsquema = z.string().refine(fusoValido, {
  error: "fuso desconhecido: use um nome IANA, como America/Sao_Paulo",
});
