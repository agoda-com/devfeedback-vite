import type { MetricsData } from '../types';

const DEFAULT_ENDPOINT = 'http://compilation-metrics/vite';

export const getEndpoint = (): string => {
  return process.env.VITE_ENDPOINT ?? DEFAULT_ENDPOINT;
};

export async function sendMetrics(metricsData: MetricsData): Promise<void> {
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