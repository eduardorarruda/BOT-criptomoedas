import {
  avaliar,
  dec,
  NOS_MAXIMOS,
  precoAlvo,
  precoStop,
  stopDeEntrada,
  validarRegra,
} from "@zentrade/dominio";
import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import { Fragment, useState } from "react";
import { Segmentado } from "../componentes/Segmentado";
import { Selo } from "../componentes/Selo";
import { useCandles } from "../ganchos/consultas";
import { contextoDeVelas, paraDominio } from "../lib/estrategia";
import { formatarPercentual, formatarPreco } from "../lib/formatar";
import { contarNos, paraRegra, type NoEditor } from "./arvore";
import { fraseDirecao, frasesLados, frasesSaidas, linhas } from "./descrever";
import { fracaoDe, nosUsados, type EstadoConstrutor, type Montagem } from "./estado";
import { lerSaidas } from "./saidas";

/**
 * Prévia ao vivo: a regra e as saídas em palavras (com os mesmos rótulos do
 * domínio), o que ela diria agora no mercado (avaliar do domínio sobre os candles
 * completos, com a explicação) e o que falta para salvar (validarRegra e
 * validarEstrategia).
 */
const PARES = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;

const primeiraMaiuscula = (t: string): string => `${t[0]?.toUpperCase() ?? ""}${t.slice(1)}`;

function Linhas({ no }: { readonly no: NoEditor | null }) {
  return (
    <ul role="list" className="previa__linhas">
      {linhas(no).map((l, i) => (
        <li key={`${i}-${l.nivel}-${l.texto}`} style={{ paddingInlineStart: `${l.nivel * 14}px` }}>
          {l.texto}
        </li>
      ))}
    </ul>
  );
}

function EmPalavras({ estado }: { readonly estado: EstadoConstrutor }) {
  const protecao = frasesSaidas(
    { stop: fracaoDe(estado.stop), ...lerSaidas(estado.saidas).campos },
    estado.direcao,
  );
  return (
    <section className="previa__bloco" aria-labelledby="previa-palavras">
      <h2 id="previa-palavras" className="previa__titulo">
        Em palavras
      </h2>
      {estado.direcao !== "comprado" ? (
        <p className="previa__frase">
          <strong>Direção:</strong> {fraseDirecao(estado.direcao)}.
        </p>
      ) : null}
      {frasesLados(estado).map((f) => (
        <Fragment key={f.arvore}>
          <p className="previa__frase">
            <strong>{f.verbo}</strong> {f.texto}.
          </p>
          {f.arvore === "entrada" || f.arvore === "entradaVendida" ? <Linhas no={estado[f.arvore]} /> : null}
        </Fragment>
      ))}
      {protecao.length ? (
        <ul role="list" className="previa__linhas previa__saidas" aria-label="Proteção e saídas">
          {protecao.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SeFosseAgora({
  estado,
  montagem,
}: {
  readonly estado: EstadoConstrutor;
  readonly montagem: Montagem;
}) {
  const [par, setPar] = useState<(typeof PARES)[number]>("BTCUSDT");
  const velas = useCandles(par, "1h");
  const convertida = paraRegra(estado.entrada).regra;
  // Parâmetro fora da faixa (período 0, por exemplo) não avalia: a validação já aponta.
  const regra = convertida && validarRegra(convertida).length === 0 ? convertida : null;
  const ctx = contextoDeVelas(velas.data ?? []);
  const resultado = regra && ctx.fechamentos.length ? avaliar(regra, ctx) : null;
  const ultimo = velas.data?.at(-1)?.fecha;
  const stop = fracaoDe(estado.stop);
  const alvo = fracaoDe(estado.alvo);
  const taxa = fracaoDe(estado.taxa);
  const stopAgora =
    ultimo && stop !== null && stop > 0
      ? montagem.estrategia
        ? stopDeEntrada(paraDominio(montagem.estrategia), dec(ultimo), ctx)
        : { stop: precoStop(dec(ultimo), stop), explicacao: null }
      : null;
  if (estado.direcao === "vendido")
    return (
      <section className="previa__bloco" aria-labelledby="previa-agora">
        <h2 id="previa-agora" className="previa__titulo">
          Se fosse agora
        </h2>
        <p className="apagado">
          Esta prévia usa candles de cripto, onde só se compra. Para ver a venda a descoberto, rode o backtest
          do mini índice (WIN).
        </p>
      </section>
    );
  return (
    <section className="previa__bloco" aria-labelledby="previa-agora">
      <h2 id="previa-agora" className="previa__titulo">
        Se fosse agora
      </h2>
      {estado.direcao === "ambos" ? (
        <p className="apagado">
          Candles de cripto: só o lado comprado. A venda a descoberto aparece no backtest do mini índice
          (WIN).
        </p>
      ) : null}
      <Segmentado
        rotulo="Par para testar"
        ocultarRotulo
        opcoes={PARES.map((p) => ({ valor: p, rotulo: p.replace("USDT", "") }))}
        valor={par}
        aoMudar={setPar}
      />
      {velas.isPending ? <p className="apagado">Buscando candles de 1 h…</p> : null}
      {velas.error ? (
        <p className="apagado">Sem candles de {par} agora; a prévia volta quando a API responder.</p>
      ) : null}
      {resultado ? (
        <div className="previa__resultado" aria-live="polite">
          <Selo
            tom={resultado.valor ? "marca" : "neutro"}
            icone={resultado.valor ? CircleCheck : CircleDashed}
          >
            {resultado.valor ? "Entraria agora" : "Não entraria agora"}
          </Selo>
          <p className="previa__explicacao">{resultado.explicacao}</p>
        </div>
      ) : null}
      {!regra ? <p className="apagado">Complete a regra para ver o resultado.</p> : null}
      {ultimo && stopAgora && alvo !== null && taxa !== null && alvo > 0 ? (
        <p className="previa__alvo">
          Entrando a <span className="num">{formatarPreco(ultimo)}</span>: stop em{" "}
          <span className="num perda">{formatarPreco(stopAgora.stop.toFixed())}</span> e alvo em{" "}
          <span className="num ganho">{formatarPreco(precoAlvo(dec(ultimo), alvo, taxa).toFixed())}</span> —{" "}
          {formatarPercentual(alvo)} líquido depois das duas taxas de {formatarPercentual(taxa, { casas: 2 })}
          .
          {stopAgora.explicacao ? (
            <span className="apagado"> {primeiraMaiuscula(stopAgora.explicacao)}.</span>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

function Validacao({ estado, montagem }: { readonly estado: EstadoConstrutor; readonly montagem: Montagem }) {
  const partes = nosUsados(estado).reduce((soma, no) => soma + contarNos(no), 0);
  return (
    <section className="previa__bloco" aria-labelledby="previa-validacao">
      <h2 id="previa-validacao" className="previa__titulo">
        Pronta para salvar?
      </h2>
      {montagem.problemas.length === 0 ? (
        <p className="previa__ok">
          <CircleCheck size={16} aria-hidden="true" /> Tudo certo. A regra passou nas validações do domínio.
        </p>
      ) : (
        <ul role="list" className="previa__problemas" aria-live="polite">
          {montagem.problemas.map((p) => (
            <li key={p}>
              <TriangleAlert size={14} aria-hidden="true" /> {p[0]?.toUpperCase()}
              {p.slice(1)}.
            </li>
          ))}
        </ul>
      )}
      <p className="apagado previa__partes">
        <span className="num">{partes}</span> de <span className="num">{NOS_MAXIMOS}</span> partes usadas
      </p>
    </section>
  );
}

export function Previa({
  estado,
  montagem,
}: {
  readonly estado: EstadoConstrutor;
  readonly montagem: Montagem;
}) {
  return (
    <aside className="previa" aria-label="Prévia da estratégia">
      <EmPalavras estado={estado} />
      <SeFosseAgora estado={estado} montagem={montagem} />
      <Validacao estado={estado} montagem={montagem} />
    </aside>
  );
}
