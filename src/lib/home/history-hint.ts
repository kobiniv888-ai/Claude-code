/**
 * No layout shift for returning visitors (round 3, brief 4). "המשך מאיפה שעצרתם" is built in the
 * browser from this device's history, so the server cannot know it is coming. The home page runs
 * HOME_HISTORY_SCRIPT inline, before the block's HTML: it sets <html data-home-history="r s"> when
 * this device has recently viewed places ("r") and a last search that still shows ("s"), and the
 * block's server-rendered placeholder reserves exactly those rows (CSS). Nothing is reserved for
 * a first visit, so nothing moves. It reads only what the history stores may keep: with cookie
 * consent for "preferences" (see ./history-store).
 */
import { CONSENT_COOKIE_NAME, CONSENT_VERSION } from "@/lib/consent-cookie";
import { RECENTLY_VIEWED_STORAGE_KEY } from "@/lib/recently-viewed/core";
import { LAST_SEARCH_STORAGE_KEY } from "./last-search";

export const HOME_HISTORY_ATTR = "data-home-history";

const q = JSON.stringify;

export const HOME_HISTORY_SCRIPT =
  `(function(){try{` +
  `var n=${q(`${CONSENT_COOKIE_NAME}=`)},c=null,p=document.cookie.split(";");` +
  `for(var i=0;i<p.length;i++){var s=p[i].trim();if(s.indexOf(n)===0)c=JSON.parse(decodeURIComponent(s.slice(n.length)))}` +
  `if(!c||c.v!==${CONSENT_VERSION}||c.preferences!==true)return;` +
  `var f=[],r=JSON.parse(localStorage.getItem(${q(RECENTLY_VIEWED_STORAGE_KEY)})||"[]");` +
  `if(Array.isArray(r)&&r.length)f.push("r");` +
  `var l=JSON.parse(localStorage.getItem(${q(LAST_SEARCH_STORAGE_KEY)})||"null");` +
  `if(l&&l.v===1&&typeof l.exp==="number"&&l.exp>Date.now())f.push("s");` +
  `if(f.length)document.documentElement.setAttribute(${q(HOME_HISTORY_ATTR)},f.join(" "))` +
  `}catch(e){}})();`;
