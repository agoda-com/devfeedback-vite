import { performance } from 'perf_hooks';
import path from 'path';
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

interface TimingEntry {
 file: string;
 changeDetectedAt: number;
}

interface ClientMessage {
 file: string;
 clientTimestamp: number;
}

export interface ViteTimingPlugin extends Plugin {
 _TEST_getChangeMap?: () => Map<string, TimingEntry>;
}

export default function viteTimingPlugin(): ViteTimingPlugin {
 const changeMap = new Map<string, TimingEntry>();

    // Add utility function to normalize paths
    const normalizePath = (filePath: string): string => {
      return filePath.replace(/\\/g, '/');
    };
  
 const clientScript = {
   virtualHmrModule: `
     import { createHotContext as __vite__createHotContext } from '/@vite/client';

     const hot = __vite__createHotContext('/@vite-timing/hmr');

     if (hot) {
       hot.on('vite:afterUpdate', (data) => {
         console.log('[vite-timing] afterUpdate:', data);
         if (Array.isArray(data.updates)) {
           data.updates.forEach(update => {
             if (update.path) {
               const endTime = performance.now();
               fetch('/__vite_timing_hmr_complete', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ 
                   file: update.path,
                   clientTimestamp: endTime 
                 })
               }).catch(err => console.error('[vite-timing] Failed to send metrics:', err));
             }
           });
         }
       });
     }
   `
 };

 const plugin: ViteTimingPlugin = {
   name: 'vite-timing-plugin',
   
   configureServer(server: ViteDevServer) {
     server.watcher.on('change', (file: string) => {
       const timestamp = performance.now();
       const relativePath = normalizePath(path.relative(process.cwd(), file));
       
       // Store the file and start time
       changeMap.set(relativePath, {
         file: relativePath,
         changeDetectedAt: timestamp
       });

       console.log('[vite-timing] File change detected:', relativePath);
     });

     server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
       if (req.url === '/__vite_timing_hmr_complete') {
         let body = '';
         req.on('data', chunk => { body += chunk.toString(); });
         // eslint-disable-next-line @typescript-eslint/no-misused-promises
         req.on('end', async () => {
           try {
             const { file, clientTimestamp } = JSON.parse(body) as ClientMessage;
             console.log('[vite-timing] Received completion for file:', file);
             
             const entry = changeMap.get(file.replace(/^\/+/, ''));

             if (entry) {
               const totalTime = clientTimestamp - entry.changeDetectedAt;
               
               console.log('[vite-timing] Update cycle completed:');
               console.log(`File: ${entry.file}`);
               console.log(`Total time: ${totalTime.toFixed(2)}ms\n`);
               
               // Clear the entry
               changeMap.delete(file);
               
               res.writeHead(200, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ success: true }));
             } else {
               console.log('[vite-timing] No timing entry found for:', file);
               console.log('Current entries:', Array.from(changeMap.keys()));
               
               res.writeHead(200, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ 
                 success: false, 
                 reason: 'No timing entry found for file',
                 file
               }));
             }
           } catch (err) {
             console.error('[vite-timing] Error processing timing data:', err);
             res.writeHead(200, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ 
               success: false, 
               error: err instanceof Error ? err.message : 'Unknown error' 
             }));
           }
         });
       } else {
         next();
       }
     });
   },

   resolveId(id: string) {
     if (id === '/@vite-timing/hmr') {
       return id;
     }
   },

   load(id: string) {
     if (id === '/@vite-timing/hmr') {
       return clientScript.virtualHmrModule;
     }
   },
   
   transformIndexHtml(html: string, ctx?: { [key: string]: any }) {
     if (!ctx || ctx.command !== 'build') {
       // Import our virtual HMR module
       html = html.replace(
         '</head>',
         `<script type="module" src="/@vite-timing/hmr"></script></head>`
       );
     }
     return html;
   }
 };

 if (process.env.NODE_ENV === 'test') {
   plugin._TEST_getChangeMap = () => changeMap;
 }

 return plugin;
}