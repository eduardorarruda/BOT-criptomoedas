import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { FONTE_DOCUMENTO } from "../../lib/rotulos";
import { formatarData } from "../../lib/tempo";
import type { ApiConhecimento } from "./api";

const LIMITE_TRECHO = 320;

/** Busca no conhecimento como o agente busca (semântica + palavras), para conferir o que ele vai achar. */
export function BuscaConhecimento({ api }: { readonly api: ApiConhecimento }) {
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  const busca = useQuery({
    queryKey: ["conhecimento", "busca", consulta],
    queryFn: () => api.buscar(consulta),
    enabled: consulta !== "",
  });
  // Só um aviso: se o estado não vier, a busca continua funcionando e o aviso não aparece.
  const estado = useQuery({ queryKey: ["conhecimento", "estado"], queryFn: () => api.estado() });
  const soPalavras =
    estado.data?.busca === "palavras" || (busca.data ?? []).some((r) => r.modo === "palavras");
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setConsulta(texto.trim());
  };
  return (
    <div className="busca-conhecimento">
      <form className="busca-conhecimento__form" role="search" onSubmit={enviar}>
        <label htmlFor="busca-rag" className="so-leitor">
          Buscar no conhecimento
        </label>
        <Search size={16} aria-hidden="true" />
        <input
          id="busca-rag"
          type="search"
          className="campo__entrada"
          placeholder="Ex.: taxa de saque em USDT"
          value={texto}
          maxLength={500}
          onChange={(e) => setTexto(e.target.value)}
        />
      </form>
      {soPalavras ? (
        <p className="apagado busca-conhecimento__modo">
          Busca só por palavras (sem embeddings configurados).
        </p>
      ) : null}
      {busca.isFetching ? <Esqueleto linhas={3} rotulo="Buscando" /> : null}
      {busca.error ? (
        <ErroCarregar erro={busca.error} tentarDeNovo={() => void busca.refetch()} compacto />
      ) : null}
      {busca.isSuccess && busca.data.length === 0 ? (
        <p className="apagado">Nada parecido na sua base. Tente outras palavras.</p>
      ) : null}
      {busca.data && busca.data.length > 0 ? (
        <ol className="busca-conhecimento__resultados" role="list">
          {busca.data.map((r) => (
            <li key={r.trechoId}>
              <p className="busca-conhecimento__origem">
                <strong>{r.titulo}</strong>
                <span className="apagado">
                  {" "}
                  · {FONTE_DOCUMENTO[r.fonte]} · {formatarData(r.publicadoEm)}
                </span>
              </p>
              <p className="busca-conhecimento__trecho">
                {r.texto.length > LIMITE_TRECHO ? `${r.texto.slice(0, LIMITE_TRECHO)}…` : r.texto}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
