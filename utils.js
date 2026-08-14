/* ============================================================
   utils.js — shared helpers used by every page
   ============================================================ */

/* ---------- Formatting ---------- */

function formatPrice(value) {
  const n = Number(value || 0);
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function debounce(fn, wait = 220) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function setBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ' + busyLabel;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

/* ---------- Toasts ---------- */

function toastStack() {
  let el = document.querySelector(".toast-stack");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast-stack";
    document.body.appendChild(el);
  }
  return el;
}

function showToast(message, type = "info", ms = 3400) {
  const icon =
    type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;
  toastStack().appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(20px)";
    t.style.transition = "all .2s ease";
    setTimeout(() => t.remove(), 220);
  }, ms);
}

/* ---------- Modals ---------- */

/**
 * Opens a modal. `html` is the inner markup of the modal card.
 * Returns the .modal element so callers can wire up their own buttons.
 */
function openModal(html, { width = 440 } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop open";
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:${width}px">${html}</div>`;
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal(backdrop);
  });
  backdrop.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeModal(backdrop))
  );
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") {
      closeModal(backdrop);
      document.removeEventListener("keydown", esc);
    }
  });

  const focusable = backdrop.querySelector("input, textarea, button:not([data-close])");
  if (focusable) setTimeout(() => focusable.focus(), 40);

  return backdrop.querySelector(".modal");
}

function closeModal(node) {
  const backdrop = node
    ? node.classList?.contains("modal-backdrop")
      ? node
      : node.closest(".modal-backdrop")
    : document.querySelector(".modal-backdrop.open");
  if (backdrop) backdrop.remove();
  if (!document.querySelector(".modal-backdrop")) document.body.style.overflow = "";
}

/** Promise-based confirmation dialog. Resolves true/false. */
function confirmDialog({ title, message, confirmLabel = "Delete", danger = true }) {
  return new Promise((resolve) => {
    const modal = openModal(`
      <h3>${escapeHtml(title)}</h3>
      <p class="sub">${escapeHtml(message)}</p>
      <div class="form-actions">
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirm-yes">${escapeHtml(confirmLabel)}</button>
        <button class="btn btn-ghost" data-close>Cancel</button>
      </div>
    `);
    let settled = false;
    modal.querySelector("#confirm-yes").addEventListener("click", () => {
      settled = true;
      closeModal(modal);
      resolve(true);
    });
    const backdrop = modal.closest(".modal-backdrop");
    new MutationObserver(() => {
      if (!document.body.contains(backdrop) && !settled) resolve(false);
    }).observe(document.body, { childList: true });
  });
}

/* ---------- Smart matching ---------- */

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "for", "in", "to", "book", "books"]);

/** Related-term map so "dsa" also matches "data structures", etc. */
const SYNONYMS = {
  dsa: ["data", "structures", "algorithms"],
  "data structures": ["dsa", "algorithms"],
  os: ["operating", "system", "systems"],
  dbms: ["database", "management", "sql"],
  cn: ["computer", "networks", "networking"],
  ml: ["machine", "learning"],
  ai: ["artificial", "intelligence"],
  oops: ["object", "oriented", "java", "programming"],
  web: ["html", "css", "javascript", "development"],
  maths: ["mathematics", "math", "calculus"],
};

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function expandQuery(query) {
  const raw = String(query || "").toLowerCase().trim();
  const tokens = new Set(tokenize(raw));
  Object.keys(SYNONYMS).forEach((key) => {
    if (raw.includes(key)) SYNONYMS[key].forEach((t) => tokens.add(t));
  });
  return [...tokens];
}

/**
 * Relevance score for a listing against a search query.
 * Title +5 · Subject +4 · Tag +3 · Description +2 · Author +1
 */
function calculateMatchScore(listing, query) {
  const tokens = expandQuery(query);
  if (!tokens.length) return 0;

  const fields = [
    { text: listing.title, weight: 5 },
    { text: listing.subject, weight: 4 },
    { text: (listing.tags || []).join(" "), weight: 3 },
    { text: listing.description, weight: 2 },
    { text: listing.author, weight: 1 },
  ];

  let score = 0;
  fields.forEach(({ text, weight }) => {
    const haystack = String(text || "").toLowerCase();
    if (!haystack) return;
    tokens.forEach((token) => {
      if (haystack.includes(token)) score += weight;
    });
  });

  // Exact phrase in the title is a strong signal.
  const phrase = String(query).toLowerCase().trim();
  if (phrase && String(listing.title || "").toLowerCase().includes(phrase)) score += 6;

  return score;
}

/* ---------- AI description generation ---------- */

const CONDITION_COPY = {
  "Like New": "practically untouched — no markings, crisp spine and clean pages",
  Excellent: "in excellent shape with minimal markings and a tight binding",
  Good: "well maintained, with light highlighting in places and no torn pages",
  Fair: "used but complete — some wear on the cover and notes in the margins",
};

/**
 * generateDescription(bookData)
 * Single abstraction for description writing. If AI_ENDPOINT is set to a
 * real endpoint, it's called; otherwise the local generator runs. The demo
 * needs no key and no network.
 */
const AI_ENDPOINT = null; // e.g. "https://your-worker.example.com/describe"

async function generateDescription(bookData) {
  if (AI_ENDPOINT) {
    try {
      const res = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bookData),
      });
      const data = await res.json();
      if (data?.description) return data.description.trim();
    } catch (_) {
      /* fall through to the offline generator */
    }
  }
  // Small pause so the button's writing state is visible in a demo.
  await new Promise((r) => setTimeout(r, 450));
  return localDescription(bookData);
}

function localDescription({ title, author, subject, edition, condition, tags }) {
  const cleanTitle = (title || "textbook").trim();
  const tagList = (Array.isArray(tags) ? tags : String(tags || "").split(","))
    .map((t) => t.trim())
    .filter(Boolean);

  const audience = tagList.find((t) => /cse|ece|mech|civil|it|mba|bca|btech/i.test(t));
  const semester = tagList.find((t) => /sem/i.test(t));
  const topics = tagList
    .filter((t) => t !== audience && t !== semester && t.length > 2)
    .slice(0, 4);

  const parts = [];

  parts.push(
    `${condition === "Like New" ? "Barely used" : "Well-maintained"} copy of ${cleanTitle}` +
      (author ? ` by ${author}` : "") +
      (edition ? `, ${edition}` : "") +
      "."
  );

  parts.push(
    `Ideal for ${audience ? audience + " " : ""}students ` +
      (subject ? `studying ${subject}` : "preparing for university exams") +
      (semester ? ` in ${semester}` : "") +
      "."
  );

  parts.push(
    `The book is ${CONDITION_COPY[condition] || "in good readable condition"}, ` +
      "so it's ready to use from day one."
  );

  if (topics.length) {
    const list =
      topics.length > 1
        ? topics.slice(0, -1).join(", ") + " and " + topics[topics.length - 1]
        : topics[0];
    parts.push(`Covers core topics including ${list}.`);
  }

  parts.push("Available for pickup on campus — message me if you'd like to see photos first.");

  return parts.join(" ");
}

/* ---------- Card rendering ---------- */

function conditionLabel(c) {
  return c || "Used";
}

function renderListingCard(listing, { bestMatch = false } = {}) {
  const seller = listing.seller?.full_name || listing.seller_name || "Campus seller";
  const tags = (listing.tags || []).slice(0, 3);
  const media = listing.image_url
    ? `<img src="${escapeHtml(listing.image_url)}" alt="${escapeHtml(listing.title)}" loading="lazy">`
    : `<div class="ph">${escapeHtml(listing.title || "Textbook")}</div>`;

  return `
    <article class="card">
      <a class="card-media" href="listing.html?id=${encodeURIComponent(listing.id)}" aria-label="${escapeHtml(listing.title)}">
        ${media}
        ${bestMatch ? '<span class="badge-match">Best match</span>' : ""}
        <span class="badge-cond">${escapeHtml(conditionLabel(listing.condition))}</span>
      </a>
      <div class="card-body">
        <a href="listing.html?id=${encodeURIComponent(listing.id)}" class="card-title">${escapeHtml(listing.title)}</a>
        <div class="card-meta">${escapeHtml(listing.author || "Unknown author")} · ${escapeHtml(listing.subject || "General")}</div>
        <div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        <div class="card-foot">
          <div>
            <div class="price">${formatPrice(listing.price)}</div>
            <div class="seller">${escapeHtml(seller)}</div>
          </div>
          <a class="btn btn-soft btn-sm" href="listing.html?id=${encodeURIComponent(listing.id)}">View details</a>
        </div>
      </div>
    </article>`;
}

/**
 * Paints a list of listings into a container, handling the empty state.
 */
function renderListings(container, listings, { query = "" } = {}) {
  if (!container) return;
  if (!listings.length) {
    container.innerHTML = "";
    container.insertAdjacentHTML(
      "afterbegin",
      `<div class="empty" style="grid-column:1/-1">
         <h3>No textbooks found.</h3>
         <p>Try a different keyword or sell the first book in this category.</p>
         <a class="btn btn-primary" href="sell.html">Sell a book</a>
       </div>`
    );
    return;
  }
  const topScore = listings[0]._score || 0;
  container.innerHTML = listings
    .map((l) =>
      renderListingCard(l, { bestMatch: Boolean(query) && topScore > 0 && l._score >= topScore })
    )
    .join("");
}

function renderSkeletons(container, count = 6) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count })
    .map(
      () => `<div class="skeleton">
        <div class="sk sk-media"></div>
        <div class="sk sk-line"></div>
        <div class="sk sk-line short"></div>
        <div class="sk sk-line short"></div>
      </div>`
    )
    .join("");
}

/* ---------- Mobile nav ---------- */

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
  }
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
});
