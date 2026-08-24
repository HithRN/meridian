import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names with correct override precedence. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
