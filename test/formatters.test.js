import { test } from "node:test";
import assert from "node:assert/strict";
import { format, toPlain } from "../public/formatters.js";

const web = {
  type: "webpage", title: "How to cite a website", siteName: "Example Blog",
  authors: [{ family: "Smith", given: "John Albert" }, { family: "Doe", given: "Jane" }],
  date: "2024-03-05", url: "https://example.com/post",
};
const art = {
  type: "article", title: "A study of things", journal: "Journal of Stuff", volume: "12", issue: "3", pages: "45-67",
  authors: [{ family: "Lee", given: "Anna" }], date: "2021-06", doi: "10.1000/xyz123", url: "https://doi.org/10.1000/xyz123",
};

test("APA web page", () => {
  assert.equal(toPlain(format("apa", web)), "Smith, J. A., & Doe, J. (2024, March 5). How to cite a website. Example Blog. https://example.com/post");
});
test("APA article", () => {
  assert.equal(toPlain(format("apa", art)), "Lee, A. (2021). A study of things. Journal of Stuff, 12(3), 45-67. https://doi.org/10.1000/xyz123");
});
test("APA no author / no date", () => {
  const c = { ...web, authors: [], date: "" };
  assert.equal(toPlain(format("apa", c)), "How to cite a website. (n.d.). Example Blog. https://example.com/post");
});
test("MLA web page", () => {
  assert.equal(toPlain(format("mla", web, "2025-01-02")), "Smith, John Albert, and Jane Doe. “How to cite a website.” Example Blog, 5 Mar. 2024, example.com/post. Accessed 2 Jan. 2025.");
});
test("Harvard web page", () => {
  assert.equal(toPlain(format("harvard", web, "2025-01-02")), "Smith, J. A. and Doe, J. (2024) How to cite a website. Example Blog. Available at: https://example.com/post (Accessed: 2 January 2025).");
});
test("IEEE web page", () => {
  assert.equal(toPlain(format("ieee", web, "2025-01-02")), "J. A. Smith and J. Doe, “How to cite a website,” Example Blog, Mar. 5, 2024. [Online]. Available: https://example.com/post (accessed Jan. 2, 2025).");
});
test("Chicago web page", () => {
  assert.equal(toPlain(format("chicago", web, "2025-01-02")), "Smith, John Albert, and Jane Doe. “How to cite a website.” Example Blog. March 5, 2024. https://example.com/post.");
});
test("BibTeX", () => {
  assert.match(format("bibtex", art), /^@article\{Lee2021,[\s\S]*pages = \{45--67\}/);
});

test("Japanese style and CJK names", () => {
  const c = { type: "webpage", title: "引用の書き方", siteName: "例ブログ", authors: [{ family: "山田", given: "太郎" }], date: "2023-04-01", url: "https://example.jp/a" };
  assert.equal(toPlain(format("ja", c, "2025-01-02")), "山田太郎 (2023) 「引用の書き方」『例ブログ』https://example.jp/a (閲覧日: 2025年1月2日)");
  assert.equal(toPlain(format("apa", c)), "山田太郎. (2023, April 1). 引用の書き方. 例ブログ. https://example.jp/a".replace("引用の書き方.", "引用の書き方."));
});

test("Chicago footnote", () => {
  assert.equal(toPlain(format("note", web, "2025-01-02")), "John Albert Smith and Jane Doe, “How to cite a website,” Example Blog, March 5, 2024, https://example.com/post.");
  assert.equal(toPlain(format("note", art)), "Anna Lee, “A study of things,” Journal of Stuff 12, no. 3 (2021): 45-67, https://doi.org/10.1000/xyz123.");
});
test("BibTeX arXiv eprint", () => {
  const c = { type: "webpage", title: "T", siteName: "arXiv", arxiv: "1706.03762", authors: [{ family: "A", given: "B" }], date: "2017-06-12", url: "https://arxiv.org/abs/1706.03762" };
  assert.match(format("bibtex", c, "2025-01-02"), /eprint = \{1706\.03762\}[\s\S]*archiveprefix = \{arXiv\}/);
});

test("SIST02", () => {
  const c = { type: "webpage", title: "引用の書き方", siteName: "例ブログ", authors: [{ family: "山田", given: "太郎" }, { family: "Smith", given: "John" }], date: "2023-04-01", url: "https://example.jp/a" };
  assert.equal(toPlain(format("sist", c, "2025-01-02")), "山田太郎, Smith, J. 引用の書き方. 例ブログ. 2023-04-01. https://example.jp/a, (参照 2025-01-02).");
  assert.equal(toPlain(format("sist", { ...art, authors: [{ family: "山田", given: "太郎" }] })), "山田太郎. A study of things. Journal of Stuff. 2021, 12(3), pp.45-67. https://doi.org/10.1000/xyz123.");
});

test("SIST02 without URL does not leave stray punctuation", () => {
  const c = { type: "webpage", title: "題", siteName: "", authors: [], date: "", url: "" };
  assert.equal(toPlain(format("sist", c, "2025-01-02")), "題. (参照 2025-01-02).");
  assert.equal(toPlain(format("sist", c)), "題.");
});
