import { ListTree, Plus } from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../api/erros";
import { useAvisos } from "../componentes/Avisos";
import { Botao } from "../componentes/Botao";
import { Cabecalho } from "../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { Construtor } from "../construtor/Construtor";
import { frase } from "../construtor/descrever";
import { deEstrategia, estadoVazio } from "../construtor/estado";
import { deRegra } from "../construtor/arvore";
import { useEstrategias } from "../ganchos/consultas";
import { useSalvarEstrategia } from "../ganchos/mutacoes";

export function Estrategias() {
  const consulta = useEstrategias();
  const salvar = useSalvarEstrategia();
  const avisar = useAvisos();
  const [selecionada, setSelecionada] = useState<string | "nova" | null>(null);
  const lista = consulta.data ?? [];
  const atual = selecionada === "nova" ? null : (lista.find((e) => e.id === selecionada) ?? lista[0] ?? null);
  const editando = selecionada === "nova" || (!atual && consulta.isSuccess) ? "nova" : (atual?.id ?? null);
  const inicial = editando === "nova" || !atual ? estadoVazio() : deEstrategia(atual);

  return (
    <>
      <Cabecalho
        titulo="Estratégias"
        acoes={
          <Botao variante="secundario" icone={Plus} onClick={() => setSelecionada("nova")}>
            Nova estratégia
          </Botao>
        }
      >
        Monte as regras com blocos E, OU e NÃO. A prévia mostra em palavras o que a regra faz e o que ela
        diria agora.
      </Cabecalho>
      {consulta.isPending ? <Esqueleto altura={480} rotulo="Carregando estratégias" /> : null}
      {consulta.error ? (
        <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
      ) : null}
      {consulta.isSuccess ? (
        <div className="estrategias">
          <nav className="estrategias__lista" aria-label="Suas estratégias">
            {lista.length === 0 ? (
              <EstadoVazio icone={ListTree} titulo="Nenhuma estratégia">
                Comece pela regra ao lado: um exemplo simples já vem montado.
              </EstadoVazio>
            ) : (
              <ul role="list">
                {lista.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="estrategias__item"
                      aria-current={editando === e.id ? "true" : undefined}
                      onClick={() => setSelecionada(e.id)}
                    >
                      <span className="estrategias__nome">{e.nome}</span>
                      <span className="estrategias__versao num">v{e.versao}</span>
                      <span className="estrategias__frase">{frase(deRegra(e.entrada))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
          <Construtor
            key={editando ?? "nova"}
            inicial={inicial}
            salvando={salvar.isPending}
            aoSalvar={(id, estrategia) =>
              salvar.mutate(
                { id, estrategia },
                {
                  onSuccess: (e) => {
                    setSelecionada(e.id);
                    avisar(
                      "sucesso",
                      id
                        ? `${e.nome}: versão ${e.versao} salva. Robôs na versão antiga continuam nela até você trocar.`
                        : `${e.nome} criada.`,
                    );
                  },
                  onError: (e) => avisar("erro", mensagemDe(e)),
                },
              )
            }
          />
        </div>
      ) : null}
    </>
  );
}
