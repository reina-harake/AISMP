import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../i18n';

/** Horizontal bars for complaints per category (simple, readable, RTL-safe). */
export function CategoryBars({ rows, group = 'category' }) {
  const { t, fmtNum } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bars">
      {rows.map((r) => {
        const label = r.label || t(`${group}.${r.key}`);
        return (
        <div className="bar-row" key={r.key}>
          <span>{label}</span>
          <div className="bar-track" role="img" aria-label={`${label}: ${r.count}`}>
            <div className="bar-fill" style={{ width: `${(r.count / max) * 100}%`, background: r.color }} />
          </div>
          <span className="n">{fmtNum(r.count)}</span>
        </div>
        );
      })}
    </div>
  );
}

/** Complaints received per day. */
export function DailyChart({ rows, days }) {
  const { t, lang, fmtDate } = useI18n();
  // fill missing days with zero so the axis is continuous
  const map = Object.fromEntries(rows.map((r) => [String(r.day).slice(0, 10), r.count]));
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    data.push({ day: key, count: map[key] || 0 });
  }
  const rtl = lang === 'ar';
  return (
    <div style={{ width: '100%', height: 220 }} dir="ltr">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#efeae2" />
          <XAxis dataKey="day" reversed={rtl} tickFormatter={(d) => new Date(d).getDate()} tick={{ fontSize: 11, fill: '#6e7276' }}
            interval={Math.max(0, Math.floor(days / 10) - 1)} tickLine={false} axisLine={{ stroke: '#e2dbd0' }} />
          <YAxis allowDecimals={false} orientation={rtl ? 'right' : 'left'} tick={{ fontSize: 11, fill: '#6e7276' }}
            tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#e3ecf3' }} labelFormatter={(d) => fmtDate(d)}
            formatter={(v) => [v, t('dash.count')]} />
          <Bar dataKey="count" fill="#0B476C" radius={[2, 2, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
