import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

function fail(message) {
  failures.push(message)
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function exists(file) {
  return fs.existsSync(path.join(root, file))
}

function walk(dir, predicate = () => true) {
  const start = path.join(root, dir)
  if (!fs.existsSync(start)) return []

  const out = []
  const stack = [start]
  while (stack.length > 0) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      const rel = path.relative(root, full).replaceAll(path.sep, '/')
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === '.git' ||
          rel.startsWith('.claude/worktrees/')
        ) {
          continue
        }
        stack.push(full)
      } else if (predicate(rel)) {
        out.push(rel)
      }
    }
  }
  return out
}

function assertFileExists(file, label = file) {
  if (!exists(file)) fail(`Missing required ${label}: ${file}`)
}

function assertContains(file, needle, message) {
  if (!exists(file)) {
    fail(`Cannot check missing file: ${file}`)
    return
  }
  const content = read(file)
  if (!content.includes(needle)) fail(message)
}

function assertNotContains(file, needle, message) {
  if (!exists(file)) return
  const content = read(file)
  if (content.includes(needle)) fail(message)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getActiveFirestoreMatchBlock(content, collection) {
  const pattern = new RegExp(`^\\s*match\\s+/${escapeRegExp(collection)}/`, 'm')
  const lines = content.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trimStart().startsWith('//') || !pattern.test(line)) continue

    const block = []
    let depth = 0
    for (let j = i; j < lines.length; j++) {
      const current = lines[j]
      block.push(current)
      const withoutLineComment = current.replace(/\/\/.*$/, '')
      depth += (withoutLineComment.match(/{/g) ?? []).length
      depth -= (withoutLineComment.match(/}/g) ?? []).length
      if (depth === 0 && j > i) return block.join('\n')
    }

    return block.join('\n')
  }

  return null
}

function hasWriteAllow(block) {
  return block
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) return false
      const match = trimmed.match(/^allow\s+([^:]+):/)
      if (!match) return false
      return match[1].split(',').map((permission) => permission.trim()).includes('write')
    })
}

function checkFirestoreRules() {
  const file = 'firestore.rules'
  assertFileExists(file, 'Firestore rules')
  if (!exists(file)) return

  const bytes = fs.readFileSync(path.join(root, file))
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail('firestore.rules has a UTF-8 BOM. Firebase rules deploy fails on this file.')
  }

  const requiredCollections = [
    'campaignSections',
    'campaignBlocks',
    'campaignDatabases',
    'campaignDatabaseRows',
    'campaignMetaMappings',
    'campaignMetaInsightSnapshots',
  ]

  const content = read(file)
  for (const collection of requiredCollections) {
    const block = getActiveFirestoreMatchBlock(content, collection)
    if (!block) {
      fail(`firestore.rules is missing collection rule for ${collection}`)
      continue
    }
    if (!hasWriteAllow(block)) {
      fail(`firestore.rules collection rule for ${collection} is missing an allow write statement`)
    }
  }
}

function checkImportBoundaries() {
  const apiFiles = walk('src/app/api', (rel) => /\.(ts|tsx)$/.test(rel))
  for (const file of apiFiles) {
    const content = read(file)
    if (/from\s+['"]@\/components/.test(content) || /from\s+['"].*src\/components/.test(content)) {
      fail(`API route imports components: ${file}`)
    }
  }

  const componentFiles = walk('src/components', (rel) => /\.(ts|tsx)$/.test(rel))
  for (const file of componentFiles) {
    const content = read(file)
    if (/from\s+['"]@\/lib\/server/.test(content) || /from\s+['"].*src\/lib\/server/.test(content)) {
      fail(`Client component imports server-only lib: ${file}`)
    }
  }
}

function checkNoManualMetaObjectIdInput() {
  const files = walk('src', (rel) => /\.(ts|tsx)$/.test(rel))
  for (const file of files) {
    if (file.endsWith('src/components/campaigns/workspace/meta/MetaObjectIdsEditor.tsx')) {
      continue
    }
    const content = read(file)
    const importsLegacyEditor = /from\s+['"][^'"]*MetaObjectIdsEditor['"]/.test(content)
    const rendersLegacyEditor = /<\s*MetaObjectIdsEditor\b/.test(content)
    if (importsLegacyEditor || rendersLegacyEditor) {
      fail(`Manual Meta Object ID input is referenced outside its legacy component: ${file}`)
    }
  }
}

function checkNoInlineDatabaseRowPersistence() {
  const databasePatchRoute = 'src/app/api/campaigns/[id]/databases/[databaseId]/route.ts'
  assertFileExists(databasePatchRoute, 'database patch route')
  if (exists(databasePatchRoute)) {
    const content = read(databasePatchRoute)
    const fieldsMatch = content.match(/const\s+PATCHABLE_FIELDS\s*=\s*\[([\s\S]*?)\]\s+as\s+const/)
    if (!fieldsMatch) {
      fail('Database patch route must keep an explicit PATCHABLE_FIELDS whitelist.')
    } else if (/(^|[,\s])['"]rows['"]/.test(fieldsMatch[1])) {
      fail('Database patch route must not allow rows in campaignDatabases patches.')
    }
  }

  const rowPersistenceFiles = [
    'src/app/api/campaigns/[id]/databases/route.ts',
    'src/app/api/campaigns/[id]/databases/[databaseId]/route.ts',
    'src/lib/campaigns/databaseTemplates.ts',
  ]
  for (const file of rowPersistenceFiles) {
    if (!exists(file)) continue
    const content = read(file)
    const nonEmptyRowsLiteral = /rows\s*:\s*\[(?!\s*\])/m
    if (nonEmptyRowsLiteral.test(content)) {
      fail(`Do not persist non-empty inline CampaignDatabase rows in ${file}`)
    }
  }
}

function checkCampaignWorkspaceContracts() {
  assertFileExists(
    'src/lib/campaigns/chartRecommendations.ts',
    'central chart recommendation engine'
  )
  assertFileExists(
    'src/lib/campaigns/databaseTemplates.ts',
    'campaign database templates in lib'
  )
  assertFileExists(
    'src/components/campaigns/workspace/hooks/useCampaignWorkspace.ts',
    'campaign workspace hook'
  )

  assertContains(
    'src/components/campaigns/workspace/meta/MetaMappingPanel.tsx',
    'MetaObjectSelector',
    'MetaMappingPanel must use MetaObjectSelector for Meta object selection.'
  )

  assertNotContains(
    'src/components/campaigns/workspace/CampaignWorkspace.tsx',
    'DashboardSectionEditor',
    'CampaignWorkspace must not render the legacy manual dashboard editor.'
  )
}

function checkMetaObjectsHarness() {
  assertFileExists('src/app/api/meta/objects/route.ts', 'Meta objects API route')
  assertFileExists(
    'src/components/campaigns/workspace/hooks/useMetaObjects.ts',
    'Meta objects hook'
  )
  assertFileExists(
    'src/components/campaigns/workspace/meta/MetaObjectSelector.tsx',
    'Meta object selector'
  )

  assertContains(
    'src/app/api/meta/objects/route.ts',
    'META_ACCESS_TOKEN',
    'Meta objects API must use server-side META_ACCESS_TOKEN.'
  )
  assertContains(
    'src/types/campaignMeta.ts',
    'MetaObjectsResponse',
    'campaignMeta types must export MetaObjectsResponse.'
  )
}

function checkSteeringDocs() {
  assertFileExists('CLAUDE.md', 'root Claude instructions')
  assertFileExists('docs/ai/campaign-workspace-steering.md', 'campaign steering doc')
  assertFileExists('docs/ai/campaign-task-template.md', 'campaign task template')
  assertContains(
    'CLAUDE.md',
    'docs/ai/campaign-workspace-steering.md',
    'CLAUDE.md must point future sessions to campaign steering.'
  )
}

function main() {
  checkSteeringDocs()
  checkFirestoreRules()
  checkImportBoundaries()
  checkNoManualMetaObjectIdInput()
  checkNoInlineDatabaseRowPersistence()
  checkCampaignWorkspaceContracts()
  checkMetaObjectsHarness()

  if (failures.length > 0) {
    console.error('Campaign architecture verification failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log('Campaign architecture verification passed.')
}

main()
