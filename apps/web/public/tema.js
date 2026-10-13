/* global document, localStorage */
// Aplica o tema salvo antes do primeiro desenho, para não piscar. Fica num arquivo da
// própria origem (e não inline no index.html) porque a CSP só aceita script-src 'self'.
try {
  const tema = localStorage.getItem("zentrade:tema");
  if (tema === "claro" || tema === "escuro") document.documentElement.dataset.tema = tema;
} catch {
  // Sem armazenamento (janela anônima, site bloqueado): fica o tema do sistema.
}
