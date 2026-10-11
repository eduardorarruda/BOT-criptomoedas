import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ESTRATEGIAS, LIMITES_PADRAO } from "../demo/dados";
import { criarFonteDemo } from "../demo/fonteDemo";
import { criarEnvoltorio } from "../teste/envoltorio";
import { chaves } from "./chaves";
import * as m from "./mutacoes";

function preparar() {
  const fonte = criarFonteDemo({ latenciaMs: [0, 0] });
  const { Envoltorio, queryClient } = criarEnvoltorio(fonte);
  const { result } = renderHook(
    () => ({
      entrar: m.useEntrar(),
      sair: m.useSair(),
      aprovar: m.useAprovarDecisao(),
      recusar: m.useRecusarDecisao(),
      parada: m.useParadaTotal(),
      criarRobo: m.useCriarRobo(),
      atualizarRobo: m.useAtualizarRobo(),
      salvarEstrategia: m.useSalvarEstrategia(),
      criarConta: m.useCriarConta(),
      removerConta: m.useRemoverConta(),
      criarToken: m.useCriarToken(),
      revogarToken: m.useRevogarToken(),
      criarBacktest: m.useCriarBacktest(),
      criarNota: m.useCriarNota(),
    }),
    { wrapper: Envoltorio },
  );
  return { fonte, queryClient, result };
}

describe("mutações", () => {
  it("entra, guarda o usuário e sai limpando os dados", async () => {
    const { result, queryClient } = preparar();
    await act(() => result.current.entrar.mutateAsync({ email: "a@b.c", senha: "x", codigo2fa: "123456" }));
    expect(queryClient.getQueryData(chaves.sessao)).toMatchObject({ email: "voce@exemplo.com" });
    await act(() => result.current.sair.mutateAsync());
    expect(queryClient.getQueryData(chaves.sessao)).toBeNull();
  });

  it("aprova e recusa atualizando as listas de decisões já carregadas", async () => {
    const { result, queryClient, fonte } = preparar();
    const aguardando = await fonte.decisoes({ estado: "aguardando_aprovacao" });
    queryClient.setQueryData(chaves.decisoes({ estado: "aguardando_aprovacao" }), aguardando);
    await act(() => result.current.aprovar.mutateAsync(aguardando[0]!.id));
    expect(queryClient.getQueryData(chaves.decisoes({ estado: "aguardando_aprovacao" }))).toEqual([]);
    await expect(act(() => result.current.recusar.mutateAsync(aguardando[0]!.id))).rejects.toMatchObject({
      codigo: "conflito",
    });
  });

  it("liga a parada total e reflete no resumo", async () => {
    const { result, queryClient, fonte } = preparar();
    queryClient.setQueryData(chaves.resumo, await fonte.resumo());
    await act(() => result.current.parada.mutateAsync(true));
    await waitFor(() =>
      expect(queryClient.getQueryData<{ paradaTotal: boolean }>(chaves.resumo)?.paradaTotal).toBe(true),
    );
  });

  it("cria e atualiza robô na lista", async () => {
    const { result, queryClient } = preparar();
    queryClient.setQueryData(chaves.robos, []);
    const robo = await act(() =>
      result.current.criarRobo.mutateAsync({
        nome: "Novo",
        simbolo: "BTCUSDT",
        intervalo: "1h",
        rede: "papel",
        estrategiaId: "e-rsi",
        estrategiaVersao: 3,
        limites: LIMITES_PADRAO,
      }),
    );
    expect(queryClient.getQueryData<{ id: string }[]>(chaves.robos)?.map((r) => r.id)).toEqual([robo.id]);
    await act(() => result.current.atualizarRobo.mutateAsync({ id: robo.id, mudanca: { pausado: true } }));
    expect(queryClient.getQueryData<{ pausado: boolean }[]>(chaves.robos)?.[0]?.pausado).toBe(true);
  });

  it("salva estratégia nova e nova versão", async () => {
    const { result } = preparar();
    const { id: _id, versao: _v, ...base } = ESTRATEGIAS[1]!;
    const nova = await act(() =>
      result.current.salvarEstrategia.mutateAsync({ id: null, estrategia: { ...base, nome: "Outra" } }),
    );
    const v2 = await act(() =>
      result.current.salvarEstrategia.mutateAsync({ id: nova.id, estrategia: { ...base, nome: "Outra" } }),
    );
    expect(v2.versao).toBe(2);
  });

  it("cadastra e remove chave, cria e revoga token, pede backtest e guarda nota", async () => {
    const { result } = preparar();
    await act(() => result.current.entrar.mutateAsync({ email: "a@b.c", senha: "x", codigo2fa: "123456" }));
    const conta = await act(() =>
      result.current.criarConta.mutateAsync({
        corretora: "binance",
        rede: "testnet",
        apiKey: "k".repeat(20),
        apiSecret: "s".repeat(20),
      }),
    );
    await act(() => result.current.removerConta.mutateAsync(conta.id));
    const token = await act(() => result.current.criarToken.mutateAsync({ nome: "cli", escopo: "leitura" }));
    await act(() => result.current.revogarToken.mutateAsync(token.id));
    const b = await act(() =>
      result.current.criarBacktest.mutateAsync({
        estrategiaId: "e-rsi",
        versao: 3,
        simbolo: "BTCUSDT",
        intervalo: "1h",
        inicio: 0,
        fim: 86_400_000,
      }),
    );
    expect(b.estado).toBe("na_fila");
    const nota = await act(() => result.current.criarNota.mutateAsync({ titulo: "t", texto: "x" }));
    expect(nota.fonte).toBe("nota");
  });
});
