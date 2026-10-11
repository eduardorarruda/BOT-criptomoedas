import type {
  EstadoSincronizacaoGravado,
  NegociacaoCarteiraGravada,
  NegociacaoCarteiraLida,
  NovaSincronizacao,
  RepositorioCarteira,
  SaldoCarteira,
} from "@zentrade/banco";
import type { RedeConta } from "@zentrade/contratos";

/** O repositório da carteira em memória, para os testes de unidade da API. Mesmo contrato do banco. */
export function carteiraEmMemoria(
  contas: { usuarioId: string; rede: RedeConta }[] = [],
): RepositorioCarteira {
  const negociacoes = new Map<string, NegociacaoCarteiraGravada & { chave: string }>();
  const saldos = new Map<string, SaldoCarteira[]>();
  const estados = new Map<string, EstadoSincronizacaoGravado>();
  const de = (u: string, r: RedeConta) => `${u}:${r}`;
  const daConta = (u: string, r: RedeConta) => [...negociacoes.values()].filter((n) => n.chave === de(u, r));
  const lida = (n: NegociacaoCarteiraGravada): NegociacaoCarteiraLida => ({
    ...n,
    id: `${n.simbolo}:${n.idNegociacao}`,
    idOrdem: String(n.idOrdem),
  });

  return {
    async gravarNegociacoes(u, r, ns) {
      let novas = 0;
      for (const n of ns) {
        const id = `${de(u, r)}:${n.simbolo}:${n.idNegociacao}`;
        if (negociacoes.has(id)) continue;
        negociacoes.set(id, { ...n, chave: de(u, r) });
        novas += 1;
      }
      return novas;
    },
    async gravarSaldos(u, r, s) {
      saldos.set(de(u, r), [...s]);
    },
    async registrarSincronizacao(u, r, s: NovaSincronizacao) {
      const anteriores = estados.get(de(u, r))?.simbolos ?? [];
      const { simbolos, ...resto } = s;
      estados.set(de(u, r), { ...resto, simbolos: [...new Set([...anteriores, ...simbolos])].sort() });
    },
    async sincronizacao(u, r) {
      return estados.get(de(u, r)) ?? null;
    },
    async ultimosIds(u, r) {
      const ultimos = new Map<string, number>();
      for (const n of daConta(u, r))
        ultimos.set(n.simbolo, Math.max(ultimos.get(n.simbolo) ?? 0, n.idNegociacao));
      return ultimos;
    },
    async saldos(u, r) {
      return saldos.get(de(u, r)) ?? [];
    },
    async negociacoes(u, r, ativo) {
      return daConta(u, r)
        .filter((n) => !ativo || n.base === ativo || n.cotacao === ativo || n.ativoTaxa === ativo)
        .sort((a, b) => a.em - b.em)
        .map(({ chave: _chave, ...n }) => lida(n));
    },
    async contasParaSincronizar() {
      return contas;
    },
  };
}
