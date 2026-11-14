import type { ReactNode } from "react";
import { HideFooter } from "@/components/layout/hide-footer";

/** /post/<id> — inside the post form there is no site footer (round 3), also while a step loads. */
export default function PostFormLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HideFooter />
      {children}
    </>
  );
}
