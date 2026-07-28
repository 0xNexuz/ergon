import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/task-state.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const state = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const requester = "NQ11 REQUESTER WALLET";
const contributor = "NQ22 CONTRIBUTOR WALLET";
const viewer = "NQ33 VIEWER WALLET";
const openTask = {
  id: "role-test",
  label: "TEST",
  title: "Verify role isolation",
  proof: "SIGNED RESULT",
  reward: "5 NIM",
  tone: "mint",
  requester,
  status: "open",
};

test("requester cannot submit proof for their own task", () => {
  assert.equal(state.taskRole(openTask, requester), "requester");
  assert.equal(state.canSubmitProof(openTask, requester), false);
});

test("a different connected wallet can become the contributor", () => {
  assert.equal(state.taskRole(openTask, contributor), "viewer");
  assert.equal(state.canSubmitProof(openTask, contributor), true);
});

test("only the recorded contributor can sign submitted proof", () => {
  const submitted = {
    ...openTask,
    status: "proof-submitted",
    submission: { text: "Done", url: "", file: "", contributor, submittedAt: new Date(0).toISOString() },
  };
  assert.equal(state.canSignProof(submitted, contributor), true);
  assert.equal(state.canSignProof(submitted, requester), false);
  assert.equal(state.canSignProof(submitted, viewer), false);
  assert.equal(state.canSettleTask(submitted, requester), false, "unsigned proof must not unlock payment");
});

test("only the original requester can settle signed proof", () => {
  const signed = {
    ...openTask,
    status: "proof-submitted",
    submission: { text: "Done", url: "", file: "", contributor, submittedAt: new Date(0).toISOString(), signature: "signed" },
  };
  assert.equal(state.canSettleTask(signed, requester), true);
  assert.equal(state.canSettleTask(signed, contributor), false);
  assert.equal(state.canSettleTask(signed, viewer), false);
});

test("address comparison ignores Nimiq formatting spaces", () => {
  assert.equal(state.sameAddress("NQ11 ABCD EFGH", "nq11abcdefgh"), true);
});
