import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, VolumeX } from "lucide-react";
import { cn } from "@/components/ui";

type FsVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

const canFullscreen = () =>
  typeof document !== "undefined" && (document.fullscreenEnabled || "webkitEnterFullscreen" in HTMLVideoElement.prototype);

const overlayButton =
  "inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/80";

/**
 * A 16:9 video surface for a MediaStream. Plays with sound when the browser
 * allows it; if autoplay is blocked it falls back to muted and shows an
 * "Unmute" button. Pass `muted` for local previews (never plays sound).
 */
export function VideoTile({
  stream,
  muted = false,
  label,
  placeholder,
  actions,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  /** Small caption in the top-left corner. */
  label?: ReactNode;
  /** Shown instead of video while there is no stream. */
  placeholder?: ReactNode;
  /** Buttons for the top-right corner. */
  actions?: ReactNode;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    setNeedsUnmute(false);
    if (!stream) return;
    let cancelled = false;
    video.muted = muted;
    video.play().catch(() => {
      if (cancelled || muted) return;
      // Autoplay with sound was refused: play silently and offer an Unmute button.
      video.muted = true;
      video.play().catch(() => {});
      setNeedsUnmute(true);
    });
    return () => {
      cancelled = true;
    };
  }, [stream, muted]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === boxRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function unmute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.play().catch(() => {});
    setNeedsUnmute(false);
  }

  function toggleFullscreen() {
    const box = boxRef.current;
    if (!box) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (box.requestFullscreen) {
      box.requestFullscreen().catch(() => {});
    } else {
      (videoRef.current as FsVideo | null)?.webkitEnterFullscreen?.();
    }
  }

  return (
    <div ref={boxRef} className={cn("relative aspect-video w-full overflow-hidden rounded-2xl bg-deep text-on-dark", className)}>
      <video ref={videoRef} autoPlay playsInline className={cn("size-full bg-black object-contain", !stream && "invisible")} />

      {!stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-on-dark-muted">
          {placeholder}
        </div>
      )}

      {label && <span className="absolute left-3 top-3 max-w-[60%] truncate rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white">{label}</span>}
      {actions && <div className="absolute right-3 top-3 flex items-center gap-2">{actions}</div>}

      {stream && needsUnmute && (
        <button type="button" onClick={unmute} className={cn(overlayButton, "absolute bottom-3 left-3")}>
          <VolumeX className="size-4" aria-hidden /> Unmute
        </button>
      )}
      {stream && canFullscreen() && (
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
          className={cn(overlayButton, "absolute bottom-3 right-3 px-2.5")}
        >
          {isFullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}
