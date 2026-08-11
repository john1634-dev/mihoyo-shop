"use client";

import Image from "next/image";
import { useState } from "react";

type GalleryImage = {
  id: string;
  image_url: string;
};

type ProductGalleryProps = {
  title: string;
  images: GalleryImage[];
};

export default function ProductGallery({ title, images }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  if (images.length === 0) {
    return (
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-7xl">
        🎮
      </div>
    );
  }

  const safeIndex = Math.min(activeIndex, images.length - 1);
  const active = images[safeIndex];
  const showFallback = failed[active.id];

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {showFallback ? (
          <div className="flex h-full items-center justify-center text-7xl">
            🎮
          </div>
        ) : (
          <Image
            src={active.image_url}
            alt={`${title} — image ${safeIndex + 1}`}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain"
            onError={() =>
              setFailed((current) => ({ ...current, [active.id]: true }))
            }
          />
        )}
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {images.map((image, index) => {
            const isActive = index === safeIndex;
            const thumbFailed = failed[image.id];

            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`View image ${index + 1}`}
                className={`relative aspect-square overflow-hidden rounded-xl border bg-slate-900 transition ${
                  isActive
                    ? "border-blue-500 ring-2 ring-blue-500/40"
                    : "border-slate-800 hover:border-slate-600"
                }`}
              >
                {thumbFailed ? (
                  <div className="flex h-full items-center justify-center text-lg">
                    🎮
                  </div>
                ) : (
                  <Image
                    src={image.image_url}
                    alt={`${title} thumbnail ${index + 1}`}
                    fill
                    sizes="120px"
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
  );
}
