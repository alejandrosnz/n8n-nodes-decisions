# Decisions n8n node

An n8n community node that calls a Decisions-compatible API (TypeSafe's System One `POST /v1/systemone` or OpenRouter's `POST /api/alpha/decisions`). It has two operations, Evaluate and Route.

Based on [typesafe-ai/n8n-nodes-typesafe-ai](https://github.com/typesafe-ai/n8n-nodes-typesafe-ai).

## Commands

- `npm run dev` starts n8n with the node loaded. Restart it after changing the node's fields, copy or icons.
- `npm test` runs the unit tests.
- `npm run lint` runs n8n's lint rules, which the node must pass for verification.
- `npm run build` compiles to `dist/`, which is all the npm package ships.

## Layout

- `nodes/Decisions/` holds the node. `descriptions.ts` has the fields and copy, `Decisions.node.ts` runs the requests and routing, `helpers.ts` builds questions and outputs, and `api.ts` makes the HTTP calls.
- `credentials/` holds the Decisions API credential with `typesafe`, `openrouter` and `custom` providers.
- `nodes/Decisions/SPEC.md` specifies the node's behaviour. Keep it in step with any change to the node.
- `agents/` holds testing guides copied from the n8n community node starter.

## Rules

- Answers keep the API's own field names: `noul`, `choice`, `score`, `confidence`. Simplify only drops `type`, `probabilities` and `legend`.
- Copy follows n8n's UX guidelines: Title Case labels, sentence case descriptions, "e.g." placeholders, and parameter names in single quotes.
- The README documents the n8n side of the node and links to docs.typesafe.ai for Decisions concepts.
- All code and comments are written in English.

## Releasing

Releases use the starter's manual workflow (see `.github/workflows/publish.yml`):

1. Run the Release workflow with the wanted `release_type` (`patch`, `minor` or `major`).
2. The workflow bumps the version, updates the changelog, tags and publishes to npm.
