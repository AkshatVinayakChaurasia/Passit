/* ============================================================
   listing.js — single book details page
   ============================================================ */

let CURRENT_LISTING = null;
let IS_SAVED = false;

async function loadBookDetails() {
  const root = document.getElementById("detail-root");
  const id = getParam("id");

  if (!id) {
    root.innerHTML = emptyBlock("No book selected.", "Head back to the marketplace and pick a listing.");
    return;
  }

  root.innerHTML = `<div class="skeleton" style="height:340px"><div class="sk" style="height:100%"></div></div>`;

  await Store.ready;
  await authReady();

  const listing = Store.get(id);
  if (!listing) {
    root.innerHTML = emptyBlock(
      "This listing is no longer available.",
      "It may have been sold or removed."
    );
    return;
  }

  CURRENT_LISTING = listing;
  refreshSavedState();
  renderBookDetails(listing);
}

function emptyBlock(title, message) {
  return `<div class="empty">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(message)}</p>
    <a class="btn btn-primary" href="index.html">Browse books</a>
  </div>`;
}

function refreshSavedState() {
  IS_SAVED = Boolean(currentUser && CURRENT_LISTING && Store.isSaved(currentUser.id, CURRENT_LISTING.id));
}

function renderBookDetails(l) {
  const root = document.getElementById("detail-root");
  const sellerName = l.seller?.full_name || "Campus seller";
  const sellerEmail = l.seller?.email || "";
  const isOwner = currentUser && l.seller_id === currentUser.id;

  const media = l.image_url
    ? `<img src="${escapeHtml(l.image_url)}" alt="${escapeHtml(l.title)}">`
    : `<div style="font-family:var(--display);color:#fff;font-weight:700;font-size:22px;padding:0 24px;text-align:center">${escapeHtml(l.title)}</div>`;

  root.innerHTML = `
    <a href="index.html" class="btn btn-ghost btn-sm" style="margin-bottom:22px">
      <i class="fa-solid fa-arrow-left"></i> Back to marketplace
    </a>
    <div class="detail">
      <div class="detail-media">${media}</div>
      <div>
        <h1>${escapeHtml(l.title)}</h1>
        <p class="author">${escapeHtml(l.author || "Unknown author")}${l.edition ? " · " + escapeHtml(l.edition) : ""}</p>
        <div class="price-lg">${formatPrice(l.price)}</div>

        <div class="spec-grid">
          <div class="spec"><dt>Subject</dt><dd>${escapeHtml(l.subject || "General")}</dd></div>
          <div class="spec"><dt>Condition</dt><dd>${escapeHtml(l.condition || "Used")}</dd></div>
          <div class="spec"><dt>Edition</dt><dd>${escapeHtml(l.edition || "—")}</dd></div>
          <div class="spec"><dt>Posted</dt><dd>${formatDate(l.created_at)}</dd></div>
        </div>

        <h3 style="font-size:17px;margin-bottom:8px">About this book</h3>
        <p class="prose">${escapeHtml(l.description || "No description provided.")}</p>

        <div class="tags" style="margin-top:18px">
          ${(l.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>

        <div class="seller-box">
          <span class="avatar">${escapeHtml(initials(sellerName))}</span>
          <div>
            <div style="font-weight:600">${escapeHtml(sellerName)}</div>
            <div style="font-size:13px;color:var(--slate)">${escapeHtml(sellerEmail || "Contact via Campus Market")}</div>
          </div>
        </div>

        <div class="detail-actions">
          ${
            isOwner
              ? `<a class="btn btn-primary" href="sell.html?edit=${encodeURIComponent(l.id)}">Edit listing</a>
                 <button class="btn btn-danger" id="delete-btn">Delete listing</button>`
              : `<button class="btn btn-primary" id="contact-btn"><i class="fa-solid fa-paper-plane"></i> Contact seller</button>
                 <button class="btn btn-ghost" id="save-btn">
                   <i class="fa-${IS_SAVED ? "solid" : "regular"} fa-bookmark"></i> ${IS_SAVED ? "Saved" : "Save listing"}
                 </button>`
          }
        </div>
      </div>
    </div>`;

  document.getElementById("contact-btn")?.addEventListener("click", openContactModal);
  document.getElementById("save-btn")?.addEventListener("click", toggleSave);
  document.getElementById("delete-btn")?.addEventListener("click", deleteThisListing);
}

/* ---------- Contact ---------- */

function openContactModal() {
  if (!requireAuth("Log in to message the seller.")) return;
  const l = CURRENT_LISTING;
  const sellerName = l.seller?.full_name || "the seller";

  const modal = openModal(`
    <button class="modal-close" data-close aria-label="Close">&times;</button>
    <h3>Message ${escapeHtml(sellerName)}</h3>
    <p class="sub">About “${escapeHtml(l.title)}” · ${formatPrice(l.price)}</p>
    <div class="field">
      <label for="msg-text">Your message</label>
      <textarea id="msg-text">Hi ${escapeHtml(sellerName.split(" ")[0])}, is "${escapeHtml(l.title)}" still available? I'm interested at ${formatPrice(l.price)}.</textarea>
    </div>
    <button class="btn btn-primary btn-block" id="msg-send">Send message</button>
    ${
      l.seller?.email
        ? `<div class="switch-line">Prefer email? <a href="mailto:${escapeHtml(l.seller.email)}?subject=${encodeURIComponent("Campus Market: " + l.title)}" style="color:var(--indigo);font-weight:600">${escapeHtml(l.seller.email)}</a></div>`
        : ""
    }
  `);

  modal.querySelector("#msg-send").addEventListener("click", (e) => {
    const text = modal.querySelector("#msg-text").value.trim();
    if (text.length < 3) return showToast("Write a message first.", "error");
    setBusy(e.currentTarget, true, "Sending…");

    Store.sendMessage({
      sender_id: currentUser.id,
      receiver_id: l.seller_id,
      listing_id: l.id,
      message: text,
    });

    closeModal(modal);
    showToast("Message sent to the seller.", "success");
  });
}

/* ---------- Save ---------- */

function toggleSave() {
  if (!requireAuth("Log in to save listings.")) return;
  IS_SAVED = Store.toggleSave(currentUser.id, CURRENT_LISTING.id);
  showToast(IS_SAVED ? "Saved to your dashboard." : "Removed from saved books.", "success");
  renderBookDetails(CURRENT_LISTING);
}

/* ---------- Delete ---------- */

async function deleteThisListing() {
  const ok = await confirmDialog({
    title: "Delete this listing?",
    message: `“${CURRENT_LISTING.title}” will be removed from the marketplace. This can't be undone.`,
    confirmLabel: "Delete listing",
  });
  if (!ok) return;

  try {
    Store.remove(CURRENT_LISTING.id, currentUser.id);
  } catch (err) {
    return showToast(err.message, "error");
  }
  showToast("Listing deleted.", "success");
  setTimeout(() => (location.href = "dashboard.html"), 700);
}

document.addEventListener("DOMContentLoaded", loadBookDetails);
document.addEventListener("auth:changed", () => {
  if (!CURRENT_LISTING) return;
  refreshSavedState();
  renderBookDetails(CURRENT_LISTING);
});
