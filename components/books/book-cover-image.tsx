"use client";

import Image from "next/image";
import { useState } from "react";
import type { SyntheticEvent } from "react";

type BookCoverImageProps = {
  cover: string | null | undefined;
  title: string;
  author: string;
  sizes: string;
  priority?: boolean;
};

export function BookCoverImage({ cover, title, author, sizes, priority = false }: BookCoverImageProps) {
  const [failedCover, setFailedCover] = useState<string | null>(null);

  if (cover) {
    const coverUrl = cover;
    const isPublicStorageCover = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/book-covers\//i.test(coverUrl);

    function logCoverError(event: SyntheticEvent<HTMLImageElement>) {
      const imageUrl = event.currentTarget.currentSrc || coverUrl;
      console.error("[BookCoverImage] Failed to load book cover", { title, author, imageUrl });
      setFailedCover(coverUrl);
      void fetch(coverUrl, { method: "HEAD", cache: "no-store" })
        .then((response) => {
          console.error("[BookCoverImage] Cover response", { title, imageUrl: coverUrl, status: response.status, statusText: response.statusText });
        })
        .catch((error: unknown) => {
          console.error("[BookCoverImage] Could not inspect cover response", { title, imageUrl: coverUrl, error });
        });
    }

    if (failedCover !== coverUrl) {
      return <Image src={coverUrl} alt={`Cover of ${title} by ${author}`} fill onError={logCoverError} priority={priority} sizes={sizes} unoptimized={isPublicStorageCover} />;
    }
  }

  return (
    <div aria-label={`Undergraduate Hub Library cover placeholder for ${title} by ${author}`} className="book-cover-fallback" role="img">
      <span>UNDERGRADUATE HUB</span>
      <strong>LIBRARY</strong>
      <span className="book-cover-fallback-title">{title}</span>
      <span className="book-cover-fallback-author">{author}</span>
    </div>
  );
}
