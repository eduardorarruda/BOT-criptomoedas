import type { DecisaoDTO } from "@zentrade/contratos/esquemas";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useFonte } from "../api/contexto";
import type { EscopoToken } from "../api/esquemas";
import type {
  Credenciais,
  FiltroDecisoes,
  MudancaRobo,
  NovaConta,
  NovaEstrategia,
  NovaNota,
  NovoRobo,
  PedidoBacktest,
} from "../api/fonte";
import { useComConfirmacao } from "../sessao/Reautenticacao";
import { aplicarDecisao, aplicarRobo } from "./atualizarCache";
import { chaves } from "./chaves";

/** Escritas. Cada uma atualiza ou invalida os dados que mudam por causa dela. */
export function gravarDecisao(qc: QueryClient, d: DecisaoDTO): void {
  for (const [chave, lista] of qc.getQueriesData<DecisaoDTO[]>({ queryKey: chaves.decisoesTodas })) {
    if (!lista) continue;
    const filtro = (chave[1] ?? {}) as FiltroDecisoes;
    qc.setQueryData(chave, aplicarDecisao(lista, d, filtro));
  }
}

export function useEntrar() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Credenciais) => fonte.entrar(c),
    onSuccess: (usuario) => qc.setQueryData(chaves.sessao, usuario),
  });
}

export function useSair() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fonte.sair(),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(chaves.sessao, null);
    },
  });
}

function useResponderDecisao(aprovar: boolean) {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => (aprovar ? fonte.aprovarDecisao(id) : fonte.recusarDecisao(id)),
    onSuccess: (d) => {
      gravarDecisao(qc, d);
      void qc.invalidateQueries({ queryKey: chaves.resumo });
    },
    onError: () => void qc.invalidateQueries({ queryKey: chaves.decisoesTodas }),
  });
}
export const useAprovarDecisao = () => useResponderDecisao(true);
export const useRecusarDecisao = () => useResponderDecisao(false);

export function useParadaTotal() {
  const fonte = useFonte();
  const qc = useQueryClient();
  const comConfirmacao = useComConfirmacao();
  return useMutation({
    mutationFn: (ligada: boolean) => comConfirmacao(() => fonte.definirParadaTotal(ligada)),
    onSuccess: (ligada) => {
      qc.setQueryData(chaves.resumo, (r: { paradaTotal: boolean } | undefined) =>
        r ? { ...r, paradaTotal: ligada } : r,
      );
      void qc.invalidateQueries({ queryKey: chaves.resumo });
    },
  });
}

export function useCriarRobo() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: NovoRobo) => fonte.criarRobo(r),
    onSuccess: (robo) =>
      qc.setQueryData(chaves.robos, (l: Parameters<typeof aplicarRobo>[0] | undefined) =>
        aplicarRobo(l ?? [], robo),
      ),
  });
}

export function useAtualizarRobo() {
  const fonte = useFonte();
  const qc = useQueryClient();
  const comConfirmacao = useComConfirmacao();
  return useMutation({
    mutationFn: ({ id, mudanca }: { id: string; mudanca: MudancaRobo }) =>
      comConfirmacao(() => fonte.atualizarRobo(id, mudanca)),
    onSuccess: (robo) => {
      qc.setQueryData(chaves.robos, (l: Parameters<typeof aplicarRobo>[0] | undefined) =>
        aplicarRobo(l ?? [], robo),
      );
      void qc.invalidateQueries({ queryKey: chaves.resumo });
    },
  });
}

export function useSalvarEstrategia() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estrategia }: { id: string | null; estrategia: NovaEstrategia }) =>
      id ? fonte.novaVersaoEstrategia(id, estrategia) : fonte.criarEstrategia(estrategia),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaves.estrategias }),
  });
}

export function useCriarConta() {
  const fonte = useFonte();
  const qc = useQueryClient();
  const comConfirmacao = useComConfirmacao();
  return useMutation({
    mutationFn: (c: NovaConta) => comConfirmacao(() => fonte.criarConta(c)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaves.contas }),
  });
}

export function useRemoverConta() {
  const fonte = useFonte();
  const qc = useQueryClient();
  const comConfirmacao = useComConfirmacao();
  return useMutation({
    mutationFn: (id: string) => comConfirmacao(() => fonte.removerConta(id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaves.contas }),
  });
}

export function useCriarToken() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nome, escopo }: { nome: string; escopo: EscopoToken }) => fonte.criarToken(nome, escopo),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaves.tokens }),
  });
}

export function useRevogarToken() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fonte.revogarToken(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaves.tokens }),
  });
}

export function useCriarBacktest() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: PedidoBacktest) => fonte.criarBacktest(p),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaves.backtests }),
  });
}

export function useCriarNota() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (n: NovaNota) => fonte.criarNota(n),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaves.documentos }),
  });
}
