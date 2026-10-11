import { useQueryClient } from "@tanstack/react-query";
import type { FonteDocumento } from "@zentrade/contratos/esquemas";
import { CircleAlert, CircleCheck, FileUp, LoaderCircle } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { chaves } from "../../ganchos/chaves";
import { conferirArquivo, EXTENSOES_ACEITAS, type ApiConhecimento } from "./api";
import { CHAVE_DOCUMENTOS, EscolhaFonte } from "./comum";

type Situacao = "enviando" | "processando" | "pronto" | "repetido" | "erro";

interface ItemEnvio {
  readonly id: number;
  readonly nome: string;
  readonly progresso: number;
  readonly situacao: Situacao;
  readonly mensagem: string | null;
}

const TEXTO: Record<Situacao, string> = {
  enviando: "Enviando",
  processando: "Lendo e indexando",
  pronto: "No seu conhecimento",
  repetido: "Já estava (mesmo conteúdo)",
  erro: "Não entrou",
};

function Item({ item }: { readonly item: ItemEnvio }) {
  const Icone =
    item.situacao === "erro"
      ? CircleAlert
      : item.situacao === "pronto" || item.situacao === "repetido"
        ? CircleCheck
        : LoaderCircle;
  const girando = item.situacao === "enviando" || item.situacao === "processando";
  return (
    <li className={`envio__item envio__item--${item.situacao}`}>
      <Icone size={15} aria-hidden="true" className={girando ? "girar" : ""} />
      <span className="envio__nome">{item.nome}</span>
      <span className="envio__situacao">{item.mensagem ?? TEXTO[item.situacao]}</span>
      {item.situacao === "enviando" ? (
        <progress
          className="envio__barra"
          max={1}
          value={item.progresso}
          aria-label={`Envio de ${item.nome}`}
        />
      ) : null}
    </li>
  );
}

/** Arrastar e soltar (ou escolher) arquivos: cada um sobe com barra de progresso e entra no RAG. */
export function EnvioArquivos({ api }: { readonly api: ApiConhecimento }) {
  const qc = useQueryClient();
  const idEntrada = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [fonte, setFonte] = useState<FonteDocumento>("nota");
  const [itens, setItens] = useState<readonly ItemEnvio[]>([]);
  const [sobre, setSobre] = useState(false);
  const proximo = useRef(0);
  const mudar = (id: number, m: Partial<ItemEnvio>) =>
    setItens((l) => l.map((i) => (i.id === id ? { ...i, ...m } : i)));

  const enviarUm = async (arquivo: File) => {
    const id = ++proximo.current;
    const problema = conferirArquivo(arquivo);
    const novo: ItemEnvio = {
      id,
      nome: arquivo.name,
      progresso: 0,
      situacao: problema ? "erro" : "enviando",
      mensagem: problema,
    };
    setItens((l) => [novo, ...l].slice(0, 8));
    if (problema) return;
    try {
      const r = await api.enviarArquivo(arquivo, fonte, (p) =>
        mudar(id, { progresso: p, situacao: p >= 1 ? "processando" : "enviando" }),
      );
      const aviso = r.truncado
        ? `Entrou só o começo (${r.caracteres.toLocaleString("pt-BR")} caracteres)`
        : null;
      mudar(id, { situacao: r.novo ? "pronto" : "repetido", mensagem: aviso });
    } catch (e) {
      mudar(id, { situacao: "erro", mensagem: mensagemDe(e) });
    }
  };
  const enviar = async (lista: FileList | null) => {
    for (const arquivo of Array.from(lista ?? [])) await enviarUm(arquivo);
    void qc.invalidateQueries({ queryKey: CHAVE_DOCUMENTOS });
    void qc.invalidateQueries({ queryKey: chaves.documentos });
  };
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    void enviar(e.dataTransfer.files);
  };
  return (
    <div className="envio">
      <EscolhaFonte valor={fonte} aoMudar={setFonte} />
      {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- arrastar é atalho do mouse; pelo teclado, o botão "escolha no computador" faz o mesmo */}
      <div
        className={`envio__zona ${sobre ? "envio__zona--sobre" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
      >
        <FileUp size={26} strokeWidth={1.6} aria-hidden="true" />
        <p>
          Arraste arquivos para cá ou{" "}
          <button type="button" className="envio__escolher" onClick={() => entrada.current?.click()}>
            escolha no computador
          </button>
        </p>
        <p className="apagado envio__dica">
          PDF, DOCX, MD, TXT ou HTML, até 15 MB cada. PDF escaneado (imagem) não tem texto.
        </p>
        <label htmlFor={idEntrada} className="so-leitor">
          Arquivos para o conhecimento
        </label>
        <input
          id={idEntrada}
          ref={entrada}
          type="file"
          multiple
          hidden
          accept={EXTENSOES_ACEITAS.join(",")}
          onChange={(e) => {
            void enviar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {itens.length > 0 ? (
        <ul className="envio__lista" role="list" aria-live="polite">
          {itens.map((i) => (
            <Item key={i.id} item={i} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
