import type { ArquivoIngerido, DocumentoDetalhe } from "@zentrade/contratos/esquemas";
import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { renderizar } from "../../teste/renderizar";
import { Conhecimento } from "../Conhecimento";
import { conferirArquivo, enviarComProgresso, LIMITE_ENVIO_BYTES, type ApiConhecimento } from "./api";

// Sob carga (turbo rodando tudo junto), a resposta em streaming pode passar de 1 s.
configure({ asyncUtilTimeout: 10_000 });

const doc: DocumentoDetalhe = {
  id: "d1",
  fonte: "estrategia",
  titulo: "Plano de risco",
  url: null,
  publicadoEm: Date.UTC(2026, 9, 1),
  criadoEm: Date.UTC(2026, 9, 1),
  origem: "arquivo",
  nomeArquivo: "plano.pdf",
  tipoArquivo: "pdf",
  bytes: 2048,
  trechos: 2,
};
const ingerido: ArquivoIngerido = { ...doc, novo: true, trechos: 2, caracteres: 120, truncado: false };

function apiFalsa(busca: "hibrida" | "palavras" = "hibrida"): ApiConhecimento {
  return {
    estado: vi.fn(async () => ({ busca, trechosSemVetor: 0, motivo: null })),
    documentos: vi.fn(async () => [doc]),
    detalhe: vi.fn(async () => ({
      documento: doc,
      trechos: [{ id: "t1", ordem: 0, texto: "Nunca arriscar mais de 1%." }],
    })),
    apagar: vi.fn(async () => undefined),
    buscar: vi.fn(async () => [
      {
        trechoId: "t1",
        documentoId: "d1",
        fonte: "estrategia" as const,
        titulo: "Plano de risco",
        url: null,
        publicadoEm: 1,
        texto: "Nunca arriscar mais de 1%.",
        pontuacao: 0.1,
        modo: busca,
      },
    ]),
    enviarLink: vi.fn(async () => ({ ...ingerido, titulo: "Página" })),
    enviarArquivo: vi.fn(async (_a: File, _f: string, aoProgresso: (p: number) => void) => {
      aoProgresso(0.5);
      aoProgresso(1);
      return ingerido;
    }),
  };
}

const fonte = { demo: false } as Fonte;

describe("tela de Conhecimento", () => {
  it("lista com a origem, mostra os trechos e apaga com confirmação", async () => {
    const api = apiFalsa();
    renderizar(<Conhecimento api={api} />, fonte);
    expect(await screen.findByText("Plano de risco")).toBeInTheDocument();
    expect(screen.getByText(/Arquivo · plano\.pdf · 2 KB · 2 trechos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trechos" }));
    expect(await screen.findByText("Nunca arriscar mais de 1%.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apagar “Plano de risco”" }));
    await userEvent.click(screen.getByRole("button", { name: "Apagar" }));
    await waitFor(() => expect(api.apagar).toHaveBeenCalledWith("d1"));
  });

  it("envia arquivo solto na área, com progresso e resultado; recusa tipo errado antes de enviar", async () => {
    const api = apiFalsa();
    renderizar(<Conhecimento api={api} />, fonte);
    const zona = (await screen.findByText(/Arraste arquivos para cá/)).closest(".envio__zona")!;
    const bom = new File(["%PDF-1.4"], "plano.pdf", { type: "application/pdf" });
    const ruim = new File(["MZ"], "virus.exe");
    fireEvent.drop(zona, { dataTransfer: { files: [bom, ruim] } });
    expect(await screen.findByText("No seu conhecimento")).toBeInTheDocument();
    expect(screen.getByText(/Tipo não aceito/)).toBeInTheDocument();
    expect(api.enviarArquivo).toHaveBeenCalledTimes(1);
  });

  it("guarda link validando o endereço e busca como o agente", async () => {
    const api = apiFalsa();
    renderizar(<Conhecimento api={api} />, fonte);
    await userEvent.click(await screen.findByRole("radio", { name: "Link" }));
    const campo = screen.getByLabelText("Endereço da página");
    await userEvent.type(campo, "javascript:alert(1)");
    await userEvent.click(screen.getByRole("button", { name: "Guardar link" }));
    expect(screen.getByText(/começando com https/)).toBeInTheDocument();
    await userEvent.clear(campo);
    await userEvent.type(campo, "https://exemplo.com/taxas");
    await userEvent.click(screen.getByRole("button", { name: "Guardar link" }));
    await waitFor(() =>
      expect(api.enviarLink).toHaveBeenCalledWith({ url: "https://exemplo.com/taxas", fonte: "nota" }),
    );

    const busca = screen.getByRole("search");
    await userEvent.type(within(busca).getByRole("searchbox"), "risco{Enter}");
    expect(await screen.findAllByText("Nunca arriscar mais de 1%.")).not.toHaveLength(0);
    expect(api.buscar).toHaveBeenCalledWith("risco");
    expect(screen.queryByText(/só por palavras/)).not.toBeInTheDocument();
  });

  it("sem embeddings configurados, avisa discretamente que a busca é só por palavras", async () => {
    renderizar(<Conhecimento api={apiFalsa("palavras")} />, fonte);
    const busca = await screen.findByRole("search");
    expect(
      await screen.findByText("Busca só por palavras (sem embeddings configurados)."),
    ).toBeInTheDocument();
    expect(busca.parentElement).toHaveTextContent(/só por palavras/);
  });
});

describe("api do conhecimento", () => {
  it("confere tipo, tamanho e arquivo vazio antes de enviar", () => {
    expect(conferirArquivo({ name: "a.PDF", size: 10 })).toBeNull();
    expect(conferirArquivo({ name: "a.exe", size: 10 })).toMatch(/não aceito/);
    expect(conferirArquivo({ name: "a.md", size: 0 })).toMatch(/vazio/);
    expect(conferirArquivo({ name: "a.md", size: LIMITE_ENVIO_BYTES + 1 })).toMatch(/15 MB/);
  });

  function xhrFalso(status: number, resposta: unknown, falhaDeRede = false) {
    const cabecalhos: Record<string, string> = {};
    const xhr = {
      upload: {} as {
        onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void;
      },
      status,
      responseText: JSON.stringify(resposta),
      onload: undefined as undefined | (() => void),
      onerror: undefined as undefined | (() => void),
      open: vi.fn(),
      setRequestHeader: (k: string, v: string) => void (cabecalhos[k] = v),
      send: () => {
        xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        if (falhaDeRede) xhr.onerror?.();
        else xhr.onload?.();
      },
    };
    return { xhr: xhr as unknown as XMLHttpRequest, cabecalhos };
  }

  it("envia com progresso e o CSRF; erro da API vira a mensagem dela", async () => {
    const { xhr, cabecalhos } = xhrFalso(201, ingerido);
    const progresso: number[] = [];
    const r = await enviarComProgresso(
      "/x",
      new Blob(["a"]),
      "csrf",
      (p) => progresso.push(p),
      () => xhr,
    );
    expect(r.titulo).toBe("Plano de risco");
    expect(progresso).toEqual([0.5]);
    expect(cabecalhos["X-CSRF-Token"]).toBe("csrf");
    const erro = xhrFalso(422, { erro: { codigo: "arquivo_invalido", mensagem: "Não é um PDF." } }).xhr;
    await expect(
      enviarComProgresso(
        "/x",
        new Blob(["a"]),
        null,
        () => undefined,
        () => erro,
      ),
    ).rejects.toMatchObject({
      mensagem: "Não é um PDF.",
    });
    const rede = xhrFalso(0, null, true).xhr;
    await expect(
      enviarComProgresso(
        "/x",
        new Blob(["a"]),
        null,
        () => undefined,
        () => rede,
      ),
    ).rejects.toMatchObject({
      codigo: "sem_conexao",
    });
    const torto = xhrFalso(201, { nada: 1 }).xhr;
    await expect(
      enviarComProgresso(
        "/x",
        new Blob(["a"]),
        null,
        () => undefined,
        () => torto,
      ),
    ).rejects.toMatchObject({
      codigo: "resposta_invalida",
    });
  });
});
