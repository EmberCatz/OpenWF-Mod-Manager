import { useEffect, useState } from "react";
import type { ModAnalytics, ModAnalyticsWeek } from "@openwf-mod-manager/shared";
import { fetchModAnalytics } from "../api";

// Single-hue-per-metric bar chart, plain HTML/CSS rather than SVG — each
// week is one column, the bar capped at 24px and rounded only at the top
// (square at the baseline), a 2px gap between bars. A native `title`
// carries the per-bar hover value (category + value, same as any other
// chart's hover layer) without needing custom tooltip positioning for what
// is a small embedded widget, not a dashboard. The single highest bar gets
// a direct label — "the extreme" — everything else is reachable via hover
// or the plain-number table below, never gated behind color/height alone.
function WeeklyBarChart({
  weeks,
  valueOf,
  color,
  formatValue,
  emptyMessage,
}: {
  weeks: ModAnalyticsWeek[];
  valueOf: (w: ModAnalyticsWeek) => number | null;
  color: string;
  formatValue: (v: number) => string;
  emptyMessage: string;
}) {
  const values = weeks.map(valueOf);
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));

  if (max <= 0) {
    return <p className="muted analytics-chart__empty">{emptyMessage}</p>;
  }

  let maxIndex = -1;
  values.forEach((v, i) => {
    if (v !== null && (maxIndex === -1 || v > (values[maxIndex] as number))) maxIndex = i;
  });

  return (
    <div className="analytics-chart">
      {weeks.map((w, i) => {
        const v = values[i];
        // A real-but-tiny value still gets a sliver of visible bar (6%
        // floor) rather than rounding to nothing — zero height and "no
        // data" should never look the same.
        const heightPct = v === null ? 0 : Math.max((v / max) * 100, v > 0 ? 6 : 0);
        return (
          <div
            key={w.weekStart}
            className="analytics-chart__col"
            title={v !== null ? `Week of ${w.weekStart}: ${formatValue(v)}` : `Week of ${w.weekStart}: no data`}
          >
            {i === maxIndex && v !== null && <span className="analytics-chart__value">{formatValue(v)}</span>}
            <div className="analytics-chart__bar" style={{ height: `${heightPct}%`, background: v !== null ? color : "transparent" }} />
          </div>
        );
      })}
    </div>
  );
}

// Colors match how these two metrics already read elsewhere in the app —
// blue is the existing "download" association (button--download), gold is
// the app's own accent (badges, active tab, highlights) — rather than
// introducing a new palette just for this one panel.
const DOWNLOADS_COLOR = "#3d6fd6";
const RATING_COLOR = "#e0a339";

export default function AuthorAnalyticsPanel({ modId, apiKey }: { modId: string; apiKey: string }) {
  const [data, setData] = useState<ModAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    fetchModAnalytics(modId, apiKey)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [modId, apiKey]);

  if (error) return <p className="error">{error}</p>;
  if (!data) {
    return (
      <p>
        <span className="spinner" /> Loading analytics…
      </p>
    );
  }

  const totalDownloads = data.weeks.reduce((sum, w) => sum + w.downloads, 0);

  return (
    <div className="analytics-panel fade-in">
      <p className="hint">
        Last {data.weeks.length} weeks, oldest first — each bucket is a fixed 7-day window counting back from today,
        not a calendar week.
      </p>

      <h5 className="analytics-panel__title">Downloads ({totalDownloads} total)</h5>
      <WeeklyBarChart
        weeks={data.weeks}
        valueOf={(w) => w.downloads}
        color={DOWNLOADS_COLOR}
        formatValue={(v) => `${v} download${v === 1 ? "" : "s"}`}
        emptyMessage="No downloads recorded in this window yet."
      />

      <h5 className="analytics-panel__title">Average rating</h5>
      <WeeklyBarChart
        weeks={data.weeks}
        valueOf={(w) => w.averageRating}
        color={RATING_COLOR}
        formatValue={(v) => `${v.toFixed(1)} / 5`}
        emptyMessage="No ratings submitted in this window yet."
      />

      <button className="button analytics-panel__table-toggle" onClick={() => setShowTable((s) => !s)}>
        {showTable ? "Hide" : "Show"} as a table
      </button>
      {showTable && (
        <table className="admin-table analytics-panel__table">
          <thead>
            <tr>
              <th>Week of</th>
              <th>Downloads</th>
              <th>Reviews</th>
              <th>Avg rating</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr key={w.weekStart}>
                <td>{w.weekStart}</td>
                <td>{w.downloads}</td>
                <td>{w.reviewCount}</td>
                <td>{w.averageRating !== null ? w.averageRating.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
