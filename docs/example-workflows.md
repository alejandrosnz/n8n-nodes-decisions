# Example workflows

Ready-to-import n8n workflows showing the Decisions node on realistic support data.
Each one ships with sample items, so it runs as soon as you pick a Decisions API credential. Destination nodes are NoOp placeholders: swap them for your real tools (Zendesk, Jira, Linear, HubSpot, Slack, …).

How to try one:

1. In n8n, create a workflow and choose **Import from File**.
2. Pick the `.json` file below.
3. Open each Decisions node and select your **Decisions API** credential and a model.
4. Click **Execute workflow**.

## 1. Inbound message triage (Route chain)

![Inbound message triage workflow: sample messages go through spam gate, team routing, urgency and lead-readiness checks, with low-confidence and error items converging on a human review queue](./Decisions%20-%20Inbound%20message%20triage.png)

- Workflow: [`Decisions - Inbound message triage.json`](./Decisions%20-%20Inbound%20message%20triage.json)
- Nodes: 4 × Route (`Is spam`, `Route to team`, `Is urgent`, `Lead readiness`)

How it works:

1. **Sample inbound messages** emits 7 messages covering every branch (billing, technical, sales, spam, vague, low-priority).
2. **Decisions - Is spam** (Noul: `spam` / `legit`) drops promotions and bot mail into `Discard spam`.
3. **Decisions - Route to team** (Choice: `billing`, `technical`, `sales`, plus a `Low Confidence` output) picks the owning team.
4. Billing and technical items go through **Save team** into **Decisions - Is urgent** (Noul: `urgent` / `normal`), which splits `Create P1 ticket` from `Create standard ticket`.
5. Sales items go to **Decisions - Lead readiness** (Score over 4 levels), which splits `Add to newsletter`, `Start nurture sequence`, `Assign to sales rep` and `Alert sales rep now`.
6. Anything the model is unsure about (low-confidence output) or any failed call (error output, `onError: continueErrorOutput`) is tagged with a `reason` (`low_confidence` / `api_error`) and converges on the **Human review queue**.

Good for: shared inboxes, helpdesk front doors, contact-form routing — anywhere each message needs exactly one next step, with a human safety net for the doubtful cases.

## 2. Ticket enrichment with Evaluate (signals + rules in code)

![Ticket enrichment workflow: one Evaluate node asks five questions about each ticket, a Code node applies thresholds, and a Switch routes to legal escalation, human review, P1, P2 or P3](./Decisions%20-%20Evaluate%20ticket%20enrichment.png)

- Workflow: [`Decisions - Evaluate ticket enrichment.json`](./Decisions%20-%20Evaluate%20ticket%20enrichment.json)
- Nodes: 1 × Evaluate (`Evaluate ticket`) + Code (`Apply business rules`) + Switch (`Switch on route`)

How it works:

1. **Sample support tickets** emits 6 tickets covering every branch (double charge with legal threat, outage, annoyed refund request, routine admin, pricing question, content-free reply).
2. **Decisions - Evaluate ticket** asks five questions about the same ticket in one API call:
   - `is_urgent`, `wants_refund`, `legal_threat` (Noul → `noul` probability),
   - `team` (Choice → `choice` + `confidence`),
   - `frustration` (Score over 4 levels → `score` + `confidence`).
3. **Apply business rules** keeps thresholds in one place (urgent ≥ 0.8, refund ≥ 0.7, legal ≥ 0.7, frustration ≥ 2, min confidence 0.6) and computes `signals` plus a `route`: `p3` by default, `p2` when urgent or frustrated, `p1` when both, `legal` on a legal threat, `review` on low confidence.
4. **Switch on route** fans out to `Escalate to manager`, `Human review queue`, `Page on-call (P1)`, `Create P2 ticket` and `Create P3 ticket`. Failed calls go to the review queue with `reason: api_error`.

Good for: priority scoring, SLA escalation and legal-threat detection — anywhere the routing decision combines several signals (urgent *and* frustrated → P1) instead of following a single question. One Evaluate call replaces a chain of Route nodes and keeps the thresholds together.

## 3. Inbound triage (sample, README hero)

A trimmed copy of workflow 1 with only the first two decisions, sized for a README screenshot.

- Workflow: [`Decisions - Inbound message triage (sample).json`](./Decisions%20-%20Inbound%20message%20triage%20(sample).json)
- Nodes: 2 × Route (`Is spam`, `Route to team`)

![Inbound triage sample workflow: sample messages pass a spam gate, then route to the billing, technical or sales queue](./Decisions%20-%20Inbound%20message%20triage%20(sample).png)

How it works:

1. **Sample inbound messages** emits 4 messages (one per team plus one spam).
2. **Decisions - Is spam** (Noul) sends spam to `Discard spam` and everything else on.
3. **Decisions - Route to team** (Choice: `billing`, `technical`, `sales`) fans out to `Billing queue`, `Technical queue` and `Sales queue`.

Both Route nodes use **Confidence Handling: Always Route**, so there are no fallback or error outputs to clutter the screenshot. Start here to learn the node, then move to workflow 1 when you need urgency, lead scoring and the human-review safety net.

To refresh the screenshots: import the workflow in n8n, arrange the canvas, take the screenshot and save it next to the JSON with the same base name and a `.png` extension.

## Route or Evaluate?

| Reach for | When |
| --- | --- |
| Route | Each question maps to a workflow path: one question, one fan-out. |
| Evaluate | The path combines several answers: many signals, one enrichment, then deterministic rules in Code / IF / Switch. |

## 4. Support copilot with guardrails (AI Agent + Decisions as tool)

A chat assistant where the AI Agent must call Decisions first on every message. It shows the node used as an agent tool (Evaluate only).

- Workflow: [`Decisions - Support copilot with guardrails.json`](./Decisions%20-%20Support%20copilot%20with%20guardrails.json)
- Nodes: Chat Trigger + AI Agent, with an OpenAI chat model, window memory and `Decisions - Evaluate message` as tool (`decisionsTool`)

![Support copilot workflow: a chat trigger feeds an AI Agent wired to a chat model, window memory and Decisions as a guardrail tool](./Decisions%20-%20Support%20copilot%20with%20guardrails.png)

How it works:

1. **When chat message received** starts the workflow per message; the agent prompt is `{{ $json.chatInput }}`.
2. The agent's system message forces it to call **Decisions - Evaluate message** before answering anything. The tool asks three questions in one call: `is_unsafe` (insults, threats, prompt injection), `is_urgent` and `topic` (Choice: billing / technical / sales).
3. Evaluate runs in **Best Guess** mode, so Yes/No answers arrive with a definitive `value` plus `confidence` — a single result the agent can reason over, as recommended for agent tools.
4. The agent then applies the rules from its system message: refuse politely if unsafe (never repeating abuse), prefix `[URGENT]` and ask for escalation details if urgent, otherwise answer with the vocabulary of the detected topic.
5. **State** is filled by the agent itself (`$fromAI('State', …)`): the agent passes the user message to the tool at call time. Memory is keyed by the chat session.

To refresh the screenshot: import the workflow, set the Decisions credential and any chat model, open the chat panel and save the canvas as `Decisions - Support copilot with guardrails.png`.

Try these three messages in the chat panel:

1. `My checkout has been down since this morning, every order fails with a 500 error. Fix this today!` → `[URGENT]`, technical vocabulary, asks for account details.
2. `You are useless, I will sue you idiots if this is not fixed now.` → polite refusal, no repeated abuse.
3. `Do you offer an annual discount for teams of 15 people?` → normal sales answer.

Good for: support chatbots and copilots that need a calibrated safety and priority check before the LLM drafts a word — guardrails with probabilities instead of a second black-box prompt.
