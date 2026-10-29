# Lane A — QA fixes (sprint 01, stage 4.5)


## Review (code-reviewer, QA-01)

Verdict: NOT approved. One fix-list item.

1. `framework/docs/architecture.md`, paragraph "How the browser reaches the api": the sentence "the api is never exposed to the browser on a different port" is false. `docker-compose.yml` publishes `127.0.0.1:3000->3000` and README documents `curl http://127.0.0.1:3000/api/health`. Fixed = delete that sentence, or say the api is also published on host port 3000 for direct curl, while the browser uses only the web origin.
