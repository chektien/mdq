/** Countdown timer ring for projector display */
export default function Timer({
  remainingSec,
  totalSec,
  size = 120,
}: {
  remainingSec: number;
  totalSec: number;
  size?: number;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSec > 0 ? remainingSec / totalSec : 0;
  const offset = circumference * (1 - progress);
  const urgent = remainingSec <= 5 && remainingSec > 0;

  // Color transitions: green -> yellow -> red
  const color =
    remainingSec > totalSec * 0.5
      ? "#22c55e"
      : remainingSec > totalSec * 0.2
        ? "#eab308"
        : "#ef4444";

  return (
    <div
      className={`relative inline-flex items-center justify-center ${urgent ? "timer-urgent" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth="8"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.5s" }}
        />
      </svg>
      <span
        className="absolute font-mono font-bold"
        style={{ fontSize: size * 0.32, color }}
      >
        {remainingSec}
      </span>
    </div>
  );
}
