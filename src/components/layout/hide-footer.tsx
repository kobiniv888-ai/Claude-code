/**
 * Render anywhere on a page to hide the site footer there: inside the post form (/post/<id>, the
 * edit form) and the booking flow (/listing/<id>/book), where its links only lead away from the
 * task (round 3, section 3). Pure CSS (src/app/styles/bayit.css), so there is no flash; the
 * language and currency pickers stay in the phone menu and the desktop header.
 *
 *   <HideFooter />
 */
export function HideFooter() {
  return <span data-hide-footer hidden />;
}
