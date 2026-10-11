import { BookOpen, ExternalLink, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { FonteDocumento } from "../api/esquemas";
import { mensagemDe } from "../api/erros";
import { useAvisos } from "../componentes/Avisos";
import { Botao } from "../componentes/Botao";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { CampoTexto } from "../componentes/Campo";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { Segmentado } from "../componentes/Segmentado";
import { Selo } from "../componentes/Selo";
import { useDocumentos } from "../ganchos/consultas";
import { useCriarNota } from "../ganchos/mutacoes";
import { FONTE_DOCUMENTO } from "../lib/rotulos";
import { formatarData } from "../lib/tempo";

type Filtro = "todas" | FonteDocumento;
const FILTROS: readonly { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Tudo" },
  ...(Object.keys(FONTE_DOCUMENTO) as FonteDocumento[]).map((f) => ({
    valor: f,
    rotulo: FONTE_DOCUMENTO[f],
  })),
];

function NovaNota() {
  const criar = useCriarNota();
  const avisar = useAvisos();
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (!titulo.trim() || !texto.trim()) {
      setErro("Escreva um título e o texto da nota.");
      return;
    }
    setErro(null);
    criar.mutate(
      { titulo: titulo.trim(), texto: texto.trim() },
      {
        onSuccess: () => {
          setTitulo("");
          setTexto("");
          avisar("sucesso", "Nota guardada. O agente passa a considerá-la nas próximas análises.");
        },
        onError: (er) => avisar("erro", mensagemDe(er)),
      },
    );
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <CampoTexto
        rotulo="Título"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        maxLength={200}
      />
      <div className="campo">
        <label htmlFor="texto-nota" className="campo__rotulo">
          Texto
        </label>
        <textarea
          id="texto-nota"
          className="campo__entrada campo__area"
          rows={6}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-describedby="dica-nota"
        />
        <span id="dica-nota" className="campo__dica">
          Ex.: “Não operar SOL em dia de atualização da rede.” O agente lê suas notas antes de propor.
        </span>
      </div>
      {erro ? (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Plus} carregando={criar.isPending}>
          Guardar nota
        </Botao>
      </div>
    </form>
  );
}

export function Conhecimento() {
  const consulta = useDocumentos();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const docs = (consulta.data ?? []).filter(
    (d) => (filtro === "todas" || d.fonte === filtro) && (!termo || d.titulo.toLowerCase().includes(termo)),
  );

  return (
    <>
      <Cabecalho titulo="Conhecimento">
        O que o agente consulta antes de argumentar: seu diário, notícias, regras da corretora e suas notas.
      </Cabecalho>
      <div className="grade-conhecimento">
        <Painel titulo="Documentos" id="titulo-documentos">
          <div className="barra-filtros">
            <Segmentado rotulo="Fonte" ocultarRotulo opcoes={FILTROS} valor={filtro} aoMudar={setFiltro} />
            <CampoTexto
              rotulo="Buscar pelo título"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="campo--estreito"
            />
          </div>
          {consulta.isPending ? <Esqueleto linhas={6} rotulo="Carregando documentos" /> : null}
          {consulta.error ? (
            <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
          ) : null}
          {consulta.isSuccess && docs.length === 0 ? (
            <EstadoVazio
              icone={BookOpen}
              titulo={termo || filtro !== "todas" ? "Nada encontrado" : "Conhecimento vazio"}
            >
              {termo || filtro !== "todas"
                ? "Tente outro filtro ou outra palavra."
                : "Notícias e regras chegam pelas automações. Comece escrevendo uma nota ao lado."}
            </EstadoVazio>
          ) : null}
          <ul role="list" className="documentos">
            {docs.map((d) => (
              <li key={d.id} className="documento">
                <Selo tom={d.fonte === "nota" ? "marca" : "neutro"}>{FONTE_DOCUMENTO[d.fonte]}</Selo>
                <p className="documento__titulo">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      {d.titulo} <ExternalLink size={13} aria-label="(abre em outra aba)" />
                    </a>
                  ) : (
                    d.titulo
                  )}
                </p>
                <p className="documento__meta apagado">
                  {formatarData(d.publicadoEm)}
                  {d.trechos ? (
                    <>
                      {" "}
                      · <span className="num">{d.trechos}</span> {d.trechos === 1 ? "trecho" : "trechos"}
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </Painel>
        <Painel titulo="Nova nota" id="titulo-nota">
          <NovaNota />
        </Painel>
      </div>
    </>
  );
}
