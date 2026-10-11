/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" liga o modo de demonstração (dados fictícios, sem API). */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
