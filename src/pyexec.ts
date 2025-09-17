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

  // Default to CDN to avoid Node/CJS path issues in hosted env
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

