// PhantomPrint Icon Generator - Creates minimal valid PNG icons
// Run: node generate-icons.js
// This creates simple colored circle icons for the extension

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size) {
  // Create raw RGBA pixel data for a gradient circle icon
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = size / 2;
      const cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const radius = size / 2 - 1;

      if (dist <= radius) {
        // Gradient from purple (#7c3aed) to cyan (#06b6d4)
        const t = (x + y) / (size * 2);
        const r = Math.round(0x7c * (1 - t) + 0x06 * t);
        const g = Math.round(0x3a * (1 - t) + 0xb6 * t);
        const b = Math.round(0xed * (1 - t) + 0xd4 * t);

        // Ghost silhouette in center
        const ghostCenterX = size / 2;
        const ghostCenterY = size * 0.4;
        const ghostDist = Math.sqrt((x - ghostCenterX) ** 2 + (y - ghostCenterY) ** 2);
        const ghostRadius = size * 0.25;
        const inGhostHead = ghostDist <= ghostRadius;
        const inGhostBody = x >= ghostCenterX - ghostRadius && x <= ghostCenterX + ghostRadius && y >= ghostCenterY && y <= ghostCenterY + ghostRadius * 1.5;

        if (inGhostHead || inGhostBody) {
          pixels[idx] = 255;     // R
          pixels[idx + 1] = 255; // G
          pixels[idx + 2] = 255; // B
          pixels[idx + 3] = 230; // A
        } else {
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      } else {
        // Transparent outside circle
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  // Build PNG file
  return buildPNG(size, size, pixels);
}

function buildPNG(width, height, rgbaData) {
  const chunks = [];

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  chunks.push(signature);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // Bit depth
  ihdr[9] = 6;  // Color type (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  chunks.push(createChunk('IHDR', ihdr));

  // IDAT chunk - image data
  // Add filter byte (0 = None) before each row
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // Filter: None
    rgbaData.copy(rawData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData);
  chunks.push(createChunk('IDAT', compressed));

  // IEND chunk
  chunks.push(createChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

[16, 48, 128].forEach(size => {
  const png = createPNG(size);
  const filepath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filepath, png);
  console.log(`Created ${filepath} (${png.length} bytes)`);
});

console.log('Done! Icons generated successfully.');
