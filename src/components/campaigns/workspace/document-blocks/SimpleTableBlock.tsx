'use client'

import type { CampaignBlock } from '@/types'

export function SimpleTableBlock({
  block,
  onUpdate,
}: {
  block: CampaignBlock
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const rows = (block.content.rows as string[][] | undefined) ?? [['', '', ''], ['', '', ''], ['', '', '']]
  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const next = rows.map((row) => [...row])
    next[rowIndex][colIndex] = value
    onUpdate({ ...block.content, rows: next })
  }

  return (
    <table className="w-full overflow-hidden rounded border border-gray-200 text-sm">
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-b border-gray-100 last:border-b-0">
            {row.map((cell, colIndex) => (
              <td key={colIndex} className="border-r border-gray-100 last:border-r-0">
                <input value={cell} onChange={(event) => updateCell(rowIndex, colIndex, event.target.value)} className="w-full px-2 py-1.5 outline-none focus:bg-blue-50" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
