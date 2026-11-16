import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Membership & Pricing",
  description: "Annual membership and 30-day rental subscription plans for Undergraduate Hub Library.",
  alternates: { canonical: "/membership-pricing" },
};

const plans = [
  {
    id: "basic",
    number: "02",
    name: "Basic",
    price: "29",
    bookLimit: "1 book at a time",
    description: "A 30-day rental subscription for reading one book at a time.",
    benefits: ["Unlimited books over the subscription period, subject to the at-a-time limit", "No per-book rental fee", "Maximum of 1 book held at a time"],
  },
  {
    id: "plus",
    number: "03",
    name: "Plus",
    price: "49",
    bookLimit: "2 books at a time",
    description: "More room to read across your 30-day subscription.",
    benefits: ["Unlimited books over the subscription period, subject to the at-a-time limit", "No per-book rental fee", "Maximum of 2 books held at a time", "1:1 support with the library team", "Exclusive discount on Undergraduate HUB products"],
  },
] as const;

const steps = [
  { number: "01", title: "Activate membership", description: "Create an account, complete your member profile, and submit the annual membership application with its payment details." },
  { number: "02", title: "Membership review", description: "The library team reviews the application and assigns an available 30-day rental plan during approval." },
  { number: "03", title: "Start a rental cycle", description: "With your first book request, submit the selected plan's 30-day payment and transaction ID using the form instructions. The cycle's 30 days are counted from book handover." },
  { number: "04", title: "Request available books", description: "Submit a request for each book. Requests remain subject to the plan's at-a-time limit, availability, and library review." },
  { number: "05", title: "Return by the due date", description: "Return each book under the published rental rules. A subscription does not allow indefinite borrowing." },
];

export default function MembershipPricingPage() {
  return (
    <main className="page-main membership-pricing-page" id="main-content">
      <header className="container pricing-intro">
        <p className="eyebrow">Membership &amp; Pricing</p>
        <h1 className="display-font">A little more room for reading.</h1>
        <p>Activate your annual library membership, then read through a 30-day rental subscription that fits your pace.</p>
      </header>

      <section aria-label="Membership and rental plan prices" className="container pricing-card-grid">
        <article aria-labelledby="annual-membership-title" className="pricing-card pricing-card-membership">
          <div className="pricing-card-heading">
            <span className="pricing-card-number">01 / MEMBERSHIP</span>
            <h2 className="display-font" id="annual-membership-title">Annual Membership</h2>
            <p>Activate your library membership for one year.</p>
          </div>
          <p className="pricing-amount"><strong>৳99</strong><span>per year</span></p>
          <p className="pricing-limit">Required before requesting rental books</p>
          <ul className="pricing-benefits">
            <li>Valid for one year</li>
            <li>Required for rental eligibility</li>
            <li>Separate from the 30-day rental subscription fee</li>
          </ul>
          <Link className="button-outline pricing-action" href="/member/login">Sign up or sign in</Link>
        </article>

        {plans.map((plan) => (
          <article aria-labelledby={`${plan.id}-plan-title`} className={`pricing-card${plan.id === "plus" ? " pricing-card-featured" : ""}`} key={plan.id}>
            <div className="pricing-card-heading">
              <span className="pricing-card-number">{plan.number} / RENTAL PLAN</span>
              <h2 className="display-font" id={`${plan.id}-plan-title`}>{plan.name}</h2>
              <p>{plan.description}</p>
            </div>
            <p className="pricing-amount"><strong>৳{plan.price}</strong><span>per 30 days</span></p>
            <p className="pricing-limit">Maximum {plan.bookLimit}</p>
            <ul className="pricing-benefits">
              {plan.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
            </ul>
            <Link className={plan.id === "plus" ? "button-primary pricing-action" : "button-outline pricing-action"} href={plan.id === "plus" ? "/contact" : "/member/login"}>
              {plan.id === "plus" ? "Ask about Plus" : "Sign in to request books"}
            </Link>
          </article>
        ))}
      </section>

      <section aria-labelledby="pricing-process-title" className="pricing-process-band">
        <div className="container pricing-process">
          <header className="pricing-section-heading">
            <p className="eyebrow">How it works</p>
            <h2 className="display-font" id="pricing-process-title">From membership to your next read</h2>
            <p>The annual membership fee and rental subscription are separate payments.</p>
          </header>
          <ol className="pricing-steps">
            {steps.map((step) => (
              <li key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
          <p className="pricing-plan-assignment">Rental plans are assigned by the library team during membership review. The first 30-day subscription payment is submitted with your first book request; after that, additional rental requests during an active cycle do not have a per-book fee.</p>
          <div className="pricing-payment-note">
            <p><strong>Payment:</strong> Membership and first rental subscription forms accept bKash or Nagad. Follow the form&apos;s instructions and submit the transaction ID for review; payment submission is not approval.</p>
            <Link href="/terms-and-conditions#payments">Payment terms <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="pricing-policy-title" className="container pricing-policy">
        <div>
          <p className="eyebrow">Keep reading responsibly</p>
          <h2 className="display-font" id="pricing-policy-title">Every book still has a due date.</h2>
        </div>
        <div>
          <p>Each book may be kept for up to 30 days from handover. Renew your subscription before it expires if you need to continue holding a book; renewal does not extend the maximum holding period beyond 40 days from handover. After the three-day late-return grace period, the Terms specify a ৳10 daily late fee until the book is returned.</p>
          <p>Lost or seriously damaged books may require compensation after review. See the full policies for return, renewal, and compensation details.</p>
          <p><Link className="text-link" href="/member/dashboard/payments">Manage a subscription renewal <span aria-hidden="true">→</span></Link></p>
          <Link className="text-link" href="/terms-and-conditions">Read Terms &amp; Conditions <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </main>
  );
}