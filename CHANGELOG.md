# Changelog

All notable changes to this package are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed

- **Unified confidence (node version 2, breaking for Route Noul).** Route Noul no longer uses **True/False Probability Thresholds** or an `Uncertain` output. All three question types share one **Confidence Handling** / **Confidence Threshold** (default `0.7`): Yes/No confidence is `|p − 0.5| × 2`, so `confidence ≥ c` is exactly `p ≥ 0.5 + c/2` (true) or `p ≤ 0.5 − c/2` (false). An unsure item goes to a `Low Confidence` output when enabled, otherwise Noul follows `p > 0.5`. Score also gains an optional `Low Confidence` output. Workflows saved with node version 1 keep running with the old thresholds. Asymmetric v1 threshold gaps cannot be expressed as a single confidence threshold.
- Evaluate failures with **Low Confidence Output** now go to the `Low Confidence` output instead of the main output.
- **Confidence Threshold** values outside 0–1, or not a finite number, are now errors instead of silently disabling the filter. **Fallback Mode** must resolve to the same value for every item in a run.
- A refusal now counts as low confidence (`confidence: 0`, no `value`) instead of being treated as reliable.

### Removed

- **True Probability Threshold** and **False Probability Threshold** are not offered in node version 2.

### Added

- Low confidence handling in Evaluate, via **Fallback Mode** (`Disabled`, `Best Guess`, `Low Confidence Output`) and **Confidence Threshold** (default `0.7`). Best Guess adds `confidence`, `lowConfidence` and, for Yes/No questions, `value` (`noul > 0.5`, so exactly `0.5` resolves to `false`). Low Confidence Output adds a second output and routes items with any low-confidence answer there, adding item-level `lowConfidence` and `lowConfidenceQuestions`. Yes/No confidence is derived as `|p − 0.5| × 2`.
- OpenAI provider in the Decisions API credential.
- Translation of requests and responses to OpenAI's Decisions API beta.
- Support for `predicate` and `refusal` answers.
- API Style in the credential, so a custom provider can speak OpenAI's Decisions format.
- OpenAI answers keep OpenAI's keys: predicate answers use `probability` instead of `noul`, and a refused question comes back as `{ "type": "refusal" }` even when Simplify is on. Expressions reading those keys need the provider's form.

## 0.1.0

Fork of `@typesafe-ai/n8n-nodes-typesafe-ai` as `n8n-nodes-decisions`.

### Added

- **Decisions node**, renamed from TypeSafe AI. It has two operations:
  - **Evaluate** asks one or more Choice, Score and Noul (Yes/No) questions
    about a state and adds the answers to the item.
  - **Route** asks one Choice, Noul (Yes/No) or Score question and sends the
    item to the output that matches the answer.
- **Decisions API credential** with `typesafe`, `openrouter` and `custom`
  providers, following the multi-provider pattern of
  `n8n-nodes-universal-llm-vision`.
- **Endpoint path in the credential.** Empty means the provider default:
  `/v1/systemone` for TypeSafe AI and custom, `/api/alpha/decisions` for
  OpenRouter.
- **Model as plain text.** The model ID is a simple string input.
- **Starter tooling.** `agents/` guides and `.github/workflows` from
  `n8n-community-node-starter`.

### Changed

- Package, node, credential and repository ownership moved to Alejandro Sanz.
