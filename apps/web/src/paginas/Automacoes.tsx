import { Activity, CircleCheck, CircleDashed, CircleX, Server, Workflow } from "lucide-react";
import { ehErroApi } from "../api/erros";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { Selo } from "../componentes/Selo";
import { useAutomacoes, useSaude } from "../ganchos/consultas";
import { formatarRelativo } from "../lib/tempo";

const RESULTADO = {
  ok: { texto: "Funcionou", tom: "marca", icone: CircleCheck },
  falhou: { texto: "Falhou", tom: "perda", icone: CircleX },
  nunca: { texto: "Ainda não rodou", tom: "neutro", icone: CircleDashed },
} as const;

const SERVICOS = {
  banco: "Banco de dados",
  redis: "Fila e eventos (Redis)",
  motor: "Motor dos robôs",
  agente: "Agente de IA",
} as const;

function Saude() {
  const saude = useSaude();
  if (saude.isPending) return <Esqueleto forma="lista" linhas={4} rotulo="Carregando a saúde dos serviços" />;
  if (saude.error)
    return <ErroCarregar erro={saude.error} tentarDeNovo={() => void saude.refetch()} compacto />;
  return (
    <ul role="list" className="servicos">
      {(Object.keys(SERVICOS) as (keyof typeof SERVICOS)[]).map((s) => {
        const ok = saude.data.servicos[s];
        return (
          <li key={s}>
            <span className={`servicos__icone ${ok ? "" : "servicos__icone--fora"}`} aria-hidden="true">
              <Server size={16} />
            </span>
            <span>{SERVICOS[s]}</span>
            <Selo tom={ok ? "marca" : "perda"} icone={ok ? CircleCheck : CircleX}>
              {ok ? "No ar" : "Fora do ar"}
            </Selo>
          </li>
        );
      })}
    </ul>
  );
}

export function Automacoes() {
  const consulta = useAutomacoes();
  const semEndpoint = ehErroApi(consulta.error) && consulta.error.codigo === "nao_encontrado";

  return (
    <>
      <Cabecalho titulo="Automações">
        Os fluxos do n8n que rodam em volta dos robôs: aprovação pelo Telegram, notícias, vigia de saúde e
        avisos.
      </Cabecalho>
      <div className="grade-dupla grade-dupla--larga">
        <Painel
          titulo="Fluxos"
          id="titulo-fluxos"
          icone={Workflow}
          descricao="Última execução de cada fluxo do n8n."
        >
          {consulta.isPending ? <Esqueleto forma="lista" linhas={5} rotulo="Carregando automações" /> : null}
          {semEndpoint ? (
            <EstadoVazio icone={Workflow} titulo="Status indisponível">
              Esta versão da API ainda não informa o status dos fluxos do n8n. Veja direto no painel do n8n
              (porta 5678).
            </EstadoVazio>
          ) : consulta.error ? (
            <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
          ) : null}
          {consulta.data?.length === 0 ? (
            <EstadoVazio icone={Workflow} titulo="Nenhum sinal dos fluxos ainda">
              A API mostra aqui os fluxos do n8n que já falaram com ela: webhooks assinados recebidos (vigia
              de saúde, notícias, aprovação) e avisos que ela enviou (propostas, alertas). Importe e ative os
              fluxos de infra/n8n; o status aparece depois da primeira execução.
            </EstadoVazio>
          ) : null}
          <ul role="list" className="fluxos">
            {consulta.data?.map((a) => {
              const r = RESULTADO[a.ultimoResultado];
              return (
                <li key={a.id} className={`fluxo ${a.ultimoResultado === "falhou" ? "fluxo--falhou" : ""}`}>
                  <span className={`fluxo__icone fluxo__icone--${a.ultimoResultado}`} aria-hidden="true">
                    <Workflow size={16} />
                  </span>
                  <div className="fluxo__texto">
                    <p className="fluxo__nome">
                      {a.nome} {a.ativa ? null : <Selo tom="neutro">Desligado</Selo>}
                    </p>
                    <p className="apagado">{a.descricao}</p>
                  </div>
                  <div className="fluxo__estado">
                    <Selo tom={r.tom} icone={r.icone}>
                      {r.texto}
                    </Selo>
                    <span className="apagado">
                      {a.ultimaExecucaoEm ? formatarRelativo(a.ultimaExecucaoEm) : "—"}
                    </span>
                    {a.falhas24h > 0 ? (
                      <span className="perda">
                        <span className="num">{a.falhas24h}</span> {a.falhas24h === 1 ? "falha" : "falhas"} em
                        24 h. Abra o fluxo no n8n para ver o erro.
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Painel>
        <Painel titulo="Saúde dos serviços" id="titulo-saude" icone={Activity}>
          <Saude />
        </Painel>
      </div>
    </>
  );
}
