// Minimal PEP 723 dependency extractor.
export function extractPep723Requirements(code: string): string[] {
  const match = code.match(/#\s*\/\/\/\s*script([\s\S]*?)#\s*\/\/\/\s*$/m);
  if (!match || typeof match[1] !== "string") return [];

  const block = match[1];
  const depsMatch = block.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (!depsMatch || typeof depsMatch[1] !== "string") return [];

  const normalized = depsMatch[1]
    .replace(/#[^\n]*/g, "")
    .replace(/\s/g, "")
    .replace(/'/g, '"');

  try {
    const parsed = JSON.parse(`[${normalized}]`);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
    }
  } catch (error) {
    // ignore parsing errors and fall back to empty list
  }

  return [];
}

export function mergeRequirements(code: string, extra?: string[]): string[] {
  const pepDeps = extractPep723Requirements(code);
  const additional = Array.isArray(extra) ? extra : [];
  return Array.from(new Set([...pepDeps, ...additional]));
}
