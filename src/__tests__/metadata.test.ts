import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getStaticMetadata, getCommonMetadata, runGitCommand } from '../utils/metadata';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import os from 'os';
import { spawnSync } from 'child_process';

vi.mock('child_process', () => ({
  spawnSync: vi.fn()
}));

vi.mock('os', async () => {
  return {
    default: {
      cpus: vi.fn(() => [
        { model: 'CPU Model', speed: 2400 },
        { model: 'CPU Model', speed: 2400 }
      ]),
      hostname: vi.fn(() => 'test-host'),
      type: vi.fn(() => 'Darwin'),
      release: vi.fn(() => '20.0.0'),
      totalmem: vi.fn(() => 16000000000),
      userInfo: vi.fn(() => ({ username: 'testuser' }))
    }
  };
});

describe('Metadata Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset cached metadata
    vi.resetModules();
  });

  describe('runGitCommand', () => {
    it('should execute git command and return output', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('test-output'),
        stderr: Buffer.from(''),
        status: 0,
        signal: null,
        pid: 123,
        output: []
      });

      const result = runGitCommand(['test', 'command']);
      expect(result).toBe('test-output');
      expect(spawnSync).toHaveBeenCalledWith('git', ['test', 'command']);
    });

    it('should handle git command errors', () => {
      vi.mocked(spawnSync).mockImplementation(() => {
        throw new Error('Git error');
      });

      const result = runGitCommand(['test']);
      expect(result).toBeUndefined();
    });
  });

  describe('getStaticMetadata', () => {
    it('should return cached metadata on subsequent calls', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('test-repo'),
        stderr: Buffer.from(''),
        status: 0,
        signal: null,
        pid: 123,
        output: []
      });

      const firstCall = getStaticMetadata();
      const secondCall = getStaticMetadata();

      expect(firstCall).toBe(secondCall);
      expect(spawnSync).toHaveBeenCalledTimes(2); // Only called for first metadata collection
    });

    it('should collect correct system information', () => {
      const metadata = getStaticMetadata();

      expect(metadata).toMatchObject({
        cpuCount: 2,
        hostname: 'test-host',
        platform: 'Darwin',
        os: '20.0.0',
        cpuModels: ['CPU Model', 'CPU Model'],
        cpuSpeed: [2400, 2400]
      });
    });
  });

  describe('getCommonMetadata', () => {
    it('should include both static and dynamic metadata', () => {
      const timeTaken = 1000;
      const metadata = getCommonMetadata(timeTaken, 'test-build');

      expect(metadata).toMatchObject({
        timeTaken: 1000,
        customIdentifier: 'test-build'
      });

      expect(metadata.id).toBeDefined();
      expect(metadata.timestamp).toBeDefined();
      expect(metadata.builtAt).toBeDefined();
    });

    it('should use default identifier when not provided', () => {
      process.env.npm_lifecycle_event = 'dev';
      const metadata = getCommonMetadata(1000);

      expect(metadata.customIdentifier).toBe('dev');
    });

    it('should use unknown value when no identifier available', () => {
      // Ensure both env variables are undefined
      const oldLifecycle = process.env.npm_lifecycle_event;
      delete process.env.npm_lifecycle_event;
      
      const metadata = getCommonMetadata(1000);
      expect(metadata.customIdentifier).toBe('unknown');
      
      // Restore env variable
      process.env.npm_lifecycle_event = oldLifecycle;
    });
  });
});