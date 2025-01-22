export interface StaticMetadata {
  userName: string;
  cpuCount: number;
  hostname: string;
  platform: string;
  os: string;
  projectName: string;
  repository: string;
  repositoryName: string;
  totalMemory: number;
  cpuModels: string[];
  cpuSpeed: number[];
  nodeVersion: string;
  v8Version: string;
  commitSha: string;
}

export interface CommonMetadata extends StaticMetadata {
  id: string;
  timeTaken: bigint;
  branch: string;
  timestamp: number;
  builtAt: string;
  customIdentifier: string;
}

export interface TimingEntry {
  file: string;
  changeDetectedAt: number;
  moduleCount?: number;
}

export interface MetricsData extends CommonMetadata {
  type: 'hmr';
  file: string;
  totalTime: number;
  moduleCount?: number;
}

export interface HMRUpdate {
  type: string;
  updates?: Array<{ path?: string; file?: string }>;
}

export interface ClientMessage {
  file: string;
  clientTimestamp: number;
}

export interface ViteTimingPlugin {
  _TEST_getChangeMap?: () => Map<string, TimingEntry>;
}