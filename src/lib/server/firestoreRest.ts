const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const BASE_URL = PROJECT_ID
  ? `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  : ''

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } }

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, encodeValue(v)])
        ),
      },
    }
  }
  return { stringValue: String(value) }
}

function decodeValue(value: FirestoreValue): unknown {
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('booleanValue' in value) return value.booleanValue
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue)
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])
    )
  }
  return null
}

function encodeFields(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, encodeValue(value)])
  )
}

function decodeDocument(doc: { name: string; fields?: Record<string, FirestoreValue> }) {
  const id = doc.name.split('/').pop() ?? ''
  const data = Object.fromEntries(
    Object.entries(doc.fields ?? {}).map(([key, value]) => [key, decodeValue(value)])
  )
  return { id, ...data }
}

async function firestoreFetch(token: string, url: string, init?: RequestInit) {
  if (!BASE_URL) throw new Error('Firebase projectId가 설정되지 않았습니다.')
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Firestore REST 오류 (${res.status})`)
  }
  return data
}

export async function queryCollectionByField<T extends object>(
  token: string,
  collectionId: string,
  fieldPath: string,
  value: string
): Promise<T[]> {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath },
          op: 'EQUAL',
          value: encodeValue(value),
        },
      },
    },
  }
  const data = await firestoreFetch(token, `${BASE_URL}:runQuery`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return (data as { document?: { name: string; fields?: Record<string, FirestoreValue> } }[])
    .filter((row) => row.document)
    .map((row) => decodeDocument(row.document!) as T)
}

export async function listCollection<T extends object>(
  token: string,
  collectionId: string,
  pageSize = 100
): Promise<T[]> {
  const data = await firestoreFetch(token, `${BASE_URL}/${collectionId}?pageSize=${pageSize}`)
  return ((data.documents ?? []) as { name: string; fields?: Record<string, FirestoreValue> }[])
    .map((doc) => decodeDocument(doc) as T)
}

export async function createDocument(
  token: string,
  collectionId: string,
  data: Record<string, unknown>,
  documentId?: string
): Promise<string> {
  const suffix = documentId ? `?documentId=${encodeURIComponent(documentId)}` : ''
  const res = await firestoreFetch(token, `${BASE_URL}/${collectionId}${suffix}`, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields(data) }),
  })
  return String(res.name).split('/').pop() ?? ''
}

export async function patchDocument(
  token: string,
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>
): Promise<void> {
  await firestoreFetch(token, `${BASE_URL}/${collectionId}/${encodeURIComponent(documentId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encodeFields(data) }),
  })
}

export async function deleteDocument(
  token: string,
  collectionId: string,
  documentId: string
): Promise<void> {
  await firestoreFetch(token, `${BASE_URL}/${collectionId}/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  })
}
