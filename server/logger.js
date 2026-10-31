import { readdirSync, statSync, mkdirSync, createWriteStream, unlinkSync } from "node:fs";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;

export function createLogger(directory, { maxBytes = 10 * 1024 * 1024, retentionDays = 30 } = {}) {
  mkdirSync(directory, { recursive: true });
  let stream;
  let streamPath = "";
  let streamSize = 0;
  let streamDay = "";
  let sequence = 0;

  function openFor(date) {
    const stamp = date.toISOString().slice(0, 10);
    if (stream && streamDay === stamp && streamSize < maxBytes) return;
    const baseName = `server-${stamp}`;
    const files = readdirSync(directory)
      .filter((name) => name.startsWith(`${baseName}`) && name.endsWith(".jsonl"))
      .sort();
    const latest = files.at(-1);
    const currentPath = latest ? path.join(directory, latest) : path.join(directory, `${baseName}.jsonl`);
    const currentSize = latest ? statSync(currentPath).size : 0;
    const knownSize = stream && streamPath === currentPath ? Math.max(currentSize, streamSize) : currentSize;
    if (stream && !stream.writableEnded) stream.end();
    if (knownSize >= maxBytes) {
      sequence = files.filter((name) => name.startsWith(`${baseName}.`)).length + 1;
      streamPath = path.join(directory, `${baseName}.${String(sequence).padStart(3, "0")}.jsonl`);
      streamSize = 0;
      stream = createWriteStream(streamPath, { flags: "a" });
    } else {
      streamPath = currentPath;
      streamSize = currentSize;
      stream = createWriteStream(currentPath, { flags: "a" });
    }
    streamDay = stamp;
    stream.on("error", (error) => process.stderr.write(`Structured log write failed: ${error.message}\n`));
    prune(date.getTime());
  }

  function prune(now) {
    const oldestAllowed = now - retentionDays * DAY_MS;
    for (const name of readdirSync(directory)) {
      if (!/^server-\d{4}-\d{2}-\d{2}(?:\.\d{3})?\.jsonl$/.test(name)) continue;
      const filePath = path.join(directory, name);
      if (statSync(filePath).mtimeMs < oldestAllowed) {
        try {
          unlinkSync(filePath);
        } catch {
          /* Retain logs if cleanup fails. */
        }
      }
    }
  }

  function write(level, event, fields = {}) {
    const now = new Date();
    openFor(now);
    const safeFields = Object.fromEntries(
      Object.entries(fields).filter(([key]) => !/password|token|secret|credential|authorization|cookie/i.test(key)),
    );
    const line = `${JSON.stringify({ timestamp: now.toISOString(), level, event, ...safeFields })}\n`;
    stream.write(line);
    streamSize += Buffer.byteLength(line);
  }

  return Object.freeze({
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    close: () =>
      new Promise((resolve) => {
        if (!stream || stream.writableEnded) return resolve();
        stream.end(resolve);
      }),
  });
}
