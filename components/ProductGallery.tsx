"use client";

import Image from "next/image";
import { useState } from "react";

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
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 px-4 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

export default function ProductGallery({ title, images }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  if (images.length === 0) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-800 bg-slate-900 sm:rounded-2xl">
        <ImageFallback label="No product images" />
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
          <ImageFallback label="Image unavailable" />
        ) : (
          <Image
            src={active.image_url}
            alt={`${title} — image ${safeIndex + 1}`}
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
                aria-pressed={isActive}
                className={`relative aspect-square overflow-hidden rounded-xl border bg-slate-900 transition ${
                  isActive
                    ? "border-blue-500 ring-2 ring-blue-500/40"
                    : "border-slate-800 hover:border-slate-600"
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
