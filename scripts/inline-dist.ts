/**
 * Post-build script: inlines public/ assets (wasm, js, png, etc.) from dist/ into index.html.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const DIST_DIR = join(process.cwd(), 'dist');
const INLINE_EXTENSIONS = new Set(['wasm', 'js', 'mjs', 'json', 'zip', 'png', 'jpg', 'webp', 'svg', 'html', 'css']);
const SKIP_FILES = new Set(['index.html', 'server.js']);

function getMime(ext: string): string {
  const map: Record<string, string> = {
    wasm: 'application/wasm',
    js: 'application/javascript',
    mjs: 'application/javascript',
    json: 'application/json',
    zip: 'application/zip',
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    html: 'text/html',
    css: 'text/css',
  };
  return map[ext] ?? 'application/octet-stream';
}

function walkDir(dir, rel, entries) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const p = rel ? `${rel}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, p, entries);
    } else {
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (!INLINE_EXTENSIONS.has(ext)) continue;
      const buf = readFileSync(full);
      const mime = getMime(ext);
      entries.push([p, `data:${mime};base64,${buf.toString('base64')}`]);
    }
  }
}

function main() {
  const entries = [];
  console.log('[inline] Scanning dist/ for assets to inline...');

  // Collect entries from all directories (skip index.html at root)
  for (const name of readdirSync(DIST_DIR)) {
    const full = join(DIST_DIR, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, name, entries);
      rmSync(full, { recursive: true });
      console.log(`[inline] Inlined and removed dist/${name}/`);
    } else if (!SKIP_FILES.has(name) && !name.startsWith('.')) {
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (INLINE_EXTENSIONS.has(ext)) {
        const buf = readFileSync(full);
        const mime = getMime(ext);
        entries.push([name, `data:${mime};base64,${buf.toString('base64')}`]);
        rmSync(full);
        console.log(`[inline] Inlined and removed dist/${name}`);
      }
    }
  }

  const blobMap = JSON.stringify(Object.fromEntries(entries));

  const interceptor = `<script>(function(){var B=${blobMap};function r(u){if(!u)return null;var p=u.replace(/.*\\/,'').split('?')[0];if(B[p])return B[p];for(var k of Object.keys(B)){if(u.endsWith('/'+k)||u.endsWith(k))return B[k];}if(!B[p]&&p===''){var d=u.replace(/\\/$/,'');for(var k of Object.keys(B)){if(d.endsWith('/'+k)||d===k)return B[k];}}return null;}var f=window.fetch;window.fetch=function(i,t){var u=typeof i==='string'?i:(i&&i.url)||'';var b=r(u);if(b){var m=b.indexOf(';base64,'),mime=b.slice(5,m);return Promise.resolve(new Response(atob(b.slice(m+8)),{headers:{'Content-Type':mime}}));}return f.call(this,i,t);};var s=HTMLImageElement.prototype.setAttribute;HTMLImageElement.prototype.setAttribute=function(k,v){if(k==='src'){var b=r(v);if(b){this.src=b;return;}}return s.call(this,k,v);};})();</script>`;

  let html = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8');
  html = html.replace('</head>', interceptor + '\n</head>');
  writeFileSync(join(DIST_DIR, 'index.html'), html, 'utf-8');

  let total = 0;
  for (const [, data] of entries) total += data.length * 0.75;
  console.log(`[inline] Done. ${entries.length} files inlined, ${(total / 1024 / 1024).toFixed(2)} MB.`);
}

main();
