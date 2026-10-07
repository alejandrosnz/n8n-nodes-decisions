# Changelog

All notable changes to this package are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- OpenAI provider in the Decisions API credential.
- Translation of requests and responses to OpenAI's Decisions API beta.
- Support for `predicate` and `refusal` answers.

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
