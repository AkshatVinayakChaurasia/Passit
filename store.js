/* ============================================================
   store.js — the data layer
   ------------------------------------------------------------
   Replaces the backend entirely. Seeds from data/books.json,
   then keeps every change in the browser so listings, accounts,
   saves and messages survive a refresh.

   Nothing here talks to a network. No keys, no SQL, no server.
   ============================================================ */

const DB_KEY = "campus-market:db:v1";
const SESSION_KEY = "campus-market:session:v1";

/* ---------- Storage with an in-memory fallback ----------
   Some sandboxed previews block localStorage. Rather than
   crash, we fall back to memory: the demo still works, it
   just forgets on reload.                                    */

const memoryStore = {};
const storage = (() => {
  try {
    const probe = "__cm_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (_) {
    return {
      getItem: (k) => (k in memoryStore ? memoryStore[k] : null),
      setItem: (k, v) => (memoryStore[k] = String(v)),
      removeItem: (k) => delete memoryStore[k],
    };
  }
})();

function uid(prefix = "id") {
  if (window.crypto?.randomUUID) return prefix + "-" + window.crypto.randomUUID().slice(0, 8);
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

function daysAgoISO(days = 0) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/* ---------- The store ---------- */

const Store = {
  db: { users: [], listings: [], saved: [], messages: [] },
  ready: null,

  /* --- boot --- */

  init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const cached = storage.getItem(DB_KEY);
      if (cached) {
        try {
          this.db = JSON.parse(cached);
          return this.db;
        } catch (_) {
          /* corrupt cache — reseed below */
        }
      }
      const seed = await this.loadSeed();
      this.db = {
        users: seed.sellers.map((s) => ({ ...s })),
        listings: seed.listings.map((l) => {
          const { days_ago, ...rest } = l;
          return {
            ...rest,
            created_at: daysAgoISO(days_ago ?? 0),
            updated_at: daysAgoISO(days_ago ?? 0),
          };
        }),
        saved: [],
        messages: [],
      };
      this.persist();
      return this.db;
    })();
    return this.ready;
  },

  async loadSeed() {
    try {
      const res = await fetch("data/books.json", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (_) {
      // file:// or missing file — use the inline copy from seed.js
      if (window.SEED_DATA) return window.SEED_DATA;
      return { sellers: [], listings: [] };
    }
  },

  persist() {
    try {
      storage.setItem(DB_KEY, JSON.stringify(this.db));
    } catch (err) {
      console.warn("Couldn't save locally:", err.message);
      showToast("Storage is full — recent changes may not persist.", "error");
    }
  },

  /** Wipes local changes and reloads the shipped mock data. */
  async reset() {
    storage.removeItem(DB_KEY);
    storage.removeItem(SESSION_KEY);
    this.ready = null;
    await this.init();
  },

  /* --- users --- */

  userById(id) {
    return this.db.users.find((u) => u.id === id) || null;
  },

  userByEmail(email) {
    const e = String(email).toLowerCase().trim();
    return this.db.users.find((u) => u.email.toLowerCase() === e) || null;
  },

  signUp({ full_name, email, password }) {
    if (this.userByEmail(email)) throw new Error("An account with that email already exists.");
    const user = { id: uid("u"), full_name, email: email.trim(), password };
    this.db.users.push(user);
    this.persist();
    this.setSession(user.id);
    return this.publicUser(user);
  },

  signIn({ email, password }) {
    const user = this.userByEmail(email);
    if (!user || user.password !== password) throw new Error("That email and password don't match.");
    this.setSession(user.id);
    return this.publicUser(user);
  },

  signOut() {
    storage.removeItem(SESSION_KEY);
  },

  setSession(userId) {
    storage.setItem(SESSION_KEY, userId);
  },

  session() {
    const id = storage.getItem(SESSION_KEY);
    const user = id ? this.userById(id) : null;
    return user ? this.publicUser(user) : null;
  },

  publicUser(u) {
    return { id: u.id, full_name: u.full_name, email: u.email };
  },

  /* --- listings --- */

  hydrate(listing) {
    const seller = this.userById(listing.seller_id);
    return { ...listing, seller: seller ? this.publicUser(seller) : null };
  },

  listings({ status = "available" } = {}) {
    return this.db.listings
      .filter((l) => (status ? l.status === status : true))
      .map((l) => this.hydrate(l))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  get(id) {
    const l = this.db.listings.find((x) => x.id === id);
    return l ? this.hydrate(l) : null;
  },

  create(data, sellerId) {
    const listing = {
      ...data,
      id: uid("bk"),
      seller_id: sellerId,
      status: "available",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.db.listings.unshift(listing);
    this.persist();
    return this.hydrate(listing);
  },

  update(id, patch, userId) {
    const l = this.db.listings.find((x) => x.id === id);
    if (!l) throw new Error("Listing not found.");
    if (l.seller_id !== userId) throw new Error("You can only edit your own listings.");
    Object.assign(l, patch, { updated_at: new Date().toISOString() });
    this.persist();
    return this.hydrate(l);
  },

  remove(id, userId) {
    const l = this.db.listings.find((x) => x.id === id);
    if (!l) throw new Error("Listing not found.");
    if (l.seller_id !== userId) throw new Error("You can only delete your own listings.");
    this.db.listings = this.db.listings.filter((x) => x.id !== id);
    this.db.saved = this.db.saved.filter((s) => s.listing_id !== id);
    this.persist();
  },

  myListings(userId) {
    return this.db.listings
      .filter((l) => l.seller_id === userId)
      .map((l) => this.hydrate(l))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  /* --- saved --- */

  isSaved(userId, listingId) {
    return this.db.saved.some((s) => s.user_id === userId && s.listing_id === listingId);
  },

  toggleSave(userId, listingId) {
    const saved = this.isSaved(userId, listingId);
    if (saved) {
      this.db.saved = this.db.saved.filter(
        (s) => !(s.user_id === userId && s.listing_id === listingId)
      );
    } else {
      this.db.saved.unshift({
        id: uid("sv"),
        user_id: userId,
        listing_id: listingId,
        created_at: new Date().toISOString(),
      });
    }
    this.persist();
    return !saved;
  },

  savedListings(userId) {
    return this.db.saved
      .filter((s) => s.user_id === userId)
      .map((s) => this.get(s.listing_id))
      .filter(Boolean);
  },

  /* --- messages --- */

  sendMessage({ sender_id, receiver_id, listing_id, message }) {
    const row = { id: uid("msg"), sender_id, receiver_id, listing_id, message, created_at: new Date().toISOString() };
    this.db.messages.unshift(row);
    this.persist();
    return row;
  },

  inbox(userId) {
    return this.db.messages.filter((m) => m.sender_id === userId || m.receiver_id === userId);
  },
};

Store.init();
