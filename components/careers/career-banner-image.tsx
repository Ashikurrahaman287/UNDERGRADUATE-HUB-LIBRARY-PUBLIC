"use client";

import Image from "next/image";
import { useState } from "react";

export function CareerBannerImage({ src, alt, sizes, priority = false }: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div aria-label="Job banner unavailable" className="career-banner-fallback" role="img"><span>Image unavailable</span></div>;
  }

  return <Image alt={alt} fill onError={() => setFailed(true)} priority={priority} sizes={sizes} src={src} unoptimized />;
}