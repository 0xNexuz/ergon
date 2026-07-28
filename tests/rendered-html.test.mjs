import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Ergon Mini App", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Ergon - Work made verifiable<\/title>/i);
  assert.match(html, /WORK/);
  assert.match(html, /Post the outcome/);
  assert.match(html, /CONNECT NIMIQ/);
  assert.match(html, /ergon-mark\.png/);
  assert.match(html, /DO TASK &amp; ADD PROOF/);
  assert.match(html, /NATIVE NIM PAYMENTS/);
  assert.match(html, /Built for the Nimiq Mini Apps Competition/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("ships competition and payment disclosures", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /direct NIM payment after proof approval/);
  assert.match(html, /Wallet access and every payment require native user approval/);
  assert.match(html, /Contract escrow belongs to the future EVM and USDT path/);
});

test("supports fresh task posting and role-separated proof", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/ergon-app.tsx", import.meta.url), "utf8"),
  );
  assert.match(source, /setCreateOutcome\(""\)/);
  assert.match(source, /PUBLISH TO LIVE TASKS/);
  assert.match(source, /setLiveTasks/);
  assert.match(source, /PROOF NOTES/);
  assert.match(source, /type="file"/);
  assert.match(source, /proofUrl/);
  assert.match(source, /canSettleTask\(selectedTask, address\)/);
  assert.match(source, /Only the wallet that posted this task can approve and pay/);
  assert.match(source, /SIGN PROOF — NO PAYMENT/);
  assert.doesNotMatch(source, /ADD PROOF & SETTLE/);
});
