import { loadPyodide, version as pyodideVersion } from "pyodide";

interface ExecutionRequest {
  id: string;
  code: string;
  context?: Record<string, unknown>;
  requirements?: string[];
  timeoutMs?: number;
}

type ExecutionResponse =
  | { id: string; ok: true; stdout: string; stderr: string; result?: string }
  | { id: string; ok: false; error: string; stderr?: string };

let pyodidePromise: Promise<any> | null = null;

const CDN_FALLBACK = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;

function fileUrlToPath(url: URL): string {
  let pathname = decodeURIComponent(url.pathname);

  if (typeof process !== "undefined" && process.platform === "win32") {
    if (pathname.startsWith("/")) {
      pathname = pathname.slice(1);
    }
    pathname = pathname.replace(/\//g, "\\");
  }

  return pathname;
}

function resolveIndexURL(): string {
  const envValue =
    typeof process !== "undefined" ? process.env.PYODIDE_INDEX_URL?.trim() : undefined;
  if (envValue) {
    return envValue;
  }

  const moduleUrl = import.meta.url;
  if (typeof moduleUrl === "string" && moduleUrl.startsWith("file://")) {
    const localFolder = new URL("../node_modules/pyodide/", moduleUrl);
    const filesystemPath = fileUrlToPath(localFolder);
    return filesystemPath;
  }

  return CDN_FALLBACK;
}

async function getPyodide() {
  if (!pyodidePromise) {
    const indexURL = resolveIndexURL();
    pyodidePromise = loadPyodide({ indexURL });
  }
  return pyodidePromise;
}

async function handleExecution(req: ExecutionRequest): Promise<ExecutionResponse> {
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

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<ExecutionRequest>) => {
  const response = await handleExecution(event.data);
  workerScope.postMessage(response);
};
