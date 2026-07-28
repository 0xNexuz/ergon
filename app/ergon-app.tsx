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
  const [boardStatus, setBoardStatus] = useState<"loading" | "live" | "error">("loading");
  const [boardNote, setBoardNote] = useState("CONNECTING TO THE SHARED BOARD…");
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
    let active = true;
    let loadedOnce = false;
    const knownTaskIds = new Set<string>();

    async function refreshSharedTasks() {
      try {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        const data = await response.json() as { tasks?: LiveTask[]; error?: string };
        if (!response.ok || !Array.isArray(data.tasks)) {
          throw new Error(data.error || "The shared task board is unavailable.");
        }
        if (!active) return;

        if (loadedOnce) {
          const newest = data.tasks.find((task) => !knownTaskIds.has(task.id));
          if (newest) setTaskUpdate(`“${newest.title}” was just posted · ${newest.reward}`);
        }
        knownTaskIds.clear();
        data.tasks.forEach((task) => knownTaskIds.add(task.id));
        loadedOnce = true;

        setLiveTasks([...data.tasks, ...INITIAL_TASKS]);
        setSelectedTask((current) => {
          if (!current?.posted) return current;
          return data.tasks?.find((task) => task.id === current.id) ?? current;
        });
        setBoardStatus("live");
        setBoardNote("SHARED LIVE BOARD · SYNCED ACROSS DEVICES");
      } catch (error) {
        if (!active) return;
        setBoardStatus("error");
        setBoardNote(message(error));
      }
    }

    void refreshSharedTasks();
    const refreshTimer = window.setInterval(refreshSharedTasks, 5_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshSharedTasks();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  async function mutateSharedTask(payload: Record<string, unknown>) {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as { task?: LiveTask; error?: string };
    if (!response.ok || !data.task) {
      throw new Error(data.error || "The shared task board could not be updated.");
    }
    setLiveTasks((current) => {
      const exists = current.some((task) => task.id === data.task?.id);
      return exists
        ? current.map((task) => task.id === data.task?.id ? data.task! : task)
        : [data.task!, ...current];
    });
    setSelectedTask((current) => current?.id === data.task?.id ? data.task! : current);
    setBoardStatus("live");
    setBoardNote("SHARED LIVE BOARD · SYNCED ACROSS DEVICES");
    return data.task;
  }

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

  async function publishTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected) {
      setCreateError("Connect Nimiq Pay first. The connected wallet becomes the requester and is the only wallet allowed to approve payment.");
      return;
    }
    const reward = Number(createReward);
    if (!createOutcome.trim() || !createProof.trim() || !Number.isFinite(reward) || reward <= 0) {
      setCreateError("Add an outcome, a proof requirement, and a reward greater than zero.");
      return;
    }

    setCreateError("");
    setBoardStatus("loading");
    setBoardNote("PUBLISHING TO THE SHARED BOARD…");
    try {
      const tones: Tone[] = ["orange", "mint", "cream", "green"];
      const created = await mutateSharedTask({
        action: "create",
        label: createCategory,
        title: createOutcome.trim(),
        proof: createProof.trim(),
        reward,
        tone: tones[Math.floor(Math.random() * tones.length)],
        requester: normalizeAddress(address),
        deadline: createDeadline,
      });
      setTaskUpdate(`“${created.title}” is now live for every Ergon visitor · ${created.deadline} · ${created.reward}`);
      setModalMode(null);
      window.setTimeout(() => document.getElementById("tasks")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (error) {
      setBoardStatus("error");
      setBoardNote(message(error));
      setCreateError(message(error));
    }
  }

  function openTask(task: LiveTask) {
    setSelectedTask(task);
    setProofText(task.submission?.text || "");
    setProofUrl(task.submission?.url || "");
    setProofFileName(task.submission?.file || "");
    setPayStatus("idle");
    setPayNote("");
    setTxHash(task.txHash || "");
    setModalMode("task");
  }

  async function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask) return;
    if (!connected) {
      setPayStatus("error");
      setPayNote("Connect Nimiq Pay first. Your connected wallet will be recorded as the contributor.");
      return;
    }
    if (!selectedTask.posted) {
      setPayStatus("error");
      setPayNote("This is a task template. Post a shared task from it before submitting proof.");
      return;
    }
    if (!canSubmitProof(selectedTask, address)) {
      setPayStatus("error");
      setPayNote(selectedRole === "requester"
        ? "You posted this task. A different contributor wallet must submit the work."
        : "This task already has a contributor submission.");
      return;
    }
    if (!proofText.trim() && !proofUrl.trim() && !proofFileName) {
      setPayStatus("error");
      setPayNote("Add proof in words, paste a link, or attach a file.");
      return;
    }

    setPayStatus("loading");
    setPayNote("Adding proof to the shared task record…");
    try {
      await mutateSharedTask({
        action: "submit-proof",
        id: selectedTask.id,
        contributor: normalizeAddress(address),
        text: proofText.trim(),
        url: proofUrl.trim(),
        file: proofFileName,
      });
      setPayStatus("success");
      setPayNote("Proof package is shared. Sign it to send a wallet-authenticated receipt to the requester—this does not move any NIM.");
    } catch (error) {
      setPayStatus("error");
      setPayNote(message(error));
    }
  }

  async function signProof() {
    if (!provider) return connect();
    if (!selectedTask || !canSignProof(selectedTask, address) || !selectedTask.submission) {
      setPayStatus("error");
      setPayNote("Only the contributor wallet that submitted this proof can sign it.");
      return;
    }
    setPayStatus("loading");
    setPayNote("Review the proof receipt in Nimiq Pay. This is a signature, not a payment…");
    try {
      const result = await provider.sign(JSON.stringify({
        app: "Ergon",
        action: "submit-proof",
        taskId: selectedTask.id,
        task: selectedTask.title,
        proofRequirement: selectedTask.proof,
        proof: {
          text: selectedTask.submission.text,
          url: selectedTask.submission.url,
          file: selectedTask.submission.file,
        },
        contributor: normalizeAddress(address),
        reward: selectedTask.reward,
        timestamp: selectedTask.submission.submittedAt,
      }));
      if (isProviderError(result)) throw new Error(result.error.message);
      await mutateSharedTask({
        action: "sign-proof",
        id: selectedTask.id,
        contributor: normalizeAddress(address),
        signature: result.signature,
        publicKey: result.publicKey,
      });
      setPayStatus("success");
      setPayNote(`Proof signed • ${result.signature.slice(0, 14)}… Awaiting requester approval. You will not be asked to pay.`);
    } catch (error) {
      setPayStatus("error");
      setPayNote(message(error));
    }
  }

  async function sendPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTxHash("");
    if (!selectedTask || !canSettleTask(selectedTask, address)) {
      setPayStatus("error");
      setPayNote("Only the wallet that posted this task can approve and pay its signed contributor.");
      return;
    }
    if (!provider || !connected) {
      setPayStatus("error");
      setPayNote("Connect the requester wallet in Nimiq Pay first.");
      return;
    }
    if (!/^NQ[0-9A-Z ]{30,44}$/.test(recipient.trim().toUpperCase())) {
      setPayStatus("error");
      setPayNote("The contributor wallet address is invalid.");
      return;
    }
    if (luna < 1) {
      setPayStatus("error");
      setPayNote("The task reward must be greater than zero.");
      return;
    }
    setPayStatus("loading");
    setPayNote("Requester: confirm the NIM payment to the contributor in Nimiq Pay…");
    try {
      const validityStartHeight = await provider.getBlockNumber();
      const result = await provider.sendBasicTransactionWithData({
        recipient: recipient.trim().toUpperCase(),
        value: luna,
        data: `ERGON:${selectedTask.id.slice(0, 18)}:${selectedTask.title.slice(0, 28)}`,
        validityStartHeight,
      });
      if (isProviderError(result)) throw new Error(result.error.message);
      await mutateSharedTask({
        action: "mark-paid",
        id: selectedTask.id,
        requester: normalizeAddress(address),
        transactionHash: result,
      });
      setTxHash(result);
      setPayStatus("success");
      setPayNote("Payment broadcast by the requester. The contributor has been paid.");
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
      <div className={`boardStatus shell ${boardStatus}`} role="status"><b>{boardStatus === "live" ? "● LIVE" : boardStatus === "loading" ? "◌ SYNCING" : "! OFFLINE"}</b><span>{boardNote}</span></div>
      <div className="taskStrip" id="tasks">
        {liveTasks.map((task) => <article className={`taskCard ${task.tone} ${task.posted ? "newTask" : ""}`} key={task.id}>
          <header><span>{task.posted ? "JUST POSTED" : task.label}</span><b>{task.reward}</b></header><h3>{task.title}</h3><div className="proof"><span>PROOF</span><b>{task.proof}</b></div>
          <button onClick={() => task.posted ? openTask(task) : openCreateTask(task.label)}>{!task.posted
            ? "USE AS A TASK TEMPLATE ↗"
            : taskStatus(task) === "paid"
              ? "PAID • VIEW RECEIPT ↗"
              : taskStatus(task) === "proof-submitted"
                ? (taskRole(task, address) === "requester" ? "REVIEW PROOF & PAY ↗" : "PROOF AWAITING REVIEW ↗")
                : (taskRole(task, address) === "requester" ? "VIEW YOUR TASK ↗" : "DO TASK & ADD PROOF ↗")}</button>
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

    {modalMode === "create" && <div className="backdrop" onMouseDown={() => setModalMode(null)}><section className="modal createModal" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={e => e.stopPropagation()}><button className="close" aria-label="Close" onClick={() => setModalMode(null)}>×</button><div className="kicker">NEW PROOF-FIRST TASK</div><h2 id="create-title">Post a fresh task.</h2><p>Define the finish line before anyone starts. Every field begins clean, every time.</p><form onSubmit={publishTask}><label>TASK OUTCOME<textarea value={createOutcome} onChange={e => setCreateOutcome(e.target.value)} placeholder="What exactly should be done?" maxLength={120} required/></label><div className="fieldPair"><label>TYPE<select value={createCategory} onChange={e => setCreateCategory(e.target.value)}><option>FROM MY PHONE</option><option>AROUND ME</option><option>AUTO-VERIFIED</option></select></label><label>DEADLINE<select value={createDeadline} onChange={e => setCreateDeadline(e.target.value)}><option>TODAY</option><option>WITHIN 24 HOURS</option><option>THIS WEEK</option></select></label></div><label>PROOF REQUIRED<textarea value={createProof} onChange={e => setCreateProof(e.target.value)} placeholder="Example: corrected PDF plus a short change summary" maxLength={100} required/></label><label>REWARD<div className="amount"><input value={createReward} onChange={e => setCreateReward(e.target.value)} inputMode="decimal" placeholder="0" required/><span>NIM</span></div></label>{createError && <div className="status error" role="alert">{createError}</div>}<button className="primary" type="submit">PUBLISH TO LIVE TASKS</button></form><small className="safety">Shared competition board: newly posted tasks sync across browsers and devices within seconds.</small></section></div>}

    {modalMode === "task" && selectedTask && <div className="backdrop" onMouseDown={() => setModalMode(null)}>
      <section className="modal taskModal" role="dialog" aria-modal="true" aria-labelledby="task-title" onMouseDown={e => e.stopPropagation()}>
        <button className="close" aria-label="Close" onClick={() => setModalMode(null)}>×</button>
        <div className="kicker">{selectedTask.label} · {selectedTask.reward} · {selectedStatus.replace("-", " ").toUpperCase()}</div>
        <h2 id="task-title">{selectedTask.title}</h2>
        <div className="requiredProof"><span>REQUESTED PROOF</span><b>{selectedTask.proof}</b></div>

        {!connected && <div className="status idle" role="status">
          <b>CONNECT TO CHOOSE YOUR ROLE</b><br/>
          The posting wallet is the requester. A different wallet completes and signs the work.
          <button type="button" className="primary" onClick={connect}>CONNECT NIMIQ PAY</button>
        </div>}

        {connected && <div className="status idle" role="status">
          CONNECTED AS <b>{selectedRole.toUpperCase()}</b> · {short(address)}
        </div>}

        {connected && selectedStatus === "open" && selectedRole === "requester" && <div className="status success" role="status">
          <b>YOUR TASK IS LIVE</b><br/>
          A contributor must complete it with a different wallet. You will only see the payment action after that contributor submits and signs proof.
        </div>}

        {connected && canSubmitProof(selectedTask, address) && <form className="proofForm" onSubmit={submitProof}>
          <div className="settlementTitle"><span>1</span><div><b>CONTRIBUTOR: ADD PROOF</b><small>Submitting and signing never sends NIM.</small></div></div>
          <label>PROOF NOTES<textarea value={proofText} onChange={e => setProofText(e.target.value)} placeholder="Describe what you completed and what the requester should check." maxLength={500}/></label>
          <label>PROOF LINK <small>OPTIONAL</small><input type="url" value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="https://…"/></label>
          <label className="fileField">PHOTO, PDF OR DOCUMENT <small>OPTIONAL</small><input type="file" accept="image/*,.pdf,.doc,.docx" capture="environment" onChange={e => setProofFileName(e.target.files?.[0]?.name || "")}/><span>{proofFileName || "CHOOSE A FILE OR TAKE A PHOTO"}</span></label>
          <button type="submit">ADD PROOF PACKAGE</button>
        </form>}

        {selectedTask.submission && selectedStatus !== "paid" && <div className="requiredProof">
          <span>CONTRIBUTOR PROOF · {short(selectedTask.submission.contributor)}</span>
          <b>{selectedTask.submission.text || selectedTask.submission.url || selectedTask.submission.file}</b>
          {selectedTask.submission.url && <small>{selectedTask.submission.url}</small>}
          {selectedTask.submission.file && <small>ATTACHMENT: {selectedTask.submission.file}</small>}
        </div>}

        {connected && canSignProof(selectedTask, address) && <div className="settlementForm">
          <div className="settlementTitle"><span>2</span><div><b>CONTRIBUTOR: SIGN & SUBMIT</b><small>This creates a proof receipt. It is not a payment.</small></div></div>
          <button type="button" className="primary" onClick={signProof} disabled={payStatus === "loading"}>{payStatus === "loading" ? "OPENING SIGNATURE…" : "SIGN PROOF — NO PAYMENT"}</button>
        </div>}

        {connected && selectedRole === "contributor" && Boolean(selectedTask.submission?.signature) && selectedStatus === "proof-submitted" && <div className="status success" role="status">
          <b>PROOF SENT</b><br/>
          Only the original requester can approve and pay. Your contributor wallet will not be charged.
        </div>}

        {connected && selectedRole === "requester" && selectedStatus === "proof-submitted" && !selectedTask.submission?.signature && <div className="status idle" role="status">
          The contributor has added proof but has not signed the receipt yet. Payment stays unavailable.
        </div>}

        {connected && canSettleTask(selectedTask, address) && <form className="settlementForm" onSubmit={sendPayment}>
          <div className="settlementTitle"><span>3</span><div><b>REQUESTER: APPROVE & PAY</b><small>Only the wallet that posted this task can complete this section.</small></div></div>
          <label>CONTRIBUTOR NIMIQ ADDRESS<input value={recipient} readOnly aria-readonly="true"/></label>
          <label>AGREED REWARD<div className="amount"><input value={amount} readOnly aria-readonly="true"/><span>NIM</span></div></label>
          <div className="luna">Network value: {luna.toLocaleString()} Luna <span>1 NIM = 100,000 Luna</span></div>
          <button className="primary" type="submit" disabled={payStatus === "loading"}>{payStatus === "loading" ? "OPENING REQUESTER WALLET…" : "APPROVE & PAY CONTRIBUTOR"}</button>
        </form>}

        {connected && selectedStatus === "proof-submitted" && selectedRole === "viewer" && <div className="status idle" role="status">
          This task already has a contributor. Only that contributor can sign its proof, and only the original requester can pay.
        </div>}

        {selectedStatus === "paid" && <div className="settlementForm">
          <div className="settlementTitle"><span>✓</span><div><b>TASK PAID</b><small>Requester-to-contributor settlement completed.</small></div></div>
          <label>CONTRIBUTOR<input value={recipient} readOnly aria-readonly="true"/></label>
          <label>REWARD<div className="amount"><input value={amount} readOnly aria-readonly="true"/><span>NIM</span></div></label>
          {selectedTask.txHash && <div className="tx"><b>TRANSACTION HASH</b><code>{selectedTask.txHash}</code></div>}
        </div>}

        {(payNote || walletNote) && <div className={"status " + payStatus} role="status">{payNote || walletNote}</div>}
        {txHash && selectedStatus !== "paid" && <div className="tx"><b>TRANSACTION HASH</b><code>{txHash}</code></div>}
        <small className="safety">Role protection is wallet-based: contributor proof signatures never move funds, and payment is exposed only to the recorded requester wallet. Proof text, links, signatures, and attachment names sync across devices; use a proof link when the file itself must be shared.</small>
      </section>
    </div>}
  </main>;
}