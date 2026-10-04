const fs = require("node:fs");
const path = require("node:path");
const { topics } = require("../visual-summaries.js");
const icons = {
  person: '<circle cx="36" cy="20" r="12"/><path d="M14 64v-8a22 22 0 0 1 44 0v8"/>',
  people: '<circle cx="36" cy="18" r="10"/><circle cx="12" cy="28" r="8"/><circle cx="60" cy="28" r="8"/><path d="M20 64V50a16 16 0 0 1 32 0v14M2 64V50a10 10 0 0 1 12-10M70 64V50a10 10 0 0 0-12-10"/>',
  group: '<rect x="5" y="5" width="62" height="62" rx="12"/><circle cx="26" cy="27" r="8"/><circle cx="48" cy="27" r="8"/><path d="M13 56v-5a13 13 0 0 1 26 0v5M40 39a13 13 0 0 1 19 12v5"/>',
  policy: '<rect x="14" y="8" width="46" height="58" rx="7"/><path d="M27 8V4h20v4M23 27l4 4 6-8M39 27h12M23 43l4 4 6-8M39 43h12M25 57h26"/>',
  file: '<path d="M16 4h26l16 16v48H16zM42 4v16h16M26 34h22M26 46h22M26 58h14"/>',
  bucket: '<ellipse cx="36" cy="14" rx="26" ry="9"/><path d="M10 14l6 43c2 14 38 14 40 0l6-43M16 48c8 8 32 8 40 0"/>',
  check: '<circle cx="36" cy="36" r="29"/><path d="M20 36l11 11 23-25"/>',
  stop: '<path d="M24 5h24l19 19v24L48 67H24L5 48V24zM20 36h32"/>',
  lock: '<rect x="12" y="30" width="48" height="37" rx="8"/><path d="M22 30V19a14 14 0 0 1 28 0v11M36 46v8"/>',
  gate: '<path d="M10 65V10h52v55M22 22h28v43M8 65h56M30 38l5 5 10-12"/>',
  ticket: '<path d="M5 16h62v14a7 7 0 0 0 0 14v14H5V44a7 7 0 0 0 0-14zM48 23v5M48 34v5M48 45v5M16 31h21M16 43h14"/>',
  server: '<rect x="10" y="5" width="52" height="26" rx="6"/><rect x="10" y="41" width="52" height="26" rx="6"/><path d="M22 18h4M35 18h15M22 54h4M35 54h15M36 31v10"/>',
  badge: '<rect x="12" y="12" width="48" height="54" rx="6"/><path d="M26 12V5h20v7M26 50h20"/><circle cx="36" cy="32" r="8"/>',
  shield: '<path d="M36 5L62 16v18c0 15-11 27-26 34C21 61 10 49 10 34V16zM23 35l9 9 17-21"/>',
  search: '<circle cx="30" cy="28" r="21"/><path d="M45 45l22 22M20 27l7 7 13-15"/>'
};

function escape(value) {
  return String(value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]; });
}

function diagram(topic, mobile) {
  const width = mobile ? 440 : 1080;
  const height = mobile ? 860 : 350;
  const cardWidth = mobile ? 400 : 308;
  const cardHeight = mobile ? 248 : 304;
  const cards = topic.nodes.map(function (node, index) {
    const left = mobile ? 20 : 16 + index * 370;
    const top = mobile ? 16 + index * 292 : 20;
    const center = left + cardWidth / 2;
    const restricted = ["lock", "stop"].includes(node[0]);
    if (!icons[node[0]]) throw new Error("Missing visual icon: " + node[0]);
    return '<g><rect x="' + left + '" y="' + top + '" width="' + cardWidth + '" height="' + cardHeight + '" rx="20" fill="#ffffff" stroke="#d7e1d4" stroke-width="2"/><circle cx="' + center + '" cy="' + (top + (mobile ? 64 : 77)) + '" r="46" fill="' + (restricted ? "#ffede5" : "#e7efdf") + '"/><g transform="translate(' + (center - 32) + ' ' + (top + (mobile ? 32 : 45)) + ') scale(.89)" fill="none" stroke="' + (restricted ? "#a44020" : "#25564d") + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' + icons[node[0]] + '</g><text x="' + center + '" y="' + (top + (mobile ? 137 : 161)) + '" class="title">' + escape(node[1]) + '</text><text x="' + center + '" y="' + (top + (mobile ? 179 : 207)) + '" class="body">' + escape(node[2]) + '</text><text x="' + center + '" y="' + (top + (mobile ? 214 : 243)) + '" class="body">' + escape(node[3]) + '</text></g>';
  }).join("");
  const connectors = [0, 1].map(function (index) {
    const label = topic.links ? topic.links[index] : "→";
    const left = mobile ? 220 : 355 + index * 370;
    const top = mobile ? 293 + index * 292 : 183;
    return '<text x="' + left + '" y="' + top + '" class="connector"' + (mobile && label === "→" ? ' transform="rotate(90 ' + left + ' ' + (top - 8) + ')"' : "") + '>' + escape(label) + '</text>';
  }).join("");
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="title description"><title id="title">' + escape(topic.title) + '</title><desc id="description">' + escape(topic.remember) + '</desc><style>text{font-family:Arial,Helvetica,sans-serif;text-anchor:middle;fill:#203b36}.title{font-size:' + (mobile ? "29" : "26") + 'px;font-weight:700}.body{font-size:' + (mobile ? "25" : "21") + 'px;fill:#405c54}.connector{font-size:15px;font-weight:700;fill:#61776c}</style><rect width="100%" height="100%" rx="22" fill="#f5f7ef"/>' + cards + connectors + '</svg>\n';
}

const assets = Object.entries(topics).flatMap(function (entry) {
  return [false, true].map(function (mobile) { return { filename: "assets/visuals/" + entry[0] + (mobile ? "-mobile" : "") + ".svg", content: diagram(entry[1], mobile) }; });
});

if (process.argv.includes("--patch")) {
  process.stdout.write("*** Begin Patch\n" + assets.map(function (asset) { return "*** Add File: " + path.resolve(__dirname, "..", asset.filename) + "\n+" + asset.content.trimEnd() + "\n"; }).join("") + "*** End Patch\n");
} else {
  assets.forEach(function (asset) {
    const filename = path.resolve(__dirname, "..", asset.filename);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, asset.content);
  });
  process.stdout.write("Built " + assets.length + " responsive SVG diagrams.\n");
}
