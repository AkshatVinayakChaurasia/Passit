# Campus Market

A peer-to-peer marketplace where college students sell and buy used textbooks. Plain HTML, CSS and JavaScript with a JSON mock dataset — **no backend, no database, no API keys**. Clone it, open it, demo it.

**The pitch:** listings write their own descriptions, and search understands campus shorthand. Type `DSA` and you get *Data Structures and Algorithms*, ranked by how well each listing actually matches.

---

## 1. Features

- **No login wall** — you're signed in as a guest student on load; the modal only switches between seeded accounts
- Post a listing: title, author, subject, edition, price, condition, description, tags, optional cover photo
- **Generate description with AI** — one click drafts the description; fully editable afterwards
- Browse, search, filter (subject, price range, condition) and sort (best match, newest, price)
- Weighted relevance scoring with a **Best match** badge on top results
- Book details page with seller info, contact and save
- Message a seller (stored locally) or fall back to email
- Save listings to a personal shortlist
- Dashboard: edit, delete, mark sold, relist
- Every change persists across refreshes; one button restores the original mock data
- Toasts, loading skeletons, empty states, delete confirmations, form validation, INR formatting
- Responsive from mobile to desktop; respects `prefers-reduced-motion`

## 2. Tech stack

| Layer | Choice |
|---|---|
| Markup / styling | HTML5, CSS3 (custom properties, grid, flex) |
| Logic | Vanilla JavaScript (ES2020), no framework, no build step |
| Data | `data/books.json` seed + a browser-side store (`js/store.js`) |
| Type / icons | Fredoka + DM Sans (Google Fonts), Font Awesome 6 |

## 3. Folder structure

```
campus-market/
├── index.html          Landing + marketplace (search, filters, grid)
├── sell.html           Create / edit a listing
├── listing.html        Book details
├── dashboard.html      My books + saved books
├── css/style.css       All styling
├── data/
│   └── books.json      Mock data: 4 sellers, 12 textbook listings
├── js/
│   ├── seed.js         Inline copy of books.json (file:// fallback)
│   ├── store.js        The data layer — seed, persistence, CRUD, auth
│   ├── utils.js        Formatting, toasts, modals, matching, description generator, cards
│   ├── auth.js         Session, navbar state, login/signup modal
│   ├── marketplace.js  Search, filter, sort
│   ├── sell.js         Form, validation, description generation, image handling
│   ├── listing.js      Details, contact seller, save, delete
│   └── dashboard.js    My listings and saved listings
├── assets/
└── README.md
```

## 4. Running it

```bash
python3 -m http.server 5500
# or
npx serve .
```

Then open `http://localhost:5500`.

Opening `index.html` directly from disk also works — `js/seed.js` carries an identical copy of the mock data for when the browser blocks `fetch` on `file://` — but a local server is the cleaner demo.

## 5. How the data layer works

`js/store.js` replaces what a backend would do:

1. On first load it reads `data/books.json` and builds an in-browser database: `users`, `listings`, `saved`, `messages`.
2. Every write (publish, edit, delete, save, message, signup) updates that object and writes it back to `localStorage`, so a refresh keeps your changes.
3. If storage is unavailable — some sandboxed previews block it — the store falls back to memory. The demo still runs; it just forgets on reload.

**Reset demo data** at the bottom of the marketplace wipes local changes and reloads the shipped JSON. Useful right before you present.

To change the sample catalogue, edit `data/books.json` and hit reset. Each listing takes `title`, `author`, `subject`, `edition`, `price`, `condition`, `description`, `tags`, `image_url`, `status`, and `days_ago` (used to generate a realistic posted date).

## 6. Accounts

There is no login step. On first load the app signs you in as a guest student ("You"), so selling, saving and messaging all work immediately. Flip `GUEST_MODE` to `false` at the top of `js/auth.js` to put the login wall back.

The person icon in the navbar switches to one of the four seeded students:

| Email | Password |
|---|---|
| `demo@campus.market` | `demo1234` |
| `riya@campus.market` | `riya1234` |
| `kabir@campus.market` | `kabir1234` |
| `meera@campus.market` | `meera1234` |

The switch-account modal has a **Use the demo account** button that fills the first one in.

This is demo auth: passwords sit in the mock data in plain text and the checks happen in the browser. It gates the same actions a real backend would, but it is not security — swap `Store.signIn` / `Store.signUp` for real API calls when you add a server.

## 7. How description generation works

`generateDescription(bookData)` in `js/utils.js` is the single abstraction. It takes `{ title, author, subject, edition, condition, tags }` and returns finished copy:

- Condition-specific phrasing (*Like New* reads differently from *Fair*)
- Audience detection from tags (`CSE`, `BTech`, `ECE`)
- Semester detection (`Semester 3`)
- A topic list assembled from the remaining tags

No key, no network, no failure mode. If you later host a real model, set `AI_ENDPOINT` at the top of the generator to your endpoint URL — it's tried first and the local generator stays as the fallback. Keep the model's API key on that server, never in this code.

## 8. How smart matching works

`calculateMatchScore(listing, query)` scores each listing:

| Field | Points per matched term |
|---|---|
| Title | +5 |
| Subject | +4 |
| Tags | +3 |
| Description | +2 |
| Author | +1 |
| Exact phrase in title | +6 bonus |

Queries expand through a synonym map first, so `dsa` also searches *data*, *structures*, *algorithms*; `dbms` picks up *database* and *sql*. Zero-score listings drop out, the rest sort by score, and the top scorer gets the **Best match** badge.

## 9. Demo script (5 flows)

1. **Sell a book → ✦ Generate description → Publish** → no login needed; the listing opens on its own page and appears on the marketplace.
2. **Tap the DSA chip** (or search "DSA") → *Introduction to Algorithms* and *Data Structures and Algorithms in C++* rank first with a Best match badge.
3. **Open a book → see the seller → Contact seller** → message is recorded and confirmed.
4. **My listings → Edit → Save changes** → updated details appear immediately.
5. **My listings → Delete → confirm** → the listing disappears from the dashboard and the marketplace.
