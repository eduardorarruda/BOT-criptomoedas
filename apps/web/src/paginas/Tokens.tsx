import { Check, Copy, KeySquare, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../api/erros";
import type { EscopoToken, TokenApi, TokenCriado } from "../api/esquemas";
import { useAvisos } from "../componentes/Avisos";
import { Botao } from "../componentes/Botao";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { CampoTexto } from "../componentes/Campo";
import { Confirmar } from "../componentes/Confirmar";
import { Dialogo } from "../componentes/Dialogo";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { Segmentado } from "../componentes/Segmentado";
import { Selo } from "../componentes/Selo";
import { useTokens } from "../ganchos/consultas";
import { useCriarToken, useRevogarToken } from "../ganchos/mutacoes";
import { formatarData, formatarRelativo } from "../lib/tempo";

const ESCOPOS: readonly { valor: EscopoToken; rotulo: string }[] = [
  { valor: "leitura", rotulo: "Só leitura" },
  { valor: "operar", rotulo: "Pode operar" },
];

function TokenNovo({
  token,
  aoFechar,
}: {
  readonly token: TokenCriado | null;
  readonly aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const avisar = useAvisos();
  const copiar = async (): Promise<void> => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.token);
      setCopiado(true);
    } catch {
      avisar("erro", "Não deu para copiar automaticamente. Selecione o texto e copie com Ctrl+C.");
    }
  };
  return (
    <Dialogo
      aberto={token !== null}
      aoFechar={aoFechar}
      titulo="Copie o token agora"
      descricao="Ele aparece só desta vez. Se perder, revogue e crie outro."
    >
      <div className="token-novo">
        {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- o token rola na horizontal; o teclado precisa alcançar a região para ler e selecionar */}
        <code className="num" tabIndex={0}>
          {token?.token}
        </code>
        <Botao variante="primario" icone={copiado ? Check : Copy} onClick={() => void copiar()}>
          {copiado ? "Copiado" : "Copiar"}
        </Botao>
      </div>
      <p className="apagado">Use no cabeçalho: Authorization: Bearer &lt;token&gt;.</p>
      <div className="formulario__acoes">
        <Botao onClick={aoFechar}>Já guardei</Botao>
      </div>
    </Dialogo>
  );
}

function FormToken({ aoCriar }: { readonly aoCriar: (t: TokenCriado) => void }) {
  const criar = useCriarToken();
  const avisar = useAvisos();
  const [nome, setNome] = useState("");
  const [escopo, setEscopo] = useState<EscopoToken>("leitura");
  const [erro, setErro] = useState<string | null>(null);
  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (!nome.trim()) {
      setErro("Dê um nome que diga onde o token será usado, como “Terminal do notebook”.");
      return;
    }
    setErro(null);
    criar.mutate(
      { nome: nome.trim(), escopo },
      {
        onSuccess: (t) => {
          setNome("");
          aoCriar(t);
        },
        onError: (er) => avisar("erro", mensagemDe(er)),
      },
    );
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <CampoTexto
        rotulo="Nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        erro={erro}
        maxLength={80}
      />
      <Segmentado rotulo="Permissão" opcoes={ESCOPOS} valor={escopo} aoMudar={setEscopo} />
      <p className="apagado">
        {escopo === "leitura"
          ? "Vê robôs, decisões e resultados. Não muda nada."
          : "Pode aprovar decisões e mudar robôs. Use só onde você confia."}
      </p>
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Plus} carregando={criar.isPending}>
          Criar token
        </Botao>
      </div>
    </form>
  );
}

export function Tokens() {
  const tokens = useTokens();
  const revogar = useRevogarToken();
  const avisar = useAvisos();
  const [novo, setNovo] = useState<TokenCriado | null>(null);
  const [revogando, setRevogando] = useState<TokenApi | null>(null);

  return (
    <>
      <Cabecalho titulo="Tokens de API">
        Acesso para a linha de comando e para assistentes (MCP). Cada token tem nome e permissão.
      </Cabecalho>
      <div className="grade-dupla">
        <Painel titulo="Tokens ativos" id="titulo-tokens">
          {tokens.isPending ? <Esqueleto linhas={3} /> : null}
          {tokens.error ? (
            <ErroCarregar erro={tokens.error} tentarDeNovo={() => void tokens.refetch()} />
          ) : null}
          {tokens.data?.length === 0 ? (
            <EstadoVazio icone={KeySquare} titulo="Nenhum token">
              Crie um token para usar o ZenTrade pelo terminal ou por um assistente.
            </EstadoVazio>
          ) : null}
          <ul role="list" className="chaves">
            {tokens.data?.map((t) => (
              <li key={t.id}>
                <KeySquare size={16} aria-hidden="true" />
                <span>{t.nome}</span>
                <Selo tom={t.escopo === "operar" ? "atencao" : "neutro"}>
                  {t.escopo === "operar" ? "Pode operar" : "Só leitura"}
                </Selo>
                <span className="apagado">
                  criado em {formatarData(t.criadoEm)} ·{" "}
                  {t.ultimoUsoEm ? `usado ${formatarRelativo(t.ultimoUsoEm)}` : "nunca usado"}
                </span>
                <Botao
                  pequeno
                  variante="fantasma"
                  icone={Trash2}
                  onClick={() => setRevogando(t)}
                  aria-label={`Revogar token ${t.nome}`}
                >
                  Revogar
                </Botao>
              </li>
            ))}
          </ul>
        </Painel>
        <Painel titulo="Novo token" id="titulo-novo-token">
          <FormToken aoCriar={setNovo} />
        </Painel>
      </div>
      <TokenNovo token={novo} aoFechar={() => setNovo(null)} />
      <Confirmar
        aberto={revogando !== null}
        titulo="Revogar este token?"
        rotuloConfirmar="Revogar token"
        carregando={revogar.isPending}
        aoCancelar={() => setRevogando(null)}
        aoConfirmar={() =>
          revogando &&
          revogar.mutate(revogando.id, {
            onSuccess: () => {
              avisar("sucesso", `Token “${revogando.nome}” revogado. Quem usava perde o acesso agora.`);
              setRevogando(null);
            },
            onError: (e) => avisar("erro", mensagemDe(e)),
          })
        }
      >
        Tudo o que usa “{revogando?.nome}” perde o acesso na hora. Não dá para desfazer.
      </Confirmar>
    </>
  );
}
