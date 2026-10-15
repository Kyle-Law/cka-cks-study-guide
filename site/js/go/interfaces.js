// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'interfaces', title: 'Phase 2 · Interfaces & OO Patterns', weight: 15,
  topics: [
    {
      id: 'go-methods',
      title: 'Methods: value and pointer receivers, embedding',
      basics: {
        summary: "A method is a function with a **receiver**, written before its name: `func (c *Counter) Inc()`. You can add methods to any named type you declare, not just structs. Go has no classes or inheritance; instead you **embed** one type in another to reuse its fields and methods.",
        ideas: [
          "**Value receiver** `(c Counter)`: the method works on a copy and can't change the caller's value.",
          "**Pointer receiver** `(c *Counter)`: the method can modify the original and avoids copying.",
          "Go **takes the address for you**: `c.Inc()` becomes `(&c).Inc()` when `c` is a variable.",
          "Methods work on any named type: `type Celsius float64` can have a `String()` method.",
          "**Embedding** promotes the inner type's fields and methods: composition instead of inheritance."
        ]
      },
      points: [
        "Method sets: a value of type `T` has only the value-receiver methods; `*T` has both. This decides which interfaces each one satisfies.",
        "Map elements and function results aren't addressable, so `m[\"a\"].Inc()` with a pointer receiver doesn't compile. Store pointers in the map, or copy, modify and write back.",
        "If any method needs a pointer receiver, give them all pointer receivers so the type behaves consistently.",
        "Embedding (`type Pod struct { Meta; Image string }`) promotes `Meta`'s fields and methods to `Pod`. The outer type can define a method with the same name to shadow it. The promoted method's receiver is still the inner `Meta`: there is no virtual dispatch.",
        "Method values bind the receiver: `inc := c.Inc` then `inc()` updates `c`. Method expressions (`(*Counter).Inc`) take the receiver as the first argument.",
        "`String() string` makes a type a `fmt.Stringer`, so `fmt.Println` prints it nicely. `Error() string` makes it an `error`.",
        "You can't add methods to types from other packages. Declare your own type (`type MyDuration time.Duration`) or wrap it in a struct.",
        "Constructors are plain functions named `NewX` returning `*X`. Kubernetes API types get generated methods such as `DeepCopy()` and `DeepCopyObject()`."
      ],
      labs: [{
        title: 'Receivers, method values and embedding',
        goal: 'Write methods on a non-struct type, a pointer-receiver counter, and an embedded struct.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/methods && cd ~/go-lab/methods
go mod init example.com/methods
cat > main.go <<'EOF'
package main

import "fmt"

type Celsius float64

func (c Celsius) String() string      { return fmt.Sprintf("%.1f°C", float64(c)) }
func (c Celsius) Fahrenheit() float64 { return float64(c)*9/5 + 32 }

type Counter struct{ hits int }

func (c *Counter) Inc()     { c.hits++ }
func (c Counter) Hits() int { return c.hits }

type Meta struct{ Name, Namespace string }

func (m Meta) Key() string { return m.Namespace + "/" + m.Name }

type Pod struct {
	Meta  // embedded: Pod gets Name, Namespace and Key()
	Image string
}

func main() {
	t := Celsius(21.5)
	fmt.Println(t, t.Fahrenheit())

	var c Counter
	c.Inc() // Go calls (&c).Inc()
	c.Inc()
	fmt.Println("hits:", c.Hits())

	inc := c.Inc // method value: bound to &c
	inc()
	fmt.Println("after method value:", c.Hits())

	p := Pod{Meta: Meta{Name: "web", Namespace: "prod"}, Image: "nginx"}
	fmt.Println(p.Key(), p.Name)
}
EOF
go run .`],
          ['Now see why map elements can\'t use pointer methods. This is meant to fail:', `mkdir -p broken && cat > broken/main.go <<'EOF'
package main

type Counter struct{ hits int }

func (c *Counter) Inc() { c.hits++ }

func main() {
	m := map[string]Counter{"a": {}}
	m["a"].Inc()
}
EOF
go build -o /dev/null ./broken || echo "build failed as expected"`]
        ],
        verify: 'Prints `21.5°C 70.7`, `hits: 2`, `after method value: 3`, `prod/web web`; the second step reports `cannot call pointer method Inc on Counter` and `build failed as expected`.'
      }],
      refs: [
        ['A Tour of Go: Methods', 'https://go.dev/tour/methods/1'],
        ['Effective Go: Methods', 'https://go.dev/doc/effective_go#methods'],
        ['Effective Go: Embedding', 'https://go.dev/doc/effective_go#embedding'],
        ['Go FAQ: Should I define methods on values or pointers?', 'https://go.dev/doc/faq#methods_on_values_or_pointers'],
        ['Go spec: Method sets', 'https://go.dev/ref/spec#Method_sets']
      ],
      quiz: [
        { q: "`func (c Counter) Inc() { c.hits++ }`. After `var c Counter; c.Inc()`, what is `c.hits`?",
          o: ["0", "1", "It panics", "It doesn't compile"],
          why: "A value receiver gets a copy, so the increment is lost. Use `func (c *Counter) Inc()` to change the caller's value." },
        { q: "`Inc` has a pointer receiver and `type Incer interface{ Inc() }`. Does `var i Incer = Counter{}` compile?",
          o: ["No: only `*Counter` has `Inc` in its method set", "Yes: Go takes the address automatically", "Yes, but calling `i.Inc()` panics", "Only if `Counter` has no fields"],
          why: "Automatic `&` applies to method calls on variables, not to interface satisfaction. Use `var i Incer = &Counter{}`." },
        { q: "`type Pod struct { Meta; Image string }` and `Meta` has a `Key()` method. What does `p.Key()` do?",
          o: ["Calls `p.Meta.Key()`; the method is promoted", "Compile error: `Pod` has no `Key` method", "Calls `Key` with `p` as the receiver", "It works only if `Pod` declares `Key` too"],
          why: "Embedding promotes the embedded type's methods. The receiver is still the inner `Meta` value." },
        { q: "How do you add a `String()` method to plain `float64` temperatures?",
          o: ["Declare `type Celsius float64` and add the method to `Celsius`", "`func (f float64) String() string`", "Embed `float64` in an interface", "You can't; only structs have methods"],
          why: "Methods need a named type declared in your package. Built-in and other packages' types can't get new methods directly." },
        { q: "When should a method use a pointer receiver?",
          o: ["When it modifies the receiver or the struct is large, and then usually for all its methods", "Always, pointers are faster", "Never for exported methods", "Only when the struct contains a slice"],
          why: "Pointer receivers allow mutation and avoid copies. Mixing receiver kinds on one type is confusing, so pick one consistently." }
      ]
    },
    {
      id: 'go-interfaces',
      title: 'Interfaces: implicit duck typing, io.Reader and io.Writer',
      basics: {
        summary: "An interface lists method signatures. Any type with those methods **satisfies it automatically**, with no `implements` keyword. Code written against an interface such as `io.Reader` works with files, network connections and in-memory buffers alike. Kubernetes uses the same idea to keep the API server independent of etcd.",
        ideas: [
          "**Implicit**: if a type has the methods, it fits the interface. No declaration needed.",
          "The best interfaces are **tiny**: `io.Reader` and `io.Writer` have one method each.",
          "**Accept interfaces, return concrete types**: callers can pass anything that fits, and still get full types back.",
          "Define an interface **where it's used** (the consumer), listing only the methods you need.",
          "Swapping implementations (real vs fake, etcd vs memory) becomes trivial."
        ]
      },
      points: [
        "`io.Reader` is `Read(p []byte) (n int, err error)`. It fills up to `len(p)` bytes and returns `io.EOF` at the end. It may return `n > 0` together with an error, so handle the bytes first.",
        "Because so much speaks `io.Reader`/`io.Writer`, you can chain them: `io.Copy(gzip.NewWriter(f), resp.Body)`, `bufio.NewScanner(os.Stdin)`, `json.NewDecoder(r.Body)`.",
        "`*bytes.Buffer`, `*os.File`, `net.Conn`, `http.ResponseWriter` and `*strings.Builder` are all writers, so `fmt.Fprintf` works with each.",
        "Compile-time check that a type satisfies an interface: `var _ io.Writer = (*upperWriter)(nil)`.",
        "Interfaces compose: `io.ReadWriter` embeds `io.Reader` and `io.Writer`; `io.ReadCloser` adds `Close`.",
        "Kubernetes: the API server's registry stores objects through `storage.Interface` in `k8s.io/apiserver/pkg/storage`; etcd3 is one implementation behind it. client-go exposes `kubernetes.Interface`, so tests can use `fake.NewSimpleClientset()` instead of a real cluster.",
        "\"The bigger the interface, the weaker the abstraction\" (Go proverb). Prefer several one- or two-method interfaces to one large one.",
        "Calls through an interface are dynamic dispatch: the interface value stores the concrete type, and the call looks up its method at run time."
      ],
      labs: [{
        title: 'Write your own Reader and Writer',
        goal: 'Build an uppercase writer and a byte-counting reader, then plug them into `io.Copy`.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/iface && cd ~/go-lab/iface
go mod init example.com/iface
cat > main.go <<'EOF'
package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"strings"
)

// upperWriter wraps any io.Writer and upper-cases what passes through.
type upperWriter struct{ w io.Writer }

func (u upperWriter) Write(p []byte) (int, error) { return u.w.Write(bytes.ToUpper(p)) }

// countingReader wraps any io.Reader and counts the bytes read.
type countingReader struct {
	r io.Reader
	n int
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += n
	return n, err
}

var (
	_ io.Writer = upperWriter{}
	_ io.Reader = (*countingReader)(nil)
)

type Shape interface{ Area() float64 }

type Rect struct{ W, H float64 }
type Circle struct{ R float64 }

func (r Rect) Area() float64   { return r.W * r.H }
func (c Circle) Area() float64 { return math.Pi * c.R * c.R }

func total(shapes ...Shape) float64 {
	sum := 0.0
	for _, s := range shapes {
		sum += s.Area()
	}
	return sum
}

func main() {
	src := &countingReader{r: strings.NewReader("hello, interfaces\\n")}
	if _, err := io.Copy(upperWriter{os.Stdout}, src); err != nil {
		log.Fatal(err)
	}
	fmt.Println("bytes read:", src.n)

	var buf bytes.Buffer
	fmt.Fprintf(&buf, "%d pods", 3) // *bytes.Buffer is an io.Writer
	fmt.Println(buf.String())

	fmt.Printf("%.2f\\n", total(Rect{2, 3}, Circle{1}))
}
EOF
go run .`]
        ],
        verify: 'Prints `HELLO, INTERFACES`, `bytes read: 18`, `3 pods`, `9.14`.'
      }],
      refs: [
        ['A Tour of Go: Interfaces', 'https://go.dev/tour/methods/9'],
        ['Effective Go: Interfaces', 'https://go.dev/doc/effective_go#interfaces'],
        ['Package io', 'https://pkg.go.dev/io'],
        ['k8s.io/apiserver storage.Interface', 'https://pkg.go.dev/k8s.io/apiserver/pkg/storage#Interface'],
        ['client-go fake clientset', 'https://pkg.go.dev/k8s.io/client-go/kubernetes/fake']
      ],
      quiz: [
        { q: "How does a Go type declare that it implements `io.Writer`?",
          o: ["It doesn't; having a matching `Write` method is enough", "`type T struct{} implements io.Writer`", "By embedding `io.Writer`", "By registering with `io.Register`"],
          why: "Interfaces are satisfied implicitly. That lets you write interfaces for types you don't own." },
        { q: "What is `var _ io.Writer = (*upperWriter)(nil)` for?",
          o: ["A compile-time check that `*upperWriter` satisfies `io.Writer`", "It allocates a global writer", "It registers the type with the io package", "It prevents nil writers at run time"],
          why: "The blank assignment costs nothing at run time but fails the build if the method set doesn't match." },
        { q: "What does an `io.Reader` return when the data runs out?",
          o: ["`io.EOF` as the error (possibly with n > 0 on the final call)", "`n == -1`", "A nil error and n == 0, forever", "It panics"],
          why: "`io.EOF` signals a normal end of input. Process any bytes returned before checking the error." },
        { q: "What does \"accept interfaces, return concrete types\" mean?",
          o: ["Parameters ask only for the behaviour they need; results give callers the full type", "Every function must take `any`", "Return interfaces so you can change the type later", "Interfaces should only be used in tests"],
          why: "Small parameter interfaces make functions reusable; concrete results don't hide methods or force callers to type-assert." },
        { q: "How does the Kubernetes API server avoid depending directly on etcd?",
          o: ["Its registry writes through `storage.Interface`; etcd3 is one implementation", "It shells out to `etcdctl`", "It keeps everything in a Go map", "It generates SQL for etcd"],
          why: "The storage layer is behind an interface, so tests and alternative backends plug in without changing the registry code." }
      ]
    },
    {
      id: 'go-assert',
      title: 'Type assertions, any, and interface nil-ness',
      basics: {
        summary: "`any` (another name for `interface{}`) can hold a value of any type. To get the concrete value back you use a **type assertion** `v, ok := x.(string)` or a **type switch**. You meet `any` at boundaries, such as decoded JSON or Kubernetes `Unstructured` objects, so converting safely matters.",
        ideas: [
          "**`any` = `interface{}`**: it can hold anything, and tells you nothing about it.",
          "`s := x.(string)` **panics** if `x` isn't a string; **`s, ok := x.(string)`** never panics.",
          "A **type switch** `switch v := x.(type)` handles several types in one place.",
          "You can assert to an **interface** too: `if s, ok := x.(fmt.Stringer); ok`.",
          "An interface is **nil only if its type and value are both nil**."
        ]
      },
      points: [
        "An interface value is a pair: (dynamic type, dynamic value). `var p *int; var x any = p` gives `(*int, nil)`, which is not equal to `nil`.",
        "`json.Unmarshal` into `any` produces `map[string]any`, `[]any`, `string`, `bool`, `nil`, and `float64` for every number, including whole numbers.",
        "Kubernetes `unstructured.Unstructured` holds `Object map[string]interface{}`. Use helpers like `unstructured.NestedString(obj, \"spec\", \"image\")` instead of chains of assertions.",
        "In a type switch, a case listing one type gives `v` that type; a case listing several (`case int, int64:`) leaves `v` as the interface type.",
        "`==` on interfaces compares type and value. It panics at run time if the dynamic type isn't comparable (slices, maps, funcs).",
        "Prefer concrete types or generics (`func Max[T cmp.Ordered](a, b T) T`) over `any` when you know the types at compile time.",
        "`errors.As` is a type assertion that also walks wrapped errors. The `reflect` package is a last resort for truly dynamic code."
      ],
      labs: [{
        title: 'Walk decoded JSON safely',
        goal: 'Decode JSON into `any`, inspect it with a type switch, and see two classic surprises.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/assert && cd ~/go-lab/assert
go mod init example.com/assert
cat > main.go <<'EOF'
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"maps"
	"slices"
	"strconv"
)

func describe(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return "string " + strconv.Quote(x)
	case float64:
		return fmt.Sprintf("number %g", x)
	case bool:
		return fmt.Sprintf("bool %t", x)
	case []any:
		return fmt.Sprintf("list of %d", len(x))
	case map[string]any:
		return fmt.Sprintf("object with %d keys", len(x))
	default:
		return fmt.Sprintf("other %T", x)
	}
}

func main() {
	doc := \`{"kind":"Pod","spec":{"replicas":3,"paused":false,"containers":[{"name":"web"}]},"status":null}\`
	var obj any
	if err := json.Unmarshal([]byte(doc), &obj); err != nil {
		log.Fatal(err)
	}

	m, ok := obj.(map[string]any)
	if !ok {
		log.Fatal("top level is not an object")
	}
	for _, k := range slices.Sorted(maps.Keys(m)) {
		fmt.Println(k+":", describe(m[k]))
	}

	spec, _ := m["spec"].(map[string]any)
	fmt.Printf("replicas is %T = %v\\n", spec["replicas"], spec["replicas"])
	_, isInt := spec["replicas"].(int)
	fmt.Println("is int?", isInt)

	var p *int
	var x any = p
	fmt.Println("x == nil?", x == nil)
}
EOF
go run .`]
        ],
        verify: 'Prints `kind: string "Pod"`, `spec: object with 3 keys`, `status: null`, `replicas is float64 = 3`, `is int? false`, `x == nil? false`.'
      }],
      refs: [
        ['A Tour of Go: Type assertions', 'https://go.dev/tour/methods/15'],
        ['A Tour of Go: Type switches', 'https://go.dev/tour/methods/16'],
        ['Go spec: Type assertions', 'https://go.dev/ref/spec#Type_assertions'],
        ['Package encoding/json: Unmarshal', 'https://pkg.go.dev/encoding/json#Unmarshal'],
        ['k8s.io/apimachinery unstructured', 'https://pkg.go.dev/k8s.io/apimachinery/pkg/apis/meta/v1/unstructured']
      ],
      quiz: [
        { q: "`var x any = \"hi\"; n := x.(int)`. What happens?",
          o: ["It panics: interface conversion", "`n` is 0", "Compile error", "`n` is 2"],
          why: "The single-result assertion panics when the dynamic type doesn't match. Use the comma-ok form to test safely." },
        { q: "`var x any = \"hi\"; n, ok := x.(int)`. What are `n` and `ok`?",
          o: ["`0` and `false`", "It panics", "`2` and `true`", "Compile error"],
          why: "The comma-ok form never panics; on mismatch it returns the zero value and false." },
        { q: "You unmarshal `{\"replicas\": 3}` into `map[string]any`. What is the type of `m[\"replicas\"]`?",
          o: ["`float64`", "`int`", "`int64`", "`json.Number`"],
          why: "`encoding/json` decodes every JSON number into `float64` when the target is `any`, unless you call `UseNumber` on a decoder." },
        { q: "`var p *int; var x any = p; fmt.Println(x == nil)` prints:",
          o: ["`false`", "`true`", "It panics", "Compile error"],
          why: "`x` holds the type `*int` with a nil value. An interface equals nil only when it has no type at all." },
        { q: "What is the difference between `any` and `interface{}`?",
          o: ["None; `any` is an alias added in Go 1.18", "`any` also accepts nil", "`interface{}` can't hold structs", "`any` is faster"],
          why: "`any` is a predeclared alias for `interface{}`, introduced with generics for readability." }
      ]
    },
    {
      id: 'go-m2-store',
      title: 'Milestone 2: a mock API server with swappable stores',
      basics: {
        summary: "Build `podstore`, a tiny API server for Pod records. The HTTP handlers only know a **`Store` interface**. Two implementations sit behind it: an **in-memory map** and a **JSON file**. A flag picks one at start-up, and one test suite runs against both, the same way Kubernetes hides etcd behind `storage.Interface`.",
        ideas: [
          "**One interface, two implementations**: `MemStore` and `FileStore` both satisfy `Store`.",
          "Handlers take a `Store`, so they **never change** when you swap backends.",
          "A **shared test suite** proves both stores behave the same.",
          "A **sentinel error** `ErrNotFound` becomes HTTP 404 in one place.",
          "Write files **atomically** (temp file + rename) so readers never see half a file."
        ]
      },
      points: [
        "Keep the interface small: `Get`, `List`, `Put`, `Delete`. Add methods only when a caller needs them.",
        "Both stores need a mutex because `net/http` runs each request in its own goroutine (phase 3 explains why). `sync.RWMutex` lets many readers in at once.",
        "`var _ Store = (*MemStore)(nil)` in each file turns a missing method into a compile error right where it belongs.",
        "Go 1.22's `http.ServeMux` matches methods and wildcards: `mux.HandleFunc(\"GET /pods/{name}\", h)` and `r.PathValue(\"name\")`.",
        "Map errors to status codes in one helper: `errors.Is(err, store.ErrNotFound)` → 404, everything else → 500.",
        "Return lists sorted by name so responses (and tests) are stable even though maps are unordered.",
        "Next steps: add a `Watch` method returning a channel of events, which is how the real API server feeds controllers."
      ],
      labs: [{
        title: 'Build podstore step by step',
        goal: 'An HTTP API whose storage backend you can swap with a flag, plus tests that run against both backends.',
        steps: [
          ['Reference layout you will end up with:', `podstore/
├── go.mod
├── main.go             # flags, pick a Store, start HTTP
├── api/
│   └── handlers.go     # HTTP handlers that only know store.Store
└── store/
    ├── store.go        # Pod type, Store interface, ErrNotFound
    ├── memory.go       # MemStore: map + RWMutex
    ├── file.go         # FileStore: JSON file on disk
    └── store_test.go   # one suite, run against both stores`],
          ['Create the module:', `mkdir -p ~/go-lab/podstore/api ~/go-lab/podstore/store && cd ~/go-lab/podstore
go mod init example.com/podstore`],
          ['Define the contract in `store/store.go`:', `cat > store/store.go <<'EOF'
// Package store defines how Pods are stored, independent of the backend.
package store

import (
	"errors"
	"slices"
	"strings"
)

type Pod struct {
	Name  string \`json:"name"\`
	Image string \`json:"image"\`
	Phase string \`json:"phase"\`
}

var ErrNotFound = errors.New("not found")

type Store interface {
	Get(name string) (Pod, error)
	List() ([]Pod, error)
	Put(p Pod) error
	Delete(name string) error
}

// sorted returns the map's Pods ordered by name.
func sorted(pods map[string]Pod) []Pod {
	out := make([]Pod, 0, len(pods))
	for _, p := range pods {
		out = append(out, p)
	}
	slices.SortFunc(out, func(a, b Pod) int { return strings.Compare(a.Name, b.Name) })
	return out
}
EOF`],
          ['Implement the in-memory store in `store/memory.go`:', `cat > store/memory.go <<'EOF'
package store

import (
	"fmt"
	"sync"
)

type MemStore struct {
	mu   sync.RWMutex
	pods map[string]Pod
}

var _ Store = (*MemStore)(nil)

func NewMemStore() *MemStore { return &MemStore{pods: map[string]Pod{}} }

func (s *MemStore) Get(name string) (Pod, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.pods[name]
	if !ok {
		return Pod{}, fmt.Errorf("pod %q: %w", name, ErrNotFound)
	}
	return p, nil
}

func (s *MemStore) List() ([]Pod, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return sorted(s.pods), nil
}

func (s *MemStore) Put(p Pod) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pods[p.Name] = p
	return nil
}

func (s *MemStore) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.pods[name]; !ok {
		return fmt.Errorf("pod %q: %w", name, ErrNotFound)
	}
	delete(s.pods, name)
	return nil
}
EOF`],
          ['Implement the JSON-file store in `store/file.go`:', `cat > store/file.go <<'EOF'
package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
)

type FileStore struct {
	mu   sync.Mutex
	path string
}

var _ Store = (*FileStore)(nil)

func NewFileStore(path string) *FileStore { return &FileStore{path: path} }

func (s *FileStore) load() (map[string]Pod, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]Pod{}, nil
	}
	if err != nil {
		return nil, err
	}
	pods := map[string]Pod{}
	if err := json.Unmarshal(data, &pods); err != nil {
		return nil, fmt.Errorf("decode %s: %w", s.path, err)
	}
	return pods, nil
}

func (s *FileStore) save(pods map[string]Pod) error {
	data, err := json.MarshalIndent(pods, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path) // atomic replace
}

func (s *FileStore) Get(name string) (Pod, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	pods, err := s.load()
	if err != nil {
		return Pod{}, err
	}
	p, ok := pods[name]
	if !ok {
		return Pod{}, fmt.Errorf("pod %q: %w", name, ErrNotFound)
	}
	return p, nil
}

func (s *FileStore) List() ([]Pod, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	pods, err := s.load()
	if err != nil {
		return nil, err
	}
	return sorted(pods), nil
}

func (s *FileStore) Put(p Pod) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	pods, err := s.load()
	if err != nil {
		return err
	}
	pods[p.Name] = p
	return s.save(pods)
}

func (s *FileStore) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	pods, err := s.load()
	if err != nil {
		return err
	}
	if _, ok := pods[name]; !ok {
		return fmt.Errorf("pod %q: %w", name, ErrNotFound)
	}
	delete(pods, name)
	return s.save(pods)
}
EOF`],
          ['Write one test suite and run it against both stores:', `cat > store/store_test.go <<'EOF'
package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func testStore(t *testing.T, s Store) {
	t.Helper()
	if _, err := s.Get("web"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Get on empty store: got %v, want ErrNotFound", err)
	}
	for _, p := range []Pod{{Name: "web", Image: "nginx"}, {Name: "api", Image: "golang"}} {
		if err := s.Put(p); err != nil {
			t.Fatal(err)
		}
	}
	if got, err := s.Get("web"); err != nil || got.Image != "nginx" {
		t.Fatalf("Get(web) = %+v, %v", got, err)
	}
	list, err := s.List()
	if err != nil || len(list) != 2 || list[0].Name != "api" {
		t.Fatalf("List() = %+v, %v; want api first", list, err)
	}
	if err := s.Delete("web"); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete("web"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second Delete: got %v, want ErrNotFound", err)
	}
}

func TestMemStore(t *testing.T)  { testStore(t, NewMemStore()) }
func TestFileStore(t *testing.T) { testStore(t, NewFileStore(filepath.Join(t.TempDir(), "pods.json"))) }
EOF
go test ./store/ -v 2>&1 | grep -E "^(--- |ok|FAIL)"`],
          ['Write handlers that only depend on the interface, in `api/handlers.go`:', `cat > api/handlers.go <<'EOF'
// Package api serves Pods over HTTP from any store.Store.
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"example.com/podstore/store"
)

type Server struct{ Store store.Store }

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /pods", s.list)
	mux.HandleFunc("GET /pods/{name}", s.get)
	mux.HandleFunc("PUT /pods/{name}", s.put)
	mux.HandleFunc("DELETE /pods/{name}", s.delete)
	return mux
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	pods, err := s.Store.List()
	if err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, pods)
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	pod, err := s.Store.Get(r.PathValue("name"))
	if err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, pod)
}

func (s *Server) put(w http.ResponseWriter, r *http.Request) {
	var p store.Pod
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	p.Name = r.PathValue("name")
	if p.Phase == "" {
		p.Phase = "Pending"
	}
	if err := s.Store.Put(p); err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) delete(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.Delete(r.PathValue("name")); err != nil {
		httpError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func httpError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}
EOF`],
          ['Pick the store with a flag in `main.go`:', `cat > main.go <<'EOF'
package main

import (
	"flag"
	"log"
	"net/http"

	"example.com/podstore/api"
	"example.com/podstore/store"
)

func main() {
	kind := flag.String("store", "memory", "storage backend: memory or file")
	path := flag.String("file", "pods.json", "data file for -store=file")
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()

	var st store.Store
	switch *kind {
	case "memory":
		st = store.NewMemStore()
	case "file":
		st = store.NewFileStore(*path)
	default:
		log.Fatalf("unknown store %q", *kind)
	}

	srv := &api.Server{Store: st}
	log.Printf("listening on %s with the %s store", *addr, *kind)
	log.Fatal(http.ListenAndServe(*addr, srv.Routes()))
}
EOF
go build -o podstore .`],
          ['Run it with the file store and call the API:', `./podstore -store file & sleep 1
curl -s -X PUT localhost:8080/pods/web -d '{"image":"nginx:1.27"}'
curl -s -X PUT localhost:8080/pods/api -d '{"image":"golang:1.24","phase":"Running"}'
curl -s localhost:8080/pods
curl -s -o /dev/null -w "missing pod: %{http_code}\\n" localhost:8080/pods/nope
kill $!`],
          ['Restart with the same file: the data survives. Then try the memory store:', `./podstore -store file & sleep 1
curl -s localhost:8080/pods/web; kill $!
./podstore -store memory & sleep 1
curl -s localhost:8080/pods; kill $!`]
        ],
        verify: 'Tests print `--- PASS: TestMemStore` and `--- PASS: TestFileStore`. The list returns `api` before `web`; the missing Pod returns `404`; after the restart the file store still returns `web`, while the fresh memory store returns `[]`.'
      }],
      refs: [
        ['Package net/http: ServeMux patterns', 'https://pkg.go.dev/net/http#hdr-Patterns-ServeMux'],
        ['Routing enhancements for Go 1.22', 'https://go.dev/blog/routing-enhancements'],
        ['Package sync: RWMutex', 'https://pkg.go.dev/sync#RWMutex'],
        ['Go wiki: CodeReviewComments (Interfaces)', 'https://go.dev/wiki/CodeReviewComments#interfaces'],
        ['k8s.io/apiserver storage.Interface', 'https://pkg.go.dev/k8s.io/apiserver/pkg/storage#Interface']
      ],
      quiz: [
        { q: "What does `var _ Store = (*MemStore)(nil)` do?",
          o: ["Fails the build if `*MemStore` stops satisfying `Store`", "Creates a global default store", "Registers MemStore as the default implementation", "Prevents MemStore from being nil"],
          why: "It's a zero-cost compile-time assertion. The error appears next to the type, not at some distant call site." },
        { q: "Why do the handlers take a `store.Store` instead of a `*store.MemStore`?",
          o: ["Any backend (memory, file, a test fake) can be plugged in without changing them", "Interfaces are faster than pointers", "`net/http` requires interfaces", "Pointers can't be stored in structs"],
          why: "Depending on behaviour, not a concrete type, is what makes the storage swappable." },
        { q: "All `MemStore` methods have pointer receivers. Does `var s store.Store = store.MemStore{}` compile?",
          o: ["No; only `*MemStore` satisfies `Store`", "Yes", "Yes, but `Put` panics", "Only inside package store"],
          why: "Pointer-receiver methods are in `*MemStore`'s method set, not `MemStore`'s. Use `NewMemStore()`, which returns a pointer." },
        { q: "Why does `FileStore.save` write to `pods.json.tmp` and then rename it?",
          o: ["Rename is atomic, so a crash or reader never sees a half-written file", "JSON files must end in `.tmp`", "It's faster than writing directly", "It avoids needing a mutex"],
          why: "Renaming within a filesystem replaces the file in one step. Writing in place could leave truncated JSON after a crash." },
        { q: "With `mux.HandleFunc(\"GET /pods/{name}\", h)`, how does the handler read `name`?",
          o: ["`r.PathValue(\"name\")`", "`r.URL.Query().Get(\"name\")`", "`mux.Vars(r)[\"name\"]`", "`r.Form[\"name\"]`"],
          why: "Go 1.22 added wildcards to `ServeMux`; `PathValue` returns the matched segment. `mux.Vars` belongs to the gorilla/mux library." }
      ]
    }
  ]
});
