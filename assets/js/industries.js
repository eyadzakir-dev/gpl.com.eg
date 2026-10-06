/* Industries page: marks the industry in view in the sticky in-page nav (aria-current) and keeps that link
   visible when the nav scrolls sideways on phones. The nav is plain anchor links, so the page works without this. */

const SPY_MARGIN = "-40% 0px -55% 0px";

initIndustryNav(document.querySelector("[data-ind-nav]"));

function initIndustryNav(nav) {
  if (!nav || !("IntersectionObserver" in window)) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = links.map((link) => document.getElementById(link.hash.slice(1))).filter(Boolean);
  if (!sections.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) markCurrent(nav, links, entry.target.id);
    });
  }, { rootMargin: SPY_MARGIN });
  sections.forEach((section) => observer.observe(section));
}

function markCurrent(nav, links, id) {
  const current = links.find((link) => link.hash === `#${id}`);
  links.forEach((link) => {
    if (link === current) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
  if (current) revealInScroller(nav.querySelector(".ind-nav__list"), current);
}

/* scrollBy with a measured offset works the same in LTR and RTL, unlike scrollLeft. */
function revealInScroller(scroller, link) {
  if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
  const box = scroller.getBoundingClientRect();
  const item = link.getBoundingClientRect();
  const offset = item.left + item.width / 2 - (box.left + box.width / 2);
  const behavior = document.documentElement.classList.contains("motion") ? "smooth" : "auto";
  scroller.scrollBy({ left: offset, behavior });
}
