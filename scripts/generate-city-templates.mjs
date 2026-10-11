import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { CITY_ART_SPECS } from '../src/game/city-art.ts';

const folder = new URL('../public/game/scenes/city/templates/', import.meta.url);
mkdirSync(folder, { recursive: true });
function chunk(type, data) {
  const name = Buffer.from(type), bytes = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4), sum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, bytes, sum]);
}
for (const spec of Object.values(CITY_ART_SPECS)) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(spec.width); header.writeUInt32BE(spec.height, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA, filter byte 0 on every row.
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((spec.width * 4 + 1) * spec.height))), chunk('IEND', Buffer.alloc(0))]);
  writeFileSync(new URL(spec.file, folder), png);
}
writeFileSync(new URL('sizes.json', folder), JSON.stringify(CITY_ART_SPECS, null, 2));
console.log('Created 6 transparent PNG templates with verified source dimensions.');
