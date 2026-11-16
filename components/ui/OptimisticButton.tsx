"use client";

import { useOptimistic, useState, useTransition, type ReactNode } from "react";

type OptimisticActionResult = { error?: string } | void;

type OptimisticButtonProps<State> = {
  actionId: string;
  initialState: State;
  optimisticState: State | ((current: State) => State);
  onActionServer: (actionId: string, nextState: State) => Promise<OptimisticActionResult>;
  children: ReactNode | ((state: State) => ReactNode);
  renderState?: (state: State) => ReactNode;
  pendingLabel: string;
  className?: string;
  errorMessage?: string;
};

export function OptimisticButton<State>({
  actionId,
  initialState,
  optimisticState,
  onActionServer,
  children,
  renderState,
  pendingLabel,
  className = "admin-action-button",
  errorMessage = "This change could not be saved. Try again.",
}: OptimisticButtonProps<State>) {
  const [committedValue, setCommittedValue] = useState({ source: initialState, value: initialState });
  const committedState = Object.is(committedValue.source, initialState) ? committedValue.value : initialState;
  const [state, setOptimisticState] = useOptimistic(committedState, (_current, next: State) => next);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nextState = typeof optimisticState === "function"
    ? (optimisticState as (current: State) => State)(state)
    : optimisticState;

  function runAction() {
    setError(null);
    startTransition(async () => {
      setOptimisticState(nextState);
      try {
        const result = await onActionServer(actionId, nextState);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setCommittedValue({ source: initialState, value: nextState });
      } catch {
        setError(errorMessage);
      }
    });
  }

  return <span className="optimistic-action">
    {renderState ? <span className="optimistic-action-state" aria-live="polite">{renderState(state)}</span> : null}
    <button aria-busy={isPending} className={`${className} button-stateful`} disabled={isPending} onClick={runAction} type="button">
      <span className="button-state-label">{typeof children === "function" ? children(state) : children}</span>
      <span aria-hidden={!isPending} className="button-pending-label">{pendingLabel}</span>
    </button>
    {error ? <span className="admin-form-error optimistic-action-error" role="alert">{error}</span> : null}
  </span>;
}