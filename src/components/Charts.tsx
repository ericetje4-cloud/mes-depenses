import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CategoryTotal } from '../lib/format'
import { formatEUR, monthLabel } from '../lib/format'

/** Camembert de répartition par catégorie. */
export function CategoryPieChart({ data }: { data: CategoryTotal[] }) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.categoryId} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatEUR(Number(value))}
          contentStyle={{
            borderRadius: 12,
            border: 'none',
            background: 'rgba(15,23,42,0.9)',
            color: '#fff',
            fontSize: 12,
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

/** Graphique en barres : évolution mensuelle. */
export function MonthlyBarChart({ data }: { data: { key: string; total: number }[] }) {
  const chartData = data.map((d) => ({
    name: monthLabel(d.key).split(' ')[0].slice(0, 4),
    total: d.total,
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: 'currentColor' }}
          axisLine={false}
          tickLine={false}
          className="fill-slate-400"
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'currentColor' }}
          axisLine={false}
          tickLine={false}
          className="fill-slate-400"
          tickFormatter={(v: number) => `${Math.round(v)}`}
        />
        <Tooltip
          formatter={(value) => formatEUR(Number(value))}
          cursor={{ fill: 'rgba(99,102,241,0.08)' }}
          contentStyle={{
            borderRadius: 12,
            border: 'none',
            background: 'rgba(15,23,42,0.9)',
            color: '#fff',
            fontSize: 12,
          }}
        />
        <Bar dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
