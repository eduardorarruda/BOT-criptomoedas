import { useEffect, useState } from "react";

/** A hora de agora, renovada a cada `passoMs`: para textos como "há 5 s" seguirem andando. */
export function useAgora(passoMs = 1000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), passoMs);
    return () => clearInterval(relogio);
  }, [passoMs]);
  return agora;
}
