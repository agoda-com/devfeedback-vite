import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import viteTimingPlugin from '../index';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import type { ViteDevServer } from 'vite';
import { createMockServer, MockRequest, MockResponse } from './utils/test-utils';
import path from 'path';

describe('viteTimingPlugin', () => {
  let plugin: ReturnType<typeof viteTimingPlugin>;
  let mockServer: Partial<ViteDevServer>;
  let mockWatcher: EventEmitter;

  beforeEach(() => {
    // Reset performance.now mock before each test
    vi.spyOn(performance, 'now').mockImplementation(() => 1000);
    
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

  it('should inject client scripts in HTML in development mode', () => {
    const html = '<html><head></head><body></body></html>';
    const result = plugin.transformIndexHtml?.(html, { mode: 'development' });
    
    // Should contain both scripts
    expect(result).toContain('window.__VITE_TIMING__');
    expect(result).toContain('import.meta.hot');
    
    // Scripts should be in correct order (timing function in head, HMR module at end)
    expect(result.indexOf('window.__VITE_TIMING__'))
      .toBeLessThan(result.indexOf('import.meta.hot'));
  });

  it('should not inject scripts in production mode', () => {
    const html = '<html><head></head><body></body></html>';
    const result = plugin.transformIndexHtml?.(html, { mode: 'production' });
    
    expect(result).not.toContain('window.__VITE_TIMING__');
    expect(result).not.toContain('import.meta.hot');
    expect(result).toBe(html);
  });

  it('should handle HMR updates with module count', () => {
    plugin.configureServer?.(mockServer as ViteDevServer);
    
    // Simulate file change first to create an entry in the change map
    mockWatcher.emit('change', '/path/to/file.js');
    
    // Create HMR context
    const context = {
      file: '/path/to/file.js',
      modules: [{ id: 1 }, { id: 2 }],
      read: async () => '',
      timestamp: Date.now()
    };
  
    // Call handleHotUpdate
    const result = plugin.handleHotUpdate?.(context);
    expect(result).toBeUndefined();
  
    // Get the internal state using our test helper
    const changeMap = plugin._TEST_getChangeMap?.();
    expect(changeMap).toBeDefined();
    const changes = Array.from(changeMap!.values());
    expect(changes).toHaveLength(1);
    expect(changes[0].moduleCount).toBe(2);
  });
  
  it('should handle middleware requests for timing data', async () => {
    plugin.configureServer?.(mockServer as ViteDevServer);
    
    // 1. Simulate file change with normalized path
    const testFile = path.normalize('/path/to/file.js');
    mockWatcher.emit('change', testFile);
    
    let changeMap = plugin._TEST_getChangeMap?.();
    const initialEntry = Array.from(changeMap!.values())[0];
    expect(initialEntry.status).toBe('detected');
    
    // 2. Simulate HMR update
    (mockServer as any).simulateHMRUpdate({
      type: 'update',
      updates: [{ 
        path: initialEntry.file,
        timestamp: Date.now()
      }]
    });

    // Wait for HMR update to be processed
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify state transition
    changeMap = plugin._TEST_getChangeMap?.();
    const afterHMREntry = Array.from(changeMap!.values())[0];
    expect(afterHMREntry.status).toBe('hmr-started');

    // 3. Create promise to wait for middleware completion
    const middlewareCompletion = new Promise<void>((resolve) => {
      const req = new MockRequest('/__vite_timing_hmr_complete');
      const res = new MockResponse();
      const next = vi.fn();

      // Extend MockResponse to resolve promise when end is called
      res.end = vi.fn(() => {
        resolve();
      });

      // Get and call the middleware handler
      const middlewareHandler = (createMockServer as any).lastHandler;
      middlewareHandler(req, res, next);

      // Send request data
      req.emit('data', JSON.stringify({
        file: initialEntry.file,
        clientTimestamp: 2000
      }));
      req.emit('end');
    });

    // Wait for middleware to complete
    await middlewareCompletion;
    
    // Get final state
    changeMap = plugin._TEST_getChangeMap?.();
    const finalEntries = Array.from(changeMap!.values());
    
    // Log final state for debugging
    console.log('Final entries:', finalEntries);
    
    expect(finalEntries).toHaveLength(0);
  });
});