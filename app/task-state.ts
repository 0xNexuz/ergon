export type Tone = "orange" | "mint" | "cream" | "green";
export type TaskStatus = "open" | "proof-submitted" | "paid";

export type ProofPackage = {
  text: string;
  url: string;
  file: string;
  contributor: string;
  submittedAt: string;
  signature?: string;
};

export type LiveTask = {
  id: string;
  label: string;
  title: string;
  proof: string;
  reward: string;
  tone: Tone;
  posted?: boolean;
  requester?: string;
  status?: TaskStatus;
  submission?: ProofPackage;
  txHash?: string;
};

export type TaskRole = "disconnected" | "requester" | "contributor" | "viewer";

export function normalizeAddress(address: string) {
  return address.replace(/\s+/g, "").toUpperCase();
}

export function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && normalizeAddress(left) === normalizeAddress(right));
}

export function taskStatus(task: LiveTask): TaskStatus {
  return task.status ?? "open";
}

export function taskRole(task: LiveTask, walletAddress: string): TaskRole {
  if (!walletAddress) return "disconnected";
  if (sameAddress(task.requester, walletAddress)) return "requester";
  if (sameAddress(task.submission?.contributor, walletAddress)) return "contributor";
  return "viewer";
}

export function canSubmitProof(task: LiveTask, walletAddress: string) {
  const role = taskRole(task, walletAddress);
  return taskStatus(task) === "open" && (role === "viewer" || role === "contributor");
}

export function canSignProof(task: LiveTask, walletAddress: string) {
  return taskStatus(task) === "proof-submitted"
    && taskRole(task, walletAddress) === "contributor"
    && Boolean(task.submission)
    && !task.submission?.signature;
}

export function canSettleTask(task: LiveTask, walletAddress: string) {
  return taskStatus(task) === "proof-submitted"
    && taskRole(task, walletAddress) === "requester"
    && Boolean(task.submission?.signature);
}
