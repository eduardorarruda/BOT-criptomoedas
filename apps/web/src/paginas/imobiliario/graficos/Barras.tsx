import { m } from "motion/react";
import { useId, useState, type PointerEvent } from "react";
import { useMenosMovimento } from "../../../ganchos/movimento";
import {
  corDa,
  Dica,
  EixoY,
  escala,
  indicePeloPonteiro,
  LARGURA,
  Legenda,
  MARGEM,
  Sensor,
  TabelaDados,
  type Serie,
} from "./comum";

/**
 * Barras por período: empilhadas (juros × amortização de cada ano) ou lado a lado
 * com sinal (fluxo de caixa: o que sai fica abaixo do zero). As barras crescem a
 * partir do zero uma vez; com menos movimento, já aparecem no lugar.
 */
interface Props {
  readonly titulo: string;
  readonly descricao: string;
  readonly rotulos: readonly string[];
  readonly series: readonly Serie[];
  readonly empilhado?: boolean;
  readonly formatar: (v: number) => string;
  readonly formatarEixo: (v: number) => string;
  readonly altura?: number;
}

interface Retangulo {
  readonly chave: string;
  readonly periodo: number;
  readonly x: number;
  readonly y: number;
  readonly largura: number;
  readonly altura: number;
  readonly cor: string;
  readonly negativo: boolean;
}

const LACUNA = 2;
const UTIL = LARGURA - MARGEM.esquerda - MARGEM.direita;

function retangulos(p: Props, y: (v: number) => number): Retangulo[] {
  const faixa = UTIL / Math.max(1, p.rotulos.length);
  const larguraBarra = Math.max(2, faixa * 0.7) / (p.empilhado ? 1 : p.series.length);
  return p.rotulos.flatMap((_, i) => {
    let base = 0;
    return p.series.map((s, k) => {
      const v = s.valores[i] ?? 0;
      const de = p.empilhado ? base : 0;
      if (p.empilhado) base = de + v;
      const x = MARGEM.esquerda + i * faixa + faixa * 0.15 + (p.empilhado ? 0 : k * larguraBarra);
      const altura = Math.max(0, Math.abs(y(de) - y(de + v)) - (p.empilhado && k > 0 ? LACUNA : 0));
      const largura = Math.max(1, larguraBarra - (p.empilhado ? 0 : LACUNA));
      return {
        chave: `${i}-${k}`,
        periodo: i,
        x,
        y: Math.min(y(de), y(de + v)),
        largura,
        altura,
        cor: corDa(s),
        negativo: v < 0,
      };
    });
  });
}

function Colunas({ lista, ativo }: { readonly lista: readonly Retangulo[]; readonly ativo: number | null }) {
  const menos = useMenosMovimento();
  return (
    <>
      {lista.map((r) => (
        <m.rect
          key={r.chave}
          x={r.x}
          y={r.y}
          width={r.largura}
          height={r.altura}
          rx={Math.min(4, r.largura / 2)}
          fill={r.cor}
          opacity={ativo === null || r.periodo === ativo ? 1 : 0.45}
          style={{ transformBox: "fill-box", transformOrigin: r.negativo ? "center top" : "center bottom" }}
          initial={menos ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1], delay: Math.min(0.4, r.periodo * 0.02) }}
        />
      ))}
    </>
  );
}

function EixoX({ rotulos, altura }: { readonly rotulos: readonly string[]; readonly altura: number }) {
  const faixa = UTIL / Math.max(1, rotulos.length);
  const passo = Math.ceil(rotulos.length / 8);
  return (
    <g className="imob-grafico__eixo" aria-hidden="true">
      {rotulos.map((r, i) =>
        i % passo === 0 ? (
          <text key={r} x={MARGEM.esquerda + (i + 0.5) * faixa} y={altura - 8} textAnchor="middle">
            {r}
          </text>
        ) : null,
      )}
    </g>
  );
}

const LinhaZero = ({ y }: { readonly y: number }) => (
  <line className="imob-grafico__zero" x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={y} y2={y} />
);

export function GraficoBarras(p: Props) {
  const id = useId();
  const [ativo, setAtivo] = useState<number | null>(null);
  const altura = p.altura ?? 240;
  const somas = p.rotulos.map((_, i) => p.series.reduce((s, x) => s + Math.max(0, x.valores[i] ?? 0), 0));
  const todos = p.empilhado ? somas : p.series.flatMap((s) => s.valores);
  const { y, marcas, zero } = escala(Math.min(0, ...todos), Math.max(...todos), altura);
  const faixa = UTIL / Math.max(1, p.rotulos.length);
  const apontar = (e: PointerEvent<SVGElement>) =>
    setAtivo(indicePeloPonteiro(e, p.rotulos.length, "faixas"));
  return (
    <figure className="imob-grafico">
      <figcaption id={`${id}-desc`} className="imob-grafico__titulo">
        {p.titulo}
        <span className="so-leitor">: {p.descricao}</span>
      </figcaption>
      <Legenda series={p.series} />
      <div className="imob-grafico__area">
        <svg viewBox={`0 0 ${LARGURA} ${altura}`} role="img" aria-labelledby={`${id}-desc`}>
          <EixoY marcas={marcas} y={y} formatar={p.formatarEixo} />
          <LinhaZero y={zero} />
          <Colunas lista={retangulos(p, y)} ativo={ativo} />
          <EixoX rotulos={p.rotulos} altura={altura} />
          <Sensor altura={altura} apontar={apontar} sair={() => setAtivo(null)} />
        </svg>
        {ativo !== null ? (
          <Dica
            x={MARGEM.esquerda + (ativo + 0.5) * faixa}
            titulo={p.rotulos[ativo] ?? ""}
            linhas={p.series.map((s) => ({
              nome: s.nome,
              cor: corDa(s),
              texto: p.formatar(s.valores[ativo] ?? 0),
            }))}
          />
        ) : null}
      </div>
      <TabelaDados
        titulo={p.titulo}
        cabecalho={["", ...p.series.map((s) => s.nome)]}
        linhas={p.rotulos.map((r, i) => [r, ...p.series.map((s) => p.formatar(s.valores[i] ?? 0))])}
      />
    </figure>
  );
}
