# Campaign Workspace Steering

Read this file before writing, reviewing, or prompting for campaign workspace work.
It exists so future AI sessions can keep the same product direction and avoid repeating
the prompt -> implementation -> correction loop.

## Product Direction

The campaign tab is not a Google Sheet reader. It is a campaign operating system:

- Notion-like section and block authoring.
- Spreadsheet-like structured databases.
- System-generated campaign dashboard.
- Client-shareable report renderer.
- Meta API analytics captured as long-term insight assets.

The campaign detail page should open on the combined dashboard first. Manual dashboard
widget building is not the main workflow.

## Core Mental Model

- Campaign content can be section-based and document-flow-based at the same time.
- A data table can be an independent section and can also be embedded inside a document.
- Dashboard widgets should be recommended/generated from known business data types.
- Client share should eventually be a separate report renderer, not just a cropped internal UI.
- Client editing should be scoped by shared section/database permissions.

## Data Model Rules

- Do not store all spreadsheet rows inside one `CampaignDatabase` document.
- Treat `campaignDatabaseRows` as the row storage boundary.
- Keep `CampaignDatabase` as schema/view/config plus compatibility fields only.
- Meta mapping documents store selected IDs only:
  - `metaCampaignIds`
  - `metaAdsetIds`
  - `metaAdIds`
- Meta insight rows are accumulated in `campaignMetaInsightSnapshots`.
- Meta snapshots are assets for dashboards, future insight generation, and AI chat.
- Influencer post collection via Apify should eventually write normalized performance assets,
  not overwrite workspace document blocks.

## Code Boundary Rules

- API routes must not import from `src/components`.
- Components must not import from `src/lib/server`.
- Shared campaign business logic belongs in `src/lib/campaigns`.
- Server-only helpers belong in `src/lib/server`.
- Workspace state and persistence should live in hooks, not in a single giant component.
- Chart recommendation logic should stay centralized in `src/lib/campaigns/chartRecommendations.ts`.
- Database templates should live in `src/lib/campaigns`, not under components.

## UI Rules

- This is an operational SaaS interface. Prefer compact, calm, scannable UI.
- Use a Notion-like white table surface: thin borders, compact rows, restrained controls.
- Use lucide icons for tool buttons when available.
- Avoid manual instructional copy that explains obvious UI behavior.
- Do not bring back manual dashboard widget creation as a primary feature.
- Data table editing should feel spreadsheet-like:
  - click to edit
  - Tab / Shift+Tab moves and edits the next target cell
  - Enter moves downward when appropriate
  - values should not disappear during save

## Meta Rules

- Users should not manually type Meta Object IDs in the campaign UI.
- Load campaign/ad set/ad objects from the connected Meta account.
- Let users select visible objects with expand/collapse and checkboxes.
- Mapping persists IDs only; object names/status are display data from the Meta objects API.
- Refresh is manual for now.
- Refresh must require selected IDs for every selected level.
- Refresh success should leave the result visible to the user.

## Firestore Rules Checklist

The following collections must be covered when campaign workspace changes touch them:

- `campaignSections`
- `campaignBlocks`
- `campaignDatabases`
- `campaignDatabaseRows`
- `campaignMetaMappings`
- `campaignMetaInsightSnapshots`
- future share collections when client reports are implemented

Firestore rules must be saved as UTF-8 without BOM. A BOM can break Firebase deploy.

## Prompting Rules For Future Sessions

When another AI session is asked to create a coding prompt, tell it to:

1. Read this steering file first.
2. Use `docs/ai/campaign-task-template.md` as the task shape.
3. Include `npm run verify:campaign` in completion criteria.
4. Keep task scope narrow and explicit.
5. Ask the coding agent to rerun failed checks after fixes.

## Required Verification

For campaign workspace changes, run at least:

- `npm run lint`
- `npm run build`
- `npm run verify:campaign`

Use `npm run verify:campaign-full` when you want a single command for the full
campaign verification set. This command runs architecture verification first so
structural failures are reported before lint/build work.

## Harness Scope

Static architecture verification is for structure, storage boundaries, and basic
rules coverage. It should not pretend to prove that Firestore policy is secure.
Security policy correctness belongs in Firebase emulator tests.

Behavioral UI rules belong in E2E tests, not static string checks. The first E2E
priority is the data table editing flow because it has repeatedly regressed:

- click -> edit -> Tab should open the next cell for editing
- Enter should move to the next row when appropriate
- clicking another cell should commit and open that cell in one action
- values should persist after save/reload

Meta object selection E2E is the next priority after data table editing.

Do not add production routes, production branches, or client-visible backdoors for
tests. Prefer Firebase Auth Emulator, API route interception, fixtures, and test
users outside production code.

When this steering file adds or changes a rule, check whether
`scripts/verify-campaign-architecture.mjs` needs a matching machine check.
If the rule is behavioral and cannot be checked statically, note it as an E2E
test candidate in the relevant task prompt.
