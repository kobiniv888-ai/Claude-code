/**
 * Support ticket UI, shared by the user's pages and the admin support screens.
 *
 *   <TicketStatusBadge status={ticket.status} perspective="staff" />
 *   <TicketProgress status={ticket.status} perspective="staff" />
 *   <TicketMessageList messages={ticket.messages} perspective="staff" requesterName={name} />
 */
export { TicketStatusBadge, TicketCategoryLabel, TicketPriorityBadge } from "./ticket-status-badge";
export { TicketMessageList, type TicketMessageItem } from "./ticket-message-list";
export { TicketProgress } from "./ticket-progress";
export { TicketList, type TicketListEntry } from "./ticket-list";
export { ShabbatPauseNotice } from "./shabbat-pause-notice";
export { ScreenshotPicker } from "./screenshot-picker";
export { ticketCategoryIcons, ticketStatusIcons } from "./ticket-icons";
