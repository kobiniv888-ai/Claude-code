import type { ReactNode } from "react";
import { HideFooter } from "@/components/layout/hide-footer";

/** The edit form (the post form for a published listing) has no site footer either (round 3). */
export default function EditListingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HideFooter />
      {children}
    </>
  );
}
