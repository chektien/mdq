import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlideVideo } from "@mdq/shared";

/**
 * A contained, clickable playable-video card that belongs to the same visual
 * family as image thumbnails: the poster sits in a media figure with a
 * caption beneath it, styled exactly like ExpandableImage captions. A centred
 * play affordance marks it as playable. Clicking opens a modal player that
 * loads the embed in an iframe. Modelled on the ImageExpansion overlay: portal
 * to document.body, Escape-to-close, backdrop click, scroll lock, and the same
 * close control.
 */
export default function VideoCard({ video, title }: { video: SlideVideo; title: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = video.label || "Play video";
  const caption = video.caption;

  const closeOverlay = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  return (
    <figure className="slide-video-figure">
      <button
        ref={triggerRef}
        type="button"
        className="slide-video-card"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${title}`}
      >
        {video.thumbnail ? (
          <img className="slide-video-card-thumb" src={video.thumbnail} alt="" />
        ) : (
          <span className="slide-video-card-thumb slide-video-card-thumb-empty" aria-hidden="true" />
        )}
        <span className="slide-video-card-play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="40" height="40" focusable="false">
            <circle cx="12" cy="12" r="12" fill="rgba(10,12,20,0.72)" />
            <path d="M9.5 7.5v9l7-4.5-7-4.5z" fill="#fff" />
          </svg>
        </span>
      </button>
      {caption && <figcaption>{caption}</figcaption>}
      {open && <VideoOverlay video={video} title={title} onClose={closeOverlay} />}
    </figure>
  );
}

function isNativeVideoUrl(url: string): boolean {
  const pathname = (() => {
    try {
      return new URL(url, window.location.href).pathname;
    } catch {
      return url.split(/[?#]/, 1)[0];
    }
  })();
  return /\.(mp4|m4v|webm|mov)$/i.test(pathname);
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
  const nativeVideo = isNativeVideoUrl(video.embedUrl);
  return createPortal(
    <div className="video-expansion-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="video-expansion-backdrop" aria-label="Close expanded video" onClick={onClose} />
      <div className="video-expansion-frame" ref={frameRef}>
        <button
          type="button"
          ref={closeRef}
          className="image-expansion-close"
          onClick={onClose}
          aria-label="Close expanded video"
        >
          <span className="image-expansion-close-icon" aria-hidden="true" />
        </button>
        <div className="video-expansion-player">
          {nativeVideo ? (
            <video
              className="video-expansion-native"
              src={video.embedUrl}
              poster={video.thumbnail}
              controls
              playsInline
              preload="metadata"
              autoPlay
              aria-label={title}
            />
          ) : (
            <iframe
              className="video-expansion-iframe"
              src={video.embedUrl}
              title={title}
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          )}
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
