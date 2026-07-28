import {
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";
import type { LiveTask, Tone } from "../../task-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEDGER_PATH = "ergon/tasks-v1.json";
const MAX_TASKS = 100;
const ALLOWED_TONES = new Set<Tone>(["orange", "mint", "cream", "green"]);

type Ledger = {
  version: 1;
  tasks: LiveTask[];
};

type ApiError = Error & { status?: number };

function apiError(message: string, status: number): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  return error;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function normalizeAddress(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, "").toUpperCase()
    : "";
}

function validAddress(value: string) {
  return /^NQ[0-9A-Z]{30,42}$/.test(value);
}

function textField(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function readLedger() {
  const result = await get(LEDGER_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return { ledger: { version: 1, tasks: [] } satisfies Ledger };
  }

  const parsed = await new Response(result.stream).json() as Partial<Ledger>;
  return {
    ledger: {
      version: 1,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, MAX_TASKS) : [],
    } satisfies Ledger,
    etag: result.blob.etag,
  };
}

async function mutateLedger(
  mutate: (ledger: Ledger) => { ledger: Ledger; task: LiveTask },
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await readLedger();
    const next = mutate(current.ledger);
    try {
      await put(LEDGER_PATH, JSON.stringify(next.ledger), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: Boolean(current.etag),
        ifMatch: current.etag,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      });
      return next.task;
    } catch (error) {
      const firstWriterCollision =
        !current.etag && error instanceof Error
        && /already exists|overwrite/i.test(error.message);
      if (
        attempt < 3
        && (error instanceof BlobPreconditionFailedError || firstWriterCollision)
      ) {
        continue;
      }
      throw error;
    }
  }
  throw apiError("The shared board changed too quickly. Please retry.", 409);
}

function findTask(ledger: Ledger, id: string) {
  const index = ledger.tasks.findIndex((task) => task.id === id);
  if (index < 0) throw apiError("Task not found.", 404);
  return { index, task: ledger.tasks[index] };
}

function updateTask(
  ledger: Ledger,
  index: number,
  changes: Partial<LiveTask>,
) {
  const task = { ...ledger.tasks[index], ...changes };
  const tasks = [...ledger.tasks];
  tasks[index] = task;
  return { ledger: { version: 1, tasks } satisfies Ledger, task };
}

export async function GET() {
  try {
    const { ledger } = await readLedger();
    const tasks = [...ledger.tasks].sort((left, right) =>
      String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")),
    );
    return json({ tasks });
  } catch (error) {
    console.error("Ergon Blob read failed", error);
    return json({ error: "The shared task board is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  try {
    const action = textField(body.action, 32);

    if (action === "create") {
      const title = textField(body.title, 120);
      const proof = textField(body.proof, 100).toUpperCase();
      const label = textField(body.label, 40).toUpperCase();
      const deadline = textField(body.deadline, 40).toUpperCase();
      const requester = normalizeAddress(body.requester);
      const reward = Number(body.reward);
      const rewardLuna = Math.round(reward * 100_000);
      const requestedTone = String(body.tone) as Tone;
      const tone = ALLOWED_TONES.has(requestedTone) ? requestedTone : "orange";

      if (!title || !proof || !label || !deadline || !validAddress(requester)) {
        throw apiError("Task details or requester address are invalid.", 400);
      }
      if (
        !Number.isFinite(reward)
        || rewardLuna < 1
        || rewardLuna > 1_000_000_000_000
      ) {
        throw apiError(
          "Reward must be greater than zero and within the supported range.",
          400,
        );
      }

      const now = new Date().toISOString();
      const created: LiveTask = {
        id: `task-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
        label,
        title,
        proof,
        reward: `${Number((rewardLuna / 100_000).toFixed(5))} NIM`,
        tone,
        posted: true,
        requester,
        deadline,
        createdAt: now,
        status: "open",
      };
      const task = await mutateLedger((ledger) => ({
        ledger: {
          version: 1,
          tasks: [created, ...ledger.tasks].slice(0, MAX_TASKS),
        },
        task: created,
      }));
      return json({ task }, 201);
    }

    const id = textField(body.id, 80);
    if (!id) throw apiError("Task not found.", 404);

    if (action === "submit-proof") {
      const contributor = normalizeAddress(body.contributor);
      const proofText = textField(body.text, 500);
      const proofUrl = textField(body.url, 500);
      const proofFile = textField(body.file, 160);
      const task = await mutateLedger((ledger) => {
        const current = findTask(ledger, id);
        if (
          !validAddress(contributor)
          || contributor === normalizeAddress(current.task.requester)
        ) {
          throw apiError(
            "A different valid contributor wallet must submit proof.",
            403,
          );
        }
        if (!proofText && !proofUrl && !proofFile) {
          throw apiError(
            "Add proof notes, a proof link, or an attachment name.",
            400,
          );
        }
        if ((current.task.status ?? "open") !== "open") {
          throw apiError(
            "This task is no longer open for proof submissions.",
            409,
          );
        }
        return updateTask(ledger, current.index, {
          status: "proof-submitted",
          submission: {
            text: proofText,
            url: proofUrl,
            file: proofFile,
            contributor,
            submittedAt: new Date().toISOString(),
          },
        });
      });
      return json({ task });
    }

    if (action === "sign-proof") {
      const contributor = normalizeAddress(body.contributor);
      const signature = textField(body.signature, 256);
      const publicKey = textField(body.publicKey, 128);
      const task = await mutateLedger((ledger) => {
        const current = findTask(ledger, id);
        const submission = current.task.submission;
        if (
          current.task.status !== "proof-submitted"
          || !submission
          || submission.signature
        ) {
          throw apiError(
            "This proof cannot be signed in its current state.",
            409,
          );
        }
        if (normalizeAddress(submission.contributor) !== contributor) {
          throw apiError(
            "Only the contributor who submitted this proof can sign it.",
            403,
          );
        }
        if (
          !/^[0-9a-f]{128}$/i.test(signature)
          || !/^[0-9a-f]{64}$/i.test(publicKey)
        ) {
          throw apiError("The Nimiq proof signature is invalid.", 400);
        }
        return updateTask(ledger, current.index, {
          submission: { ...submission, signature, publicKey },
        });
      });
      return json({ task });
    }

    if (action === "mark-paid") {
      const requester = normalizeAddress(body.requester);
      const transactionHash = textField(body.transactionHash, 4096);
      const task = await mutateLedger((ledger) => {
        const current = findTask(ledger, id);
        if (normalizeAddress(current.task.requester) !== requester) {
          throw apiError(
            "Only the wallet that posted this task can mark it paid.",
            403,
          );
        }
        if (
          current.task.status !== "proof-submitted"
          || !current.task.submission?.signature
        ) {
          throw apiError(
            "Signed contributor proof is required before payment.",
            409,
          );
        }
        if (!transactionHash) {
          throw apiError(
            "A broadcast transaction receipt is required.",
            400,
          );
        }
        return updateTask(ledger, current.index, {
          status: "paid",
          txHash: transactionHash,
        });
      });
      return json({ task });
    }

    throw apiError("Unknown task action.", 400);
  } catch (error) {
    const status = error instanceof Error && "status" in error
      ? Number((error as ApiError).status) || 500
      : 500;
    if (status >= 500) console.error("Ergon Blob mutation failed", error);
    return json({
      error: error instanceof Error
        ? error.message
        : "The shared task board could not be updated.",
    }, status);
  }
}
