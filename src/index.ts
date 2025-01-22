import path from 'path';
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { getCommonMetadata } from './utils/metadata';
import { sendMetrics } from './utils/metrics';

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

 const normalizePath = (filePath: string): string => {
   return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
 };

 const clientScript = {
   virtualHmrModule: `
     import { createHotContext as __vite__createHotContext } from '/@vite/client';

     const hot = __vite__createHotContext('/@vite-timing/hmr');

     if (hot) {
       hot.on('vite:afterUpdate', (data) => {
         if (Array.isArray(data.updates)) {
           data.updates.forEach(update => {
             if (update.path) {
               const endTime = Date.now();
               fetch('/__vite_timing_hmr_complete', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json',
                    // Add this header to suppress the console logs
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Silent': 'true' },
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
       const timestamp = Date.now();
       const relativePath = normalizePath(path.relative(process.cwd(), file));
       
       changeMap.set(relativePath, {
         file: relativePath,
         changeDetectedAt: timestamp
       });
     });

     server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
       if (req.url === '/__vite_timing_hmr_complete') {
         let body = '';
         req.on('data', chunk => { body += chunk.toString(); });
         // eslint-disable-next-line @typescript-eslint/no-misused-promises
         req.on('end', async () => {
           try {
             const { file, clientTimestamp } = JSON.parse(body) as ClientMessage;
             const normalizedFile = normalizePath(file);
             
             const entry = changeMap.get(normalizedFile);

             if (entry) {
               const totalTime = clientTimestamp - entry.changeDetectedAt;
               
               // Prepare metrics data
               const metricsData = {
                 ...getCommonMetadata(totalTime),
                 type: 'hmr' as const,
                 file: entry.file,
                 totalTime
               };

               await sendMetrics(metricsData);
               
               // Clear the entry
               changeMap.delete(normalizedFile);
               
               res.writeHead(200, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ success: true }));
             } else {
               
               res.writeHead(200, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ 
                 success: false, 
                 reason: 'No timing entry found for file',
                 file: normalizedFile,
                 availableFiles: Array.from(changeMap.keys())
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