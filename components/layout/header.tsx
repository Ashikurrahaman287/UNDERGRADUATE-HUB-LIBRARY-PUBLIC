"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/layout/brand-logo";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/books", label: "Books" },
  { href: "/categories", label: "Categories" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header({ initialMemberLoggedIn }: { initialMemberLoggedIn: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const memberLoggedIn = initialMemberLoggedIn;

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner container">
        <Link className="brand header-brand" href="/" aria-label="Undergraduate Hub Library home" onClick={() => setMenuOpen(false)}>
          <BrandLogo className="header-logo" priority sizes="(max-width: 700px) 100px, 140px" />
        </Link>
        <nav aria-label="Main navigation" className={menuOpen ? "main-nav is-open" : "main-nav"} id="main-menu">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link aria-current={active ? "page" : undefined} href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>;
          })}
          <Link
            aria-current={pathname.startsWith("/member") ? "page" : undefined}
            className="member-auth-link"
            href={memberLoggedIn ? "/member" : "/member/login"}
            onClick={() => setMenuOpen(false)}
          >
            {memberLoggedIn ? "My Account" : "Member Login"}
          </Link>
        </nav>
        <div className="header-tools">
          <Link aria-label="Search books" className="search-link" href="/books#catalogue-search" onClick={() => setMenuOpen(false)} title="Search books">
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.2 4.2" /></svg>
          </Link>
          <button aria-controls="main-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} className={menuOpen ? "menu-toggle is-open" : "menu-toggle"} onClick={() => setMenuOpen(!menuOpen)} ref={menuButtonRef} type="button">
            <span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}