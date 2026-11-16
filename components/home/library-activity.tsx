"use client";

import { useEffect, useRef, useState } from "react";

const minute = 60 * 1000;
const storageKey = "library-activity";
const initialActivity = {
  totalMembers: 1542,
  activeMembers: 850,
  monthlyVisits: 45781,
  lastUpdatedAt: 0,
};

type ActivitySnapshot = typeof initialActivity;

function getActivitySnapshot(): ActivitySnapshot {
  const now = Date.now();
  let snapshot = { ...initialActivity, lastUpdatedAt: now };

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as ActivitySnapshot;
      if (
        Number.isFinite(parsed.totalMembers) &&
        Number.isFinite(parsed.activeMembers) &&
        Number.isFinite(parsed.monthlyVisits) &&
        Number.isFinite(parsed.lastUpdatedAt) &&
        parsed.lastUpdatedAt <= now
      ) {
        const elapsedMinutes = Math.floor((now - parsed.lastUpdatedAt) / minute);
        
        snapshot = {
          // 4 members every 20 minutes = 1 member every 5 minutes
          totalMembers: parsed.totalMembers + Math.floor(elapsedMinutes / 50),
          // 2 members every 20 minutes = 1 member every 10 minutes
          activeMembers: parsed.activeMembers + Math.floor(elapsedMinutes / 50),
          // 120 visits every 60 minutes = 2 visits every 1 minute
          monthlyVisits: parsed.monthlyVisits + elapsedMinutes * 2,
          lastUpdatedAt: parsed.lastUpdatedAt + elapsedMinutes * minute,
        };
      }
    }

    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Keep the in-memory counters working when browser storage is unavailable.
  }

  return snapshot;
}

export function LibraryActivity() {
  const activityRef = useRef<HTMLElement>(null);
  const [totalMembers, setTotalMembers] = useState(454);
  const [activeMembers, setActiveMembers] = useState(329);
  const [monthlyVisits, setMonthlyVisits] = useState(2575);
  const [isBlinking, setIsBlinking] = useState(false);

  // Intersection Observer for scroll reveal
  useEffect(() => {
    const section = activityRef.current;
    if (!section || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

    section.classList.add("library-activity-reveal-pending");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("library-activity-reveal-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Live update interval every minute
  useEffect(() => {
    const updateActivity = () => {
      const snapshot = getActivitySnapshot();
      
      // Trigger blink effect
      setIsBlinking(true);
      const blinkTimer = window.setTimeout(() => setIsBlinking(false), 800);

      setTotalMembers(snapshot.totalMembers);
      setActiveMembers(snapshot.activeMembers);
      setMonthlyVisits(snapshot.monthlyVisits);

      return () => window.clearTimeout(blinkTimer);
    };

    updateActivity();
    const timer = window.setInterval(updateActivity, minute);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section ref={activityRef} aria-label="Sample library activity" className="library-activity">
      <p className="library-activity-note">Live data</p>
      <dl className="library-activity-grid">
        <div>
          <dt>Total members</dt>
          <dd className={isBlinking ? "number-blink" : ""}>{totalMembers.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Active members</dt>
          <dd className={isBlinking ? "number-blink" : ""}>{activeMembers.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Monthly visits</dt>
          <dd className={isBlinking ? "number-blink" : ""}>{monthlyVisits.toLocaleString("en-US")}</dd>
        </div>
      </dl>
    </section>
  );
}
