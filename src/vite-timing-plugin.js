// vite-timing-plugin.js
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v1 as uuidv1 } from 'uuid';
import { spawnSync } from 'child_process';

const UNKNOWN_VALUE = 'unknown';

const getEndpoint = () => {
  return process.env.VITE_ENDPOINT || "http://compilation-metrics/vite";
};

const runGitCommand = (args) => {
  try {
    const result = spawnSync('git', args);
    return result.stdout.toString().trim();
  } catch (error) {
    return undefined;
  }
};

// Cache for static metadata
let cachedMetadata = null;

const getStaticMetadata = () => {
  if (cachedMetadata) {
    return cachedMetadata;
  }

  const repoUrl = runGitCommand(['config', '--get', 'remote.origin.url']);
  let repoName = repoUrl
    ? repoUrl.substring(repoUrl.lastIndexOf('/') + 1)
    : UNKNOWN_VALUE;
  repoName = repoName.endsWith('.git')
    ? repoName.substring(0, repoName.lastIndexOf('.'))
    : repoName;

  const gitUserName = process.env['GITLAB_USER_LOGIN'] ?? process.env['GITHUB_ACTOR'];
  const osUsername = os.userInfo().username;

  cachedMetadata = {
    userName: (gitUserName ? gitUserName : osUsername) ?? UNKNOWN_VALUE,
    cpuCount: os.cpus().length,
    hostname: os.hostname(),
    platform: os.type(),
    os: os.release(),
    projectName: repoName,
    repository: repoUrl ?? UNKNOWN_VALUE,
    repositoryName: repoName,
    totalMemory: os.totalmem(),
    cpuModels: os.cpus().map((cpu) => cpu.model),
    cpuSpeed: os.cpus().map((cpu) => cpu.speed),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    commitSha: runGitCommand(['rev-parse', 'HEAD']) ?? UNKNOWN_VALUE,
  };

  return cachedMetadata;
};

const getCommonMetadata = (timeTaken, customIdentifier = process.env.npm_lifecycle_event ?? UNKNOWN_VALUE) => {
  const staticMetadata = getStaticMetadata();
  
  // Add dynamic metadata
  return {
    ...staticMetadata,
    id: uuidv1(),
    userName: (gitUserName ? gitUserName : osUsername) ?? UNKNOWN_VALUE,
    cpuCount: os.cpus().length,
    hostname: os.hostname(),
    platform: os.type(),
    os: os.release(),
    timeTaken: timeTaken,
    branch: runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']) ?? UNKNOWN_VALUE,
    projectName: repoName,
    repository: repoUrl ?? UNKNOWN_VALUE,
    repositoryName: repoName,
    timestamp: Date.now(),
    builtAt: new Date().toISOString(),
    totalMemory: os.totalmem(),
    cpuModels: os.cpus().map((cpu) => cpu.model),
    cpuSpeed: os.cpus().map((cpu) => cpu.speed),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    commitSha: runGitCommand(['rev-parse', 'HEAD']) ?? UNKNOWN_VALUE,
    customIdentifier: customIdentifier,
  };
};

async function sendMetrics(metricsData) {
  const endpoint = getEndpoint();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metricsData),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('[vite-timing] Error sending metrics:', error);
  }
}

export default function viteTimingPlugin() {
  const changeMap = new Map();
  
  const getChangeKey = (file, timestamp) => `${file}:${timestamp}`;
  
  return {
    name: 'vite-timing-plugin',
    
    configureServer(server) {
      server.watcher.on('change', (file) => {
        const timestamp = performance.now();
        const key = getChangeKey(file, timestamp);
        
        changeMap.set(key, {
          file: path.relative(process.cwd(), file),
          changeDetectedAt: timestamp,
          status: 'detected'
        });
      });

      server.ws.on('connection', (socket) => {
        socket.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            if (message.type === 'update' || message.type === 'full-reload') {
              const timestamp = performance.now();
              const affectedFiles = Array.isArray(message.updates) 
                ? message.updates.map(u => u.path || u.file)
                : [];
                
              affectedFiles.forEach(file => {
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

      server.middlewares.use((req, res, next) => {
        if (req.url === '/__vite_timing_hmr_complete') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const { file, clientTimestamp } = JSON.parse(body);
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
                    type: 'hmr',
                    file: entry.file,
                    serverProcessingTime,
                    totalTime,
                    moduleCount: entry.moduleCount,
                    timings: {
                      changeDetected: entry.changeDetectedAt,
                      hmrStarted: entry.hmrStartedAt,
                      hmrCompleted: entry.hmrCompletedAt,
                      clientCompleted: entry.clientCompletedAt
                    }
                  };

                  // Send metrics to endpoint
                  await sendMetrics(metricsData);
                  
                  // Log locally
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
        } else {
          next();
        }
      });
    },
    
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `<script>${clientScript}</script></head>`
      );
    },
    
    handleHotUpdate({ file, modules }) {
      const timestamp = performance.now();
      for (const [key, entry] of changeMap.entries()) {
        if (entry.file === path.relative(process.cwd(), file)) {
          entry.moduleCount = modules.length;
          break;
        }
      }
      return null;
    }
  };
}