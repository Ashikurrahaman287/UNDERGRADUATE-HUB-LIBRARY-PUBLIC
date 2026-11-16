"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const campaignStartKey = "uhl-entry-promotion-start-v1";
const dayInMilliseconds = 24 * 60 * 60 * 1000;

const banners = [
  {
    id: "week",
    durationDays: 7,
    src: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/897439881_122141576637389664_9201031331178746481_n.jpg",
    alt: "Undergraduate Hub Library promotional banner",
  },
  {
    id: "month",
    durationDays: 30,
    src: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/902081853_122141651679389664_5572394956212458082_n.jpg",
    alt: "Undergraduate Hub Library promotional banner",
  },
] as const;

export function EntryPromotionPopup() {
  const [activeBanners, setActiveBanners] = useState<typeof banners[number][] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const now = Date.now();
    let campaignStartedAt = now;

    try {
      const storedStart = Number(window.localStorage.getItem(campaignStartKey));
      if (Number.isFinite(storedStart) && storedStart > 0) {
        campaignStartedAt = storedStart;
      } else {
        window.localStorage.setItem(campaignStartKey, String(now));
      }
    } catch {
      campaignStartedAt = now;
    }

    setActiveBanners(banners.filter((banner) => now < campaignStartedAt + banner.durationDays * dayInMilliseconds));
  }, []);

  useEffect(() => {
    if (!activeBanners?.length) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveBanners([]);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [activeBanners?.length]);

  if (!activeBanners?.length) return null;

  const banner = activeBanners[Math.min(activeIndex, activeBanners.length - 1)];

  return (
    <div
      className="entry-promotion-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setActiveBanners([]);
      }}
    >
      <section aria-labelledby="entry-promotion-title" aria-modal="true" className="entry-promotion-dialog" role="dialog">
        <header className="entry-promotion-heading">
          <h2 id="entry-promotion-title">A note from the library</h2>
          <button aria-label="Close promotion" className="wallet-modal-close" onClick={() => setActiveBanners([])} ref={closeButtonRef} type="button">×</button>
        </header>
        <div className="entry-promotion-image-frame">
          <Image alt={banner.alt} className="entry-promotion-image" height={800} priority src={banner.src} unoptimized width={800} />
        </div>
        {activeBanners.length > 1 ? <nav aria-label="Promotion banners" className="entry-promotion-controls">
          <button aria-label="Previous banner" onClick={() => setActiveIndex((index) => (index - 1 + activeBanners.length) % activeBanners.length)} type="button">←</button>
          <span aria-live="polite">{Math.min(activeIndex, activeBanners.length - 1) + 1} / {activeBanners.length}</span>
          <button aria-label="Next banner" onClick={() => setActiveIndex((index) => (index + 1) % activeBanners.length)} type="button">→</button>
        </nav> : null}
      </section>
    </div>
  );
}