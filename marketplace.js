/* ============================================================
   marketplace.js — browse, search, filter and sort
   ============================================================ */

const MK = { all: [] };

const el = {
  grid: null,
  count: null,
  search: null,
  subject: null,
  price: null,
  condition: null,
  sort: null,
};

async function fetchListings() {
  renderSkeletons(el.grid, 8);
  await Store.ready;

  MK.all = Store.listings({ status: "available" });

  if (!MK.all.length) {
    el.grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h3>The marketplace is empty.</h3>
      <p>Mock data lives in <code>data/books.json</code>. Serve the folder over HTTP so it can load, or list the first book yourself.</p>
      <a class="btn btn-primary" href="sell.html">Sell a book</a>
    </div>`;
    el.count.textContent = "";
    return;
  }

  populateSubjects();
  applyFilters();
}

function populateSubjects() {
  if (!el.subject) return;
  const subjects = [...new Set(MK.all.map((l) => l.subject).filter(Boolean))].sort();
  const current = el.subject.value;
  el.subject.innerHTML =
    '<option value="">All subjects</option>' +
    subjects.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  if (current) el.subject.value = current;
}

function priceInRange(price, range) {
  const p = Number(price || 0);
  switch (range) {
    case "0-300": return p <= 300;
    case "300-600": return p > 300 && p <= 600;
    case "600-1000": return p > 600 && p <= 1000;
    case "1000+": return p > 1000;
    default: return true;
  }
}

function applyFilters() {
  const query = (el.search?.value || "").trim();
  const subject = el.subject?.value || "";
  const range = el.price?.value || "";
  const condition = el.condition?.value || "";
  const sort = el.sort?.value || "relevance";

  let rows = MK.all.filter((l) => {
    if (subject && l.subject !== subject) return false;
    if (condition && l.condition !== condition) return false;
    if (!priceInRange(l.price, range)) return false;
    return true;
  });

  if (query) {
    rows = rows
      .map((l) => ({ ...l, _score: calculateMatchScore(l, query) }))
      .filter((l) => l._score > 0);
  } else {
    rows = rows.map((l) => ({ ...l, _score: 0 }));
  }

  switch (sort) {
    case "price-asc":
      rows.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case "price-desc":
      rows.sort((a, b) => Number(b.price) - Number(a.price));
      break;
    case "newest":
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    default:
      rows.sort((a, b) => b._score - a._score || new Date(b.created_at) - new Date(a.created_at));
  }

  el.count.textContent = `${rows.length} book${rows.length === 1 ? "" : "s"} found`;
  renderListings(el.grid, rows, { query });

  const heading = document.getElementById("results-heading");
  if (heading) heading.textContent = query ? `Results for “${query}”` : "Find your next book";
}

function initMarketplace() {
  el.grid = document.getElementById("listing-grid");
  el.count = document.getElementById("result-count");
  el.search = document.getElementById("search-input");
  el.subject = document.getElementById("filter-subject");
  el.price = document.getElementById("filter-price");
  el.condition = document.getElementById("filter-condition");
  el.sort = document.getElementById("filter-sort");

  const preset = getParam("q");
  if (preset && el.search) el.search.value = preset;

  const rerun = debounce(applyFilters, 200);
  el.search?.addEventListener("input", rerun);
  [el.subject, el.price, el.condition, el.sort].forEach((c) =>
    c?.addEventListener("change", applyFilters)
  );

  document.getElementById("search-btn")?.addEventListener("click", () => {
    applyFilters();
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Category chips fill the search box and re-run the same matching logic.
  document.querySelectorAll("#chips .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      document.querySelectorAll("#chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      if (el.search) el.search.value = chip.dataset.q || "";
      applyFilters();
    })
  );

  document.getElementById("reset-filters")?.addEventListener("click", () => {
    if (el.search) el.search.value = "";
    document.querySelectorAll("#chips .chip").forEach((c) => c.classList.remove("active"));
    [el.subject, el.price, el.condition].forEach((c) => c && (c.value = ""));
    if (el.sort) el.sort.value = "relevance";
    applyFilters();
  });

  document.getElementById("reset-data")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Reset the demo data?",
      message: "Your listings, accounts and saved books in this browser will be replaced by the original mock data.",
      confirmLabel: "Reset data",
    });
    if (!ok) return;
    await Store.reset();
    showToast("Mock data restored.", "success");
    setTimeout(() => location.reload(), 600);
  });

  fetchListings();
}

document.addEventListener("DOMContentLoaded", initMarketplace);
