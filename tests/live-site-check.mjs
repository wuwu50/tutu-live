import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  collectVideos,
  extractDate,
  mergeMetadata,
  readPublicationDate,
} from "../scripts/update-live-titles.mjs";
assert.equal(
  collectVideos({
    lockupViewModel: {
      contentId: "abcdefghijk",
      metadata: { lockupMetadataViewModel: { title: { content: "新格式" } } },
    },
  }).get("abcdefghijk").title,
  "新格式",
);
assert.equal(
  collectVideos({
    playlistVideoRenderer: {
      videoId: "abcdefghijk",
      title: { runs: [{ text: "舊格式" }] },
    },
  }).get("abcdefghijk").title,
  "舊格式",
);
assert.equal(
  extractDate('"publishDate":"2026-10-10T23:54:05-07:00"'),
  "2026-10-10T23:54:05-07:00",
);
assert.equal(extractDate('"publishDate":"yesterday"'), null);
assert.equal(
  extractDate('<meta itemprop="datePublished" content="2026-10-09">'),
  "2026-10-09",
);
const html = fs.readFileSync("web/live/index.html", "utf8"),
  cache = {
    "bf-b0xBoqsE": {
      title: "1010兔子直播",
      publishedAt: "2026-10-10T23:54:05-07:00",
    },
    M91vWgpS0gM: {
      title: "1009兔兔直播",
      publishedAt: "2026-10-09T11:33:15-07:00",
    },
  };
assert(
  Object.keys(JSON.parse(fs.readFileSync("web/live/titles.json", "utf8")))
    .length > 0,
);
function node() {
  return {
    children: [],
    textContent: "",
    hidden: false,
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren() {
      this.children = [];
    },
    querySelector() {
      return node();
    },
    scrollIntoView() {},
    focus() {},
    select() {},
  };
}
const nodes = new Map();
const el = (id) => {
  if (!nodes.has(id)) nodes.set(id, node());
  return nodes.get(id);
};
let played;
const listeners = {};
const copied = [];
const nav = {
  origin: "https://example.test",
  href: "https://example.test/tutu-live/",
  reload() {},
};
const navigation = [];
const context = vm.createContext({
  document: { getElementById: el, createElement: node, head: node() },
  window: { addEventListener: (event, fn) => (listeners[event] = fn) },
  history: {
    pushState(_s, _t, url) {
      nav.href = url;
      navigation.push(url);
    },
    replaceState(_s, _t, url) {
      nav.href = url;
    },
  },
  navigator: { clipboard: { writeText: async (text) => copied.push(text) } },
  fetch: async () => ({ ok: true, json: async () => cache }),
  Intl,
  Date,
  URL,
  Map,
  location: nav,
  setInterval() {},
  setTimeout() {},
  YT: {},
});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
await new Promise(setImmediate);
const ids = Object.keys(cache);
context.testIds = [...ids, "abcdefghijk"];
context.nowPlaying = "";
context.onPlay = (i) => {
  played = i;
  context.nowPlaying = context.testIds[i];
};
vm.runInContext(
  'player={getPlaylist:()=>testIds,playVideoAt:onPlay,getVideoUrl:()=>"https://www.youtube.com/watch?v="+(nowPlaying||testIds[0])};renderList();updateTitle();',
  context,
);
await new Promise(setImmediate);
const cards = el("cards").children;
assert.equal(cards[0].children[0].textContent, cache[ids[0]].title);
assert.equal(cards[0].children[1].textContent, "發布日期：2026/10/11");
assert.equal(el("currentDate").textContent, "發布日期：2026/10/11");
assert.equal(cards.at(-1).children[1].textContent, "發布日期待同步");
cards[1].onclick();
assert.equal(played, 1);
assert.equal(cards[0].children[2].loading, "lazy");
console.log(
  "PASS live metadata: old/new YouTube formats, real cached titles/dates, Taipei timezone, missing-date fallback, card rendering and playback",
);

assert.equal(new URL(nav.href).searchParams.get("v"), ids[1]);
await vm.runInContext("updateTitle()", context);
await el("shareVideo").onclick();
assert.equal(copied.at(-1), "https://example.test/tutu-live/?v=" + ids[1]);
nav.href = "https://example.test/tutu-live/?v=" + ids[0];
listeners.popstate();
await new Promise(setImmediate);
assert.equal(played, 0);
assert.equal(el("title").textContent, cache[ids[0]].title);
nav.href = "https://example.test/tutu-live/?v=ZZZZZZZZZZZ";
played = -1;
listeners.popstate();
await new Promise(setImmediate);
assert.equal(played, -1);
context.navigator.clipboard.writeText = async () => {
  throw Error("blocked");
};
await el("shareVideo").onclick();
assert.equal(el("shareFallback").hidden, false);
assert(el("shareFallback").value.includes("?v=" + ids[0]));
console.log(
  "PASS share links: selected video URL, clipboard, history navigation, unknown-video guard, manual-copy fallback",
);

const retained = mergeMetadata(
  {
    abcdefghijk: { title: "舊標題", publishedAt: "2026-10-17T08:45:41-07:00" },
  },
  {
    abcdefghijk: { title: "新標題", publishedAt: null },
    bad: { title: "不合法" },
    newvideo123: { title: "新影片", publishedAt: "不是日期" },
  },
);
assert.equal(retained.abcdefghijk.publishedAt, "2026-10-17T08:45:41-07:00");
assert.equal(retained.abcdefghijk.title, "新標題");
assert(!retained.bad);
assert.equal(retained.newvideo123.publishedAt, null);
let attempts = 0;
const recovered = await readPublicationDate("abcdefghijk", async () => ({
  ok: true,
  text: async () =>
    ++attempts === 1
      ? "missing metadata"
      : '"publishDate":"2026-10-20T11:46:07-07:00"',
}));
assert.equal(attempts, 2);
assert.equal(recovered, "2026-10-20T11:46:07-07:00");
assert.equal(
  await readPublicationDate("abcdefghijk", async () => {
    throw Error("network");
  }),
  null,
);
await assert.rejects(
  readPublicationDate("../bad", async () => {
    throw Error("must not request");
  }),
  /Invalid video/,
);
console.log(
  "PASS sync recovery: published cache merge, no null-date regression, unknown-date honesty and bounded retry",
);

context.fetch=async()=>({ok:true,json:async()=>({...cache,abcdefghijk:{title:'剛上傳的兔兔影片',publishedAt:'2026-10-20T11:46:07-07:00'}})});
await vm.runInContext('refreshMetadata()',context);
assert.equal(el('cards').children.at(-1).children[0].textContent,'剛上傳的兔兔影片');
assert.equal(el('cards').children.at(-1).children[1].textContent,'發布日期：2026/10/21');
context.fetch=async()=>({ok:true,json:async()=>({...cache,abcdefghijk:{title:'剛上傳的兔兔影片',publishedAt:null}})});
await vm.runInContext('refreshMetadata()',context);
assert.equal(el('cards').children.at(-1).children[1].textContent,'發布日期：2026/10/21');
console.log('PASS live page refresh: new metadata appears without reload and preserves known dates');
