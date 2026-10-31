import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLogger } from "./logger.js";

test("structured logs are JSON lines, rotate by size, and omit secret fields", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "monitoring-logger-"));
  const logger = createLogger(directory, { maxBytes: 180, retentionDays: 30 });
  try {
    logger.info("request.one", { requestId: "id-1", token: "do-not-log", statusCode: 200 });
    logger.error("request.two", { requestId: "id-2", error: "failed", password: "do-not-log" });
    logger.warn("request.three", { requestId: "id-3", statusCode: 500 });
    await logger.close();
    const files = (await readdir(directory)).sort();
    assert.ok(files.length >= 2, "log output should roll over to a new file");
    const lines = (await Promise.all(files.map((file) => readFile(path.join(directory, file), "utf8"))))
      .join("")
      .trim()
      .split("\n");
    const events = lines.map((line) => JSON.parse(line));
    assert.deepEqual(events.map((entry) => entry.event).sort(), ["request.one", "request.three", "request.two"]);
    assert.ok(events.every((entry) => !("token" in entry) && !("password" in entry)));
  } finally {
    await logger.close();
    await rm(directory, { recursive: true, force: true });
  }
});
