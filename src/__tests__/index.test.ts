import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import viteTimingPlugin from '../index';
import path from 'path';
import { EventEmitter } from 'events';
import type { ViteDevServer } from 'vite';
import { createMockServer  } from './utils/test-utils';

class MockRequest extends EventEmitter {
 url: string;
 method: string;

 constructor(url: string, method = 'POST') {
   super();
   this.url = url;
   this.method = method;
 }
}

class MockResponse {
 writeHead: jest.Mock;
 end: jest.Mock;

 constructor() {
   this.writeHead = vi.fn();
   this.end = vi.fn();
 }
}

describe('viteTimingPlugin', () => {
 let plugin: ReturnType<typeof viteTimingPlugin>;
 let mockServer: Partial<ViteDevServer>;
 let mockWatcher: EventEmitter;
 let timeCounter: number;

 beforeEach(() => {
  timeCounter = 1000;
   // Reset performance.now mock before each test
   vi.spyOn(Date, 'now').mockImplementation(() => timeCounter);
   
   // Create mock server and watcher
   mockWatcher = new EventEmitter();
   mockServer = createMockServer(mockWatcher);
   plugin = viteTimingPlugin();
 });

 afterEach(() => {
   vi.restoreAllMocks();
 });

 it('should register file watcher on server configure', () => {
   const watcherSpy = vi.spyOn(mockWatcher, 'on');
   plugin.configureServer?.(mockServer as ViteDevServer);
   expect(watcherSpy).toHaveBeenCalledWith('change', expect.any(Function));
 });
 
 it('should handle file changes and track timing', async () => {
  plugin.configureServer?.(mockServer as ViteDevServer);
  
  // Set initial time
  timeCounter = 1000;
  const startTime = timeCounter;
  
  // Mock Date.now to return increasing values
  vi.spyOn(Date, 'now').mockImplementation(() => timeCounter);

  // Mock process.cwd() to return a consistent path
  vi.spyOn(process, 'cwd').mockReturnValue('/test-root');
  
  const testFile = path.join('/test-root', 'path/to/file.js');
  
  // Simulate file change
  mockWatcher.emit('change', testFile);
  
  // Get the internal state using our test helper
  const changeMap = plugin._TEST_getChangeMap?.();
  expect(changeMap).toBeDefined();
  const changes = Array.from(changeMap!.values());
  
  // Verify the change was recorded
  expect(changes).toHaveLength(1);
  expect(changes[0].changeDetectedAt).toBe(timeCounter);
  const expectedPath = 'path/to/file.js';
  const normalizedPath = changes[0].file.replace(/\\/g, '/');
  expect(normalizedPath).toBe(expectedPath);
});

 it('should inject HMR module in development mode', () => {
   const html = '<html><head></head><body></body></html>';
   const result = plugin.transformIndexHtml?.(html, { command: 'serve' });
   
   // Should contain our virtual HMR module
   expect(result).toContain('/@vite-timing/hmr');
 });

 it('should not inject scripts in production mode', () => {
   const html = '<html><head></head><body></body></html>';
   const result = plugin.transformIndexHtml?.(html, { command: 'build' });
   
   expect(result).toBe(html);  // Should return unmodified HTML
   expect(result).not.toContain('/@vite-timing/hmr');
 });

 it('should provide virtual HMR module', () => {
   const id = '/@vite-timing/hmr';
   const resolved = plugin.resolveId?.(id);
   expect(resolved).toBe(id);

   const content = plugin.load?.(id);
   expect(content).toContain('createHotContext');
   expect(content).toContain('vite:afterUpdate');
 });
 
 it('should handle middleware requests for timing data', async () => {
  plugin.configureServer?.(mockServer as ViteDevServer);
  
  const testFile = 'src/test.js';

  // Set initial time
  timeCounter = 1000;
  const startTime = timeCounter;
  
  // Create a file change entry
  mockWatcher.emit('change', testFile);
  
  // Advance time for client timestamp
  timeCounter = 2000;
  
  // Create mocks
  const req = new MockRequest('/__vite_timing_hmr_complete');
  const res = new MockResponse();
  const next = vi.fn();
  
  // Create a promise that resolves when the response is sent
  const responsePromise = new Promise<void>((resolve) => {
    // Override end to resolve our promise
    const originalEnd = res.end;
    res.end = vi.fn((...args) => {
      originalEnd.apply(res, args);
      resolve();
    });
  });
  
  // Get middleware handler
  const middlewareHandler = (mockServer.middlewares?.use as jest.Mock).mock.calls[0][0];
  
  // Call middleware with request
  middlewareHandler(req, res, next);
  
  // Send timing data
  req.emit('data', JSON.stringify({
    file: testFile,
    clientTimestamp: timeCounter
  }));
  req.emit('end');
  
  // Wait for response to be sent
  await responsePromise;
  
  // Verify response
  expect(res.writeHead).toHaveBeenCalledWith(200, {
    'Content-Type': 'application/json'
  });
  
  const responseData = JSON.parse(res.end.mock.calls[0][0]);
  expect(responseData.success).toBe(true);
  
  // Verify entry was cleaned up
  const changeMap = plugin._TEST_getChangeMap?.();
  expect(Array.from(changeMap!.values())).toHaveLength(0);
});
});