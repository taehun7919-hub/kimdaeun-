const menuToggle = document.querySelector("[data-menu-toggle]");
const siteNav = document.querySelector("[data-site-nav]");
const header = document.querySelector("[data-header]");
const applicationLinks = document.querySelectorAll(".application-link");
const sitePopup = document.querySelector("[data-site-popup]");
const popupCloseButtons = document.querySelectorAll("[data-popup-close]");
const hero = document.querySelector(".hero");
const homeSections = document.querySelectorAll("[data-home-section]");
const routeSections = document.querySelectorAll("[data-route-section]");
const routeLinks = document.querySelectorAll('.site-nav a[href^="#"], .brand[href^="#"]');
const internalLinks = document.querySelectorAll('a[href^="#"]');
const contentLists = document.querySelectorAll("[data-content-list]");
const emptyPlaceholders = document.querySelectorAll("[data-empty-placeholder]");
const adminLogin = document.querySelector("[data-admin-login]");
const adminPanel = document.querySelector("[data-admin-panel]");
const adminLoginForm = document.querySelector("[data-admin-login-form]");
const adminContentForm = document.querySelector("[data-admin-content-form]");
const adminPasswordForm = document.querySelector("[data-admin-password-form]");
const adminPostList = document.querySelector("[data-admin-post-list]");
const adminLogoutButton = document.querySelector("[data-admin-logout]");
const adminFormTitle = document.querySelector("[data-admin-form-title]");
const adminSubmitButton = document.querySelector("[data-admin-submit]");
const adminCancelEditButton = document.querySelector("[data-admin-cancel-edit]");
let popupReturnFocus = null;
let adminAuthenticated = false;
let managedPosts = Array.isArray(window.__BUSAN_FLUTE_POSTS__) ? window.__BUSAN_FLUTE_POSTS__ : [];
let adminToken = sessionStorage.getItem("busanFluteAdminToken") || "";
let editingPostId = "";
const maxImageBytes = 25 * 1024 * 1024;

const routeIds = new Set(["home", ...Array.from(routeSections, (section) => section.id)]);
const parentRouteById = {
  about: "concours",
  entry: "concours",
  notice: "concours",
  location: "concours",
  "community-notice": "community",
  board: "community",
};
const categoryLabels = {
  "community-notice": "커뮤니티 공지사항",
  board: "게시판",
  winners: "역대수상자",
  reviews: "심사평",
};
function setAdminToken(token) {
  adminToken = token || "";
  if (adminToken) {
    sessionStorage.setItem("busanFluteAdminToken", adminToken);
    return;
  }
  sessionStorage.removeItem("busanFluteAdminToken");
}

function getStoredPosts() {
  return managedPosts;
}

function setStoredPosts(posts) {
  managedPosts = Array.isArray(posts) ? posts : [];
}

function getPostById(postId) {
  return getStoredPosts().find((post) => post.id === postId);
}

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  let requestBody = options.body;

  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(options.body);
  }

  if (typeof fetch === "function") {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      body: requestBody,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "요청을 처리하지 못했습니다.");
    }

    return data;
  }

  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest !== "function") {
      reject(new Error("서버와 통신할 수 없는 브라우저 환경입니다."));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", `/api${path}`);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        data = {};
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data.error || "요청을 처리하지 못했습니다."));
        return;
      }

      resolve(data);
    };
    xhr.onerror = () => reject(new Error("서버와 통신하지 못했습니다."));
    xhr.send(requestBody || null);
  });
}

async function loadManagedPosts() {
  try {
    const data = await apiRequest("/posts");
    setStoredPosts(data.posts);
    renderManagedPosts();
  } catch (error) {
    console.error(error);
    renderManagedPosts();
  }
}

function formatPostDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function postTemplate(post, displayMode = "card") {
  const title = escapeHtml(post.title);
  const body = escapeHtml(post.body).replaceAll("\n", "<br />");
  const category = categoryLabels[post.category] || "게시글";
  const date = formatPostDate(post.createdAt);
  const image = post.image
    ? `<img class="managed-post-image" src="${post.image}" alt="${title}" />`
    : "";

  if (displayMode === "notice") {
    return `
      <article class="notice-card managed-post-card">
        ${image}
        <p class="notice-date">${date}</p>
        <h3>${title}</h3>
        <p>${body}</p>
      </article>
    `;
  }

  return `
    <article class="board-item managed-post-card">
      ${image}
      <span>${category} · ${date}</span>
      <h3>${title}</h3>
      <p>${body}</p>
    </article>
  `;
}

function renderManagedPosts() {
  const posts = getStoredPosts();

  contentLists.forEach((list) => {
    const category = list.dataset.contentList;
    const categoryPosts = posts.filter((post) => post.category === category);
    const mode = list.classList.contains("managed-post-list-grid") ? "notice" : "card";
    list.innerHTML = categoryPosts.map((post) => postTemplate(post, mode)).join("");
  });

  emptyPlaceholders.forEach((placeholder) => {
    const category = placeholder.dataset.emptyPlaceholder;
    placeholder.hidden = posts.some((post) => post.category === category);
  });

  if (!adminPostList) {
    return;
  }

  if (posts.length === 0) {
    adminPostList.innerHTML = `<p class="admin-empty">등록된 글이 없습니다.</p>`;
    return;
  }

  adminPostList.innerHTML = posts
    .map(
      (post) => `
        <article class="admin-post-row">
          <div>
            <span>${categoryLabels[post.category] || "게시글"} · ${formatPostDate(post.createdAt)}</span>
            <strong>${escapeHtml(post.title)}</strong>
          </div>
          <div class="admin-post-actions">
            <button class="button button-secondary" type="button" data-edit-post="${post.id}">수정</button>
            <button class="button button-secondary" type="button" data-delete-post="${post.id}">삭제</button>
          </div>
        </article>
      `
    )
    .join("");
}

function resetContentFormMode() {
  editingPostId = "";
  adminContentForm?.reset();

  if (adminFormTitle) {
    adminFormTitle.textContent = "글/사진 등록";
  }
  if (adminSubmitButton) {
    adminSubmitButton.textContent = "등록하기";
  }
  if (adminCancelEditButton) {
    adminCancelEditButton.hidden = true;
  }
}

function setContentFormEditMode(post) {
  editingPostId = post.id;

  const categoryInput = adminContentForm?.querySelector("[data-admin-category]");
  const titleInput = adminContentForm?.querySelector("[data-admin-title]");
  const bodyInput = adminContentForm?.querySelector("[data-admin-body]");
  const imageInput = adminContentForm?.querySelector("[data-admin-image]");

  if (categoryInput) {
    categoryInput.value = post.category;
  }
  if (titleInput) {
    titleInput.value = post.title;
  }
  if (bodyInput) {
    bodyInput.value = post.body;
  }
  if (imageInput) {
    imageInput.value = "";
  }
  if (adminFormTitle) {
    adminFormTitle.textContent = "글/사진 수정";
  }
  if (adminSubmitButton) {
    adminSubmitButton.textContent = "수정 저장";
  }
  if (adminCancelEditButton) {
    adminCancelEditButton.hidden = false;
  }

  adminContentForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setAdminMode(isLoggedIn) {
  adminAuthenticated = isLoggedIn;
  if (adminLogin) {
    adminLogin.hidden = isLoggedIn;
  }
  if (adminPanel) {
    adminPanel.hidden = !isLoggedIn;
  }
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    if (file.size > maxImageBytes) {
      reject(new Error(`사진 용량은 ${maxImageBytes / 1024 / 1024}MB 이하로 등록해 주세요.`));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("사진을 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

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
  const activeNavRoute = parentRouteById[activeRoute] || activeRoute;

  if (hero) {
    hero.hidden = !isHome;
  }

  homeSections.forEach((section) => {
    section.hidden = !isHome;
  });

  routeSections.forEach((section) => {
    section.hidden = section.id !== activeRoute;
  });

  routeLinks.forEach((link) => {
    const linkRoute = link.getAttribute("href")?.replace("#", "") || "home";
    if (linkRoute === activeNavRoute) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  closeMenu();
  window.scrollTo({ top: 0, behavior: "auto" });

  if (activeRoute === "admin") {
    setAdminMode(adminAuthenticated);
  }
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

adminLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const passwordInput = adminLoginForm.querySelector("[data-admin-password]");
  const message = adminLoginForm.querySelector("[data-admin-login-message]");
  const password = passwordInput?.value || "";

  try {
    const data = await apiRequest("/login", {
      method: "POST",
      body: { password },
    });
    setAdminToken(data.token);
    passwordInput.value = "";
    if (message) {
      message.textContent = "";
    }
    setAdminMode(true);
    await loadManagedPosts();
  } catch (error) {
    if (message) {
      message.textContent = error.message;
    }
  }
});

adminContentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!adminAuthenticated) {
    return;
  }

  const category = adminContentForm.querySelector("[data-admin-category]")?.value || "board";
  const titleInput = adminContentForm.querySelector("[data-admin-title]");
  const bodyInput = adminContentForm.querySelector("[data-admin-body]");
  const imageInput = adminContentForm.querySelector("[data-admin-image]");
  const title = titleInput?.value.trim() || "";
  const body = bodyInput?.value.trim() || "";

  if (!title || !body) {
    return;
  }

  try {
    const existingPost = editingPostId ? getPostById(editingPostId) : null;
    const selectedImage = imageInput?.files?.[0];
    const image = selectedImage ? await readImageAsDataUrl(selectedImage) : existingPost?.image || "";
    const data = await apiRequest(editingPostId ? `/posts/${encodeURIComponent(editingPostId)}` : "/posts", {
      method: editingPostId ? "PUT" : "POST",
      body: {
        category,
        title,
        body,
        image,
      },
    });
    setStoredPosts(data.posts);
    resetContentFormMode();
    renderManagedPosts();
    openRoute(category);
  } catch (error) {
    alert(error.message);
  }
});

adminPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentInput = adminPasswordForm.querySelector("[data-current-password]");
  const newInput = adminPasswordForm.querySelector("[data-new-password]");
  const confirmInput = adminPasswordForm.querySelector("[data-confirm-password]");
  const message = adminPasswordForm.querySelector("[data-password-message]");
  const currentPassword = currentInput?.value || "";
  const newPassword = newInput?.value || "";
  const confirmPassword = confirmInput?.value || "";

  if (newPassword.length < 4) {
    if (message) {
      message.textContent = "새 비밀번호는 4자리 이상으로 입력해 주세요.";
    }
    return;
  }

  if (newPassword !== confirmPassword) {
    if (message) {
      message.textContent = "새 비밀번호 확인이 일치하지 않습니다.";
    }
    return;
  }

  try {
    const data = await apiRequest("/password", {
      method: "POST",
      body: {
        currentPassword,
        newPassword,
      },
    });
    setAdminToken(data.token);
    adminPasswordForm.reset();
    if (message) {
      message.textContent = "비밀번호가 변경되었습니다.";
    }
  } catch (error) {
    if (message) {
      message.textContent = error.message;
    }
  }
});

adminPostList?.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const editButton = target?.closest("[data-edit-post]");
  const deleteButton = target?.closest("[data-delete-post]");

  if (!adminAuthenticated) {
    return;
  }

  if (editButton) {
    const post = getPostById(editButton.getAttribute("data-edit-post"));
    if (post) {
      setContentFormEditMode(post);
    }
    return;
  }

  if (!deleteButton) {
    return;
  }

  const postId = deleteButton.getAttribute("data-delete-post");
  apiRequest(`/posts/${encodeURIComponent(postId)}`, { method: "DELETE" })
    .then((data) => {
      setStoredPosts(data.posts);
      if (editingPostId === postId) {
        resetContentFormMode();
      }
      renderManagedPosts();
    })
    .catch((error) => {
      alert(error.message);
    });
});

adminLogoutButton?.addEventListener("click", () => {
  setAdminToken("");
  setAdminMode(false);
});

adminCancelEditButton?.addEventListener("click", () => {
  resetContentFormMode();
});

window.addEventListener("load", () => {
  updateRoute();
  renderManagedPosts();
  loadManagedPosts();
  window.setTimeout(openPopup, 250);
});

window.addEventListener("hashchange", () => updateRoute());
window.addEventListener("popstate", () => updateRoute());

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
renderManagedPosts();
loadManagedPosts();

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
