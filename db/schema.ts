export const TASK_STATUSES = ["open", "proof-submitted", "paid"] as const;
export const TASK_TONES = ["orange", "mint", "cream", "green"] as const;

export const TASKS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  title TEXT NOT NULL,
  proof_requirement TEXT NOT NULL,
  reward_luna INTEGER NOT NULL,
  tone TEXT NOT NULL,
  requester TEXT NOT NULL,
  deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  contributor TEXT,
  proof_text TEXT,
  proof_url TEXT,
  proof_file_name TEXT,
  proof_submitted_at TEXT,
  proof_signature TEXT,
  proof_public_key TEXT,
  transaction_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const TASKS_CREATED_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)";

export const TASKS_STATUS_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)";
