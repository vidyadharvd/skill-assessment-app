"use client";

import { useFormStatus } from "react-dom";

type PendingButtonProps = {
  className: string;
  disabled?: boolean;
  idleLabel: string;
  pendingLabel: string;
};

export function PendingButton({
  className,
  disabled = false,
  idleLabel,
  pendingLabel,
}: PendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
