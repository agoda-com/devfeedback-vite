import { vi, describe, it, expect, beforeEach } from 'vitest';
import { sendMetrics, getEndpoint } from '../utils/metrics';
import type { MetricsData } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Metrics Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure environment is clean before each test
    delete process.env.VITE_ENDPOINT;
  });

  describe('getEndpoint', () => {
    it('should return default endpoint when env variable not set', () => {
      const endpoint = getEndpoint();
      expect(endpoint).toBe('http://compilation-metrics/vite');
    });

    it('should return custom endpoint from env variable', () => {
      process.env.VITE_ENDPOINT = 'http://custom-endpoint';
      const endpoint = getEndpoint();
      expect(endpoint).toBe('http://custom-endpoint');
    });
  });

  describe('sendMetrics', () => {
    const mockMetricsData: MetricsData = {
      id: 'test-id',
      type: 'hmr',
      file: 'test.ts',
      serverProcessingTime: 100,
      totalTime: 200,
      moduleCount: 1,
      timings: {
        changeDetected: 1000,
        hmrStarted: 1100,
        hmrCompleted: 1150,
        clientCompleted: 1200
      }
    } as MetricsData;

    beforeEach(() => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({ ok: true });
    });

    it('should send metrics to the endpoint', async () => {
      await sendMetrics(mockMetricsData);
      
      // Verify the fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenLastCalledWith(
        'http://compilation-metrics/vite',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockMetricsData),
        })
      );
    });

    it('should handle HTTP error responses', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      
      await sendMetrics(mockMetricsData);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[vite-timing] Error sending metrics:',
        expect.any(Error)
      );
    });

    it('should handle network errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      await sendMetrics(mockMetricsData);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[vite-timing] Error sending metrics:',
        expect.any(Error)
      );
    });
  });
});