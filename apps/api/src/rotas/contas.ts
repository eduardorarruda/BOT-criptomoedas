import { ContaCorretoraEsquema, type CredenciaisCorretora } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado, proibido } from "../erros.js";
import { servicoCarteiraDe, type ServicoCarteira } from "../integracoes/binance-carteira.js";
import { exigirUuid, ParamId } from "./comum.js";

const NovaConta = z.object({
  corretora: z.literal("binance"),
  rede: z.enum(["testnet", "real"]),
  apiKey: z.string().min(8, "a chave da API parece curta demais").max(200),
  apiSecret: z.string().min(8, "o segredo da API parece curto demais").max(200),
});

/**
 * Chave de dinheiro real só é salva depois de conferida na Binance: com permissão de
 * SAQUE é recusada (o ZenTrade nunca saca; uma chave com saque vazada esvazia a conta).
 * Sem conseguir ler as permissões, também não salva. Sem restrição de IP, salva com
 * aviso forte no status (IP doméstico muda; ver docs/seguranca.md). A testnet não tem
 * saque nem informa permissões: salva direto.
 */
async function conferirChaveReal(servico: ServicoCarteira, credenciais: CredenciaisCorretora): Promise<void> {
  let r;
  try {
    r = await servico.restricoesDaChave("real", credenciais);
  } catch {
    r = null;
  }
  if (!r)
    throw new ErroApi(
      502,
      "chave_nao_conferida",
      "não deu para conferir as permissões da chave na Binance (chave errada ou Binance fora do ar). Chave de dinheiro real só é salva depois de conferida: confira e tente de novo",
    );
  if (r.podeSacar)
    throw new ErroApi(
      422,
      "chave_com_saque",
      "esta chave tem permissão de SAQUE e não pode ser usada: o ZenTrade nunca saca. Na Binance, crie outra chave só com leitura e negociação spot (sem saque), de preferência presa ao IP do servidor, e cadastre essa",
    );
}

export const rotasContas: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { contas } = deps.banco;

  app.get(
    "/contas-corretora",
    { config: { acesso: "sessao" }, schema: { response: { 200: z.array(ContaCorretoraEsquema) } } },
    async (req) => contas.listar(usuarioIdDe(req)),
  );

  // Cadastrar chave é crítico: reautenticação recente; chave de dinheiro real exige 2FA.
  app.post(
    "/contas-corretora",
    {
      config: { acesso: "sessao", critica: true },
      schema: { body: NovaConta, response: { 201: ContaCorretoraEsquema } },
    },
    async (req, reply) => {
      const a = req.autenticacao;
      if (req.body.rede === "real" && a?.via === "sessao" && !a.usuario.doisFatores) {
        throw proibido(
          "2fa_obrigatorio",
          "para cadastrar chave de dinheiro real, ative o 2FA em POST /api/v1/sessao/2fa",
        );
      }
      if (req.body.rede === "real")
        await conferirChaveReal(servicoCarteiraDe(deps, req.log), {
          apiKey: req.body.apiKey,
          apiSecret: req.body.apiSecret,
        });
      return reply.code(201).send(await contas.criar(usuarioIdDe(req), req.body));
    },
  );

  app.delete(
    "/contas-corretora/:id",
    { config: { acesso: "sessao" }, schema: { params: ParamId } },
    async (req, reply) => {
      const removida = await contas.remover(usuarioIdDe(req), exigirUuid(req.params.id, "conta"));
      if (!removida) throw naoEncontrado("conta");
      return reply.code(204).send();
    },
  );
};
