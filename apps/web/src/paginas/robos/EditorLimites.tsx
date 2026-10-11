/** Os limites que o motor de risco aplica ao robô. Valores em dólar aceitam vírgula. */
import type { LimitesRiscoDTO } from "@zentrade/contratos";
import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Botao } from "../../componentes/Botao";
import { CampoTexto } from "../../componentes/Campo";
import { deLimites, validarLimites, type CamposLimitesTexto as Campos } from "../../lib/limites";

export function CamposLimites({
  campos,
  erros,
  mudar,
}: {
  campos: Campos;
  erros: Partial<Record<keyof Campos, string>>;
  mudar: (k: keyof Campos, v: string) => void;
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
      {campo("exposicaoMaxima", "Exposição máxima (US$)", "Soma das posições abertas deste robô.")}
      {campo("riscoPorOperacao", "Risco por operação (US$)", "Quanto pode perder se o stop for atingido.")}
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
    </div>
  );
}

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
