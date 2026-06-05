import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Linear button variants — `button-primary`, `button-secondary`, `button-tertiary`
 * from design.md. All share `text-button` typography and `rounded-md` corners.
 *
 * Sizing: default ~36px tall (touch target floor) with 8px vertical / 14px
 * horizontal padding per the design spec's compact button rule.
 */
type Variant = "primary" | "secondary" | "tertiary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  "inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md " +
  "text-button transition-colors cursor-pointer disabled:cursor-not-allowed " +
  "disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-[var(--color-on-primary)] hover:bg-primary-hover " +
    "active:bg-primary-focus",
  secondary:
    "bg-surface-1 text-ink border border-hairline hover:bg-surface-2 " +
    "hover:border-hairline-strong",
  tertiary: "bg-transparent text-ink hover:bg-surface-1",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], className)}
        {...rest}
      />
    );
  },
);
