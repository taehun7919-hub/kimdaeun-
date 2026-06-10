const crypto = require("crypto");
const fs = require("fs/promises");
const fsSync = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.PORT || 4178);
const rootDir = __dirname;
const dataDir = process.env.DATA_DIR || path.join(rootDir, ".data");
const dataFile = path.join(dataDir, "content.json");
const maxImageBytes = 25 * 1024 * 1024;
const maxImageDataUrlBytes = Math.ceil(maxImageBytes * 1.4);
const maxJsonBytes = Math.ceil(maxImageBytes * 1.5);
const sessionTtlMs = 24 * 60 * 60 * 1000;
const sessions = new Map();
const categories = new Set(["community-notice", "board", "winners", "reviews"]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return password === "0000";
  }

  const [salt, originalHash] = storedHash.split(":");
  const nextHash = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHash, "hex");

  return original.length === nextHash.length && crypto.timingSafeEqual(original, nextHash);
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  if (!fsSync.existsSync(dataFile)) {
    await writeStore({
      passwordHash: hashPassword("0000"),
      posts: [],
    });
    return;
  }

  const store = await readStore();
  if (!store.passwordHash) {
    store.passwordHash = hashPassword("0000");
    await writeStore(store);
  }
}

async function readStore() {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw);
    return {
      passwordHash: parsed.passwordHash || "",
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { passwordHash: hashPassword("0000"), posts: [] };
    }
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmpFile = `${dataFile}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmpFile, dataFile);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxJsonBytes) {
        reject(new Error("요청 데이터가 너무 큽니다."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("요청 형식이 올바르지 않습니다."));
      }
    });

    request.on("error", reject);
  });
}

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + sessionTtlMs);
  return token;
}

function isAuthorized(request) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expiresAt = sessions.get(token);

  if (!expiresAt) {
    return false;
  }

  if (expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }

  sessions.set(token, Date.now() + sessionTtlMs);
  return true;
}

function sanitizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizePost(payload) {
  const category = sanitizeText(payload.category, 40);
  const title = sanitizeText(payload.title, 80);
  const body = sanitizeText(payload.body, 5000);
  const image = String(payload.image || "");

  if (!categories.has(category)) {
    throw new Error("카테고리가 올바르지 않습니다.");
  }

  if (!title || !body) {
    throw new Error("제목과 내용을 입력해 주세요.");
  }

  if (image && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(image)) {
    throw new Error("사진 형식이 올바르지 않습니다.");
  }

  if (image.length > maxImageDataUrlBytes) {
    throw new Error(`사진 용량은 ${maxImageBytes / 1024 / 1024}MB 이하로 등록해 주세요.`);
  }

  return {
    category,
    title,
    body,
    image,
  };
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && pathname === "/api/posts") {
    const store = await readStore();
    sendJson(response, 200, { posts: store.posts });
    return;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    const payload = await readJsonBody(request);
    const store = await readStore();
    if (!verifyPassword(String(payload.password || ""), store.passwordHash)) {
      sendError(response, 401, "비밀번호가 올바르지 않습니다.");
      return;
    }

    sendJson(response, 200, { token: createSession() });
    return;
  }

  if (!isAuthorized(request)) {
    sendError(response, 401, "관리자 로그인이 필요합니다.");
    return;
  }

  if (request.method === "POST" && pathname === "/api/posts") {
    const payload = await readJsonBody(request);
    const post = {
      id: `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`,
      ...sanitizePost(payload),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const store = await readStore();
    store.posts.unshift(post);
    await writeStore(store);
    sendJson(response, 201, { post, posts: store.posts });
    return;
  }

  if (request.method === "PUT" && pathname.startsWith("/api/posts/")) {
    const postId = decodeURIComponent(pathname.replace("/api/posts/", ""));
    const payload = await readJsonBody(request);
    const store = await readStore();
    const postIndex = store.posts.findIndex((post) => post.id === postId);

    if (postIndex === -1) {
      sendError(response, 404, "수정할 글을 찾을 수 없습니다.");
      return;
    }

    const existingPost = store.posts[postIndex];
    const nextPost = {
      ...existingPost,
      ...sanitizePost(payload),
      id: existingPost.id,
      createdAt: existingPost.createdAt,
      updatedAt: new Date().toISOString(),
    };
    store.posts[postIndex] = nextPost;
    await writeStore(store);
    sendJson(response, 200, { post: nextPost, posts: store.posts });
    return;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/posts/")) {
    const postId = decodeURIComponent(pathname.replace("/api/posts/", ""));
    const store = await readStore();
    store.posts = store.posts.filter((post) => post.id !== postId);
    await writeStore(store);
    sendJson(response, 200, { posts: store.posts });
    return;
  }

  if (request.method === "POST" && pathname === "/api/password") {
    const payload = await readJsonBody(request);
    const currentPassword = String(payload.currentPassword || "");
    const newPassword = String(payload.newPassword || "");
    const store = await readStore();

    if (!verifyPassword(currentPassword, store.passwordHash)) {
      sendError(response, 400, "현재 비밀번호가 올바르지 않습니다.");
      return;
    }

    if (newPassword.length < 4) {
      sendError(response, 400, "새 비밀번호는 4자리 이상으로 입력해 주세요.");
      return;
    }

    store.passwordHash = hashPassword(newPassword);
    await writeStore(store);
    sessions.clear();
    sendJson(response, 200, { token: createSession() });
    return;
  }

  sendError(response, 404, "요청한 API를 찾을 수 없습니다.");
}

async function serveStatic(request, response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const filePath = path.normalize(path.join(rootDir, decodedPath));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    if (path.basename(filePath) === "index.html") {
      const [html, store] = await Promise.all([fs.readFile(filePath, "utf8"), readStore()]);
      const initialData = `<script>window.__BUSAN_FLUTE_POSTS__=${escapeScriptJson(store.posts)};</script>`;
      response.writeHead(200, {
        "Content-Type": mimeTypes[extension],
        "Cache-Control": "no-cache",
      });
      response.end(html.replace('<script src="script.js', `${initialData}\n    <script src="script.js`));
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    });
    fsSync.createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }

    await serveStatic(request, response, pathname);
  } catch (error) {
    sendError(response, 500, error.message || "서버 오류가 발생했습니다.");
  }
}

ensureStore()
  .then(() => {
    http.createServer(handleRequest).listen(port, () => {
      console.log(`Busan Flute Concours server running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
