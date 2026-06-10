const menuToggle = document.querySelector("[data-menu-toggle]");
const siteNav = document.querySelector("[data-site-nav]");
const header = document.querySelector("[data-header]");
const applicationLinks = document.querySelectorAll(".application-link");
const sitePopup = document.querySelector("[data-site-popup]");
const popupCloseButtons = document.querySelectorAll("[data-popup-close]");
const hero = document.querySelector(".hero");
const routeSections = document.querySelectorAll("[data-route-section]");
const routeLinks = document.querySelectorAll('.site-nav a[href^="#"], .brand[href^="#"]');
const internalLinks = document.querySelectorAll('a[href^="#"]');
let popupReturnFocus = null;

const routeIds = new Set(["home", ...Array.from(routeSections, (section) => section.id)]);

function getRouteId() {
  const hash = window.location.hash.replace("#", "");

  if (!hash || hash === "entry-guide") {
    return hash === "entry-guide" ? "entry" : "home";
  }

  return routeIds.has(hash) ? hash : "home";
}

function normalizeRouteId(routeId) {
  if (!routeId) {
    return "home";
  }

  if (routeId === "entry-guide") {
    return "entry";
  }

  return routeIds.has(routeId) ? routeId : "home";
}

function updateRoute(routeId = getRouteId()) {
  const activeRoute = normalizeRouteId(routeId);
  const isHome = activeRoute === "home";

  if (hero) {
    hero.hidden = !isHome;
  }

  routeSections.forEach((section) => {
    section.hidden = section.id !== activeRoute;
  });

  routeLinks.forEach((link) => {
    const linkRoute = link.getAttribute("href")?.replace("#", "") || "home";
    if (linkRoute === activeRoute) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  closeMenu();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function openRoute(routeId) {
  const nextRoute = normalizeRouteId(routeId);
  const nextHash = `#${nextRoute}`;

  if (window.location.hash !== nextHash) {
    history.pushState(null, "", nextHash);
  }

  updateRoute(nextRoute);
}

function closeMenu() {
  document.body.classList.remove("nav-open");
  siteNav?.classList.remove("is-open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

function openPopup() {
  if (!sitePopup) {
    return;
  }

  popupReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sitePopup.hidden = false;
  document.body.classList.add("popup-open");
  closeMenu();
  sitePopup.querySelector(".site-popup-close")?.focus();
}

function closePopup() {
  if (!sitePopup || sitePopup.hidden) {
    return;
  }

  sitePopup.hidden = true;
  document.body.classList.remove("popup-open");

  if (popupReturnFocus && document.contains(popupReturnFocus)) {
    popupReturnFocus.focus();
  }
  popupReturnFocus = null;
}

menuToggle?.addEventListener("click", () => {
  const isOpen = siteNav?.classList.toggle("is-open");
  document.body.classList.toggle("nav-open", Boolean(isOpen));
  menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

siteNav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    closeMenu();
  }
});

internalLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const routeId = link.getAttribute("href")?.replace("#", "");

    if (!routeId || routeId.startsWith("http")) {
      return;
    }

    if (routeIds.has(routeId) || routeId === "entry-guide") {
      event.preventDefault();
      openRoute(routeId);
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePopup();
    closeMenu();
  }
});

popupCloseButtons.forEach((button) => {
  button.addEventListener("click", closePopup);
});

window.addEventListener("load", () => {
  updateRoute();
  window.setTimeout(openPopup, 250);
});

window.addEventListener("hashchange", updateRoute);
window.addEventListener("popstate", updateRoute);

const observer = new IntersectionObserver(
  ([entry]) => {
    header?.classList.toggle("is-scrolled", !entry.isIntersecting);
  },
  { threshold: 0.1 }
);

if (hero) {
  observer.observe(hero);
}

updateRoute();

applicationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const url = link.getAttribute("data-application-url");
    if (!url) {
      return;
    }
    if (url.startsWith("TODO")) {
      event.preventDefault();
      document.querySelector("#application-link-needed")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
});
