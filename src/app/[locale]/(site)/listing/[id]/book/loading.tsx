import { Container } from "@/components/common/container";
import { SkeletonBlock } from "@/components/common/skeletons";

/** The booking step while it loads (instead of the listing page's skeleton from ../loading.tsx). */
export default function Loading() {
  return (
    <Container className="grid max-w-xl justify-items-center gap-4 py-12" aria-hidden>
      <SkeletonBlock className="size-16 rounded-full" />
      <SkeletonBlock className="h-6 w-64" />
      <SkeletonBlock className="h-4 w-72" />
      <SkeletonBlock className="h-12 w-44 rounded-button" />
    </Container>
  );
}
