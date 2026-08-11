"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";

type UploadedImage = {
  url: string;
  path: string;
};

type ImageUploaderProps = {
  onImagesChange: (images: UploadedImage[]) => void;
};

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName) && fromName.length <= 5) {
    return fromName === "jpg" ? "jpeg" : fromName;
  }
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpeg";
}

export default function ImageUploader({ onImagesChange }: ImageUploaderProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadImage(file: File) {
    if (!ALLOWED_TYPES.has(file.type)) {
      setMessage("Only JPEG, PNG, WebP, or GIF images are allowed.");
      toast("Invalid image type.", "error");
      return;
    }

    if (file.size > MAX_BYTES) {
      setMessage("Each image must be 8 MB or smaller.");
      toast("Image is too large (max 8 MB).", "error");
      return;
    }

    setUploading(true);
    setMessage("");

    const filePath = `products/${crypto.randomUUID()}.${extensionFor(file)}`;

    const result = await supabase.storage.from("product-images").upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (result.error) {
      setMessage("Upload failed. Please try again.");
      toast("Upload failed.", "error");
      setUploading(false);
      return;
    }

    const publicResult = supabase.storage.from("product-images").getPublicUrl(filePath);
    const newImage: UploadedImage = {
      url: publicResult.data.publicUrl,
      path: filePath,
    };

    const updatedImages = [...images, newImage];
    setImages(updatedImages);
    onImagesChange(updatedImages);
    setMessage("Image uploaded.");
    toast("Image uploaded.", "success");
    setUploading(false);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          void uploadImage(file);
        }
        event.preventDefault();
        return;
      }
    }
    setMessage("No image found in clipboard.");
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      void uploadImage(files[i]);
    }
    event.target.value = "";
  }

  async function deleteImage(image: UploadedImage, index: number) {
    const confirmed = window.confirm("Delete this image from storage?");
    if (!confirmed) return;

    const result = await supabase.storage.from("product-images").remove([image.path]);
    if (result.error) {
      setMessage("Delete failed. Please try again.");
      toast("Delete failed.", "error");
      return;
    }

    const updatedImages = images.filter((_, imageIndex) => imageIndex !== index);
    setImages(updatedImages);
    onImagesChange(updatedImages);
    setMessage("Image deleted.");
    toast("Image deleted.", "success");
  }

  return (
    <div className="space-y-5">
      <div
        tabIndex={0}
        onPaste={handlePaste}
        className="flex min-h-40 cursor-text items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950 p-8 text-center outline-none transition hover:border-blue-500 focus:border-blue-500"
        aria-label="Paste screenshot area"
      >
        <div>
          <p className="font-medium text-slate-100">Paste a screenshot</p>
          <p className="mt-2 text-sm text-slate-400">Focus this box, then press Ctrl+V / Cmd+V</p>
          <p className="mt-1 text-xs text-slate-500">JPEG, PNG, WebP, GIF · max 8 MB</p>
        </div>
      </div>

      <label className="inline-flex cursor-pointer rounded-xl border border-slate-700 bg-slate-950 px-5 py-3 text-sm font-medium transition hover:border-blue-500">
        Upload images
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {uploading && <p className="text-sm text-blue-400">Uploading…</p>}
      {message && !uploading && <p className="text-sm text-slate-400">{message}</p>}

      {images.length > 0 && (
        <div>
          <h3 className="mb-3 font-medium">New images ({images.length})</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {images.map((image, index) => (
              <div
                key={image.path}
                className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
              >
                <div className="relative aspect-square">
                  <Image
                    src={image.url}
                    alt={`Uploaded screenshot ${index + 1}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void deleteImage(image, index)}
                  className="absolute right-2 top-2 rounded-lg bg-black/70 px-3 py-1 text-xs hover:bg-red-600"
                  aria-label={`Delete screenshot ${index + 1}`}
                >
                  Delete
                </button>
                {index === 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 text-xs">
                    Cover candidate
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
