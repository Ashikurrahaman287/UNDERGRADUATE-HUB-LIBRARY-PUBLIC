"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MemberCareerApplication } from "@/components/careers/member-application-history";

type PendingApplication = MemberCareerApplication & { isSubmitting: true };
type CareerApplicationContextValue = {
  pendingApplications: PendingApplication[];
  addPendingApplication: (application: PendingApplication) => void;
  removePendingApplication: (applicationId: string) => void;
};

const CareerApplicationContext = createContext<CareerApplicationContextValue | null>(null);

export function CareerOptimisticApplicationsProvider({ children }: { children: ReactNode }) {
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);

  function addPendingApplication(application: PendingApplication) {
    setPendingApplications((current) => [...current.filter((item) => item.id !== application.id), application]);
  }

  function removePendingApplication(applicationId: string) {
    setPendingApplications((current) => current.filter((item) => item.id !== applicationId));
  }

  return <CareerApplicationContext.Provider value={{ pendingApplications, addPendingApplication, removePendingApplication }}>
    {children}
  </CareerApplicationContext.Provider>;
}

export function useCareerOptimisticApplications(): CareerApplicationContextValue {
  const context = useContext(CareerApplicationContext);
  if (!context) throw new Error("Career optimistic applications must be used within their provider.");
  return context;
}
