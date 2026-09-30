import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A link that looks like a Button. Base UI's Button insists on a native <button>, and calling
 * `buttonVariants` directly skips class merging, so `border-transparent` would beat `border-border`.
 */
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"a"> & VariantProps<typeof buttonVariants>) {
  return <a className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
