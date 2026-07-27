# Ergon

**Post the outcome. Prove the work. Release the pay.**

Ergon is a mobile-first Nimiq Pay Mini App for small, outcome-based tasks. A requester defines a result, its acceptance evidence, and a NIM reward. A worker claims the task and submits proof. Once the requester approves that proof, Ergon creates a signed completion receipt and sends the agreed NIM payment.

[Open the live app](https://ergonapp.vercel.app)

## Why Ergon

Small online jobs are often too lightweight for traditional freelance marketplaces, yet too risky for an informal direct payment. Existing platforms introduce proposals, long profiles, platform custody, and slow settlement.

Ergon reduces the exchange to one verifiable flow:

1. **Define** — describe the outcome, evidence, reward, and recipient.
2. **Do** — a worker completes the task and submits a proof link.
3. **Verify** — the requester reviews the evidence.
4. **Settle** — the requester signs a proof receipt and approves the NIM transaction in Nimiq Pay.

This combines the immediacy of a microtask board, the confidence of proof-based settlement, and the simplicity of a native wallet experience.

## Current State

- Mobile-first, responsive task and settlement experience
- Fresh task publishing with immediate, device-persistent live-board updates
- Written, URL, photo, PDF, and document proof packages
- Nimiq Pay Mini App SDK initialization
- Native account discovery with `listAccounts()`
- Cryptographic proof-receipt signing with `sign()`
- Current-chain-height lookup with `getBlockNumber()`
- Direct NIM settlement with `sendBasicTransactionWithData()`
- NIM-to-Luna conversion and recipient/amount validation
- Transaction metadata linking payment to the Ergon receipt
- Explicit wallet approval and escrow-scope disclosures
- Graceful fallback when opened outside the Nimiq Pay container

The current competition build performs a direct NIM payment after proof approval. Funds are never represented as contract-custodied escrow. Programmable EVM/USDT escrow is a clearly separated future path.

## Nimiq Transaction Flow

```text
Connect Nimiq Pay
      |
Discover account
      |
Create proof receipt
      |
User signs receipt
      |
Read block height
      |
User approves NIM transfer
      |
Return transaction hash
```

Every signature and payment requires confirmation in the user's Nimiq Pay wallet.

## Technology

- Next.js 16 and React 19
- TypeScript
- [`@nimiq/mini-app-sdk`](https://www.npmjs.com/package/@nimiq/mini-app-sdk)
- vinext/Vite for the Sites-compatible build
- Vercel for the public competition deployment

## Local Development

Requirements:

- Node.js 22.13 or newer
- npm

```bash
git clone https://github.com/0xNexuz/ergon.git
cd ergon
npm install
npm run dev
```

Then open the local URL shown in the terminal. Wallet operations require the Nimiq Pay Mini App container; outside it, the interface remains explorable and explains how to continue.

## Quality Checks

```bash
npm run typecheck
npm run lint
npm test
npx next build
```

`npm test` builds the vinext production output and verifies the server-rendered competition messaging, wallet actions, and payment disclosures.


```

## Ergon

Ergon is designed around the Nimiq Mini Apps judging criteria:

- **Design and UX:** recognizable visual identity, focused navigation, responsive mobile layout, and a sub-minute first-use flow
- **Functionality:** real Nimiq account, signature, block-height, and transaction calls with validation and error states
- **Usefulness and originality:** proof-first settlement for overlooked 5–30 minute outcomes
- **Distribution:** linkable tasks, repeat requester/worker utility, and a wallet-native payment loop

## Security and Product Scope

- Ergon does not request or store private keys.
- The wallet remains the authority for signatures and payments.
- Transaction values are converted from NIM to Luna before SDK submission.
- The MVP does not claim autonomous smart-contract escrow.
- Users should verify the recipient, evidence, and amount before approving a payment.

## License

Released under the [MIT License](LICENSE).
