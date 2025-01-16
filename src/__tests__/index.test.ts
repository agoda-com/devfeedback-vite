import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import viteTimingPlugin from '../index';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import type { ViteDevServer } from 'vite';

// Mock the WebSocket connection
class MockWebSocket extends EventEmitter {
  send(data: string) {
    this.emit('message', data);
  }
}

describe('viteTimingPlugin', () => {
  let plugin: ReturnType<typeof viteTimingPlugin>;
  let mockServer: Partial<ViteDevServer>;
  let mockWatcher: EventEmitter;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    // Reset performance.now mock before each test
    vi.spyOn(performance, 'now').mockImplementation(() => 1000);
    
    // Create mock server and watcher
    mockWatcher = new EventEmitter();
    mockWs = new MockWebSocket();
    mockServer = {
      watcher: mockWatcher,
      ws: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        on: (event: string, handler: (socket: any) => void) => {
          handler(mockWs);
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
    
    // Reset the spy count
    nowSpy.mockClear();
    
    // Simulate HMR update
    mockWs.emit('message', JSON.stringify({
      type: 'update',
      updates: [{ path: '/path/to/file.js' }]
    }));

    // Should be called again for HMR timing
    expect(nowSpy).toHaveBeenCalledTimes(1);
  });


  it('should inject client script in HTML', () => {
    const html = '<html><head></head><body></body></html>';
    const result = plugin.transformIndexHtml?.(html);
    expect(result).toContain('window.__VITE_TIMING__');
  });

  it('should handle HMR updates with module count', () => {
    plugin.configureServer?.(mockServer as ViteDevServer);
    
    // Simulate file change
    mockWatcher.emit('change', '/path/to/file.js');
    
    // Simulate HMR update
    const result = plugin.handleHotUpdate?.({
      file: '/path/to/file.js',
      modules: [{ id: 1 }, { id: 2 }],
      read: async () => '',
      timestamp: Date.now()
    });
    
    expect(result).toBeNull(); // Should not interfere with HMR
  });

  it('should handle invalid WebSocket messages gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error');
    plugin.configureServer?.(mockServer as ViteDevServer);
    
    // Send invalid message
    mockWs.emit('message', 'invalid json');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      '[vite-timing] Error processing WS message:',
      expect.any(Error)
    );
  });
});