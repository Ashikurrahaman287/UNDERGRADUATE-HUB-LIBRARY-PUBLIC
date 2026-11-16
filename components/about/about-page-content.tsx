import Image from "next/image";
import Link from "next/link";
import { AboutScrollReveal } from "@/components/about/about-scroll-reveal";
import { getCategories } from "@/lib/books";

const categoryContent = [
  {
    slug: "novels",
    title: "উপন্যাস ও গল্প",
    description: "চরিত্র, সম্পর্ক, আবেগ, রহস্য এবং জীবনের নানা অভিজ্ঞতায় ভরা গল্পের জগৎ আবিষ্কার করুন।",
    cover: "/books/midnight-garden.svg",
  },
  {
    slug: "science-fiction",
    title: "সায়েন্স ফিকশন",
    description: "কল্পবিজ্ঞান, ভবিষ্যৎ, প্রযুক্তি এবং পরিচিত জগতের বাইরের সম্ভাবনাগুলো ঘুরে দেখুন।",
    cover: "/books/moonlit-orbit.svg",
  },
  {
    slug: "psychology",
    title: "মনোবিজ্ঞান",
    description: "মানুষের চিন্তা, আচরণ, আবেগ এবং নিজের ও অন্যের মনকে বোঝার নতুন দৃষ্টিভঙ্গি খুঁজে নিন।",
    cover: "/books/quiet-mountain.svg",
  },
  {
    slug: "philosophy",
    title: "দর্শন",
    description: "জীবন, সত্য, নৈতিকতা এবং মানুষের অস্তিত্ব নিয়ে গভীর চিন্তার সুযোগ তৈরি করুন।",
    cover: "/books/olive-studies.svg",
  },
  {
    slug: "religion",
    title: "ধর্মীয় সাহিত্য",
    description: "ধর্মীয় চিন্তা, বিশ্বাস, ঐতিহ্য ও আধ্যাত্মিক বিষয় সম্পর্কে পড়ুন এবং জানুন।",
    cover: "/books/desert-star.svg",
  },
];

const steps = [
  {
    number: "০১",
    title: "অ্যাকাউন্ট তৈরি ও মেম্বারশিপ সক্রিয় করুন",
    description: "ওয়েবসাইটে অ্যাকাউন্ট তৈরি করে মেম্বারশিপের আবেদন জমা দিন। নির্ধারিত ফি পরিশোধ এবং প্রয়োজনীয় প্রক্রিয়া সম্পন্ন করে আপনার মেম্বারশিপ সক্রিয় করুন।",
  },
  {
    number: "০২",
    title: "পছন্দের বই নির্বাচন করুন",
    description: "ক্যাটালগ থেকে বই খুঁজুন, বইয়ের বিবরণ ও প্রাপ্যতা দেখুন এবং পছন্দের বইটির পেজ থেকে বই ভাড়ার অনুরোধ জমা দিন।",
  },
  {
    number: "০৩",
    title: "পেমেন্ট ও বই গ্রহণ করুন",
    description: "প্রযোজ্য সাবস্ক্রিপশন ফি এবং প্রয়োজনীয় প্রক্রিয়া সম্পন্ন করুন। বইয়ের প্রাপ্যতা ও রেন্টাল নিশ্চিত হওয়ার পর নির্ধারিত পদ্ধতিতে বই গ্রহণ করুন।",
  },
  {
    number: "০৪",
    title: "পড়ুন এবং সময়মতো ফেরত দিন",
    description: "বই পড়ুন, যত্নে রাখুন এবং নির্ধারিত সময়সীমার মধ্যে ফেরত দিন। প্রযোজ্য নিয়ম অনুযায়ী সাবস্ক্রিপশন নবায়ন করে বই পড়া চালিয়ে যেতে পারেন।",
  },
];

const values = [
  {
    title: "পাঠকের অভিজ্ঞতা",
    description: "বই খুঁজে দেখা থেকে শুরু করে রেন্টাল প্রক্রিয়া পর্যন্ত প্রতিটি ধাপ সহজ ও বোধগম্য রাখার চেষ্টা করি।",
    icon: "book",
  },
  {
    title: "স্বচ্ছতা ও দায়িত্বশীলতা",
    description: "মেম্বারশিপ, সাবস্ক্রিপশন, বই ফেরত এবং অন্যান্য প্রযোজ্য নিয়ম সম্পর্কে পরিষ্কার তথ্য দেওয়াকে আমরা গুরুত্ব দিই।",
    icon: "trust",
  },
  {
    title: "বইয়ের যত্ন",
    description: "প্রতিটি বইয়ের নিজস্ব মূল্য রয়েছে। তাই বই যথাযথভাবে ব্যবহার করা এবং নির্ধারিত সময়ে ফেরত দেওয়া আমাদের লাইব্রেরি ব্যবস্থার গুরুত্বপূর্ণ অংশ।",
    icon: "care",
  },
  {
    title: "নতুন কিছু আবিষ্কারের সুযোগ",
    description: "বই আমাদের পরিচিত চিন্তার বাইরে যেতে সাহায্য করে। আমরা চাই, পাঠকরা নিজেদের আগ্রহ অনুযায়ী নতুন গল্প, ধারণা ও দৃষ্টিভঙ্গি আবিষ্কার করুন।",
    icon: "discover",
  },
] as const;

function ValueIcon({ name }: { name: (typeof values)[number]["icon"] }) {
  if (name === "book") {
    return <svg fill="none" viewBox="0 0 24 24"><path d="M3.5 5.5c3.3-.8 5.8-.1 8.5 1.8 2.7-1.9 5.2-2.6 8.5-1.8v13c-3.3-.8-5.8-.1-8.5 1.8-2.7-1.9-5.2-2.6-8.5-1.8z" /><path d="M12 7.3v13" /></svg>;
  }
  if (name === "trust") {
    return <svg fill="none" viewBox="0 0 24 24"><path d="M12 3 20 6v5.5c0 4.5-3.1 7.8-8 9.5-4.9-1.7-8-5-8-9.5V6z" /><path d="m8.5 12 2.3 2.3 4.8-5" /></svg>;
  }
  if (name === "care") {
    return <svg fill="none" viewBox="0 0 24 24"><path d="M4 5.5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" /><path d="M6.5 9h3M6.5 12h3M14.5 9h3M14.5 12h3" /></svg>;
  }
  return <svg fill="none" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5M10.5 7v7M7 10.5h7" /></svg>;
}

export async function AboutPageContent() {
  const categories = await getCategories();
  const categoryCards = categoryContent.flatMap((content) => {
    const category = categories.find((item) => item.slug === content.slug);
    return category ? [{ ...content, href: `/categories/${category.slug}` }] : [];
  });

  return (
    <main className="page-main about-page" id="main-content" lang="bn">
      <AboutScrollReveal />
      <section aria-labelledby="about-title" className="about-hero about-reveal">
        <div className="container about-hero-inner">
          <div className="about-hero-copy">
            <p className="about-kicker">আমাদের লাইব্রেরি</p>
            <h1 id="about-title">গল্পের পাতায়,<br /><span>ভাবনার জগতে</span></h1>
            <p className="about-hero-tagline">প্রতিটি বই একটি নতুন অভিজ্ঞতা, প্রতিটি পৃষ্ঠা নতুন কিছু জানার সুযোগ।</p>
            <p>স্বাগতম Undergraduate Hub Library-তে—বইপ্রেমী, কৌতূহলী পাঠক এবং নতুন চিন্তার সন্ধানকারীদের জন্য একটি বই ভাড়া সেবা। অনলাইন ক্যাটালগে বইয়ের সংগ্রহ দেখে পছন্দের বই খুঁজে নিন, বিবরণ ও প্রাপ্যতা জেনে রেন্টাল অনুরোধ জমা দিন।</p>
            <p className="about-hero-closer">আপনার পরবর্তী প্রিয় বইটি হয়তো এখানেই অপেক্ষা করছে।</p>
            <Link className="button-primary" href="/books">বইয়ের সংগ্রহ দেখুন <span aria-hidden="true">↗</span></Link>
          </div>
          <div aria-label="বইয়ের প্রচ্ছদের একটি সাজানো সংগ্রহ" className="about-hero-art" role="group">
            <figure className="about-hero-cover about-hero-cover-back">
              <Image alt="" fill sizes="(max-width: 700px) 30vw, 150px" src="/books/olive-studies.svg" />
            </figure>
            <figure className="about-hero-cover about-hero-cover-front">
              <Image alt="বই, কল্পনা ও আবিষ্কারের প্রতীকী প্রচ্ছদ" fill preload sizes="(max-width: 700px) 48vw, 230px" src="/books/cosmic-atlas.svg" />
            </figure>
            <figure className="about-hero-cover about-hero-cover-side">
              <Image alt="" fill sizes="(max-width: 700px) 34vw, 165px" src="/books/desert-star.svg" />
            </figure>
            <span className="about-art-caption">একটি বই, অসংখ্য জগৎ</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="about-who-title" className="about-story about-reveal">
        <div className="container about-story-inner">
          <div className="about-section-heading">
            <p className="about-kicker">বইয়ের সঙ্গে অর্থবহ সংযোগ</p>
            <h2 id="about-who-title">আমরা কারা?</h2>
          </div>
          <div className="about-story-copy">
            <p className="about-story-lead">Undergraduate Hub Library একটি বইভিত্তিক উদ্যোগ, যার উদ্দেশ্য পাঠকদের সঙ্গে বইয়ের একটি অর্থবহ সংযোগ তৈরি করা।</p>
            <p>আমরা বিশ্বাস করি, বই শুধু বিনোদনের মাধ্যম নয়; বই আমাদের চিন্তা করতে শেখায়, নতুন দৃষ্টিভঙ্গির সঙ্গে পরিচয় করিয়ে দেয় এবং পরিচিত জগতের বাইরেও অনেক কিছু আবিষ্কার করার সুযোগ করে দেয়।</p>
            <p>এই ভাবনা থেকেই আমাদের লাইব্রেরির কাজ। আমরা চাই, পাঠকরা সহজে বইয়ের সংগ্রহ দেখতে পারবেন, পছন্দের বই সম্পর্কে জানতে পারবেন এবং নির্ধারিত মেম্বারশিপ ও রেন্টাল প্রক্রিয়ার মাধ্যমে বই পড়ার সুযোগ পাবেন।</p>
            <p>আমাদের কাছে একটি লাইব্রেরি মানে শুধু বইয়ের তাক নয়—এটি জ্ঞান, কল্পনা, চিন্তা এবং নতুন অভিজ্ঞতার একটি উন্মুক্ত দরজা।</p>
          </div>
        </div>
      </section>

      <section aria-label="আমাদের লক্ষ্য ও স্বপ্ন" className="about-purpose container about-reveal">
        <article className="about-purpose-card about-purpose-card-goal">
          <span className="about-card-index">০১ / আমাদের লক্ষ্য</span>
          <h2>বই পড়াকে আরও সহজ ও উপভোগ্য করা</h2>
          <p>আমাদের লক্ষ্য হলো পাঠকদের জন্য বই খুঁজে দেখা, পছন্দের বই নির্বাচন এবং বই ভাড়া নেওয়ার প্রক্রিয়াকে সহজ ও সুসংগঠিত করা।</p>
          <p>আমরা চাই, বই পড়ার আগ্রহ যেন শুধু ইচ্ছার মধ্যে সীমাবদ্ধ না থাকে; বরং তা নিয়মিত চর্চায় পরিণত হয়।</p>
        </article>
        <article className="about-purpose-card about-purpose-card-dream">
          <span className="about-card-index">০২ / আমাদের স্বপ্ন</span>
          <h2>একটি বইপ্রেমী কমিউনিটি গড়ে তোলা</h2>
          <p>আমরা এমন একটি পাঠকসমাজ গড়ে তুলতে চাই, যেখানে মানুষ নতুন গল্প আবিষ্কার করবে, নতুন ধারণার সঙ্গে পরিচিত হবে এবং বইয়ের মাধ্যমে নিজেদের চিন্তার জগৎকে আরও সমৃদ্ধ করবে।</p>
          <p>আমাদের স্বপ্ন, পাঠকরা Undergraduate Hub Library-তে বারবার ফিরে আসবেন নতুন কোনো বইয়ের সন্ধানে।</p>
        </article>
      </section>

      <section aria-labelledby="about-collection-title" className="about-collection about-reveal">
        <div className="container">
          <div className="about-section-heading about-collection-heading">
            <div>
              <p className="about-kicker">প্রতিটি পাঠকের পছন্দ আলাদা</p>
              <h2 id="about-collection-title">আমাদের বইয়ের সংগ্রহ</h2>
            </div>
            <p>কেউ গল্পের জগতে হারিয়ে যেতে চান, কেউ মানুষের মন বুঝতে চান, আবার কেউ জীবন, দর্শন ও বিশ্বাস নিয়ে গভীরভাবে ভাবতে ভালোবাসেন। তাই আমাদের সংগ্রহে রয়েছে বিভিন্ন ধরনের বই।</p>
          </div>
          <div className="about-category-grid">
            {categoryCards.map((category, index) => (
              <Link className="about-category-card" href={category.href} key={category.slug}>
                <span className="about-category-cover">
                  <Image alt={`${category.title} বিভাগের একটি বইয়ের প্রচ্ছদ`} fill sizes="(max-width: 640px) 42vw, (max-width: 900px) 28vw, 18vw" src={category.cover} />
                  <span aria-hidden="true" className="about-category-number">০{index + 1}</span>
                </span>
                <span className="about-category-copy">
                  <span className="about-category-title">{category.title}</span>
                  <span className="about-category-description">{category.description}</span>
                  <span className="about-category-link">বই দেখুন <span aria-hidden="true">↗</span></span>
                </span>
              </Link>
            ))}
          </div>
          <p className="about-collection-note">এ ছাড়াও আমাদের ক্যাটালগে অন্যান্য ক্যাটাগরির বই থাকতে পারে। নতুন বই যুক্ত হওয়ার সঙ্গে সঙ্গে সংগ্রহও সমৃদ্ধ হবে।</p>
          <Link className="button-outline" href="/books">সব বই দেখুন <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section aria-labelledby="about-steps-title" className="about-process container about-reveal">
        <div className="about-section-heading about-process-heading">
          <div>
            <p className="about-kicker">পছন্দের বই থেকে পড়ার আনন্দ</p>
            <h2 id="about-steps-title">কীভাবে আমাদের লাইব্রেরি ব্যবহার করবেন?</h2>
          </div>
          <p>আপনার পছন্দের বইটি খুঁজে পাওয়া থেকে শুরু করে বই পড়া পর্যন্ত প্রক্রিয়াটি সহজ রাখার চেষ্টা করি।</p>
        </div>
        <ol className="about-steps-list">
          {steps.map((step) => (
            <li className="about-step" key={step.number}>
              <span className="about-step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <div className="about-process-actions">
          <p>বিস্তারিত নিয়ম জানতে আমাদের <Link href="/terms-and-conditions">শর্তাবলি</Link> দেখুন।</p>
          <Link className="button-primary" href="/member/apply">মেম্বারশিপ সম্পর্কে জানুন <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section aria-labelledby="about-values-title" className="about-values-section about-reveal">
        <div className="container">
          <div className="about-section-heading">
            <div>
              <p className="about-kicker">আমাদের প্রতিটি কাজে</p>
              <h2 id="about-values-title">আমরা যে বিষয়গুলোকে গুরুত্ব দিই</h2>
            </div>
          </div>
          <div className="about-values-grid">
            {values.map((value) => (
              <article className="about-value-card" key={value.icon}>
                <span aria-hidden="true" className="about-value-icon"><ValueIcon name={value.icon} /></span>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="about-final-title" className="about-final-cta about-reveal">
        <div className="container about-final-inner">
          <p className="about-kicker">Undergraduate Hub Library</p>
          <h2 id="about-final-title">আপনার বই পড়ার যাত্রা শুরু হোক আজই</h2>
          <p className="about-final-reflection">কখনো একটি গল্প আমাদের অন্য জগতে নিয়ে যায়। কখনো একটি ধারণা আমাদের চিন্তাভাবনা বদলে দেয়। আবার কখনো একটি বই এমন একটি প্রশ্নের সামনে দাঁড় করায়, যা নিয়ে আমরা আগে কখনো ভাবিনি। সেই নতুন অভিজ্ঞতার খোঁজেই Undergraduate Hub Library।</p>
          <p className="about-final-copy">আপনার পছন্দের বইটি খুঁজে নিন, পড়ার আনন্দ উপভোগ করুন এবং জ্ঞানের জগতে নিজের যাত্রা চালিয়ে যান।</p>
          <div className="about-final-actions">
            <Link className="button-primary" href="/books">বইয়ের সংগ্রহ ঘুরে দেখুন <span aria-hidden="true">↗</span></Link>
            <Link className="button-outline" href="/member/apply">মেম্বারশিপ সম্পর্কে জানুন</Link>
          </div>
          <p className="about-signoff"><strong>Undergraduate Hub Library</strong><span>পড়ুন। জানুন। ভাবুন। এগিয়ে যান।</span></p>
        </div>
      </section>
    </main>
  );
}