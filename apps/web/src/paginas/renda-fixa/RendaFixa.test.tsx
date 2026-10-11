import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TituloRendaFixa } from "@zentrade/contratos/esquemas";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { buscaAtual, renderizarNaRota } from "../../teste/rota";
import { montarTitulo, numeroDigitado } from "./Cadastro";
import { idExistente } from "./pluggy-widget";
import { RendaFixa } from "./RendaFixa";
import { agrupar, somarLotes } from "./Titulos";

const fonteDemo = () => criarFonteDemo({ latenciaMs: [0, 0] });
/** As contas da demonstração (séries diárias desde 2024) levam um tempo sob carga. */
const ESPERA = { timeout: 10_000 };

describe("tela de renda fixa (demonstração)", () => {
  it("mostra a visão geral com totais, alocação, vencimentos e a fonte das taxas", async () => {
    renderizarNaRota(<RendaFixa />, { caminho: "/renda-fixa", fonte: fonteDemo() });
    expect(await screen.findByText("Líquido estimado hoje", {}, ESPERA)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Por tipo/ })).toBeInTheDocument();
    expect(screen.getByText("Calendário de vencimentos")).toBeInTheDocument();
    expect(screen.getByText(/Fonte: Banco Central do Brasil/)).toBeInTheDocument();
    expect(screen.getByText(/Regras de imposto usadas nas contas/)).toBeInTheDocument();
  });

  it("abas com teclado e lista de títulos com as caixinhas agrupadas", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<RendaFixa />, { caminho: "/renda-fixa", fonte: fonteDemo() });
    const visao = await screen.findByRole("tab", { name: "Visão geral" }, ESPERA);
    visao.focus();
    await usuario.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Títulos" })).toHaveAttribute("aria-selected", "true"),
    );
    expect(buscaAtual(roteador).aba).toBe("titulos");
    expect(await screen.findByText("2 lotes", {}, ESPERA)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /Ver detalhes de CDB Banco Exemplo/ }));
    const dialogo = await screen.findByRole("dialog", {}, ESPERA);
    expect(await within(dialogo).findByText(/Projeção até o vencimento/, {}, ESPERA)).toBeInTheDocument();
    expect(within(dialogo).getAllByText(/não é promessa de rentabilidade/).length).toBeGreaterThan(0);
  });

  it("cadastro valida antes de enviar", async () => {
    const usuario = userEvent.setup();
    renderizarNaRota(<RendaFixa />, { caminho: "/renda-fixa", fonte: fonteDemo() });
    await usuario.click(await screen.findByRole("tab", { name: "Cadastrar" }, ESPERA));
    await usuario.click(await screen.findByRole("button", { name: "Cadastrar título" }, ESPERA));
    expect(await screen.findByText(/dê um nome ao título/, {}, ESPERA)).toBeInTheDocument();
  });

  it("simulador pede números e responde com premissas", async () => {
    const usuario = userEvent.setup();
    renderizarNaRota(<RendaFixa />, { caminho: "/renda-fixa", fonte: fonteDemo() });
    await usuario.click(await screen.findByRole("tab", { name: "Simuladores" }, ESPERA));
    await usuario.click(await screen.findByRole("button", { name: "Simular" }, ESPERA));
    await waitFor(() => expect(screen.getByText(/para empatar no líquido/)).toBeInTheDocument(), ESPERA);
    expect(screen.getByText(/CDI de 13,65% ao ano/)).toBeInTheDocument();
  });

  it("conectar banco na demonstração explica que não há conexão e o prazo do MeuPluggy", async () => {
    const usuario = userEvent.setup();
    renderizarNaRota(<RendaFixa />, { caminho: "/renda-fixa", fonte: fonteDemo() });
    await usuario.click(await screen.findByRole("tab", { name: "Conectar banco" }, ESPERA));
    expect(await screen.findByText("Sem conexão na demonstração", {}, ESPERA)).toBeInTheDocument();
    expect(screen.getByText(/15 dias de teste/)).toBeInTheDocument();
  });
});

describe("títulos filtrados pela URL", () => {
  it("o link abre a aba, os filtros e a visão; os totais seguem o filtro", async () => {
    renderizarNaRota(<RendaFixa />, {
      caminho: "/renda-fixa?aba=titulos&origem=pluggy&visao=tabela",
      fonte: fonteDemo(),
    });
    const tabela = await screen.findByRole("table", { name: /Títulos de renda fixa filtrados/ }, ESPERA);
    expect(within(tabela).getAllByRole("row")).toHaveLength(3);
    expect(within(tabela).getByText("CDB Banco Digital 102%")).toBeInTheDocument();
    expect(screen.getByLabelText("Totais dos títulos filtrados")).toHaveTextContent("R$ 13.000,00");
    expect(screen.getByRole("checkbox", { name: /Pluggy/ })).toBeChecked();
  });

  it("escada de vencimentos e filtro de janela pelo teclado", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<RendaFixa />, {
      caminho: "/renda-fixa?aba=titulos&visao=escada",
      fonte: fonteDemo(),
    });
    expect(await screen.findByRole("heading", { name: /Escada de vencimentos/ }, ESPERA)).toBeInTheDocument();
    expect(screen.getByText("Sem vencimento")).toBeInTheDocument();
    await usuario.click(screen.getByRole("radio", { name: /Em 30 dias/ }));
    await waitFor(() => expect(buscaAtual(roteador).vence).toBe("30"));
    expect(screen.queryByText("Sem vencimento")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CDB Banco Digital 102%/ })).toBeInTheDocument();
  });

  it("visão geral leva à escada por mês", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<RendaFixa />, { caminho: "/renda-fixa", fonte: fonteDemo() });
    await usuario.click(await screen.findByRole("button", { name: "Ver por mês" }, ESPERA));
    await waitFor(() => expect(buscaAtual(roteador)).toEqual({ aba: "titulos", visao: "escada" }));
  });
});

describe("ajudantes da tela", () => {
  it("números digitados em pt-BR", () => {
    expect(numeroDigitado("10.000,50")).toBe("10000.50");
    expect(numeroDigitado("R$ 1500")).toBe("1500");
    expect(numeroDigitado("110%")).toBe("110");
  });

  it("monta o título: pós-fixado leva o percentual; carência só com liquidez de carência", () => {
    const base = {
      tipo: "CDB" as const,
      nome: " CDB ",
      emissor: "",
      indexador: "CDI" as const,
      percentualIndexador: "",
      taxaAnual: "",
      dataAplicacao: "2026-01-02",
      vencimento: "",
      valorAplicado: "1.000,00",
      liquidez: "vencimento" as const,
      carenciaAte: "2026-06-01",
    };
    expect(montarTitulo(base)).toMatchObject({
      nome: "CDB",
      percentualIndexador: "100",
      valorAplicado: "1000.00",
      vencimento: null,
      carenciaAte: null,
      emissor: null,
    });
    expect(montarTitulo({ ...base, indexador: "PREFIXADO", taxaAnual: "12,5" })).toMatchObject({
      percentualIndexador: null,
      taxaAnual: "12.5",
    });
  });

  it("agrupa lotes e soma só quando todos têm posição", () => {
    const lote = (id: string, bruto: string | null): TituloRendaFixa =>
      ({
        id,
        grupo: "g",
        valorAplicado: "100",
        posicao: bruto
          ? { disponivel: true, bruto, liquido: bruto, rendimentoBruto: "1" }
          : { disponivel: false, aplicado: "100", motivo: "falta CDI" },
      }) as unknown as TituloRendaFixa;
    const grupos = agrupar([lote("a", "101"), lote("b", "102"), { ...lote("c", "50"), grupo: null }]);
    expect(grupos.map((g) => g.titulos.length)).toEqual([2, 1]);
    expect(somarLotes([lote("a", "101"), lote("b", "102")])).toEqual({
      aplicado: "200.00",
      bruto: "203.00",
      liquido: "203.00",
      rendimento: "2.00",
    });
    expect(somarLotes([lote("a", "101"), lote("b", null)]).bruto).toBeNull();
  });

  it("acha o item que já existia no erro da Pluggy", () => {
    expect(idExistente({ item: { id: "4b6a1a5e-8e0a-4c55-9f43-3b8f3c1d2e7a" } })).toBe(
      "4b6a1a5e-8e0a-4c55-9f43-3b8f3c1d2e7a",
    );
    expect(idExistente({ items: ["nada"] })).toBeNull();
    expect(idExistente(null)).toBeNull();
  });
});
