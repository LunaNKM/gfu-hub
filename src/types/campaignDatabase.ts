import type {
  CampaignBusinessType,
  CampaignDataColumn,
  CampaignDataRow,
} from './index'

export interface CampaignDatabaseSchema {
  id: string
  campaignId: string
  title: string
  businessType: CampaignBusinessType
  order: number
  columns: CampaignDataColumn[]
  rowCount?: number
  clientVisible: boolean
  clientEditable: boolean
  createdAt: Date | string
  updatedAt: Date | string
  createdBy: string
  updatedBy: string
}

export interface CampaignDatabaseRow {
  id: string
  campaignId: string
  databaseId: string
  cells: CampaignDataRow['cells']
  order: number
  createdAt: Date | string
  updatedAt: Date | string
}

export type LegacyCampaignDatabaseRow = CampaignDataRow

export type CampaignDatabaseRows =
  | CampaignDatabaseRow[]
  | LegacyCampaignDatabaseRow[]

export interface CampaignDatabaseDocument extends CampaignDatabaseSchema {
  rows: CampaignDatabaseRows
}

export function normalizeCampaignDatabaseRow(
  row: CampaignDatabaseRow | LegacyCampaignDatabaseRow,
  params: { campaignId: string; databaseId: string; index?: number }
): CampaignDatabaseRow {
  if ('databaseId' in row && 'campaignId' in row && 'order' in row) {
    return row
  }

  const now = new Date().toISOString()
  return {
    id: row.id,
    campaignId: params.campaignId,
    databaseId: params.databaseId,
    cells: row.cells,
    order: ((params.index ?? 0) + 1) * 1000,
    createdAt: now,
    updatedAt: now,
  }
}

export function splitCampaignDatabase<T extends CampaignDatabaseDocument>(
  database: T
): { schema: CampaignDatabaseSchema; rows: CampaignDatabaseRow[] } {
  const { rows, ...schema } = database
  return {
    schema: {
      ...schema,
      rowCount: database.rowCount ?? rows.length,
    },
    rows: rows.map((row, index) =>
      normalizeCampaignDatabaseRow(row, {
        campaignId: database.campaignId,
        databaseId: database.id,
        index,
      })
    ),
  }
}

export function hydrateCampaignDatabase(
  schema: CampaignDatabaseSchema,
  rows: CampaignDatabaseRow[] = []
): CampaignDatabaseDocument {
  return {
    ...schema,
    rowCount: schema.rowCount ?? rows.length,
    rows,
  }
}

export function normalizeCampaignDatabase<T extends CampaignDatabaseDocument>(
  database: T
): T {
  const { schema, rows } = splitCampaignDatabase(database)
  return hydrateCampaignDatabase(schema, rows) as T
}
