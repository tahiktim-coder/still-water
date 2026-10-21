// Zips the itch.io build (node build.js --itch, tools/out/itch/index.html) into itch/still-water.zip with one
// index.html at its root. A minimal zip writer on Node built-ins: one deflated entry, its local header, the
// central directory and the end record.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const src = path.join(root, 'tools', 'out', 'itch', 'index.html');
const dest = path.join(root, 'itch', 'still-water.zip');
if (!fs.existsSync(src)) throw new Error('run node build.js --itch first (no ' + path.relative(root, src) + ')');

const data = fs.readFileSync(src);
const packed = zlib.deflateRawSync(data, { level: 9 });
const crc = zlib.crc32(data) >>> 0;
const name = Buffer.from('index.html');
const d = fs.statSync(src).mtime;
const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

// The fields a local header and a central directory entry share, from 'version needed' to the name's length.
function common() {
  const b = Buffer.alloc(26);
  b.writeUInt16LE(20, 0); // version needed: 2.0
  b.writeUInt16LE(0x0800, 2); // UTF-8 names
  b.writeUInt16LE(8, 4); // deflate
  b.writeUInt16LE(dosTime, 6);
  b.writeUInt16LE(dosDate, 8);
  b.writeUInt32LE(crc, 10);
  b.writeUInt32LE(packed.length, 14);
  b.writeUInt32LE(data.length, 18);
  b.writeUInt16LE(name.length, 22);
  b.writeUInt16LE(0, 24); // extra field length
  return b;
}
const sig = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };

const local = Buffer.concat([sig(0x04034b50), common(), name, packed]);
const tail = Buffer.alloc(14); // comment length, disk, internal and external attributes, local header offset
tail.writeUInt32LE(0, 10);
const central = Buffer.concat([sig(0x02014b50), Buffer.from([20, 0]), common(), tail, name]);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(1, 8); // entries on this disk
end.writeUInt16LE(1, 10); // entries in all
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(local.length, 16);

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, Buffer.concat([local, central, end]));
console.log('zipped ' + path.relative(root, dest) + ' (index.html, ' + (data.length / 1024).toFixed(1) + ' KB, zip ' + (fs.statSync(dest).size / 1024).toFixed(1) + ' KB)');
