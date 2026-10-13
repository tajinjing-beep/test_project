import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, parseName, splitAuthors } from "../public/names.js";

test("cleanTitle strips site suffix/prefix only when it matches the site", () => {
  assert.equal(cleanTitle("Citation - Wikipedia", "Wikipedia"), "Citation");
  assert.equal(cleanTitle("Wikipedia: Citation", "Wikipedia"), "Citation");
  assert.equal(cleanTitle("Pros - and cons", "Wikipedia"), "Pros - and cons");
});
test("parseName", () => {
  assert.deepEqual(parseName("Jane Q. Doe"), { family: "Doe", given: "Jane Q." });
  assert.deepEqual(parseName("Doe, Jane"), { family: "Doe", given: "Jane" });
  assert.deepEqual(parseName("山田 太郎"), { family: "山田", given: "太郎" });
  assert.deepEqual(parseName("NHK"), { name: "NHK" });
  assert.deepEqual(parseName("Contributors to Wikimedia projects"), { name: "Contributors to Wikimedia projects" });
});
test("splitAuthors", () => {
  assert.deepEqual(splitAuthors("A B and C D"), ["A B", "C D"]);
  assert.deepEqual(splitAuthors("山田 太郎、佐藤 花子"), ["山田 太郎", "佐藤 花子"]);
});

test("cleanTitle accepts any known site name", () => {
  assert.equal(cleanTitle("Citation - Wikipedia", "Wikimedia Foundation, Inc.", "wikipedia"), "Citation");
});

test("Latin first-last without comma, as typed in the editor", () => {
  assert.deepEqual(parseName("Jane Doe"), { family: "Doe", given: "Jane" });
});

test("normalizeDate handles Japanese and ISO forms", async () => {
  const { normalizeDate } = await import("../public/names.js");
  assert.equal(normalizeDate("2024年1月5日"), "2024-01-05");
  assert.equal(normalizeDate("2024年3月"), "2024-03");
  assert.equal(normalizeDate("2024/3/5"), "2024-03-05");
  assert.equal(normalizeDate("2024-03-05T10:00:00+09:00"), "2024-03-05");
  assert.equal(normalizeDate("garbage"), "");
});

test("decodeEntities", async () => {
  const { decodeEntities } = await import("../public/names.js");
  assert.equal(decodeEntities("HTML &lt;time&gt; &amp; &#x3042;&#12354; &unknown;"), "HTML <time> & ああ &unknown;");
});
