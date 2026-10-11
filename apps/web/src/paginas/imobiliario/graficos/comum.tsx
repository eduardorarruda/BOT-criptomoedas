import { useState, type PointerEvent, type ReactNode } from "react";

/**
 * Peças dos gráficos do imobiliário (SVG puro): escala, eixo, legenda, dica e a
 * tabela com os mesmos números — a cor nunca é a única pista e quem não enxerga o
 * gráfico lê a tabela.
 */
export interface Serie {
  readonly nome: string;
  /** Posição na paleta categórica (1 a 5) ou um papel fixo. */
  readonly cor: 1 | 2 | 3 | 4 | 5 | "ganho" | "perda";
  readonly valores: readonly number[];
}

export const corDa = (s: Pick<Serie, "cor">): string =>
  typeof s.cor === "number" ? `var(--imob-serie-${s.cor})` : `var(--${s.cor})`;

export const LARGURA = 640;
export const MARGEM = { topo: 12, direita: 12, base: 28, esquerda: 92 } as const;

/** Escala linear com "folga" em números redondos para o eixo. */
export function escala(minimo: number, maximo: number, altura: number) {
  const min = Math.min(0, minimo);
  const max = maximo <= min ? min + 1 : maximo;
  const passo = passoRedondo((max - min) / 4);
  const topo = Math.ceil(max / passo) * passo;
  const fundo = Math.floor(min / passo) * passo;
  const util = altura - MARGEM.topo - MARGEM.base;
  const y = (v: number): number => MARGEM.topo + util - ((v - fundo) / (topo - fundo || 1)) * util;
  const marcas: number[] = [];
  for (let v = fundo; v <= topo + passo / 2; v += passo) marcas.push(Number(v.toPrecision(12)));
  return { y, marcas, zero: y(0) };
}

function passoRedondo(bruto: number): number {
  if (!(bruto > 0)) return 1;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / potencia;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * potencia;
}

export function EixoY({
  marcas,
  y,
  formatar,
}: {
  readonly marcas: readonly number[];
  readonly y: (v: number) => number;
  readonly formatar: (v: number) => string;
}) {
  return (
    <g className="imob-grafico__eixo" aria-hidden="true">
      {marcas.map((m) => (
        <g key={m}>
          <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={y(m)} y2={y(m)} />
          <text x={MARGEM.esquerda - 8} y={y(m)} dy="0.32em" textAnchor="end">
            {formatar(m)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function Legenda({ series }: { readonly series: readonly Pick<Serie, "nome" | "cor">[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="imob-legenda" role="list">
      {series.map((s) => (
        <li key={s.nome}>
          <span className="imob-legenda__marca" style={{ background: corDa(s) }} aria-hidden="true" />
          {s.nome}
        </li>
      ))}
    </ul>
  );
}

/** A dica que acompanha o ponteiro: rótulo do ponto e cada série com o seu valor. */
export function Dica({
  x,
  titulo,
  linhas,
}: {
  readonly x: number;
  readonly titulo: string;
  readonly linhas: readonly { nome: string; cor: string; texto: string }[];
}) {
  const aDireita = x < LARGURA * 0.6;
  return (
    <div
      className="imob-dica"
      style={{
        left: `${(x / LARGURA) * 100}%`,
        transform: aDireita ? "translateX(12px)" : "translateX(calc(-100% - 12px))",
      }}
      role="status"
    >
      <p className="imob-dica__titulo">{titulo}</p>
      {linhas.map((l) => (
        <p key={l.nome} className="imob-dica__linha">
          <span className="imob-legenda__marca" style={{ background: l.cor }} aria-hidden="true" />
          <span>{l.nome}</span>
          <strong className="num">{l.texto}</strong>
        </p>
      ))}
    </div>
  );
}

/** Os números do gráfico em tabela (fechada por padrão). */
export function TabelaDados({
  titulo,
  cabecalho,
  linhas,
}: {
  readonly titulo: string;
  readonly cabecalho: readonly string[];
  readonly linhas: readonly (readonly ReactNode[])[];
}) {
  // A tabela só entra no DOM quando aberta: a de um financiamento tem 360 linhas.
  const [aberta, setAberta] = useState(false);
  return (
    <details className="imob-tabela-dados" onToggle={(e) => setAberta(e.currentTarget.open)}>
      <summary>Ver os números: {titulo}</summary>
      {aberta ? (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                {cabecalho.map((c, i) => (
                  <th key={c} scope="col" className={i > 0 ? "tabela__num" : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  {l.map((c, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {c}
                      </th>
                    ) : (
                      <td key={j} className="tabela__num num">
                        {c}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  );
}

/** Área transparente sobre o gráfico que acompanha o ponteiro (mouse, caneta ou dedo). */
export function Sensor({
  altura,
  apontar,
  sair,
}: {
  readonly altura: number;
  readonly apontar: (e: PointerEvent<SVGElement>) => void;
  readonly sair: () => void;
}) {
  return (
    <rect
      x={MARGEM.esquerda}
      y={0}
      width={LARGURA - MARGEM.esquerda - MARGEM.direita}
      height={altura}
      fill="transparent"
      onPointerMove={apontar}
      onPointerDown={apontar}
      onPointerLeave={sair}
    />
  );
}

/** Índice do ponto mais perto do ponteiro, a partir da posição dentro do SVG. */
export function indicePeloPonteiro(
  evento: PointerEvent<SVGElement>,
  quantidade: number,
  modo: "pontos" | "faixas" = "pontos",
): number {
  const caixa = (evento.currentTarget.ownerSVGElement ?? evento.currentTarget).getBoundingClientRect();
  const x = ((evento.clientX - caixa.left) / (caixa.width || 1)) * LARGURA;
  const fracao = (x - MARGEM.esquerda) / (LARGURA - MARGEM.esquerda - MARGEM.direita);
  const i =
    modo === "pontos" ? Math.round(fracao * Math.max(1, quantidade - 1)) : Math.floor(fracao * quantidade);
  return Math.min(quantidade - 1, Math.max(0, i));
}
