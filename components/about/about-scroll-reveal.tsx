"use client";

import { useEffect } from "react";

export function AboutScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

    const sections = document.querySelectorAll<HTMLElement>(".about-reveal");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("about-reveal-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    sections.forEach((section) => {
      section.classList.add("about-reveal-pending");
      observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  return null;
}