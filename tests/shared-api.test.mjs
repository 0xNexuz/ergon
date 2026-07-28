import assert from "node:assert/strict";
import test from "node:test";

class MemoryStatement {
  constructor(sql, rows) {
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.rows = rows;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    return this.rows.get(this.args[0]) ?? null;
  }

  async all() {
    return { results: [...this.rows.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)) };
  }

  async run() {
    if (this.sql.startsWith("CREATE ")) return { meta: { changes: 0 } };

    if (this.sql.startsWith("INSERT INTO tasks")) {
      const [id, label, title, proof_requirement, reward_luna, tone, requester, deadline, created_at, updated_at] = this.args;
      this.rows.set(id, {
        id, label, title, proof_requirement, reward_luna, tone, requester, deadline,
        status: "open", contributor: null, proof_text: null, proof_url: null,
        proof_file_name: null, proof_submitted_at: null, proof_signature: null,
        proof_public_key: null, transaction_hash: null, created_at, updated_at,
      });
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes("SET status = 'proof-submitted'")) {
      const [contributor, proof_text, proof_url, proof_file_name, proof_submitted_at, updated_at, id] = this.args;
      const row = this.rows.get(id);
      if (!row || row.status !== "open") return { meta: { changes: 0 } };
      Object.assign(row, {
        contributor, proof_text, proof_url, proof_file_name,
        proof_submitted_at, updated_at, status: "proof-submitted",
      });
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes("SET proof_signature =")) {
      const [proof_signature, proof_public_key, updated_at, id, contributor] = this.args;
      const row = this.rows.get(id);
      if (!row || row.contributor !== contributor || row.proof_signature) return { meta: { changes: 0 } };
      Object.assign(row, { proof_signature, proof_public_key, updated_at });
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes("SET status = 'paid'")) {
      const [transaction_hash, updated_at, id, requester] = this.args;
      const row = this.rows.get(id);
      if (!row || row.requester !== requester || row.status !== "proof-submitted" || !row.proof_signature) {
        return { meta: { changes: 0 } };
      }
      Object.assign(row, { transaction_hash, updated_at, status: "paid" });
      return { meta: { changes: 1 } };
    }

    throw new Error(`Unhandled SQL in test: ${this.sql}`);
  }
}

class MemoryD1 {
  rows = new Map();

  prepare(sql) {
    return new MemoryStatement(sql, this.rows);
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

async function request(worker, db, body) {
  return worker.fetch(
    new Request("https://ergon.test/api/tasks", {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    { DB: db },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("shared API preserves requester and contributor roles across requests", async () => {
  const worker = await loadWorker();
  const db = new MemoryD1();
  const requester = `NQ${"1".repeat(34)}`;
  const contributor = `NQ${"2".repeat(34)}`;

  const createdResponse = await request(worker, db, {
    action: "create",
    title: "Check a shared task",
    proof: "PHOTO AND NOTE",
    label: "AROUND ME",
    deadline: "TODAY",
    reward: 2,
    tone: "mint",
    requester,
  });
  assert.equal(createdResponse.status, 201);
  const { task: created } = await createdResponse.json();
  assert.equal(created.requester, requester);
  assert.equal(created.status, "open");

  const blockedRequester = await request(worker, db, {
    action: "submit-proof", id: created.id, contributor: requester, text: "Done",
  });
  assert.equal(blockedRequester.status, 403);

  const submittedResponse = await request(worker, db, {
    action: "submit-proof", id: created.id, contributor, text: "Queue is five minutes",
  });
  assert.equal(submittedResponse.status, 200);

  const signedResponse = await request(worker, db, {
    action: "sign-proof",
    id: created.id,
    contributor,
    signature: "a".repeat(128),
    publicKey: "b".repeat(64),
  });
  assert.equal(signedResponse.status, 200);

  const blockedContributorPayment = await request(worker, db, {
    action: "mark-paid", id: created.id, requester: contributor, transactionHash: "tx",
  });
  assert.equal(blockedContributorPayment.status, 403);

  const paidResponse = await request(worker, db, {
    action: "mark-paid", id: created.id, requester, transactionHash: "signed-transaction",
  });
  assert.equal(paidResponse.status, 200);

  const sharedResponse = await request(worker, db);
  const shared = await sharedResponse.json();
  assert.equal(shared.tasks.length, 1);
  assert.equal(shared.tasks[0].status, "paid");
  assert.equal(shared.tasks[0].submission.contributor, contributor);
  assert.equal(shared.tasks[0].txHash, "signed-transaction");
});
