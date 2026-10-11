import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FonteDocumento } from "@zentrade/contratos/esquemas";
import { Link2, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { CampoTexto } from "../../componentes/Campo";
import { chaves } from "../../ganchos/chaves";
import { useCriarNota } from "../../ganchos/mutacoes";
import type { ApiConhecimento } from "./api";
import { CHAVE_DOCUMENTOS, EscolhaFonte } from "./comum";

/** Um link: a API baixa a página (só endereço público), extrai o texto e guarda no RAG. */
export function NovoLink({ api }: { readonly api: ApiConhecimento }) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [fonte, setFonte] = useState<FonteDocumento>("nota");
  const [erro, setErro] = useState<string | null>(null);
  const enviar = useMutation({
    mutationFn: () =>
      api.enviarLink({ url: url.trim(), fonte, ...(titulo.trim() ? { titulo: titulo.trim() } : {}) }),
    onSuccess: (r) => {
      setUrl("");
      setTitulo("");
      avisar(
        "sucesso",
        r.novo ? `“${r.titulo}” entrou no seu conhecimento.` : "Esse conteúdo já estava no seu conhecimento.",
      );
      void qc.invalidateQueries({ queryKey: CHAVE_DOCUMENTOS });
      void qc.invalidateQueries({ queryKey: chaves.documentos });
    },
    onError: (e) => setErro(mensagemDe(e)),
  });
  const submeter = (e: FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      setErro("Cole um endereço completo, começando com https://.");
      return;
    }
    setErro(null);
    enviar.mutate();
  };
  return (
    <form className="formulario" onSubmit={submeter} noValidate>
      <CampoTexto
        rotulo="Endereço da página"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        erro={erro}
        maxLength={2000}
      />
      <CampoTexto
        rotulo="Título (opcional)"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        maxLength={200}
        dica="Sem título, vale o da página."
      />
      <EscolhaFonte valor={fonte} aoMudar={setFonte} />
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Link2} carregando={enviar.isPending}>
          Guardar link
        </Botao>
      </div>
    </form>
  );
}

/** Nota escrita na hora (o mesmo de antes, agora numa aba). */
export function NovaNota() {
  const qc = useQueryClient();
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
          void qc.invalidateQueries({ queryKey: CHAVE_DOCUMENTOS });
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
