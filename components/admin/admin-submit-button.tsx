"use client";

import { useFormStatus } from "react-dom";
import { ButtonLabel } from "@/components/button-label";

type AdminSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  confirmMessage?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
};

export function AdminSubmitButton({ children, pendingLabel, className = "button-primary", confirmMessage, disabled = false, name, value }: AdminSubmitButtonProps) {
  const { pending } = useFormStatus();
  return <button aria-busy={pending} className={`${className} button-stateful`} disabled={pending || disabled} name={name} onClick={(event) => {
    if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
  }} type="submit" value={value}><ButtonLabel pending={pending} pendingLabel={pendingLabel}>{children}</ButtonLabel></button>;
}