# Campaign Task Template

Use this template when asking another AI coding session to modify the campaign workspace.

```text
Read docs/ai/campaign-workspace-steering.md before making changes.

Task:
{describe the exact change}

Scope:
- {file or area}
- {file or area}

Do not:
- Violate the steering rules.
- Expand the feature beyond this task.
- Reintroduce manual Meta Object ID input.
- Reintroduce full-row storage inside CampaignDatabase documents.
- Import components from API routes.
- Use any as a shortcut.

Completion criteria:
- npm run verify:campaign-full

For small documentation-only changes, `npm run verify:campaign` is acceptable if
the task explicitly does not touch source code.

If a check fails:
- Fix the cause.
- Rerun the failed check.
- Report the final result.

Final report:
- Changed files.
- Verification results.
- Remaining risks.
```

For prompt-writing sessions, summarize the steering constraints into the generated prompt
instead of assuming the next model has this conversation history.
