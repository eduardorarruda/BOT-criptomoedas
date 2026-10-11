// Trabalhador de teste: estoura a memória do V8 (simula um arquivo que descompacta demais).
const pedacos: string[] = [];
for (;;) pedacos.push("x".repeat(1_000_000) + String(pedacos.length));
