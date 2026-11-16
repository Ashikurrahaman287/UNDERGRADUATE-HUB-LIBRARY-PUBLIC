import type { ReactNode } from "react";

type ButtonLabelProps = {
  children: ReactNode;
  pending: boolean;
  pendingLabel: ReactNode;
};

export function ButtonLabel({ children, pending, pendingLabel }: ButtonLabelProps) {
  return (
    <>
      <span aria-hidden={pending} className="button-state-label">{children}</span>
      <span aria-hidden={!pending} className="button-pending-label">{pendingLabel}</span>
    </>
  );
}