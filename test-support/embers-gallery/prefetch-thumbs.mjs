// Extracts every shape's thumbnail of the JB2A library into jb2a-patreon/ (about 60 MB), so the browser is instant.
// node test-support/embers-gallery/prefetch-thumbs.mjs
import { jb2aFile, jb2aShapes } from "./jb2aZip.mjs";
const thumbs = [...new Set((await jb2aShapes()).map((shape) => shape.thumb).filter(Boolean))];
let done = 0;
const queue = [...thumbs];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const thumb = queue.shift();
    try { await jb2aFile(thumb); } catch (error) { console.warn(thumb, error.message); }
    if (++done % 200 === 0) console.log(`${done}/${thumbs.length}`);
  }
}));
console.log(`miniature: ${done}/${thumbs.length}`);
