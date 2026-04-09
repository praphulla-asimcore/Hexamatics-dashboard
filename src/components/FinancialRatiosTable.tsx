'use client'

import type { EntitySummary } from '@/types'
import { fmtPct, fmtDays, fmtLocal, collectionColor, dsoColor, overdueColor } from '@/lib/format'

interface Props {
  entities: EntitySummary[]
}

function Grade(pct: number, type: 'collection' | 'dso' | 'overdue'): { grade: string; color: string } {
  if (type === 'collection') {
    if (pct >= 95) return { grade: 'A+', color: 'text-emerald-400' }
    if (pct >= 90) return { grade: 'A', color: 'text-emerald-400' }
    if (pct >= 80) return { grade: 'B', color: 'text-emerald-500' }
    if (pct >= 70) return { grade: 'C', color: 'text-amber-400' }
    if (pct >= 60) return { grade: 'D', color: 'text-orange-400' }
    return { grade: 'F', color: 'text-red-400' }
  }
  if (type === 'dso') {
    if (pct <= 20) return { grade: 'A+', color: 'text-emerald-400' }
    if (pct <= 30) return { grade: 'A', color: 'text-emerald-400' }
    if (pct <= 45) return { grade: 'B', color: 'text-emerald-500' }
    if (pct <= 60) return { grade: 'C', color: 'text-amber-400' }
    if (pct <= 90) return { grade: 'D', color: 'text-orange-400' }
    return { grade: 'F', color: 'text-red-400' }
  }
  // overdue
  if (pct <= 5)  return { grade: 'A+', color: 'text-emerald-400' }
  if (pct <= 20) return { grade: 'A', color: 'text-emerald-400' }
  if (pct <= 35) return { grade: 'B', color: 'text-emerald-500' }
  if (pct <= 50) return { grade: 'C', color: 'text-amber-400' }
  if (pct <= 70) return { grade: 'D', color: 'text-orange-400' }
  return { grade: 'F', color: 'text-red-400' }
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function FinancialRatiosTable({ entities }: Props) {
  const active = entities.filter((e) => e.period.total > 0)
  const maxDso = Math.max(...active.map((e) => e.ratios.dso), 90)
  const maxOverdue = 100

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Entity</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Curr</th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Collection Rate</th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">DSO</th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Overdue AR</th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Top Cust Conc.</th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Avg Invoice</th>
            <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">Grade</th>
          </tr>
        </thead>
        <tbody>
          {active.map((e) => {
            const { ratios, org } = e
            const collGrade = Grade(ratios.collectionRate, 'collection')
            const dsoGrade = Grade(ratios.dso, 'dso')

            // Composite grade: average of collection + dso grades
            const gradeMap: Record<string, number> = { 'A+': 6, A: 5, B: 4, C: 3, D: 2, F: 1 }
            const avg = (gradeMap[collGrade.grade] + gradeMap[dsoGrade.grade]) / 2
            const composite = avg >= 5.5 ? 'A+' : avg >= 4.5 ? 'A' : avg >= 3.5 ? 'B' : avg >= 2.5 ? 'C' : avg >= 1.5 ? 'D' : 'F'
            const compositeColor = composite === 'A+' || composite === 'A'
              ? 'text-emerald-400' : composite === 'B'
              ? 'text-emerald-500' : composite === 'C'
              ? 'text-amber-400' : composite === 'D'
              ? 'text-orange-400' : 'text-red-400'

            return (
              <tr key={org.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition">
                <td className="px-3 py-3 font-medium text-white">{org.short}</td>
                <td className="px-3 py-3 text-gray-500 text-xs">{org.currency}</td>

                <td className="px-3 py-3 text-right">
                  <span className={`text-sm font-semibold tabular-nums ${collectionColor(ratios.collectionRate)}`}>
                    {fmtPct(ratios.collectionRate)}
                  </span>
                  <Bar value={ratios.collectionRate} max={100}
                    color={ratios.collectionRate >= 90 ? 'bg-emerald-500' : ratios.collectionRate >= 70 ? 'bg-amber-500' : 'bg-red-500'} />
                </td>

                <td className="px-3 py-3 text-right">
                  <span className={`text-sm font-semibold tabular-nums ${dsoColor(ratios.dso)}`}>
                    {fmtDays(ratios.dso)}
                  </span>
                  <Bar value={ratios.dso} max={maxDso}
                    color={ratios.dso <= 30 ? 'bg-emerald-500' : ratios.dso <= 60 ? 'bg-amber-500' : 'bg-red-500'} />
                </td>

                <td className="px-3 py-3 text-right">
                  <span className={`text-sm font-semibold tabular-nums ${overdueColor(ratios.overdueRatio)}`}>
                    {fmtPct(ratios.overdueRatio)}
                  </span>
                  <Bar value={ratios.overdueRatio} max={maxOverdue}
                    color={ratios.overdueRatio <= 20 ? 'bg-emerald-500' : ratios.overdueRatio <= 50 ? 'bg-amber-500' : 'bg-red-500'} />
                </td>

                <td className="px-3 py-3 text-right tabular-nums text-gray-300 text-sm">
                  {fmtPct(ratios.topCustomerConc)}
                </td>

                <td className="px-3 py-3 text-right tabular-nums text-gray-400 text-xs">
                  {fmtLocal(ratios.avgInvoiceValue, org.currency)}
                </td>

                <td className="px-3 py-3 text-center">
                  <span className={`text-base font-bold ${compositeColor}`}>{composite}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 px-3 text-xs text-gray-600">
        <span><span className="text-emerald-400">A+/A</span> Excellent</span>
        <span><span className="text-emerald-500">B</span> Good</span>
        <span><span className="text-amber-400">C</span> Fair</span>
        <span><span className="text-orange-400">D</span> Needs attention</span>
        <span><span className="text-red-400">F</span> Critical</span>
        <span className="ml-auto">DSO = Days Sales Outstanding · Collection Rate = Collected / Billed · Overdue = Past-due AR / Total AR</span>
      </div>
    </div>
  )
}
