
import { performance } from 'perf_hooks';
import path from 'path';
import type { Plugin, ViteDevServer } from 'vite';
import type { TimingEntry, HMRUpdate, ClientMessage } from './types';
import { getCommonMetadata } from './utils/metadata';
import { sendMetrics } from './utils/metrics';
import type { IncomingMessage, ServerResponse } from 'http';

export interface ViteTimingPlugin extends Plugin {
  _TEST_getChangeMap?: () => Map<string, TimingEntry>;
}

export default function viteTimingPlugin(): ViteTimingPlugin {
  const changeMap = new Map<string, TimingEntry>();
  
  const getChangeKey = (file: string, timestamp: number): string => 
    `${file}:${timestamp}`;
  
  const clientScript = {
    // Main timing function
    timingFunction: `
      window.__VITE_TIMING__ = {
        pendingUpdates: new Set(),
        markHMRStart: function(file) {
          this.pendingUpdates.add(file);
        },
        markHMREnd: function(file) {
          if (this.pendingUpdates.has(file)) {
            const endTime = performance.now();
            fetch('/__vite_timing_hmr_complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file, clientTimestamp: endTime })
            });
            this.pendingUpdates.delete(file);
          }
        }
      };
    `,
    // HMR module script
    hmrModule: `
      if (import.meta.hot) {
        // Track update start
        import.meta.hot.on('vite:beforeUpdate', (data) => {
          if (window.__VITE_TIMING__ && Array.isArray(data.updates)) {
            data.updates.forEach(update => {
              if (update.path) {
                window.__VITE_TIMING__.markHMRStart(update.path);
              }
            });
          }
        });

        // Track update completion
        import.meta.hot.on('vite:afterUpdate', (data) => {
          if (window.__VITE_TIMING__ && Array.isArray(data.updates)) {
            data.updates.forEach(update => {
              if (update.path) {
                window.__VITE_TIMING__.markHMREnd(update.path);
              }
            });
          }
        });
      }
    `
  };  

  const handleHMRComplete = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { file, clientTimestamp } = JSON.parse(body) as ClientMessage;
        for (const [key, entry] of changeMap.entries()) {
          if (entry.file === file && entry.status === 'hmr-started') {
            entry.status = 'complete';
            entry.hmrCompletedAt = performance.now();
            entry.clientCompletedAt = clientTimestamp;
            
            const serverProcessingTime = entry.hmrCompletedAt - entry.changeDetectedAt;
            const totalTime = entry.clientCompletedAt - entry.changeDetectedAt;
            
            // Prepare metrics data
            const metricsData = {
              ...getCommonMetadata(totalTime),
              type: 'hmr' as const,
              file: entry.file,
              serverProcessingTime,
              totalTime,
              moduleCount: entry.moduleCount ?? 0,
              timings: {
                changeDetected: entry.changeDetectedAt,
                hmrStarted: entry.hmrStartedAt!,
                hmrCompleted: entry.hmrCompletedAt,
                clientCompleted: entry.clientCompletedAt
              }
            };

            await sendMetrics(metricsData);
            
            console.log('\n[vite-timing] Update cycle completed:');
            console.log(`File: ${entry.file}`);
            console.log(`Server processing time: ${serverProcessingTime.toFixed(2)}ms`);
            console.log(`Total time (including client): ${totalTime.toFixed(2)}ms\n`);
            
            changeMap.delete(key);
            break;
          }
        }
      } catch (err) {
        console.error('[vite-timing] Error processing timing data:', err);
      }
      res.writeHead(204);
      res.end();
    });
  };
  
  const plugin: ViteTimingPlugin = {
    name: 'vite-timing-plugin',
    
    configureServer(server: ViteDevServer) {
      server.watcher.on('change', (file: string) => {
        const timestamp = performance.now();
        const key = getChangeKey(file, timestamp);
        
        changeMap.set(key, {
          file: path.relative(process.cwd(), file),
          changeDetectedAt: timestamp,
          status: 'detected'
        });
      });

      server.ws.on('connection', (socket) => {
        socket.on('message', (data: string) => {
          try {
            const message = JSON.parse(data) as HMRUpdate;
            if (message.type === 'update' || message.type === 'full-reload') {
              const timestamp = performance.now();
              const affectedFiles = Array.isArray(message.updates) 
                ? message.updates.map(u => u.path || u.file)
                : [];
                
              affectedFiles.forEach(file => {
                if (!file) return;
                for (const [, entry] of changeMap.entries()) {
                  if (entry.file === file && entry.status === 'detected') {
                    entry.hmrStartedAt = timestamp;
                    entry.status = 'hmr-started';
                    break;
                  }
                }
              });
            }
          } catch (err) {
            console.error('[vite-timing] Error processing WS message:', err);
          }
        });
      });

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        if (req.url === '/__vite_timing_hmr_complete') {
          handleHMRComplete(req, res);
        } else {
          next();
        }
      });
    },
    
    transformIndexHtml(html: string, { mode }) {
      // Only inject scripts in development mode
      if (mode === 'development') {
        // Insert the main timing function first
        html = html.replace(
          '</head>',
          `<script>${clientScript.timingFunction}</script></head>`
        );

        // Insert the HMR module script after Vite's client script
        html = html.replace(
          '</body>',
          `<script type="module">${clientScript.hmrModule}</script></body>`
        );
      }
      return html;
    },
    
    handleHotUpdate({ file, modules }) {
      const relativePath = path.relative(process.cwd(), file);
      for (const [, entry] of changeMap.entries()) {
        if (entry.file === relativePath) {
          entry.moduleCount = modules.length;
          break;
        }
      }
    }
  };

  if (process.env.NODE_ENV === 'test') {
    plugin._TEST_getChangeMap = () => changeMap;
  }

  return plugin;
}