import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentoDetalhe, FonteDocumento } from "@zentrade/contratos/esquemas";
import { BookOpen, ChevronDown, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { CampoTexto } from "../../componentes/Campo";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Segmentado } from "../../componentes/Segmentado";
import { Selo } from "../../componentes/Selo";
import { chaves } from "../../ganchos/chaves";
import { linkSeguro } from "../../lib/link";
import { FONTE_DOCUMENTO } from "../../lib/rotulos";
import { formatarData } from "../../lib/tempo";
import type { ApiConhecimento } from "./api";
import { CHAVE_DOCUMENTOS, chaveDetalhe, formatarBytes, ORIGEM } from "./comum";

type Filtro = "todas" | FonteDocumento;
const FILTROS: readonly { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Tudo" },
  ...(Object.keys(FONTE_DOCUMENTO) as FonteDocumento[]).map((f) => ({
    valor: f,
    rotulo: FONTE_DOCUMENTO[f],
  })),
];

function Trechos({ api, id }: { readonly api: ApiConhecimento; readonly id: string }) {
  const detalhe = useQuery({ queryKey: chaveDetalhe(id), queryFn: () => api.detalhe(id) });
  if (detalhe.isPending) return <Esqueleto linhas={3} rotulo="Carregando os trechos" />;
  if (detalhe.error)
    return <ErroCarregar erro={detalhe.error} tentarDeNovo={() => void detalhe.refetch()} compacto />;
  return (
    <ol className="documento__trechos" role="list" aria-label="Trechos que entraram no conhecimento">
      {detalhe.data.trechos.map((t) => (
        <li key={t.id}>
          <span className="documento__trecho-num num apagado">{t.ordem + 1}</span>
          <p>{t.texto}</p>
        </li>
      ))}
    </ol>
  );
}

function Documento({ d, api }: { readonly d: DocumentoDetalhe; readonly api: ApiConhecimento }) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const apagar = useMutation({
    mutationFn: () => api.apagar(d.id),
    onSuccess: () => {
      avisar("sucesso", `“${d.titulo}” saiu do seu conhecimento.`);
      void qc.invalidateQueries({ queryKey: CHAVE_DOCUMENTOS });
      void qc.invalidateQueries({ queryKey: chaves.documentos });
    },
    onError: (e) => avisar("erro", mensagemDe(e)),
  });
  const link = linkSeguro(d.url);
  const meta = [
    ORIGEM[d.origem],
    d.nomeArquivo,
    formatarBytes(d.bytes),
    `${d.trechos} trecho${d.trechos === 1 ? "" : "s"}`,
    formatarData(d.publicadoEm),
  ];
  return (
    <li className="documento documento--detalhado">
      <Selo tom={d.fonte === "nota" ? "marca" : "neutro"}>{FONTE_DOCUMENTO[d.fonte]}</Selo>
      <div className="documento__principal">
        <p className="documento__titulo">
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer nofollow">
              {d.titulo} <ExternalLink size={13} aria-label="(abre em outra aba)" />
            </a>
          ) : (
            d.titulo
          )}
        </p>
        <p className="documento__meta apagado">{meta.filter(Boolean).join(" · ")}</p>
        {aberto ? <Trechos api={api} id={d.id} /> : null}
      </div>
      <div className="documento__acoes">
        <Botao
          pequeno
          variante="fantasma"
          icone={ChevronDown}
          aria-expanded={aberto}
          onClick={() => setAberto(!aberto)}
        >
          {aberto ? "Esconder" : "Trechos"}
        </Botao>
        {confirmar ? (
          <>
            <Botao pequeno variante="perigo" carregando={apagar.isPending} onClick={() => apagar.mutate()}>
              Apagar
            </Botao>
            <Botao pequeno variante="fantasma" onClick={() => setConfirmar(false)}>
              Manter
            </Botao>
          </>
        ) : (
          <Botao
            pequeno
            variante="fantasma"
            icone={Trash2}
            aria-label={`Apagar “${d.titulo}”`}
            onClick={() => setConfirmar(true)}
          />
        )}
      </div>
    </li>
  );
}

/** Os documentos da pessoa, com filtro por tipo, busca no título, trechos e apagar. */
export function ListaDocumentos({ api }: { readonly api: ApiConhecimento }) {
  const consulta = useQuery({ queryKey: CHAVE_DOCUMENTOS, queryFn: () => api.documentos() });
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const docs = (consulta.data ?? []).filter(
    (d) =>
      (filtro === "todas" || d.fonte === filtro) &&
      (!termo || `${d.titulo} ${d.nomeArquivo ?? ""}`.toLowerCase().includes(termo)),
  );
  return (
    <>
      <div className="barra-filtros">
        <Segmentado rotulo="Fonte" ocultarRotulo opcoes={FILTROS} valor={filtro} aoMudar={setFiltro} />
        <CampoTexto
          rotulo="Filtrar pelo título"
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
            : "Envie um arquivo, guarde um link ou escreva uma nota ao lado. Notícias e regras chegam pelas automações."}
        </EstadoVazio>
      ) : null}
      <ul role="list" className="documentos">
        {docs.map((d) => (
          <Documento key={d.id} d={d} api={api} />
        ))}
      </ul>
    </>
  );
}
