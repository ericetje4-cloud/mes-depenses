// ===========================================================================
// Graphiques Recharts (camembert + barres/courbe), responsives, dark-mode.
// ===========================================================================

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import type { CategorySlice, MonthlyPoint } from '@/lib/store-utils';
import { formatEUR } from '@/lib/format';

// Couleurs adaptatives via une fonction qui lit le thème courant.
function useChartColors() {
  // On détecte le dark mode via la classe sur <html>.
  const isDark = document.documentElement.classList.contains('dark');
  return {
    grid: isDark ? '#1e293b' : '#e2e8f0',
    axis: isDark ? '#64748b' : '#94a3b8',
    tooltipBg: isDark ? '#0f172a' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    text: isDark ? '#e2e8f0' : '#0f172a',
  };
}

// ---------------------------------------------------------------------------
// Camembert : répartition par catégorie
// ---------------------------------------------------------------------------

export function CategoryPieChart({
  data,
  height = 240,
}: {
  data: CategorySlice[];
  height?: number;
}) {
  const c = useChartColors();

  if (data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-sm text-slate-400">Aucune donnée</div>;
  }

  // Données simplifiées pour le chart.
  const chartData = data.map((d) => ({
    name: d.label,
    value: Math.round(d.amount * 100) / 100,
    color: d.color,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={85}
          paddingAngle={2}
          stroke="none"
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: c.tooltipBg,
            border: `1px solid ${c.tooltipBorder}`,
            borderRadius: 12,
            fontSize: 13,
          }}
          formatter={(value) => [formatEUR(Number(value)), 'Montant']}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Barres : évolution mensuelle
// ---------------------------------------------------------------------------

export function MonthlyBarChart({
  data,
  height = 200,
}: {
  data: MonthlyPoint[];
  height?: number;
}) {
  const c = useChartColors();

  const chartData = data.map((d) => ({
    name: d.label,
    montant: Math.round(d.amount * 100) / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.grid} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: c.axis }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: c.axis }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`)}
        />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.3 }}
          contentStyle={{
            background: c.tooltipBg,
            border: `1px solid ${c.tooltipBorder}`,
            borderRadius: 12,
            fontSize: 13,
          }}
          formatter={(value) => [formatEUR(Number(value)), 'Dépenses']}
        />
        <Bar dataKey="montant" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Courbe : évolution mensuelle (alternative)
// ---------------------------------------------------------------------------

export function MonthlyLineChart({
  data,
  height = 200,
}: {
  data: MonthlyPoint[];
  height?: number;
}) {
  const c = useChartColors();

  const chartData = data.map((d) => ({
    name: d.label,
    montant: Math.round(d.amount * 100) / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.grid} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: c.axis }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: c.axis }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`)}
        />
        <Tooltip
          contentStyle={{
            background: c.tooltipBg,
            border: `1px solid ${c.tooltipBorder}`,
            borderRadius: 12,
            fontSize: 13,
          }}
          formatter={(value) => [formatEUR(Number(value)), 'Dépenses']}
        />
        <Line
          type="monotone"
          dataKey="montant"
          stroke="#6366f1"
          strokeWidth={2.5}
          dot={{ r: 3, fill: '#6366f1' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Mini sparkline : total mensuel (petit graphique inline)
// ---------------------------------------------------------------------------

export function TrendSparkline({
  data,
  width = 120,
  height = 36,
}: {
  data: MonthlyPoint[];
  width?: number;
  height?: number;
}) {
  const chartData = data.map((d) => ({ v: d.amount }));
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
