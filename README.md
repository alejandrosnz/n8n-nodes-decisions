# n8n-nodes-decisions

An [n8n](https://n8n.io/) community node for working with **Decisions-compatible APIs**.

It lets your n8n workflows evaluate content using AI models and receive **structured answers with probabilities**, making it possible to build reliable decision-making and routing workflows.

### Supported APIs

- **TypeSafe AI** — [System One models](https://docs.typesafe.ai/concepts/system-one)
- **OpenRouter** — access compatible models through OpenRouter
- **OpenAI** — OpenAI's **Decisions API** (beta)

### Operations

The node provides two operations:

- **Evaluate** — evaluates each input item against one or more typed questions and adds the answers to the item.
- **Route** — evaluates a question and routes each item to an output based on the resulting answer.

You provide the model with a **state** (the content you want it to evaluate) and a set of typed questions describing what you want to know. The model returns a structured answer for each question, including probabilities.

This makes the node useful for tasks such as **classification, content evaluation, decision-making, filtering, and conditional workflow routing**.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation, and use the package name `n8n-nodes-decisions`.

## Credentials

Add a **Decisions API** credential and pick a **Provider**:

| Provider | API Key | Base URL |
| --- | --- | --- |
| TypeSafe AI | Create one in the [TypeSafe console](https://console.typesafe.ai/keys) | Built in (`https://api.typesafe.ai`) |
| OpenRouter | Create one in your [OpenRouter dashboard](https://openrouter.ai) | Built in (`https://openrouter.ai`) |
| OpenAI | Create one in the [OpenAI dashboard](https://platform.openai.com/api-keys) | Built in (`https://api.openai.com`) |
| Custom (Decisions Compatible) | Your provider key | Enter the provider base URL, e.g. `https://api.custom.com/v1` |

**Endpoint Path** is optional. Leave it blank to use the default for your provider: `/v1/systemone` for TypeSafe AI and custom providers, `/api/alpha/decisions` for OpenRouter, `/v1/decisions` for OpenAI. Set a custom path only if your provider documents a different one. A custom provider speaking OpenAI's format should set **API Style** to **OpenAI Decisions**, which also switches its default path to `/v1/decisions`.

n8n checks the key when you save the credential.

## Operations

Both operations send one request per input item. Each request includes the item's state, the **Model** ID, and the questions.

**Model** is a plain text model ID, e.g. `jev-latest`. The [Models](https://docs.typesafe.ai/models) page describes TypeSafe models and their aliases. For OpenRouter or custom providers, enter the model ID your provider expects. Any OpenRouter model with the decisions output modality should work, e.g. `typesafe/jev-latest`; see the [Decisions models on OpenRouter](https://openrouter.ai/models?output_modalities=decisions). For OpenAI, use `gpt-6-luna`; see [OpenAI's Decisions guide](https://developers.openai.com/api/docs/guides/decisions).

**State Format** sets where the state comes from:

| State Format | State sent |
| --- | --- |
| Text | The **State** field, as plain text |
| JSON | The **State** field, parsed as a JSON object or array |
| Input Item | The incoming item's JSON |

All the questions in a request are asked about the same state. The [State](https://docs.typesafe.ai/concepts/state) page covers how to structure it.

### Evaluate

Evaluate asks one or more questions about the state and adds all the answers to the item. Each question is one of three [question types](https://docs.typesafe.ai/primitives):

| Question Type | Answer |
| --- | --- |
| [Choice](https://docs.typesafe.ai/primitives/choice) | The option the model picked from your list, and its [confidence](https://docs.typesafe.ai/confidence) |
| [Score](https://docs.typesafe.ai/primitives/score) | A position along your levels, and its confidence |
| [Noul (Yes/No)](https://docs.typesafe.ai/primitives/noul) | The probability that the answer is yes, from 0 to 1 |

You can build the questions with the node's fields. Or you can set **Questions Format** to **Using Raw JSON** and pass in a JSON object of questions in the API's format, such as one built by an earlier node. The [API reference](https://docs.typesafe.ai/api) documents that format.

Each answer goes in `answers`, under its question's **ID**:

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

When an AI Agent uses the node as a tool, the node runs Evaluate.

With OpenAI, Noul questions are sent as predicate questions and their answer is `probability` instead of `noul`. A question the model declines comes back as `{ "type": "refusal" }`. Raw JSON can also be an array of questions in OpenAI's format.

### Route

Route asks one question and sends the item to the output that matches the answer. **Question Type** sets the kind of question and the outputs you get:

| Question Type | Outputs | An item goes to |
| --- | --- | --- |
| Choice | One per route, labelled with its **Name** | The route the model picked |
| Noul (Yes/No) | True and False, labelled with **True Means** and **False Means** if you fill them in | True if at or above **True Probability Threshold**, False if at or below **False Probability Threshold** |
| Score | One per level, labelled with the level's text | The level nearest the score |

Each question type has its own way to add or change outputs:

- **Choice: Fallback output.** Set **Confidence Handling** to **Route to Separate Fallback Output** to add a `Fallback` output. An item goes there when its answer's confidence is below **Confidence Threshold**.
- **Noul: Uncertain output.** Both thresholds start at `0.5`, so every item goes to True or False. Set them apart, for example `0.8` and `0.2`, to add an `Uncertain` output for answers that fall between the two.
- **Score: level boundaries.** Levels are numbered from 0, lowest first. The boundary between two levels is halfway between their numbers. A score from `0.5` to just under `1.5` goes to level 1, and a score exactly on a boundary goes to the higher level.

The `route` field holds the answer in the same form Evaluate uses, and the output the item leaves from shows the decision. If the model refuses the route question, that is a failure, handled as in Errors below — it never routes to a decision output.

```json
{ "route": { "choice": "billing", "confidence": 0.81 }, "model": "jev-1.13.0" }
```

## Example workflow

This workflow triages support tickets. A webhook receives each ticket, and the Decisions node's Route operation asks a Choice question with three routes: `billing`, `tech support` and `sales`. Each route's output leads to that team. **Confidence Handling** is set to **Route to Separate Fallback Output**, so a ticket answered below **Confidence Threshold** leaves from `Fallback` instead. A Switch node then sends it on by its confidence, either to be flagged for review or to a human queue.

![An n8n workflow in which a webhook receives a support ticket, the Decisions node routes it to the billing, tech support or sales team, and its Fallback output leads to a Switch node that sends the ticket for review or to a human queue](docs/images/example-workflow.png)

## Output

The node writes these fields to each item:

| Field | Contents |
| --- | --- |
| `answers` | Evaluate: all the answers, keyed by question ID |
| `route` | Route: the answer to the route question |
| `model` | The full ID of the model that answered, including its version, such as `jev-1.13.0` |
| `usage` | Token usage, when **Simplify** is off |

Three settings under **Options** change how the node calls the API and what it writes:

- **Simplify** is on by default. It keeps each answer's `noul`, `choice` or `score`, plus `confidence` for question types that return it, under the API's field names. When it's off, each answer is the full answer object from the API, including `probabilities`, and the item also gets `usage`.
- **Include Other Input Fields** is on by default. It keeps the incoming item's fields and binary data, then writes the node's fields on top, replacing any incoming field with the same name. When it's off, the item has only the node's fields.
- **Timeout** is how long, in milliseconds, the node waits for the API to start responding. The default is 5000 and the minimum is 1000.

## Errors

When something goes wrong, the node stops and shows an error. A failed request shows the HTTP status and the API's error message. A setup problem, such as empty **Instructions** or a duplicate route name, shows a message saying what to fix.

In the node's **Settings**, turn on **Retry On Fail** to retry failed requests, including rate-limit errors (`429`).

To keep the workflow running when an item fails, set **On Error**:

- **Continue (using error output)** adds an error output to the node and sends each failed item there, with an `error` field.
- **Continue** sends each failed item, with an `error` field, to one of the node's regular outputs:

| Operation | Output the failed item goes to |
| --- | --- |
| Evaluate | The main output |
| Route, Choice | `Fallback` if there is one, otherwise the first route |
| Route, Noul (Yes/No) | `Uncertain` if there is one, otherwise False |
| Route, Score | The first level |

## Compatibility

Tested with n8n 2.40.

This package is a fork of `typesafe-ai/n8n-nodes-typesafe-ai`, renamed to `n8n-nodes-decisions` with the node `decisions` and the credential `decisionsApi`. It is not a drop-in upgrade: workflows built with the TypeSafe AI node need the node and credential replaced.

## Resources

* [TypeSafe AI quickstart](https://docs.typesafe.ai/introduction/quickstart)
* [TypeSafe AI documentation](https://docs.typesafe.ai)
* [TypeSafe AI API reference](https://docs.typesafe.ai/api)
* [OpenRouter documentation](https://openrouter.ai/docs)
* [OpenAI Decisions guide](https://developers.openai.com/api/docs/guides/decisions)
* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Version history

See [CHANGELOG.md](CHANGELOG.md).
