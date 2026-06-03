import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface LiveSurfaceAction {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  tone?: "neutral" | "primary" | "warning" | "danger";
}

interface LiveSurfaceProps {
  children: ReactNode;
  mode?: "projector" | "review" | "student";
  surfaceClassName?: string;
  nextLabel?: string | null;
  statusLabel?: string | null;
  statusTone?: "neutral" | "success" | "warning";
  positionLabel?: string;
  qrDataUrl?: string;
  sessionCode?: string;
  participantCount?: number;
  presentationUrl?: string;
  showFullscreenButton?: boolean;
  actions?: LiveSurfaceAction[];
}

export default function LiveSurface({
  children,
  mode = "projector",
  surfaceClassName,
  nextLabel,
  statusLabel,
  statusTone = "neutral",
  positionLabel,
  qrDataUrl,
  sessionCode,
  participantCount,
  presentationUrl,
  showFullscreenButton = true,
  actions = [],
}: LiveSurfaceProps) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hasJoinInfo = qrDataUrl || sessionCode || participantCount !== undefined || presentationUrl;
  const hasActions = actions.length > 0;
  const className = [
    "slide-surface",
    `slide-surface-${mode}`,
    surfaceClassName,
  ].filter(Boolean).join(" ");

  useEffect(() => {
    if (typeof document === "undefined") return;

    setFullscreenSupported(document.fullscreenEnabled);
    const syncFullscreenState = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const requestFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;

    const target = document.documentElement || surfaceRef.current;
    if (!target || !document.fullscreenEnabled) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied by the browser; leave the surface usable.
    }
  }, []);

  return (
    <section ref={surfaceRef} className={className}>
      <div className="slide-safe">
        <div className="slide-toolbar">
          <div className="slide-toolbar-stack">
            {statusLabel && <span className={`slide-status-pill slide-status-pill-${statusTone}`}>{statusLabel}</span>}
            {nextLabel && (
              <div className="slide-next-up" aria-label={`Next up: ${nextLabel}`}>
                <span>Next up</span>
                <strong>{nextLabel}</strong>
              </div>
            )}
          </div>
          {(hasActions || (showFullscreenButton && fullscreenSupported)) && (
            <div className="slide-toolbar-actions" aria-label="Presentation controls">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={`slide-action-button slide-action-button-${action.tone || "neutral"}`}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.label}
                </button>
              ))}
              {showFullscreenButton && fullscreenSupported && (
                <button
                  type="button"
                  className="slide-fullscreen-button"
                  onClick={requestFullscreen}
                  aria-label={isFullscreen ? "Exit full screen" : "Open full screen"}
                  aria-pressed={isFullscreen}
                >
                  {isFullscreen ? "Exit full screen" : "Full screen"}
                </button>
              )}
            </div>
          )}
        </div>

        {children}

        {hasJoinInfo && (
          <aside className="slide-join-panel" aria-label="Session join details">
            {qrDataUrl && <img src={qrDataUrl} alt="Join QR" />}
            {sessionCode && (
              <>
                <span className="slide-join-label">Session code</span>
                <strong>{sessionCode}</strong>
              </>
            )}
            {participantCount !== undefined && <span className="slide-join-meta">{participantCount} online</span>}
            {presentationUrl && (
              <a href={presentationUrl} target="_blank" rel="noopener noreferrer">
                Presentation view
              </a>
            )}
          </aside>
        )}

        {positionLabel && <p className="slide-counter">{positionLabel}</p>}
      </div>
    </section>
  );
}
