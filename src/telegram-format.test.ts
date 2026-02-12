import test from "node:test";
import assert from "node:assert/strict";

import {
  convertTelegramMarkdownToHtml,
  validateTelegramHtmlInputForParseMode
} from "./runtime.js";

test("markdown subset conversion escapes raw html and formats supported tokens", () => {
  const input = "# Title\nHello **bold** and _italic_ and ~~done~~ and `x<y` [docs](https://example.com/path?a=1&b=2) <script>";
  const html = convertTelegramMarkdownToHtml(input);

  assert.match(html, /<b>Title<\/b>/);
  assert.match(html, /<b>bold<\/b>/);
  assert.match(html, /<i>italic<\/i>/);
  assert.match(html, /<s>done<\/s>/);
  assert.match(html, /<code>x&lt;y<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com\/path\?a=1&amp;b=2">docs<\/a>/);
  assert.match(html, /&lt;script&gt;/);
});

test("markdown keeps unsupported links as plain text", () => {
  const input = "[bad](javascript:alert(1))";
  const html = convertTelegramMarkdownToHtml(input);

  assert.equal(html, "[bad](javascript:alert(1))");
});

test("html validator allows safe subset", () => {
  assert.doesNotThrow(() => {
    validateTelegramHtmlInputForParseMode("<b>Done</b> <a href=\"https://example.com\">open</a>");
  });
});

test("html validator blocks unsafe tags and attributes", () => {
  assert.throws(
    () => validateTelegramHtmlInputForParseMode("<script>alert(1)</script>"),
    /Unsupported HTML tag/
  );
  assert.throws(
    () => validateTelegramHtmlInputForParseMode("<a href=\"https://example.com\" onclick=\"x\">x</a>"),
    /Event handler attributes are not allowed/
  );
});
