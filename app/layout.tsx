import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { PreFooterBanner } from "@/components/layout/pre-footer-banner";
import { EntryPromotionPopup } from "@/components/layout/entry-promotion-popup";
import { CareerOptimisticApplicationsProvider } from "@/components/careers/career-optimistic-applications";
import { OptimisticBookReviewsProvider } from "@/components/reviews/optimistic-book-reviews";
import { getMemberSession } from "@/lib/member/session";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./brand.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Undergraduate Hub Library | Stories to escape into",
    template: "%s | Undergraduate Hub Library",
  },
  description:
    "A curated library of stories, ideas and perspectives. Find your next favorite read at Undergraduate Hub Library.",
  openGraph: {
    title: "Undergraduate Hub Library",
    description: "Stories to escape into. Ideas to live by.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Undergraduate Hub Library",
    description: "Stories to escape into. Ideas to live by.",
  },
  icons: {
    icon: "/books/ChatGPT%20Image%20Jun%2027,%202026,%2004_46_39%20PM.png",
    apple: "/books/ChatGPT%20Image%20Jun%2027,%202026,%2004_46_39%20PM.png",
  },
  alternates: { canonical: "/" },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialMemberLoggedIn = Boolean(await getMemberSession().catch(() => null));

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Header initialMemberLoggedIn={initialMemberLoggedIn} />
        <EntryPromotionPopup />
        <CareerOptimisticApplicationsProvider><OptimisticBookReviewsProvider>{children}</OptimisticBookReviewsProvider></CareerOptimisticApplicationsProvider>
        <PreFooterBanner />
        <Footer />
      </body>
    </html>
  );
}