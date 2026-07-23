#!/usr/bin/env node
/*
 * review.mjs — a tiny localhost UI for picking which queued videos to keep.
 * Lists every `pending` video in queue.json as a thumbnail card; Approve / Reject
 * rewrites that video's `status` (and optional `note`) back to queue.json.
 * Dependency-free (Node built-in http). Dev tool only. Run: `node tools/review.mjs`.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const QUEUE = path.join(ROOT, "queue.json");
const PORT = Number(process.env.PORT) || 4321;

const readQueue = () => JSON.parse(fs.readFileSync(QUEUE, "utf8"));
const writeQueue = (q) => fs.writeFileSync(QUEUE, JSON.stringify(q, null, 2) + "\n");
const counts = (q) => q.reduce((a, v) => ((a[v.status] = (a[v.status] || 0) + 1), a), {});
const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const card = (v) => `
  <article class="card" data-id="${esc(v.videoId)}">
    <a class="thumb" href="${esc(v.url)}" target="_blank" rel="noopener">
      <img src="${esc(v.thumb)}" alt="" loading="lazy" />
    </a>
    <div class="body">
      <h2><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a></h2>
      <p class="meta">${esc(v.channel)} · ${esc((v.published || "").slice(0, 10))}</p>
      <input class="note" type="text" placeholder="Optional note…" value="${esc(v.note || "")}" />
      <div class="actions">
        <button class="approve" onclick="act(this,'approved')">Approve</button>
        <button class="reject" onclick="act(this,'rejected')">Reject</button>
      </div>
    </div>
  </article>`;

const page = (q) => {
    const c = counts(q);
    const pending = q.filter((v) => v.status === "pending");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Review queue · ${pending.length} pending</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f6f7f9; color: #16181d; }
  @media (prefers-color-scheme: dark) { body { background: #0e0f12; color: #e7e9ee; } }
  header { position: sticky; top: 0; padding: 14px 20px; background: inherit;
    border-bottom: 1px solid #8883; display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
  header h1 { font-size: 17px; margin: 0; }
  header .tally { font-size: 13px; opacity: .7; }
  header .tally b { font-weight: 600; }
  main { max-width: 1200px; margin: 0 auto; padding: 20px; display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #8882; border-radius: 12px; overflow: hidden;
    display: flex; flex-direction: column; transition: opacity .25s, transform .25s; }
  @media (prefers-color-scheme: dark) { .card { background: #1a1c22; } }
  .card.gone { opacity: 0; transform: scale(.96); }
  .thumb { display: block; aspect-ratio: 16/9; background: #0002; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .body h2 { font-size: 15px; margin: 0; line-height: 1.35; }
  .body h2 a { color: inherit; text-decoration: none; }
  .body h2 a:hover { text-decoration: underline; }
  .meta { font-size: 12.5px; opacity: .65; margin: 0; }
  .note { width: 100%; padding: 6px 8px; border: 1px solid #8884; border-radius: 7px;
    background: transparent; color: inherit; font: inherit; font-size: 13px; }
  .actions { display: flex; gap: 8px; margin-top: auto; }
  .actions button { flex: 1; padding: 8px; border: 0; border-radius: 8px; font: inherit;
    font-weight: 600; cursor: pointer; }
  .approve { background: #1f9d55; color: #fff; }
  .reject { background: #e0554533; color: #d94b3b; }
  .approve:hover { background: #1a8449; } .reject:hover { background: #e0554555; }
  .empty { grid-column: 1/-1; text-align: center; opacity: .6; padding: 60px 20px; }
</style></head>
<body>
  <header>
    <h1>Review queue</h1>
    <span class="tally">
      <b id="c-pending">${c.pending || 0}</b> pending ·
      <b>${c.approved || 0}</b> approved ·
      <b>${c.rejected || 0}</b> rejected ·
      <b>${c.published || 0}</b> already noted
    </span>
  </header>
  <main id="grid">
    ${pending.length ? pending.map(card).join("") : '<p class="empty">Nothing pending. Run <code>node tools/poll.mjs</code> to fetch new videos.</p>'}
  </main>
<script>
async function act(btn, status) {
  const cardEl = btn.closest(".card");
  const id = cardEl.dataset.id;
  const note = cardEl.querySelector(".note").value.trim();
  cardEl.style.pointerEvents = "none";
  const res = await fetch("/api/act", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ videoId: id, status, note }),
  });
  if (!res.ok) { alert("Failed: " + await res.text()); cardEl.style.pointerEvents = ""; return; }
  const { counts } = await res.json();
  document.getElementById("c-pending").textContent = counts.pending || 0;
  cardEl.classList.add("gone");
  setTimeout(() => {
    cardEl.remove();
    if (!document.querySelector(".card"))
      document.getElementById("grid").innerHTML =
        '<p class="empty">All caught up. Run <code>node tools/poll.mjs</code> for more.</p>';
  }, 250);
}
</script>
</body></html>`;
};

const readBody = (req) =>
    new Promise((resolve, reject) => {
        let b = "";
        req.on("data", (c) => (b += c));
        req.on("end", () => resolve(b));
        req.on("error", reject);
    });

const server = http.createServer(async (req, res) => {
    try {
        if (req.method === "GET" && req.url === "/") {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(page(readQueue()));
            return;
        }
        if (req.method === "POST" && req.url === "/api/act") {
            const { videoId, status, note } = JSON.parse(await readBody(req));
            if (!["approved", "rejected"].includes(status)) {
                res.writeHead(400).end("bad status");
                return;
            }
            const q = readQueue();
            const item = q.find((v) => v.videoId === videoId);
            if (!item) {
                res.writeHead(404).end("unknown videoId");
                return;
            }
            item.status = status;
            if (note) item.note = note;
            writeQueue(q);
            console.log(`  ${status.padEnd(8)} ${videoId}  ${item.title.slice(0, 60)}`);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true, counts: counts(q) }));
            return;
        }
        res.writeHead(404).end("not found");
    } catch (err) {
        res.writeHead(500).end(String(err.message));
    }
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} in use. Try: PORT=4322 node tools/review.mjs`);
        process.exit(1);
    }
    throw err;
});

server.listen(PORT, () => {
    const q = readQueue();
    const pending = q.filter((v) => v.status === "pending").length;
    console.log(`Review UI → http://localhost:${PORT}  (${pending} pending)`);
    console.log("Approve / Reject writes back to queue.json. Ctrl-C to stop.");
});
