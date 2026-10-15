// One diagram per Go topic, drawn as inline SVG so it follows the light/dark theme (see .visual rules in style.css).
(function () {
  const { B, A, R, D, P, G, T, Steps, S } = window.SVGKIT;

  const V = {};

  // ---------- Phase 1: Fundamentals ----------
  {
    const a = B(10, 40, 170, 70, 'a := []int{…}', ['ptr → [0]', 'len 4 · cap 4'], 'acc');
    const b = B(10, 140, 170, 70, 'b := a[1:3]', ['ptr → [1]', 'len 2 · cap 3']);
    const cells = [1, 99, 3, 4].map((v, i) => B(280 + i * 115, 110, 100, 50, String(v), [`[${i}]`], i === 1 ? 'ok' : ''));
    V['go-syntax'] = {
      caption: 'A slice is a small header pointing into a backing array. Slicing shares the array, so `b[0] = 99` changes `a[1]`.',
      svg: S(250, [a, b, G(260, 80, 490, 110, 'backing array (shared)'), ...cells,
        P([[180, 75], [230, 75], [230, 135], [280, 135]]), P([[180, 175], [445, 175], [445, 160]]),
        T(10, 238, 'append(b, x) within cap writes into this array; beyond cap it copies to a new one.')])
    };
  }
  {
    const code = ['for i := 0; i < 3; i++ {', '    defer fmt.Println(i)', '}', 'fmt.Println("loop done")', 'return'];
    const stack = [2, 1, 0].map((n, i) => B(320, 50 + i * 58, 160, 48, `Println(${n})`, [], i === 0 ? 'acc' : ''));
    V['go-control'] = {
      caption: 'Each `defer` pushes a call onto a stack. When the function returns, the calls run last in, first out.',
      svg: S(275, [...code.map((c, i) => T(10, 70 + i * 26, c, 'code')), G(300, 20, 200, 220, 'defer stack (LIFO)'), ...stack,
        A(500, 130, 560, 130, 'return'),
        B(560, 40, 190, 180, 'Output', ['loop done', '2', '1', '0'], 'ok'),
        T(10, 262, 'Arguments are evaluated at the defer statement · deferred calls run even during a panic')])
    };
  }
  {
    const c = B(30, 40, 150, 56, 'c Counter', ['N: 1 · at 0xc000']);
    const cp = B(200, 40, 140, 56, 'incValue(c)', ['gets a copy'], 'bad');
    const ptr = B(200, 115, 140, 56, 'incPointer(&c)', ['*Counter = 0xc000'], 'ok');
    const p = B(30, 160, 150, 56, 'p *Counter', ['= newCounter()']);
    const h = B(480, 90, 230, 64, 'Counter{N: 11}', ['moved to heap (escaped)'], 'acc');
    V['go-pointers'] = {
      caption: 'Arguments are copied. A pointer copies the address, so the callee changes the original. Values that outlive their function move to the heap.',
      svg: S(250, [G(10, 10, 350, 230, 'Stack (main and its calls)'), G(400, 10, 350, 230, 'Heap (garbage-collected)'), c, cp, ptr, p, h,
        R(c, cp, '', 'bad'), A(200, 130, 140, 96, '', 'ok'),
        P([[180, 205], [595, 205], [595, 154]])])
    };
  }
  {
    const e1 = B(10, 40, 230, 64, 'fmt.Errorf(… %w …)', ['load config app.yaml: …'], 'acc');
    const e2 = B(270, 40, 220, 64, '*fs.PathError', ['op: open, path: app.yaml']);
    const e3 = B(520, 40, 230, 64, 'syscall.ENOENT', ['no such file or directory']);
    V['go-errors'] = {
      caption: 'Wrapping with `%w` builds a chain. `errors.Is` and `errors.As` walk the whole chain, so context never hides the cause.',
      svg: S(270, [T(10, 24, 'ERROR CHAIN (EACH WRAPS THE NEXT; Unwrap() GOES RIGHT)', 'h'), e1, e2, e3, R(e1, e2), R(e2, e3),
        B(10, 140, 360, 64, 'errors.Is(err, fs.ErrNotExist)', ['finds ENOENT in the chain → true'], 'ok'),
        B(390, 140, 360, 64, 'errors.As(err, &pathErr)', ['finds *fs.PathError → fills pathErr'], 'ok'),
        T(10, 250, 'if err != nil { return fmt.Errorf("load config %s: %w", path, err) }', 'code')])
    };
  }
  {
    const args = B(10, 40, 130, 64, 'os.Args', ['-config app.yaml', '-format json']);
    const main = B(180, 40, 130, 64, 'main()', ['flag.Parse', 'run()']);
    const load = B(350, 30, 190, 84, 'config.Load', ['os.ReadFile', 'yaml.Unmarshal', 'validate()'], 'acc');
    const out = B(590, 20, 160, 50, 'stdout', ['text or JSON'], 'ok');
    const err = B(590, 90, 160, 50, 'stderr + exit 1', ['wrapped error'], 'bad');
    const tree = ['cfgprint/', '├── main.go', '├── config/config.go', '├── config/config_test.go', '└── testdata/app.yaml'];
    V['go-m1-cli'] = {
      caption: '`main` stays thin: parse flags, call the config package, and turn errors into a message and exit code.',
      svg: S(270, [args, main, load, out, err, R(args, main), R(main, load), A(540, 55, 590, 45, '', 'ok'), A(540, 90, 590, 115, '', 'bad'),
        ...tree.map((l, i) => T(10, 170 + i * 20, l, 'code')),
        B(330, 165, 420, 84, 'type Config struct', ['Name     string `yaml:"name"`', 'Replicas int    `yaml:"replicas"`', 'Labels   map[string]string'], 'ghost')])
    };
  }

  // ---------- Phase 2: Interfaces ----------
  {
    const val = B(10, 40, 350, 64, 'Counter (value)', ['method set: Hits()']);
    const ptr = B(10, 130, 350, 64, '*Counter (pointer)', ['method set: Hits(), Inc()'], 'acc');
    const ifc = B(420, 85, 330, 64, 'var i Incer = …', ['&Counter{} ✓ · Counter{} ✗']);
    const pod = B(30, 250, 330, 64, 'Pod', ['Image · promoted: Name, Key()'], 'acc');
    const meta = B(400, 250, 330, 64, 'Meta', ['Name, Namespace · Key()']);
    V['go-methods'] = {
      caption: 'Pointer-receiver methods belong to `*T` only, which decides who satisfies an interface. Embedding promotes fields and methods.',
      svg: S(340, [val, ptr, ifc, A(360, 72, 420, 105, '', 'bad'), A(360, 162, 420, 130, '', 'ok'),
        G(10, 220, 740, 110, 'Embedding: type Pod struct { Meta; Image string }'), pod, meta, R(pod, meta)])
    };
  }
  {
    const fn = B(10, 90, 180, 64, 'fmt.Fprintf(w, …)', ['only needs Write()']);
    const ifc = B(240, 70, 200, 104, 'io.Writer', ['Write(p []byte)', '(n int, err error)'], 'acc');
    const impls = ['*os.File', '*bytes.Buffer', 'http.ResponseWriter', 'upperWriter{w}'].map((n, i) => B(500, 20 + i * 50, 250, 40, n, []));
    V['go-interfaces'] = {
      caption: 'Code written against a one-method interface works with every type that has that method; no `implements` needed.',
      svg: S(315, [fn, ifc, ...impls, R(fn, ifc), ...impls.map(b => A(440, 122, 500, b.cy)),
        T(10, 236, 'AN INTERFACE VALUE IS A (TYPE, DATA) PAIR', 'h'),
        B(10, 248, 180, 50, 'type', ['*os.File'], 'acc'), B(190, 248, 180, 50, 'data', ['→ the File struct']),
        T(400, 278, 'It is nil only when both halves are nil.')])
    };
  }
  {
    const x = B(10, 104, 150, 64, 'x any', ['from json.Unmarshal']);
    const sw = B(200, 104, 190, 64, 'switch v := x.(type)', [], 'acc');
    const cases = ['case string → v is a string', 'case float64 → every JSON number', 'case map[string]any → object',
      'case []any → array', 'case nil → JSON null'].map((c, i) => B(450, 20 + i * 46, 300, 36, c, []));
    V['go-assert'] = {
      caption: 'A type switch recovers the concrete type from `any`. The comma-ok form tests a single type without risking a panic.',
      svg: S(320, [x, sw, ...cases, R(x, sw), ...cases.map(b => A(390, 136, 450, b.cy)),
        B(10, 250, 360, 56, 'v, ok := x.(int)', ['ok == false, no panic'], 'ok'),
        B(390, 250, 360, 56, 'v := x.(int)', ['panics if x is not an int'], 'bad')])
    };
  }
  {
    const http = B(10, 100, 140, 64, 'HTTP client', ['curl']);
    const api = B(190, 100, 160, 64, 'api.Server', ['handlers']);
    const st = B(400, 100, 150, 64, 'store.Store', ['Get List Put Delete'], 'acc');
    const mem = B(600, 40, 150, 64, 'MemStore', ['map + RWMutex']);
    const file = B(600, 160, 150, 64, 'FileStore', ['pods.json']);
    V['go-m2-store'] = {
      caption: 'Handlers depend only on the `Store` interface, so a flag can swap the backend and one test suite covers both.',
      svg: S(300, [http, api, st, mem, file, R(http, api), R(api, st), A(550, 125, 600, 72), A(550, 140, 600, 192),
        B(190, 230, 160, 56, '-store flag', ['picks the backend'], 'ghost'),
        B(400, 230, 350, 56, 'testStore(t, s Store)', ['TestMemStore and TestFileStore'], 'ok')])
    };
  }

  // ---------- Phase 3: Concurrency ----------
  {
    const gs = [...Array(9).keys()].map(i => B(25 + (i % 3) * 60, 40 + Math.floor(i / 3) * 52, 50, 36, 'G', []));
    const sch = B(260, 80, 160, 64, 'Go scheduler', ['runtime, user space'], 'acc');
    const th = [0, 1, 2].map(i => B(470, 40 + i * 60, 120, 40, `thread ${i + 1}`, []));
    const cpu = [0, 1, 2].map(i => B(630, 40 + i * 60, 120, 40, `CPU ${i + 1}`, [], 'ok'));
    V['go-goroutines'] = {
      caption: 'Thousands of cheap goroutines are multiplexed by the runtime onto a few OS threads (GOMAXPROCS), which run on CPUs.',
      svg: S(275, [G(10, 10, 210, 200, 'goroutines (thousands)'), ...gs, sch, ...th, ...cpu, A(220, 112, 260, 112),
        ...th.map(t => A(420, 112, 470, t.cy)), ...th.map((t, i) => R(t, cpu[i])),
        T(10, 250, 'main: wg.Add(1) → go worker() … wg.Wait() blocks until every worker calls Done()')])
    };
  }
  {
    const g = B(10, 40, 150, 56, 'gen()', ['goroutine']);
    const c1 = B(190, 50, 90, 36, 'chan int', []);
    const sq = B(310, 40, 150, 56, 'square()', ['goroutine']);
    const c2 = B(490, 50, 90, 36, 'chan int', []);
    const m = B(610, 40, 140, 56, 'main', ['for v := range']);
    V['go-channels'] = {
      caption: 'Each stage runs in its own goroutine and closes its output when done, which ends the next stage\'s `range` loop.',
      svg: S(250, [g, c1, sq, c2, m, R(g, c1), R(c1, sq), R(sq, c2), R(c2, m),
        T(10, 122, 'close(out) when a stage is done → the reader\'s range loop ends'),
        T(10, 155, 'UNBUFFERED VS BUFFERED', 'h'),
        B(10, 165, 360, 70, 'make(chan T)', ['send waits for a receiver', 'a hand-off that synchronises'], 'acc'),
        B(390, 165, 360, 70, 'make(chan T, 2)', ['send waits only when 2 are queued', 'receive waits only when empty'])])
    };
  }
  {
    const gs = [0, 1, 2].map(i => B(10, 30 + i * 60, 120, 44, `goroutine ${i + 1}`, []));
    const lock = B(190, 60, 150, 110, 'mu.Lock()', ['one at a time,', 'others wait'], 'acc');
    const shared = B(400, 85, 150, 60, 'm map[string]int', ['shared state']);
    const wait = B(600, 85, 150, 60, 'wg.Wait()', ['until all Done()'], 'ghost');
    V['go-sync'] = {
      caption: 'A Mutex serialises access to shared state; an RWMutex lets readers share while writers get exclusive access.',
      svg: S(305, [...gs, lock, shared, wait, ...gs.map(b => A(130, b.cy, 190, 115)), R(lock, shared, ''), R(shared, wait),
        B(10, 220, 360, 70, 'RWMutex: RLock()', ['many readers at the same time'], 'ok'),
        B(390, 220, 360, 70, 'RWMutex: Lock()', ['one writer, and no readers'])])
    };
  }
  {
    const root = B(300, 20, 160, 50, 'Background()', []);
    const req = B(300, 100, 160, 56, 'WithTimeout', ['request: 5s'], 'acc');
    const c1 = B(60, 200, 180, 56, 'WithCancel', ['DB query']);
    const c2 = B(290, 200, 180, 56, 'WithValue', ['request ID']);
    const c3 = B(520, 200, 180, 56, 'WithTimeout(10s)', ['still ends at 5s']);
    const g = B(290, 290, 180, 50, 'http request', ['NewRequestWithContext']);
    V['go-context'] = {
      caption: 'Contexts form a tree. Cancelling a node, or reaching its deadline, closes `Done()` for every descendant.',
      svg: S(355, [root, req, c1, c2, c3, g, D(root, req), A(380, 156, 150, 200), D(req, c2), A(380, 156, 610, 200), D(c2, g),
        T(510, 305, 'cancel() or deadline →'), T(510, 327, 'every descendant is Done()')])
    };
  }
  {
    const urls = B(10, 90, 130, 90, 'URLs', ['0 /fast', '1 /slow', '2 /fast']);
    const jobs = B(170, 115, 130, 40, 'jobs (chan int)', []);
    const ws = [0, 1, 2].map(i => B(350, 70 + i * 52, 150, 46, `worker ${i + 1}`, ['fetchOne(ctx, url)']));
    const res = B(560, 80, 190, 120, 'results []Result', ['[0] ok', '[1] timed out', '[2] ok'], 'ok');
    V['go-m3-pool'] = {
      caption: 'A fixed number of workers pull job indexes from a channel; one context deadline bounds every request.',
      svg: S(260, [B(10, 10, 740, 40, 'ctx := context.WithTimeout(…, 1s) + signal.NotifyContext (Ctrl-C)', [], 'acc'),
        urls, jobs, ...ws, res, R(urls, jobs), ...ws.map(w => A(300, 135, 350, w.cy)), ...ws.map(w => A(500, w.cy, 560, 140)),
        T(10, 245, 'Each worker writes only results[i] · wg.Wait() before reading · unsent jobs get ctx.Err()')])
    };
  }

  // ---------- Phase 4: Networking ----------
  {
    const cl = B(10, 70, 120, 64, 'client', ['curl / Go']);
    const mw = B(180, 70, 150, 64, 'logging', ['middleware'], 'acc');
    const mux = B(360, 70, 160, 64, 'ServeMux', ['GET /hello/{name}']);
    const h = B(560, 70, 170, 64, 'hello handler', ['r.PathValue("name")'], 'ok');
    V['go-http'] = {
      caption: 'Middleware wraps the router, which picks a handler by method and path. On SIGTERM, Shutdown lets in-flight requests finish.',
      svg: S(235, [G(160, 20, 590, 200, 'http.Server (one goroutine per request)'), cl, mw, mux, h, R(cl, mw), R(mw, mux), R(mux, h),
        B(180, 150, 550, 50, 'SIGTERM → srv.Shutdown(ctx)', ['stop accepting, finish in-flight requests, exit'], 'ghost')])
    };
  }
  {
    const y = B(10, 30, 150, 100, 'YAML', ['kind: Deployment', 'replicas: 0', 'labels: …']);
    const conv = B(200, 50, 150, 60, 'sigs.k8s.io/yaml', ['YAML → JSON'], 'acc');
    const js = B(390, 50, 150, 60, 'encoding/json', ['uses json tags'], 'acc');
    const st = B(580, 30, 170, 100, 'Go struct', ['Kind string', 'Replicas *int32', 'Labels map…']);
    V['go-json'] = {
      caption: 'Kubernetes tooling converts YAML to JSON first, so one set of `json` tags controls both formats.',
      svg: S(265, [y, conv, js, st, R(y, conv), R(conv, js), R(js, st), T(10, 175, 'TAG OPTIONS', 'h'),
        B(10, 185, 240, 64, 'json:"name"', ['sets the key name']),
        B(260, 185, 240, 64, 'json:"x,omitempty"', ['drops zero values']),
        B(510, 185, 240, 64, 'json:"-"', ['never encoded'])])
    };
  }
  {
    const pr = B(10, 30, 150, 64, 'greeter.proto', ['service + messages'], 'acc');
    const pc = B(200, 30, 160, 64, 'protoc', ['+ go, go-grpc plugins']);
    const gen = B(410, 30, 340, 64, 'gen/greeterv1', ['greeter.pb.go · greeter_grpc.pb.go']);
    const cl = B(10, 150, 200, 64, 'client', ['NewGreeterClient(conn)']);
    const sv = B(540, 150, 210, 64, 'server', ['implements GreeterServer'], 'ok');
    V['go-grpc'] = {
      caption: 'The .proto file is the contract. Generated code gives the client a typed stub and the server an interface to implement.',
      svg: S(270, [pr, pc, gen, cl, sv, R(pr, pc), R(pc, gen), A(210, 182, 540, 182, 'HTTP/2 · protobuf', 'both'),
        A(500, 94, 120, 150), A(660, 94, 645, 150),
        T(10, 255, 'Four kinds of RPC: unary · server streaming · client streaming · bidirectional')])
    };
  }
  {
    const a1 = B(10, 40, 150, 56, 'agent node-1', ['Send() × 10']);
    const a2 = B(10, 150, 150, 56, 'agent node-2', ['Send() × 6']);
    const agg = B(300, 70, 200, 110, 'Push(stream)', ['for { Recv() }', 'io.EOF →', 'SendAndClose(summary)'], 'acc');
    const stats = B(560, 40, 190, 70, 'per-stream stats', ['cpu: count min max mean']);
    const total = B(560, 150, 190, 56, 'shared total', ['guarded by a mutex']);
    V['go-m4-grpc-stream'] = {
      caption: 'Each agent streams many samples on one RPC; the server aggregates until `io.EOF`, then replies once.',
      svg: S(260, [a1, a2, agg, stats, total, A(160, 68, 300, 100, '', 'both'), A(160, 178, 300, 150, '', 'both'),
        A(500, 105, 560, 80), A(500, 150, 560, 178),
        T(10, 245, 'Agent: Send() many times, then CloseAndRecv() gets the single Summary back')])
    };
  }

  // ---------- Phase 5: Kubernetes ----------
  {
    const prog = B(10, 90, 140, 64, 'your program', ['main.go']);
    const kc = B(200, 40, 170, 64, 'rest.Config', ['$KUBECONFIG / ~/.kube']);
    const ic = B(200, 140, 170, 64, 'rest.Config', ['InClusterConfig()']);
    const cs = B(420, 90, 150, 64, 'Clientset', ['CoreV1() AppsV1()'], 'acc');
    const api = B(620, 90, 130, 64, 'API server', ['REST']);
    V['go-clientgo'] = {
      caption: 'Load a config (kubeconfig outside, ServiceAccount inside a Pod), build a Clientset, and call typed methods.',
      svg: S(295, [prog, kc, ic, cs, api, A(150, 110, 200, 72), A(150, 135, 200, 172), A(370, 72, 420, 110), A(370, 172, 420, 140), R(cs, api),
        B(10, 230, 240, 50, 'List(ctx, opts)', ['label selectors']), B(260, 230, 240, 50, 'Get / Create / Update', ['IsNotFound, IsConflict']),
        B(510, 230, 240, 50, 'Watch(ctx, opts)', ['ADDED · MODIFIED · DELETED'])])
    };
  }
  {
    const api = B(10, 40, 130, 64, 'API server', []);
    const refl = B(180, 40, 130, 64, 'Reflector', ['List + Watch']);
    const fifo = B(350, 40, 120, 64, 'FIFO queue', ['RealFIFO']);
    const idx = B(510, 40, 240, 64, 'Indexer (cache)', ['read by listers'], 'acc');
    const hd = B(510, 150, 240, 56, 'event handlers', ['Add / Update / Delete']);
    const q = B(270, 250, 180, 56, 'workqueue', ['namespace/name keys'], 'acc');
    const w = B(10, 250, 200, 56, 'worker: reconcile', ['lister.Get(key)'], 'ok');
    V['go-informers'] = {
      caption: 'The informer keeps a local cache up to date; handlers only enqueue keys, and workers read current state from the cache.',
      svg: S(320, [api, refl, fifo, idx, hd, q, w, R(api, refl), R(refl, fifo), R(fifo, idx),
        P([[410, 104], [410, 178], [510, 178]], 'notify'), P([[630, 206], [630, 278], [450, 278]], 'enqueue key'), A(270, 278, 210, 278)])
    };
  }
  {
    const crd = B(10, 40, 190, 64, 'CRD', ['backups.demo.example.com'], 'acc');
    const api = B(250, 30, 260, 84, 'API server', ['new endpoint:', '/apis/demo.example.com/v1/backups']);
    const etcd = B(560, 40, 190, 64, 'etcd', ['stored objects']);
    const kc = B(10, 180, 190, 56, 'kubectl apply', ['Backup YAML']);
    const dyn = B(250, 180, 260, 56, 'dynamic client', ['unstructured.Unstructured']);
    V['go-crds'] = {
      caption: 'Applying a CRD adds a new API endpoint. The API server validates objects against its schema and fills defaults before storing them.',
      svg: S(290, [crd, api, etcd, kc, dyn, R(crd, api), R(api, etcd), A(105, 180, 280, 114), A(380, 180, 380, 114),
        B(560, 170, 190, 76, 'Schema checks', ['retain > 30 → reject', 'default retain: 7'], 'ghost'),
        T(10, 275, 'A CRD stores and validates data; only a controller gives it behaviour.')])
    };
  }
  {
    const inf = B(10, 60, 160, 64, 'Pod informer', ['all namespaces'], 'acc');
    const h = B(210, 60, 170, 64, 'Add / UpdateFunc', ['(old, new *Pod)']);
    const det = B(420, 40, 170, 104, 'detect.Problems', ['phase → Failed', 'restartCount ↑', 'bad waiting reason']);
    const log = B(630, 60, 120, 64, 'log line', ['per change'], 'ok');
    V['go-m5-watcher'] = {
      caption: 'Compare the old and new Pod on every update and log only problems that just appeared.',
      svg: S(275, [inf, h, det, log, R(inf, h), R(h, det), R(det, log), T(10, 182, 'WHERE THE SIGNALS LIVE IN POD STATUS', 'h'),
        B(10, 195, 240, 64, 'status.phase: Failed', ['pod failed']),
        B(260, 195, 240, 64, 'lastState.terminated', ['exit 137 · OOMKilled']),
        B(510, 195, 240, 64, 'state.waiting.reason', ['CrashLoopBackOff, ImagePull…'], 'bad')])
    };
  }

  // ---------- Phase 6: Operators ----------
  {
    const obs = B(300, 20, 160, 64, 'Observe', ['Get the object,', 'List what exists'], 'acc');
    const ana = B(560, 150, 180, 64, 'Analyze', ['diff = desired − actual']);
    const act = B(30, 150, 180, 64, 'Act', ['create / update / delete'], 'ok');
    V['go-controller'] = {
      caption: 'Every controller runs the same loop. It looks at the whole current state each time, so it fixes drift whatever caused it.',
      svg: S(315, [obs, ana, act, A(460, 60, 600, 150), A(560, 182, 210, 182, 'close the gap'), A(120, 150, 300, 60),
        T(380, 125, 'Reconcile(ctx, req)', 'mid'),
        B(30, 250, 330, 50, 'spec = desired state', ['written by users']),
        B(400, 250, 330, 50, 'status = observed state', ['written by the controller'], 'ok')])
    };
  }
  {
    const types = B(10, 40, 180, 64, 'api/v1/*_types.go', ['+kubebuilder markers'], 'acc');
    const cg = B(240, 40, 150, 64, 'controller-gen', ['make manifests', 'make generate']);
    const outs = ['config/crd/bases/*.yaml', 'config/rbac/role.yaml', 'zz_generated.deepcopy.go'].map((t, i) => B(440, 18 + i * 42, 310, 34, t, []));
    V['go-kubebuilder'] = {
      caption: 'You write Go types with markers; controller-gen produces the CRD, RBAC and DeepCopy code. The Makefile drives the rest.',
      svg: S(290, [types, cg, ...outs, R(types, cg), ...outs.map(o => A(390, 72, 440, o.cy)),
        Steps(10, 190, 740, [['edit types'], ['make manifests', ['+ generate']], ['make test', ['envtest']],
          ['make install', ['CRDs']], ['make run', ['local controller']], ['make deploy', ['in-cluster']]])])
    };
  }
  {
    const cols = [[10, 'ReplicaSet controller', ['informers', ['ReplicaSets + Pods']], ['manageReplicas', ['diff = active − desired']], ['create / delete Pods', ['in burst-limited batches']]],
      [262, 'istiod', ['kclient watches', ['Services, Endpoints']], ['onServiceEvent', ['ConvertService → model']], ['xDS push', ['to Envoy proxies']]],
      [514, 'Cilium agent', ['policy watcher', ['NetworkPolicies']], ['ParseNetworkPolicy', ['→ UpdatePolicy']], ['eBPF policy maps', ['per endpoint, in kernel']]]];
    V['go-cncf-code'] = {
      caption: 'Three big projects, one pattern: watch Kubernetes objects, compute what should exist, then act on it.',
      svg: S(310, cols.flatMap(([x, title, w, l, a]) => {
        const b1 = B(x + 20, 40, 196, 56, w[0], w[1]), b2 = B(x + 20, 125, 196, 64, l[0], l[1], 'acc'), b3 = B(x + 20, 220, 196, 64, a[0], a[1], 'ok');
        return [G(x, 10, 236, 290, title), b1, b2, b3, D(b1, b2), D(b2, b3)];
      }))
    };
  }
  {
    const pol = B(10, 30, 200, 84, 'DeploymentPolicy', ['selector: team=payments', 'labels · sidecar'], 'acc');
    const deps = B(10, 160, 200, 64, 'Deployments', ['watched too (map func)']);
    const rec = B(270, 80, 190, 90, 'Reconcile', ['List matching', 'patch if missing', 'update status']);
    const before = B(510, 20, 240, 64, 'checkout (before)', ['containers: nginx']);
    const after = B(510, 110, 240, 84, 'checkout (after)', ['labels: mesh=enabled', 'containers: nginx, log-shipper'], 'ok');
    V['go-m6-operator'] = {
      caption: 'The operator patches only selected Deployments that are missing something, so it is safe to run again and again.',
      svg: S(310, [pol, deps, rec, before, after, A(210, 72, 270, 110), A(210, 192, 270, 145), A(460, 125, 510, 152, 'patch', 'ok'),
        B(510, 215, 240, 50, 'search', ['not selected: unchanged'], 'ghost'),
        T(10, 295, 'Pod template changed → the Deployment rolls out new Pods with the sidecar')])
    };
  }

  window.COURSE_VISUALS = V;
})();
