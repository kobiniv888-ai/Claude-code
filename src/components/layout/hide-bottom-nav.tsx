/**
 * Render anywhere on a page to hide the mobile bottom bar there (the post wizard, full-screen
 * galleries, pages with their own sticky action bar). Pure CSS (globals.css), so there is no flash.
 *
 *   <HideBottomNav />
 */
export function HideBottomNav() {
  return <span data-hide-bottom-nav hidden />;
}
