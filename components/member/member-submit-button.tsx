"use client";

import { useFormStatus } from "react-dom";
import { ButtonLabel } from "@/components/button-label";

type MemberSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
};

export function MemberSubmitButton({ children, pendingLabel, className = "button-primary" }: MemberSubmitButtonProps) {
  const { pending } = useFormStatus();
  return <button aria-busy={pending} className={`${className} button-stateful`} disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel={pendingLabel}>{children}</ButtonLabel></button>;
}