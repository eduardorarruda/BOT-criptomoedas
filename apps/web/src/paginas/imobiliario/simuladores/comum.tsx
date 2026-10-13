import { dec, type Valor } from "@zentrade/dominio";
import { ErroParametroFinanceiro } from "@zentrade/financas";
import { TriangleAlert } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { CampoValor } from "../componentes";
import { lerPercentualDigitado, lerReaisDigitado } from "../formato";

/**
 * Base dos simuladores: campos de texto (como a pessoa digita), leitura sem float e
 * a conta refeita a cada mudança — adiada, para digitar não travar.
 */
class ErroCampo extends Error {
  constructor(
    readonly campo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export function reais(texto: string | undefined, campo: string, opcional = false): Valor {
  const t = (texto ?? "").trim();
  if (t === "" && opcional) return dec(0);
  const v = lerReaisDigitado(t);
  if (v === null || v.startsWith("-"))
    throw new ErroCampo(campo, `${campo}: digite um valor, por exemplo 1.234,56.`);
  return dec(v);
}

export function pct(texto: string | undefined, campo: string, opcional = false): number {
  const t = (texto ?? "").trim();
  if (t === "" && opcional) return 0;
  const v = lerPercentualDigitado(t);
  if (v === null) throw new ErroCampo(campo, `${campo}: digite um percentual, por exemplo 10,5.`);
  return v;
}

export function inteiro(texto: string | undefined, campo: string, min: number, max: number): number {
  const n = Number((texto ?? "").trim());
  if (!Number.isInteger(n) || n < min || n > max)
    throw new ErroCampo(campo, `${campo}: um número inteiro de ${min} a ${max}.`);
  return n;
}

export function useCampos<T extends Record<string, string>>(inicial: T) {
  const [valores, setValores] = useState<T>(inicial);
  const mudar = (chave: keyof T) => (v: string) => setValores((a) => ({ ...a, [chave]: v }));
  return { valores, mudar, setValores };
}

export type Calculo<R> =
  { readonly resultado: R; readonly erro: null } | { readonly resultado: null; readonly erro: string };

/** Refaz a conta quando os campos mudam; erro de digitação ou de premissa vira mensagem. */
export function useCalculo<T, R>(valores: T, calcular: (v: T) => R): Calculo<R> {
  const adiados = useDeferredValue(valores);
  return useMemo(() => {
    try {
      return { resultado: calcular(adiados), erro: null };
    } catch (e) {
      if (e instanceof ErroCampo || e instanceof ErroParametroFinanceiro)
        return { resultado: null, erro: e.message };
      throw e;
    }
  }, [adiados, calcular]);
}

export function AvisoConta({ erro }: { readonly erro: string }) {
  return (
    <p className="nota nota--perigo" role="alert">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>Não deu para calcular: {erro}</span>
    </p>
  );
}

/** Lista de campos de um simulador: [chave, rótulo, sufixo, dica?]. */
export function Campos<T extends Record<string, string>>({
  definicoes,
  valores,
  mudar,
}: {
  readonly definicoes: readonly (readonly [
    keyof T & string,
    string,
    ("R$" | "%" | "meses" | "anos" | "cotas")?,
    string?,
  ])[];
  readonly valores: T;
  readonly mudar: (chave: keyof T) => (v: string) => void;
}) {
  return (
    <>
      {definicoes.map(([chave, rotulo, sufixo, dica]) => (
        <CampoValor
          key={chave}
          rotulo={rotulo}
          valor={valores[chave] ?? ""}
          aoMudar={mudar(chave)}
          {...(sufixo ? { sufixo } : {})}
          {...(dica ? { dica } : {})}
        />
      ))}
    </>
  );
}
