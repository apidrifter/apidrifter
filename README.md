# Driftwatch

Breaking-change detection and monitoring for the APIs you depend on. One engine for OpenAPI documents and MCP servers.

```
npx driftwatch breaking ./openapi-v1.yaml ./openapi-v2.yaml
npx driftwatch mcp diff ./snapshot.json https://mcp.example.com/mcp
```

- **Diff two specs** and get every change classified as breaking, warning or info, with stable IDs you can configure and a plain explanation of what changed and why it matters.
- **Polarity-aware.** A property becoming required is breaking in a request and harmless in a response. Driftwatch knows which side it is looking at.
- **MCP servers too.** Snapshot a server's tools, resources and prompts, and diff later. Description changes are tracked because they change what agents do.
- **Fail CI** on breaking changes with one command or the GitHub Action.
- **Hosted** watching, history and alerts for public and private sources, with an MCP server so agents can ask what changed since their last run.

Status: early. The engine and CLI are under active development; the hosted service is next. Read [docs/DESIGN.md](docs/DESIGN.md) for how it is built and why.

## License

Apache-2.0. See [LICENSE](LICENSE).
