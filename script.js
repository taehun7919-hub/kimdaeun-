const menuToggle = document.querySelector("[data-menu-toggle]");
const siteNav = document.querySelector("[data-site-nav]");
const header = document.querySelector("[data-header]");
const applicationLinks = document.querySelectorAll(".application-link");
const sitePopup = document.querySelector("[data-site-popup]");
const popupCloseButtons = document.querySelectorAll("[data-popup-close]");
let popupReturnFocus = null;

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
  window.setTimeout(openPopup, 250);
});

const observer = new IntersectionObserver(
  ([entry]) => {
    header?.classList.toggle("is-scrolled", !entry.isIntersecting);
  },
  { threshold: 0.1 }
);

const hero = document.querySelector(".hero");
if (hero) {
  observer.observe(hero);
}

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
