import { useState } from "react";

interface SessionCodeCardProps {
  qrDataUrl?: string;
  sessionCode: string;
  participantCount?: number;
  presentationUrl?: string;
  joinUrl?: string;
  shortUrl?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export default function SessionCodeCard({
  qrDataUrl,
  sessionCode,
  participantCount,
  presentationUrl,
  joinUrl,
  shortUrl,
  defaultExpanded = true,
  className = "",
}: SessionCodeCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const displayJoinUrl = shortUrl || joinUrl;
  const hasBody = qrDataUrl || presentationUrl || displayJoinUrl;
  const expandedLabel = shortUrl || "";
  const rootClassName = [
    "session-code-card",
    expanded ? "session-code-card-expanded" : "session-code-card-compact",
    className,
  ].filter(Boolean).join(" ");

  return (
    <aside className={rootClassName} aria-label="Session join details">
      <button
        type="button"
        className="session-code-card-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded && expandedLabel && <span className="session-code-card-kicker">{expandedLabel}</span>}
        <strong>{sessionCode}</strong>
        {participantCount !== undefined && <span className="session-code-card-meta">{participantCount} online</span>}
        {hasBody && <span className="session-code-card-icon" aria-hidden="true">{expanded ? "−" : "+"}</span>}
      </button>

      {expanded && hasBody && (
        <div className="session-code-card-body">
          {qrDataUrl && <img className="session-code-card-qr" src={qrDataUrl} alt="Join QR" />}
          {displayJoinUrl && <p className="session-code-card-link-text">{displayJoinUrl}</p>}
          {presentationUrl && (
            <a className="session-code-card-link" href={presentationUrl} target="_blank" rel="noopener noreferrer">
              Presentation view
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
