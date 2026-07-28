"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { init, type ErrorResponse, type NimiqProvider } from "@nimiq/mini-app-sdk";
import {
  canSettleTask,
  canSignProof,
  canSubmitProof,
  normalizeAddress,
  taskRole,
  taskStatus,
  type LiveTask,
  type Tone,
} from "./task-state";

const INITIAL_TASKS: LiveTask[] = [
  { id: "queue-check", label: "AROUND ME", title: "Check the queue at the main entrance", proof: "PHOTO + WAIT TIME", reward: "2 NIM", tone: "orange" },
  { id: "cv-proofread", label: "FROM MY PHONE", title: "Proofread a one-page CV", proof: "CORRECTED PDF", reward: "8 NIM", tone: "mint" },
  { id: "github-close", label: "AUTO-VERIFIED", title: "Close GitHub issue #42", proof: "MERGED COMMIT", reward: "20 NIM", tone: "cream" },
  { id: "access-check", label: "AROUND ME", title: "Confirm wheelchair access", proof: "PHOTO + CHECKLIST", reward: "3 NIM", tone: "green" },
];

const faqs = [
  ["Is Ergon another freelance marketplace?", "No. Ergon is for small, clearly defined outcomes—not profiles, proposals, hourly work, or long projects. A task is claimed, proven, approved, and paid."],
  ["Where does the payment happen?", "NIM payments are requested through the provider injected by Nimiq Pay. The wallet shows its native confirmation screen and keeps the private key outside this Mini App."],
  ["What counts as proof?", "The requester chooses the evidence before publishing: written notes, a file, URL, photo, checklist, signed response, or a machine-verifiable event such as a merged commit."],
  ["Does Ergon claim native NIM smart-contract escrow?", "No. The MVP uses direct NIM settlement after approval. Contract escrow is reserved for the future EVM and USDT path, so the interface never promises a capability the provider does not expose."],
  ["What if a wallet request is rejected?", "Nothing is sent. Ergon preserves the task, explains what happened, and lets the user safely retry."],
];

const STORAGE_KEY = "ergon-posted-tasks";

function isProviderError(value: unknown): value is ErrorResponse {
  return Boolean(value && typeof value === "object" && "error" in value);
}
function short(address: string) {
  return address.length < 16 ? address : `${address.slice(0, 8)}…${address.slice(-6)}`;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "The wallet request could not be completed.";
}
function rewardAmount(task: LiveTask) {
  return task.reward.match(/[\d.]+/)?.[0] || "";
}
function Brand() {
  return <span className="brand"><Image src="/ergon-mark.png" width={38} height={38} alt="" aria-hidden="true" />ERGON</span>;
}

export default function ErgonApp() {
  const [provider, setProvider] = useState<NimiqProvider | null>(null);
  const [address, setAddress] = useState("");
  const [walletStatus, setWalletStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [walletNote, setWalletNote] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "task" | null>(null);
  const [liveTasks, setLiveTasks] = useState<LiveTask[]>(INITIAL_TASKS);
  const [selectedTask, setSelectedTask] = useState<LiveTask | null>(null);
  const [taskUpdate, setTaskUpdate] = useState("");
  const [createOutcome, setCreateOutcome] = useState("");
  const [createProof, setCreateProof] = useState("");
  const [createReward, setCreateReward] = useState("");
  const [createCategory, setCreateCategory] = useState("FROM MY PHONE");
  const [createDeadline, setCreateDeadline] = useState("TODAY");
  const [createError, setCreateError] = useState("");
  const [proofText, setProofText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [proofFileName, setProofFileName] = useState("");
  const [payStatus, setPayStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [payNote, setPayNote] = useState("");
  const [txHash, setTxHash] = useState("");
  const [openFaq, setOpenFaq] = useState(0);
  const amount = selectedTask ? rewardAmount(selectedTask) : "";
  const recipient = selectedTask?.submission?.contributor || "";
  const luna = useMemo(() => Math.round((Number(amount) || 0) * 100_000), [amount]);
  const connected = walletStatus === "ready" && Boolean(address);
  const selectedRole = selectedTask ? taskRole(selectedTask, address) : "disconnected";
  const selectedStatus = selectedTask ? taskStatus(selectedTask) : "open";

  useEffect(() => {
    let restoreTimer = 0;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as LiveTask[];
      if (Array.isArray(saved) && saved.length) {
        restoreTimer = window.setTimeout(() => setLiveTasks([...saved, ...INITIAL_TASKS]), 0);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    return () => window.clearTimeout(restoreTimer);
  }, []);

  async function connect() {
    setWalletStatus("loading");
    setWalletNote("Waiting for Nimiq Pay approval…");
    try {
      const nimiq = await init({ timeout: 8000 });
      const accounts = await nimiq.listAccounts();
      if (isProviderError(accounts)) throw new Error(accounts.error.message);
      if (!accounts.length) throw new Error("No Nimiq account was returned.");
      setProvider(nimiq);
      setAddress(accounts[0]);
      setWalletStatus("ready");
      setWalletNote("Connected securely through Nimiq Pay");
    } catch (error) {
      setWalletStatus("error");
      setWalletNote(!window.nimiq ? "Open Ergon inside Nimiq Pay to connect your wallet." : message(error));
    }
  }

  function openCreateTask(category = "FROM MY PHONE") {
    setCreateOutcome("");
    setCreateProof("");
    setCreateReward("");
    setCreateCategory(category);
    setCreateDeadline("TODAY");
    setCreateError("");
    setModalMode("create");
  }

  function publishTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reward = Number(createReward);
    if (!createOutcome.trim() || !createProof.trim() || !Number.isFinite(reward) || reward <= 0) {
      setCreateError("Add an outcome, a proof requirement, and a reward greater than zero.");
      return;
    }
    const tones: Tone[] = ["orange", "mint", "cream", "green"];
    const created: LiveTask = {
      id: `posted-${Date.now()}`,
      label: createCategory,
      title: createOutcome.trim(),
      proof: createProof.trim().toUpperCase(),
      reward: `${reward} NIM`,
      tone: tones[Math.floor(Math.random() * tones.length)],
      posted: true,
    };
    setLiveTasks((current) => [created, ...current]);
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as LiveTask[];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([created, ...(Array.isArray(saved) ? saved : [])].slice(0, 12)));
    } catch {
      // The live board still updates for this session if storage is unavailable.
    }
    setTaskUpdate(`“${created.title}” is now live · ${createDeadline} · ${created.reward}`);
    setModalMode(null);
    window.setTimeout(() => document.getElementById("tasks")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function openTask(task: LiveTask) {
    setSelectedTask(task);
    setProofText("");
    setProofUrl("");
    setProofFileName("");
    setProofSubmitted(false);
    setRecipient("");
    setAmount(task.reward.match(/[\d.]+/)?.[0] || "");
    setPayStatus("idle");
    setPayNote("");
    setTxHash("");
    setModalMode("task");
  }

  function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proofText.trim() && !proofUrl.trim() && !proofFileName) {
      setPayStatus("error");
      setPayNote("Add proof in words, paste a link, or attach a file.");
      return;
    }
    setProofSubmitted(true);
    setPayStatus("success");
    setPayNote("Proof package added. It is ready for requester review and settlement.");
  }

  async function signProof() {
    if (!provider) return connect();
    if (!proofSubmitted || !selectedTask) {
      setPayStatus("error");
      setPayNote("Submit the proof package before signing it.");
      return;
    }
    setPayStatus("loading");
    setPayNote("Review the proof receipt in Nimiq Pay…");
    try {
      const result = await provider.sign(JSON.stringify({
        app: "Ergon", action: "approve-proof", taskId: selectedTask.id, task: selectedTask.title,
        proofRequirement: selectedTask.proof,
        proof: { text: proofText.trim(), url: proofUrl.trim(), file: proofFileName },
        recipient, amountLuna: luna, timestamp: new Date().toISOString(),
      }));
      if (isProviderError(result)) throw new Error(result.error.message);
      setPayStatus("idle");
      setPayNote(`Proof signed • ${result.signature.slice(0, 14)}…`);
    } catch (error) {
      setPayStatus("error");
      setPayNote(message(error));
    }
  }

  async function sendPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTxHash("");
    if (!proofSubmitted || !selectedTask) {
      setPayStatus("error"); setPayNote("Submit the required proof before payment."); return;
    }
    if (!provider || !connected) {
      setPayStatus("error"); setPayNote("Connect Nimiq Pay first."); return;
    }
    if (!/^NQ[0-9A-Z ]{30,44}$/.test(recipient.trim().toUpperCase())) {
      setPayStatus("error"); setPayNote("Enter a valid Nimiq address beginning with NQ."); return;
    }
    if (luna < 1) {
      setPayStatus("error"); setPayNote("Enter an amount greater than zero."); return;
    }
    setPayStatus("loading");
    setPayNote("Confirm the NIM transaction in Nimiq Pay…");
    try {
      const validityStartHeight = await provider.getBlockNumber();
      const result = await provider.sendBasicTransactionWithData({
        recipient: recipient.trim().toUpperCase(), value: luna,
        data: `ERGON:${selectedTask.id.slice(0, 18)}:${selectedTask.title.slice(0, 28)}`,
        validityStartHeight,
      });
      if (isProviderError(result)) throw new Error(result.error.message);
      setTxHash(result);
      setPayStatus("success");
      setPayNote("Payment broadcast. The work is officially done.");
    } catch (error) {
      setPayStatus("error");
      setPayNote(message(error));
    }
  }

  return <main>
    <section className="hero" id="top">
      <nav className="nav shell">
        <a href="#top" aria-label="Ergon home"><Brand /></a>
        <div className="navlinks"><a href="#solution">OUR SOLUTION</a><a href="#how">HOW IT WORKS</a><a href="#tasks">LIVE TASKS</a><a href="#faqs">FAQS</a></div>
        <button className={`pill wallet ${connected ? "connected" : ""}`} onClick={connect} disabled={walletStatus === "loading"}>{walletStatus === "loading" ? "CONNECTING…" : connected ? short(address) : "CONNECT NIMIQ"}</button>
      </nav>
      <div className="heroGrid shell">
        <div className="heroCopy">
          <div className="kicker">ἔργον / WORK MADE VERIFIABLE</div>
          <h1>WORK<br/>ON <i>PROOF</i></h1>
          <p>Post the outcome. Prove the work.<br/>Release the pay—all inside Nimiq Pay.</p>
          <div className="actions"><button className="pill coral" onClick={() => openCreateTask()}>POST A PROOF TASK</button><a href="#how">SEE HOW IT WORKS ↘</a></div>
          {walletNote && <div className={`walletNote ${walletStatus}`} role="status">● {walletNote}</div>}
        </div>
        <div className="heroArt" aria-hidden="true">
          <div className="hello"><small>HELLO, I AM</small><b>Outcome work.</b><em>Not busy work.</em></div>
          <div className="seal"><Image src="/ergon-mark.png" width={78} height={78} alt="" /><span>PROOF<br/>CHECKED</span></div>
          <div className="receipt"><b>PROOF RECEIPT</b><hr/><hr/><hr/><strong>2 NIM</strong></div>
          <div className="pointer">☝</div>
        </div>
      </div>
      {taskUpdate && <div className="taskUpdate shell" role="status"><b>NEW TASK LIVE</b><span>{taskUpdate}</span><button onClick={() => setTaskUpdate("")} aria-label="Dismiss task update">×</button></div>}
      <div className="taskStrip" id="tasks">
        {liveTasks.map((task) => <article className={`taskCard ${task.tone} ${task.posted ? "newTask" : ""}`} key={task.id}>
          <header><span>{task.posted ? "JUST POSTED" : task.label}</span><b>{task.reward}</b></header><h3>{task.title}</h3><div className="proof"><span>PROOF</span><b>{task.proof}</b></div>
          <button onClick={() => openTask(task)}>ADD PROOF & SETTLE ↗</button>
        </article>)}
      </div>
      <div className="ticker"><span>✣ NO BIDDING</span><span>✣ PROOF-FIRST TASKS</span><span>✣ NATIVE NIM PAYMENTS</span><span>✣ SIGNED RECEIPTS</span><span>✣ QUICK TURNAROUND</span></div>
    </section>

    <section className="red" id="solution"><div className="split shell"><div><div className="kicker">THE OUTCOME MARKETPLACE</div><h2>5, 4, 3, 2, 1<br/>That’s how quickly<br/>work gets done.</h2><p>Tiny jobs get lost on freelance platforms. Ergon turns them into clear, claimable outcomes with the proof and payment decided before anyone starts.</p><button className="pill mintPill" onClick={() => openCreateTask()}>CREATE A TASK</button></div><div className="stack"><div className="check white"><i>●</i><h3>REQUESTER DEFINES</h3><ul><li>✓ One clear outcome</li><li>✓ Evidence required</li><li>✓ Deadline and reward</li><li>✓ Release rule</li></ul></div><div className="check black"><i>●</i><h3>CONTRIBUTOR DELIVERS</h3><ul><li>✓ Claims the request</li><li>✓ Submits the proof</li><li>✓ Signs the receipt</li><li>✓ Gets paid in NIM</li></ul></div><span className="stackPointer">☝</span></div></div></section>

    <section className="how" id="how"><div className="howGrid shell"><div className="sheet"><div className="dots">••••••••••••••••••••</div><h3>YOU JUST POSTED AN OUTCOME!</h3>{[["1","Define the finish line","Say exactly what ‘done’ means."],["2","Choose the proof","Words, file, photo, URL or verifier."],["3","Set the NIM reward","The worker sees the value before claiming."],["4","Approve and pay","Nimiq Pay handles the confirmation."]].map(([n,t,d]) => <div className="step" key={n}><b>{n}</b><p><strong>{t}</strong><span>{d}</span></p></div>)}<footer>THANK YOU. HAVE A NICE TASK :)</footer></div><div className="howCopy"><div className="kicker">ONE SMALL FLOW</div><h2>I’m intrigued.<br/>How does<br/>this work?</h2><p>No profiles to polish. No proposals to compare. No vague promises. One outcome, one proof standard, one clean settlement.</p><button className="pill coral" onClick={() => openCreateTask()}>POST YOUR FIRST TASK</button></div></div></section>

    <section className="proofWall"><h2>Proofs? We’ve collected a few ☺</h2><div className="quotes"><blockquote>“I checked the venue queue, sent one photo, and received 2 NIM before I got to my seat.”<span>LOCAL SCOUT</span></blockquote><blockquote>“The task told me what ‘done’ meant before I touched the document. That saved twenty messages.”<span>QUICK CONTRIBUTOR</span></blockquote><blockquote>“The signed receipt makes a tiny payment feel like a finished transaction—not a chat promise.”<span>REQUESTER</span></blockquote></div></section>

    <section className="types"><div className="shell"><div className="kicker center">START WITH A TEMPLATE</div><h2>Pick the outcome. Set the proof.</h2><div className="typeGrid"><article><div className="icon">⌖</div><small>FASTEST TO VERIFY</small><h3>Around me</h3><p>Fresh local facts from people who are already there.</p><ul><li>Queue and venue checks</li><li>Availability and prices</li><li>Accessibility evidence</li></ul><button className="pill mintPill" onClick={() => openCreateTask("AROUND ME")}>POST A LOCAL TASK</button></article><article><div className="icon purple">✦</div><small>DONE FROM A PHONE</small><h3>Quick digital</h3><p>Small knowledge tasks with a concrete handoff.</p><ul><li>Proofread and summarize</li><li>Research and compare</li><li>Clean, edit and review</li></ul><button className="pill mintPill" onClick={() => openCreateTask("FROM MY PHONE")}>POST A DIGITAL TASK</button></article></div><p className="honesty">MVP settlement: direct NIM payment after proof approval. Contract escrow belongs to the future EVM and USDT path.</p></div></section>

    <section className="manifesto"><h2>Speed of a favor.<br/>Clarity of a contract.<br/>Proof of a receipt.</h2><p>Ergon is the tiny outcome layer that makes Nimiq Pay useful before, during and after the payment.</p></section>

    <section className="faq" id="faqs"><div className="faqGrid shell"><h2>Have more<br/>questions?<br/>We’ve got you! <i>☯</i></h2><div>{faqs.map(([q,a],i) => <article key={q}><button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}><span>{openFaq === i ? "−" : "+"}</span>{q}</button>{openFaq === i && <p>{a}</p>}</article>)}</div></div></section>

    <footer className="siteFooter"><div className="footerCard shell"><div><Brand/><h2>Came for the task,<br/>stayed for the proof.</h2><p>Built for the Nimiq Mini Apps Competition · Cycle I</p></div><div className="footerAction"><b>READY TO MAKE WORK VERIFIABLE?</b><button onClick={connect}>{connected ? `CONNECTED • ${short(address)}` : "CONNECT NIMIQ PAY"}<span>→</span></button><small>Wallet access and every payment require native user approval.</small></div></div></footer>

    {modalMode === "create" && <div className="backdrop" onMouseDown={() => setModalMode(null)}><section className="modal createModal" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={e => e.stopPropagation()}><button className="close" aria-label="Close" onClick={() => setModalMode(null)}>×</button><div className="kicker">NEW PROOF-FIRST TASK</div><h2 id="create-title">Post a fresh task.</h2><p>Define the finish line before anyone starts. Every field begins clean, every time.</p><form onSubmit={publishTask}><label>TASK OUTCOME<textarea value={createOutcome} onChange={e => setCreateOutcome(e.target.value)} placeholder="What exactly should be done?" maxLength={120} required/></label><div className="fieldPair"><label>TYPE<select value={createCategory} onChange={e => setCreateCategory(e.target.value)}><option>FROM MY PHONE</option><option>AROUND ME</option><option>AUTO-VERIFIED</option></select></label><label>DEADLINE<select value={createDeadline} onChange={e => setCreateDeadline(e.target.value)}><option>TODAY</option><option>WITHIN 24 HOURS</option><option>THIS WEEK</option></select></label></div><label>PROOF REQUIRED<textarea value={createProof} onChange={e => setCreateProof(e.target.value)} placeholder="Example: corrected PDF plus a short change summary" maxLength={100} required/></label><label>REWARD<div className="amount"><input value={createReward} onChange={e => setCreateReward(e.target.value)} inputMode="decimal" placeholder="0" required/><span>NIM</span></div></label>{createError && <div className="status error" role="alert">{createError}</div>}<button className="primary" type="submit">PUBLISH TO LIVE TASKS</button></form><small className="safety">Competition MVP: newly posted tasks update immediately and persist on this device.</small></section></div>}

    {modalMode === "task" && selectedTask && <div className="backdrop" onMouseDown={() => setModalMode(null)}><section className="modal taskModal" role="dialog" aria-modal="true" aria-labelledby="task-title" onMouseDown={e => e.stopPropagation()}><button className="close" aria-label="Close" onClick={() => setModalMode(null)}>×</button><div className="kicker">{selectedTask.label} · {selectedTask.reward}</div><h2 id="task-title">{selectedTask.title}</h2><div className="requiredProof"><span>REQUESTED PROOF</span><b>{selectedTask.proof}</b></div><form className="proofForm" onSubmit={submitProof}><label>PROOF NOTES<textarea value={proofText} onChange={e => setProofText(e.target.value)} placeholder="Describe what you completed and what the requester should check." maxLength={500}/></label><label>PROOF LINK <small>OPTIONAL</small><input type="url" value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="https://…"/></label><label className="fileField">PHOTO, PDF OR DOCUMENT <small>OPTIONAL</small><input type="file" accept="image/*,.pdf,.doc,.docx" capture="environment" onChange={e => setProofFileName(e.target.files?.[0]?.name || "")}/><span>{proofFileName || "CHOOSE A FILE OR TAKE A PHOTO"}</span></label><button type="submit">{proofSubmitted ? "PROOF PACKAGE UPDATED ✓" : "ADD PROOF PACKAGE"}</button></form>{proofSubmitted && <form className="settlementForm" onSubmit={sendPayment}><div className="settlementTitle"><span>2</span><div><b>APPROVE & SETTLE</b><small>Requester completes this section.</small></div></div><label>CONTRIBUTOR NIMIQ ADDRESS<input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="NQ…" autoCapitalize="characters" spellCheck={false} required/></label><label>REWARD<div className="amount"><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required/><span>NIM</span></div></label><div className="luna">Network value: {luna.toLocaleString()} Luna <span>1 NIM = 100,000 Luna</span></div>{!connected ? <button type="button" className="primary" onClick={connect}>CONNECT NIMIQ PAY</button> : <div className="modalActions"><button type="button" onClick={signProof} disabled={payStatus === "loading"}>SIGN PROOF</button><button className="primary" type="submit" disabled={payStatus === "loading"}>{payStatus === "loading" ? "OPENING WALLET…" : "SEND NIM PAYMENT"}</button></div>}</form>}{(payNote || walletNote) && <div className={`status ${payStatus}`} role="status">{payNote || walletNote}</div>}{txHash && <div className="tx"><b>TRANSACTION HASH</b><code>{txHash}</code></div>}<small className="safety">Ergon never accesses private keys. Nimiq Pay mediates account, signature and transaction requests. Attachments remain local in this MVP; their filename is included in the signed receipt.</small></section></div>}
  </main>;
}