/// <reference lib="dom" />

import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { renderExplorerArtifact } from "../../src/core/explorer";
import { EXPLORER_QUALIFICATION_BUDGETS } from "../../src/core/explorer-qualification";
import {
  buildLargeExplorerFixture,
  corruptExplorerFixture,
  emptyExplorerFixture,
  loadSmallExplorerFixture,
  staleExplorerFixture,
} from "../support/explorer-browser-fixture";

const smallFixture = loadSmallExplorerFixture();
const smallHtml = renderExplorerArtifact(smallFixture);
const largeHtml = renderExplorerArtifact(buildLargeExplorerFixture());

test("KBD-01 and SR-01 provide complete keyboard and semantic detail flows", async ({ page }) => {
  await page.setContent(smallHtml, { waitUntil: "domcontentloaded" });
  await page.locator(".skip-link").focus();
  await expect(page.locator(".skip-link")).toBeFocused();
  await expect(page.locator(".skip-link")).toHaveAttribute("href", "#records");
  await page.keyboard.press("Enter");
  await expect(page.locator("#records")).toBeFocused();
  await expect(page.getByRole("listbox", { name: "Graph records" })).toBeVisible();
  await page.getByLabel("Type").selectOption("Spec");
  await page.getByRole("checkbox", { name: "concept" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "concept" })).toBeChecked();
  await page.locator("#search").fill("spec");
  const options = page.locator('#nodes [role="option"]');
  await options.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#announcement")).toContainText(/concept|task|repository/u);
  await expect(page.locator("#announcement")).toContainText(/inbound.*outbound.*position/u);
  await page.getByRole("button", { name: /focus this record/iu }).click();
  const selectedKey = await page.locator('[role="option"][aria-selected="true"]').getAttribute("data-record-key");
  await page.getByRole("button", { name: /close details/iu }).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-record-key="${selectedKey}"]`)).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Select a record to inspect provenance and relationships.")).toBeVisible();
});

test("COLOR-01, RESPONSIVE-01, and MOTION-01 retain non-color cues at 320px and 200% zoom", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setContent(smallHtml, { waitUntil: "domcontentloaded" });
  await page.getByRole("option").filter({ hasText: "New specification" }).click();
  await expect(page.locator(".relation-cue").first()).toContainText(/neighbor/u);
  await expect(page.locator(".flag").first()).toContainText(/dangling|duplicate|supersession/u);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    transitionSeconds: Number.parseFloat(
      getComputedStyle(document.querySelector(".panel") as Element).transitionDuration,
    ),
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.transitionSeconds).toBeLessThanOrEqual(0.00001);
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator("#details")).toBeVisible();
});

test("EMPTY-01, CORRUPT-01, and STALE-01 expose safe graph health behavior", async ({ page }) => {
  await page.setContent(renderExplorerArtifact(emptyExplorerFixture()), { waitUntil: "domcontentloaded" });
  await expect(page.locator("#status-heading")).toHaveText("Empty snapshot");
  await expect(page.locator("#status-heading")).toBeFocused();
  await expect(page.locator("#nodes")).toBeHidden();
  await expect(page.locator("#search")).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "concept" })).toBeDisabled();
  await expect(page.locator("#counts")).toContainText(/lore sync/u);

  await page.goto("about:blank");
  await page.setContent(renderExplorerArtifact(corruptExplorerFixture()), { waitUntil: "domcontentloaded" });
  await expect(page.locator("#status-heading")).toHaveText("Corrupt snapshot");
  await expect(page.locator("#nodes")).toBeHidden();
  await expect(page.locator("#counts")).toContainText(/rebuild/iu);
  await expect(page.locator("#counts")).toContainText("explorer.snapshot.corrupt");
  await expect(page.getByRole("button", { name: /delete|repair/u })).toHaveCount(0);

  await page.goto("about:blank");
  await page.setContent(renderExplorerArtifact(staleExplorerFixture()), { waitUntil: "domcontentloaded" });
  await expect(page.locator("#status-heading")).toHaveText("Stale snapshot");
  await expect(page.locator("#provenance")).toContainText(smallFixture.source.gitCommit ?? "uncommitted");
  await expect(page.locator("#provenance")).toContainText(smallFixture.source.exportDigest);
  await expect(page.locator("#health")).toContainText("explorer.refresh.failed");
  await expect(page.locator("#nodes")).toBeVisible();
});

test("offline artifact is reproducible, credential-free, and makes zero network requests", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.setContent(smallHtml, { waitUntil: "load" });
  expect(requests).toEqual([]);
  expect(smallHtml).toContain("connect-src 'none'");
  expect(smallHtml).not.toMatch(/<(?:script|img)[^>]+src=|<link[^>]+href=/iu);
  expect(smallHtml).not.toMatch(/databasePassword|neo4j:\/\/|\/Users\/|\/home\//u);
  expect(renderExplorerArtifact(loadSmallExplorerFixture())).toBe(smallHtml);
});

test("SCALE-01 meets frozen load, interaction, mount, artifact, and memory budgets", async ({ page }) => {
  expect(Buffer.byteLength(largeHtml)).toBeLessThanOrEqual(EXPLORER_QUALIFICATION_BUDGETS.artifactBytes);
  const loadStarted = performance.now();
  await page.setContent(largeHtml, { waitUntil: "domcontentloaded" });
  expect(performance.now() - loadStarted).toBeLessThanOrEqual(EXPLORER_QUALIFICATION_BUDGETS.loadMilliseconds);
  await expect(page.locator("#counts")).toContainText("750 of 6001 matching records");

  const initialMeasurements = await page.evaluate(() => {
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      mountedElements: document.getElementsByTagName("*").length,
      // Firefox/WebKit do not expose performance.memory. UTF-16 serialized DOM
      // bytes are the deterministic portable proxy there; Chromium also
      // enforces its actual used JS heap below.
      memoryBytes: memory.memory?.usedJSHeapSize ?? document.documentElement.outerHTML.length * 2,
    };
  });
  expect(initialMeasurements.mountedElements).toBeLessThanOrEqual(EXPLORER_QUALIFICATION_BUDGETS.mountedElements);
  expect(initialMeasurements.memoryBytes).toBeLessThanOrEqual(EXPLORER_QUALIFICATION_BUDGETS.heapBytes);

  const selectionMilliseconds = await page.evaluate(() => {
    const start = performance.now();
    (document.querySelector('#nodes [role="option"]') as HTMLButtonElement).click();
    return performance.now() - start;
  });
  expect(selectionMilliseconds).toBeLessThanOrEqual(EXPLORER_QUALIFICATION_BUDGETS.interactionMilliseconds);

  const searchMilliseconds = await page.evaluate(() => {
    const start = performance.now();
    const search = document.getElementById("search") as HTMLInputElement;
    search.value = "concept-04999";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    return performance.now() - start;
  });
  expect(searchMilliseconds).toBeLessThanOrEqual(EXPLORER_QUALIFICATION_BUDGETS.interactionMilliseconds);
  await expect(page.locator("#counts")).toContainText("1 of 1 matching records");
});
