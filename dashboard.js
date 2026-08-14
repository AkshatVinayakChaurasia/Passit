/* ============================================================
   dashboard.js — the seller's own listings + saved books
   ============================================================ */

let activeTab = "mine";

function dashRoot() {
  return document.getElementById("dash-body");
}

async function initDashboard() {
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTab = tab.dataset.tab;
      loadDashboard();
    })
  );

  await Store.ready;
  await authReady();
  loadDashboard();
}

function loadDashboard() {
  const root = dashRoot();
  if (!root) return;

  if (!currentUser) {
    root.innerHTML = `<div class="empty">
      <h3>Log in to see your listings.</h3>
      <p>Your books, sales and saved titles live here.</p>
      <button class="btn btn-primary" onclick="openAuthModal('login')">Log in</button>
    </div>`;
    return;
  }

  if (activeTab === "mine") renderMyListings(root);
  else renderSavedListings(root);
}

function renderMyListings(root) {
  const data = Store.myListings(currentUser.id);

  if (!data.length) {
    root.innerHTML = `<div class="empty">
      <h3>You haven't listed a book yet.</h3>
      <p>Post your first textbook — it takes about a minute.</p>
      <a class="btn btn-primary" href="sell.html">+ Sell a book</a>
    </div>`;
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Book</th><th>Price</th><th>Condition</th><th>Status</th><th>Listed</th><th></th>
        </tr></thead>
        <tbody>
          ${data
            .map(
              (l) => `<tr>
            <td><a href="listing.html?id=${encodeURIComponent(l.id)}" style="font-weight:600">${escapeHtml(l.title)}</a>
              <div style="font-size:12.5px;color:var(--muted)">${escapeHtml(l.subject || "General")}</div></td>
            <td>${formatPrice(l.price)}</td>
            <td>${escapeHtml(l.condition || "—")}</td>
            <td><span class="pill ${l.status === "sold" ? "sold" : ""}">${escapeHtml(l.status || "available")}</span></td>
            <td>${formatDate(l.created_at)}</td>
            <td><div class="row-actions">
              <button class="btn btn-ghost btn-sm" data-status="${l.id}" data-current="${escapeHtml(l.status || "available")}">
                ${l.status === "sold" ? "Relist" : "Mark sold"}
              </button>
              <a class="btn btn-soft btn-sm" href="sell.html?edit=${encodeURIComponent(l.id)}">Edit</a>
              <button class="btn btn-danger btn-sm" data-delete="${l.id}" data-title="${escapeHtml(l.title)}">Delete</button>
            </div></td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  root.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () => removeListing(btn.dataset.delete, btn.dataset.title))
  );
  root.querySelectorAll("[data-status]").forEach((btn) =>
    btn.addEventListener("click", () => toggleStatus(btn.dataset.status, btn.dataset.current))
  );
}

function renderSavedListings(root) {
  const listings = Store.savedListings(currentUser.id);

  if (!listings.length) {
    root.innerHTML = `<div class="empty">
      <h3>Nothing saved yet.</h3>
      <p>Tap “Save listing” on any book to keep it here for later.</p>
      <a class="btn btn-primary" href="index.html">Browse books</a>
    </div>`;
    return;
  }

  root.innerHTML = `<div class="grid">${listings.map((l) => renderListingCard(l)).join("")}</div>`;
}

async function removeListing(id, title) {
  const ok = await confirmDialog({
    title: "Delete this listing?",
    message: `“${title}” will be removed from the marketplace. This can't be undone.`,
    confirmLabel: "Delete listing",
  });
  if (!ok) return;

  try {
    Store.remove(id, currentUser.id);
  } catch (err) {
    return showToast(err.message, "error");
  }
  showToast("Listing deleted.", "success");
  loadDashboard();
}

function toggleStatus(id, current) {
  const next = current === "sold" ? "available" : "sold";
  try {
    Store.update(id, { status: next }, currentUser.id);
  } catch (err) {
    return showToast(err.message, "error");
  }
  showToast(next === "sold" ? "Marked as sold." : "Back on the marketplace.", "success");
  loadDashboard();
}

document.addEventListener("DOMContentLoaded", initDashboard);
document.addEventListener("auth:changed", loadDashboard);
