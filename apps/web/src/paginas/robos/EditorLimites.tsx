/** Os limites que o motor de risco aplica ao robô. Valores em dólar aceitam vírgula. */
import type { LimitesRiscoDTO } from "@zentrade/contratos/esquemas";
import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Botao } from "../../componentes/Botao";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import { deLimites, validarLimites, type CamposLimitesTexto as Campos } from "../../lib/limites";

export function CamposLimites({
  campos,
  erros,
  mudar,
  porAlocacao = false,
}: {
  campos: Campos;
  erros: Partial<Record<keyof Campos, string>>;
  mudar: (k: keyof Campos, v: string) => void;
  /** A estratégia dimensiona por alocação (cofre): a exposição máxima é o tamanho da compra. */
  porAlocacao?: boolean;
}) {
  const campo = (k: keyof Campos, rotulo: string, dica: string, modo: "decimal" | "numeric" = "decimal") => (
    <CampoTexto
      rotulo={rotulo}
      dica={dica}
      inputMode={modo}
      value={campos[k]}
      onChange={(e) => mudar(k, e.target.value)}
      erro={erros[k]}
      className="campo--num"
    />
  );
  return (
    <div className="grade-campos">
      {campo(
        "perdaDiariaMaxima",
        "Perda diária máxima (US$)",
        "Passou disso no dia, o robô para de comprar.",
      )}
      {campo(
        "exposicaoMaxima",
        "Exposição máxima (US$)",
        porAlocacao
          ? "Soma das posições abertas deste robô. Nesta estratégia, a exposição máxima é o tamanho da compra (a fração escolhida dela, limitada ao saldo livre)."
          : "Soma das posições abertas deste robô.",
      )}
      {campo(
        "riscoPorOperacao",
        "Risco por operação (US$)",
        porAlocacao
          ? "Não define o tamanho desta estratégia (o tamanho é por alocação); o stop dela é só proteção contra desastre."
          : "Quanto pode perder se o stop for atingido.",
      )}
      {campo(
        "ordensPorHoraMax",
        "Ordens por hora (máx.)",
        "Freio contra repetição em mercado agitado.",
        "numeric",
      )}
      {campo(
        "pausaAposPerdaMin",
        "Pausa depois de perda (min)",
        "Tempo sem novas compras após um stop.",
        "numeric",
      )}
      {campo(
        "confiancaMinima",
        "Confiança mínima da IA (%)",
        "Abaixo disso, o risco barra a proposta.",
        "numeric",
      )}
      <CampoSelecao
        rotulo="Dias de evento (Copom, payroll, eleição)"
        value={campos.diasDeEvento}
        onChange={(e) => mudar("diasDeEvento", e.target.value)}
        dica={DICA_DIAS_DE_EVENTO}
      >
        <option value="ignorar">Ignorar (padrão): operar normalmente</option>
        <option value="bloquear">Bloquear: não abrir posição nesses dias</option>
        <option value="reduzir">Reduzir: abrir com metade do tamanho</option>
      </CampoSelecao>
      <CampoSelecao
        rotulo="Claude neste robô"
        value={campos.agente}
        onChange={(e) => mudar("agente", e.target.value)}
        dica={DICA_AGENTE}
      >
        <option value="decide">Decide: analisa e pode vetar (padrão)</option>
        <option value="desligado">Desligado: só a regra, sem custo de IA</option>
      </CampoSelecao>
    </div>
  );
}

const DICA_AGENTE =
  "Desligado, o robô segue só a regra da estratégia e os limites de risco, sem consultar o Claude nem gastar com IA. No replay pré-registrado, o Claude como filtro da P1 ficou indistinguível do acaso. Para comparar, rode duas P1 iguais, uma de cada jeito, pelo mesmo tempo.";

const DICA_DIAS_DE_EVENTO =
  "Vale para entradas de dias com evento de alto impacto na sua Agenda de eventos (em Risco); saída e stop nunca são barrados. Cuidado: estratégias de tendência costumam ganhar justamente nesses dias. Nos 20 pregões do WIN que medimos, bloquear piorou as de tendência e ajudou um pouco as de volta à média.";

export function useCamposLimites(inicial: LimitesRiscoDTO) {
  const [campos, setCampos] = useState<Campos>(() => deLimites(inicial));
  const [erros, setErros] = useState<Partial<Record<keyof Campos, string>>>({});
  const mudar = (k: keyof Campos, v: string): void => setCampos((c) => ({ ...c, [k]: v }));
  const validar = (): LimitesRiscoDTO | null => {
    const r = validarLimites(campos);
    setErros(r.erros);
    return r.limites;
  };
  return { campos, erros, mudar, validar };
}

export function EditorLimites({
  limites,
  salvando,
  aoSalvar,
}: {
  readonly limites: LimitesRiscoDTO;
  readonly salvando: boolean;
  readonly aoSalvar: (l: LimitesRiscoDTO) => void;
}) {
  const { campos, erros, mudar, validar } = useCamposLimites(limites);
  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    const novos = validar();
    if (novos) aoSalvar(novos);
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <CamposLimites campos={campos} erros={erros} mudar={mudar} />
      <div className="formulario__acoes">
        <Botao type="submit" variante="secundario" icone={Save} carregando={salvando}>
          Salvar limites
        </Botao>
      </div>
    </form>
  );
}
