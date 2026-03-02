import type { LeaderboardEntry } from "@md-quiz/shared";

/** Leaderboard table with staggered animation */
export default function Leaderboard({
  entries,
  totalQuestions,
  highlightStudentId,
  maxRows = 10,
}: {
  entries: LeaderboardEntry[];
  totalQuestions: number;
  highlightStudentId?: string;
  maxRows?: number;
}) {
  const visible = entries.slice(0, maxRows);

  // Medal colors for top 3
  const medalColor = (rank: number) => {
    if (rank === 1) return "text-amber-400";
    if (rank === 2) return "text-zinc-300";
    if (rank === 3) return "text-amber-600";
    return "text-zinc-500";
  };

  const medalIcon = (rank: number) => {
    if (rank === 1) return "1st";
    if (rank === 2) return "2nd";
    if (rank === 3) return "3rd";
    return `#${rank}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="space-y-2">
        {visible.map((entry, i) => {
          const isHighlighted = entry.studentId === highlightStudentId;
          return (
            <div
              key={entry.studentId}
              className={`
                lb-row flex items-center gap-4 px-5 py-3 rounded-xl
                ${isHighlighted ? "bg-indigo-600/30 border border-indigo-500/50" : "bg-zinc-800/80"}
                ${i < 3 ? "border border-zinc-700/50" : ""}
              `}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Rank */}
              <span
                className={`w-12 text-center font-bold text-lg shrink-0 ${medalColor(entry.rank)}`}
              >
                {medalIcon(entry.rank)}
              </span>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <span className="text-white font-medium truncate block">
                  {entry.displayName || entry.studentId}
                </span>
                {entry.displayName && (
                  <span className="text-zinc-500 text-sm">{entry.studentId}</span>
                )}
              </div>

              {/* Score */}
              <div className="text-right shrink-0">
                <span className="text-white font-bold text-lg tabular-nums">
                  {entry.correctCount}/{totalQuestions}
                </span>
                <span className="text-zinc-500 text-sm block tabular-nums">
                  {(entry.totalTimeMs / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {entries.length > maxRows && (
        <p className="text-center text-zinc-500 mt-4 text-sm">
          +{entries.length - maxRows} more participants
        </p>
      )}
    </div>
  );
}
