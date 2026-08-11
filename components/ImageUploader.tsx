"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type UploadedImage = {
  url: string;
  path: string;
};

type ImageUploaderProps = {
  onImagesChange: (images: UploadedImage[]) => void;
};

export default function ImageUploader({
  onImagesChange,
}: ImageUploaderProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setMessage("Please paste or upload an image.");
      return;
    }

    setUploading(true);
    setMessage("");

    const extension =
      file.name.split(".").pop() || "png";

    const randomId = crypto.randomUUID();

    const fileName =
      randomId + "." + extension;

    const filePath =
      "products/" + fileName;

    const result = await supabase.storage
      .from("product-images")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (result.error) {
      setMessage(
        "Upload failed: " +
          result.error.message
      );
      setUploading(false);
      return;
    }

    const publicResult =
      supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

    const newImage: UploadedImage = {
      url: publicResult.data.publicUrl,
      path: filePath,
    };

    const updatedImages = [
      ...images,
      newImage,
    ];

    setImages(updatedImages);
    onImagesChange(updatedImages);

    setMessage("Image uploaded.");
    setUploading(false);
  }

  function handlePaste(
    event: React.ClipboardEvent<HTMLDivElement>
  ) {
    const items =
      event.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();

        if (file) {
          uploadImage(file);
        }

        event.preventDefault();
        return;
      }
    }

    setMessage(
      "No image found in clipboard."
    );
  }

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = event.target.files;

    if (!files) {
      return;
    }

    for (let i = 0; i < files.length; i++) {
      uploadImage(files[i]);
    }

    event.target.value = "";
  }

  async function deleteImage(
    image: UploadedImage,
    index: number
  ) {
    const confirmed = window.confirm(
      "Delete this image?"
    );

    if (!confirmed) {
      return;
    }

    const result = await supabase.storage
      .from("product-images")
      .remove([image.path]);

    if (result.error) {
      setMessage(
        "Delete failed: " +
          result.error.message
      );
      return;
    }

    const updatedImages =
      images.filter(
        (_, imageIndex) =>
          imageIndex !== index
      );

    setImages(updatedImages);
    onImagesChange(updatedImages);

    setMessage("Image deleted.");
  }

  return (
    <div className="space-y-5">

      <div
        tabIndex={0}
        onPaste={handlePaste}
        className="flex min-h-40 cursor-text items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950 p-8 text-center outline-none transition hover:border-blue-500 focus:border-blue-500"
      >

        <div>

          <div className="text-4xl">
            📋
          </div>

          <p className="mt-3 font-medium">
            Click here and paste screenshot
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Ctrl + V
          </p>

        </div>

      </div>

      <label className="inline-flex cursor-pointer rounded-xl border border-slate-700 bg-slate-950 px-5 py-3 text-sm font-medium hover:border-blue-500">

        📁 Upload Images

        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

      </label>

      {uploading && (
        <p className="text-sm text-blue-400">
          Uploading image...
        </p>
      )}

      {message && !uploading && (
        <p className="text-sm text-slate-400">
          {message}
        </p>
      )}

      {images.length > 0 && (
        <div>

          <h3 className="mb-3 font-medium">
            New Images ({images.length})
          </h3>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">

            {images.map(
              (image, index) => (
                <div
                  key={image.path}
                  className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
                >

{/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={
                      "Screenshot " +
                      (index + 1)
                    }
                    className="aspect-square w-full object-cover"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      deleteImage(
                        image,
                        index
                      )
                    }
                    className="absolute right-2 top-2 rounded-lg bg-black/70 px-3 py-1 text-xs hover:bg-red-600"
                  >
                    Delete
                  </button>

                  {index === 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 text-xs">
                      New Cover
                    </div>
                  )}

                </div>
              )
            )}

          </div>

        </div>
      )}

    </div>
  );
}
