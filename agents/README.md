# AI Agent Prompts for n8n Node Development

This directory contains specialized prompts designed to help AI assistants (like GitHub Copilot, Cursor, or Claude) develop and test n8n community nodes.

## 📖 Main Documentation

The main **[AGENTS.md](../AGENTS.md)** file is located in the root of the project and serves as the comprehensive guide for developing n8n community nodes using AI assistance. It covers:
- Node development architecture and best practices
- Implementation patterns for different node types
- Testing strategies and workflows
- Publishing and maintenance guidelines
- Integration with AI tools for automated development

## 🤖 Available Prompts

### [UNIT_TESTING.md](UNIT_TESTING.md)
**Purpose**: Help AI assistants write comprehensive unit tests for n8n nodes
- Test structure and organization
- Mocking strategies for HTTP requests
- Error handling scenarios
- Binary data testing patterns

### [QUICK_GUIDE.md](QUICK_GUIDE.md)
**Purpose**: Quick reference for using AI to write tests
- Unit testing approaches
- Credential schema specification
- AI prompt templates

## 🚀 How to Use These Prompts

1. **Copy the relevant prompt** into your AI assistant
2. **Provide context** about your specific node (API documentation, credentials, etc.)
3. **Specify the task** you want the AI to help with
4. **Review and iterate** on the generated code

## 💡 Example Usage

```
I want to create a new n8n node for [API Service]. Here's the API documentation: [link]
Please use the UNIT_TESTING.md prompt to help me write comprehensive tests for this node.
```

## 🤝 Contributing

These prompts are designed to evolve with n8n's best practices. If you find improvements or new patterns, consider contributing back to the n8n community.