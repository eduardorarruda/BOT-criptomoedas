import { RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { mensagemDe } from "../api/erros";
import { Botao } from "./Botao";

/** Estado vazio que explica o porquê e o que fazer. */
export function EstadoVazio({
  icone: Icone,
  titulo,
  children,
  acao,
}: {
  readonly icone: LucideIcon;
  readonly titulo: string;
  readonly children: ReactNode;
  readonly acao?: ReactNode;
}) {
  return (
    <div className="estado-vazio">
      <Icone size={22} strokeWidth={1.6} aria-hidden="true" className="estado-vazio__icone" />
      <p className="estado-vazio__titulo">{titulo}</p>
      <div className="estado-vazio__texto">{children}</div>
      {acao ? <div className="estado-vazio__acao">{acao}</div> : null}
    </div>
  );
}

/** Erro ao carregar, com a mensagem da API e o botão para tentar de novo. */
export function ErroCarregar({
  erro,
  tentarDeNovo,
  compacto = false,
}: {
  readonly erro: unknown;
  readonly tentarDeNovo: () => void;
  readonly compacto?: boolean;
}) {
  return (
    <div className={`erro-carregar ${compacto ? "erro-carregar--compacto" : ""}`} role="alert">
      <TriangleAlert size={18} aria-hidden="true" className="perda" />
      <p>{mensagemDe(erro)}</p>
      <Botao pequeno icone={RefreshCw} onClick={tentarDeNovo}>
        Tentar de novo
      </Botao>
    </div>
  );
}

/** Esqueleto de carregamento: a forma do que vem, sem números falsos. */
export function Esqueleto({
  linhas = 3,
  altura,
  rotulo = "Carregando",
}: {
  readonly linhas?: number;
  readonly altura?: number;
  readonly rotulo?: string;
}) {
  if (altura) {
    return (
      <div
        className="esqueleto esqueleto--bloco"
        style={{ height: altura }}
        role="status"
        aria-label={rotulo}
      >
        <span className="so-leitor">{rotulo}…</span>
      </div>
    );
  }
  return (
    <div className="esqueleto" role="status" aria-label={rotulo}>
      {Array.from({ length: linhas }, (_, i) => (
        <span key={i} className="esqueleto__linha" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
      <span className="so-leitor">{rotulo}…</span>
    </div>
  );
}
