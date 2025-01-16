import { vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import { EventEmitter } from 'events';

export class MockWebSocket extends EventEmitter {
  send(data: string) {
    this.emit('message', data);
  }
}

export function createMockServer(): Partial<ViteDevServer> {
  const mockWatcher = new EventEmitter();
  const mockWs = new MockWebSocket();
  
  return {
    watcher: mockWatcher,
    ws: {
      on: (event: string, handler: (socket: unknown) => void) => {
        handler(mockWs);
      }
    },
    middlewares: {
      use: vi.fn()
    }
  };
}

export function mockPerformanceNow() {
  let time = 1000;
  return vi.spyOn(performance, 'now').mockImplementation(() => {
    time += 100;
    return time;
  });
}

export function createTestMetadata() {
  return {
    userName: 'test-user',
    cpuCount: 4,
    hostname: 'test-host',
    platform: 'test-platform',
    os: 'test-os',
    projectName: 'test-project',
    repository: 'test-repo',
    repositoryName: 'test-repo-name',
    totalMemory: 8000000000,
    cpuModels: ['Test CPU'],
    cpuSpeed: [2400],
    nodeVersion: 'v16.0.0',
    v8Version: '8.0.0',
    commitSha: 'test-sha'
  };
}