/**
 * Sandbox Runner Library
 *
 * Provides isolated Docker-based execution environment for judging:
 * - Container isolation with resource limits
 * - Network isolation (no outbound by default)
 * - Timeout enforcement
 * - Structured log collection
 * - Artifact mounting (read-only)
 *
 * Security Model:
 * - Read-only base image
 * - Artifact mounted as read-only volume
 * - Working directory is ephemeral
 * - No network access by default
 * - CPU/memory/time limits enforced
 */

import { spawn, ChildProcess } from 'child_process';
import { env } from './env';

// Default sandbox configuration (spec: QUI-105)
export const SANDBOX_DEFAULTS = {
  cpuLimit: '2.0',            // 2 CPU cores (spec requirement)
  memoryLimit: '4g',          // 4 GB RAM (spec requirement)
  timeoutSeconds: 600,        // 10 minutes max (spec requirement)
  diskLimit: '2g',            // 2 GB disk
  networkEnabled: false,      // No network by default (spec requirement)
  readOnlyRootfs: true,       // Read-only root filesystem
  workdirPath: '/workspace',  // Working directory in container
  artifactPath: '/artifact',  // Artifact mount point
} as const;

// Default judge image (Node.js with common tools)
export const DEFAULT_JUDGE_IMAGE = 'node:20-alpine';

// Sandbox configuration
export interface SandboxConfig {
  image: string;              // Docker image to use
  cpuLimit?: string;          // CPU limit (e.g., "1.0", "0.5")
  memoryLimit?: string;       // Memory limit (e.g., "512m", "1g")
  timeoutSeconds?: number;    // Execution timeout
  networkEnabled?: boolean;   // Allow network access
  environment?: Record<string, string>; // Environment variables
}

// Execution command
export interface ExecutionCommand {
  command: string;
  args?: string[];
  cwd?: string;               // Working directory relative to workspace
  timeout?: number;           // Command-specific timeout
}

// Execution result
export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  oomKilled: boolean;
}

// Sandbox session for managing container lifecycle
export interface SandboxSession {
  containerId: string;
  config: SandboxConfig;
  artifactPath: string;
  logs: string[];
  startedAt: Date;
}

// Error types
export class SandboxError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'SandboxError';
  }
}

export class SandboxTimeoutError extends SandboxError {
  constructor(timeoutSeconds: number) {
    super(`Sandbox execution timed out after ${timeoutSeconds} seconds`);
    this.name = 'SandboxTimeoutError';
  }
}

export class SandboxOOMError extends SandboxError {
  constructor() {
    super('Sandbox ran out of memory (OOM killed)');
    this.name = 'SandboxOOMError';
  }
}

/**
 * Generate a unique container name
 */
function generateContainerName(prefix: string = 'sandbox'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Execute a command and capture output
 */
async function execCommand(
  command: string,
  args: string[],
  options: {
    timeout?: number;
    input?: string;
  } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    if (options.input && proc.stdin) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    proc.on('error', (err) => {
      reject(new SandboxError(`Failed to execute command: ${err.message}`, err));
    });
  });
}

/**
 * Check if Docker is available
 */
export async function checkDockerAvailable(): Promise<boolean> {
  try {
    const result = await execCommand('docker', ['version', '--format', '{{.Server.Version}}']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Pull a Docker image if not present
 */
export async function ensureImage(image: string): Promise<void> {
  // Check if image exists locally
  const checkResult = await execCommand('docker', [
    'image', 'inspect', image, '--format', '{{.Id}}'
  ]);

  if (checkResult.exitCode === 0) {
    return; // Image exists
  }

  // Pull the image
  console.log(`Pulling Docker image: ${image}`);
  const pullResult = await execCommand('docker', ['pull', image], {
    timeout: 300000, // 5 minute timeout for pull
  });

  if (pullResult.exitCode !== 0) {
    throw new SandboxError(`Failed to pull image ${image}: ${pullResult.stderr}`);
  }
}

/**
 * Create a sandbox container
 */
export async function createSandbox(
  artifactPath: string,
  config: SandboxConfig
): Promise<SandboxSession> {
  const containerName = generateContainerName('judge');
  const fullConfig = {
    ...SANDBOX_DEFAULTS,
    ...config,
  };

  // Ensure image is available
  await ensureImage(config.image);

  // Build docker run arguments
  const dockerArgs: string[] = [
    'create',
    '--name', containerName,

    // Resource limits
    '--cpus', fullConfig.cpuLimit || SANDBOX_DEFAULTS.cpuLimit,
    '--memory', fullConfig.memoryLimit || SANDBOX_DEFAULTS.memoryLimit,
    '--memory-swap', fullConfig.memoryLimit || SANDBOX_DEFAULTS.memoryLimit, // No swap
    '--pids-limit', '100', // Limit number of processes

    // Security
    '--security-opt', 'no-new-privileges:true',
    '--cap-drop', 'ALL', // Drop all capabilities
    '--read-only',       // Read-only root filesystem

    // Tmpfs for writable workspace
    '--tmpfs', `${SANDBOX_DEFAULTS.workdirPath}:rw,noexec,nosuid,size=100m`,
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=50m',

    // Mount artifact read-only
    '-v', `${artifactPath}:${SANDBOX_DEFAULTS.artifactPath}:ro`,

    // Working directory
    '-w', SANDBOX_DEFAULTS.workdirPath,
  ];

  // Network isolation
  if (!fullConfig.networkEnabled) {
    dockerArgs.push('--network', 'none');
  }

  // Environment variables
  if (fullConfig.environment) {
    for (const [key, value] of Object.entries(fullConfig.environment)) {
      dockerArgs.push('-e', `${key}=${value}`);
    }
  }

  // Add default environment
  dockerArgs.push('-e', `ARTIFACT_PATH=${SANDBOX_DEFAULTS.artifactPath}`);
  dockerArgs.push('-e', `WORKSPACE=${SANDBOX_DEFAULTS.workdirPath}`);

  // Image and default command (sleep to keep container alive)
  dockerArgs.push(config.image);
  dockerArgs.push('sleep', 'infinity');

  // Create container
  const createResult = await execCommand('docker', dockerArgs);

  if (createResult.exitCode !== 0) {
    throw new SandboxError(`Failed to create container: ${createResult.stderr}`);
  }

  const containerId = createResult.stdout.trim();

  // Start container
  const startResult = await execCommand('docker', ['start', containerId]);

  if (startResult.exitCode !== 0) {
    // Cleanup failed container
    await execCommand('docker', ['rm', '-f', containerId]);
    throw new SandboxError(`Failed to start container: ${startResult.stderr}`);
  }

  return {
    containerId,
    config: fullConfig,
    artifactPath,
    logs: [],
    startedAt: new Date(),
  };
}

/**
 * Execute a command inside a sandbox
 */
export async function executeInSandbox(
  session: SandboxSession,
  cmd: ExecutionCommand
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const timeout = (cmd.timeout || session.config.timeoutSeconds || SANDBOX_DEFAULTS.timeoutSeconds) * 1000;

  // Build exec command
  const execArgs = [
    'exec',
    '-i', // Interactive for stdin
  ];

  // Working directory
  if (cmd.cwd) {
    execArgs.push('-w', `${SANDBOX_DEFAULTS.workdirPath}/${cmd.cwd}`);
  }

  execArgs.push(session.containerId);

  // Use sh -c to handle complex commands
  execArgs.push('sh', '-c', `${cmd.command} ${(cmd.args || []).join(' ')}`);

  // Execute with timeout
  let timedOut = false;
  let proc: ChildProcess | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      if (proc) {
        proc.kill('SIGKILL');
      }
      reject(new SandboxTimeoutError(timeout / 1000));
    }, timeout);
  });

  try {
    const resultPromise = new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
      proc = spawn('docker', execArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });

      proc.on('error', (err) => {
        reject(new SandboxError(`Exec failed: ${err.message}`, err));
      });
    });

    const result = await Promise.race([resultPromise, timeoutPromise]);
    const durationMs = Date.now() - startTime;

    // Log the command
    session.logs.push(`[${new Date().toISOString()}] ${cmd.command} (exit: ${result.exitCode}, ${durationMs}ms)`);

    // Check for OOM kill
    let oomKilled = false;
    if (result.exitCode === 137) {
      // Check container status
      const inspectResult = await execCommand('docker', [
        'inspect', session.containerId, '--format', '{{.State.OOMKilled}}'
      ]);
      oomKilled = inspectResult.stdout.trim() === 'true';
    }

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      timedOut: false,
      oomKilled,
    };
  } catch (error) {
    if (timedOut) {
      session.logs.push(`[${new Date().toISOString()}] ${cmd.command} (TIMEOUT after ${timeout / 1000}s)`);
      return {
        exitCode: 124,
        stdout: '',
        stderr: 'Command timed out',
        durationMs: timeout,
        timedOut: true,
        oomKilled: false,
      };
    }
    throw error;
  }
}

/**
 * Copy files from sandbox to host
 */
export async function copyFromSandbox(
  session: SandboxSession,
  containerPath: string,
  hostPath: string
): Promise<void> {
  const result = await execCommand('docker', [
    'cp',
    `${session.containerId}:${containerPath}`,
    hostPath,
  ]);

  if (result.exitCode !== 0) {
    throw new SandboxError(`Failed to copy from container: ${result.stderr}`);
  }
}

/**
 * Copy files from host to sandbox
 */
export async function copyToSandbox(
  session: SandboxSession,
  hostPath: string,
  containerPath: string
): Promise<void> {
  const result = await execCommand('docker', [
    'cp',
    hostPath,
    `${session.containerId}:${containerPath}`,
  ]);

  if (result.exitCode !== 0) {
    throw new SandboxError(`Failed to copy to container: ${result.stderr}`);
  }
}

/**
 * Get container resource usage
 */
export async function getSandboxStats(
  session: SandboxSession
): Promise<{ cpuPercent: number; memoryMB: number; memoryLimit: number }> {
  const result = await execCommand('docker', [
    'stats', session.containerId,
    '--no-stream',
    '--format', '{{.CPUPerc}}\t{{.MemUsage}}',
  ]);

  if (result.exitCode !== 0) {
    return { cpuPercent: 0, memoryMB: 0, memoryLimit: 0 };
  }

  try {
    const [cpu, memUsage] = result.stdout.trim().split('\t');
    const cpuPercent = parseFloat(cpu.replace('%', '')) || 0;

    // Parse memory usage "100MiB / 512MiB"
    const memParts = memUsage.split(' / ');
    const parseMemory = (s: string): number => {
      const num = parseFloat(s);
      if (s.includes('GiB')) return num * 1024;
      if (s.includes('MiB')) return num;
      if (s.includes('KiB')) return num / 1024;
      return num;
    };

    return {
      cpuPercent,
      memoryMB: parseMemory(memParts[0] || '0'),
      memoryLimit: parseMemory(memParts[1] || '512MiB'),
    };
  } catch {
    return { cpuPercent: 0, memoryMB: 0, memoryLimit: 0 };
  }
}

/**
 * Destroy a sandbox and cleanup resources
 */
export async function destroySandbox(session: SandboxSession): Promise<void> {
  // Force remove container
  await execCommand('docker', ['rm', '-f', session.containerId]);
}

/**
 * Get logs from sandbox session
 */
export function getSandboxLogs(session: SandboxSession): string[] {
  return [...session.logs];
}

/**
 * Run a complete judging sequence in a sandbox
 */
export async function runJudgingSequence(
  artifactPath: string,
  config: SandboxConfig,
  commands: ExecutionCommand[]
): Promise<{
  results: ExecutionResult[];
  logs: string[];
  totalDurationMs: number;
  success: boolean;
}> {
  const session = await createSandbox(artifactPath, config);
  const startTime = Date.now();
  const results: ExecutionResult[] = [];

  try {
    // First, copy artifact to workspace
    const copyResult = await executeInSandbox(session, {
      command: 'cp',
      args: ['-r', `${SANDBOX_DEFAULTS.artifactPath}/.`, SANDBOX_DEFAULTS.workdirPath],
    });

    if (copyResult.exitCode !== 0) {
      throw new SandboxError(`Failed to copy artifact to workspace: ${copyResult.stderr}`);
    }

    // Run each command in sequence
    let success = true;
    for (const cmd of commands) {
      const result = await executeInSandbox(session, cmd);
      results.push(result);

      // Stop on first failure (configurable in future)
      if (result.exitCode !== 0) {
        success = false;
        break;
      }
    }

    return {
      results,
      logs: getSandboxLogs(session),
      totalDurationMs: Date.now() - startTime,
      success,
    };
  } finally {
    await destroySandbox(session);
  }
}

/**
 * Health check for sandbox system
 */
export async function checkSandboxHealth(): Promise<{
  dockerAvailable: boolean;
  defaultImageAvailable: boolean;
  canCreateContainer: boolean;
}> {
  const dockerAvailable = await checkDockerAvailable();

  if (!dockerAvailable) {
    return {
      dockerAvailable: false,
      defaultImageAvailable: false,
      canCreateContainer: false,
    };
  }

  // Check if default image is available
  let defaultImageAvailable = false;
  try {
    await ensureImage(DEFAULT_JUDGE_IMAGE);
    defaultImageAvailable = true;
  } catch {
    defaultImageAvailable = false;
  }

  // Try to create and destroy a test container
  let canCreateContainer = false;
  try {
    const testResult = await execCommand('docker', [
      'run', '--rm',
      '--cpus', '0.1',
      '--memory', '32m',
      '--network', 'none',
      DEFAULT_JUDGE_IMAGE,
      'echo', 'sandbox-test',
    ], { timeout: 30000 });
    canCreateContainer = testResult.exitCode === 0 && testResult.stdout.includes('sandbox-test');
  } catch {
    canCreateContainer = false;
  }

  return {
    dockerAvailable,
    defaultImageAvailable,
    canCreateContainer,
  };
}
