import Image from "next/image";
import Link from "next/link";
import { siteInfo } from "@/lib/site-info";

const heroBanner = "https://substackcdn.com/image/fetch/$s_!5Cxt!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ffff29a8e-c495-46d8-a2ba-10c7e08164d8_2056x765.png";

export function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-banner">
        <Image
          alt="Undergraduate Hub Library banner showing students reading on campus"
          height={765}
          priority
          sizes="100vw"
          src={heroBanner}
          width={2056}
        />
      </div>
      <div className="container home-hero-inner">
        <div className="home-hero-copy">
          <p className="eyebrow">{siteInfo.programName}</p>
          <h1 className="display-font" id="home-title">Stories to escape into.<br /><em>Ideas to live by.</em></h1>
          <p className="home-hero-description">Discover a growing collection of novels, imagined worlds, meaningful ideas and books that offer new perspectives.</p>
        </div>
        <div className="home-hero-links">
          <div className="home-hero-actions">
            <Link className="button-primary" href="/books">Explore the Library <span aria-hidden="true">↗</span></Link>
            <Link className="text-link" href="/categories">Browse Categories <span aria-hidden="true">→</span></Link>
          </div>
          <div className="home-hero-caption"><span className="home-hero-caption-rule" />Read · Learn · Grow · Together</div>
        </div>
      </div>
    </section>
  );
}