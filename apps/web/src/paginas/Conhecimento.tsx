import { BookOpen, ExternalLink, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useFonte } from "../api/contexto";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { Segmentado } from "../componentes/Segmentado";
import { Selo } from "../componentes/Selo";
import { useDocumentos } from "../ganchos/consultas";
import { linkSeguro } from "../lib/link";
import { FONTE_DOCUMENTO } from "../lib/rotulos";
import { formatarData } from "../lib/tempo";
import { criarApiConhecimento, type ApiConhecimento } from "./conhecimento/api";
import { BuscaConhecimento } from "./conhecimento/BuscaConhecimento";
import "./conhecimento/conhecimento.css";
import { EnvioArquivos } from "./conhecimento/EnvioArquivos";
import { NovaNota, NovoLink } from "./conhecimento/Formularios";
import { ListaDocumentos } from "./conhecimento/ListaDocumentos";

type Aba = "arquivo" | "link" | "nota";
const ABAS: readonly { valor: Aba; rotulo: string }[] = [
  { valor: "arquivo", rotulo: "Arquivo" },
  { valor: "link", rotulo: "Link" },
  { valor: "nota", rotulo: "Nota" },
];

/** Modo de demonstração: a lista vem da fonte de mentira; envio e busca precisam da API. */
function ListaDemo() {
  const consulta = useDocumentos();
  if (consulta.isPending) return <Esqueleto forma="lista" linhas={6} rotulo="Carregando documentos" />;
  if (consulta.error)
    return <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />;
  if (consulta.data.length === 0) {
    return (
      <EstadoVazio icone={BookOpen} titulo="Conhecimento vazio">
        Escreva uma nota ao lado.
      </EstadoVazio>
    );
  }
  return (
    <ul role="list" className="documentos">
      {consulta.data.map((d) => {
        const link = linkSeguro(d.url);
        return (
          <li key={d.id} className="documento">
            <Selo tom={d.fonte === "nota" ? "marca" : "neutro"}>{FONTE_DOCUMENTO[d.fonte]}</Selo>
            <p className="documento__titulo">
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer">
                  {d.titulo} <ExternalLink size={13} aria-label="(abre em outra aba)" />
                </a>
              ) : (
                d.titulo
              )}
            </p>
            <p className="documento__meta apagado">{formatarData(d.publicadoEm)}</p>
          </li>
        );
      })}
    </ul>
  );
}

function Adicionar({ api, demo }: { readonly api: ApiConhecimento; readonly demo: boolean }) {
  const [aba, setAba] = useState<Aba>(demo ? "nota" : "arquivo");
  return (
    <Painel titulo="Adicionar ao conhecimento" id="titulo-adicionar" icone={Plus}>
      {demo ? null : (
        <Segmentado rotulo="O que adicionar" ocultarRotulo opcoes={ABAS} valor={aba} aoMudar={setAba} />
      )}
      <div className="conhecimento__aba">
        {aba === "arquivo" && !demo ? <EnvioArquivos api={api} /> : null}
        {aba === "link" && !demo ? <NovoLink api={api} /> : null}
        {aba === "nota" || demo ? <NovaNota /> : null}
      </div>
      {demo ? (
        <p className="apagado conhecimento__demo">
          Envio de arquivos, links e a busca funcionam com a API rodando.
        </p>
      ) : null}
    </Painel>
  );
}

/** Conhecimento: o que o agente e o assistente consultam — só da pessoa, nunca de outra. */
export function Conhecimento({ api: apiInjetada }: { readonly api?: ApiConhecimento } = {}) {
  const fonte = useFonte();
  const api = useMemo(() => apiInjetada ?? criarApiConhecimento(), [apiInjetada]);
  return (
    <>
      <Cabecalho titulo="Conhecimento">
        O que o agente consulta antes de argumentar e o assistente usa para responder: seus arquivos, links e
        notas, notícias, regras da corretora e o diário de decisões. Só seu.
      </Cabecalho>
      <div className="grade-conhecimento">
        <div className="conhecimento__coluna">
          {fonte.demo ? null : (
            <Painel titulo="Buscar como o agente busca" id="titulo-busca" icone={Search}>
              <BuscaConhecimento api={api} />
            </Painel>
          )}
          <Painel titulo="Documentos" id="titulo-documentos" icone={BookOpen}>
            {fonte.demo ? <ListaDemo /> : <ListaDocumentos api={api} />}
          </Painel>
        </div>
        <Adicionar api={api} demo={fonte.demo} />
      </div>
    </>
  );
}
