import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-logo";
import { libraryContact } from "@/lib/site-info";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-brand-block">
          <Link className="footer-brand" href="/">
            <BrandLogo className="footer-logo" sizes="180px" />
          </Link>
          <p>Stories to escape into.<br />Ideas to live by.</p>
        </div>
        <nav aria-label="Explore pages" className="footer-column footer-links">
          <span className="footer-heading">Explore</span>
          <Link href="/books">Books</Link>
          <Link href="/categories">Categories</Link>
          <Link href="/about">About</Link>
          <Link href="/team">Our Team</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/membership-pricing">Membership &amp; Pricing</Link>
          <Link href="/careers">Careers</Link>
          <Link href="/terms-and-conditions">Terms &amp; Conditions</Link>
        </nav>
        <div className="footer-column">
          <span className="footer-heading">Connect</span>
          <a href={libraryContact.facebook} rel="noreferrer" target="_blank">Facebook <span aria-hidden="true">↗</span></a>
          <a href={libraryContact.instagram} rel="noreferrer" target="_blank">Instagram <span aria-hidden="true">↗</span></a>
          <a href="https://uh-magazine.spudblocks.com" rel="noreferrer" target="_blank">Undergraduate Journal <span aria-hidden="true">↗</span></a>
        </div>
        <div className="footer-column">
          <span className="footer-heading">Location</span>
          <p>{libraryContact.address}</p>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(libraryContact.address)}`} rel="noreferrer" target="_blank">Map directions <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <div className="container footer-bottom"><span>| © 2026 UNDERGRADUATE HUB | TECHNOLOGY PARTNER - SAGA LAB | BACKED BY - AGT VENTURE |</span></div>
    </footer>
  );
}
