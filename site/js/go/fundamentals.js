// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'fundamentals', title: 'Phase 1 · Go Fundamentals & Idioms', weight: 20,
  topics: [
    {
      id: 'go-syntax',
      title: 'Syntax and types: variables, slices, maps, structs',
      basics: {
        summary: "Go is a small, statically typed, compiled language. Every variable has a type known at compile time and starts at a **zero value**. Most of your data will live in three built-in containers: **slices** (growable lists), **maps** (hash tables) and **structs** (named groups of fields).",
        ideas: [
          "**Zero values**: a new variable is `0`, `\"\"`, `false` or `nil`, never random memory.",
          "**`:=`** declares and infers the type inside functions; `var` works everywhere.",
          "A **slice** is a small header (pointer, length, capacity) over a backing array. Slicing shares that array.",
          "A **map** must be created (`make` or a literal) before you write to it. Reading a missing key returns the zero value.",
          "**Capitalised** names (`Config`, `Load`) are exported from a package; lowercase names are private to it."
        ]
      },
      points: [
        "Basic types: `bool`, `string` (immutable UTF-8 bytes), `int`/`int8`…`int64`, `uint`…, `float32`/`float64`, `byte` (= `uint8`), `rune` (= `int32`, one Unicode code point).",
        "No implicit numeric conversions: write `float64(n)`. Constants are untyped until used, so `const x = 5` works as an int or a float.",
        "`len(\"héllo\")` is 6 because `len` counts bytes. `for i, r := range s` walks runes; `utf8.RuneCountInString(s)` counts them.",
        "Arrays (`[3]int`) are values and are copied on assignment. Slices (`[]int`) share their backing array: `b := a[1:3]` and writes through `b` change `a`.",
        "`append` returns a new slice header; always write `s = append(s, x)`. When length would exceed capacity it allocates a new array, and old aliases stop seeing changes.",
        "Use `copy(dst, src)` or `slices.Clone(s)` when you need an independent copy. Three-index slicing `a[1:3:3]` caps capacity so a later `append` can't overwrite `a`.",
        "Maps: `m := map[string]int{}`; `v, ok := m[k]` tells a missing key from a stored zero; `delete(m, k)`; iteration order is random on purpose; writing to a nil map panics; maps are not safe for concurrent writes.",
        "Structs: `Point{X: 1, Y: 2}` (named fields survive reordering); `%+v` prints field names; structs are comparable with `==` when all fields are; embedding a struct promotes its fields and methods.",
        "The compiler rejects unused variables and imports, and `gofmt` decides formatting. Both keep codebases uniform."
      ],
      labs: [{
        title: 'Explore zero values, slice aliasing and maps',
        goal: 'See what a slice really is and why `append` sometimes affects other slices and sometimes doesn\'t.',
        steps: [
          ['Create a new module:', `mkdir -p ~/go-lab/types && cd ~/go-lab/types
go mod init example.com/types`],
          ['Write `main.go`:', `cat > main.go <<'EOF'
package main

import "fmt"

type Point struct {
	X, Y int
}

func main() {
	var i int
	var s string
	var p *Point
	var m map[string]int
	fmt.Printf("%d %q %v %v\\n", i, s, p, m == nil)

	a := []int{1, 2, 3, 4}
	b := a[1:3] // shares a's backing array
	b[0] = 99
	fmt.Println(a, b, len(b), cap(b))

	b = append(b, 100) // fits in capacity: overwrites a[3]
	fmt.Println(a)

	c := append(b, 200) // exceeds capacity: new array
	c[0] = -1
	fmt.Println(a, c)

	ages := map[string]int{"ana": 31}
	ages["bo"] = 25
	v, ok := ages["cy"]
	fmt.Println(len(ages), v, ok)

	fmt.Printf("%+v\\n", Point{X: 1})
}
EOF`],
          ['Run it:', 'go run .']
        ],
        verify: 'Output is `0 "" <nil> true`, `[1 99 3 4] [99 3] 2 3`, `[1 99 3 100]`, `[1 99 3 100] [-1 3 100 200]`, `2 0 false`, `{X:1 Y:0}`.'
      }],
      refs: [
        ['A Tour of Go: Basics', 'https://go.dev/tour/basics/1'],
        ['Go Slices: usage and internals', 'https://go.dev/blog/slices-intro'],
        ['Go maps in action', 'https://go.dev/blog/maps'],
        ['The Go Programming Language Specification', 'https://go.dev/ref/spec'],
        ['Effective Go: Data', 'https://go.dev/doc/effective_go#data']
      ],
      quiz: [
        { q: "What happens when this runs?\n`var m map[string]int; m[\"a\"] = 1`",
          o: ["It panics: assignment to entry in nil map", "`m` now holds `{\"a\": 1}`", "Compile error: map not initialised", "Nothing; writes to a nil map are ignored"],
          why: "A declared but unmade map is nil. Reading from it is fine (you get the zero value), but writing panics at run time. Create it with `make(map[string]int)` or a literal." },
        { q: "`a := []int{1, 2, 3}; b := a[:2]; b = append(b, 9)`. What is `a` now?",
          o: ["`[1 2 9]`", "`[1 2 3]`", "`[1 2 3 9]`", "`[1 2]`"],
          why: "`b` has length 2 and capacity 3, so `append` writes into the shared backing array at index 2, overwriting `a[2]`." },
        { q: "What is the zero value of a `string` variable?",
          o: ["The empty string `\"\"`", "`nil`", "A random value until assigned", "`\"0\"`"],
          why: "Strings are values, not pointers, so they can't be nil. Their zero value is the empty string." },
        { q: "What does `len(\"héllo\")` return?",
          o: ["6", "5", "4", "It depends on the platform"],
          why: "`len` counts bytes. `é` takes two bytes in UTF-8, so the string has 5 runes but 6 bytes." },
        { q: "`m := map[string]int{}; v := m[\"missing\"]`. What happens?",
          o: ["`v` is 0 and nothing panics", "It panics with a missing key error", "`v` is nil", "Compile error"],
          why: "Reading a missing key returns the value type's zero value. Use `v, ok := m[k]` when you need to know whether the key exists." }
      ]
    },
    {
      id: 'go-control',
      title: 'Control flow: for, if/else, switch, defer',
      basics: {
        summary: "Go keeps control flow small: one loop keyword (`for`), `if` and `switch` that can start with a short statement, and a `switch` that never falls through by accident. **`defer`** schedules a call to run when the surrounding function returns, which makes cleanup hard to forget.",
        ideas: [
          "**`for`** is the only loop: three-part, condition-only (a while loop), infinite, and `range`.",
          "**`if v, err := f(); err != nil`**: variables declared there exist only inside the `if`/`else`.",
          "**`switch`** stops after the matching case; write `fallthrough` if you really want the next one.",
          "**`defer`** runs when the function returns, **last in, first out**, even if it panics.",
          "Deferred calls' **arguments are evaluated immediately**, not when they run."
        ]
      },
      points: [
        "`range` works over slices and arrays (index, copy of element), maps (random order), strings (byte index, rune), channels (until closed), integers (`for i := range 10`, Go 1.22+) and iterator functions (Go 1.23+).",
        "Since Go 1.22 each loop iteration has its own copy of the loop variable, so closures and goroutines started in a loop see that iteration's value. Before 1.22 they all shared one variable.",
        "Labels let `break` and `continue` target an outer loop: `outer: for … { for … { continue outer } }`.",
        "A tagless `switch { case x > 10: … }` replaces long if-else chains. Cases can list values: `case 'a', 'e', 'i':`. A type switch is `switch v := x.(type)`.",
        "`defer f(x)` evaluates `x` now. A deferred closure `defer func() { … }()` reads variables when it runs.",
        "Typical uses: `defer f.Close()`, `defer mu.Unlock()`, `defer cancel()`, `defer wg.Done()`, `defer resp.Body.Close()`.",
        "Defers in a loop pile up until the function returns. Move the loop body into a helper function when each iteration opens a file.",
        "`recover()` stops a panic only when called directly in a deferred function. A deferred closure can also change named results, e.g. to turn a panic into an error."
      ],
      labs: [{
        title: 'Loops, switch and defer order',
        goal: 'Write each loop form and watch deferred calls run in reverse.',
        steps: [
          ['Create a module:', `mkdir -p ~/go-lab/control && cd ~/go-lab/control
go mod init example.com/control`],
          ['Write `main.go`:', `cat > main.go <<'EOF'
package main

import "fmt"

func grade(score int) string {
	switch {
	case score >= 90:
		return "A"
	case score >= 75:
		return "B"
	default:
		return "C"
	}
}

func countdown() {
	for i := 0; i < 3; i++ {
		defer fmt.Println("deferred", i)
	}
	fmt.Println("loop done")
}

func main() {
	for i := range 3 {
		fmt.Print(i, " ")
	}
	fmt.Println()

	n := 1
	for n < 100 { // a "while" loop
		n *= 3
	}
	fmt.Println("n =", n)

	for _, s := range []int{95, 80, 40} {
		fmt.Print(grade(s), " ")
	}
	fmt.Println()

	countdown()

	if x := len("go"); x == 2 {
		fmt.Println("x only exists in this if:", x)
	}
}
EOF
go run .`]
        ],
        verify: 'Prints `0 1 2`, `n = 243`, `A B C`, `loop done`, then `deferred 2`, `deferred 1`, `deferred 0`, and finally `x only exists in this if: 2`.'
      }, {
        title: 'When defer arguments are evaluated, and recover',
        goal: 'See that defer captures arguments early, and turn a panic into an error.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/defer && cd ~/go-lab/defer
go mod init example.com/defer
cat > main.go <<'EOF'
package main

import "fmt"

func safeDivide(a, b int) (q int, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("recovered: %v", r)
		}
	}()
	return a / b, nil
}

func main() {
	x := 1
	defer fmt.Println("x at defer time:", x)
	x = 2

	fmt.Println(safeDivide(10, 2))
	fmt.Println(safeDivide(1, 0))
	fmt.Println("x now:", x)
}
EOF
go run .`]
        ],
        verify: 'Prints `5 <nil>`, `0 recovered: runtime error: integer divide by zero`, `x now: 2`, and last `x at defer time: 1`.'
      }],
      refs: [
        ['A Tour of Go: Flow control', 'https://go.dev/tour/flowcontrol/1'],
        ['Effective Go: Control structures', 'https://go.dev/doc/effective_go#control-structures'],
        ['Defer, Panic, and Recover', 'https://go.dev/blog/defer-panic-and-recover'],
        ['Fixing For Loops in Go 1.22', 'https://go.dev/blog/loopvar-preview']
      ],
      quiz: [
        { q: "What does this print?\n`for i := 0; i < 3; i++ { defer fmt.Print(i) }`",
          o: ["`210`", "`012`", "`333`", "`222`"],
          why: "Deferred calls run last in, first out when the function returns, and each `i` was evaluated when its `defer` ran." },
        { q: "`x := 1; defer fmt.Println(x); x = 2`. What is printed when the function returns?",
          o: ["`1`", "`2`", "Nothing; `x` changed after the defer", "Compile error"],
          why: "Arguments to a deferred call are evaluated at the `defer` statement. Use a closure if you want the value at return time." },
        { q: "`switch 2 { case 2: fmt.Print(\"two \"); case 3: fmt.Print(\"three\") }` prints:",
          o: ["`two `", "`two three`", "Nothing", "Compile error: missing break"],
          why: "Go's switch stops after the matching case. Falling into the next case needs an explicit `fallthrough`." },
        { q: "With Go 1.22 or newer, what does this print?\n`var fs []func(); for i := 0; i < 3; i++ { fs = append(fs, func() { fmt.Print(i) }) }; for _, f := range fs { f() }`",
          o: ["`012`", "`333`", "`222`", "It doesn't compile"],
          why: "Since Go 1.22 each iteration gets a fresh `i`, so each closure keeps its own value. Older versions shared one variable and printed `333`." },
        { q: "How do you write a \"while\" loop in Go?",
          o: ["`for cond { … }`", "`while cond { … }`", "`loop cond { … }`", "`do { … } while cond`"],
          why: "Go has only `for`. With just a condition it behaves like a while loop; with nothing it loops forever." }
      ]
    },
    {
      id: 'go-pointers',
      title: 'Pointers: addresses, pass-by-value vs reference',
      basics: {
        summary: "A pointer holds the **address** of a value. Go always passes arguments **by value**: a function gets a copy. To let a function change the caller's data, pass a pointer to it. There is no pointer arithmetic and the garbage collector frees memory, so pointers in Go are safe and common.",
        ideas: [
          "**`&x`** gives the address of `x`; **`*p`** reads or writes the value it points to.",
          "**Everything is copied** when passed. A copied pointer still points at the same data.",
          "Slices, maps and channels already **contain pointers**, so a function can change their contents without `*`.",
          "Returning `&local` is fine: the compiler **moves it to the heap** (escape analysis).",
          "`nil` pointers **panic** when dereferenced; check them, or design so they can't be nil."
        ]
      },
      points: [
        "`new(T)` returns a `*T` to a zeroed `T`. `&T{Field: v}` is the more common way to make one.",
        "Field access dereferences automatically: `p.X` means `(*p).X`. Method calls do the same for pointer receivers on addressable values.",
        "A slice argument shares its backing array, so `s[0] = 1` inside a function is visible to the caller, but `s = append(s, x)` changes only the local header. Return the slice or pass `*[]T`.",
        "A map argument shares the table, so adding keys is visible. Assigning a new map to the parameter is not.",
        "Escape analysis decides stack vs heap. See its decisions with `go build -gcflags=-m`; look for `moved to heap` and `escapes to heap`.",
        "Use pointers to mutate, to avoid copying large structs, to share one instance, or to mark a value as optional. Kubernetes API types use `*int32` for `replicas` so \"unset\" differs from 0.",
        "Use plain values for small data you don't need to change (`time.Time`, small structs). Copies are cheap and can't be changed behind your back.",
        "Dereferencing nil panics with `invalid memory address or nil pointer dereference`. There is no pointer arithmetic outside the `unsafe` package."
      ],
      labs: [{
        title: 'Pass by value vs pass a pointer',
        goal: 'Predict each line before running it, then check.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/pointers && cd ~/go-lab/pointers
go mod init example.com/pointers
cat > main.go <<'EOF'
package main

import "fmt"

type Counter struct{ N int }

func incValue(c Counter)    { c.N++ }
func incPointer(c *Counter) { c.N++ }

func setFirst(s []int)   { s[0] = 42 }
func appendOne(s []int)  { s = append(s, 1) }
func appendPtr(s *[]int) { *s = append(*s, 1) }

func newCounter() *Counter {
	c := Counter{N: 10}
	return &c // c escapes to the heap
}

func main() {
	c := Counter{}
	incValue(c)
	fmt.Println("after incValue:", c.N)
	incPointer(&c)
	fmt.Println("after incPointer:", c.N)

	s := []int{0, 0}
	setFirst(s)
	appendOne(s)
	fmt.Println("slice:", s)
	appendPtr(&s)
	fmt.Println("slice via pointer:", s)

	p := newCounter()
	p.N++
	fmt.Println("heap counter:", p.N)

	var np *Counter
	fmt.Println("nil pointer:", np == nil)
}
EOF
go run .`],
          ['Ask the compiler which values moved to the heap:', 'go build -gcflags=-m . 2>&1 | grep "moved to heap"']
        ],
        verify: 'Prints `after incValue: 0`, `after incPointer: 1`, `slice: [42 0]`, `slice via pointer: [42 0 1]`, `heap counter: 11`, `nil pointer: true`; the build step shows `moved to heap: c`.'
      }],
      refs: [
        ['A Tour of Go: Pointers', 'https://go.dev/tour/moretypes/1'],
        ['Go FAQ: When are function parameters passed by value?', 'https://go.dev/doc/faq#pass_by_value'],
        ['Go FAQ: Stack or heap?', 'https://go.dev/doc/faq#stack_or_heap'],
        ['Effective Go: Pointers vs. Values', 'https://go.dev/doc/effective_go#pointers_vs_values']
      ],
      quiz: [
        { q: "`func f(x int) { x = 5 }`; `a := 1; f(a)`. What is `a`?",
          o: ["1", "5", "0", "It doesn't compile"],
          why: "`f` receives a copy of `a`. To change `a`, take `*int` and call `f(&a)`." },
        { q: "`func g(s []int) { s[0] = 9 }`; `s := []int{1, 2}; g(s)`. What is `s`?",
          o: ["`[9 2]`", "`[1 2]`", "`[9]`", "It panics"],
          why: "The slice header is copied, but both copies point at the same backing array, so element writes are shared." },
        { q: "`func h(s []int) { s = append(s, 3) }`; `s := []int{1, 2}; h(s)`. What is `len(s)` afterwards?",
          o: ["2", "3", "0", "It depends on capacity"],
          why: "`append` updates only `h`'s local copy of the header. The caller's length never changes; return the slice or pass a pointer." },
        { q: "Is it safe to return a pointer to a local variable, like `return &c`?",
          o: ["Yes; the compiler moves `c` to the heap", "No; it points at freed stack memory", "Only if `c` is declared with `new`", "Only for structs smaller than 64 bytes"],
          why: "Escape analysis notices that `c` outlives the function and allocates it on the heap. The garbage collector frees it later." },
        { q: "`var p *Counter; fmt.Println(p.N)` does what?",
          o: ["Panics with a nil pointer dereference", "Prints 0", "Compile error", "Prints `<nil>`"],
          why: "Reading a field through a nil pointer dereferences address 0, which is a run-time panic." }
      ]
    },
    {
      id: 'go-errors',
      title: 'Error handling: if err != nil, and why no exceptions',
      basics: {
        summary: "Go has no exceptions. A function that can fail returns an **`error` as its last result**, and the caller checks it immediately with `if err != nil`. Errors are ordinary values: you add context by **wrapping** them, and inspect them with **`errors.Is`** and **`errors.As`**.",
        ideas: [
          "**`error` is an interface** with a single method: `Error() string`.",
          "**Wrap with context** as you return: `fmt.Errorf(\"load config: %w\", err)`.",
          "**`errors.Is`** finds a specific error (like `os.ErrNotExist`) anywhere in the chain; **`errors.As`** pulls out a typed error.",
          "**`panic`** is for bugs and impossible states, not for expected failures like a missing file.",
          "**Why**: every place that can fail is visible in the code, so control flow never jumps somewhere hidden."
        ]
      },
      points: [
        "Create errors with `errors.New(\"…\")` or `fmt.Errorf`. Only `%w` wraps (keeps the chain); `%v` flattens the error to text. `errors.Join` combines several errors.",
        "Sentinel errors are package variables, e.g. `var ErrNotFound = errors.New(\"not found\")`. Compare them with `errors.Is(err, ErrNotFound)`, not `==`, so wrapping doesn't break the check.",
        "Custom error types carry data: a struct with an `Error()` method (and `Unwrap()` if it wraps). Extract with `var pe *ParseError; errors.As(err, &pe)`.",
        "Handle an error once: either log it and continue, or return it with context. Logging and returning creates duplicate noise.",
        "Error strings are lowercase with no trailing punctuation, because they get joined: `load config: open app.yaml: no such file or directory`.",
        "The typed-nil trap: returning a nil `*MyErr` as an `error` gives a non-nil interface (it has a type), so `err != nil` is true. Return a literal `nil`.",
        "In Kubernetes code you'll see `apierrors.IsNotFound(err)` and `apierrors.IsConflict(err)`. A controller that returns an error is retried with backoff.",
        "Functions named `MustX` (like `regexp.MustCompile`) panic on error. Use them only with constant input, typically at program start."
      ],
      labs: [{
        title: 'Wrap, inspect and handle errors',
        goal: 'Use a sentinel error, a custom error type, and wrapping with `%w`.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/errors && cd ~/go-lab/errors
go mod init example.com/errors
cat > main.go <<'EOF'
package main

import (
	"errors"
	"fmt"
	"os"
	"strconv"
)

var ErrNegative = errors.New("negative value")

type ParseError struct {
	Line int
	Err  error
}

func (e *ParseError) Error() string { return fmt.Sprintf("line %d: %v", e.Line, e.Err) }
func (e *ParseError) Unwrap() error { return e.Err }

func parseReplicas(line int, s string) (int, error) {
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, &ParseError{Line: line, Err: err}
	}
	if n < 0 {
		return 0, &ParseError{Line: line, Err: ErrNegative}
	}
	return n, nil
}

func loadConfig(path string) error {
	if _, err := os.ReadFile(path); err != nil {
		return fmt.Errorf("load config %s: %w", path, err)
	}
	return nil
}

func main() {
	for i, in := range []string{"3", "-1", "three"} {
		n, err := parseReplicas(i+1, in)
		var pe *ParseError
		switch {
		case err == nil:
			fmt.Println("ok:", n)
		case errors.Is(err, ErrNegative):
			fmt.Println("rejected:", err)
		case errors.As(err, &pe):
			fmt.Println("bad input on line", pe.Line)
		}
	}

	err := loadConfig("missing.yaml")
	fmt.Println(err)
	fmt.Println("not exist?", errors.Is(err, os.ErrNotExist))
}
EOF
go run .`]
        ],
        verify: 'Prints `ok: 3`, `rejected: line 2: negative value`, `bad input on line 3`, `load config missing.yaml: open missing.yaml: no such file or directory`, `not exist? true`.'
      }, {
        title: 'The typed-nil trap',
        goal: 'See why a nil pointer stored in an `error` is not a nil error.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/typednil && cd ~/go-lab/typednil
go mod init example.com/typednil
cat > main.go <<'EOF'
package main

import "fmt"

type MyErr struct{}

func (*MyErr) Error() string { return "boom" }

func check(fail bool) error {
	var e *MyErr
	if fail {
		e = &MyErr{}
	}
	return e // BUG: a nil *MyErr inside a non-nil error
}

func checkFixed(fail bool) error {
	if fail {
		return &MyErr{}
	}
	return nil
}

func main() {
	err := check(false)
	fmt.Printf("check: nil? %v (type %T)\\n", err == nil, err)
	fmt.Println("checkFixed: nil?", checkFixed(false) == nil)
}
EOF
go run .`]
        ],
        verify: 'Prints `check: nil? false (type *main.MyErr)` then `checkFixed: nil? true`.'
      }],
      refs: [
        ['Error handling and Go', 'https://go.dev/blog/error-handling-and-go'],
        ['Working with Errors in Go 1.13', 'https://go.dev/blog/go1.13-errors'],
        ['Package errors', 'https://pkg.go.dev/errors'],
        ['Go FAQ: Why does Go not have exceptions?', 'https://go.dev/doc/faq#exceptions'],
        ['Go FAQ: Why is my nil error value not equal to nil?', 'https://go.dev/doc/faq#nil_error']
      ],
      quiz: [
        { q: "Which verb lets `errors.Is` still find the original error after wrapping?",
          o: ["`fmt.Errorf(\"read: %w\", err)`", "`fmt.Errorf(\"read: %v\", err)`", "`fmt.Errorf(\"read: %s\", err)`", "`errors.New(\"read: \" + err.Error())`"],
          why: "Only `%w` stores the original error so `errors.Is`/`errors.As` can unwrap it. The others keep just the text." },
        { q: "A function declares `var e *MyErr` (nil) and does `return e` as an `error`. What is `err != nil` in the caller?",
          o: ["true", "false", "It panics", "It depends on whether `MyErr` has fields"],
          why: "An interface value is nil only if both its type and value are nil. Here the type is `*MyErr`, so the interface isn't nil. Return a literal `nil` instead." },
        { q: "`err := fmt.Errorf(\"load: %w\", os.ErrNotExist)`. What is `err == os.ErrNotExist`?",
          o: ["false, but `errors.Is(err, os.ErrNotExist)` is true", "true", "false, and `errors.Is` is false too", "It doesn't compile"],
          why: "Wrapping creates a new error value, so `==` fails. `errors.Is` walks the chain and finds the sentinel." },
        { q: "Why does Go return errors instead of throwing exceptions?",
          o: ["Failures stay visible in normal control flow, so each call site decides what to do", "Exceptions are too slow on modern CPUs", "The garbage collector can't handle exceptions", "So that functions can return only one value"],
          why: "Go's designers wanted error handling to be explicit and local. You can see every call that may fail and how it's handled." },
        { q: "When is `panic` the right tool?",
          o: ["For programmer bugs and impossible states, e.g. `regexp.MustCompile` on a constant pattern", "When a file the user named doesn't exist", "When an HTTP request times out", "Whenever a function has more than one error case"],
          why: "Expected failures (bad input, network, missing files) are errors. Panics are for situations where continuing would be wrong and the bug is in the program." }
      ]
    },
    {
      id: 'go-m1-cli',
      title: 'Milestone 1: a CLI that reads a YAML config',
      basics: {
        summary: "Put phase 1 together in a real tool. You'll build `cfgprint`, a command-line program that takes flags, reads a **YAML file into a struct**, validates it, and prints it as text or JSON. It exits with a clear message and a non-zero code when anything goes wrong.",
        ideas: [
          "The stdlib **`flag`** package parses `-config` and `-format`; **cobra** is the choice for multi-command tools like kubectl.",
          "**Struct tags** (`yaml:\"replicas\"`) map YAML keys to exported fields.",
          "Keep **`main` thin**: parse flags, call a package that does the work, turn errors into an exit code.",
          "Return **wrapped errors** from the config package and print them once in `main`.",
          "A **table-driven test** checks good and bad config files."
        ]
      },
      points: [
        "Layout: `main.go` wires flags and output; `config/config.go` holds the `Config` type and `Load(path)`; `testdata/` holds sample files (the go tool ignores `testdata` folders).",
        "`go get gopkg.in/yaml.v3` adds the dependency to `go.mod` and checksums to `go.sum`. `sigs.k8s.io/yaml` is the Kubernetes alternative that reuses `json` tags.",
        "Only exported (capitalised) fields can be filled by a decoder. A lowercase field silently stays at its zero value.",
        "`flag.String` returns a `*string`; read it after `flag.Parse()`. `flag.Usage` customises `-h`.",
        "Write errors to `os.Stderr` and exit with `os.Exit(1)`. `os.Exit` skips deferred calls, so call it only from `main` after cleanup.",
        "Sort map keys before printing (`slices.Sorted(maps.Keys(m))`, Go 1.23+) so output is stable; map iteration order is random.",
        "With cobra: `cobra-cli init` creates `cmd/root.go`; each subcommand is a `*cobra.Command` with `RunE` returning an error. Flags bind to variables with `cmd.Flags().StringVarP`."
      ],
      labs: [{
        title: 'Build cfgprint step by step',
        goal: 'A working CLI with flags, YAML parsing, validation, JSON output, and tests.',
        steps: [
          ['Reference layout you will end up with:', `cfgprint/
├── go.mod
├── go.sum
├── main.go              # flags, output format, exit codes
├── config/
│   ├── config.go        # Config struct, Load(), validation
│   └── config_test.go   # table-driven tests
└── testdata/
    └── app.yaml`],
          ['Create the module and add the YAML library:', `mkdir -p ~/go-lab/cfgprint/config ~/go-lab/cfgprint/testdata && cd ~/go-lab/cfgprint
go mod init example.com/cfgprint
go get gopkg.in/yaml.v3`],
          ['Write a sample config:', `cat > testdata/app.yaml <<'EOF'
name: web
image: nginx:1.27
replicas: 3
ports: [80, 443]
labels:
  tier: frontend
  app: web
EOF`],
          ['Write the config package: a struct with tags, `Load`, and validation:', `cat > config/config.go <<'EOF'
// Package config loads and validates the application config file.
package config

import (
	"errors"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Name     string            \`yaml:"name" json:"name"\`
	Image    string            \`yaml:"image" json:"image"\`
	Replicas int               \`yaml:"replicas" json:"replicas"\`
	Ports    []int             \`yaml:"ports" json:"ports"\`
	Labels   map[string]string \`yaml:"labels" json:"labels,omitempty"\`
}

var ErrInvalid = errors.New("invalid config")

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var c Config
	if err := yaml.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if err := c.validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &c, nil
}

func (c *Config) validate() error {
	switch {
	case c.Name == "":
		return fmt.Errorf("%w: name is required", ErrInvalid)
	case c.Replicas < 0:
		return fmt.Errorf("%w: replicas must be >= 0, got %d", ErrInvalid, c.Replicas)
	}
	return nil
}
EOF`],
          ['Write `main.go`: parse flags, load, print, and map errors to exit codes:', `cat > main.go <<'EOF'
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"maps"
	"os"
	"slices"

	"example.com/cfgprint/config"
)

func main() {
	path := flag.String("config", "app.yaml", "path to the YAML config file")
	format := flag.String("format", "text", "output format: text or json")
	flag.Parse()

	if err := run(*path, *format); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(path, format string) error {
	c, err := config.Load(path)
	if err != nil {
		return err
	}
	switch format {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(c)
	case "text":
		fmt.Printf("name:     %s\\nimage:    %s\\nreplicas: %d\\nports:    %v\\n", c.Name, c.Image, c.Replicas, c.Ports)
		for _, k := range slices.Sorted(maps.Keys(c.Labels)) {
			fmt.Printf("label:    %s=%s\\n", k, c.Labels[k])
		}
		return nil
	default:
		return fmt.Errorf("unknown format %q (want text or json)", format)
	}
}
EOF`],
          ['Add a table-driven test:', `cat > config/config_test.go <<'EOF'
package config

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLoad(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	tests := []struct {
		name    string
		path    string
		wantErr error
	}{
		{"valid", write("ok.yaml", "name: web\\nreplicas: 2\\n"), nil},
		{"missing name", write("noname.yaml", "replicas: 2\\n"), ErrInvalid},
		{"negative replicas", write("neg.yaml", "name: web\\nreplicas: -1\\n"), ErrInvalid},
		{"missing file", filepath.Join(dir, "nope.yaml"), os.ErrNotExist},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Load(tt.path)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Load(%s) error = %v, want %v", tt.path, err, tt.wantErr)
			}
		})
	}
}
EOF
go test ./...`],
          ['Run the tool with good and bad input:', `go run . -config testdata/app.yaml
go run . -config testdata/app.yaml -format json
go run . -config nope.yaml || echo "exit code: $?"`]
        ],
        verify: '`go test` prints `ok  example.com/cfgprint/config`. The text run prints `name: web`, `replicas: 3`, `ports: [80 443]` and the labels sorted (`app=web` before `tier=frontend`); `-format json` prints indented JSON; the bad path prints `error: read nope.yaml: open nope.yaml: no such file or directory` and `exit code: 1`.'
      }],
      refs: [
        ['Package flag', 'https://pkg.go.dev/flag'],
        ['Package gopkg.in/yaml.v3', 'https://pkg.go.dev/gopkg.in/yaml.v3'],
        ['Tutorial: Create a Go module', 'https://go.dev/doc/tutorial/create-module'],
        ['Go wiki: Table-driven tests', 'https://go.dev/wiki/TableDrivenTests'],
        ['Cobra user guide', 'https://github.com/spf13/cobra/blob/main/site/content/user_guide.md']
      ],
      quiz: [
        { q: "Your struct has a field `name string` tagged `yaml:\"name\"`. After `yaml.Unmarshal`, `name` is empty even though the file sets it. Why?",
          o: ["The field is unexported, so the decoder can't set it", "YAML keys are case-sensitive and need `Name:`", "Struct tags only work for JSON", "`Unmarshal` needs a non-pointer argument"],
          why: "Decoders use reflection, which can only set exported (capitalised) fields. Rename it to `Name`." },
        { q: "`path := flag.String(\"config\", \"app.yaml\", \"…\")`. How do you read the value?",
          o: ["`*path`, after calling `flag.Parse()`", "`path`, before `flag.Parse()`", "`flag.Get(\"config\")`", "`os.Args[1]`"],
          why: "`flag.String` returns a pointer that `flag.Parse` fills in, so dereference it after parsing." },
        { q: "`defer f.Close()` is followed later by `os.Exit(1)` in the same function. Does `f.Close()` run?",
          o: ["No, `os.Exit` ends the program without running deferred calls", "Yes, defers always run", "Only if the file was opened for writing", "Only on Linux"],
          why: "`os.Exit` terminates immediately. That's why the lab keeps the work in `run()` and calls `os.Exit` only in `main`." },
        { q: "What does `go get gopkg.in/yaml.v3` do in a module?",
          o: ["Adds the requirement to `go.mod` and its checksums to `go.sum`", "Installs a `yaml` binary into `$GOPATH/bin`", "Copies the source into a `vendor/` folder", "Nothing until you run `go build`"],
          why: "In module mode `go get` manages dependencies of the current module. `go install pkg@version` is what installs binaries." },
        { q: "Why sort the label keys before printing them?",
          o: ["Map iteration order is randomised, so output would change between runs", "`fmt` can't print unsorted maps", "YAML requires sorted keys", "Sorting makes lookups faster"],
          why: "Go deliberately randomises map iteration order. Sort the keys whenever output must be stable, for example in tests." }
      ]
    }
  ]
});
