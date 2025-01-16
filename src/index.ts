import { performance } from 'perf_hooks';
import path from 'path';
import type { Plugin, ViteDevServer } from 'vite';
import type { TimingEntry, HMRUpdate, ClientMessage } from './types';
import { getCommonMetadata } from './utils/metadata';
import { sendMetrics } from './utils/metrics';
import type { IncomingMessage, ServerResponse } from 'http';

export default function viteTimingPlugin(): Plugin {
  const changeMap = new Map<string, TimingEntry>();
  
  const getChangeKey = (file: string, timestamp: number): string => 
    `${file}:${timestamp}`;
  
  const clientScript = `
    window.__VITE_TIMING__ = {
      markHMREnd: function(file) {
        const endTime = performance.now();
        fetch('/__vite_timing_hmr_complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file, clientTimestamp: endTime })
        });
      }
    };
  `;

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
  
  return {
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
                for (const [key, entry] of changeMap.entries()) {
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
    
    transformIndexHtml(html: string) {
      return html.replace(
        '</head>',
        `<script>${clientScript}</script></head>`
      );
    },
    
    handleHotUpdate({ file, modules }) {
      const relativePath = path.relative(process.cwd(), file);
      for (const [key, entry] of changeMap.entries()) {
        if (entry.file === relativePath) {
          entry.moduleCount = modules.length;
          break;
        }
      }
      return null;
    }
  };
};