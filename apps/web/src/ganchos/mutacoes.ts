import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useFonte } from "../api/contexto";
import type { EscopoToken, Usuario } from "../api/esquemas";
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
import { mudancaSegura } from "../lib/mudancaRobo";
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

/** 2FA: gerar o segredo é ação crítica (pede identidade confirmada); ativar liga na sessão em cache. */
export function useIniciarDoisFatores() {
  const fonte = useFonte();
  const comConfirmacao = useComConfirmacao();
  return useMutation({ mutationFn: () => comConfirmacao(() => fonte.iniciarDoisFatores()) });
}

export function useAtivarDoisFatores() {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (codigo: string) => fonte.ativarDoisFatores(codigo),
    onSuccess: () =>
      qc.setQueryData(chaves.sessao, (u: Usuario | null | undefined) =>
        u ? { ...u, doisFatores: true } : u,
      ),
  });
}

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

/**
 * Mudar um robô. No sentido seguro (pausar, observar, sugerir) a tela muda na hora e
 * volta se a API recusar; o resto espera a resposta (lib/mudancaRobo).
 */
export function useAtualizarRobo() {
  const fonte = useFonte();
  const qc = useQueryClient();
  const comConfirmacao = useComConfirmacao();
  return useMutation({
    mutationFn: ({ id, mudanca }: { id: string; mudanca: MudancaRobo }) =>
      comConfirmacao(() => fonte.atualizarRobo(id, mudanca)),
    onMutate: async ({ id, mudanca }) => {
      const antes = qc.getQueryData<RoboDTO[]>(chaves.robos)?.find((r) => r.id === id);
      if (!antes || !mudancaSegura(antes, mudanca)) return { antes: undefined };
      await qc.cancelQueries({ queryKey: chaves.robos });
      qc.setQueryData<RoboDTO[]>(chaves.robos, (l) =>
        l?.map((r) => (r.id === id ? { ...r, ...mudanca } : r)),
      );
      return { antes };
    },
    // Volta só este robô: outra mudança que deu certo no meio do caminho fica.
    onError: (_e, { id }, contexto) => {
      const antes = contexto?.antes;
      if (antes) qc.setQueryData<RoboDTO[]>(chaves.robos, (l) => l?.map((r) => (r.id === id ? antes : r)));
    },
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
