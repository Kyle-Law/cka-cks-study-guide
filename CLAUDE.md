# Study guides site

A static, dependency-free study site in `site/`. Open `site/index.html` (CKA) or `site/cks.html` (CKS) directly in a browser, or serve with `python3 -m http.server -d site`. There is no build step, no npm and no framework.

## How it works

- `site/js/app.js` is a course-agnostic engine. Each page sets `window.COURSE` (title, domain `order`, home-page HTML, footer, `id`) and loads that course's data before `app.js`.
- Data globals: `COURSE_DOMAINS` (domains → topics), `COURSE_BASICS` (per-topic intro), `COURSE_QUIZZES` (per-topic quiz), `COURSE_VISUALS` (per-topic diagram).
- localStorage keys are `<course.id>-done`, `-quiz` and `-notes`. The theme key `cka-theme` is shared by all courses on purpose. Don't rename keys: users have saved notes under them.
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
- CKS keeps each topic's parts together: `site/js/cks/{setup,system,supply}.js` call `COURSE.addDomain({...})` (defined in `site/js/cks/course.js`), which moves `basics` and `quiz` into the shared maps. **Use the CKS pattern for new courses.**
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

## Remaining work (handoff)

1. **CKS diagrams.** Create `site/js/cks/visuals.js` with one diagram per CKS topic (26 ids, listed by `grep -o "id: '[a-z-]*'" site/js/cks/*.js`), using `SVGKIT`, and add `<script src="js/cks/visuals.js"></script>` to `site/cks.html` before `app.js`. Ideas: default-deny + allowed paths (cs-netpol), kube-bench flow (cs-cis), TLS termination at the Ingress (cs-ingress-tls), Pod → metadata IP blocked and kubelet auth (cs-metadata), checksum verify branch OK/FAILED (cs-binaries), dangerous RBAC permissions grid (ch-rbac), token mounted vs automount off (ch-sa), authn → authz → admission pipeline (ch-api), supported-version window N…N-3 (ch-upgrade), bloated vs minimal node (sh-footprint), identity layers cloud/Linux/K8s/container (sh-iam), firewall in front of the cluster (sh-network), syscall → seccomp → AppArmor → kernel (sh-kernel), privileged/baseline/restricted ladder + enforce/warn/audit (mv-pss), Secret write path with and without encryption (mv-secrets), runc vs gVisor vs Kata kernel boundary (mv-isolation), WireGuard vs sidecar mTLS (mv-mtls), image size comparison + multi-stage (sc-base), supply chain steps with risks (sc-understand), sign → registry → admission verify (sc-secure), which scanner checks what (sc-static), Falco architecture (rt-behavior), 4C layers with signal sources (rt-detect), attack phases chain (rt-attack), read-only root + emptyDirs (rt-immutable), audit policy first-match → log → jq (rt-audit).
2. **Check CKS links.** Extract every URL from `site/js/cks/*.js` and fix any that don't return 200 (`curl -sL -o /dev/null -w '%{http_code}'`).
3. **Go curriculum.** Add a third course, `site/go.html` + `site/js/go/*.js` (`COURSE.id = 'go'`), and add "Go" to the `.courses` switcher in all three HTML headers. Six domains = the six phases below. Use `weight` for a rough share of study time, so the cards and sidebar still show a %. The `title`/`name`/home text should talk about a learning path, not an exam. Each sub-topic is a topic with the full shape above. Labs are hands-on coding exercises (runnable `go` snippets with expected output); each phase also has its **milestone project** as a final topic (or as the last lab of the phase), with step-by-step build instructions, a reference file layout, and a "Verify" line. Refs: go.dev docs, pkg.go.dev, Go Tour, Effective Go, Kubernetes/client-go/kubebuilder docs. Quizzes test Go semantics (e.g. nil maps, slice aliasing, loop-variable capture, unbuffered channel blocking, `defer` order, interface nil-ness).
   - Phase 1, Go Fundamentals & Idioms: syntax & types (variables, primitives, slices, maps, structs); control flow (for, if/else, switch, defer); pointers (addresses, pass-by-value vs reference); error handling (`if err != nil`, why no exceptions). Milestone: CLI tool (stdlib `flag` or spf13/cobra) that reads a YAML config file and prints it.
   - Phase 2, Interfaces & OO patterns: methods; interfaces as implicit duck typing (io.Reader/io.Writer, how Kubernetes decouples the API server from etcd storage); type assertions & empty interfaces (`interface{}`/`any`, safe conversion). Milestone: mock API server where an in-memory map store and a JSON-file store implement the same `Store` interface.
   - Phase 3, Cloud-native core, concurrency & context: goroutines; channels; sync (WaitGroup, Mutex, RWMutex); `context` (values, cancellation, deadlines; `ctx context.Context` everywhere in K8s). Milestone: concurrent worker pool fetching many HTTP endpoints with a global `context.WithTimeout`.
   - Phase 4, Networking & RPC: net/http servers and clients; JSON/YAML processing; Protobuf & gRPC (used by Istio, containerd, Kubernetes). Milestone: gRPC client streaming "metrics" to a server that aggregates them.
   - Phase 5, Bridging Go and Kubernetes: client-go (list Pods/Deployments, watch events); informers & caches; CRDs. Milestone: client-go program that watches the cluster and logs every Pod failure or crash.
   - Phase 6, Operators & CNCF architecture: controller pattern (observe → analyze → act reconcile loop); Kubebuilder / Operator SDK; reading CNCF code (kubelet / ReplicaSet controller, istiod watching Services to build Envoy config, Cilium turning NetworkPolicies into eBPF). Milestone: Kubebuilder operator that injects a sidecar container or labels into Deployments based on a custom resource.
   - Give every Go topic a diagram too (e.g. slice header → backing array, stack vs heap pointers, interface value = type + data, goroutines/channels fan-out, context cancellation tree, gRPC streaming, informer → cache → workqueue → reconcile).

## Verification before you finish

- Data check with node (no browser needed): every topic has non-empty `points`/`labs`/`refs`, `basics`, exactly 5 quiz questions with 4 unique options, and a visual. Use the validation snippets in the git history or write a small `node -e` loader that defines `global.window = {}` and `global.COURSE`.
- `node --check site/js/app.js`.
- Render each page headlessly if Chrome is available (`--headless=new --dump-dom` / `--screenshot`), and look at the diagrams in both themes (`document.documentElement.dataset.theme = 'dark'`).
- Check external links return 200.
