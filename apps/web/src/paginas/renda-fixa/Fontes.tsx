import type { Indicadores } from "@zentrade/contratos/esquemas";
import { RefreshCw, Scale, TriangleAlert } from "lucide-react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { useAtualizarIndicadores, useRegrasRF } from "./consultas";
import { data, pct, TIPO } from "./formato";

const NOME_CURTO: Readonly<Record<string, string>> = {
  CDI: "CDI",
  SELIC: "Selic",
  SELIC_META: "Meta Selic",
  IPCA: "IPCA",
  POUPANCA: "Poupança",
  TR: "TR",
};

const quando = (ms: number | null): string =>
  ms === null
    ? "nunca"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(ms);

/** Taxas do Banco Central com a data de cada uma: sem dado, a tela diz que falta. */
export function TaxasDoDia({
  indicadores,
  demo,
}: {
  readonly indicadores: Indicadores;
  readonly demo: boolean;
}) {
  const atualizar = useAtualizarIndicadores();
  const avisar = useAvisos();
  const principais = indicadores.series.filter((s) =>
    ["CDI", "SELIC", "SELIC_META", "IPCA"].includes(s.serie),
  );
  return (
    <div className="rf-taxas">
      <dl className="rf-taxas__lista">
        {principais.map((s) => (
          <div key={s.serie} className="rf-taxas__item">
            <dt>{NOME_CURTO[s.serie]}</dt>
            <dd className="num">
              {s.ultimoDia === null ? (
                <span className="atencao">sem dado</span>
              ) : s.anualizado ? (
                `${pct(s.anualizado)} ${s.serie === "IPCA" ? "em 12 meses" : "a.a."}`
              ) : (
                `${pct(s.ultimoValor, { casas: 2 })} no mês`
              )}
            </dd>
            <dd className="rf-taxas__data">
              {s.ultimoDia
                ? `${s.serie === "IPCA" ? "referência" : "de"} ${data(s.ultimoDia)}`
                : "ainda não buscado"}
              {s.erro ? (
                <span className="atencao" title={s.erro}>
                  {" "}
                  <TriangleAlert size={12} aria-hidden="true" /> última busca falhou
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="rf-fonte">
        Fonte: {indicadores.fonte} (séries {principais.map((s) => s.codigoSgs).join(", ")}). Conferido em{" "}
        {quando(indicadores.series.find((s) => s.serie === "CDI")?.verificadoEm ?? null)}. A taxa anual do CDI
        e da Selic é a do último dia levada a 252 dias úteis.
      </p>
      {!demo ? (
        <Botao
          pequeno
          variante="fantasma"
          icone={RefreshCw}
          carregando={atualizar.isPending}
          onClick={() =>
            atualizar.mutate(undefined, {
              onSuccess: () => avisar("sucesso", "Índices do Banco Central atualizados."),
              onError: (e) => avisar("erro", mensagemDe(e)),
            })
          }
        >
          Buscar índices agora
        </Botao>
      ) : null}
    </div>
  );
}

/** Rodapé das regras: de onde vêm as alíquotas e quando foram conferidas. */
export function RegrasEmVigor() {
  const { data: r } = useRegrasRF();
  if (!r) return null;
  return (
    <details className="rf-regras">
      <summary>
        <Scale size={15} aria-hidden="true" /> Regras de imposto usadas nas contas (conferidas em{" "}
        {data(r.verificadoEm)})
      </summary>
      <div className="rf-regras__corpo">
        <p>
          <strong>IR regressivo</strong> ({r.ir.fonte}):{" "}
          {r.ir.faixas
            .map(
              (f) =>
                `${f.ateDias === null ? "acima de 720 dias" : `até ${f.ateDias} dias`}: ${pct(f.aliquotaPct, { casas: 1 })}`,
            )
            .join(" · ")}
          .
        </p>
        <p>
          <strong>IOF</strong> ({r.iof.fonte}): de {r.iof.percentuais[0]}% do rendimento no 1º dia a zero a
          partir do 30º.
        </p>
        <p>
          <strong>Isentos de IR para pessoa física:</strong>{" "}
          {r.isencoes
            .filter((i) => i.isentoIr)
            .map((i) => `${TIPO[i.tipo]} (${i.base})`)
            .join("; ")}
          .
        </p>
        {r.notas.map((n) => (
          <p key={n} className="apagado">
            {n}
          </p>
        ))}
        <p className="apagado">
          Dias úteis: {r.feriados.fonte}, conferido em {data(r.feriados.verificadoEm)}.
        </p>
      </div>
    </details>
  );
}
