// Un-prefixed builtins on purpose: Tinycast's `require` knows `fs/promises`, not `node:fs/promises`.
import { execFile } from "child_process";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";

/** The slice of `fs/promises` the installer uses. Tests pass the real thing or a wrapper. */
export interface FileSystem {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  rm(path: string, options: { recursive: true; force: true }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readdir(path: string, options: { withFileTypes: true }): Promise<{ name: string; isDirectory(): boolean }[]>;
  mkdtemp(prefix: string): Promise<string>;
  stat(path: string): Promise<unknown>;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
}

export interface RunResult {
  status: number;
  /** stdout and stderr together, which is what a person needs to see when something fails. */
  output: string;
}

/** Runs a program to completion. Resolves on a non-zero exit; only a failure to start rejects. */
export type Run = (file: string, args: string[], options?: RunOptions) => Promise<RunResult>;

export type Download = (url: string) => Promise<Uint8Array>;

export interface Deps {
  fs: FileSystem;
  run: Run;
  download: Download;
  tmpdir: string;
  now: () => Date;
}

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

const run: Run = (file, args, { cwd, timeoutMs } = {}) =>
  new Promise((resolve) => {
    execFile(file, args, { cwd, timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES }, (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`;
      if (!error) return resolve({ status: 0, output });
      const status = typeof error.code === "number" ? error.code : 1;
      const timedOut = error.killed ? `\nTimed out after ${Math.round((timeoutMs ?? 0) / 1000)}s.` : "";
      resolve({ status, output: output || `${error.message}${timedOut}` });
    });
  });

const download: Download = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
};

export function systemDeps(): Deps {
  return {
    fs: { readFile, writeFile, mkdir, rm, rename, readdir, mkdtemp, stat },
    run,
    download,
    tmpdir: tmpdir(),
    now: () => new Date(),
  };
}
