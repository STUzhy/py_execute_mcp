import { loadPyodide, version as pyodideVersion } from "pyodide";

export interface ExecutionRequest {
  id: string;
  code: string;
  context?: Record<string, unknown>;
  requirements?: string[];
  timeoutMs?: number;
}

export type ExecutionResponse =
  | { id: string; ok: true; stdout: string; stderr: string; result?: string }
  | { id: string; ok: false; error: string; stderr?: string };

let pyodidePromise: Promise<any> | null = null;

const CDN_FALLBACK = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;

function resolveIndexURL(): string {
  const envValue = typeof process !== "undefined" ? process.env.PYODIDE_INDEX_URL?.trim() : undefined;
  if (envValue) return envValue;

  // In Node runtime (Smithery dev/prod), prefer local package files
  if (typeof process !== "undefined" && process.versions?.node) {
    try {
      // Avoid import.meta; resolve relative to CWD where node_modules is installed
      const path = require("node:path") as typeof import("node:path");
      const fs = require("node:fs") as typeof import("node:fs");
      const localDir = path.resolve(process.cwd(), "node_modules", "pyodide");
      // Validate by checking for a known file present in npm package
      if (fs.existsSync(path.join(localDir, "pyodide.mjs"))) {
        return localDir; // Note: local package root (no '/full')
      }
    } catch {
      // fall through to CDN
    }
  }

  // Fallback to CDN distribution (which uses '/full/')
  return CDN_FALLBACK;
}

async function getPyodide() {
  if (!pyodidePromise) {
    const indexURL = resolveIndexURL();
    pyodidePromise = loadPyodide({ indexURL });
  }
  return pyodidePromise;
}

export async function executePython(req: ExecutionRequest): Promise<ExecutionResponse> {
  try {
    const pyodide = await getPyodide();

    let stdout = "";
    let stderr = "";

    pyodide.setStdout({ batched: (s: string) => (stdout += s) });
    pyodide.setStderr({ batched: (s: string) => (stderr += s) });

    const globals = pyodide.toPy(req.context ?? {});
    try {
      await pyodide.loadPackagesFromImports(req.code);

      if (req.requirements?.length) {
        await pyodide.loadPackage("micropip");
        const micropip = pyodide.pyimport("micropip");
        try {
          await micropip.install(req.requirements, { keep_going: true });
        } finally {
          micropip.destroy?.();
        }
      }

      const result = await pyodide.runPythonAsync(req.code, { globals });
      const resultStr =
        typeof result === "string"
          ? result
          : result != null
          ? JSON.stringify(result)
          : undefined;

      return { id: req.id, ok: true, stdout, stderr, result: resultStr };
    } finally {
      globals.destroy?.();
    }
  } catch (error: any) {
    return { id: req.id, ok: false, error: String(error?.message ?? error) };
  }
}
