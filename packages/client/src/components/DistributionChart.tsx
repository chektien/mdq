/** Horizontal bar chart for answer distribution */
export default function DistributionChart({
  distribution,
  correctOptions,
  labels,
  showCorrect = false,
}: {
  distribution: Record<string, number>;
  correctOptions?: string[];
  labels?: string[];
  showCorrect?: boolean;
}) {
  const entries = labels
    ? labels.map((l) => [l, distribution[l] || 0] as [string, number])
    : Object.entries(distribution).sort(([a], [b]) => a.localeCompare(b));

  const max = Math.max(1, ...entries.map(([, v]) => v));
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="space-y-3 w-full">
      {entries.map(([label, count]) => {
        const pct = max > 0 ? (count / max) * 100 : 0;
        const isCorrect = showCorrect && correctOptions?.includes(label);
        const barColor = showCorrect
          ? isCorrect
            ? "bg-emerald-500"
            : "bg-zinc-600"
          : "bg-indigo-500";

        return (
          <div key={label} className="flex items-center gap-3">
            <span
              className={`
                w-10 text-center font-mono font-bold text-lg shrink-0 rounded-lg py-1
                ${isCorrect ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-300"}
              `}
            >
              {label}
            </span>
            <div className="flex-1 bg-zinc-800 rounded-full h-8 overflow-hidden">
              <div
                className={`bar-fill h-full rounded-full ${barColor} flex items-center justify-end pr-3`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              >
                {count > 0 && (
                  <span className="text-white text-sm font-semibold tabular-nums">
                    {count} ({total > 0 ? Math.round((count / total) * 100) : 0}%)
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
