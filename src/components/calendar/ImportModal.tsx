'use client'

import React, { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react'
import { AdCalendarBrand } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AdCampaignInput } from '@/lib/services/adCalendar'
import {
  ColumnMap,
  EMPTY_COLUMN,
  MediaMixSheet,
  ParsedCampaign,
  fillDownMerged,
  guessColumnMap,
  guessHeaderRow,
  parseCampaigns,
  readMediaMixFile,
} from '@/lib/adCalendar/mediaMix'
import { formatMoney, rangeDays, toDateString } from '@/lib/adCalendar/format'

interface ImportModalProps {
  isOpen: boolean
  brands: AdCalendarBrand[]
  month: Date
  onClose: () => void
  onImport: (items: AdCampaignInput[]) => Promise<number>
}

const FIELD =
  'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const LABEL = 'text-[11px] font-semibold text-gray-500'

const COLUMN_FIELDS: { key: keyof ColumnMap; label: string; required?: boolean }[] = [
  { key: 'channel', label: '주요채널' },
  { key: 'campaign', label: '캠페인 (기간 포함)', required: true },
  { key: 'media', label: '매체' },
  { key: 'objective', label: '목표' },
  { key: 'target', label: '타겟' },
  { key: 'budgetJp', label: 'JP 넷 예산', required: true },
  { key: 'budgetKr', label: 'KR 넷 예산' },
  { key: 'daily', label: '일예산 (산정일수 역산용)' },
]

/**
 * 미디어믹스 xlsx 업로드.
 * 시트 레이아웃이 제각각이라 자동 추정한 열 매핑을 사용자가 고칠 수 있게 하고,
 * 미리보기에서 캠페인명·기간을 확정한 뒤 저장한다.
 */
export function ImportModal({ isOpen, brands, month, onClose, onImport }: ImportModalProps) {
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<MediaMixSheet[]>([])
  const [sheetName, setSheetName] = useState('')
  const [headerRow, setHeaderRow] = useState(0)
  const [map, setMap] = useState<ColumnMap | null>(null)
  const [brandId, setBrandId] = useState('')
  const [baseYear, setBaseYear] = useState(month.getFullYear())
  const [campaigns, setCampaigns] = useState<ParsedCampaign[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sheet = sheets.find((s) => s.name === sheetName)

  const columnOptions = useMemo(() => {
    if (!sheet) return []
    const header = sheet.rows[headerRow] ?? []
    const width = Math.max(header.length, ...sheet.rows.slice(0, 40).map((r) => r?.length ?? 0))
    return Array.from({ length: width }, (_, index) => {
      const raw = header[index]
      const text = raw === null || raw === undefined ? '' : String(raw).replace(/\s+/g, ' ').trim()
      return { index, label: `${XLSX.utils.encode_col(index)}${text ? ` · ${text.slice(0, 22)}` : ''}` }
    })
  }, [sheet, headerRow])

  const reset = () => {
    setFileName('')
    setSheets([])
    setSheetName('')
    setMap(null)
    setCampaigns([])
    setExcluded(new Set())
    setError(null)
  }

  const applySheet = (target: MediaMixSheet, year: number) => {
    const guessedHeader = guessHeaderRow(target.rows)
    const guessedMap = guessColumnMap(target.rows[guessedHeader] ?? [])
    setSheetName(target.name)
    setHeaderRow(guessedHeader)
    setMap(guessedMap)
    runParse(target, guessedHeader, guessedMap, year)
  }

  const runParse = (
    target: MediaMixSheet,
    header: number,
    columnMap: ColumnMap,
    year: number
  ) => {
    const monthStart = new Date(year, month.getMonth(), 1)
    const monthEnd = new Date(year, month.getMonth() + 1, 0)
    const parsed = fillDownMerged(
      parseCampaigns(target.rows, {
        headerRow: header,
        map: columnMap,
        baseYear: year,
        fallbackStart: toDateString(monthStart),
        fallbackEnd: toDateString(monthEnd),
      })
    )
    setCampaigns(parsed)
    setExcluded(new Set())
  }

  const handleFile = async (file: File) => {
    setError(null)
    try {
      const parsedSheets = readMediaMixFile(await file.arrayBuffer())
      setFileName(file.name)
      setSheets(parsedSheets)
      setBrandId((prev) => prev || brands[0]?.id || '')
      // 시트가 여러 장이라 자동 선택은 하지 않는다. 다만 한 장이면 바로 연다.
      if (parsedSheets.length === 1) applySheet(parsedSheets[0], baseYear)
      else {
        setSheetName('')
        setCampaigns([])
      }
    } catch (err) {
      console.error('미디어믹스 파싱 오류:', err)
      setError('엑셀 파일을 읽지 못했습니다. xlsx 형식인지 확인해 주세요.')
    }
  }

  const patchCampaign = (key: string, patch: Partial<ParsedCampaign>) => {
    setCampaigns((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  const selected = campaigns.filter((c) => !excluded.has(c.key))

  const handleImport = async () => {
    if (!brandId || selected.length === 0) return
    setSaving(true)
    try {
      const importedAt = new Date()
      await onImport(
        selected.map((campaign) => ({
          brandId,
          name: campaign.name,
          channel: campaign.channel,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          color: campaign.color,
          source: { fileName, sheetName, importedAt },
          lines: campaign.lines.map(({ sheetDaily: _sheetDaily, ...line }) => line),
        }))
      )
      reset()
      onClose()
    } catch (err) {
      console.error('미디어믹스 저장 오류:', err)
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        reset()
        onClose()
      }}
      title="미디어믹스 업로드"
      size="lg"
    >
      <div className="flex max-h-[72vh] flex-col gap-4 overflow-y-auto pr-1">
        {brands.length === 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            브랜드를 먼저 추가해 주세요. 캠페인은 브랜드에 붙습니다.
          </p>
        )}

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-6 transition-colors hover:border-blue-400 hover:bg-blue-50/40">
          <Upload size={20} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">
            {fileName || '미디어믹스 xlsx 파일 선택'}
          </span>
          <span className="text-[11px] text-gray-400">
            시트를 고르면 열 매핑을 자동으로 추정합니다
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {sheets.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>시트</span>
              <select
                className={FIELD}
                value={sheetName}
                onChange={(e) => {
                  const target = sheets.find((s) => s.name === e.target.value)
                  if (target) applySheet(target, baseYear)
                }}
              >
                <option value="">시트 선택...</option>
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>브랜드</span>
              <select className={FIELD} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>기준 연도</span>
              <input
                type="number"
                className={FIELD}
                value={baseYear}
                onChange={(e) => {
                  const year = Number(e.target.value) || month.getFullYear()
                  setBaseYear(year)
                  if (sheet && map) runParse(sheet, headerRow, map, year)
                }}
              />
            </label>
          </div>
        )}

        {sheet && map && (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileSpreadsheet size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-900">열 매핑</span>
              <label className="ml-auto flex items-center gap-1.5">
                <span className={LABEL}>헤더 행</span>
                <input
                  type="number"
                  min={1}
                  value={headerRow + 1}
                  onChange={(e) => {
                    const next = Math.max(0, (Number(e.target.value) || 1) - 1)
                    setHeaderRow(next)
                    const guessed = guessColumnMap(sheet.rows[next] ?? [])
                    setMap(guessed)
                    runParse(sheet, next, guessed, baseYear)
                  }}
                  className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {COLUMN_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1">
                  <span className={LABEL}>
                    {field.label}
                    {field.required && <span className="text-red-400"> *</span>}
                  </span>
                  <select
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
                    value={map[field.key]}
                    onChange={(e) => {
                      const next = { ...map, [field.key]: Number(e.target.value) }
                      setMap(next)
                      runParse(sheet, headerRow, next, baseYear)
                    }}
                  >
                    <option value={EMPTY_COLUMN}>없음</option>
                    {columnOptions.map((option) => (
                      <option key={option.index} value={option.index}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {sheet && campaigns.length === 0 && (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            이 시트에서 캠페인을 찾지 못했습니다. 헤더 행과 열 매핑을 확인해 주세요.
          </p>
        )}

        {campaigns.length > 0 && (
          <div>
            <div className="mb-2 flex items-center">
              <h3 className="text-sm font-bold text-gray-900">
                미리보기 ({selected.length}/{campaigns.length}건)
              </h3>
              <span className="ml-2 text-[11px] text-gray-400">
                이름과 기간은 여기서 고칠 수 있습니다
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {campaigns.map((campaign) => {
                const included = !excluded.has(campaign.key)
                const totalJp = campaign.lines.reduce((sum, l) => sum + l.budgetJpNet, 0)
                const span = rangeDays(campaign.startDate, campaign.endDate)

                return (
                  <div
                    key={campaign.key}
                    className={`rounded-lg border p-2.5 ${
                      included ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() =>
                          setExcluded((prev) => {
                            const next = new Set(prev)
                            if (next.has(campaign.key)) next.delete(campaign.key)
                            else next.add(campaign.key)
                            return next
                          })
                        }
                        className="h-3.5 w-3.5 accent-blue-500"
                      />
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[13px] font-semibold outline-none focus:border-blue-500"
                        value={campaign.name}
                        onChange={(e) => patchCampaign(campaign.key, { name: e.target.value })}
                      />
                      <input
                        className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 outline-none focus:border-blue-500"
                        value={campaign.channel}
                        onChange={(e) => patchCampaign(campaign.key, { channel: e.target.value })}
                        placeholder="채널"
                      />
                      <input
                        type="date"
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
                        value={campaign.startDate}
                        onChange={(e) => patchCampaign(campaign.key, { startDate: e.target.value })}
                      />
                      <span className="text-xs text-gray-400">~</span>
                      <input
                        type="date"
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
                        value={campaign.endDate}
                        onChange={(e) => patchCampaign(campaign.key, { endDate: e.target.value })}
                      />
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6 text-[11px] text-gray-500">
                      <span>
                        라인 {campaign.lines.length}개 · {span}일 · JP 넷{' '}
                        {formatMoney(totalJp, 'JPY')}
                      </span>
                      {campaign.needsDates && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                          <AlertTriangle size={10} />
                          기간을 못 읽었습니다. 직접 지정해 주세요
                        </span>
                      )}
                      {campaign.lines.some((l) => l.days !== span) && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                          <AlertTriangle size={10} />
                          믹스안 산정일수가 기간과 다른 라인 있음
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="text-[11px] text-gray-400">
            산정일수가 다른 라인은 믹스안 값 그대로 저장하고 캠페인 수정에서 고칠 수 있습니다
          </span>
          <div className="flex-1" />
          <Button
            variant="secondary"
            onClick={() => {
              reset()
              onClose()
            }}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            onClick={handleImport}
            loading={saving}
            disabled={!brandId || selected.length === 0}
          >
            {selected.length}건 가져오기
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default ImportModal
