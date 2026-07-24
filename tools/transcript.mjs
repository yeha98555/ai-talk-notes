#!/usr/bin/env node
/*
 * transcript.mjs — fetch a YouTube video's caption text without an API key.
 *
 * The signed caption URLs embedded in the watch page are IP-bound and return
 * 204/404 when fetched from elsewhere, so we ask the InnerTube ANDROID client
 * `player` endpoint for a fetchable caption track, then strip the timedtext XML
 * to plain text. Returns `{ text, lang }`, or `{ text: null, reason }` when the
 * video has no captions (caller should mark it `needs-transcript`, not hard-fail).
 *
 * Reusable module (`fetchTranscript`) + CLI: `node tools/transcript.mjs <videoId|url>`.
 * Dependency-free. The InnerTube key below is YouTube's public web-client key.
 */

const UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 13) gzip";
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const PLAYER = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`;

export const parseVideoId = (s) => {
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|watch\?v=|\/embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
};

const decodeEntities = (s) =>
    s
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");

// timedtext format 3 XML → plain text (strip tags, decode, collapse whitespace).
const xmlToText = (xml) => decodeEntities(xml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Choose the best English track: prefer a human track over auto-captions (asr).
const pickTrack = (tracks) => {
    const en = tracks.filter((t) => (t.languageCode || "").startsWith("en"));
    const pool = en.length ? en : tracks;
    return pool.find((t) => t.kind !== "asr") || pool[0] || null;
};

export const fetchTranscript = async (videoIdOrUrl) => {
    const videoId = parseVideoId(videoIdOrUrl);
    if (!videoId) return { text: null, reason: "bad-video-id" };

    const res = await fetch(PLAYER, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/json" },
        body: JSON.stringify({
            context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en" } },
            videoId,
        }),
    });
    if (!res.ok) return { text: null, reason: `player-http-${res.status}` };

    const data = await res.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || !tracks.length) return { text: null, reason: "no-captions" };

    const track = pickTrack(tracks);
    if (!track?.baseUrl) return { text: null, reason: "no-track-url" };

    const ttRes = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
    if (!ttRes.ok) return { text: null, reason: `timedtext-http-${ttRes.status}` };
    const xml = await ttRes.text();
    const text = xmlToText(xml);
    if (!text) return { text: null, reason: "empty-transcript" };

    return { text, lang: track.languageCode || "en" };
};

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
    const arg = process.argv[2];
    if (!arg) {
        console.error("usage: node tools/transcript.mjs <videoId|url>");
        process.exit(2);
    }
    const { text, lang, reason } = await fetchTranscript(arg);
    if (!text) {
        console.error(`no transcript: ${reason}`);
        process.exit(1);
    }
    console.error(`lang=${lang}, ${text.length} chars, ~${text.split(" ").length} words`);
    console.log(text);
}
