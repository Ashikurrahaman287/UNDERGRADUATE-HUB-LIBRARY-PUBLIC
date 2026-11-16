"use client";

import Link from "next/link";
import { useState } from "react";

type FAQItem = {
  id: string;
  question: string;
  answer: string;
  searchTerms?: string;
  links?: { href: string; label: string }[];
};

const faqGroups: { id: string; number: string; title: string; items: FAQItem[] }[] = [
  {
    id: "getting-started",
    number: "01",
    title: "Getting started",
    items: [
      {
        id: "what-is-the-library",
        question: "What is Undergraduate Hub Library?",
        answer: "It is a book-focused reading initiative and rental service. Browse the online catalogue, check a book's availability, and request a rental through the website.",
        links: [{ href: "/about", label: "Learn about the library" }, { href: "/books", label: "Browse books" }],
      },
      {
        id: "who-can-apply",
        question: "What do I need before applying for membership?",
        answer: "You need a website account and a completed member profile before submitting an application. The published Terms do not specify an additional university-affiliation requirement.",
        links: [{ href: "/member/register", label: "Create or complete your account" }],
      },
      {
        id: "membership-cost",
        question: "How much does membership cost?",
        answer: "Membership has a one-time activation fee, separate from the rental subscription. The current fee is shown in the membership application.",
        links: [{ href: "/member/apply", label: "View the membership application" }],
      },
      {
        id: "activate-membership",
        question: "How do I activate my membership?",
        answer: "Complete your member profile, submit the membership application, pay using one of the methods shown there, and enter the transaction ID. The library team reviews the submission; sending a payment ID does not itself confirm payment or activate membership.",
        links: [{ href: "/member/apply", label: "Membership application" }, { href: "/terms-and-conditions#membership", label: "Membership terms" }],
      },
    ],
  },
  {
    id: "rentals",
    number: "02",
    title: "Rentals and subscriptions",
    items: [
      {
        id: "subscription-cycle",
        question: "How does the rental subscription work?",
        answer: "A rental subscription covers a 30-day period. The cycle begins from the date you actually receive a book. Your first rental request includes the subscription payment; additional books during an active cycle do not have a per-book fee.",
        links: [{ href: "/terms-and-conditions#subscriptions", label: "Subscription terms" }],
      },
      {
        id: "number-of-books",
        question: "How many books can I rent at once?",
        answer: "The Terms do not set a fixed simultaneous-book limit. They say an active 30-day subscription covers as many books as you choose, subject to availability, the rental process, and each book's return deadline.",
        links: [{ href: "/terms-and-conditions#subscriptions", label: "Read the subscription rules" }],
      },
      {
        id: "request-book",
        question: "How do I request a book?",
        answer: "Open an available book's page and submit a Rent Request. You need an active membership and an eligible 30-day plan. If a book is unavailable, you can check its reservation options instead.",
        links: [{ href: "/books", label: "Find a book" }, { href: "/member/reservations", label: "View reservations" }],
      },
      {
        id: "after-request",
        question: "What happens after I submit a rental request?",
        answer: "The library team reviews the request, payment if applicable, and book availability before arranging handover. A request or payment alone does not guarantee that a book will be issued. You can check your request status in your member dashboard.",
        links: [{ href: "/member/dashboard", label: "Open the member dashboard" }, { href: "/terms-and-conditions#subscriptions", label: "Rental terms" }],
      },
    ],
  },
  {
    id: "payments-and-returns",
    number: "03",
    title: "Payments and returns",
    items: [
      {
        id: "payment-methods",
        question: "What payment methods are accepted?",
        answer: "Membership, first-subscription, and renewal forms accept bKash or Nagad. Follow the payment instructions shown in the relevant form and submit the transaction ID for review.",
        links: [{ href: "/member/apply", label: "Membership payment instructions" }, { href: "/terms-and-conditions#payments", label: "Payment terms" }],
      },
      {
        id: "return-deadline",
        question: "When must I return a rented book?",
        answer: "Return each book within 30 days of receiving it, and before your subscription expires. If you renew, the Terms set a 40-day maximum holding period from handover; the grace period does not extend that limit. Check your member account for the recorded dates.",
        links: [{ href: "/member/dashboard/my-books", label: "Check your rented books" }, { href: "/terms-and-conditions#returns", label: "Return terms" }],
      },
      {
        id: "late-return",
        question: "What happens if I return a book late?",
        answer: "There is a three-day grace period after the due date with no late fee. After that, the Terms specify a ৳10 daily fee until the book is returned. The grace period does not extend the maximum holding period.",
        links: [{ href: "/terms-and-conditions#returns", label: "Late-return terms" }],
      },
      {
        id: "lost-or-damaged",
        question: "What if a book is lost or damaged?",
        answer: "Tell the library team. They review the damage and relevant evidence before determining any compensation. The Terms use the Rokomari listing for the matching edition and ISBN as a pricing reference, and say the basis for compensation will be explained.",
        links: [{ href: "/contact", label: "Contact the library" }, { href: "/terms-and-conditions#loss-damage", label: "Loss and damage terms" }],
      },
      {
        id: "renew-subscription",
        question: "Can I renew my rental subscription?",
        answer: "Yes. Submit a renewal through Payments & Subscription in your member account. Renew before the subscription expires if you need to continue holding books; the 40-day maximum holding period still applies.",
        links: [{ href: "/member/dashboard/payments", label: "Payments & Subscription" }, { href: "/terms-and-conditions#returns", label: "Renewal and return terms" }],
      },
    ],
  },
  {
    id: "account-and-support",
    number: "04",
    title: "Account and support",
    items: [
      {
        id: "manage-account",
        question: "How do I manage my member account?",
        answer: "Your dashboard shows your profile, membership and subscription status, rental requests, rented books, reservations, and payment records. Use the profile link there to update personal information.",
        links: [{ href: "/member/dashboard", label: "Open your dashboard" }, { href: "/member/dashboard/my-books", label: "Rented books" }, { href: "/member/dashboard/payments", label: "Payments & Subscription" }],
      },
      {
        id: "contact-library",
        question: "How can I contact the library team?",
        answer: "Use the official contact page for the library's current phone numbers, social channels, and location.",
        links: [{ href: "/contact", label: "Contact the library" }],
      },
    ],
  },
];

export function FAQContent() {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = faqGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${item.question} ${item.answer} ${item.searchTerms ?? ""}`.toLocaleLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const visibleIds = visibleGroups.flatMap((group) => group.items.map((item) => item.id));

  function toggleQuestion(id: string) {
    setOpenIds((current) => current.includes(id) ? current.filter((openId) => openId !== id) : [...current, id]);
  }

  function setAllOpen(open: boolean) {
    setOpenIds(open ? visibleIds : []);
  }

  return (
    <>
      <header className="container faq-intro">
        <p className="eyebrow">Help center</p>
        <div className="faq-intro-heading">
          <div>
            <h1 className="display-font">Frequently asked questions</h1>
            <p>Clear answers about membership, rentals, returns, and your account.</p>
          </div>
          <Link className="faq-policy-link" href="/terms-and-conditions">Read the full Terms <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="faq-search-row">
          <label className="faq-search-field" htmlFor="faq-search">
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.2 4.2" /></svg>
            <input autoComplete="off" id="faq-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search questions and answers" type="search" value={query} />
          </label>
          <p aria-live="polite" className="faq-result-count" role="status">{visibleIds.length} {visibleIds.length === 1 ? "answer" : "answers"}</p>
          {query ? <button className="faq-clear-search" onClick={() => setQuery("")} type="button">Clear search</button> : null}
        </div>
      </header>

      <div className="container faq-layout">
        <aside className="faq-sidebar">
          <nav aria-label="FAQ topics" className="faq-topic-nav">
            <span className="faq-sidebar-label">Browse topics</span>
            {visibleGroups.map((group) => (
              <a href={`#${group.id}`} key={group.id}>{group.title}<span aria-hidden="true">→</span></a>
            ))}
          </nav>
          <div className="faq-sidebar-note">
            <span className="faq-sidebar-label">Need more detail?</span>
            <p>For the complete rules, including return and damage policies, read the Terms.</p>
            <Link href="/terms-and-conditions">View Terms &amp; Conditions <span aria-hidden="true">↗</span></Link>
          </div>
        </aside>

        <div className="faq-content">
          <div className="faq-controls">
            <span>{normalizedQuery ? "Search results" : "Browse all answers"}</span>
            <div>
              <button onClick={() => setAllOpen(true)} type="button">Expand all</button>
              <button onClick={() => setAllOpen(false)} type="button">Collapse all</button>
            </div>
          </div>

          {visibleGroups.length ? visibleGroups.map((group) => (
            <section aria-labelledby={`${group.id}-heading`} className="faq-group" id={group.id} key={group.id}>
              <header className="faq-group-heading">
                <span>{group.number}</span>
                <h2 className="display-font" id={`${group.id}-heading`}>{group.title}</h2>
              </header>
              <div className="faq-list">
                {group.items.map((item) => {
                  const isOpen = openIds.includes(item.id);
                  const answerId = `faq-answer-${item.id}`;
                  return (
                    <article className="faq-item" key={item.id}>
                      <h3>
                        <button aria-controls={answerId} aria-expanded={isOpen} className="faq-question" onClick={() => toggleQuestion(item.id)} type="button">
                          <span>{item.question}</span>
                          <span aria-hidden="true" className={`faq-toggle-mark${isOpen ? " is-open" : ""}`}><span /><span /></span>
                        </button>
                      </h3>
                      <div aria-hidden={!isOpen} className={`faq-answer${isOpen ? " is-open" : ""}`} id={answerId} inert={!isOpen}>
                        <div className="faq-answer-inner">
                          <p>{item.answer}</p>
                          {item.links ? <div className="faq-answer-links">{item.links.map((link) => <Link href={link.href} key={link.href}>{link.label}<span aria-hidden="true">↗</span></Link>)}</div> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )) : (
            <div className="faq-empty-state">
              <p className="display-font">No answers found</p>
              <p>Try a different search, or contact the library team.</p>
              <Link className="text-link" href="/contact">Contact the library <span aria-hidden="true">→</span></Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}