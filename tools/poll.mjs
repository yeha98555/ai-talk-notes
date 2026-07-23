#!/usr/bin/env node
/*
 * poll.mjs — read channels.json, fetch each channel's YouTube RSS feed, and
 * append newly-seen videos to queue.json as `status: "pending"`. Idempotent:
 * videos already in the queue (by videoId) are never re-added. Dependency-free
 * (RSS needs no API key). Dev tool only. Run: `node tools/poll.mjs`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (f) => path.join(ROOT, f);
const readJSON = (f) => JSON.parse(fs.readFileSync(p(f), "utf8"));
const writeJSON = (f, v) => fs.writeFileSync(p(f), JSON.stringify(v, null, 2) + "\n");

const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const FEED = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

const decodeEntities = (s) =>
    s
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");

const tag = (block, name) => {
    const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return m ? decodeEntities(m[1].trim()) : "";
};

// Map already-published videoIds to their doc id, so a video that is already on
// the site is queued as `published` (not `pending`) instead of re-suggested for
// review. Reads each src/notes/doc-N.md frontmatter `video:` URL.
const publishedIndex = () => {
    const dir = p(path.join("src", "notes"));
    const map = new Map();
    for (const f of fs.readdirSync(dir)) {
        const m = /^doc-(\d+)\.md$/.exec(f);
        if (!m) continue;
        const vid = (fs.readFileSync(path.join(dir, f), "utf8").match(
            /^video:\s*.*?(?:youtu\.be\/|watch\?v=)([A-Za-z0-9_-]{11})/m,
        ) || [])[1];
        if (vid) map.set(vid, `doc-${m[1]}`);
    }
    return map;
};

// Parse the <entry> blocks of a YouTube channel RSS feed into video records.
const parseFeed = (xml, channelName, published) => {
    const out = [];
    for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const e = m[1];
        const videoId = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
        if (!videoId) continue;
        const docId = published.get(videoId) || null;
        out.push({
            videoId,
            title: tag(e, "title"),
            channel: channelName,
            published: tag(e, "published"),
            thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            url: `https://youtu.be/${videoId}`,
            status: docId ? "published" : "pending",
            docId,
            note: null,
        });
    }
    return out;
};

const channels = readJSON("channels.json");
const published = publishedIndex();
const queue = readJSON("queue.json");
const seen = new Set(queue.map((v) => v.videoId));

let added = 0;
for (const ch of channels) {
    let xml;
    try {
        const res = await fetch(FEED(ch.id), { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        xml = await res.text();
    } catch (err) {
        console.error(`  ! ${ch.name} (${ch.id}) — fetch failed: ${err.message}`);
        continue;
    }
    const videos = parseFeed(xml, ch.name, published);
    const fresh = videos.filter((v) => !seen.has(v.videoId));
    const alreadyNoted = fresh.filter((v) => v.status === "published").length;
    for (const v of fresh) {
        seen.add(v.videoId);
        queue.push(v);
        added++;
    }
    const note = alreadyNoted ? ` (${alreadyNoted} already noted)` : "";
    console.log(`  ${ch.name}: ${videos.length} in feed, ${fresh.length} new${note}`);
}

if (added) {
    writeJSON("queue.json", queue);
    console.log(`\n+${added} new video(s) added to queue.json (now ${queue.length} total).`);
} else {
    console.log("\nNo new videos. queue.json unchanged.");
}
