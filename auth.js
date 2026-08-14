/* ============================================================
   auth.js — accounts held in the local store
   ------------------------------------------------------------
   This is demo auth: users live in the same browser storage as
   the listings, so there's no server to talk to. It gates the
   same actions a real backend would, but it is not security.
   ============================================================ */

/* No login wall: the app signs you in as a guest student on load, so every
   action works straight away. The login modal still exists for switching to
   one of the seeded demo accounts. */
const GUEST_MODE = true;
const GUEST = { full_name: "You", email: "you@campus.market", password: "campus" };

let currentUser = null;

let _authResolved = false;
const _authWaiters = [];

function authReady() {
  return _authResolved ? Promise.resolve(currentUser) : new Promise((r) => _authWaiters.push(r));
}

function _resolveAuth() {
  _authResolved = true;
  _authWaiters.splice(0).forEach((r) => r(currentUser));
}

function displayName() {
  return currentUser?.full_name || currentUser?.email?.split("@")[0] || "Student";
}

function announceAuth() {
  renderNavAuth();
  document.dispatchEvent(new CustomEvent("auth:changed", { detail: { user: currentUser } }));
}

/* ---------- Navbar ---------- */

function renderNavAuth() {
  const slot = document.getElementById("nav-auth");
  if (!slot) return;

  if (!currentUser) {
    slot.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="nav-login">Log in</button>
      <a class="btn btn-primary btn-sm" href="sell.html">Sell a book</a>`;
    slot.querySelector("#nav-login").addEventListener("click", () => openAuthModal("login"));
    return;
  }

  slot.innerHTML = `
    <div class="user-chip">
      <span class="avatar">${escapeHtml(initials(displayName()))}</span>
      <span>${escapeHtml(displayName())}</span>
    </div>
    <button class="btn btn-ghost btn-sm" id="nav-switch" title="${GUEST_MODE ? "Switch account" : "Log out"}">
      <i class="fa-solid fa-${GUEST_MODE ? "user-pen" : "arrow-right-from-bracket"}"></i>
    </button>`;
  slot.querySelector("#nav-switch").addEventListener("click", () =>
    GUEST_MODE ? openAuthModal("login", "Switch to another student's account.") : logout()
  );
}

/* ---------- Modal ---------- */

function openAuthModal(mode = "login", note = "") {
  const isSignup = mode === "signup";
  const modal = openModal(`
    <button class="modal-close" data-close aria-label="Close">&times;</button>
    <h3>${isSignup ? "Create your account" : "Welcome back"}</h3>
    <p class="sub">${escapeHtml(note || (isSignup ? "One account for buying and selling on campus." : "Log in to sell, save and message sellers."))}</p>

    ${
      isSignup
        ? `<div class="field"><label for="au-name">Full name</label>
             <input id="au-name" type="text" placeholder="Akshat Sharma" autocomplete="name">
             <div class="err">Enter your name.</div></div>`
        : ""
    }
    <div class="field"><label for="au-email">Email</label>
      <input id="au-email" type="email" placeholder="you@college.edu" autocomplete="email">
      <div class="err">Enter a valid email.</div></div>
    <div class="field"><label for="au-pass">Password</label>
      <input id="au-pass" type="password" placeholder="At least 6 characters" autocomplete="${isSignup ? "new-password" : "current-password"}">
      <div class="err">Password must be at least 6 characters.</div></div>

    <button class="btn btn-primary btn-block" id="au-submit">${isSignup ? "Create account" : "Log in"}</button>

    ${
      isSignup
        ? ""
        : `<button class="btn btn-ghost btn-block" id="au-demo" style="margin-top:10px">
             <i class="fa-solid fa-bolt"></i> Use the demo account
           </button>`
    }

    <div class="switch-line">
      ${isSignup ? "Already have an account?" : "New to Campus Market?"}
      <button id="au-switch">${isSignup ? "Log in" : "Sign up"}</button>
    </div>
  `);

  modal.querySelector("#au-switch").addEventListener("click", () => {
    closeModal(modal);
    openAuthModal(isSignup ? "login" : "signup");
  });

  modal.querySelector("#au-demo")?.addEventListener("click", () => {
    modal.querySelector("#au-email").value = "demo@campus.market";
    modal.querySelector("#au-pass").value = "demo1234";
    handleAuthSubmit(modal, false, modal.querySelector("#au-submit"));
  });

  const submit = modal.querySelector("#au-submit");
  const run = () => handleAuthSubmit(modal, isSignup, submit);
  submit.addEventListener("click", run);
  modal.querySelectorAll("input").forEach((i) =>
    i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") run();
    })
  );
}

function markInvalid(input, bad) {
  input.closest(".field").classList.toggle("invalid", bad);
  return !bad;
}

async function handleAuthSubmit(modal, isSignup, button) {
  const nameInput = modal.querySelector("#au-name");
  const emailInput = modal.querySelector("#au-email");
  const passInput = modal.querySelector("#au-pass");

  let ok = true;
  if (isSignup) ok = markInvalid(nameInput, nameInput.value.trim().length < 2) && ok;
  ok = markInvalid(emailInput, !/^\S+@\S+\.\S+$/.test(emailInput.value.trim())) && ok;
  ok = markInvalid(passInput, passInput.value.length < 6) && ok;
  if (!ok) return;

  setBusy(button, true, isSignup ? "Creating…" : "Logging in…");
  await Store.ready;

  try {
    currentUser = isSignup
      ? Store.signUp({
          full_name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          password: passInput.value,
        })
      : Store.signIn({ email: emailInput.value.trim(), password: passInput.value });

    closeModal(modal);
    showToast(isSignup ? `Welcome, ${displayName()}!` : `Logged in as ${displayName()}`, "success");
    announceAuth();
  } catch (err) {
    setBusy(button, false);
    showToast(err.message, "error");
  }
}

function logout() {
  Store.signOut();
  currentUser = GUEST_MODE ? ensureGuest() : null;
  showToast("Logged out.", "success");
  announceAuth();
  if (/dashboard\.html|sell\.html/.test(location.pathname)) location.href = "index.html";
}

/** Signs in the built-in guest student, creating the account on first run. */
function ensureGuest() {
  const existing = Store.userByEmail(GUEST.email);
  if (existing) {
    Store.setSession(existing.id);
    return Store.publicUser(existing);
  }
  return Store.signUp({ ...GUEST });
}

/**
 * Gate an action behind an account. With GUEST_MODE on it never blocks —
 * it just makes sure somebody is signed in first.
 */
function requireAuth(reason = "Log in to continue.") {
  if (currentUser) return true;
  if (GUEST_MODE) {
    currentUser = ensureGuest();
    announceAuth();
    return true;
  }
  openAuthModal("login", reason);
  return false;
}

/* ---------- Bootstrap ---------- */

async function initAuth() {
  await Store.ready;
  currentUser = Store.session();
  if (!currentUser && GUEST_MODE) currentUser = ensureGuest();
  renderNavAuth();
  _resolveAuth();
}

document.addEventListener("DOMContentLoaded", initAuth);
