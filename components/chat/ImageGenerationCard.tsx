"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { saveGeneratedImage } from "@/lib/native/save-image";
import { cn } from "@/lib/utils";

export type ImageGenerationPhase =
  | "generating"
  | "decoding"
  | "complete"
  | "failed"
  | "cancelled";

type ImageGenerationCardProps = {
  /** Stable id — keeps the card mounted across phase changes. */
  cardId: string;
  phase: ImageGenerationPhase;
  imageUrl?: string | null;
  name?: string;
  aspectRatio?: string;
  error?: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Skip decode crossfade (static image blocks). */
  instant?: boolean;
};

/**
 * ChatGPT-style image generation card — one fixed-size shell from generating through complete.
 */
export function ImageGenerationCard({
  cardId,
  phase,
  imageUrl,
  name = "generated.png",
  aspectRatio = "1 / 1",
  error,
  onRetry,
  retrying = false,
  instant = false,
}: ImageGenerationCardProps) {
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(instant && Boolean(imageUrl?.trim()));
  const [imageVisible, setImageVisible] = useState(instant && Boolean(imageUrl?.trim()));
  const decodeToken = useRef(0);

  useEffect(() => {
    setSaveNote(null);
  }, [imageUrl, phase]);

  useEffect(() => {
    const url = imageUrl?.trim();
    if (!url || phase === "generating" || phase === "failed" || phase === "cancelled") {
      setImageReady(false);
      setImageVisible(false);
      return;
    }

    if (instant) {
      setImageReady(true);
      setImageVisible(true);
      return;
    }

    const token = ++decodeToken.current;
    setImageReady(false);
    setImageVisible(false);

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (decodeToken.current !== token) return;
      setImageReady(true);
      requestAnimationFrame(() => {
        if (decodeToken.current !== token) return;
        setImageVisible(true);
      });
    };
    img.onerror = () => {
      if (decodeToken.current !== token) return;
      setImageReady(true);
      setImageVisible(true);
    };
    img.src = url;

    return () => {
      decodeToken.current += 1;
    };
  }, [imageUrl, phase, instant, cardId]);

  const showSpinner =
    phase === "generating" ||
    ((phase === "decoding" || phase === "complete") &&
      Boolean(imageUrl?.trim()) &&
      !imageVisible &&
      !instant);

  const showImage =
    Boolean(imageUrl?.trim()) &&
    imageReady &&
    (phase === "decoding" || phase === "complete");

  const canDownload =
    imageVisible &&
    Boolean(imageUrl?.trim()) &&
    phase !== "generating" &&
    phase !== "failed" &&
    phase !== "cancelled";

  if (
    (phase === "complete" || phase === "decoding") &&
    !imageUrl?.trim() &&
    !instant
  ) {
    return null;
  }

  if (phase === "cancelled") {
    return (
      <div className="image-gen-card-shell my-1 w-full max-w-[512px] rounded-[18px] border border-border bg-muted/20 px-3 py-3 text-[13px] text-muted-foreground">
        Image generation cancelled.
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="my-1 flex w-full max-w-[512px] items-center gap-3 rounded-[18px] border border-border bg-muted/20 px-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">Image generation failed</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {error || "Something went wrong."}
          </p>
        </div>
        {onRetry ? (
          <button
            type="button"
            aria-label="Retry"
            title="Retry"
            disabled={retrying}
            onClick={onRetry}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="my-1 flex w-full max-w-[512px] flex-col gap-1">
      <div className="flex items-start gap-2">
      <div
        className="image-gen-card image-gen-card-enter min-w-0 flex-1"
        style={{ aspectRatio }}
        data-image-gen-id={cardId}
        aria-busy={showSpinner}
        role={showSpinner ? "status" : undefined}
        aria-label={
          showSpinner
            ? "Generating image"
            : showImage
              ? "Generated image"
              : undefined
        }
        onClick={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl!}
            alt=""
            draggable={false}
            decoding="async"
            className={cn(
              "image-gen-photo pointer-events-none absolute inset-0 h-full w-full object-cover select-none",
              imageVisible && "image-gen-photo-visible",
            )}
            style={{ WebkitTouchCallout: "none", touchAction: "none" }}
            onContextMenu={(event) => event.preventDefault()}
          />
        ) : null}
        {showSpinner ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="image-gen-spinner" aria-hidden />
          </div>
        ) : null}
      </div>

      {canDownload ? (
        <button
          type="button"
          aria-label="Download image"
          title="Download"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            setSaveNote(null);
            void saveGeneratedImage({ url: imageUrl!, name })
              .then((res) => {
                if (!res.ok) {
                  setSaveNote(res.error || "Couldn't save");
                  return;
                }
                if (res.method === "photos") setSaveNote("Saved to Photos");
              })
              .finally(() => setSaving(false));
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
      </div>
      {saveNote ? (
        <p className="text-right text-[11px] text-muted-foreground" role="status">
          {saveNote}
        </p>
      ) : null}
    </div>
  );
}

/** Map persisted image_generation block status to card phase. */
export function phaseForImageGenerationBlock(block: {
  status: "generating" | "completed" | "failed" | "cancelled";
  imageUrl: string | null;
}): ImageGenerationPhase {
  if (block.status === "generating") return "generating";
  if (block.status === "cancelled") return "cancelled";
  if (block.status === "failed") return "failed";
  if (block.status === "completed" && block.imageUrl?.trim()) return "decoding";
  if (block.status === "completed") return "complete";
  return "generating";
}
