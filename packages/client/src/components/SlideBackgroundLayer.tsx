import type { CSSProperties } from "react";
import type { SlideBackground } from "@mdq/shared";

/**
 * Decorative, non-interactive full-canvas background layer for a slide.
 * Rendered as a direct child of `.slide-surface`, behind `.slide-safe`.
 */
export default function SlideBackgroundLayer({ background }: { background: SlideBackground }) {
  const style: CSSProperties = {
    backgroundImage: `url("${background.src}")`,
  };
  if (background.position) style.backgroundPosition = background.position;
  if (background.size) style.backgroundSize = background.size;
  return <div className="slide-bg-layer" aria-hidden="true" style={style} />;
}
