import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vercel task API uses private storage with concurrency protection", async () => {
  const source = await readFile(
    new URL("../app/api/tasks/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /get\(LEDGER_PATH/);
  assert.match(source, /put\(LEDGER_PATH/);
  assert.match(source, /access: "private"/);
  assert.match(source, /useCache: false/);
  assert.match(source, /ifMatch: current\.etag/);
  assert.match(source, /BlobPreconditionFailedError/);
  assert.match(source, /action === "submit-proof"/);
  assert.match(source, /action === "sign-proof"/);
  assert.match(source, /action === "mark-paid"/);
});
