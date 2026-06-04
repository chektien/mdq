import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface ExpandedImage {
  src: string;
  alt?: string;
  title?: string;
}

interface ImageExpansionOverlayProps {
  image: ExpandedImage | null;
  onClose: () => void;
}

interface ExpandableImageProps extends ExpandedImage {
  className?: string;
  children?: ReactNode;
}

function getImageName(image: ExpandedImage): string {
  return image.title || image.alt || "image";
}

function getViewportSize() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function getExpandedImageWidth(
  naturalSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
): number {
  const framePaddingAllowance = 48;
  const maxFrameWidth = Math.max(180, Math.min(viewportSize.width * 0.96, 1888) - framePaddingAllowance);
  const heightReserve = Math.min(Math.max(viewportSize.height * 0.14, 112), 160);
  const maxImageHeight = Math.max(180, viewportSize.height - heightReserve);
  const widthByHeight = maxImageHeight * (naturalSize.width / naturalSize.height);
  return Math.round(Math.min(maxFrameWidth, widthByHeight));
}

export function ImageExpansionOverlay({ image, onClose }: ImageExpansionOverlayProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setNaturalSize(null);
  }, [image?.src]);

  useEffect(() => {
    if (!image) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.body.classList.add("image-expansion-lock");
    document.addEventListener("keydown", onKeyDown);
    setViewportSize(getViewportSize());
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const onResize = () => setViewportSize(getViewportSize());
    window.addEventListener("resize", onResize);

    return () => {
      document.body.classList.remove("image-expansion-lock");
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [image, onClose]);

  if (!image || typeof document === "undefined") return null;

  const imageName = getImageName(image);
  const caption = image.title || image.alt;
  const imageStyle = naturalSize && viewportSize
    ? ({
        width: `${getExpandedImageWidth(naturalSize, viewportSize)}px`,
      } satisfies CSSProperties)
    : undefined;

  return createPortal(
    <div className="image-expansion-overlay" role="dialog" aria-modal="true" aria-label={`Expanded ${imageName}`}>
      <button
        type="button"
        className="image-expansion-backdrop"
        aria-label="Close expanded image"
        onClick={onClose}
      />
      <figure className="image-expansion-frame">
        <button
          ref={closeButtonRef}
          type="button"
          className="image-expansion-close"
          aria-label="Close expanded image"
          onClick={onClose}
        >
          <span className="image-expansion-close-icon" aria-hidden="true" />
        </button>
        <div className="image-expansion-media">
          <img
            className="image-expansion-image"
            src={image.src}
            alt={image.alt || ""}
            title={image.title}
            style={imageStyle}
            onLoad={(event) => {
              const target = event.currentTarget;
              if (target.naturalWidth > 0 && target.naturalHeight > 0) {
                setNaturalSize({ width: target.naturalWidth, height: target.naturalHeight });
              }
            }}
          />
        </div>
        {caption && <figcaption className="image-expansion-caption">{caption}</figcaption>}
      </figure>
    </div>,
    document.body,
  );
}

export function ExpandableImage({ src, alt, title, className, children }: ExpandableImageProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [expandedImage, setExpandedImage] = useState<ExpandedImage | null>(null);

  const closeExpandedImage = useCallback(() => {
    setExpandedImage(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const image: ExpandedImage = { src, alt, title };
  const imageName = getImageName(image);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className ? `expandable-image-button ${className}` : "expandable-image-button"}
        aria-label={`Expand ${imageName}`}
        onClick={() => setExpandedImage(image)}
      >
        {children || (
          <>
            <img src={src} alt={alt || ""} title={title} />
            <span className="image-expand-cue" aria-hidden="true" />
          </>
        )}
      </button>
      <ImageExpansionOverlay image={expandedImage} onClose={closeExpandedImage} />
    </>
  );
}
