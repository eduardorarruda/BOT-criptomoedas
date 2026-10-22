import { MODELOS, MODELOS_WIN, TODOS_OS_MODELOS, validarEstrategia, validarRegra } from "@zentrade/dominio";
import { createEvent, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { NovaEstrategia } from "../api/fonte";
import { criarFonteDemo } from "../demo/fonteDemo";
import { paraDominio } from "../lib/estrategia";
import { renderizar } from "../teste/renderizar";
import { Construtor } from "./Construtor";
import { estadoVazio } from "./estado";

function montar() {
  const aoSalvar = vi.fn<(id: string | null, e: NovaEstrategia) => void>();
  renderizar(
    <Construtor inicial={estadoVazio()} salvando={false} aoSalvar={aoSalvar} />,
    criarFonteDemo({ latenciaMs: [0, 0] }),
  );
  return { aoSalvar };
}

function transferencia() {
  const dados = new Map<string, string>();
  return {
    setData: (t: string, v: string) => dados.set(t, v),
    getData: (t: string) => dados.get(t) ?? "",
    clearData: () => dados.clear(),
    setDragImage: () => undefined,
    dropEffect: "none",
    effectAllowed: "all",
  };
}

const disparar = (el: HTMLElement, criar: (e: HTMLElement) => Event, dataTransfer: object) =>
  fireEvent(el, Object.assign(criar(el), { dataTransfer }));

describe("Construtor de estratégias", () => {
  it("monta pelo teclado uma árvore E/OU/NÃO válida e salva", async () => {
    const { aoSalvar } = montar();
    const usuario = userEvent.setup();
    const salvar = screen.getByRole("button", { name: "Criar estratégia" });
    expect(salvar).toBeDisabled();
    expect(screen.getByText(/Dê um nome à estratégia/)).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Nome da estratégia"), "Minha regra");
    const raiz = screen.getByRole("group", { name: "Adicionar ao grupo E" });
    await usuario.click(within(raiz).getByRole("button", { name: /Grupo OU/ }));
    const ou = screen.getByRole("group", { name: "Adicionar ao grupo OU" });
    await usuario.click(within(ou).getByRole("button", { name: /Condição/ }));
    await usuario.click(within(ou).getByRole("button", { name: /NÃO/ }));
    expect(screen.getByText(/NÃO" está vazio/)).toBeInTheDocument();
    const nao = screen.getByRole("group", { name: "Adicionar ao NÃO" });
    await usuario.click(within(nao).getByRole("button", { name: /Condição/ }));

    expect(screen.getByText(/Tudo certo/)).toBeInTheDocument();
    expect(salvar).toBeEnabled();
    await usuario.click(salvar);
    const [id, estrategia] = aoSalvar.mock.calls[0]!;
    expect(id).toBeNull();
    expect(estrategia.nome).toBe("Minha regra");
    expect(validarRegra(estrategia.entrada)).toEqual([]);
    expect(estrategia.entrada).toMatchObject({
      tipo: "e",
      regras: [
        { tipo: "comparar" },
        { tipo: "ou", regras: [{ tipo: "comparar" }, { tipo: "nao", regra: { tipo: "comparar" } }] },
      ],
    });
  });

  it("mostra a regra em palavras com os rótulos do domínio e atualiza ao editar", async () => {
    montar();
    const usuario = userEvent.setup();
    expect(screen.getByText(/RSI\(14\) abaixo de 30\./)).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Comparação"), ">");
    expect(screen.getByText(/RSI\(14\) acima de 30\./)).toBeInTheDocument();
    const valor = screen.getByLabelText("Lado direito: valor");
    await usuario.clear(valor);
    await usuario.type(valor, "70,5");
    expect(screen.getByText(/RSI\(14\) acima de 70,5\./)).toBeInTheDocument();
  });

  it("move, nega e remove condições pelos botões (alternativa ao arrastar)", async () => {
    montar();
    const usuario = userEvent.setup();
    const raiz = screen.getByRole("group", { name: "Adicionar ao grupo E" });
    await usuario.click(within(raiz).getByRole("button", { name: /Grupo OU/ }));
    await usuario.selectOptions(
      screen.getByLabelText(/Mover condição RSI\(14\) abaixo de 30 para outro grupo/),
      "Grupo E › Grupo OU",
    );
    expect(screen.getByText(/Compra quando/).parentElement).toHaveTextContent(
      "Compra quando RSI(14) abaixo de 30.",
    );
    await usuario.click(screen.getByRole("button", { name: /Negar condição RSI/ }));
    expect(screen.getByText(/não \(RSI\(14\) abaixo de 30\)/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Tirar o NÃO" }));
    await usuario.click(screen.getByRole("button", { name: /Remover condição RSI/ }));
    expect(screen.getAllByText(/grupo vazio/i).length).toBeGreaterThan(0);
  });

  it("aceita um bloco arrastado da paleta para a árvore", () => {
    montar();
    const dataTransfer = transferencia();
    const bloco = screen.getByText("Grupo OU", { selector: "strong" }).closest("li")!;
    disparar(bloco, createEvent.dragStart, dataTransfer);
    const [zona] = screen.getAllByText("Soltar aqui");
    disparar(zona!, createEvent.dragOver, dataTransfer);
    disparar(zona!, createEvent.drop, dataTransfer);
    expect(screen.getByRole("group", { name: "Adicionar ao grupo OU" })).toBeInTheDocument();
    expect(screen.queryByText("Soltar aqui")).toBeNull();
  });

  it("move uma condição arrastando pela alça", async () => {
    montar();
    const raiz = screen.getByRole("group", { name: "Adicionar ao grupo E" });
    await userEvent.click(within(raiz).getByRole("button", { name: /Grupo OU/ }));
    const dataTransfer = transferencia();
    const alca = document.querySelector<HTMLElement>(".no--comparar .no__alca")!;
    disparar(alca, createEvent.dragStart, dataTransfer);
    const ou = screen.getByRole("group", { name: "Adicionar ao grupo OU" }).closest<HTMLElement>(".no--ou")!;
    const zona = within(ou).getByText("Soltar aqui");
    disparar(zona, createEvent.dragOver, dataTransfer);
    disparar(zona, createEvent.drop, dataTransfer);
    expect(within(ou).getByLabelText("Comparação")).toBeInTheDocument();
  });

  it("começa de um modelo: preenche nome, regras e saídas, e salva como estratégia nova", async () => {
    const { aoSalvar } = montar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByText("Começar de um modelo"));
    expect(screen.getAllByText(/não é recomendação/i).length).toBeGreaterThan(0);
    const modelo = MODELOS[0]!;
    await usuario.click(screen.getByRole("button", { name: `Usar este modelo: ${modelo.nome}` }));
    expect(screen.getByLabelText("Nome da estratégia")).toHaveValue(modelo.nome);
    expect(screen.getByText(/stop a 2 × ATR\(20\) abaixo da entrada, no máximo 10%/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Criar estratégia" }));
    const [id, estrategia] = aoSalvar.mock.calls[0]!;
    expect(id).toBeNull();
    expect(estrategia).toEqual({ nome: modelo.nome, ...modelo.estrategia });
  });

  it("começa do cofre de tendência: tamanho por alocação ligado, com a fração e a explicação, e os dois jeitos de dimensionar não convivem", async () => {
    const { aoSalvar } = montar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByText("Começar de um modelo"));
    const cofre = MODELOS.find((m) => m.id === "cofre-tendencia-sma400")!;
    const item = within(screen.getByRole("heading", { name: cofre.nome }).closest("li")!);
    expect(item.getByText(/não uma indicação de investimento/)).toBeInTheDocument();
    expect(item.getByText("Velas de 4 h")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: `Usar este modelo: ${cofre.nome}` }));

    const alocacao = screen.getByRole("checkbox", { name: /Tamanho por alocação/ });
    expect(alocacao).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Tamanho pela volatilidade/ })).not.toBeChecked();
    expect(screen.getByLabelText("Fração da exposição máxima (%)")).toHaveValue("100");
    expect(screen.getByText(/Compra este tanto da exposição máxima/)).toBeInTheDocument();
    expect(
      screen.getByText("tamanho: 100% da exposição máxima do robô, sem olhar o risco por operação"),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Criar estratégia" }));
    expect(aoSalvar.mock.calls[0]![1]).toEqual({ nome: cofre.nome, ...cofre.estrategia });

    // ligar o tamanho pela volatilidade desliga a alocação (e vice-versa)
    await usuario.click(screen.getByRole("checkbox", { name: /Tamanho pela volatilidade/ }));
    expect(alocacao).not.toBeChecked();
    await usuario.click(alocacao);
    expect(screen.getByRole("checkbox", { name: /Tamanho pela volatilidade/ })).not.toBeChecked();
  });

  it("escolhe um indicador novo, a linha dele e os parâmetros", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.selectOptions(screen.getByLabelText("Lado direito: tipo"), "bollinger");
    expect(
      screen.getByText(/RSI\(14\) abaixo de banda inferior de Bollinger\(20, 2\)\./),
    ).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Lado direito: linha de Bollinger"), "percentualB");
    const desvios = screen.getByLabelText("Lado direito: desvios-padrão de Bollinger");
    await usuario.clear(desvios);
    await usuario.type(desvios, "2,5");
    expect(screen.getByText(/abaixo de %B de Bollinger\(20; 2,5\)\./)).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Lado esquerdo: tipo"), "maxima");
    expect(screen.getByText(/Compra quando/).parentElement).toHaveTextContent(
      /^Compra quando máxima abaixo de/,
    );
  });

  it("adiciona uma condição pronta pelo teclado e pela paleta", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.selectOptions(
      screen.getByLabelText("Adicionar condição pronta ao grupo E"),
      "pronta:rompimento",
    );
    expect(screen.getAllByText(/preço acima de topo de Donchian\(20\)/).length).toBeGreaterThan(0);
    const dataTransfer = transferencia();
    const bloco = screen.getByText("Volume alto", { selector: "strong" }).closest("li")!;
    disparar(bloco, createEvent.dragStart, dataTransfer);
    const [zona] = screen.getAllByText("Soltar aqui");
    disparar(zona!, createEvent.dragOver, dataTransfer);
    disparar(zona!, createEvent.drop, dataTransfer);
    expect(screen.getAllByText(/volume relativo\(20\) acima de 1,5/).length).toBeGreaterThan(0);
  });

  it("configura as saídas: stop por ATR, stop móvel, empate e tempo", async () => {
    const { aoSalvar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText("Nome da estratégia"), "Com saídas");
    await usuario.click(screen.getByRole("radio", { name: "Pela volatilidade (ATR)" }));
    expect(screen.getByLabelText("Stop máximo (%)")).toHaveValue("2,5");
    await usuario.click(screen.getByRole("radio", { name: "Por %" }));
    await usuario.click(screen.getByRole("checkbox", { name: /empate/ }));
    await usuario.click(screen.getByRole("checkbox", { name: "Sair por tempo" }));
    const candles = screen.getByLabelText("Depois de quantos candles");
    await usuario.clear(candles);
    await usuario.type(candles, "12");
    expect(screen.getByText("sai depois de 12 candles, se nada disso vier antes")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Criar estratégia" }));
    const [, estrategia] = aoSalvar.mock.calls[0]!;
    expect(estrategia).toMatchObject({
      stopAtr: { periodo: 14, multiplo: 2 },
      stopMovel: { tipo: "percentual", distancia: 0.03 },
      empate: { gatilho: 0.02 },
      tempoMaximo: 12,
    });
    const { nome: _nome, ...campos } = estrategia;
    expect(validarEstrategia({ ...campos, saida: undefined } as never)).toEqual([]);
  });

  it("valor de saída inválido bloqueia o salvar e diz o motivo", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText("Nome da estratégia"), "x");
    await usuario.click(screen.getByRole("checkbox", { name: /Tamanho pela volatilidade/ }));
    await usuario.clear(screen.getByLabelText("Quantos ATR de risco"));
    expect(screen.getByText(/O múltiplo do ATR do tamanho precisa ser um número/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar estratégia" })).toBeDisabled();
  });

  it("escolhe a direção: o lado vendido ganha as abas dele e a prévia descreve a venda", async () => {
    const { aoSalvar } = montar();
    const usuario = userEvent.setup();
    const direcao = screen.getByRole("group", { name: "Direção" });
    expect(within(direcao).getByRole("radio", { name: "Só comprado" })).toBeChecked();
    expect(screen.getByText(/só existe no backtest do mini índice \(WIN\)/)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Entrada vendida (quando vender)" })).toBeNull();

    await usuario.type(screen.getByLabelText("Nome da estratégia"), "Dois lados");
    await usuario.click(within(direcao).getByRole("radio", { name: "Os dois sentidos" }));
    const abas = screen.getByRole("group", { name: "Regra em edição" });
    expect(within(abas).getByRole("radio", { name: "Entrada (quando comprar)" })).toBeInTheDocument();
    expect(within(abas).getByRole("radio", { name: "Entrada vendida (quando vender)" })).toBeChecked();
    expect(screen.getByText(/Vende quando/).parentElement).toHaveTextContent(
      "Vende quando RSI(14) acima de 70.",
    );
    expect(screen.getByText(/Recompra quando/).parentElement).toHaveTextContent(
      "Recompra quando o preço chegar ao stop ou ao alvo.",
    );

    await usuario.click(screen.getByRole("checkbox", { name: /saída antecipada da venda/ }));
    expect(within(abas).getByRole("radio", { name: "Saída vendida (quando recomprar antes)" })).toBeChecked();

    await usuario.click(within(direcao).getByRole("radio", { name: "Só vendido" }));
    expect(within(abas).queryByRole("radio", { name: "Entrada (quando comprar)" })).toBeNull();
    expect(screen.queryByText(/Compra quando/)).toBeNull();

    await usuario.click(screen.getByRole("button", { name: "Criar estratégia" }));
    const [, estrategia] = aoSalvar.mock.calls[0]!;
    expect(estrategia).toMatchObject({
      direcao: "vendido",
      entradaVendida: { tipo: "e" },
      saidaVendida: { tipo: "ou" },
    });
    expect(validarEstrategia(paraDominio(estrategia))).toEqual([]);
  });

  it("lista os modelos de cripto e do mini índice, com o selo e a regra de venda", async () => {
    montar();
    const usuario = userEvent.setup();
    expect(screen.getByText(new RegExp(`${TODOS_OS_MODELOS.length} exemplos`))).toBeInTheDocument();
    await usuario.click(screen.getByText("Começar de um modelo"));
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(
      TODOS_OS_MODELOS.length,
    );
    const lista = within(document.querySelector<HTMLElement>(".modelos__lista")!);
    const nosDoisSentidos = MODELOS_WIN.filter((m) => m.estrategia.direcao === "ambos").length;
    expect(lista.getAllByText("Mini índice (WIN) · 5 min · nos dois sentidos")).toHaveLength(nosDoisSentidos);
    expect(lista.getAllByText("Mini índice (WIN) · 5 min · só comprado")).toHaveLength(
      MODELOS_WIN.length - nosDoisSentidos,
    );
    expect(lista.getAllByText("Vende quando")).toHaveLength(nosDoisSentidos);
    expect(lista.getAllByText("Compra quando")).toHaveLength(TODOS_OS_MODELOS.length);
  });

  it("começa de um modelo do mini índice e salva com os dois sentidos", async () => {
    const { aoSalvar } = montar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByText("Começar de um modelo"));
    const modelo = MODELOS_WIN[0]!;
    await usuario.click(screen.getByRole("button", { name: `Usar este modelo: ${modelo.nome}` }));
    expect(screen.getByRole("radio", { name: "Os dois sentidos" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Saída vendida (quando recomprar antes)" })).toBeInTheDocument();
    expect(screen.getByText(/Sai da compra quando/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Criar estratégia" }));
    const [id, estrategia] = aoSalvar.mock.calls[0]!;
    expect(id).toBeNull();
    expect(estrategia).toEqual({ nome: modelo.nome, ...modelo.estrategia });
    expect(estrategia.direcao).toBe("ambos");
    expect(estrategia.entradaVendida).toBeDefined();
  });

  it("VWAP aparece no grupo do pregão, sem parênteses vazios", async () => {
    montar();
    const usuario = userEvent.setup();
    const tipo = screen.getByLabelText("Lado esquerdo: tipo");
    expect(within(tipo).getByRole("group", { name: "Pregão (sessão)" })).toBeInTheDocument();
    await usuario.selectOptions(tipo, "vwap");
    expect(screen.getByText(/Compra quando/).parentElement).toHaveTextContent(
      /^Compra quando VWAP do dia abaixo de 30\.$/,
    );
    const separadores = [...tipo.closest(".operando")!.querySelectorAll(".operando__sep")];
    expect(separadores.map((x) => x.textContent?.trim())).toEqual([]);
    await usuario.selectOptions(tipo, "faixaAbertura");
    expect(screen.getByLabelText("Lado esquerdo: minutos de faixa de abertura")).toHaveValue("30");
  });

  it("bloco Horário: dois campos, janela que passa da meia-noite explicada, estratégia salva com a regra", async () => {
    const { aoSalvar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText("Nome da estratégia"), "Só de madrugada");
    const raiz = screen.getByRole("group", { name: "Adicionar ao grupo E" });
    await usuario.click(within(raiz).getByRole("button", { name: /Horário/ }));
    const de = screen.getByLabelText("Horário: de");
    const ate = screen.getByLabelText("até");
    expect(de).toHaveValue("12:00");
    expect(ate).toHaveValue("15:00");
    expect(
      screen.getAllByText(/o candle abrir entre 12:00 e 15:00 \(horário de Brasília\)/).length,
    ).toBeGreaterThan(0);
    fireEvent.change(de, { target: { value: "22:00" } });
    fireEvent.change(ate, { target: { value: "02:00" } });
    expect(screen.getByText(/a janela passa da meia-noite/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Criar estratégia" }));
    const estrategia = aoSalvar.mock.calls[0]![1];
    expect(estrategia.entrada).toMatchObject({
      tipo: "e",
      regras: [{ tipo: "comparar" }, { tipo: "horario", de: "22:00", ate: "02:00" }],
    });
    expect(validarRegra(estrategia.entrada)).toEqual([]);
  });

  it("janela com os dois horários iguais: explica e não deixa salvar", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText("Nome da estratégia"), "Janela vazia");
    const raiz = screen.getByRole("group", { name: "Adicionar ao grupo E" });
    await usuario.click(within(raiz).getByRole("button", { name: /Horário/ }));
    fireEvent.change(screen.getByLabelText("até"), { target: { value: "12:00" } });
    expect(screen.getByText(/precisam ser diferentes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar estratégia" })).toBeDisabled();
  });

  it("acessível (axe) com o bloco de horário na árvore", async () => {
    const { container } = renderizar(
      <Construtor inicial={estadoVazio()} salvando={false} aoSalvar={vi.fn()} />,
      criarFonteDemo({ latenciaMs: [0, 0] }),
    );
    await userEvent.click(
      within(screen.getByRole("group", { name: "Adicionar ao grupo E" })).getByRole("button", {
        name: /Horário/,
      }),
    );
    const r = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
      resultTypes: ["violations"],
    });
    expect(r.violations).toEqual([]);
  });
});
