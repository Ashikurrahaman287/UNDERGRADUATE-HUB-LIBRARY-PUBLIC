import type { Metadata } from "next";
import { FAQContent } from "@/components/faq/faq-content";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Answers about Undergraduate Hub Library membership, book rentals, subscriptions and returns.",
  alternates: { canonical: "/faq" },
};

export default function FAQPage() {
  return (
    <main className="page-main faq-page" id="main-content">
      <FAQContent />
    </main>
  );
}