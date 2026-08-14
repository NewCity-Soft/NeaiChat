import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

function mediaProxyPlugin() {

  return {
    name: 'media-proxy-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/proxy-media', async (req: any, res: any) => {
        try {
          const host = req.headers.host || 'localhost';
          const urlParams = new URL(req.url || '', `http://${host}`);
          const targetUrl = urlParams.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Missing url parameter');
            return;
          }
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (!response.ok) {
            res.statusCode = response.status;
            res.end(`Failed to fetch media: ${response.statusText}`);
            return;
          }
          const contentType = response.headers.get('content-type') || 'application/octet-stream';
          const buffer = await response.arrayBuffer();

          res.setHeader('Content-Type', contentType);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.end(Buffer.from(buffer));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(`Server error proxying media: ${err.message}`);
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      mediaProxyPlugin(),
      viteSingleFile(),
      nodePolyfills({
        include: ['path', 'buffer', 'stream', 'util', 'crypto'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      cssCodeSplit: false,
    }
  };
});
