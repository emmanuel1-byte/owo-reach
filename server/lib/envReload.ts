import { watch } from "node:fs";

/**
 * Bun loads .env once at process start and has no built-in way to pick up
 * edits afterwards — `--watch` restarts on code changes but not on .env
 * (see https://github.com/oven-sh/bun/issues/13075, still open). server/env.ts
 * already reads process.env live on every access (getters, not a snapshot),
 * so re-parsing the file into process.env on change is enough to make a new
 * key or provider swap take effect without restarting the process at all.
 */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function watchEnvFile(path = ".env"): void {
  const file = Bun.file(path);

  const reload = async () => {
    if (!(await file.exists())) return;
    const parsed = parseEnvFile(await file.text());
    let changed = 0;
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] !== value) {
        process.env[key] = value;
        changed++;
      }
    }
    if (changed > 0) {
      console.log(`.env changed — reloaded ${changed} var${changed === 1 ? "" : "s"}`);
    }
  };

  // fs.watch fires more than once per save on most editors/OSes; debounce so
  // a single save doesn't trigger several reloads.
  let debounce: ReturnType<typeof setTimeout> | undefined;
  try {
    watch(path, () => {
      clearTimeout(debounce);
      debounce = setTimeout(reload, 50);
    });
  } catch {
    // .env doesn't exist (e.g. a host that injects env vars directly) — nothing to watch.
  }
}
