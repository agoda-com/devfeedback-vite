import os from 'os';
import { v1 as uuidv1 } from 'uuid';
import { spawnSync } from 'child_process';
import type { StaticMetadata, CommonMetadata } from '../types';

const UNKNOWN_VALUE = 'unknown';

export const runGitCommand = (args: string[]): string | undefined => {
  try {
    const result = spawnSync('git', args);
    return result.stdout.toString().trim();
  } catch (error) {
    return undefined;
  }
};

let cachedMetadata: StaticMetadata | null = null;

export const getStaticMetadata = (): StaticMetadata => {
  if (cachedMetadata) {
    return cachedMetadata;
  }

  const repoUrl = runGitCommand(['config', '--get', 'remote.origin.url']);
  let repoName = repoUrl
    ? repoUrl.substring(repoUrl.lastIndexOf('/') + 1)
    : UNKNOWN_VALUE;
  repoName = repoName.endsWith('.git')
    ? repoName.substring(0, repoName.lastIndexOf('.'))
    : repoName;

  const gitUserName = process.env['GITLAB_USER_LOGIN'] ?? process.env['GITHUB_ACTOR'];
  const osUsername = os.userInfo().username;

  cachedMetadata = {
    userName: (gitUserName ? gitUserName : osUsername) ?? UNKNOWN_VALUE,
    cpuCount: os.cpus().length,
    hostname: os.hostname(),
    platform: os.type(),
    os: os.release(),
    projectName: repoName,
    repository: repoUrl ?? UNKNOWN_VALUE,
    repositoryName: repoName,
    totalMemory: os.totalmem(),
    cpuModels: os.cpus().map((cpu) => cpu.model),
    cpuSpeed: os.cpus().map((cpu) => cpu.speed),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    commitSha: runGitCommand(['rev-parse', 'HEAD']) ?? UNKNOWN_VALUE,
  };

  return cachedMetadata;
};

export const getCommonMetadata = (
  timeTaken: number,
  customIdentifier: string = process.env.npm_lifecycle_event ?? UNKNOWN_VALUE
): CommonMetadata => {
  const staticMetadata = getStaticMetadata();
  
  return {
    ...staticMetadata,
    id: uuidv1(),
    timeTaken,
    branch: runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']) ?? UNKNOWN_VALUE,
    timestamp: Date.now(),
    builtAt: new Date().toISOString(),
    customIdentifier,
  };
};