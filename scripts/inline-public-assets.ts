import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { Plugin } from 'vite';

export function inlinePublicAssets(): Plugin {
  const publicDir = join(process.cwd(), 'public');
  const entries: [string, string][] = [];

  function walk(dir: string, rel = ''): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const path = rel ? `${rel}/${name}` : name;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, path);
      else {
        const buf = readFileSync(full);
        const ext = name.split('.').pop()?.toLowerCase() ?? '';
        const mimeMap: Record<string, string> = {
          wasm: 'application/wasm',
          js: 'application/javascript',
          mjs: 'application/javascript',
          json: 'application/json',
          zip: 'application/zip',
          png: 'image/png',
          jpg: 'image/jpeg',
          webp: 'image/webp',
          svg: 'image/svg+xml',
        };
        const mime = mimeMap[ext] ?? 'application/octet-stream';
        entries.push([path, `data:${mime};base64,${buf.toString('base64')}`]);
      }
    }
  }
  walk(publicDir);

  const blobMapJson = JSON.stringify(Object.fromEntries(entries));

  // 直接内联脚本（无外部文件依赖）
  const interceptor = `<script>(function(){var B=${blobMapJson};function r(u){if(!u)return null;var p=u.replace(/.*\\//,'').split('?')[0];if(B[p])return B[p];for(var k of Object.keys(B)){if(u.endsWith('/'+k)||u.endsWith(k))return B[k];}if(!B[p]&&p===''){var d=u.replace(/\\/$/,'');for(var k of Object.keys(B)){if(d.endsWith('/'+k)||d===k)return B[k];}}return null;}var f=window.fetch;window.fetch=function(i,t){var u=typeof i==='string'?i:(i&&i.url)||'';var b=r(u);if(b){var m=b.indexOf(';base64,'),mime=b.slice(5,m);return Promise.resolve(new Response(atob(b.slice(m+8)),{headers:{'Content-Type':mime}}));}return f.call(this,i,t);};var s=HTMLImageElement.prototype.setAttribute;HTMLImageElement.prototype.setAttribute=function(k,v){if(k==='src'){var b=r(v);if(b){this.src=b;return;}}return s.call(this,k,v);};})();</script>`;

  return {
    name: 'inline-public-assets',
    apply: 'build',

    transformIndexHtml(html) {
      return html.replace('</head>', interceptor + '\n</head>');
    },

    generateBundle(_opts, bundle) {
      for (const name of Object.keys(bundle)) {
        const meta: string | undefined = (bundle[name] as any).file;
        if (meta && (meta.startsWith('pyodide/') || meta.startsWith('sqljs/') || meta === 'logo.png')) {
          delete bundle[name];
        }
      }
    },

    closeBundle() {
      let total = 0;
      for (const [, data] of entries) total += data.length * 0.75;
      console.log(`  [inline] ${entries.length} public files, ${(total/1024/1024).toFixed(2)} MB`);
    }
  };
}
