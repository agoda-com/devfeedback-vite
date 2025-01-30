export interface CommonMetadata {
  id: string;
  userName: string;
  cpuCount: number;
  hostname: string;
  platform: string;
  os: string;
  timeTaken: number;
  branch: string;
  projectName: string;
  repository: string;
  repositoryName: string;
  timestamp: number | null;
  builtAt: string | null;
  totalMemory: number;
  cpuModels: string[];
  cpuSpeed: number[];
  nodeVersion: string;
  v8Version: string;
  commitSha: string;
  customIdentifier: string | null;
}

export interface WebpackBuildData extends CommonMetadata {
  type: 'webpack';
  webpackVersion: string | null;
  compilationHash: string | null;
  nbrOfCachedModules: number;
  nbrOfRebuiltModules: number;
}

export interface ViteBundleStats {
  bootstrapChunkSizeBytes?: number
  bootstrapChunkSizeLimitBytes?: number
}

export interface ViteBuildData extends CommonMetadata {
  type: 'vite';
  viteVersion: string | null;
  bundleStats?: ViteBundleStats
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

export interface TimingEntry {
  file: string;
  changeDetectedAt: number;
  moduleCount?: number;
}

export interface MetricsData extends CommonMetadata {
  type: 'hmr';
  file: string;
  moduleCount?: number;
}