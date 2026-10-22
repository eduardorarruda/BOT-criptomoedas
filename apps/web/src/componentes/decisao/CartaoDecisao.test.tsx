import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../../api/erros";
import type { Fonte } from "../../api/fonte";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizarNaRota } from "../../teste/rota";
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
    renderizarNaRota(<CartaoDecisao decisao={decisao} robo={robo} />, { fonte });
    await screen.findByRole("article");
    expect(screen.getByText("Por que o sinal disparou")).toBeInTheDocument();
    expect(screen.getByText(/RSI\(14\) caiu para 28/)).toBeInTheDocument();
    expect(screen.getByText(/passou por todas as barreiras/i)).toBeInTheDocument();
    expect(screen.getByText("US$ 0,0162")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /confiança/i })).toHaveAttribute("aria-valuenow", "64");
  });

  it("mostra as prévias de futuro da proposta com cenários", async () => {
    const { fonte, decisao, robo } = await preparar();
    renderizarNaRota(<CartaoDecisao decisao={decisao} robo={robo} />, { fonte });
    await screen.findByRole("article");
    expect(
      screen.getByRole("heading", { level: 3, name: "Prévias de futuro (cenários)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Valor esperado líquido")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Ver os 3 cenários/ }));
    expect(screen.getByText("Principal argumento contra")).toBeInTheDocument();
  });

  it("leva à decisão por dentro, dizendo qual é no nome do link", async () => {
    const { fonte, decisao, robo } = await preparar();
    renderizarNaRota(<CartaoDecisao decisao={decisao} robo={robo} />, { fonte });
    await screen.findByRole("article");
    const link = await screen.findByRole("link", { name: /Ver por dentro/ });
    expect(link).toHaveAttribute("href", `/decisoes/${decisao.id}`);
    expect(link).toHaveAccessibleName(/Compra de BTC paciente/);
  });

  it("proposta anterior aos cenários aparece como antes, sem o bloco", async () => {
    const { fonte, decisao, robo } = await preparar();
    const { cenarios: _c, contraArgumento: _a, avaliacao: _v, ...antiga } = decisao.proposta!;
    renderizarNaRota(<CartaoDecisao decisao={{ ...decisao, proposta: antiga }} robo={robo} />, { fonte });
    await screen.findByRole("article");
    expect(screen.getByText("O que a IA argumentou")).toBeInTheDocument();
    expect(screen.queryByText("Prévias de futuro (cenários)")).toBeNull();
  });

  it("aprova a decisão que aguarda e avisa que a ordem vai sair", async () => {
    const { fonte, decisao, robo } = await preparar();
    const aprovar = vi.spyOn(fonte, "aprovarDecisao");
    renderizarNaRota(<CartaoDecisao decisao={decisao} robo={robo} />, { fonte });
    await screen.findByRole("article");
    await userEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(aprovar).toHaveBeenCalledWith(decisao.id);
    expect(await screen.findByText(/Aprovada\. A ordem vai para a corretora/)).toBeInTheDocument();
  });

  it("recusa e mostra o erro da API quando a decisão já expirou", async () => {
    const recusarDecisao = vi.fn(async () => {
      throw new ErroApi("conflito", "Essa decisão já foi respondida ou expirou. Atualize a lista.", 409);
    });
    const { fonte, decisao, robo } = await preparar({ recusarDecisao });
    renderizarNaRota(<CartaoDecisao decisao={decisao} robo={robo} />, { fonte });
    await screen.findByRole("article");
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
    renderizarNaRota(<CartaoDecisao decisao={barrada} robo={robo} />, { fonte });
    await screen.findByRole("article");
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
    renderizarNaRota(<CartaoDecisao decisao={semIa} robo={robo} />, { fonte });
    await screen.findByRole("article");
    expect(screen.getByText(/A IA não concordou/)).toBeInTheDocument();
    expect(screen.getByText("O agente propôs aguardar.")).toBeInTheDocument();
    expect(screen.queryByText(/O risco barrou/)).toBeNull();
  });
});
