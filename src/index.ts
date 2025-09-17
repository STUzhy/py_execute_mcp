import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mergeRequirements } from "./deps";

interface WorkerPayload {
  id: string;
  code: string;
  context: Record<string, unknown>;
  requirements: string[];
  timeoutMs: number;
}

interface WorkerSuccess {
  id: string;
  ok: true;
  stdout: string;
  stderr: string;
  result?: string;
}

interface WorkerFailure {
  id: string;
  ok: false;
  error: string;
  stderr?: string;
}

type WorkerResponse = WorkerSuccess | WorkerFailure;

class PyWorker {
  private worker?: Worker;

  constructor(private readonly workerUrl: URL) {}

  private ensureWorker() {
    if (!this.worker) {
      this.worker = new Worker(this.workerUrl, { type: "module" });
    }
  }

  async run(payload: WorkerPayload, timeoutMs: number): Promise<WorkerResponse> {
    this.ensureWorker();
    const worker = this.worker!;

    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          worker.terminate();
        } finally {
          this.worker = undefined;
        }
        reject(new Error(`Execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const handleMessage = (event: MessageEvent<WorkerResponse>) => {
        clearTimeout(timer);
        worker.removeEventListener("message", handleMessage as EventListener);
        worker.removeEventListener("error", handleError);
        resolve(event.data);
      };

      const handleError = (event: ErrorEvent) => {
        clearTimeout(timer);
        worker.removeEventListener("message", handleMessage as EventListener);
        worker.removeEventListener("error", handleError);
        this.worker = undefined;
        reject(event.error ?? new Error(event.message));
      };

      worker.addEventListener("message", handleMessage as EventListener);
      worker.addEventListener("error", handleError);

      worker.postMessage(payload);
    });
  }
}

export default function createServer({ config }: { config?: unknown }) {
  const server = new McpServer({ name: "python-pyodide", version: "1.0.0" });
  const workerUrl = new URL("./py.worker.ts", import.meta.url);
  const pyWorker = new PyWorker(workerUrl);

  server.registerTool(
    "python_execute",
    {
      title: "Execute Python via Pyodide",
      description:
        "Run Python in a Pyodide sandbox with optional PEP 723 requirements.",
      inputSchema: {
        code: z.string().describe("Python code to execute"),
        context: z.record(z.any()).optional(),
        timeout: z.number().int().positive().default(60_000),
        requirements: z.array(z.string()).optional(),
      },
    },
    async ({ code, context = {}, timeout, requirements }) => {
      const mergedRequirements = mergeRequirements(code, requirements);
      const payload: WorkerPayload = {
        id: crypto.randomUUID(),
        code,
        context,
        requirements: mergedRequirements,
        timeoutMs: timeout,
      };

      let response: WorkerResponse;
      try {
        response = await pyWorker.run(payload, timeout);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Python execution interrupted: ${String(
                (error as Error).message ?? error
              )}`,
            },
          ],
          isError: true,
        };
      }

      if (response.ok) {
        const fragments: string[] = [];
        if (response.stdout.trim().length > 0) {
          fragments.push(response.stdout.trimEnd());
        }

        if (response.result) {
          fragments.push(`__RESULT__:\n${response.result}`);
        }

        if (response.stderr.trim().length > 0) {
          fragments.push(`__STDERR__:\n${response.stderr.trimEnd()}`);
        }

        return { content: [{ type: "text", text: fragments.join("\n") }] };
      }

      const errorDetails = response.stderr ? `\n${response.stderr}` : "";
      return {
        content: [
          {
            type: "text",
            text: `Python execution failed: ${response.error}${errorDetails}`,
          },
        ],
        isError: true,
      };
    }
  );

  return server;
}

