import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlideVideo } from "@mdq/shared";

/**
 * A contained, clickable playable-video card. Shows a poster thumbnail with
 * a play affordance and an in-thumbnail caption. Clicking the card opens a
 * modal player that loads the embed in an iframe and provides a fallback link
 * if the embed is blocked. Modelled on the ImageExpansion overlay:
 * portal to document.body, Escape-to-close, backdrop click, scroll lock.
 */
export default function VideoCard({ video, title }: { video: SlideVideo; title: string }) {
  const [open, setOpen] = useState(false);
  const label = video.label || "Play video";
  const caption = video.caption;
  const overlayCaption = caption || label;
  return (
    <div className="slide-video-card-wrap">
      <button
        type="button"
        className="slide-video-card"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${title}`}
      >
        {video.thumbnail ? (
          <img className="slide-video-card-thumb" src={video.thumbnail} alt={title} />
        ) : (
          <span className="slide-video-card-thumb slide-video-card-thumb-empty" aria-hidden="true" />
        )}
        <span className="slide-video-card-play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="40" height="40" focusable="false">
            <circle cx="12" cy="12" r="12" fill="rgba(10,12,20,0.72)" />
            <path d="M9.5 7.5v9l7-4.5-7-4.5z" fill="#fff" />
          </svg>
        </span>
        <span className="slide-video-card-badge">{overlayCaption}</span>
      </button>
      {open && <VideoOverlay video={video} title={title} onClose={() => setOpen(false)} />}
    </div>
  );
}

function VideoOverlay({
  video,
  title,
  onClose,
}: {
  video: SlideVideo;
  title: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Tab" && frameRef.current) {
        const focusables = Array.from(
          frameRef.current.querySelectorAll<HTMLElement>(
            'button, a[href], iframe, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("image-expansion-lock");
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("image-expansion-lock");
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="video-expansion-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="video-expansion-backdrop" aria-label="Close video" onClick={onClose} />
      <div className="video-expansion-frame" ref={frameRef}>
        <button type="button" ref={closeRef} className="video-expansion-close" onClick={onClose} aria-label="Close video">
          Close
        </button>
        <div className="video-expansion-player">
          <iframe
            className="video-expansion-iframe"
            src={video.embedUrl}
            title={title}
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
        <a
          className="video-expansion-fallback"
          href={video.embedUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          If the player does not load, open the video in a new tab
        </a>
      </div>
    </div>,
    document.body,
  );
}
