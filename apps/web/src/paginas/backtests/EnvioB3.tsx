import { useQueryClient } from "@tanstack/react-query";
import type { ImportacaoB3DTO } from "@zentrade/contratos/esquemas";
import { CircleAlert, CircleCheck, FileUp, LoaderCircle } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { chaves } from "../../ganchos/chaves";
import { acompanharImportacao, conferirZipB3, type ApiImportacaoB3 } from "./apiB3";

type Situacao = "enviando" | "na_fila" | "lendo" | "concluida" | "falhou" | "erro";

interface ItemEnvio {
  readonly id: number;
  readonly nome: string;
  readonly progresso: number;
  readonly situacao: Situacao;
  readonly mensagem: string | null;
}

const TEXTO: Record<Situacao, string> = {
  enviando: "Enviando",
  na_fila: "Na fila do motor",
  lendo: "Lendo e gravando as velas",
  concluida: "Importado",
  falhou: "Não entrou",
  erro: "Não entrou",
};

function Item({ item }: { readonly item: ItemEnvio }) {
  const comErro = item.situacao === "erro" || item.situacao === "falhou";
  const Icone = comErro ? CircleAlert : item.situacao === "concluida" ? CircleCheck : LoaderCircle;
  const girando = !comErro && item.situacao !== "concluida";
  return (
    <li className={`upb3__item upb3__item--${comErro ? "erro" : item.situacao}`}>
      <Icone size={15} aria-hidden="true" className={girando ? "girar" : ""} />
      <span className="upb3__nome">{item.nome}</span>
      <span className="upb3__situacao">{item.mensagem ?? TEXTO[item.situacao]}</span>
      {item.situacao === "enviando" ? (
        <progress
          className="upb3__barra"
          max={1}
          value={item.progresso}
          aria-label={`Envio de ${item.nome}`}
        />
      ) : null}
    </li>
  );
}

const resumoDeDias = (r: ImportacaoB3DTO["resumo"]): string | null =>
  r === null || r.dias.length === 0
    ? null
    : `${r.dias.length} ${r.dias.length === 1 ? "pregão" : "pregões"}: ${r.dias.map((d) => d.data).join(", ")}`;

/**
 * Arrastar e soltar (ou escolher) os .zip "Negócio a negócio" baixados à mão no BDI: o
 * sistema nunca baixa nada da B3 (ela proíbe coleta automatizada das próprias páginas).
 * Cada .zip sobe com barra de progresso; depois a tela acompanha o motor processar (fila)
 * até concluir ou falhar, e atualiza a lista de candles do WIN disponíveis.
 */
export function EnvioB3({
  api,
  aoConcluir,
}: {
  readonly api: ApiImportacaoB3;
  readonly aoConcluir?: () => void;
}) {
  const qc = useQueryClient();
  const idEntrada = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<readonly ItemEnvio[]>([]);
  const [sobre, setSobre] = useState(false);
  const proximo = useRef(0);
  const mudar = (id: number, m: Partial<ItemEnvio>) =>
    setItens((l) => l.map((i) => (i.id === id ? { ...i, ...m } : i)));

  const acompanhar = async (id: number, importacaoId: string) => {
    const fim = await acompanharImportacao(api, importacaoId, (atual) =>
      mudar(id, { situacao: atual.estado }),
    );
    if (fim.estado === "concluida") {
      mudar(id, { situacao: "concluida", mensagem: resumoDeDias(fim.resumo) });
      void qc.invalidateQueries({ queryKey: chaves.dadosWin });
      aoConcluir?.();
    } else mudar(id, { situacao: "falhou", mensagem: fim.erro });
  };

  const enviarUm = async (arquivo: File) => {
    const id = ++proximo.current;
    const problema = conferirZipB3(arquivo);
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
      const r = await api.enviar(arquivo, (p) => mudar(id, { progresso: p }));
      mudar(id, { situacao: "na_fila", mensagem: null });
      await acompanhar(id, r.id);
    } catch (e) {
      mudar(id, { situacao: "erro", mensagem: mensagemDe(e) });
    }
  };
  const enviar = async (lista: FileList | null) => {
    for (const arquivo of Array.from(lista ?? [])) await enviarUm(arquivo);
  };
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    void enviar(e.dataTransfer.files);
  };

  return (
    <div className="upb3">
      {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- arrastar é atalho do mouse; pelo teclado, o botão "escolha no computador" faz o mesmo */}
      <div
        className={`upb3__zona ${sobre ? "upb3__zona--sobre" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
      >
        <FileUp size={26} strokeWidth={1.6} aria-hidden="true" />
        <p>
          Arraste os .zip da B3 para cá ou{" "}
          <button type="button" className="upb3__escolher" onClick={() => entrada.current?.click()}>
            escolha no computador
          </button>
        </p>
        <p className="apagado upb3__dica">
          O .zip "Negócio a negócio" baixado à mão no BDI, até 150 MB cada. Pode soltar vários de uma vez.
        </p>
        <label htmlFor={idEntrada} className="so-leitor">
          Arquivos .zip da B3
        </label>
        <input
          id={idEntrada}
          ref={entrada}
          type="file"
          multiple
          hidden
          accept=".zip"
          onChange={(e) => {
            void enviar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {itens.length > 0 ? (
        <ul className="upb3__lista" role="list" aria-live="polite">
          {itens.map((i) => (
            <Item key={i.id} item={i} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
