import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../../api/erros";
import type { Fonte } from "../../api/fonte";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizar } from "../../teste/renderizar";
import { CartaoDecisao } from "./CartaoDecisao";

async function preparar(sobrescrever: Partial<Fonte> = {}) {
  const base = criarFonteDemo({ latenciaMs: [0, 0] });
  const fonte: Fonte = { ...base, ...sobrescrever };
  const [decisao] = await base.decisoes({ estado: "aguardando_aprovacao" });
  const robo = (await base.robos()).find((r) => r.id === decisao!.roboId);
  return { fonte, decisao: decisao!, robo: robo! };
}

describe("CartaoDecisao", () => {
  it("conta o porquê: sinal, argumento da IA, risco e custo", async () => {
    const { fonte, decisao, robo } = await preparar();
    renderizar(<CartaoDecisao decisao={decisao} robo={robo} />, fonte);
    expect(screen.getByText("Por que o sinal disparou")).toBeInTheDocument();
    expect(screen.getByText(/RSI\(14\) caiu para 28/)).toBeInTheDocument();
    expect(screen.getByText(/passou por todas as barreiras/i)).toBeInTheDocument();
    expect(screen.getByText("US$ 0,0162")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /confiança/i })).toHaveAttribute("aria-valuenow", "72");
  });

  it("aprova a decisão que aguarda e avisa que a ordem vai sair", async () => {
    const { fonte, decisao, robo } = await preparar();
    const aprovar = vi.spyOn(fonte, "aprovarDecisao");
    renderizar(<CartaoDecisao decisao={decisao} robo={robo} />, fonte);
    await userEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(aprovar).toHaveBeenCalledWith(decisao.id);
    expect(await screen.findByText(/Aprovada\. A ordem vai para a corretora/)).toBeInTheDocument();
  });

  it("recusa e mostra o erro da API quando a decisão já expirou", async () => {
    const recusarDecisao = vi.fn(async () => {
      throw new ErroApi("conflito", "Essa decisão já foi respondida ou expirou. Atualize a lista.", 409);
    });
    const { fonte, decisao, robo } = await preparar({ recusarDecisao });
    renderizar(<CartaoDecisao decisao={decisao} robo={robo} />, fonte);
    await userEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(await screen.findByText(/já foi respondida ou expirou/)).toBeInTheDocument();
  });

  it("não mostra botões quando não aguarda resposta e lista as barreiras do risco", async () => {
    const { fonte } = await preparar();
    const robo = { id: "r", nome: "Robô", simbolo: "SOLUSDT" } as RoboDTO;
    const barrada: DecisaoDTO = {
      id: "d",
      roboId: "r",
      em: Date.now(),
      sinal: { acao: "COMPRAR", explicacao: "x" },
      preco: "150",
      risco: {
        aprovada: false,
        barreiras: [{ codigo: "exposicao", mensagem: "A exposição passaria do limite." }],
      },
      estado: "barrada",
    };
    renderizar(<CartaoDecisao decisao={barrada} robo={robo} />, fonte);
    expect(screen.getByText("A exposição passaria do limite.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(screen.getByText("sem IA")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Barrada pelo risco")).toBeInTheDocument());
  });

  it("quando quem recusou foi a IA, diz isso — não culpa o risco", async () => {
    const { fonte } = await preparar();
    const robo = { id: "r", nome: "Robô", simbolo: "SOLUSDT" } as RoboDTO;
    const semIa: DecisaoDTO = {
      id: "d2",
      roboId: "r",
      em: Date.now(),
      sinal: { acao: "COMPRAR", explicacao: "x" },
      preco: "150",
      risco: {
        aprovada: false,
        barreiras: [{ codigo: "agente_aguardar", mensagem: "O agente propôs aguardar." }],
      },
      estado: "registrada",
    };
    renderizar(<CartaoDecisao decisao={semIa} robo={robo} />, fonte);
    expect(screen.getByText(/A IA não concordou/)).toBeInTheDocument();
    expect(screen.getByText("O agente propôs aguardar.")).toBeInTheDocument();
    expect(screen.queryByText(/O risco barrou/)).toBeNull();
  });
});
