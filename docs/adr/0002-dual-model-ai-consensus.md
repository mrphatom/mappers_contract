# ADR 0002: Dual-Model AI Consensus (Gemini + Claude)

## Status
Accepted

## Context
The protocol needs to autonomously judge whether a freelance deliverable meets acceptance criteria, without a human in the loop for the common case. A single-model verification pipeline was the initial design.

## Decision
Require independent, parallel evaluation from two models with no shared context (Gemini and Claude), and only execute an autonomous settlement when both agree above a confidence threshold. Disagreement or sub-threshold confidence escalates to human arbitration rather than picking a side.

## Rationale
A single model create a single point of failure — both technically (one exploitable prompt-injection vector) and epistemically (one model's systematic bias or blind spot decides real fund movement unilaterally). Two independent models raise the bar for manipulation and reduce the odds that a single hallucination triggers an incorrect on-chain settlement.

## Consequences
- Roughly 2x the AI API cost per verification compared to single-model.
- Adds latency (parallel calls still bound by the slower of the two responses).
- Introduces a meaningful ESCALATE path — the protocol must have a functioning human arbitration flow, not just an automated one, or a nontrivial fraction of jobs will stall. This is currently the oracle authority keypair signing manually; multisig arbitration is tracked as pre-mainnet work.
- The threshold values (0.80 approve / 0.75 reject) are currently static constants, not on-chain governable — a future version may need these configurable per-job or per-category of work.
