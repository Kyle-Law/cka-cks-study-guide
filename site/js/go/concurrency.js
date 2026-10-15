// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'concurrency', title: 'Phase 3 · Concurrency & Context', weight: 20,
  topics: [
    {
      id: 'go-goroutines',
      title: 'Goroutines',
      basics: {
        summary: "A goroutine is a function running at the same time as the rest of your program. You start one by putting **`go`** in front of a call. Goroutines are so cheap (a few KB each) that servers run thousands of them; the Go runtime spreads them over a handful of OS threads. When `main` returns, the program ends, so you must **wait** for the goroutines you care about.",
        ideas: [
          "**`go f(x)`** starts `f` concurrently. `x` is evaluated immediately.",
          "Goroutines are **cheap**: they start with a tiny stack that grows as needed.",
          "**main returning ends everything**, including goroutines still running.",
          "Two goroutines touching the same variable, with at least one writing, is a **data race**. Find them with `-race`.",
          "Always know **how each goroutine ends**; one blocked forever is a leak."
        ]
      },
      points: [
        "Concurrency is structuring a program as independent tasks; parallelism is running them at the same instant. Goroutines give you the first; the runtime gives you the second when there are free CPUs.",
        "The scheduler multiplexes goroutines onto `GOMAXPROCS` OS threads (default: the number of CPUs; since Go 1.25 it also respects container CPU limits).",
        "Wait with `sync.WaitGroup` or channels. `time.Sleep` to \"wait for goroutines\" is a bug that happens to work sometimes.",
        "A panic in any goroutine crashes the whole program unless that same goroutine recovers it.",
        "Run tests and programs with `-race` (`go test -race ./...`). It finds races that actually happen during the run, so exercise the concurrent paths.",
        "Leaks: a goroutine stuck sending on a channel nobody reads, or waiting on a context nobody cancels. `runtime.NumGoroutine()` and the pprof goroutine profile help find them.",
        "`net/http` serves each request in its own goroutine. Kubernetes controllers run several reconcile workers as goroutines that share one work queue.",
        "`golang.org/x/sync/errgroup` runs goroutines that return errors, cancels the rest on the first failure, and waits for all of them."
      ],
      labs: [{
        title: 'Start goroutines, wait for them, and catch a race',
        goal: 'See goroutines finish out of order, wait correctly, and let the race detector find a bug.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/goroutines && cd ~/go-lab/goroutines
go mod init example.com/goroutines
cat > main.go <<'EOF'
package main

import (
	"fmt"
	"sync"
	"time"
)

func worker(id int, wg *sync.WaitGroup, results []int) {
	defer wg.Done()
	time.Sleep(time.Duration(3-id) * 50 * time.Millisecond) // worker 2 is fastest
	results[id] = id * id                                   // each goroutine writes its own index
	fmt.Println("worker", id, "done")
}

func main() {
	start := time.Now()
	var wg sync.WaitGroup
	results := make([]int, 3)
	for i := range 3 {
		wg.Add(1)
		go worker(i, &wg, results)
	}
	wg.Wait()
	fmt.Println(results, "| ran concurrently:", time.Since(start) < 250*time.Millisecond)
}
EOF
go run .`],
          ['Write a program with a data race and run it with the race detector:', `mkdir -p racy && cat > racy/main.go <<'EOF'
package main

import (
	"fmt"
	"sync"
)

func main() {
	count := 0
	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			count++ // unsynchronised read-modify-write
		}()
	}
	wg.Wait()
	fmt.Println("count:", count)
}
EOF
go run -race ./racy 2>&1 | grep -m1 "DATA RACE"`]
        ],
        verify: 'Workers finish in the order `worker 2 done`, `worker 1 done`, `worker 0 done`, then `[0 1 4] | ran concurrently: true`. The race run prints `WARNING: DATA RACE`.'
      }],
      refs: [
        ['A Tour of Go: Goroutines', 'https://go.dev/tour/concurrency/1'],
        ['Effective Go: Concurrency', 'https://go.dev/doc/effective_go#concurrency'],
        ['Data Race Detector', 'https://go.dev/doc/articles/race_detector'],
        ['Concurrency is not parallelism (talk)', 'https://go.dev/blog/waza-talk'],
        ['Package errgroup', 'https://pkg.go.dev/golang.org/x/sync/errgroup']
      ],
      quiz: [
        { q: "`func main() { go fmt.Println(\"hi\") }`. What usually happens?",
          o: ["Nothing is printed: `main` returns and the program exits first", "\"hi\" is always printed", "Compile error: result of `go` unused", "The program waits for the goroutine"],
          why: "The program ends when `main` returns, without waiting for other goroutines. Use a WaitGroup or channel to wait." },
        { q: "What does running with `-race` do?",
          o: ["Instruments memory accesses and reports data races that happen during the run", "Makes goroutines run faster", "Proves at compile time that no races exist", "Limits the program to one CPU"],
          why: "The race detector finds races on code paths that actually execute; it can't prove their absence elsewhere." },
        { q: "Roughly what does starting a goroutine cost?",
          o: ["A few kilobytes of stack; programs run hundreds of thousands", "One OS thread (about 1 MB)", "A new process", "Nothing at all"],
          why: "Goroutines start with a small, growable stack and are scheduled in user space, which makes them far cheaper than threads." },
        { q: "A goroutine panics and nothing recovers it. What happens?",
          o: ["The whole program crashes", "Only that goroutine stops", "`main` receives the panic as an error", "The goroutine restarts"],
          why: "An unrecovered panic in any goroutine terminates the process. Recover inside the goroutine if it must not take the program down." },
        { q: "With Go 1.22+, `for i := range 3 { wg.Add(1); go func() { defer wg.Done(); fmt.Print(i) }() }; wg.Wait()` prints:",
          o: ["0, 1 and 2 in some order", "Always `012`", "`333`", "`222`"],
          why: "Each iteration has its own `i`, so each goroutine prints a different value, but the scheduler decides the order." }
      ]
    },
    {
      id: 'go-channels',
      title: 'Channels: unbuffered, buffered, close, range and select',
      basics: {
        summary: "Channels are typed pipes for passing values between goroutines. `ch <- v` sends and `v := <-ch` receives. On an **unbuffered** channel a send waits until another goroutine receives, so the two meet and synchronise. A **buffered** channel holds up to N values. **`close`** says no more values are coming, and **`select`** waits on several channels at once.",
        ideas: [
          "**Unbuffered**: send blocks until a receiver is ready, a hand-off.",
          "**Buffered** `make(chan T, n)`: send blocks only when the buffer is full.",
          "The **sender closes**; receivers use `for v := range ch` to read until it's closed.",
          "**`select`** waits for whichever case is ready first; `time.After` adds a timeout.",
          "\"Don't communicate by sharing memory; **share memory by communicating**.\""
        ]
      },
      points: [
        "After `close(ch)`, receivers drain the remaining values, then get the zero value with `ok == false` (`v, ok := <-ch`).",
        "Sending on a closed channel panics; closing a channel twice panics. Only the sender (or the owner) should close.",
        "A nil channel blocks forever. In a `select`, setting a channel variable to nil disables that case.",
        "If every goroutine is blocked, the runtime stops with `fatal error: all goroutines are asleep - deadlock!`.",
        "When several `select` cases are ready, one is chosen at random. A `default` case makes the select non-blocking.",
        "Directional types document intent and are enforced: `func gen() <-chan int` returns a receive-only channel; `func sink(ch chan<- int)` can only send.",
        "Common patterns: pipelines (stage → stage), fan-out/fan-in, worker pools, `chan struct{}` as a done signal, a buffered channel as a semaphore.",
        "Kubernetes: `watch.Interface.ResultChan()` returns `<-chan watch.Event`; informers stop when their `stopCh <-chan struct{}` is closed (or their context is cancelled)."
      ],
      labs: [{
        title: 'Pipelines, buffers and timeouts',
        goal: 'Chain goroutines with channels, watch `close` and `range` work together, and time out with `select`.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/channels && cd ~/go-lab/channels
go mod init example.com/channels
cat > main.go <<'EOF'
package main

import (
	"fmt"
	"time"
)

// gen sends nums on a channel and closes it when done.
func gen(nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, n := range nums {
			out <- n
		}
	}()
	return out
}

// square reads until in is closed, then closes its own output.
func square(in <-chan int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for n := range in {
			out <- n * n
		}
	}()
	return out
}

func main() {
	for v := range square(gen(1, 2, 3, 4)) {
		fmt.Print(v, " ")
	}
	fmt.Println()

	buf := make(chan string, 2)
	buf <- "a" // doesn't block: there is room
	buf <- "b"
	fmt.Println("len", len(buf), "cap", cap(buf))
	close(buf)
	for s := range buf {
		fmt.Print(s)
	}
	v, ok := <-buf
	fmt.Printf(" | after close: %q %v\\n", v, ok)

	result := make(chan string, 1) // buffered so the late sender doesn't leak
	go func() {
		time.Sleep(200 * time.Millisecond)
		result <- "slow answer"
	}()
	select {
	case r := <-result:
		fmt.Println(r)
	case <-time.After(50 * time.Millisecond):
		fmt.Println("timed out")
	}
}
EOF
go run .`],
          ['Now make the runtime detect a deadlock (this is meant to fail):', `mkdir -p deadlock && cat > deadlock/main.go <<'EOF'
package main

import "fmt"

func main() {
	ch := make(chan int)
	ch <- 1 // blocks forever: nobody is receiving
	fmt.Println(<-ch)
}
EOF
go run ./deadlock 2>&1 | head -1 || true`]
        ],
        verify: 'Prints `1 4 9 16`, `len 2 cap 2`, `ab | after close: "" false`, `timed out`; the second step prints `fatal error: all goroutines are asleep - deadlock!`.'
      }],
      refs: [
        ['A Tour of Go: Channels', 'https://go.dev/tour/concurrency/2'],
        ['Go Concurrency Patterns: Pipelines and cancellation', 'https://go.dev/blog/pipelines'],
        ['Share Memory By Communicating', 'https://go.dev/blog/codelab-share'],
        ['Go spec: Select statements', 'https://go.dev/ref/spec#Select_statements']
      ],
      quiz: [
        { q: "`func main() { ch := make(chan int); ch <- 1; fmt.Println(<-ch) }` does what?",
          o: ["Crashes with `all goroutines are asleep - deadlock!`", "Prints 1", "Prints 0", "Compile error"],
          why: "An unbuffered send waits for a receiver. The only goroutine is the one sending, so nothing can ever receive." },
        { q: "You receive from a closed, empty `chan int` with `v, ok := <-ch`. What do you get?",
          o: ["`0, false` immediately", "It blocks forever", "It panics", "The last value sent, `true`"],
          why: "Receiving from a closed channel never blocks: once drained it returns the zero value and `ok == false`." },
        { q: "What happens when you send on a closed channel?",
          o: ["It panics", "The value is silently dropped", "It blocks forever", "The channel reopens"],
          why: "Send on closed channel is a run-time panic. That's why only the sender, who knows when it's finished, should close." },
        { q: "`ch := make(chan int, 2)`. How many sends succeed before one blocks, with no receivers?",
          o: ["2", "0", "1", "3"],
          why: "The buffer holds two values. The third send waits until someone receives." },
        { q: "Two cases of a `select` are ready at the same time. Which runs?",
          o: ["One chosen at random", "The first one in source order", "Both, in order", "Neither; select needs exactly one ready case"],
          why: "Random choice prevents one busy channel from starving the others." }
      ]
    },
    {
      id: 'go-sync',
      title: 'sync: WaitGroup, Mutex, RWMutex',
      basics: {
        summary: "When goroutines share data, the **`sync`** package keeps them from trampling each other. A **WaitGroup** waits for a group of goroutines to finish. A **Mutex** lets one goroutine at a time into a critical section. An **RWMutex** lets many readers in together, or one writer alone.",
        ideas: [
          "**WaitGroup**: `Add(1)` before `go`, `defer wg.Done()` inside, `Wait()` to block until all are done.",
          "**Mutex**: `mu.Lock(); defer mu.Unlock()` around every access to the shared data.",
          "**RWMutex**: `RLock` for reads, `Lock` for writes; helps when reads dominate.",
          "**Never copy** a struct containing a mutex after use; pass it by pointer.",
          "`sync/atomic` counters and `sync.Once` cover two common special cases."
        ]
      },
      points: [
        "Call `wg.Add` before starting the goroutine. Calling it inside the goroutine races with `Wait`, which may return too early. Go 1.25 adds `wg.Go(func(){…})`, which does the Add and Done for you.",
        "A mutex's zero value is unlocked and ready. Put it next to the fields it guards and document which ones.",
        "Go mutexes aren't reentrant: locking twice in the same goroutine deadlocks. Avoid calling locked methods from other locked methods.",
        "Take multiple locks in a consistent order everywhere, or two goroutines can deadlock waiting on each other.",
        "Maps aren't safe for concurrent writes; the runtime may crash with `fatal error: concurrent map writes`. Guard them or use `sync.Map` for append-only caches.",
        "`atomic.Int64` (typed atomics, Go 1.19) is the simplest correct counter. `sync.OnceValue` (Go 1.21) runs lazy initialisation exactly once.",
        "`go vet` (copylocks check) warns when a mutex is copied by value, e.g. a value receiver on a struct holding one.",
        "Channels for passing ownership and signalling; mutexes for protecting state. client-go's `threadSafeMap` (behind informer caches) is a map guarded by an RWMutex."
      ],
      labs: [{
        title: 'Protect shared state',
        goal: 'Count from 1000 goroutines with a mutex, an atomic and an RWMutex-guarded cache.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/sync && cd ~/go-lab/sync
go mod init example.com/sync
cat > main.go <<'EOF'
package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

type SafeCounter struct {
	mu sync.Mutex // guards m
	m  map[string]int
}

func (c *SafeCounter) Inc(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[key]++
}

func (c *SafeCounter) Get(key string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.m[key]
}

type Cache struct {
	mu   sync.RWMutex // guards data
	data map[string]string
}

func (c *Cache) Get(k string) (string, bool) {
	c.mu.RLock() // many readers at once
	defer c.mu.RUnlock()
	v, ok := c.data[k]
	return v, ok
}

func (c *Cache) Set(k, v string) {
	c.mu.Lock() // one writer, no readers
	defer c.mu.Unlock()
	c.data[k] = v
}

func main() {
	counter := SafeCounter{m: map[string]int{}}
	var hits atomic.Int64
	var wg sync.WaitGroup
	for range 1000 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			counter.Inc("pods")
			hits.Add(1)
		}()
	}
	wg.Wait()
	fmt.Println("mutex:", counter.Get("pods"), "atomic:", hits.Load())

	cache := &Cache{data: map[string]string{}}
	cache.Set("web", "10.0.0.7")
	for i := range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, ok := cache.Get("web"); !ok {
				fmt.Println("reader", i, "missed")
			}
		}()
	}
	wg.Wait()
	ip, _ := cache.Get("web")
	fmt.Println("cache web =", ip)
}
EOF
go run -race .`]
        ],
        verify: 'Prints `mutex: 1000 atomic: 1000` and `cache web = 10.0.0.7`, with no `DATA RACE` warnings even under `-race`.'
      }],
      refs: [
        ['Package sync', 'https://pkg.go.dev/sync'],
        ['Package sync/atomic', 'https://pkg.go.dev/sync/atomic'],
        ['A Tour of Go: sync.Mutex', 'https://go.dev/tour/concurrency/9'],
        ['The Go Memory Model', 'https://go.dev/ref/mem']
      ],
      quiz: [
        { q: "What goes wrong with `go func() { wg.Add(1); defer wg.Done(); … }()` followed by `wg.Wait()`?",
          o: ["`Wait` can run before `Add`, see a zero counter and return early", "Nothing; it's the recommended pattern", "It deadlocks every time", "`Done` panics"],
          why: "The goroutine may not have started when `Wait` runs. Call `Add` in the launching goroutine, before `go`." },
        { q: "A type has a `sync.Mutex` field and a value-receiver method that locks it. What's the problem?",
          o: ["Each call locks a copy of the mutex, so nothing is protected", "Value receivers can't call `Lock`", "It always deadlocks", "There's no problem"],
          why: "The receiver is a copy, including the mutex. Use a pointer receiver; `go vet` flags this as copylocks." },
        { q: "With an `RWMutex`, which is true?",
          o: ["Many goroutines can hold `RLock` together, but `Lock` is exclusive", "Readers and writers can all hold it together", "Only one reader at a time", "Writers never wait for readers"],
          why: "Readers share the lock; a writer waits until readers leave and blocks new readers while waiting." },
        { q: "A goroutine calls `mu.Lock()` and then, before unlocking, calls a helper that also calls `mu.Lock()`. What happens?",
          o: ["It deadlocks; Go mutexes aren't reentrant", "The second Lock succeeds", "It panics with \"double lock\"", "The helper skips the lock"],
          why: "The second `Lock` waits for the first to be released, which never happens. Split locked and unlocked helpers." },
        { q: "Several goroutines write to a plain `map` without any lock. What can happen?",
          o: ["The program can crash with `fatal error: concurrent map writes`", "Writes are safely serialised by the runtime", "Only the last write is kept", "A compile error"],
          why: "Maps aren't safe for concurrent writes. The runtime detects some cases and aborts rather than corrupt memory." }
      ]
    },
    {
      id: 'go-context',
      title: 'context: cancellation, deadlines and values',
      basics: {
        summary: "A **`context.Context`** carries a **cancellation signal**, an optional **deadline**, and a few **request-scoped values** through your call chain and into goroutines. In cloud-native Go nearly every function that blocks takes `ctx` as its first argument. Cancel a context and everything derived from it stops too.",
        ideas: [
          "Take **`ctx context.Context` as the first parameter** of anything that blocks or does I/O.",
          "Start from `context.Background()` in `main` and tests; derive with **WithCancel**, **WithTimeout**, **WithDeadline**, **WithValue**.",
          "**Always `defer cancel()`** to release the context's resources.",
          "Watch **`<-ctx.Done()`** in a select; `ctx.Err()` says why: `Canceled` or `DeadlineExceeded`.",
          "Contexts form a **tree**: cancelling a parent cancels all its children."
        ]
      },
      points: [
        "A child can shorten its parent's deadline but never extend it: `WithTimeout(parent, 5*time.Second)` under a 1-second parent still ends after 1 second.",
        "Outgoing HTTP: `http.NewRequestWithContext(ctx, …)`. Incoming: `r.Context()` is cancelled when the client disconnects.",
        "Graceful shutdown: `ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)` gives a context cancelled on Ctrl-C or SIGTERM.",
        "Use values only for request-scoped data that crosses APIs (request IDs, auth info, loggers), with an unexported key type (`type ctxKey struct{}`) to avoid collisions. Never for optional parameters.",
        "Don't store a context in a struct; pass it explicitly to each call.",
        "Newer helpers: `WithCancelCause`/`context.Cause` (1.20) record why; `WithoutCancel` and `AfterFunc` (1.21).",
        "`go vet`'s lostcancel check warns when a `cancel` function is never called.",
        "Kubernetes: `clientset.CoreV1().Pods(ns).List(ctx, opts)`, controller-runtime's `Reconcile(ctx, req)`, and `ctrl.SetupSignalHandler()` (a context cancelled on SIGTERM) all follow this pattern."
      ],
      labs: [{
        title: 'Timeouts, cancellation trees and values',
        goal: 'Watch a timeout fire, cancel a parent and see its child stop, and pass a request ID.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/context && cd ~/go-lab/context
go mod init example.com/context
cat > main.go <<'EOF'
package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type ctxKey struct{}

// slowOp finishes after d, or earlier if ctx is cancelled.
func slowOp(ctx context.Context, d time.Duration) error {
	select {
	case <-time.After(d):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func worker(ctx context.Context, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case <-ctx.Done():
			fmt.Println("worker stopped:", ctx.Err())
			return
		case <-time.After(20 * time.Millisecond): // do a unit of work
		}
	}
}

func main() {
	// 1. A deadline shared by several calls.
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	fmt.Println("fast op:", slowOp(ctx, 10*time.Millisecond))
	fmt.Println("slow op:", slowOp(ctx, time.Second))

	// 2. Cancelling a parent cancels its children.
	parent, cancelParent := context.WithCancel(context.Background())
	child, cancelChild := context.WithCancel(parent)
	defer cancelChild()
	var wg sync.WaitGroup
	wg.Add(1)
	go worker(child, &wg)
	time.Sleep(50 * time.Millisecond)
	cancelParent()
	wg.Wait()
	fmt.Println("parent:", parent.Err(), "| child:", child.Err())

	// 3. Request-scoped values.
	reqCtx := context.WithValue(context.Background(), ctxKey{}, "req-42")
	fmt.Println("request id:", reqCtx.Value(ctxKey{}))
}
EOF
go run .`]
        ],
        verify: 'Prints `fast op: <nil>`, `slow op: context deadline exceeded`, `worker stopped: context canceled`, `parent: context canceled | child: context canceled`, `request id: req-42`.'
      }],
      refs: [
        ['Package context', 'https://pkg.go.dev/context'],
        ['Go Concurrency Patterns: Context', 'https://go.dev/blog/context'],
        ['Contexts and structs', 'https://go.dev/blog/context-and-structs'],
        ['Package os/signal: NotifyContext', 'https://pkg.go.dev/os/signal#NotifyContext']
      ],
      quiz: [
        { q: "You cancel a parent context. What happens to contexts derived from it?",
          o: ["They are all cancelled too", "Nothing; children are independent", "Only direct children are cancelled", "They panic"],
          why: "Cancellation flows down the tree, so one cancel stops a whole request's worth of work." },
        { q: "The parent has a 1-second deadline. You call `context.WithTimeout(parent, 5*time.Second)`. When does the child expire?",
          o: ["After about 1 second", "After 5 seconds", "After 6 seconds", "Never; timeouts don't nest"],
          why: "A child can't outlive its parent; the earlier deadline wins." },
        { q: "What is the risk of `ctx, _ := context.WithTimeout(parent, d)` (ignoring cancel)?",
          o: ["The context's timer and resources leak until the deadline or parent ends; `go vet` warns", "None; cancel is optional", "The context is never cancelled, even at the deadline", "It doesn't compile"],
          why: "Calling `cancel` frees resources as soon as you're done. The lostcancel vet check flags the discarded function." },
        { q: "After a `WithTimeout` deadline passes, what does `ctx.Err()` return?",
          o: ["`context.DeadlineExceeded`", "`context.Canceled`", "nil", "`os.ErrDeadlineExceeded`"],
          why: "`Canceled` means someone called cancel; `DeadlineExceeded` means time ran out." },
        { q: "Which belongs in `context.WithValue`?",
          o: ["Request-scoped data such as a trace or request ID", "Optional function parameters", "A database connection pool", "Configuration loaded at start-up"],
          why: "Values are untyped and invisible in signatures, so keep them for data that truly travels with one request across API boundaries." }
      ]
    },
    {
      id: 'go-m3-pool',
      title: 'Milestone 3: a concurrent fetcher with a global timeout',
      basics: {
        summary: "Build `fetchpool`, a command that fetches many URLs with a **fixed number of worker goroutines** and one **global `context.WithTimeout`** for the whole run. Workers pull jobs from a channel, every request carries the context, and when the deadline hits, in-flight requests stop and unstarted ones are reported as timed out.",
        ideas: [
          "A **jobs channel** feeds N workers; N caps how many requests run at once.",
          "**One context** with a deadline covers every request; `NewRequestWithContext` makes them cancellable.",
          "Each worker writes **its own result slot**, so no mutex is needed.",
          "The sender **closes** the jobs channel; `wg.Wait()` ensures every worker has finished.",
          "Ctrl-C cancels the same context via **`signal.NotifyContext`**."
        ]
      },
      points: [
        "Bounded concurrency protects you and the servers you call: 1000 URLs with 8 workers means at most 8 open requests.",
        "Index-based jobs (`jobs <- i`) keep results in input order without sorting or locking.",
        "Stop handing out work when `ctx.Done()` fires, and mark the remaining URLs with `ctx.Err()`.",
        "A cancelled request returns an error wrapping `context.DeadlineExceeded`; detect it with `errors.Is`.",
        "Always drain and close response bodies (`io.Copy(io.Discard, resp.Body)`, `resp.Body.Close()`) so connections are reused.",
        "`httptest.NewServer` lets tests run against real HTTP without the internet.",
        "Variations: `errgroup.WithContext` with `g.SetLimit(n)` replaces the hand-written pool; a `time.Ticker` adds rate limiting."
      ],
      labs: [{
        title: 'Build fetchpool step by step',
        goal: 'A bounded worker pool with a whole-run deadline, tested against a local server.',
        steps: [
          ['Reference layout you will end up with:', `fetchpool/
├── go.mod
├── main.go            # flags, timeout + Ctrl-C context, report
├── pool/
│   ├── pool.go        # Fetch(ctx, client, urls, workers) []Result
│   └── pool_test.go   # httptest server: fast, slow, failing
└── testserver/
    └── main.go        # local endpoints to try the tool against`],
          ['Create the module:', `mkdir -p ~/go-lab/fetchpool/pool ~/go-lab/fetchpool/testserver && cd ~/go-lab/fetchpool
go mod init example.com/fetchpool`],
          ['Write the pool in `pool/pool.go`:', `cat > pool/pool.go <<'EOF'
// Package pool fetches URLs with a bounded number of concurrent workers.
package pool

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

type Result struct {
	URL      string
	Status   int
	Duration time.Duration
	Err      error
}

// Fetch GETs every URL using at most workers concurrent requests.
// Results are in the same order as urls. ctx bounds the whole run.
func Fetch(ctx context.Context, client *http.Client, urls []string, workers int) []Result {
	results := make([]Result, len(urls))
	jobs := make(chan int)

	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				results[i] = fetchOne(ctx, client, urls[i]) // each index has one writer
			}
		}()
	}

send:
	for i := range urls {
		select {
		case jobs <- i:
		case <-ctx.Done(): // deadline or Ctrl-C: stop handing out work
			for j := i; j < len(urls); j++ {
				results[j] = Result{URL: urls[j], Err: ctx.Err()}
			}
			break send
		}
	}
	close(jobs)
	wg.Wait()
	return results
}

func fetchOne(ctx context.Context, client *http.Client, url string) Result {
	r := Result{URL: url}
	start := time.Now()
	defer func() { r.Duration = time.Since(start) }()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		r.Err = err
		return r
	}
	resp, err := client.Do(req)
	if err != nil {
		r.Err = err
		return r
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	r.Status = resp.StatusCode
	if resp.StatusCode >= 400 {
		r.Err = fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return r
}
EOF`],
          ['Test it against an in-process server:', `cat > pool/pool_test.go <<'EOF'
package pool

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/slow":
			select {
			case <-time.After(2 * time.Second):
			case <-r.Context().Done():
			}
		case "/fail":
			http.Error(w, "boom", http.StatusInternalServerError)
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	start := time.Now()
	res := Fetch(ctx, srv.Client(), []string{srv.URL + "/fast", srv.URL + "/fail", srv.URL + "/slow"}, 3)

	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("Fetch took %v; the deadline should stop it at about 300ms", elapsed)
	}
	if res[0].Err != nil || res[0].Status != 200 {
		t.Errorf("fast: got %+v", res[0])
	}
	if res[1].Status != 500 {
		t.Errorf("fail: got status %d, want 500", res[1].Status)
	}
	if !errors.Is(res[2].Err, context.DeadlineExceeded) {
		t.Errorf("slow: got %v, want DeadlineExceeded", res[2].Err)
	}
}
EOF
go test -race ./pool/`],
          ['Write the command in `main.go`:', `cat > main.go <<'EOF'
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"time"

	"example.com/fetchpool/pool"
)

func main() {
	workers := flag.Int("workers", 4, "maximum concurrent requests")
	timeout := flag.Duration("timeout", 5*time.Second, "deadline for the whole run")
	flag.Parse()
	urls := flag.Args()
	if len(urls) == 0 {
		fmt.Fprintln(os.Stderr, "usage: fetchpool [-workers N] [-timeout D] URL...")
		os.Exit(2)
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt) // Ctrl-C cancels too
	defer stop()

	start := time.Now()
	var ok, failed, timedOut int
	for _, r := range pool.Fetch(ctx, http.DefaultClient, urls, *workers) {
		status := "ok"
		switch {
		case r.Err == nil:
			ok++
		case errors.Is(r.Err, context.DeadlineExceeded):
			timedOut++
			status = "timed out"
		default:
			failed++
			status = r.Err.Error()
		}
		fmt.Printf("%-28s %s\\n", r.URL, status)
	}
	fmt.Printf("%d ok, %d failed, %d timed out in %s\\n", ok, failed, timedOut, time.Since(start).Round(100*time.Millisecond))
}
EOF`],
          ['Write a local test server with fast, slow and failing endpoints:', `cat > testserver/main.go <<'EOF'
package main

import (
	"log"
	"net/http"
	"time"
)

func main() {
	http.HandleFunc("/fast", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	http.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(3 * time.Second):
		case <-r.Context().Done(): // the client gave up
		}
	})
	http.HandleFunc("/fail", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	})
	log.Fatal(http.ListenAndServe("localhost:9000", nil))
}
EOF`],
          ['Run it: 2 workers, a 1-second deadline, six URLs:', `go build -o ts ./testserver
./ts & sleep 1
U=http://localhost:9000
go run . -workers 2 -timeout 1s $U/fast $U/slow $U/fast $U/fail $U/slow $U/fast
kill $!`]
        ],
        verify: '`go test -race` prints `ok`. The run lists `/fast ok`, `/slow timed out`, `/fast ok`, `/fail HTTP 500`, `/slow timed out`, and the last `/fast timed out` (both workers were stuck on slow requests until the deadline), then `2 ok, 1 failed, 3 timed out in 1s`.'
      }],
      refs: [
        ['Go Concurrency Patterns: Pipelines and cancellation', 'https://go.dev/blog/pipelines'],
        ['Package net/http: NewRequestWithContext', 'https://pkg.go.dev/net/http#NewRequestWithContext'],
        ['Package net/http/httptest', 'https://pkg.go.dev/net/http/httptest'],
        ['Package errgroup: SetLimit', 'https://pkg.go.dev/golang.org/x/sync/errgroup#Group.SetLimit']
      ],
      quiz: [
        { q: "Workers write `results[i]` from different goroutines without a mutex. Why is that safe here?",
          o: ["Each index is written by exactly one goroutine, and `wg.Wait()` happens before reading", "Slices are thread-safe in Go", "The race detector serialises the writes", "It isn't safe; it needs a mutex"],
          why: "Distinct slice elements are distinct memory locations. `Wait` provides the happens-before edge for the reader." },
        { q: "Who should close the `jobs` channel?",
          o: ["The goroutine that sends the jobs, after the last send", "Each worker when it finishes", "The last worker to exit", "Nobody; channels close themselves"],
          why: "Only the sender knows when there are no more jobs. A worker closing it would make the sender panic." },
        { q: "The global deadline passes while a request is in flight. What does `client.Do` return?",
          o: ["An error wrapping `context.DeadlineExceeded`", "A 408 response", "It keeps waiting for the server", "A nil error and an empty body"],
          why: "The transport watches the request's context and aborts the connection when it's done." },
        { q: "Why use `http.NewRequestWithContext` instead of `http.Get(url)`?",
          o: ["`http.Get` has no context, so the deadline and Ctrl-C couldn't cancel it", "`http.Get` doesn't follow redirects", "`http.Get` is deprecated", "It is faster"],
          why: "Only requests built with a context can be cancelled by it (client timeouts aside)." },
        { q: "What would go wrong if `Fetch` returned `results` without calling `wg.Wait()`?",
          o: ["Workers could still be writing, so results would be incomplete and racy", "Nothing; `close(jobs)` already waits", "The program would deadlock", "The jobs channel would panic"],
          why: "Closing the channel only tells workers no more jobs are coming. `Wait` makes sure they've finished the ones they have." }
      ]
    }
  ]
});
