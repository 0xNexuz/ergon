CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  title TEXT NOT NULL,
  proof_requirement TEXT NOT NULL,
  reward_luna INTEGER NOT NULL CHECK (reward_luna > 0),
  tone TEXT NOT NULL CHECK (tone IN ('orange', 'mint', 'cream', 'green')),
  requester TEXT NOT NULL,
  deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'proof-submitted', 'paid')),
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
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
