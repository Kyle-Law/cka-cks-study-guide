# Study guides site

A static, dependency-free study site in `site/`. Open `site/index.html` (CKA), `site/cks.html` (CKS) or `site/go.html` (Go learning path) directly in a browser, or serve with `python3 -m http.server -d site`. There is no build step, no npm and no framework.

## How it works

- `site/js/app.js` is a course-agnostic engine. Each page sets `window.COURSE` (title, domain `order`, home-page HTML, footer, `id`) and loads that course's data before `app.js`.
- Data globals: `COURSE_DOMAINS` (domains → topics), `COURSE_BASICS` (per-topic intro), `COURSE_QUIZZES` (per-topic quiz), `COURSE_VISUALS` (per-topic diagram).
- localStorage keys are `<course.id>-done`, `-quiz` and `-notes`. The theme key `cka-theme` is shared by all courses on purpose. Don't rename keys: users have saved notes under them.
- Optional `COURSE` fields `intro`, `howto` (HTML `<li>` items), `weightLabel` (default `of exam`) and `detailsLabel` (default `Exam details`) replace the exam wording; the Go course uses them because it is a learning path, not an exam.
- Every topic page shows: My notes → 1. Key learning points (nutshell, diagram, key ideas, collapsible "Exam details") → 2. Labs → 3. Official docs → 4. Quiz.

### Topic shape

```js
{
  id: 'cs-netpol', title: '…',
  basics: { summary: '2–3 plain-English sentences', ideas: ['4–5 short bullets, **bold term**: explanation'] },
  points: ['detailed exam-level bullets'],        // shown folded under "Exam details"
  labs: [{ title, tags?: ['kubeadm VMs'|'CNI'], goal, steps: [['description', 'commands or empty']], verify, cleanup? }],
  refs: [['Link text', 'https://…']],             // prefer official docs
  quiz: [{ q, o: ['CORRECT ANSWER FIRST', 'wrong', 'wrong', 'wrong'], why }]   // exactly 5 questions, 4 unique options; shuffled at display time
}
```

- CKA keeps these parts in separate files: `site/js/data/<domain>.js` (topics), `site/js/data/basics.js`, `site/js/quiz/<domain>.js`, `site/js/data/visuals.js`, `site/js/data/course.js`.
- CKS keeps each topic's parts together: `site/js/cks/{setup,system,supply}.js` call `COURSE.addDomain({...})` (defined in `site/js/cks/course.js`), which moves `basics` and `quiz` into the shared maps. **Use the CKS pattern for new courses.** The Go course follows it: `site/js/go/{course,fundamentals,interfaces,concurrency,networking,k8s,operators,visuals}.js`.
- Inline text supports `` `code` `` and `**bold**` only (see `inline()` in `app.js`).

### Diagrams

- `site/js/svg.js` exposes `window.SVGKIT = { B, A, R, D, P, G, T, Steps, S }`:
  - `B(x,y,w,h,title,subs,kind)` box; kind is `''|acc|ok|bad|ghost`
  - `A(x1,y1,x2,y2,label,kind)` arrow; kind may include `ok|bad|both`
  - `R(a,b)` right-edge→left-edge arrow; `D(a,b)` bottom→top arrow; `P(points,label)` polyline arrow
  - `G` dashed group; `T(x,y,text,kind)` free text, kind `h|code|mid|end`; `Steps(x,y,w,[[title,subs]])` numbered timeline
  - `S(height, items)` wraps everything in a 760-wide SVG
- Colours come from CSS tokens, so diagrams follow light/dark mode automatically. Never hard-code colours.
- See `site/js/data/visuals.js` for 27 examples. Each entry is `V[topicId] = { caption, svg: S(h, [...]) }`, assigned to `window.COURSE_VISUALS`.
- Keep text inside boxes (about 7px per character at 12px, 8px at 14px bold). Avoid arrow labels on steep diagonals; put that information in a box sub-line instead.

## Status and remaining work

Done: CKS diagrams (`site/js/cks/visuals.js`, one per topic), and the Go course (`site/go.html`, 6 phases, 26 topics including 6 milestone projects, each with a diagram). "Go" is in the course switcher on all three pages.

Still to do:

1. **Check links from an unrestricted network.** The sandbox these changes were made in blocked most documentation hosts. Verified 200: GitHub pages, ubuntu.com, pkg.go.dev, dl.k8s.io and the lab download URLs. Not yet verified: 85 of 91 CKS reference links and 77 of 124 Go links (kubernetes.io, go.dev, falco.org, istio.io, grpc.io, book.kubebuilder.io, …). Extract the URLs from `site/js/cks/*.js` and `site/js/go/*.js` and fix any that don't return 200 (`curl -sL -o /dev/null -w '%{http_code}'`).
2. **Run the cluster labs on kind.** Every Go lab was run, and its output compared with the Verify line. Labs tagged `kind cluster` ran against an envtest API server (kube-apiserver + etcd, no kubelet), because nested containers don't work in that sandbox. So Pods never started there: the client-go list showed `ready=0`, and podwatch's failure detection was checked by patching Pod status by hand. Re-run phases 5–6 on a real kind cluster to confirm the running-Pod parts of the Verify lines.
3. **Keep versions current.** Go labs pin `protoc` 32.1 and kubebuilder 4.16.0 and use `@latest` for Go modules; recent gRPC and Kubernetes modules need Go ≥ 1.25.

### Testing Go labs

Each lab's step commands form a bash script: steps whose description starts with "Reference layout" are file trees, not commands. Run a lab's steps in a fresh `HOME` and compare the output with its `verify` text; also run `gofmt -l` and `go vet ./...` on the result. Write `\\n` (not `\n`) inside Go strings in the JS template literals, and escape Go backticks (struct tags, raw strings) as `` \` ``.

## Verification before you finish

- Data check with node (no browser needed): every topic has non-empty `points`/`labs`/`refs`, `basics`, exactly 5 quiz questions with 4 unique options, and a visual. Use the validation snippets in the git history or write a small `node -e` loader that defines `global.window = {}` and `global.COURSE`.
- `node --check site/js/app.js`.
- Render each page headlessly if Chrome is available (`--headless=new --dump-dom` / `--screenshot`), and look at the diagrams in both themes (`document.documentElement.dataset.theme = 'dark'`).
- Check external links return 200.
