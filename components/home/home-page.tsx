import Link from "next/link";
import { BookSearch } from "@/components/home/book-search";
import { CategoryLinksSection } from "@/components/home/category-links-section";
import { HomeBookSection } from "@/components/home/home-book-section";
import { HomeHero } from "@/components/home/home-hero";
import { MoodGrid } from "@/components/home/mood-grid";
import { ReadingSteps } from "@/components/home/reading-steps";
import { Testimonials } from "@/components/home/testimonials";
import { getBooks, getCategories } from "@/lib/books";
import { bookMatchesCategory } from "@/lib/book-utils";

export async function HomePage() {
  const [books, categories] = await Promise.all([getBooks(), getCategories()]);
  const featuredBooks = books.filter((book) => book.featured).slice(0, 20);
  const storyBooks = books.filter((book) => bookMatchesCategory(book, "Novels")).slice(0, 4);
  const ideaBooks = books.filter((book) => ["Psychology", "Philosophy", "Self Development"].some((category) => bookMatchesCategory(book, category))).slice(0, 4);
  const worldBooks = books.filter((book) => ["Sci-Fi", "Fantasy"].some((category) => bookMatchesCategory(book, category))).slice(0, 4);
  const recentBooks = [...books].sort((first, second) => second.addedAt.localeCompare(first.addedAt)).slice(0, 4);

  return (
    <main id="main-content">
      <HomeHero />
      <BookSearch books={books} />
      <MoodGrid />
      <HomeBookSection id="featured-books" eyebrow="Picked with care" title="Featured Books" books={featuredBooks} linkHref="/books" linkLabel="View all books" />
      <HomeBookSection id="stories" eyebrow="A story to step inside" title="Stories you'll remember." description="Novels, fiction, mystery and unforgettable characters." books={storyBooks} linkHref="/categories/novels" linkLabel="Explore stories" />
      <HomeBookSection id="ideas" eyebrow="Ideas to carry with you" title="Books that make you think." description="Psychology, philosophy, self-development and ideas worth exploring." books={ideaBooks} linkHref="/categories/psychology" linkLabel="Explore ideas" variant="paper" />
      <HomeBookSection id="other-worlds" eyebrow="Beyond the familiar" title="Worlds you've never visited." description="Step beyond the familiar." books={worldBooks} linkHref="/categories/science-fiction" linkLabel="Find another world" />
      <CategoryLinksSection categories={categories} />
      <HomeBookSection id="recently-added" eyebrow="Fresh to the shelves" title="Recently Added" books={recentBooks} linkHref="/books" linkLabel="See the full collection" variant="paper" />
      <Testimonials />
      <ReadingSteps />
      <section className="home-about-band">
        <div className="container home-about-inner">
          <p className="eyebrow">Undergraduate Hub Library</p>
          <h2 className="display-font">A library for curious minds.</h2>
          <p>Undergraduate Hub Library is a growing collection of stories, ideas and perspectives — from unforgettable novels and imagined worlds to books about psychology, philosophy, religion and life.</p>
          <Link className="button-outline" href="/about">About Undergraduate Hub <span aria-hidden="true">→</span></Link>
        </div>
      </section>
      <section className="home-final-cta">
        <div className="container home-final-inner">
          <p className="eyebrow">Leave with a story</p>
          <h2 className="display-font">Your next book is waiting.</h2>
          <Link className="button-primary" href="/books">Explore the Library <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  );
}