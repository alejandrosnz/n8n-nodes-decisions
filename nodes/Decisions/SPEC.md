# Decisions node — specification

Normative specification for the `Decisions` n8n community node. Every
requirement is stated so that an implementation can be checked against it.

- **MUST** / **MUST NOT** — required; a violation is a defect.
- **SHOULD** — strong default; deviation needs a recorded reason.
- **MAY** — permitted.

This document specifies *what the node does* for the person using it. It does
not name internal parameters, files or functions; those belong to the
implementation.

Names shown in code formatting are the TypeSafe API's own, reproduced from
<https://docs.typesafe.ai/api>, or keys of the node's output.

---

## 1. Scope

A single node exposing two operations:

| Operation | Purpose |
| --- | --- |
| Evaluate | Evaluate one state against one or more typed questions. One main output. |
| Route | Evaluate one state against a single Choice, Noul or Score question and send the item to the matching output. Dynamic outputs. |

---

## 2. Package

| Field | Value |
| --- | --- |
| `name` | `n8n-nodes-decisions` |
| `license` | `MIT` |
| `author.name` | `Alejandro Sanz` |
| `author.email` | `alxbck1@gmail.com` |
| `repository.type` | `git` |
| `repository.url` | `git+https://github.com/alejandrosnz/n8n-nodes-decisions.git` |
| `homepage` | `https://github.com/alejandrosnz/n8n-nodes-decisions#readme` |
| `bugs.url` | `https://github.com/alejandrosnz/n8n-nodes-decisions/issues` |
| `keywords` | MUST include `n8n-community-node-package` |
| `files` | `["dist"]` |

Requirements:

1. `dependencies` MUST be absent or `{}`.
2. `peerDependencies` MUST be exactly `{ "n8n-workflow": "*" }`.
3. The package MUST ship no third-party runtime code. Modules on n8n's import
   allowlist — `zod`, `p-limit`, `lodash`, `moment`, `luxon` — MUST NOT be used
   either.
4. There MUST be no `preinstall` or `postinstall` script.
5. The `n8n` section MUST register the node and the credential from their built
   locations, and MUST NOT retain the scaffold's example entries.
6. `n8n.strict` MUST be `true`.
7. The package MUST be published from GitHub Actions with an npm provenance
   statement. The job holding the publish rights MUST publish a tarball built
   by an earlier job, and MUST NOT install or run dependency code.
8. A release MUST be triggered by a tag equal to the `package.json` version,
   on a commit that is on `main`.
9. The repository MUST be public, `repository.url` MUST resolve to it, and the
   npm publisher MUST match the repository owner.

Dev dependencies are exempt from rules 1–3.

---

## 3. Credential

Identified as `decisionsApi` and displayed as **Decisions API**.
Documentation link: `https://docs.typesafe.ai`. It MUST
carry the node's light and dark icons.

### 3.1 Fields

| Label | Visible | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| Provider | yes | yes | `typesafe` | `typesafe`, `openrouter`, `openai` or `custom` |
| API Key | yes, masked | yes | — | Bearer token for the API |
| Base URL | only for `custom` | for `custom` | — | Host the node calls for a custom provider |
| Endpoint Path | yes | no | blank | Path the node calls; blank means the provider default |
| API Style | only for `custom` | for `custom` | `systemone` | `systemone` or `openai`: the API format a custom provider speaks |

1. The API key MUST be stored and displayed as a password field.
2. The effective host is `https://api.typesafe.ai` for the `typesafe`
   provider, `https://openrouter.ai` for the `openrouter` provider,
   `https://api.openai.com` for the `openai` provider,
   and the custom base URL for the `custom` provider. Surrounding whitespace
   and trailing slashes MUST be ignored. A `custom` provider without a base
   URL is an error. A non-blank base URL MUST be a valid URL using `https`,
   except `http` on localhost for local development.
3. The effective path is **Endpoint Path** when non-blank, otherwise the
   provider default: `/v1/systemone` for TypeSafe AI and custom providers,
   `/api/alpha/decisions` for OpenRouter, `/v1/decisions` for OpenAI and for
   a custom provider with the OpenAI style. A non-blank value MUST be a plain
   path: a leading slash is added when missing, duplicate slashes are
   collapsed, and absolute URLs, `.`/`..` segments, queries and fragments are
   errors.
4. No secret may be hardcoded anywhere in the package.

### 3.2 Behaviour

1. Every request MUST authenticate with the header
   `Authorization: Bearer <api key>`.
2. The effective host is the base URL when it holds a non-blank value,
   otherwise the default above. Surrounding whitespace and trailing slashes
   MUST be ignored.
3. The credential MUST offer a test that issues `GET {host}/v1/models`
   (`GET {host}/api/v1/models` for the `openrouter` provider) and
   reports success or failure to the user.
4. The API key MUST be sent only to the effective host. A response that
   redirects to another host MUST NOT receive it.

---

## 4. Node identity

| Property | Value |
| --- | --- |
| Display name | `Decisions` |
| Identifier | `decisions` |
| Group | `transform` |
| Version | `1, 2` (new nodes use `2`; see §5.5 and §8.3) |
| Description | `Ask Decisions API typed questions and get calibrated probabilities` |
| Default instance name | `Decisions` |
| Subtitle | The selected operation |
| Inputs | One main input |
| Outputs | Per §8.1b and §8.3 |
| Credential | The credential in §3, required |

1. The node MUST ship separate light and dark SVG icons.
2. The node MUST be usable as an AI Agent tool.

### 4.1 Discovery metadata

The node's codex file MUST declare:

| Key | Value |
| --- | --- |
| `node` | `n8n-nodes-decisions.decisions` |
| `categories` | `["Development", "Utility"]` |
| `resources.primaryDocumentation` | `https://docs.typesafe.ai` |
| `resources.credentialDocumentation` | `https://docs.typesafe.ai` |
| `alias` | see below |

`node` MUST be the package name followed by the node identifier.

`categories` MUST NOT include `AI`. That value opts a node into n8n's AI
sub-node system, which hides anything not declared as an AI root node from both
the node panel and search. This node is an ordinary transform node.

`alias` MUST be populated; it drives discoverability:
`decisions`, `typesafe`, `jev`, `classify`, `classification`, `route`,
`routing`, `triage`, `guardrail`, `moderation`, `score`, `rank`, `extract`,
`system one`, `probability`, `confidence`.

---

## 5. Parameters

Fields are identified by the label the user sees.

1. A field MUST be shown only for the operations listed against it.
   **Operation**, **Model**, **State Format**, **State** and **Options** are
   shown for both operations.
2. **Model** MUST appear directly after **Operation**, before **State Format**,
   as a top-level field and not inside **Options**.
2. Fields within a list entry are displayed in the order the entry declares
   them. That order MUST read as the user fills the entry in: first the field
   that decides what the rest of the entry looks like, then the field
   identifying the entry, then the field describing it, then anything
   optional.
3. Two fields meaning the same thing in different lists MUST carry the same
   label and occupy the same position in both.
4. Copy follows n8n's UX guidelines: an example in a placeholder starts with
   "e.g.", help text puts parameter names in single quotes, and action text
   leaves out articles.

### 5.1 Operation

Required. Default **Evaluate**.

| Label | Behaviour |
| --- | --- |
| Evaluate | Evaluate the state against System One questions and output answers. |
| Route | Evaluate the state against a System One question and send the item to the matching output. |

The operation MUST NOT be settable by expression, so an AI Agent cannot change
it at runtime.

**Route** MUST NOT be offered when the node is used as an AI Agent tool. A tool
hands its result straight back to the agent, so Route's outputs would connect
to nothing and every item would reach the agent alike. Only **Evaluate** is
offered there.

### 5.2 Model

Required, both operations. A plain text model ID, for example `jev-latest`.

### 5.3 State

**State Format** — required, both operations, default **Text**.

| Label | What is sent as the state |
| --- | --- |
| Text | The content of the **State** field. |
| JSON | The parsed content of the **State** field, as an object or array. |
| Input Item | The incoming item's JSON, unchanged. |

**State** — shown for Text. Required, multi-line. If an expression resolves it
to an object, that object MUST be sent as structured state rather than
stringified. A number or boolean MUST be sent as its string form. A blank
value is an error.

**State** — shown for JSON. Required, JSON editor, defaulting to a minimal
object. The value MUST parse to an object or array.

Both state fields carry the same label. Only one is ever visible, so the user
always sees a single field called **State**.

### 5.4 Questions — Evaluate only

**Questions Format** — required, default **Using Fields Below**.

| Label | Behaviour |
| --- | --- |
| Using Fields Below | Build the questions from the list below. |
| Using Raw JSON | Take the questions map as written, supporting structured instructions and criteria. |

**Questions** — shown for Using Fields Below. A reorderable list, one entry per
question, each entry titled by its **ID**. Each entry has:

| Label | Required | Shown when | Meaning |
| --- | --- | --- | --- |
| Question Type | yes | always | Choice, Noul (Yes/No) or Score. Default Noul. |
| ID | yes | always | The key the answer is returned under. Not sent to the model. |
| Instructions | yes | always | The question itself. |
| Choice Options | yes | Choice | The list of options to choose between. See below. |
| Levels | yes | Score | The ordered list of levels. See below. |
| True Means | no | Noul | What a yes (value near 1) means. |
| False Means | no | Noul | What a no (value near 0) means. |

**Choice Options** is a reorderable list nested inside the question, with an
*Add Option* button. Each entry is titled by its **Name**. Each entry
has:

| Label | Required | Meaning |
| --- | --- | --- |
| Name | yes | The option, sent to the API and returned as the answer. |
| Description | no | A description of that option, used as its rubric. |

**Levels** is a reorderable list nested inside the question, with an
*Add Level* button. Each entry is titled by its position and its **Level**
text, as in `Level 3: Frustrated`, keeping the position even while the text is
blank so that the order stays readable as the list is filled in. Each entry
has:

| Label | Required | Meaning |
| --- | --- | --- |
| Level | yes | What this level describes. |

Both lists MUST start with two empty entries, matching their minimum, so the
user sees the shape a usable question needs rather than having to discover it.

Ordering differs between the two: a Score's level order is meaningful and runs
from lowest to highest, whereas a Choice's option order carries no meaning and
is presentational only.

Counts are bounded: two to 255 options, two to ten levels, and at least one
question. Where the editor can enforce a bound it MUST, reporting it as a
problem with the node before the workflow runs. It cannot do so for a list
nested inside another list, which is the case for **Choice Options** and
**Levels**.
Every bound MUST therefore be checked at run time as well, which is in any
case the only check that applies to **Using Raw JSON**.

Hand-authoring does not scale to large option sets. **Using Raw JSON** remains the
way to supply options generated from data.

No per-question confidence control may be offered for a Noul question; the API
returns no confidence for one. Low-confidence handling below is global and
applies to all questions, deriving Noul confidence as in §8.1b.

**Questions** — shown for Using Raw JSON. Required, JSON editor, defaulting to
a single worked example. It carries the same label as the list above; only one
is ever visible.

Evaluate also offers global low-confidence handling (see §8.1b):

| Label | Required | Default | Shown when | Meaning |
| --- | --- | --- | --- | --- |
| Fallback Mode | no | Disabled | Evaluate | Disabled, Best Guess or Low Confidence Output. Not settable by expression. |
| Confidence Threshold | no | `0.7` | Evaluate, and Fallback Mode is not Disabled | Range 0–1. Answers with confidence below this are low confidence. Must be a finite number in range; anything else is an error. |

The threshold is global; there is no per-question override. A non-finite threshold, or one outside 0–1 (for example from an expression resolving to `NaN`), MUST be reported as a configuration problem per §7 rather than silently disabling the filter.

When the node is used as an AI Agent tool only Evaluate is offered, and **Low Confidence Output** still produces two outputs. Prefer **Disabled** or **Best Guess** there, so the agent receives a single result.

### 5.5 Routes — Route only

A route is decided by one question, of any of the three types.

| Label | Required | Default | Shown when | Meaning |
| --- | --- | --- | --- | --- |
| Question Type | yes | Choice | always | Choice, Noul (Yes/No) or Score. |
| Instructions | yes | — | always | What the model should decide. |
| Routes | yes | — | Choice | A reorderable list of two to 255 routes; each entry becomes an output. |
| True Means | no | — | Noul | What a yes (value near 1) means. Also labels the output. |
| False Means | no | — | Noul | What a no (value near 0) means. Also labels the output. |
| Levels | yes | two empty entries | Score | A reorderable list of two to ten levels, lowest first; each entry becomes an output. |
| Confidence Handling | yes | Always Route | always | See §8.3. |
| Confidence Threshold | no | `0.7` | A Low Confidence output enabled | Range 0–1. |

In node version 1, **Confidence Handling** and **Confidence Threshold** were offered only for a Choice, and Noul used **True Probability Threshold** / **False Probability Threshold** (both default `0.5`) with an `Uncertain` output for the gap between them. Those two thresholds exist only in version 1. Workflows saved with version 1 keep running with the old thresholds; new workflows use one confidence threshold for all three question types, per §8.3. An asymmetric v1 gap cannot be expressed as a single confidence threshold: `confidence ≥ c` is exactly `p ≥ 0.5 + c/2` (true) or `p ≤ 0.5 − c/2` (false).

In version 1 the **True Probability Threshold** MUST NOT be below the **False Probability Threshold**. The two would then overlap, leaving an answer between them belonging to both outcomes; that MUST be reported as a configuration problem per §7.

Each **Routes** entry is titled by its **Name**:

| Label | Required | Meaning |
| --- | --- | --- |
| Name | yes | Sent to the API as the Choice option, and used as the output's label. |
| Description | no | The criteria for choosing this route. |

Each **Levels** entry is titled and filled in exactly as a Score question's
levels in §5.3.

A route's **Name**, a level's **Level**, the **Question Type**, both meanings,
**Confidence Handling** and, in version 1, both probability thresholds MUST NOT
be settable by expression. Between them they decide how many outputs
the node has and what each is called, and that is resolved in the editor before
the workflow runs. **Confidence Threshold** values do not
change the output count, so they MAY be set by expression. **Fallback Mode**
MUST NOT be settable by expression either, since it decides whether Evaluate
has one output or two. The per-item agreement check remains as a runtime
defense.

A route is a Choice option, so by §5 rule 3 its fields carry the same labels as
an option's.

### 5.6 Options

A collection, shown for both operations unless noted.

| Label | Type | Default | Meaning |
| --- | --- | --- | --- |
| Include Other Input Fields | boolean | `true` | Keep the incoming item's fields alongside the result. |
| Simplify | boolean | `true` | Keep each answer's value and confidence instead of returning the full response. Applies to both operations. |
| Timeout | number, min 1000 | `5000` | Time in ms to wait for the server to send response headers (and start the response body) before aborting the request |

There MUST NOT be an option for renaming the output field. See §8.4.

---

## 6. Request

One request per input item, to `POST {host}{endpoint path}`, carrying exactly
`state`, `model` and `questions`. The endpoint path is §3.1: the provider
default when the credential's **Endpoint Path** is blank, otherwise the entered
path as normalized there.

### 6.1 Questions for Evaluate

Each configured question becomes one entry in the `questions` map, keyed by its
**ID**, carrying its type and `instructions` plus:

| Question Type | `criteria` sent |
| --- | --- |
| Choice | A map of option to description, with `null` where no description was given. |
| Score | An ordered array of level descriptions, lowest first. |
| Noul | An object with the given `true` and/or `false` meanings. Omitted entirely when both are blank. |

**Choice options** are sent in the order listed, each **Name** mapped to its
**Description** text, or to `null` where that is blank.

**Score levels** are sent as an array of the **Level** values, in the order
listed, lowest first.

### 6.2 Question for Route

Exactly one question, of the selected **Question Type**, under a fixed ID the
node chooses and the user never sees. Its `instructions` are the
**Instructions** field.

For a Choice, its `criteria` map each route's **Name** to its **Description**
text, or `null` when blank. For a Noul, its `criteria` carry the given **True
Means** and **False Means**, and are omitted entirely when both are blank —
exactly as for a Noul question in §6.1. For a Score, its `criteria` are the
**Levels**, sent exactly as for a Score question in §6.1.

### 6.3 OpenAI request

With the `openai` provider — or a `custom` provider with the OpenAI style —
the node translates its request into OpenAI's
Decisions format (`POST {host}/v1/decisions`) before sending, and translates
the response back:

| Node request | OpenAI request |
| --- | --- |
| `state` as text | `input`, unchanged |
| `state` as an object or array | `input`, `JSON.stringify` of the state |
| `questions` map keyed by ID | `questions` array, each entry carrying its ID as `name`, in the same order |
| Noul question | `predicate` question; the given `true`/`false` meanings are appended to `instructions` as `"\n\nA yes means: <true>"` and/or `"\nA no means: <false>"`, only for the meanings given (a lone `false` meaning uses `"\n\nA no means: <false>"`; with neither meaning the instructions are unchanged) |
| Choice question | `choice` question; the criteria map becomes `choices: [{ value, description }]`, omitting `description` where none was given |
| Score question | `score` question; the criteria array becomes `levels: [{ label }]`, in the same order |

A **Using Raw JSON** value that is already an array of OpenAI questions is
sent unchanged, but every entry needs a unique non-blank `name`: missing
or duplicated names are an error before the request is sent.

There is no image support: a state that looks like OpenAI messages, as one
message or an array of them, is an error; any other object or array state
is sent as its `JSON.stringify` form. A converted question with empty
instructions is an error.

---

## 7. Validation

Configuration problems MUST be reported against the item that caused them,
before or instead of calling the API.

Following n8n's UX guidelines, an error message MUST name the parameter at
fault in single quotes, as in `'State' is empty`, and the error's description
MUST say how to fix it where the message alone does not.

---

## 8. Output

### 8.1 Evaluate, simplified (default)

One output item per input item:

```json
{
  "answers": {
    "is_urgent":   { "noul": 0.95 },
    "department":  { "choice": "billing", "confidence": 0.81 },
    "frustration": { "score": 1.05, "confidence": 0.92 }
  },
  "model": "jev-1.13.0"
}
```

| Question Type | Keys under each answer |
| --- | --- |
| Noul | `noul` — the probability of yes (0–1) |
| Choice | `choice` — the chosen option; `confidence` |
| Score | `score` — the position along the levels; `confidence` |

1. The container MUST be named `answers` and keyed by question ID.
2. Each answer MUST be a nested object, not a set of sibling keys distinguished
   by suffix. A question may legitimately be named after another question's
   attribute, and nesting makes that impossible to collide.
3. `model` MUST be the versioned ID the API reports, not the requested alias.
4. Each key MUST carry the API's own name and value. Simplifying keeps the
   answer's value and `confidence` and leaves out `type`, `probabilities` and
   `legend`; it MUST NOT rename, derive or add a key. §8.1b is an explicit
   exception: it adds `confidence`, `lowConfidence` and `value` where stated.

### 8.1b Evaluate low-confidence handling

Fallback Mode selects how Evaluate handles low-confidence answers. It operates
on the raw API response, before Simplify, so questions built in the UI and Raw JSON behave alike.
The raw `noul`, `choice`, `score` and `probability` values MUST never be
modified.

1. Confidence is normalized to 0–1. Choice and Score use their own
   `confidence`. A Noul (and, with OpenAI, a predicate) derives it as
   `|p − 0.5| × 2`, so `0.85 → 0.70`, rounded to 1e-9 so float noise never
   flips a comparison (`0.55 → 0.1` exactly). A refusal has confidence `0`.
   An answer with no confidence source (for example a Score without
   `confidence`) is treated as reliable and MUST NOT be marked low confidence.
2. An answer is low confidence when its confidence is strictly below
   **Confidence Threshold**. A confidence exactly on the threshold is not low
   confidence. The threshold MUST be a finite number in 0–1; anything else is
   a configuration problem per §7.
3. With **Disabled** (default) the output is exactly §8.1/§8.2. No field is
   added.
4. With **Best Guess** there is one output. Every answer gains `lowConfidence`,
   plus `confidence` where the answer has a confidence source (derived for
   Noul, `0` for a refusal). A Noul or
   predicate always gains `value`, resolved as `p > 0.5`; exactly `0.5`
   resolves to `false`. A refusal never gains `value`. Choice and Score keep
   their value as the best option and never gain `value`.
5. With **Low Confidence Output** there are two outputs, `Confident` and
   `Low Confidence`. Every answer gains `lowConfidence`, plus `confidence`
   where the answer has a confidence source, and
   the item gains `lowConfidence` and `lowConfidenceQuestions` (the IDs of
   the doubtful questions). When any question is low confidence the whole
   item goes to `Low Confidence`, otherwise to `Confident`. No `value` is
   resolved. A refusal always sends its item to `Low Confidence`.
6. A failing item goes to the `Low Confidence` output as in §9.3, without
   passing through the confidence logic. With **Disabled** or **Best Guess**
   it goes to the single main output.

Chaining two Decisions nodes recomputes these fields: a second node
overwrites `confidence`, `lowConfidence`, `lowConfidenceQuestions` and
`value` from the previous one. An incoming field named `value` on an answer
is therefore not preserved.

### 8.1a OpenAI answers

With the `openai` provider the following differences apply:

1. A predicate answer keeps OpenAI's key `probability`, e.g.
   `{ "probability": 0.95 }` when simplified.
2. `answers` are still keyed by question ID: the node builds the map from
   OpenAI's answers array using each entry's `name`, falling back to the
   order the questions were sent when an entry has none. An answer without
   a usable name, a duplicated name, or a count that does not match the
   questions sent is an error.
3. A refusal answer comes back as a `refusal` answer. It is
   output as `{ "type": "refusal" }` even when simplified — an explicit
   exception to §8.1 rule 4, since a refusal has no value and the type is
   the only thing that tells it apart.
4. A score answer is routed to its nearest level per §8.3 rule 8, except
   that a score outside the levels' range is an error rather than going to
   the nearest end. The 0-based scale is assumed but not yet verified
   against the live API.
5. `model` is the ID OpenAI reports when it reports one, and otherwise falls
   back to the requested model ID.

### 8.2 Evaluate, raw (Simplify off)

```json
{ "answers": { }, "model": "jev-1.13.0", "usage": { "input_tokens": 296, "output_tokens": 20 } }
```

`answers` MUST be the API's map unchanged. Token `usage` MUST appear only here.

### 8.3 Route

`route` MUST be the answer to the route question exactly as §8.1 or §8.2 would
present it for the current **Simplify** setting. Token `usage` appears
under the same rule as §8.2, only when **Simplify** is off.

Choice, simplified and raw:

```json
{ "route": { "choice": "billing", "confidence": 0.81 }, "model": "jev-1.13.0" }
```

```json
{ "route": { "type": "choice", "choice": "billing", "confidence": 0.81,
             "probabilities": { "billing": 0.88, "technical": 0.12 } },
  "model": "jev-1.13.0",
  "usage": { "input_tokens": 296, "output_tokens": 20 } }
```

Noul, simplified and raw:

```json
{ "route": { "noul": 0.85 }, "model": "jev-1.13.0" }
```

```json
{ "route": { "type": "noul", "noul": 0.85 },
  "model": "jev-1.13.0",
  "usage": { "input_tokens": 296, "output_tokens": 20 } }
```

Which outcome an item met is told by the output it leaves from; it is not
repeated in the data.

Outputs for a **Choice**:

1. One output per configured route, in the order the routes are listed,
   labelled with the route's **Name**.
2. When **Confidence Handling** is *Route to Separate Low Confidence Output*,
   one further output is appended last: labelled `Low Confidence` in version 2
   (`Fallback` in version 1). An item goes there when its confidence is below
   **Confidence Threshold** (default `0.7`). An answer with no confidence
   source is treated as reliable and follows its route, like in Evaluate.
3. When it is *Always Route*, there is no extra output and every
   item follows the chosen route.

Outputs for a **Noul**, in this order:

4. One output for a yes, labelled with **True Means** or `True` when that is
   blank, and one output for a no, labelled with **False Means** or `False`.
   Confidence is `|p − 0.5| × 2` with the same **Confidence Threshold** as a
   Choice (default `0.7`): `confidence ≥ c` is exactly `p ≥ 0.5 + c/2`
   (true) or `p ≤ 0.5 − c/2` (false). A confidence exactly on the threshold
   is not low confidence.
5. When **Confidence Handling** is *Route to Separate Low Confidence Output*,
   one further output labelled `Low Confidence` is appended last, and an item
   whose confidence is below the threshold goes there. Otherwise an item goes
   to True when `p > 0.5` and to False when `p ≤ 0.5`.
6. In node version 1 only, two probability thresholds decided the outputs
   instead: at or above **True Probability Threshold** went to True, at or
   below **False Probability Threshold** went to False, and a gap between
   them added an `Uncertain` output last for values in between. Version 1
   workflows keep this behaviour; it MUST NOT be offered in version 2.

Outputs for a **Score**:

7. One output per level, in the order the levels are listed, labelled with the
   level's text, or `Level N` (its position, from 0) while that is blank.
8. An item goes to the level nearest its score: level *i* takes scores from
   *i* − 0.5 up to, but not including, *i* + 0.5. A score exactly halfway goes
   to the higher level. A score below the lowest level or above the highest
   goes to that end. A score that is not a finite number is an error.
9. In node version 2, when **Confidence Handling** is *Route to Separate Low
   Confidence Output*, one further output labelled `Low Confidence` is
   appended after the levels, and an item whose confidence is below
   **Confidence Threshold** goes there. Without it every item goes to its
   nearest level. An answer without a confidence source is treated as reliable
   and goes to its nearest level.

Score, simplified:

```json
{ "route": { "score": 1.3, "confidence": 0.9 }, "model": "jev-1.13.0" }
```

10. The outputs shown in the editor MUST match those produced at runtime.

### 8.4 Common rules

1. Every output item MUST be traceable to the input item it came from.
2. With **Include Other Input Fields** on (default), the incoming item's fields are
   kept and the node's fields written over them, and binary data is carried
   through. With it off, only the node's fields are emitted and binary data is
   dropped.
3. An incoming field with the same name as one the node writes — `answers`,
   `route`, `model`, `usage` or `error` — is therefore overwritten. This
   MUST be documented in the README; turning **Include Other Input Fields** off
   keeps only the node's fields.

---

## 9. Errors

### 9.1 Failures

An unsuccessful response MUST surface as an API error
carrying the HTTP status and a human-readable description taken from the
response body. A 422's field-by-field `detail` list MUST be flattened into one
readable sentence rather than shown as raw JSON. No error may be silently
discarded.

### 9.2 Oversized requests

There MUST be no pre-flight size check. A request exceeding the API's token
budget surfaces the resulting 422 as in §9.1.

### 9.3 Continue on fail

A `refusal` answer on a Route is a failure and is handled like any other
failure below.

When the workflow enables it, a failing item MUST be emitted with an `error`
field, and processing MUST continue with the remaining items. It goes to the
low-confidence output where one is enabled, so that a failure is never
mistaken for a routing decision, and to the first output otherwise:

| Operation | Output the failed item goes to |
| --- | --- |
| Evaluate, Low Confidence Output | `Low Confidence` |
| Evaluate, otherwise | The main output |
| Route, Choice | `Low Confidence` (`Fallback` in version 1) if enabled, otherwise the first route |
| Route, Noul (Yes/No) v2 | `Low Confidence` if there is one, otherwise False |
| Route, Noul (Yes/No) v1 | `Uncertain` where one exists, and the no output otherwise |
| Route, Score v2 | `Low Confidence` if there is one, otherwise the first level |
| Route, Score v1 | The first level |
**Include Other Input Fields** applies to it as it does to any other item.
The failing item MUST carry the error itself as well as the `error` field, so
that n8n's **Continue (using error output)** setting moves it to the error
output.
Otherwise the error stops the node and identifies the item that failed.
