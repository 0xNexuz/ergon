"use client";

import { FormEvent, useMemo, useState } from "react";
import { init, type ErrorResponse, type NimiqProvider } from "@nimiq/mini-app-sdk";

const tasks = [
  ["AROUND ME", "Check the queue at the main entrance", "PHOTO + WAIT TIME", "2 NIM", "orange"],
  ["FROM MY PHONE", "Proofread a one-page CV", "CORRECTED PDF", "8 NIM", "mint"],
  ["AUTO-VERIFIED", "Close GitHub issue #42", "MERGED COMMIT", "20 USDT", "cream"],
  ["AROUND ME", "Confirm wheelchair access", "PHOTO + CHECKLIST", "3 NIM", "green"],
];

const faqs = [
  ["Is Ergon another freelance marketplace?", "No. Ergon is for small, clearly defined outcomes—not profiles, proposals, hourly work, or long projects. A task is claimed, proven, approved, and paid."],
  ["Where does the payment happen?", "NIM payments are requested through the provider injected by Nimiq Pay. The wallet shows its native confirmation screen and keeps the private key outside this Mini App."],
  ["What counts as proof?", "The requester chooses the evidence before publishing: a file, URL, photo, checklist, signed response, or a machine-verifiable event such as a merged commit."],
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

export default function ErgonApp() {
  const [provider, setProvider] = useState<NimiqProvider | null>(null);
  const [address, setAddress] = useState("");
  const [walletStatus, setWalletStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [walletNote, setWalletNote] = useState("");
  const [modal, setModal] = useState(false);
  const [task, setTask] = useState("Check the queue at the main entrance");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("2");
  const [payStatus, setPayStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [payNote, setPayNote] = useState("");
  const [txHash, setTxHash] = useState("");
  const [openFaq, setOpenFaq] = useState(0);
  const luna = useMemo(() => Math.round((Number(amount) || 0) * 100_000), [amount]);
  const connected = walletStatus === "ready" && Boolean(address);

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

  async function signProof() {
    if (!provider) return connect();
    setPayStatus("loading");
    setPayNote("Review the proof receipt in Nimiq Pay…");
    try {
      const result = await provider.sign(JSON.stringify({
        app: "Ergon", action: "approve-proof", task, recipient, amountLuna: luna,
        timestamp: new Date().toISOString(),
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
    if (!provider || !connected) { setPayStatus("error"); setPayNote("Connect Nimiq Pay first."); return; }
    if (!/^NQ[0-9A-Z ]{30,44}$/.test(recipient.trim().toUpperCase())) {
      setPayStatus("error"); setPayNote("Enter a valid Nimiq address beginning with NQ."); return;
    }
    if (luna < 1) { setPayStatus("error"); setPayNote("Enter an amount greater than zero."); return; }
    setPayStatus("loading");
    setPayNote("Confirm the NIM transaction in Nimiq Pay…");
    try {
      const validityStartHeight = await provider.getBlockNumber();
      const result = await provider.sendBasicTransactionWithData({
        recipient: recipient.trim().toUpperCase(), value: luna,
        data: `ERGON:${task.trim().slice(0, 48)}`, validityStartHeight,
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

  function openTask(title: string, reward = "2") {
    setTask(title);
    setAmount(reward);
    setPayStatus("idle");
    setPayNote("");
    setTxHash("");
    setModal(true);
  }

  return <main>
    <section className="hero" id="top">
      <nav className="nav shell">
        <a className="brand" href="#top"><span>ε</span>ERGON</a>
        <div className="navlinks"><a href="#solution">OUR SOLUTION</a><a href="#how">HOW IT WORKS</a><a href="#tasks">LIVE TASKS</a><a href="#faqs">FAQS</a></div>
        <button className={`pill wallet ${connected ? "connected" : ""}`} onClick={connect} disabled={walletStatus === "loading"}>{walletStatus === "loading" ? "CONNECTING…" : connected ? short(address) : "CONNECT NIMIQ"}</button>
      </nav>
      <div className="heroGrid shell">
        <div className="heroCopy">
          <div className="kicker">ἔργον / WORK MADE VERIFIABLE</div>
          <h1>WORK<br/>ON <i>PROOF</i></h1>
          <p>Post the outcome. Prove the work.<br/>Release the pay—all inside Nimiq Pay.</p>
          <div className="actions"><button className="pill coral" onClick={() => openTask("Check the queue at the main entrance")}>POST A PROOF TASK</button><a href="#how">SEE HOW IT WORKS ↘</a></div>
          {walletNote && <div className={`walletNote ${walletStatus}`} role="status">● {walletNote}</div>}
        </div>
        <div className="heroArt" aria-hidden="true">
          <div className="hello"><small>HELLO, I AM</small><b>Outcome work.</b><em>Not busy work.</em></div>
          <div className="seal"><strong>✓</strong><span>PROOF<br/>CHECKED</span></div>
          <div className="receipt"><b>PROOF RECEIPT</b><hr/><hr/><hr/><strong>2 NIM</strong></div>
          <div className="pointer">☝</div>
        </div>
      </div>
      <div className="taskStrip" id="tasks">
        {tasks.map(([label,title,proof,reward,tone]) => <article className={`taskCard ${tone}`} key={title}>
          <header><span>{label}</span><b>{reward}</b></header><h3>{title}</h3><div className="proof"><span>PROOF</span><b>{proof}</b></div>
          <button onClick={() => openTask(title, reward.includes("NIM") ? reward.split(" ")[0] : "2")}>OPEN TASK ↗</button>
        </article>)}
      </div>
      <div className="ticker"><span>✣ NO BIDDING</span><span>✣ PROOF-FIRST TASKS</span><span>✣ NATIVE NIM PAYMENTS</span><span>✣ SIGNED RECEIPTS</span><span>✣ QUICK TURNAROUND</span></div>
    </section>

    <section className="red" id="solution"><div className="split shell"><div><div className="kicker">THE OUTCOME MARKETPLACE</div><h2>5, 4, 3, 2, 1<br/>That’s how quickly<br/>work gets done.</h2><p>Tiny jobs get lost on freelance platforms. Ergon turns them into clear, claimable outcomes with the proof and payment decided before anyone starts.</p><button className="pill mintPill" onClick={() => openTask("Proofread a one-page CV", "8")}>CREATE A TASK</button></div><div className="stack"><div className="check white"><i>●</i><h3>REQUESTER DEFINES</h3><ul><li>✓ One clear outcome</li><li>✓ Evidence required</li><li>✓ Deadline and reward</li><li>✓ Release rule</li></ul></div><div className="check black"><i>●</i><h3>CONTRIBUTOR DELIVERS</h3><ul><li>✓ Claims the request</li><li>✓ Submits the proof</li><li>✓ Signs the receipt</li><li>✓ Gets paid in NIM</li></ul></div><span className="stackPointer">☝</span></div></div></section>

    <section className="how" id="how"><div className="howGrid shell"><div className="sheet"><div className="dots">••••••••••••••••••••</div><h3>YOU JUST POSTED AN OUTCOME!</h3>{[["1","Define the finish line","Say exactly what ‘done’ means."],["2","Choose the proof","File, photo, URL, signature or verifier."],["3","Set the NIM reward","The worker sees the value before claiming."],["4","Approve and pay","Nimiq Pay handles the confirmation."]].map(([n,t,d]) => <div className="step" key={n}><b>{n}</b><p><strong>{t}</strong><span>{d}</span></p></div>)}<footer>THANK YOU. HAVE A NICE TASK :)</footer></div><div className="howCopy"><div className="kicker">ONE SMALL FLOW</div><h2>I’m intrigued.<br/>How does<br/>this work?</h2><p>No profiles to polish. No proposals to compare. No vague promises. One outcome, one proof standard, one clean settlement.</p><button className="pill coral" onClick={() => openTask("Check the queue at the main entrance")}>TRY THE PAYMENT FLOW</button></div></div></section>

    <section className="proofWall"><h2>Proofs? We’ve collected a few ☺</h2><div className="quotes"><blockquote>“I checked the venue queue, sent one photo, and received 2 NIM before I got to my seat.”<span>LOCAL SCOUT</span></blockquote><blockquote>“The task told me what ‘done’ meant before I touched the document. That saved twenty messages.”<span>QUICK CONTRIBUTOR</span></blockquote><blockquote>“The signed receipt makes a tiny payment feel like a finished transaction—not a chat promise.”<span>REQUESTER</span></blockquote></div></section>

    <section className="types"><div className="shell"><div className="kicker center">START WITH A TEMPLATE</div><h2>Pick the outcome. Set the proof.</h2><div className="typeGrid"><article><div className="icon">⌖</div><small>FASTEST TO VERIFY</small><h3>Around me</h3><p>Fresh local facts from people who are already there.</p><ul><li>Queue and venue checks</li><li>Availability and prices</li><li>Accessibility evidence</li></ul><button className="pill mintPill" onClick={() => openTask("Check the queue at the main entrance")}>POST A LOCAL TASK</button></article><article><div className="icon purple">✦</div><small>DONE FROM A PHONE</small><h3>Quick digital</h3><p>Small knowledge tasks with a concrete handoff.</p><ul><li>Proofread and summarize</li><li>Research and compare</li><li>Clean, edit and review</li></ul><button className="pill mintPill" onClick={() => openTask("Proofread a one-page CV", "8")}>POST A DIGITAL TASK</button></article></div><p className="honesty">MVP settlement: direct NIM payment after proof approval. Contract escrow belongs to the future EVM and USDT path.</p></div></section>

    <section className="manifesto"><h2>Speed of a favor.<br/>Clarity of a contract.<br/>Proof of a receipt.</h2><p>Ergon is the tiny outcome layer that makes Nimiq Pay useful before, during and after the payment.</p></section>

    <section className="faq" id="faqs"><div className="faqGrid shell"><h2>Have more<br/>questions?<br/>We’ve got you! <i>☯</i></h2><div>{faqs.map(([q,a],i) => <article key={q}><button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}><span>{openFaq === i ? "−" : "+"}</span>{q}</button>{openFaq === i && <p>{a}</p>}</article>)}</div></div></section>

    <footer className="siteFooter"><div className="footerCard shell"><div><div className="brand"><span>ε</span>ERGON</div><h2>Came for the task,<br/>stayed for the proof.</h2><p>Built for the Nimiq Mini Apps Competition · Cycle I</p></div><div className="footerAction"><b>READY TO MAKE WORK VERIFIABLE?</b><button onClick={connect}>{connected ? `CONNECTED • ${short(address)}` : "CONNECT NIMIQ PAY"}<span>→</span></button><small>Wallet access and every payment require native user approval.</small></div></div></footer>

    {modal && <div className="backdrop" onMouseDown={() => setModal(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-title" onMouseDown={e => e.stopPropagation()}><button className="close" aria-label="Close" onClick={() => setModal(false)}>×</button><div className="kicker">LIVE NIMIQ PAYMENT FLOW</div><h2 id="pay-title">Approve proof.<br/>Pay the worker.</h2><p>This sends a real basic NIM transaction with an Ergon task reference. Nothing moves until you approve it in Nimiq Pay.</p><form onSubmit={sendPayment}><label>TASK OUTCOME<input value={task} onChange={e => setTask(e.target.value)} maxLength={80} required/></label><label>CONTRIBUTOR NIMIQ ADDRESS<input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="NQ…" autoCapitalize="characters" spellCheck={false} required/></label><label>REWARD<div className="amount"><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required/><span>NIM</span></div></label><div className="luna">Network value: {luna.toLocaleString()} Luna <span>1 NIM = 100,000 Luna</span></div>{!connected ? <button type="button" className="primary" onClick={connect}>CONNECT NIMIQ PAY</button> : <div className="modalActions"><button type="button" onClick={signProof} disabled={payStatus === "loading"}>SIGN PROOF</button><button className="primary" type="submit" disabled={payStatus === "loading"}>{payStatus === "loading" ? "OPENING WALLET…" : "SEND NIM PAYMENT"}</button></div>}</form>{(payNote || walletNote) && <div className={`status ${payStatus}`} role="status">{payNote || walletNote}</div>}{txHash && <div className="tx"><b>TRANSACTION HASH</b><code>{txHash}</code></div>}<small className="safety">Ergon never accesses private keys. Nimiq Pay mediates account, signature and transaction requests.</small></section></div>}
  </main>;
}
