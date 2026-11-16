import Link from "next/link";
import { LibraryActivity } from "@/components/home/library-activity";

const steps = [
  { number: "01", title: "Discover", description: "Browse the collection and find a book you want to read." },
  { number: "02", title: "Check", description: "See whether the book is currently available." },
  { number: "03", title: "Read", description: "Contact Undergraduate Hub Library to arrange your rental." },
];

export function ReadingSteps() {
  return (
    <section className="reading-steps-section" aria-labelledby="reading-steps-title">
      <div className="container">
        <div className="home-section-heading"><div><p className="eyebrow">A simple way to start</p><h2 className="display-font" id="reading-steps-title">Discover. Check. Read.</h2></div><Link className="text-link" href="/contact">Contact the library <span aria-hidden="true">→</span></Link></div>
        <ol className="reading-steps-list">
          {steps.map((step) => <li key={step.number}><span className="step-number">{step.number}</span><h3 className="display-font">{step.title}</h3><p>{step.description}</p></li>)}
        </ol>
        <LibraryActivity />
      </div>
    </section>
  );
}