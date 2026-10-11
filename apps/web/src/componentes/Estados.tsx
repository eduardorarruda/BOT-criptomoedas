import { RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { mensagemDe } from "../api/erros";
import { Botao } from "./Botao";

/** O anel aberto do Ensō, sem o candle: o fundo calmo dos estados vazios. */
function AnelEnso() {
  return (
    <svg viewBox="0 0 120 120" className="estado-vazio__anel" aria-hidden="true">
      <path d="M98.64 49.65 A40 40 0 1 1 70.35 21.36" fill="none" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/**
 * Estado vazio que explica o porquê e o que fazer. Por padrão é uma composição
 * centrada com o anel do Ensō em volta do ícone; `compacto` vira uma linha discreta
 * à esquerda, para espaços pequenos (dentro de listas, colunas estreitas).
 */
export function EstadoVazio({
  icone: Icone,
  titulo,
  children,
  acao,
  compacto = false,
}: {
  readonly icone?: LucideIcon;
  readonly titulo: string;
  readonly children: ReactNode;
  readonly acao?: ReactNode;
  readonly compacto?: boolean;
}) {
  return (
    <div className={`estado-vazio ${compacto ? "estado-vazio--compacto" : ""}`}>
      {Icone ? (
        <span className="estado-vazio__simbolo">
          {compacto ? null : <AnelEnso />}
          <Icone
            size={compacto ? 20 : 22}
            strokeWidth={1.6}
            aria-hidden="true"
            className="estado-vazio__icone"
          />
        </span>
      ) : null}
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
      <span className="erro-carregar__icone" aria-hidden="true">
        <TriangleAlert size={18} />
      </span>
      <div className="erro-carregar__texto">
        <p className="erro-carregar__titulo">Não deu para carregar</p>
        <p>{mensagemDe(erro)}</p>
      </div>
      <Botao pequeno icone={RefreshCw} onClick={tentarDeNovo}>
        Tentar de novo
      </Botao>
    </div>
  );
}

/**
 * Formas de esqueleto: a silhueta do que vem, sem números falsos.
 * - `linhas` (padrão): parágrafos/listas curtas.
 * - `kpis`: a faixa de indicadores (`quantidade` cartões).
 * - `lista`: linhas com marcador e texto (listas de itens).
 * - `cartoes`: grade de cartões (`quantidade`).
 * - `grafico`: área de gráfico com eixo e uma curva tênue (`altura`).
 * Passar só `altura` mantém o bloco liso de antes.
 */
export type FormaEsqueleto = "linhas" | "bloco" | "kpis" | "lista" | "cartoes" | "grafico";

const Linha = ({ largura, classe = "" }: { readonly largura: string; readonly classe?: string }) => (
  <span className={`esqueleto__linha ${classe}`} style={{ width: largura }} />
);

function corpoEsqueleto(forma: FormaEsqueleto, linhas: number, quantidade: number): ReactNode {
  if (forma === "kpis" || forma === "cartoes") {
    return Array.from({ length: quantidade }, (_, i) => (
      <span key={i} className="esqueleto__cartao">
        <Linha largura="42%" classe="esqueleto__linha--fina" />
        <Linha largura={forma === "kpis" ? "68%" : "80%"} classe="esqueleto__linha--grossa" />
        <Linha largura="54%" classe="esqueleto__linha--fina" />
      </span>
    ));
  }
  if (forma === "lista") {
    return Array.from({ length: linhas }, (_, i) => (
      <span key={i} className="esqueleto__item">
        <span className="esqueleto__ponto" />
        <span className="esqueleto__textos">
          <Linha largura={`${78 - ((i * 13) % 30)}%`} />
          <Linha largura={`${46 - ((i * 7) % 16)}%`} classe="esqueleto__linha--fina" />
        </span>
      </span>
    ));
  }
  return Array.from({ length: linhas }, (_, i) => <Linha key={i} largura={`${92 - ((i * 17) % 40)}%`} />);
}

export function Esqueleto({
  linhas = 3,
  altura,
  rotulo = "Carregando",
  forma,
  quantidade = 4,
}: {
  readonly linhas?: number;
  readonly altura?: number;
  readonly rotulo?: string;
  readonly forma?: FormaEsqueleto;
  readonly quantidade?: number;
}) {
  const tipo: FormaEsqueleto = forma ?? (altura ? "bloco" : "linhas");
  if (tipo === "bloco" || tipo === "grafico") {
    return (
      <div
        className={`esqueleto esqueleto--bloco ${tipo === "grafico" ? "esqueleto--grafico" : ""}`}
        style={{ height: altura ?? 240 }}
        role="status"
        aria-label={rotulo}
      >
        {tipo === "grafico" ? (
          <svg viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 78 C 40 70, 70 82, 110 64 S 180 40, 220 52 S 300 30, 340 26 S 380 18, 400 14" />
          </svg>
        ) : null}
        <span className="so-leitor">{rotulo}…</span>
      </div>
    );
  }
  const estilo = { "--esqueleto-colunas": quantidade } as CSSProperties;
  return (
    <div className={`esqueleto esqueleto--${tipo}`} style={estilo} role="status" aria-label={rotulo}>
      {corpoEsqueleto(tipo, linhas, quantidade)}
      <span className="so-leitor">{rotulo}…</span>
    </div>
  );
}
