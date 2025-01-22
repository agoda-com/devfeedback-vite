import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import viteTimingPlugin from '../index';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import type { ViteDevServer } from 'vite';

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

 beforeEach(() => {
   // Reset performance.now mock before each test
   vi.spyOn(performance, 'now').mockImplementation(() => 1000);
   
   // Create mock server and watcher
   mockWatcher = new EventEmitter();
   mockServer = {
     watcher: mockWatcher,
     ws: {
       on: (event: string, callback: (socket: any) => void) => {
         callback({
           on: vi.fn()
         });
       }
     },
     middlewares: {
       use: vi.fn()
     }
   };

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
   
   // Mock performance.now to return increasing values
   let timeCounter = 1000;
   const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
     timeCounter += 100;
     return timeCounter;
   });
   
   // Simulate file change
   mockWatcher.emit('change', '/path/to/file.js');
   expect(nowSpy).toHaveBeenCalledTimes(1);
   
   // Get the internal state using our test helper
   const changeMap = plugin._TEST_getChangeMap?.();
   expect(changeMap).toBeDefined();
   const changes = Array.from(changeMap!.values());
   expect(changes).toHaveLength(1);
   expect(changes[0].changeDetectedAt).toBe(1100);
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
  
  const testFile = 'src/test.js';  // Use forward slashes consistently
  
  // Create a file change entry
  mockWatcher.emit('change', testFile);
  
  // Mock request/response
  const req = new MockRequest('/__vite_timing_hmr_complete');
  const res = new MockResponse();
  
  // Get middleware handler
  const middlewareHandler = (mockServer.middlewares?.use as jest.Mock).mock.calls[0][0];
  
  // Call middleware with request
  middlewareHandler(req, res, vi.fn());
  
  // Send timing data with same path format
  req.emit('data', JSON.stringify({
    file: testFile,
    clientTimestamp: 2000
  }));
  req.emit('end');
  
  // Wait for async processing
  await new Promise(resolve => setTimeout(resolve, 10));
  
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