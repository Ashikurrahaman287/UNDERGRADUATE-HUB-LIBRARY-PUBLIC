import type { Metadata } from "next";
import { AboutPageContent } from "@/components/about/about-page-content";

export const metadata: Metadata = {
  title: "আমাদের সম্পর্কে",
  description: "Undergraduate Hub Library-র বই ভাড়া সেবা, সংগ্রহ এবং বই পড়ার সহজ প্রক্রিয়া সম্পর্কে জানুন।",
  alternates: { canonical: "/about" },
};

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return <AboutPageContent />;
}