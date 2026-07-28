/** Cloudflare Worker entry point for Ergon. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { TASKS_CREATED_INDEX_SQL, TASKS_SCHEMA_SQL, TASKS_STATUS_INDEX_SQL } from "../db/schema";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type TaskRow = {
  id: string;
  label: string;
  title: string;
  proof_requirement: string;
  reward_luna: number;
  tone: "orange" | "mint" | "cream" | "green";
  requester: string;
  deadline: string;
  status: "open" | "proof-submitted" | "paid";
  contributor: string | null;
  proof_text: string | null;
  proof_url: string | null;
  proof_file_name: string | null;
  proof_submitted_at: string | null;
  proof_signature: string | null;
  proof_public_key: string | null;
  transaction_hash: string | null;
  created_at: string;
  updated_at: string;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function normalizeAddress(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, "").toUpperCase() : "";
}

function validAddress(value: string) {
  return /^NQ[0-9A-Z]{30,42}$/.test(value);
}

function textField(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function displayReward(luna: number) {
  return `${Number((luna / 100_000).toFixed(5))} NIM`;
}

function toTask(row: TaskRow) {
  const hasSubmission = Boolean(row.contributor && row.proof_submitted_at);
  return {
    id: row.id,
    label: row.label,
    title: row.title,
    proof: row.proof_requirement,
    reward: displayReward(row.reward_luna),
    tone: row.tone,
    posted: true,
    requester: row.requester,
    deadline: row.deadline,
    createdAt: row.created_at,
    status: row.status,
    submission: hasSubmission ? {
      text: row.proof_text ?? "",
      url: row.proof_url ?? "",
      file: row.proof_file_name ?? "",
      contributor: row.contributor,
      submittedAt: row.proof_submitted_at,
      signature: row.proof_signature ?? undefined,
      publicKey: row.proof_public_key ?? undefined,
    } : undefined,
    txHash: row.transaction_hash ?? undefined,
  };
}

async function ensureDatabase(db: D1Database) {
  await db.batch([
    db.prepare(TASKS_SCHEMA_SQL),
    db.prepare(TASKS_CREATED_INDEX_SQL),
    db.prepare(TASKS_STATUS_INDEX_SQL),
  ]);
}

async function findTask(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM tasks WHERE id = ? LIMIT 1").bind(id).first<TaskRow>();
}

async function handleTasksApi(request: Request, env: Env) {
  if (!env.DB) return json({ error: "Shared task storage is unavailable." }, 503);

  await ensureDatabase(env.DB);

  if (request.method === "GET") {
    const result = await env.DB.prepare(
      "SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100",
    ).all<TaskRow>();
    return json({ tasks: result.results.map(toTask) });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json<Record<string, unknown>>();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const action = textField(body.action, 32);

  if (action === "create") {
    const title = textField(body.title, 120);
    const proof = textField(body.proof, 100).toUpperCase();
    const label = textField(body.label, 40).toUpperCase();
    const deadline = textField(body.deadline, 40).toUpperCase();
    const requester = normalizeAddress(body.requester);
    const reward = Number(body.reward);
    const rewardLuna = Math.round(reward * 100_000);
    const allowedTones = new Set(["orange", "mint", "cream", "green"]);
    const tone = allowedTones.has(String(body.tone)) ? String(body.tone) : "orange";

    if (!title || !proof || !label || !deadline || !validAddress(requester)) {
      return json({ error: "Task details or requester address are invalid." }, 400);
    }
    if (!Number.isFinite(reward) || rewardLuna < 1 || rewardLuna > 1_000_000_000_000) {
      return json({ error: "Reward must be greater than zero and within the supported range." }, 400);
    }

    const id = `task-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO tasks (
        id, label, title, proof_requirement, reward_luna, tone, requester,
        deadline, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    ).bind(id, label, title, proof, rewardLuna, tone, requester, deadline, now, now).run();

    return json({ task: toTask((await findTask(env.DB, id))!) }, 201);
  }

  const id = textField(body.id, 80);
  const current = id ? await findTask(env.DB, id) : null;
  if (!current) return json({ error: "Task not found." }, 404);

  if (action === "submit-proof") {
    const contributor = normalizeAddress(body.contributor);
    const proofText = textField(body.text, 500);
    const proofUrl = textField(body.url, 500);
    const proofFile = textField(body.file, 160);
    if (!validAddress(contributor) || contributor === current.requester) {
      return json({ error: "A different valid contributor wallet must submit proof." }, 403);
    }
    if (!proofText && !proofUrl && !proofFile) {
      return json({ error: "Add proof notes, a proof link, or an attachment name." }, 400);
    }
    if (current.status !== "open") {
      return json({ error: "This task is no longer open for proof submissions." }, 409);
    }
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE tasks SET status = 'proof-submitted', contributor = ?, proof_text = ?,
       proof_url = ?, proof_file_name = ?, proof_submitted_at = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
    ).bind(contributor, proofText, proofUrl, proofFile, now, now, id).run();
    if (!result.meta.changes) return json({ error: "Another contributor updated this task first." }, 409);
  } else if (action === "sign-proof") {
    const contributor = normalizeAddress(body.contributor);
    const signature = textField(body.signature, 256);
    const publicKey = textField(body.publicKey, 128);
    if (current.status !== "proof-submitted" || !current.contributor || current.proof_signature) {
      return json({ error: "This proof cannot be signed in its current state." }, 409);
    }
    if (contributor !== current.contributor) {
      return json({ error: "Only the contributor who submitted this proof can sign it." }, 403);
    }
    if (!/^[0-9a-f]{128}$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(publicKey)) {
      return json({ error: "The Nimiq proof signature is invalid." }, 400);
    }
    const result = await env.DB.prepare(
      `UPDATE tasks SET proof_signature = ?, proof_public_key = ?, updated_at = ?
       WHERE id = ? AND contributor = ? AND proof_signature IS NULL`,
    ).bind(signature, publicKey, new Date().toISOString(), id, contributor).run();
    if (!result.meta.changes) return json({ error: "This proof was already signed." }, 409);
  } else if (action === "mark-paid") {
    const requester = normalizeAddress(body.requester);
    const transactionHash = textField(body.transactionHash, 4096);
    if (requester !== current.requester) {
      return json({ error: "Only the wallet that posted this task can mark it paid." }, 403);
    }
    if (current.status !== "proof-submitted" || !current.proof_signature) {
      return json({ error: "Signed contributor proof is required before payment." }, 409);
    }
    if (!transactionHash) return json({ error: "A broadcast transaction receipt is required." }, 400);
    const result = await env.DB.prepare(
      `UPDATE tasks SET status = 'paid', transaction_hash = ?, updated_at = ?
       WHERE id = ? AND requester = ? AND status = 'proof-submitted' AND proof_signature IS NOT NULL`,
    ).bind(transactionHash, new Date().toISOString(), id, requester).run();
    if (!result.meta.changes) return json({ error: "This task could not be marked paid." }, 409);
  } else {
    return json({ error: "Unknown task action." }, 400);
  }

  return json({ task: toTask((await findTask(env.DB, id))!) });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/tasks") {
      try {
        return await handleTasksApi(request, env);
      } catch (error) {
        console.error("Ergon task API failed", error);
        return json({ error: "The shared task board could not be updated." }, 500);
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
