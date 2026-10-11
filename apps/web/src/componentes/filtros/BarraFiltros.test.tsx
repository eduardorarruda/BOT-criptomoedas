import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutGrid, Table } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buscaAtual, renderizarNaRota } from "../../teste/rota";
import { BarraFiltros } from "./BarraFiltros";
import { FiltroChips, Interruptor } from "./Chips";
import { campo } from "./esquemas";
import { AlternarDensidade, AlternarVisao, SeletorOrdem } from "./Ferramentas";
import { contemTexto, lerLista, ordenarPor } from "./logica";
import { SeletorPeriodo } from "./SeletorPeriodo";
import { SemResultados } from "./SemResultados";
import { useFiltrosUrl } from "./useFiltrosUrl";
import { VisoesSalvas } from "./VisoesSalvas";

const CORES = ["verde", "azul", "roxo"] as const;
const esquema = z.object({
  q: campo.busca(),
  cor: campo.lista(CORES),
  grande: campo.ligado(),
  periodo: campo.periodo(),
  de: campo.dia(),
  ate: campo.dia(),
  ordem: campo.opcao(["nome", "tamanho"] as const),
  dir: campo.opcao(["asc", "desc"] as const),
  visao: campo.opcao(["cartoes", "tabela"] as const),
  densidade: campo.opcao(["compacta"] as const),
});
const ITENS = [
  { nome: "Folha", cor: "verde", tamanho: 2 },
  { nome: "Céu", cor: "azul", tamanho: 9 },
  { nome: "Uva", cor: "roxo", tamanho: 1 },
  { nome: "Mar", cor: "azul", tamanho: 7 },
] as const;

function Tela() {
  const { busca, mudar, limpar, aplicar, ativos } = useFiltrosUrl(esquema);
  const cores = lerLista(busca.cor, CORES);
  const filtrados = ordenarPor(
    ITENS.filter(
      (i) =>
        contemTexto(busca.q, [i.nome]) &&
        (cores.length === 0 || cores.includes(i.cor)) &&
        (!busca.grande || i.tamanho > 5),
    ),
    (i) => (busca.ordem === "tamanho" ? i.tamanho : i.nome),
    busca.dir ?? "asc",
  );
  return (
    <>
      <BarraFiltros
        rotulo="Filtros das coisas"
        busca={{
          valor: busca.q,
          aoMudar: (q) => mudar({ q }, { substituir: true }),
          rotulo: "Buscar coisas",
          sugestao: "nome",
        }}
        ativos={ativos}
        aoLimpar={limpar}
        resumo={`${filtrados.length} de ${ITENS.length} coisas`}
        extra={<VisoesSalvas tela="teste" buscaAtual={busca} aoAplicar={aplicar} />}
        ferramentas={
          <>
            <SeletorOrdem
              opcoes={[
                { valor: "nome", rotulo: "Nome", direcao: "asc" },
                { valor: "tamanho", rotulo: "Tamanho", direcao: "desc" },
              ]}
              valor={busca.ordem ?? "nome"}
              direcao={busca.dir ?? "asc"}
              aoMudar={(ordem, dir) => mudar({ ordem, dir })}
            />
            <AlternarVisao
              opcoes={[
                { valor: "cartoes", rotulo: "Cartões", icone: LayoutGrid },
                { valor: "tabela", rotulo: "Tabela", icone: Table },
              ]}
              valor={busca.visao ?? "cartoes"}
              aoMudar={(visao) => mudar({ visao: visao === "cartoes" ? undefined : visao })}
            />
            <AlternarDensidade
              compacta={busca.densidade === "compacta"}
              aoMudar={(c) => mudar({ densidade: c ? "compacta" : undefined })}
            />
          </>
        }
      >
        <FiltroChips
          rotulo="Cor"
          opcoes={CORES.map((c) => ({
            valor: c,
            rotulo: c,
            contagem: ITENS.filter((i) => i.cor === c).length,
          }))}
          selecionados={cores}
          aoMudar={(v) => mudar({ cor: v.join(",") || undefined })}
        />
        <Interruptor
          rotulo="Só grandes"
          ligado={busca.grande === true}
          aoMudar={(l) => mudar({ grande: l || undefined })}
        />
        <SeletorPeriodo valor={busca} aoMudar={(p) => mudar(p)} />
      </BarraFiltros>
      {filtrados.length === 0 ? (
        <SemResultados aoLimpar={limpar} />
      ) : (
        <ul aria-label="Coisas">
          {filtrados.map((i) => (
            <li key={i.nome}>{i.nome}</li>
          ))}
        </ul>
      )}
    </>
  );
}

const nomes = () =>
  within(screen.getByRole("list", { name: "Coisas" }))
    .getAllByRole("listitem")
    .map((l) => l.textContent);

afterEach(() => vi.useRealTimers());

describe("barra de filtros com estado na URL", () => {
  it("abre já filtrada a partir do link e mostra quantos filtros valem", async () => {
    renderizarNaRota(<Tela />, { caminho: "/?cor=azul&ordem=tamanho&dir=desc" });
    expect(await screen.findByText("2 de 4 coisas")).toBeInTheDocument();
    expect(nomes()).toEqual(["Céu", "Mar"]);
    expect(screen.getByRole("checkbox", { name: /azul/ })).toBeChecked();
    expect(screen.getByRole("button", { name: /Limpar filtros \(1\)/ })).toBeInTheDocument();
  });

  it("pastilhas e interruptor escrevem na URL; voltar desfaz", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Tela />);
    await usuario.click(await screen.findByRole("checkbox", { name: /azul/ }));
    await usuario.click(screen.getByRole("checkbox", { name: /roxo/ }));
    await waitFor(() => expect(buscaAtual(roteador).cor).toBe("azul,roxo"));
    expect(nomes()).toEqual(["Céu", "Mar", "Uva"]);
    await usuario.click(screen.getByRole("switch", { name: /Só grandes/ }));
    await waitFor(() => expect(buscaAtual(roteador).grande).toBe(true));
    expect(nomes()).toEqual(["Céu", "Mar"]);
    act(() => roteador.history.back());
    await waitFor(() => expect(buscaAtual(roteador).grande).toBeUndefined());
    expect(nomes()).toEqual(["Céu", "Mar", "Uva"]);
  });

  it("a busca espera parar de digitar, ignora acento e não empilha histórico", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Tela />);
    const campo = await screen.findByRole("searchbox", { name: "Buscar coisas" });
    const antes = roteador.history.length;
    await usuario.type(campo, "ceu");
    await waitFor(() => expect(buscaAtual(roteador).q).toBe("ceu"));
    expect(nomes()).toEqual(["Céu"]);
    expect(roteador.history.length).toBe(antes);
    await usuario.keyboard("{Escape}");
    await waitFor(() => expect(buscaAtual(roteador).q).toBeUndefined());
  });

  it("limpar tira os filtros e mantém a visão e a ordem", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Tela />, {
      caminho: "/?cor=verde&grande=true&visao=tabela&ordem=tamanho",
    });
    expect(await screen.findByText("Nenhum item com esses filtros")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(buscaAtual(roteador)).toEqual({ visao: "tabela", ordem: "tamanho" }));
    expect(screen.getByRole("radio", { name: "Tabela" })).toBeChecked();
    expect(nomes()).toHaveLength(4);
  });

  it("ordem, visão, densidade e período personalizado", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Tela />);
    await usuario.selectOptions(await screen.findByRole("combobox", { name: "Ordenar" }), "tamanho");
    await waitFor(() => expect(buscaAtual(roteador)).toMatchObject({ ordem: "tamanho", dir: "desc" }));
    expect(nomes()[0]).toBe("Céu");
    await usuario.click(screen.getByRole("button", { name: /Ordem decrescente/ }));
    await waitFor(() => expect(buscaAtual(roteador).dir).toBe("asc"));
    await usuario.click(screen.getByRole("radio", { name: "Tabela" }));
    await usuario.click(screen.getByRole("button", { name: "Compacto" }));
    await waitFor(() =>
      expect(buscaAtual(roteador)).toMatchObject({ visao: "tabela", densidade: "compacta" }),
    );
    expect(screen.getByRole("button", { name: "Compacto" })).toHaveAttribute("aria-pressed", "true");
    await usuario.click(screen.getByRole("radio", { name: "Escolher datas" }));
    const de = screen.getByLabelText("De");
    await usuario.type(de, "2026-10-01");
    await waitFor(() =>
      expect(buscaAtual(roteador)).toMatchObject({ periodo: "personalizado", de: "2026-10-01" }),
    );
    await usuario.click(screen.getByRole("radio", { name: "30 dias" }));
    await waitFor(() => expect(buscaAtual(roteador).de).toBeUndefined());
  });

  it("visões salvas guardam e reaplicam os filtros", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Tela />, { caminho: "/?cor=roxo" });
    await usuario.click(await screen.findByText(/Visões salvas/));
    await usuario.type(screen.getByRole("textbox", { name: "Nome da visão" }), "Só roxo");
    await usuario.click(screen.getByRole("button", { name: "Salvar" }));
    expect(JSON.parse(localStorage.getItem("zentrade:visoes:teste") ?? "[]")).toEqual([
      { nome: "Só roxo", busca: { cor: "roxo" } },
    ]);
    await usuario.click(screen.getAllByRole("button", { name: /Limpar filtros/ })[0]!);
    await waitFor(() => expect(buscaAtual(roteador).cor).toBeUndefined());
    await usuario.click(screen.getByText(/Visões salvas/));
    await usuario.click(screen.getByRole("button", { name: "Só roxo" }));
    await waitFor(() => expect(buscaAtual(roteador).cor).toBe("roxo"));
    await usuario.click(screen.getByText(/Visões salvas/));
    await usuario.click(screen.getByRole("button", { name: "Apagar a visão Só roxo" }));
    expect(localStorage.getItem("zentrade:visoes:teste")).toBe("[]");
  });

  it("no celular os grupos vão para uma folha com o contador", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...original(q), matches: true })) as typeof window.matchMedia;
    try {
      const usuario = userEvent.setup();
      renderizarNaRota(<Tela />, { caminho: "/?cor=azul,verde&grande=true" });
      // Conta filtros (cor, tamanho), não opções marcadas.
      const abrir = await screen.findByRole("button", { name: "Filtros, 2 ativos" });
      expect(screen.queryByRole("checkbox", { name: /azul/ })).not.toBeInTheDocument();
      await usuario.click(abrir);
      const folha = await screen.findByRole("dialog", { name: "Filtros" });
      expect(within(folha).getByRole("checkbox", { name: /azul/ })).toBeChecked();
      await usuario.click(within(folha).getByRole("button", { name: "Ver resultados" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it("mais filtros: o botão sempre aponta para um painel que existe e abre/fecha", async () => {
    const usuario = userEvent.setup();
    function ComMais() {
      return (
        <BarraFiltros
          rotulo="Com mais"
          ativos={0}
          aoLimpar={() => undefined}
          maisFiltros={<Interruptor rotulo="Raro" ligado={false} aoMudar={() => undefined} />}
        >
          <Interruptor rotulo="Comum" ligado={false} aoMudar={() => undefined} />
        </BarraFiltros>
      );
    }
    renderizarNaRota(<ComMais />);
    const botao = await screen.findByRole("button", { name: "Mais filtros" });
    const alvo = document.getElementById(botao.getAttribute("aria-controls") ?? "");
    expect(alvo).not.toBeNull();
    expect(alvo).not.toBeVisible();
    await usuario.click(botao);
    expect(screen.getByRole("button", { name: "Menos filtros" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("switch", { name: "Raro" })).toBeVisible();
  });
});
