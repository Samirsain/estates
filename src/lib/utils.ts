import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** A Project as the lists print it, "GEE · GOVIND VATIKA": two Projects may share a name, never a code (owner, 18 Nov 2026). */
export function projectLabel(project: { projectCode: string; name: string }) {
  return `${project.projectCode} · ${project.name}`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
