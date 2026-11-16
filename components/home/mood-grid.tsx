import Link from "next/link";

const moods = [
  { number: "01", title: "Get Lost in a Story", note: "Fiction & novels", slug: "novels", style: "story" },
  { number: "02", title: "Explore Another World", note: "Science fiction & fantasy", slug: "science-fiction", style: "world" },
  { number: "03", title: "Understand the Mind", note: "Psychology & the self", slug: "psychology", style: "mind" },
  { number: "04", title: "Question Everything", note: "Philosophy & big ideas", slug: "philosophy", style: "question" },
  { number: "05", title: "Explore Faith & Belief", note: "Religion & reflection", slug: "religion", style: "belief" },
  { number: "06", title: "Grow & Learn", note: "A little perspective", slug: "self-development", style: "grow" },
];

export function MoodGrid() {
  return (
    <section className="mood-section section-space" aria-labelledby="mood-title">
      <div className="container">
        <div className="mood-heading"><p className="eyebrow">Start with a feeling</p><h2 className="display-font" id="mood-title">What are you in the mood for?</h2></div>
        <div className="mood-grid">
          {moods.map((mood) => <Link className={`mood-card mood-card-${mood.style}`} href={`/categories/${mood.slug}`} key={mood.slug}>
            <span className="mood-number">{mood.number}</span><span aria-hidden="true" className="mood-mark">✳</span>
            <span className="mood-card-copy"><span className="display-font">{mood.title}</span><span>{mood.note}</span></span>
            <span aria-hidden="true" className="mood-arrow">↗</span>
          </Link>)}
        </div>
      </div>
    </section>
  );
}