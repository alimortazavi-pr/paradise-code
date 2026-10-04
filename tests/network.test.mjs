import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCounters,
  delta,
  validateRange,
  localDate,
} from "../extensions/paradise-network/core.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateCatalog } = require("../extensions/paradise-hub/catalog.cjs");
const counters = `Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll Drop
en0 1500 <Link#11> ca:00 50 0 123400 60 0 23400 0 0
en0 1500 127 127.1 50 - 123400 60 - 23400 - -
en1 1500 <Link#12> 50 0 700 60 0 200 0 0
utun0 1500 <Link#13> ca:00 50 0 123400 60 0 23400 0 0
lo0 1500 <Link#1> ca:00 50 0 123400 60 0 23400 0 0`;
test("physical Link rows count once and omit virtual and loopback interfaces", () =>
  assert.deepEqual(parseCounters(counters), {
    en0: { rx: 123400, tx: 23400 },
    en1: { rx: 700, tx: 200 },
  }));
test("counter reset and newly connected interfaces do not invent traffic", () =>
  assert.deepEqual(
    delta(
      { en0: { rx: 100, tx: 50 } },
      { en0: { rx: 5, tx: 10 }, en1: { rx: 900, tx: 300 } },
      2,
    ),
    { rx: 0, tx: 0, rxRate: 0, txRate: 0, interfaces: {}, reset: true },
  ));
test("rates use elapsed time and sum distinct physical interfaces", () => {
  const d = delta(
    { en0: { rx: 10, tx: 20 }, en1: { rx: 0, tx: 0 } },
    { en0: { rx: 110, tx: 60 }, en1: { rx: 40, tx: 20 } },
    2,
  );
  assert.equal(d.rx, 140);
  assert.equal(d.tx, 60);
  assert.equal(d.rxRate, 70);
});
test("empty or malformed system counters produce an explicit error", () =>
  assert.throws(() => parseCounters("en0 x x"), /No physical/));
test("date range rejects reversed, unsafe and excessive ranges", () => {
  validateRange("2026-10-01", "2026-10-04");
  for (const range of [
    ["2026-10-05", "2026-10-01"],
    ["../secrets", "2026-10-04"],
    ["2020-01-01", "2026-10-04"],
  ])
    assert.throws(() => validateRange(...range));
  assert.match(localDate(Date.now()), /^\d{4}-\d{2}-\d{2}$/);
});
test("catalog rejects executable downloads outside the owned release repository", () => {
  const item = {
    id: "paradise.network",
    version: "0.1.0",
    sha256: "a".repeat(64),
    name: "Network",
    description: "usage",
    platforms: ["darwin"],
    download:
      "https://github.com/alimortazavi-pr/paradise-code/releases/download/v0.4.0/network.vsix",
  };
  assert.equal(validateCatalog({ schema: 1, extensions: [item] }).length, 1);
  for (const download of [
    "http://github.com/alimortazavi-pr/paradise-code/releases/download/x",
    "https://github.com/attacker/project/releases/download/x",
    "https://example.com/a",
  ])
    assert.throws(() =>
      validateCatalog({ schema: 1, extensions: [{ ...item, download }] }),
    );
});
