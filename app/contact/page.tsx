import type { Metadata } from "next";
import Link from "next/link";
import { siteInfo } from "@/lib/site-info";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Undergraduate Hub Library about books and the collection.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const contactEmails = siteInfo.contactEmails;

  return (
    <main className="page-main contact-page" id="main-content">
      <section className="contact-intro container">
        <p className="eyebrow">{siteInfo.programName}</p>
        <h1 className="display-font">Let&apos;s talk<br /><em>books.</em></h1>
        <p>Questions about the collection or a book you would like to read? Contact the library team directly.</p>
      </section>
      <section className="container contact-grid">
        <div className="contact-panel">
          <span className="eyebrow">Plan a visit</span>
          <h2 className="display-font">Your next read is closer than you think.</h2>
          <address>{siteInfo.address}</address>
        </div>
        <div className="contact-panel contact-details">
          <span className="eyebrow">Say hello</span>
          <h2 className="display-font">A note is always welcome.</h2>
          <address className="contact-address-block">
            {siteInfo.phoneNumbers.map((phone) => <a href={`tel:${phone}`} key={phone}>{phone}</a>)}
          </address>
          <div className="contact-social-links">
            <a href={siteInfo.facebookUrl} rel="noreferrer" target="_blank">Facebook <span aria-hidden="true">↗</span></a>
            <a href={siteInfo.instagramUrl} rel="noreferrer" target="_blank">Instagram <span aria-hidden="true">↗</span></a>
          </div>
          {contactEmails.length > 0 ? contactEmails.map((email) => (
            <a className="team-email" href={`mailto:${email}`} key={email}>{email}</a>
          )) : null}
        </div>
      </section>
      <div className="container contact-footer-link">
        <span>Need more help or want to meet the people behind the library?</span>
        <Link className="text-link" href="/team">Meet Our Team <span aria-hidden="true">→</span></Link>
        <Link className="text-link" href="/books">Explore the catalogue <span aria-hidden="true">→</span></Link>
      </div>
    </main>
  );
}
