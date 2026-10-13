import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, parseName, splitAuthors } from "../src/index.js";

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
