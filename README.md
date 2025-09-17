# py_execute_mcp

MCP stdio server that executes Python code inside Pyodide (WASM) using Bun as the runtime and bundler.

## Prerequisites

- Bun v1.2 or newer (install script: `powershell -Command "iwr https://bun.sh/install.ps1 -UseBasicParsing | iex"`)

## Install dependencies

```bash
bun install
```

## Run the server (development)

```bash
bun run src/index.ts
```

Expose `bun run src/index.ts` as an MCP stdio endpoint in Claude Desktop, Cherry Studio, or any compliant client.

## Package as a single executable

```bash
bun build src/index.ts --compile --outfile mcp-python
```

### Optional: Offline Pyodide

Download a Pyodide distribution and set `PYODIDE_INDEX_URL` before launching:

```bash
set PYODIDE_INDEX_URL=file:///absolute/path/to/pyodide/full/
./mcp-python
```

## Minimum example request

```python
# /// script
# dependencies = ['pydash']
# ///
import sys
print(sys.version)
print(sum([1, 2, 3]))
"done"
```

`python_execute` will stream stdout/stderr and return the expression result under `__RESULT__` when present.
