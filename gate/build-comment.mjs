#!/usr/bin/env node
// Builds the Quality Gate comment body (status table + failure section +
// optional coverage table) from gate/action.yml's inputs, passed in as
// env vars since this runs as a plain `node` step inside the composite
// action rather than an actions/github-script block.
import fs from "node:fs";

import { buildFailureSection } from "./quality-summary.mjs";

const icon = (result) =>
  result === "success"
    ? "✅"
    : result === "skipped"
      ? "⚪"
      : result === "cancelled"
        ? "⚠️"
        : "❌";

const title = process.env.TITLE || "Quality Gate";
const runUrl = process.env.RUN_URL || "";
const prefix = process.env.ARTIFACT_PREFIX || "ci-results-";
const coveragePath = process.env.COVERAGE_PATH || "";

const statusRows = (process.env.STATUS || "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const eq = line.indexOf("=");
    return eq === -1 ? [line, "unknown"] : [line.slice(0, eq), line.slice(eq + 1)];
  });

const failureSection = buildFailureSection("ci-results", { prefix });

let coverageSection = "";
if (coveragePath) {
  try {
    const { total } = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
    const pct = (m) => `${m.pct}% (${m.covered}/${m.total})`;
    coverageSection = [
      "### Coverage",
      "",
      "| Metric | Coverage |",
      "| --- | --- |",
      `| Statements | ${pct(total.statements)} |`,
      `| Branches | ${pct(total.branches)} |`,
      `| Functions | ${pct(total.functions)} |`,
      `| Lines | ${pct(total.lines)} |`,
    ].join("\n");
  } catch {
    coverageSection = "_Coverage report unavailable._";
  }
}

const body = [
  `## ${title}`,
  "",
  "| Check | Result |",
  "| --- | --- |",
  ...statusRows.map(([label, result]) => `| ${label} | ${icon(result)} |`),
  "",
  ...(failureSection ? [failureSection, ""] : []),
  ...(coverageSection ? [coverageSection, ""] : []),
  ...(runUrl ? [`[Full run](${runUrl})`] : []),
].join("\n");

console.log(body);
