import { vi } from 'vitest';
import type { ViteDevServer, Connect } from 'vite';
import { EventEmitter } from 'events';

class MockSocketClient extends EventEmitter {
  send: jest.Mock;
  messageHandlers: ((data: string) => void)[];

  constructor() {
    super();
    this.send = vi.fn();
    this.messageHandlers = [];
  }

  on(event: string, handler: (data: string) => void): this {
    if (event === 'message') {
      this.messageHandlers.push(handler);
    }
    super.on(event, handler);
    return this;
  }

  simulateMessage(data: string) {
    this.emit('message', data); // Use emit instead of directly calling handlers
  }
}

export function createMockServer(watcher = new EventEmitter()): Partial<ViteDevServer> & { simulateHMRUpdate: (data: any) => void } {
  const socket = new MockSocketClient();
  
  const wsServer = {
    on: (event: string, callback: (socket: MockSocketClient) => void) => {
      if (event === 'connection') {
        // Call the callback immediately with our socket
        callback(socket);
      }
      return wsServer;
    }
  };
  
  return {
    watcher,
    ws: wsServer,
    middlewares: {
      use: vi.fn((handler: Connect.HandleFunction) => {
        (createMockServer as any).lastHandler = handler;
      })
    },
    moduleGraph: {
      getModuleById: vi.fn(),
      invalidateModule: vi.fn()
    },
    config: {
      mode: 'development',
      root: process.cwd()
    },
    _mockSocket: socket,
    simulateHMRUpdate(data: any) {
      socket.simulateMessage(JSON.stringify(data));
    }
  };
}

export class MockRequest extends EventEmitter {
  url: string;
  method: string;

  constructor(url: string, method = 'POST') {
    super();
    this.url = url;
    this.method = method;
  }
}

export class MockResponse {
  writeHead: jest.Mock;
  end: jest.Mock;

  constructor() {
    this.writeHead = vi.fn();
    this.end = vi.fn();
  }
}