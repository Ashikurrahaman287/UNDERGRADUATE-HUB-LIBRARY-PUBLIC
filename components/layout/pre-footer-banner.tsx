import Image from "next/image";

const bannerImageUrl = "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/East%20West%20University%20Library%20Lounge.png";

export function PreFooterBanner() {
  return (
    <section aria-label="Undergraduate Hub Library promotion" className="pre-footer-banner">
      <a aria-label="Visit Undergraduate Hub Library on Facebook" className="pre-footer-banner-link" href="https://www.facebook.com/undergraduate.hub">
        <Image
          alt="Undergraduate Hub Academic Items and Free Delivery for EWU & BRACU"
          className="pre-footer-banner-image"
          height={600}
          loading="lazy"
          unoptimized
          sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1228px) calc(100vw - 48px), 1180px"
          src={bannerImageUrl}
          width={1600}
        />
      </a>
    </section>
  );
}
