// ---------- Mini-écrivain ZIP (méthode STORE, sans compression) ----------
// Zéro dépendance : l'export d'instance produit une archive .zip contenant un
// fichier par modèle. Format compatible (local headers + central directory).

function crc32(data: Uint8Array): number {
  let table = (crc32 as unknown as { t?: Uint32Array }).t;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    (crc32 as unknown as { t: Uint32Array }).t = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  content: string;
}

/** Construit une archive ZIP (STORE/UTF-8) et la retourne comme Blob. */
export function makeZipBlob(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const pushU16 = (arr: number[], v: number) => {
    arr.push(v & 0xff, (v >> 8) & 0xff);
  };
  const pushU32 = (arr: number[], v: number) => {
    arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
  };

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const dataBytes = enc.encode(e.content);
    const crc = crc32(dataBytes);
    const local: number[] = [];
    pushU32(local, 0x04034b50); // signature local header
    pushU16(local, 20); // version
    pushU16(local, 0x0800); // flag UTF-8
    pushU16(local, 0); // méthode STORE
    pushU16(local, 0); // heure
    pushU16(local, 0x4a21); // date fixe
    pushU32(local, crc);
    pushU32(local, dataBytes.length);
    pushU32(local, dataBytes.length);
    pushU16(local, nameBytes.length);
    pushU16(local, 0); // extra
    const header = new Uint8Array([...local, ...nameBytes]);
    chunks.push(header, dataBytes);
    const localSize = header.length + dataBytes.length;

    const c: number[] = [];
    pushU32(c, 0x02014b50); // central signature
    pushU16(c, 20);
    pushU16(c, 20);
    pushU16(c, 0x0800);
    pushU16(c, 0);
    pushU16(c, 0);
    pushU16(c, 0x4a21);
    pushU32(c, crc);
    pushU32(c, dataBytes.length);
    pushU32(c, dataBytes.length);
    pushU16(c, nameBytes.length);
    pushU16(c, 0);
    pushU16(c, 0);
    pushU16(c, 0);
    pushU16(c, 0);
    pushU32(c, 0);
    pushU32(c, offset);
    central.push(new Uint8Array([...c, ...nameBytes]));
    offset += localSize;
  }

  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const end: number[] = [];
  pushU32(end, 0x06054b50);
  pushU16(end, 0);
  pushU16(end, 0);
  pushU16(end, entries.length);
  pushU16(end, entries.length);
  pushU32(end, centralSize);
  pushU32(end, offset);
  pushU16(end, 0);

  return new Blob(
    [...chunks, ...central, new Uint8Array(end)] as BlobPart[],
    { type: "application/zip" }
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
