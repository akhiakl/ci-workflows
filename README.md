# ci-workflows

Shared GitHub Actions used by akhiakl's repos to run quality checks
(lint/typecheck/test/build/...) and post one sticky "Quality Gate" PR
comment summarizing what failed and why, without anyone needing to open
the Actions run.

This repo is **private**. For another `akhiakl` repo to use these
actions, enable Settings → Actions → General → Access →
"Accessible from repositories owned by akhiakl" on this repo.

## Two actions

### `akhiakl/ci-workflows@v1` — run and capture one check

Runs a command, tees its output to a log file, and records the step's
outcome into `<log-dir>/outcomes.json`. Put `continue-on-error: true` on
the step that calls it, so your job keeps running the rest of its checks
after one fails.

```yaml
jobs:
  verify:
    strategy:
      matrix:
        version: [22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/setup@v3
        with:
          runtime: node@${{ matrix.version }}

      - uses: akhiakl/ci-workflows@v1
        id: lint
        continue-on-error: true
        with:
          name: lint
          run: pnpm run lint

      - uses: akhiakl/ci-workflows@v1
        id: typecheck
        continue-on-error: true
        with:
          name: typecheck
          run: pnpm run typecheck

      - uses: akhiakl/ci-workflows@v1
        id: test
        continue-on-error: true
        with:
          name: test
          run: pnpm run test:coverage --reporter=default --reporter=json --outputFile.json=ci-results/test-results.json

      - uses: akhiakl/ci-workflows@v1
        id: build
        continue-on-error: true
        with:
          name: build
          run: pnpm run build

      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: ci-results-node-${{ matrix.version }}
          path: ci-results/
          if-no-files-found: warn

      - name: Fail if any check failed
        if: steps.lint.outcome == 'failure' || steps.typecheck.outcome == 'failure' || steps.test.outcome == 'failure' || steps.build.outcome == 'failure'
        run: exit 1
```

Known step `name`s get a nicer label and structured per-tool failure
parsing in the comment (see `gate/quality-summary.mjs`'s `STEPS` table:
`install`, `lint`, `codegen`, `typecheck`, `test`, `coverage`, `build`,
`migrate`, `e2e`). An unlisted name still works, just falls back to a
plain log tail named after itself.

### `akhiakl/ci-workflows/gate@v1` — post the PR comment

Downloads the `ci-results-*` artifacts every `verify`/`e2e` leg uploaded,
builds the failure section, and posts/updates one sticky comment.

```yaml
jobs:
  quality-gate:
    needs: [verify, e2e]
    if: always() && github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/download-artifact@v8
        continue-on-error: true
        with:
          name: coverage-summary
          path: coverage

      - uses: akhiakl/ci-workflows/gate@v1
        with:
          marker: '<!-- myrepo-quality-gate -->'
          title: Quality Gate
          coverage-summary-path: coverage/coverage-summary.json
          status: |
            Lint, Typecheck & Test (Node 22 & 24)=${{ needs.verify.result }}
            End-to-End Tests=${{ needs.e2e.result }}

      - name: Fail if verify or e2e failed
        if: needs.verify.result != 'success' || needs.e2e.result != 'success'
        run: exit 1
```

## Layout

```
action.yml                 # run-check composite action
gate/
  action.yml                # quality-gate composite action
  build-comment.mjs          # assembles the comment body from gate/action.yml's inputs
  quality-summary.mjs        # parsing: ESLint, tsc, Jest/Vitest JSON reporter, Playwright
  quality-summary.test.mjs
```

## Versioning

Consumers should pin a tag (`@v1`) or commit SHA, not `@main`. Move the
`v1` tag forward as changes land here, or cut `v2` for a breaking change
to either action's inputs.
