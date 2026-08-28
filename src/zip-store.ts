/**
 * zip-store.ts — a dependency-free, deterministic STORE-method (uncompressed) ZIP writer/reader
 * implementing the archive seam's {@link ZipWriter} contract.
 *
 * Why hand-rolled: lore ships zero runtime `dependencies` (the LadybugDB compiled-binary
 * qualification pins that contract), and Bun has no stable stdlib ZIP writer. STORE entries need no
 * deflate — only CRC-32 — so the whole codec is ~120 lines, fully synchronous, byte-reproducible,
 * and trivially verifiable; integrity is carried by per-entry sha256 in the inventory evidence on
 * top of the zip's own CRC-32.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { ZipWriter } from "./backlog-archive";

/** CRC-32 (IEEE 802.3), table-driven. */
const CRC_TABLE: number[] = (() => {
  const table: number[] = new Array<number>(256).fill(0);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c | 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) {
    const entry = CRC_TABLE[(crc ^ byte) & 0xff];
    if (entry !== undefined) crc = (crc >>> 8) ^ entry;
  }
  return (crc ^ -1) >>> 0;
}

const U32_MAX = 0xffffffff;

/** Little-endian writers (DataView-free to stay allocation-light). */
function u16(out: number[], v: number): void {
  out.push(v & 0xff, (v >>> 8) & 0xff);
}
function u32(out: number[], v: number): void {
  out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

/**
 * Build a deterministic ZIP byte stream: fixed DOS timestamp (1980-01-01, the ZIP epoch),
 * sorted entry names, STORE method, no external attributes, no data descriptors. Identical inputs
 * produce identical bytes, so recorded digests are meaningful evidence.
 */
export function buildStoreZip(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const names = [...files.keys()].sort();
  const out: number[] = [];
  const central: number[] = [];
  let offset = 0;
  const encoder = new TextEncoder();
  for (const name of names) {
    const data = files.get(name);
    if (data === undefined) throw new Error(`store zip: missing entry ${name}`);
    if (data.length > U32_MAX || offset > U32_MAX) throw new Error("store zip: entry exceeds ZIP32 limits");
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    // Local file header: signature, version 20, flags 0, method 0 (STORE), time/date = epoch.
    u32(out, 0x04034b50);
    u16(out, 20);
    u16(out, 0);
    u16(out, 0);
    u16(out, 0);
    u16(out, 0x0021); // date 1980-01-01
    u32(out, crc);
    u32(out, data.length);
    u32(out, data.length);
    u16(out, nameBytes.length);
    u16(out, 0);
    for (const b of nameBytes) out.push(b);
    for (const b of data) out.push(b);
    // Central directory record for this entry.
    u32(central, 0x02014b50);
    u16(central, 20);
    u16(central, 20);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0x0021);
    u32(central, crc);
    u32(central, data.length);
    u32(central, data.length);
    u16(central, nameBytes.length);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u32(central, 0);
    u32(central, offset);
    for (const b of nameBytes) central.push(b);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralStart = offset;
  const centralSize = central.length;
  // End of central directory.
  const eocd: number[] = [];
  u32(eocd, 0x06054b50);
  u16(eocd, 0);
  u16(eocd, 0);
  u16(eocd, names.length);
  u16(eocd, names.length);
  u32(eocd, centralSize);
  u32(eocd, centralStart);
  u16(eocd, 0);
  // Physical layout: local entries, then the central directory, then the EOCD record.
  const total = new Uint8Array(out.length + central.length + eocd.length);
  total.set(out, 0);
  total.set(central, out.length);
  total.set(eocd, out.length + central.length);
  return total;
}

/** Minimal ZIP32 reader: walks the local headers via the central directory; STORE only. */
export function parseStoreZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Locate end-of-central-directory from the tail (comment length 0 in our writer, but scan anyway).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("store zip: end of central directory not found");
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("store zip: corrupt central directory");
    const method = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    if (method !== 0) throw new Error(`store zip: entry ${JSON.stringify(name)} is not STORE-compressed`);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    const expectedCrc = view.getUint32(ptr + 16, true);
    if (crc32(data) !== expectedCrc)
      throw new Error(`store zip: CRC-32 mismatch for ${JSON.stringify(name)} — the archive is corrupt`);
    out.set(name, data);
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The concrete {@link ZipWriter} used by production archive-and-delete runs. */
export const storeZipWriter: ZipWriter = {
  write(zipAbs, files) {
    writeFileSync(zipAbs, buildStoreZip(files));
  },
  read(zipAbs) {
    return parseStoreZip(new Uint8Array(readFileSync(zipAbs)));
  },
};
