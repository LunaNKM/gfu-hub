# GFU Hub AI Working Notes

Before changing campaign workspace code, read:

- `docs/ai/campaign-workspace-steering.md`
- `docs/ai/campaign-task-template.md`

For campaign workspace tasks, the default verification command is:

- `npm run verify:campaign-full`

This runs campaign architecture checks before lint/build. Use `npm run verify:campaign`
alone only for small documentation-only changes that do not touch source code.

If a user asks for a coding prompt for campaign work, include the steering file requirement
and the verification commands in the prompt. Do not assume the next session has prior chat
context.
