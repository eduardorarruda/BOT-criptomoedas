/**
 * Soma dos tamanhos descompactados que um ZIP declara no diretório central, sem
 * descompactar nada. Um .docx é um ZIP: um arquivo de 15 MB pode declarar gigabytes
 * (zip bomb) e derrubar quem o abre. `null` quando o ZIP não tem diretório central
 * legível; ZIP64 (tamanho 0xFFFFFFFF) conta como infinito.
 */
const FIM_DIRETORIO = 0x06054b50;
const ENTRADA_CENTRAL = 0x02014b50;
const COMENTARIO_MAXIMO = 0xffff;

function fimDoDiretorio(b: Buffer): number | null {
  const inicio = Math.max(0, b.length - 22 - COMENTARIO_MAXIMO);
  for (let i = b.length - 22; i >= inicio; i--) if (b.readUInt32LE(i) === FIM_DIRETORIO) return i;
  return null;
}

export function tamanhoDescompactadoDeclarado(bytes: Uint8Array): number | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 22) return null;
  const fim = fimDoDiretorio(b);
  if (fim === null) return null;
  const entradas = b.readUInt16LE(fim + 10);
  let p = b.readUInt32LE(fim + 16);
  let total = 0;
  for (let n = 0; n < entradas; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== ENTRADA_CENTRAL) return null;
    const tamanho = b.readUInt32LE(p + 24);
    if (tamanho === 0xffffffff) return Number.POSITIVE_INFINITY;
    total += tamanho;
    p += 46 + b.readUInt16LE(p + 28) + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return total;
}
