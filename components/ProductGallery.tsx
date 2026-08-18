"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/components/icons";

const PRODUCT_IMAGE_QUALITY = 88;

type GalleryImage = {
  id: string;
  image_url: string;
};

type ProductGalleryProps = {
  title: string;
  images: GalleryImage[];
};

function ImageFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface-muted)] px-4 text-center text-sm text-[var(--muted)]">
      {label}
    </div>
  );
}

export default function ProductGallery({ title, images }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const safeIndex = Math.min(activeIndex, Math.max(images.length - 1, 0));

  const goTo = useCallback(
    (index: number) => {
      if (images.length === 0) return;
      const next = (index + images.length) % images.length;
      setActiveIndex(next);
    },
    [images.length]
  );

  useEffect(() => {
    if (!lightboxOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") goTo(safeIndex - 1);
      if (event.key === "ArrowRight") goTo(safeIndex + 1);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightboxOpen, goTo, safeIndex]);

  if (images.length === 0) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]">
        <ImageFallback label="No product images" />
      </div>
    );
  }

  const active = images[safeIndex];
  const showFallback = failed[active.id];

  return (
    <>
      <div className="space-y-3 sm:space-y-4">
        <div className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] shadow-[var(--shadow-card)] lg:aspect-[4/3]">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="relative h-full w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            aria-label={`Open full-size image ${safeIndex + 1} of ${images.length}`}
          >
            {showFallback ? (
              <ImageFallback label="Image unavailable" />
            ) : (
              <Image
                src={active.image_url}
                alt={`${title} — screenshot ${safeIndex + 1}`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                quality={PRODUCT_IMAGE_QUALITY}
                className="object-cover"
                onError={() =>
                  setFailed((current) => ({ ...current, [active.id]: true }))
                }
              />
            )}
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(safeIndex - 1)}
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-white/90 text-[var(--foreground)] opacity-0 shadow-[var(--shadow-card)] transition duration-200 hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 sm:h-10 sm:w-10"
                aria-label="Previous image"
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                onClick={() => goTo(safeIndex + 1)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-white/90 text-[var(--foreground)] opacity-0 shadow-[var(--shadow-card)] transition duration-200 hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 sm:h-10 sm:w-10"
                aria-label="Next image"
              >
                <ChevronRightIcon />
              </button>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-2.5">
            {images.map((image, index) => {
              const isActive = index === safeIndex;
              const thumbFailed = failed[image.id];

              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`View image ${index + 1}`}
                  aria-pressed={isActive}
                  className={`relative aspect-[4/3] overflow-hidden rounded-lg border bg-[var(--surface-muted)] transition duration-200 ${
                    isActive
                      ? "border-[var(--accent-strong)] ring-2 ring-blue-200"
                      : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                >
                  {thumbFailed ? (
                    <ImageFallback label="N/A" />
                  ) : (
                    <Image
                      src={image.image_url}
                      alt={`${title} thumbnail ${index + 1}`}
                      fill
                      sizes="120px"
                      quality={PRODUCT_IMAGE_QUALITY}
                      className="object-cover"
                      loading="lazy"
                      onError={() =>
                        setFailed((current) => ({
                          ...current,
                          [image.id]: true,
                        }))
                      }
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} image gallery`}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-white transition duration-200 hover:bg-slate-800"
            aria-label="Close gallery"
          >
            <CloseIcon />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(safeIndex - 1)}
                className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-white transition duration-200 hover:bg-slate-800 sm:left-6"
                aria-label="Previous image"
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                onClick={() => goTo(safeIndex + 1)}
                className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-white transition duration-200 hover:bg-slate-800 sm:right-6"
                aria-label="Next image"
              >
                <ChevronRightIcon />
              </button>
            </>
          )}

          <div className="relative h-[70vh] w-full max-w-5xl">
            {!showFallback ? (
              <Image
                src={active.image_url}
                alt={`${title} — full size screenshot ${safeIndex + 1}`}
                fill
                sizes="100vw"
                quality={PRODUCT_IMAGE_QUALITY}
                className="object-contain"
              />
            ) : (
              <ImageFallback label="Image unavailable" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
