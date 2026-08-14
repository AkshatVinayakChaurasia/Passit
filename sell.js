/* ============================================================
   sell.js — create and edit listings
   ============================================================ */

const EDIT_ID = getParam("edit");
let EDITING = null;
let PENDING_IMAGE = null; // data URL, set once a cover is chosen

function f(id) {
  return document.getElementById(id);
}

function fieldValue(id) {
  return (f(id)?.value || "").trim();
}

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function collectBook() {
  return {
    title: fieldValue("title"),
    author: fieldValue("author"),
    subject: fieldValue("subject"),
    edition: fieldValue("edition"),
    price: Number(fieldValue("price")),
    condition: fieldValue("condition"),
    description: fieldValue("description"),
    tags: parseTags(fieldValue("tags")),
  };
}

function validate(book) {
  let ok = true;
  const bad = (id, cond) => {
    f(id)?.closest(".field")?.classList.toggle("invalid", cond);
    if (cond) ok = false;
  };
  bad("title", book.title.length < 2);
  bad("subject", !book.subject);
  bad("price", !(book.price > 0));
  bad("condition", !book.condition);
  bad("description", book.description.length < 10);
  return ok;
}

/* ---------- AI description ---------- */

async function handleGenerate(e) {
  const book = collectBook();
  if (!book.title) {
    f("title").closest(".field").classList.add("invalid");
    return showToast("Add the book title first.", "error");
  }

  const btn = e.currentTarget;
  setBusy(btn, true, "Writing…");
  try {
    const text = await generateDescription(book);
    f("description").value = text;
    f("description").closest(".field").classList.remove("invalid");
    showToast("Description generated — edit it however you like.", "success");
  } catch (_) {
    showToast("Couldn't generate a description.", "error");
  } finally {
    setBusy(btn, false);
  }
}

/* ---------- Cover photo ----------
   Images are downscaled to a data URL so they fit alongside the
   rest of the mock data in browser storage.                     */

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 720;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("That file isn't a readable image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

async function handleImageChange(e) {
  const file = e.target.files?.[0];
  const hint = f("image-hint");
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    showToast("That image is over 8 MB — pick a smaller one.", "error");
    e.target.value = "";
    return;
  }

  try {
    PENDING_IMAGE = await readImage(file);
    if (hint) hint.textContent = `Selected: ${file.name} — resized and ready.`;
  } catch (err) {
    PENDING_IMAGE = null;
    showToast(err.message, "error");
  }
}

/* ---------- Publish / update ---------- */

async function handlePublish(e) {
  if (!requireAuth("Log in to publish your listing.")) return;

  const book = collectBook();
  if (!validate(book)) return showToast("Fill in the highlighted fields.", "error");

  const btn = e.currentTarget;
  setBusy(btn, true, EDITING ? "Saving…" : "Publishing…");

  try {
    if (EDITING) {
      const patch = { ...book };
      if (PENDING_IMAGE) patch.image_url = PENDING_IMAGE;
      Store.update(EDITING.id, patch, currentUser.id);
      showToast("Listing updated.", "success");
      setTimeout(() => (location.href = `listing.html?id=${EDITING.id}`), 700);
    } else {
      const created = Store.create({ ...book, image_url: PENDING_IMAGE }, currentUser.id);
      showToast("Published — your book is live on the marketplace.", "success");
      setTimeout(() => (location.href = `listing.html?id=${created.id}`), 800);
    }
  } catch (err) {
    setBusy(btn, false);
    showToast(err.message || "Couldn't save the listing.", "error");
  }
}

/* ---------- Edit mode ---------- */

function loadForEdit() {
  const data = Store.get(EDIT_ID);
  if (!data) return showToast("Listing not found.", "error");

  if (data.seller_id !== currentUser?.id) {
    showToast("You can only edit your own listings.", "error");
    setTimeout(() => (location.href = "index.html"), 900);
    return;
  }

  EDITING = data;
  f("title").value = data.title || "";
  f("author").value = data.author || "";
  f("subject").value = data.subject || "";
  f("edition").value = data.edition || "";
  f("price").value = data.price ?? "";
  f("condition").value = data.condition || "";
  f("description").value = data.description || "";
  f("tags").value = (data.tags || []).join(", ");

  f("sell-title").textContent = "Edit your listing";
  f("sell-sub").textContent = "Update the details and save. Changes appear on the marketplace right away.";
  f("publish-btn").textContent = "Save changes";
}

/* ---------- Init ---------- */

async function initSell() {
  f("generate-btn")?.addEventListener("click", handleGenerate);
  f("publish-btn")?.addEventListener("click", handlePublish);
  f("image")?.addEventListener("change", handleImageChange);

  document.querySelectorAll(".field input, .field select, .field textarea").forEach((input) =>
    input.addEventListener("input", () => input.closest(".field").classList.remove("invalid"))
  );

  await Store.ready;
  await authReady();

  if (!currentUser) openAuthModal("login", "Log in to list a book for sale.");
  else if (EDIT_ID) loadForEdit();
}

document.addEventListener("DOMContentLoaded", initSell);
document.addEventListener("auth:changed", () => {
  if (EDIT_ID && currentUser && !EDITING) loadForEdit();
});
