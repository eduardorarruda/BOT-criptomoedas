import { Check, Copy, ExternalLink, ShieldCheck, Smartphone } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { encode } from "uqr";
import { mensagemDe } from "../../api/erros";
import type { SegredoDoisFatores } from "../../api/fonte";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { CampoTexto } from "../../componentes/Campo";
import { Esqueleto } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { useSessao } from "../../ganchos/consultas";
import { useAtivarDoisFatores, useIniciarDoisFatores } from "../../ganchos/mutacoes";
import { useCopiar } from "../../ganchos/useCopiar";

/** "JBSWY3DPEHPK3PXP…" em grupos de 4, para digitar sem se perder. */
const emGrupos = (segredo: string): string => segredo.match(/.{1,4}/g)?.join(" ") ?? segredo;

function Chave({ segredo }: { readonly segredo: SegredoDoisFatores }) {
  const [copia, copiar] = useCopiar();
  return (
    <div className="dois-fatores__chave">
      <p className="dois-fatores__passo">
        <span className="dois-fatores__numero" aria-hidden="true">
          1
        </span>
        No app autenticador do celular (Google Authenticator, Microsoft Authenticator, 2FAS, Aegis…), toque em
        adicionar e escaneie o QR code. Sem câmera? Digite a chave abaixo.
      </p>
      <QrCode texto={segredo.uri} />
      <div className="dois-fatores__segredo">
        <code className="num">{emGrupos(segredo.segredo)}</code>
        <Botao
          pequeno
          variante="fantasma"
          icone={copia === "copiado" ? Check : Copy}
          onClick={() => void copiar(segredo.segredo)}
        >
          {copia === "copiado" ? "Copiada" : "Copiar"}
        </Botao>
      </div>
      {copia === "falhou" ? (
        <p className="formulario__erro" role="alert">
          Não deu para copiar. Selecione a chave e copie com Ctrl+C.
        </p>
      ) : null}
      {/* Só em tela de toque: no computador o otpauth:// não abre app nenhum (vira o diálogo do xdg-open). */}
      <a className="link-seta dois-fatores__abrir-no-celular" href={segredo.uri}>
        <Smartphone size={14} aria-hidden="true" />
        Abrir no app autenticador (no celular)
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

const BORDA_QR = 2;

/** QR do link otpauth:// para o app do celular. Desenhado em SVG com elementos, sem HTML injetado. */
function QrCode({ texto }: { readonly texto: string }) {
  const { data, size } = useMemo(() => encode(texto, { ecc: "M" }), [texto]);
  const lado = size + BORDA_QR * 2;
  const modulos = data.flatMap((linha, y) =>
    linha.flatMap((escuro, x) =>
      escuro ? [<rect key={`${x}-${y}`} x={x + BORDA_QR} y={y + BORDA_QR} width={1} height={1} />] : [],
    ),
  );
  return (
    <svg
      className="dois-fatores__qr"
      viewBox={`0 0 ${lado} ${lado}`}
      role="img"
      aria-label="QR code para adicionar o ZenTrade no app autenticador"
      shapeRendering="crispEdges"
    >
      <rect width={lado} height={lado} className="dois-fatores__qr-fundo" />
      {modulos}
    </svg>
  );
}

function Ativar() {
  const ativar = useAtivarDoisFatores();
  const avisar = useAvisos();
  const [codigo, setCodigo] = useState("");
  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    ativar.mutate(codigo.trim(), {
      onSuccess: () =>
        avisar("sucesso", "2FA ligado. Entrar e confirmar ações sensíveis agora pedem o código do app."),
    });
  };
  return (
    <form className="dois-fatores__ativar" onSubmit={enviar} noValidate>
      <p className="dois-fatores__passo">
        <span className="dois-fatores__numero" aria-hidden="true">
          2
        </span>
        Digite o código que o app mostra agora.
      </p>
      <div className="dois-fatores__linha">
        <CampoTexto
          rotulo="Código de 6 números"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6));
            if (ativar.error) ativar.reset();
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="campo--mono dois-fatores__codigo"
          erro={ativar.error ? mensagemDe(ativar.error) : null}
        />
        <Botao type="submit" variante="primario" icone={ShieldCheck} carregando={ativar.isPending}>
          Ativar
        </Botao>
      </div>
    </form>
  );
}

/**
 * Verificação em duas etapas (2FA TOTP). Sem ela, quem descobrir a senha entra; com ela,
 * é preciso também o celular. Chave de dinheiro real exige 2FA na API.
 */
export function DoisFatores() {
  const sessao = useSessao();
  const iniciar = useIniciarDoisFatores();
  const avisar = useAvisos();
  const ligado = sessao.data?.doisFatores ?? false;

  return (
    <Painel
      titulo="Verificação em duas etapas (2FA)"
      id="titulo-2fa"
      icone={ShieldCheck}
      descricao="Além da senha, o código de 6 números do app autenticador no seu celular."
      acoes={
        ligado ? (
          <Selo tom="marca" icone={Check}>
            Ligado
          </Selo>
        ) : null
      }
    >
      {sessao.isPending ? <Esqueleto linhas={2} rotulo="Carregando a sessão" /> : null}
      {sessao.isSuccess && ligado ? (
        <p className="apagado">
          Entrar e confirmar ações sensíveis pedem o código. Para trocar de celular, fale com quem administra
          o servidor.
        </p>
      ) : null}
      {sessao.isSuccess && !ligado && !iniciar.data ? (
        <div className="dois-fatores__inicio">
          <p>
            Está desligado: quem descobrir sua senha consegue entrar. Ligue antes de cadastrar chave de
            dinheiro real (a API exige).
          </p>
          <Botao
            variante="primario"
            icone={ShieldCheck}
            carregando={iniciar.isPending}
            onClick={() => iniciar.mutate(undefined, { onError: (e) => avisar("erro", mensagemDe(e)) })}
          >
            Ligar o 2FA
          </Botao>
        </div>
      ) : null}
      {!ligado && iniciar.data ? (
        <div className="dois-fatores__passos">
          <Chave segredo={iniciar.data} />
          <Ativar />
        </div>
      ) : null}
    </Painel>
  );
}
