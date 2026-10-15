// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'networking', title: 'Phase 4 · Networking & RPC', weight: 15,
  topics: [
    {
      id: 'go-http',
      title: 'net/http: servers, middleware and clients',
      basics: {
        summary: "Go's standard library includes a production-grade HTTP server and client. A server is built from **handlers** (anything with a `ServeHTTP` method), a **ServeMux** that routes requests to them, and **middleware** that wraps handlers. A good client sets **timeouts** and always **closes response bodies**.",
        ideas: [
          "**`http.Handler`** is one method: `ServeHTTP(w http.ResponseWriter, r *http.Request)`.",
          "Go 1.22's **ServeMux** routes by method and path: `\"GET /hello/{name}\"`.",
          "**Middleware** is a function `func(http.Handler) http.Handler` that wraps another handler.",
          "The default client has **no timeout**; set one, or use a context, and `defer resp.Body.Close()`.",
          "**Graceful shutdown**: on SIGTERM, `srv.Shutdown(ctx)` finishes in-flight requests before exiting."
        ]
      },
      points: [
        "Every request runs in its own goroutine, so handlers must be safe for concurrent use.",
        "Set headers before the first `Write`. The first `Write` sends status 200 if you haven't called `WriteHeader`; a later `WriteHeader` is ignored with a \"superfluous WriteHeader\" log.",
        "`http.Error(w, msg, code)` writes a plain-text error. For JSON, set `Content-Type: application/json` and use `json.NewEncoder(w).Encode(v)`.",
        "Use `http.Server{ReadHeaderTimeout: …}` rather than bare `http.ListenAndServe` in production, so slow clients can't hold connections forever.",
        "Kubernetes sends SIGTERM, waits `terminationGracePeriodSeconds`, then SIGKILL. Catch SIGTERM with `signal.NotifyContext` and call `Shutdown`.",
        "Expose `/healthz` (liveness) and `/readyz` (readiness) for probes.",
        "Reuse one `http.Client`: it pools connections. Read the body to the end and close it so the connection can be reused.",
        "Test handlers with `httptest.NewRecorder()` and `httptest.NewRequest`; test clients against `httptest.NewServer`."
      ],
      labs: [{
        title: 'A server with routing, middleware, tests and graceful shutdown',
        goal: 'Build a small service the way production Go services are built.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/httpserver && cd ~/go-lab/httpserver
go mod init example.com/httpserver
cat > main.go <<'EOF'
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func hello(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "hello, %s\\n", r.PathValue("name"))
}

// logging is middleware: it wraps any handler and logs each request.
func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

func newMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /hello/{name}", hello)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	return mux
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{Addr: "localhost:8080", Handler: logging(newMux()), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	log.Println("listening on", srv.Addr)

	<-ctx.Done() // SIGTERM or Ctrl-C
	log.Println("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal(err)
	}
	log.Println("bye")
}
EOF`],
          ['Test the routes without starting a server:', `cat > main_test.go <<'EOF'
package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRoutes(t *testing.T) {
	tests := []struct {
		method, path string
		wantCode     int
		wantBody     string
	}{
		{"GET", "/hello/gopher", 200, "hello, gopher\\n"},
		{"POST", "/hello/gopher", http.StatusMethodNotAllowed, ""},
		{"GET", "/nope", http.StatusNotFound, ""},
	}
	for _, tt := range tests {
		rec := httptest.NewRecorder()
		newMux().ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))
		if rec.Code != tt.wantCode || (tt.wantBody != "" && rec.Body.String() != tt.wantBody) {
			t.Errorf("%s %s = %d %q", tt.method, tt.path, rec.Code, rec.Body.String())
		}
	}
}
EOF
go test .`],
          ['Run the real server, call it, then send SIGTERM like Kubernetes would:', `go build -o server .
./server & sleep 1
curl -s localhost:8080/hello/gopher
curl -s -o /dev/null -w "POST: %{http_code}\\n" -X POST localhost:8080/hello/gopher
kill -TERM $!; wait $! || true`]
        ],
        verify: '`go test` prints `ok`. curl prints `hello, gopher` and `POST: 405`. The log shows `GET /hello/gopher`, then `shutting down` and `bye` after SIGTERM.'
      }, {
        title: 'A client that sets a timeout',
        goal: 'See why the default client is dangerous and how to recognise a timeout.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/httpclient && cd ~/go-lab/httpclient
go mod init example.com/httpclient
cat > main.go <<'EOF'
package main

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"time"
)

func main() {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/slow" {
			time.Sleep(500 * time.Millisecond)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, \`{"status":"ok"}\`)
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 200 * time.Millisecond} // the default client never times out
	for _, path := range []string{"/fast", "/slow"} {
		resp, err := client.Get(srv.URL + path)
		if err != nil {
			var ne net.Error
			fmt.Println(path, "timeout:", errors.As(err, &ne) && ne.Timeout())
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		fmt.Println(path, resp.StatusCode, resp.Header.Get("Content-Type"), string(body))
	}
}
EOF
go run .`]
        ],
        verify: 'Prints `/fast 200 application/json {"status":"ok"}` and `/slow timeout: true`.'
      }],
      refs: [
        ['Package net/http', 'https://pkg.go.dev/net/http'],
        ['Routing enhancements for Go 1.22', 'https://go.dev/blog/routing-enhancements'],
        ['Package net/http/httptest', 'https://pkg.go.dev/net/http/httptest'],
        ['Server.Shutdown', 'https://pkg.go.dev/net/http#Server.Shutdown'],
        ['Kubernetes: Termination of Pods', 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination']
      ],
      quiz: [
        { q: "What timeout does `http.DefaultClient` use?",
          o: ["None; a hung server can block the call forever", "30 seconds", "10 seconds", "It inherits the server's timeout"],
          why: "The zero `http.Client` has `Timeout: 0`, meaning no limit. Set `Timeout` or use a request context." },
        { q: "What happens if you never close `resp.Body`?",
          o: ["The connection isn't returned to the pool, so connections and file descriptors leak", "Nothing; the garbage collector closes it immediately", "The next request fails with an error", "The response is re-sent"],
          why: "The transport can reuse a connection only after the body is read and closed." },
        { q: "A handler calls `w.Write(data)` and then `w.WriteHeader(500)`. What status does the client get?",
          o: ["200; the first Write already sent the headers", "500", "It panics", "The client gets both"],
          why: "Headers go out with the first write. The later `WriteHeader` is ignored and logged as superfluous." },
        { q: "What does `srv.Shutdown(ctx)` do?",
          o: ["Stops accepting new connections and waits for in-flight requests (until ctx ends)", "Closes all connections immediately", "Restarts the server", "Sends SIGTERM to the process"],
          why: "That's what makes rolling updates clean: requests already being served get to finish." },
        { q: "What is the shape of HTTP middleware in Go?",
          o: ["`func(http.Handler) http.Handler`", "`func(http.ResponseWriter) error`", "`func(*http.Request) *http.Request`", "A struct embedding `http.Server`"],
          why: "It takes the next handler and returns a new handler that does something before and/or after calling it." }
      ]
    },
    {
      id: 'go-json',
      title: 'JSON and YAML processing',
      basics: {
        summary: "`encoding/json` converts between JSON and Go values, guided by **struct tags** like `json:\"name,omitempty\"`. Kubernetes manifests are YAML, but Go projects in the Kubernetes world parse them with **`sigs.k8s.io/yaml`**, which converts YAML to JSON first, so one set of `json` tags covers both formats.",
        ideas: [
          "**Tags** set the key name and options: `json:\"replicas,omitempty\"`, `json:\"-\"` to skip.",
          "Only **exported** fields are encoded or decoded.",
          "**Unknown fields are ignored** unless you call `DisallowUnknownFields()`.",
          "A **pointer** field (`*int32`) tells \"not set\" (nil) apart from \"set to 0\".",
          "**`sigs.k8s.io/yaml`** reads and writes YAML using your `json` tags."
        ]
      },
      points: [
        "`json.Marshal(v)` / `json.Unmarshal(data, &v)` work on byte slices; `json.NewEncoder(w)` / `json.NewDecoder(r)` stream to and from readers and writers (request and response bodies).",
        "Maps are encoded with sorted keys; struct fields in declaration order. Field matching on decode is case-insensitive, which can surprise you.",
        "`omitempty` drops zero values (0, \"\", nil, empty slices and maps) but not zero structs. Go 1.24 added `omitzero`, which also handles structs and types with an `IsZero` method.",
        "`time.Time` encodes as RFC 3339; `[]byte` as base64; numbers decoded into `any` become `float64` (use `Decoder.UseNumber` to keep them exact).",
        "Implement `MarshalJSON`/`UnmarshalJSON` for custom formats. `json.RawMessage` delays decoding part of a document, e.g. until you've read its `kind`.",
        "Kubernetes API types use `json` tags with `omitempty` and pointers for optional scalars (`Replicas *int32`), so an unset field is distinguishable from 0.",
        "Multi-document YAML (`---`) needs a streaming decoder, e.g. `k8s.io/apimachinery/pkg/util/yaml.NewYAMLOrJSONDecoder`.",
        "`gopkg.in/yaml.v3` uses its own `yaml` tags; mixing it with JSON-tagged Kubernetes types gives wrong key names."
      ],
      labs: [{
        title: 'Decode a manifest, re-encode it, and decode strictly',
        goal: 'Use one set of json tags for both YAML and JSON, and see omitempty and pointers at work.',
        steps: [
          ['Create a module and add sigs.k8s.io/yaml:', `mkdir -p ~/go-lab/json && cd ~/go-lab/json
go mod init example.com/json
go get sigs.k8s.io/yaml`],
          ['Write `main.go`:', `cat > main.go <<'EOF'
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"sigs.k8s.io/yaml"
)

type Container struct {
	Name  string \`json:"name"\`
	Image string \`json:"image"\`
	Ports []int  \`json:"ports,omitempty"\`
}

type Spec struct {
	Replicas   *int32      \`json:"replicas,omitempty"\` // nil = not set; 0 = scale to zero
	Containers []Container \`json:"containers"\`
}

type Deployment struct {
	Kind   string            \`json:"kind"\`
	Name   string            \`json:"name"\`
	Labels map[string]string \`json:"labels,omitempty"\`
	Spec   Spec              \`json:"spec"\`
}

const manifest = \`
kind: Deployment
name: web
labels:
  tier: frontend
  app: web
spec:
  replicas: 0
  containers:
  - name: nginx
    image: nginx:1.27
    ports: [80]
\`

func main() {
	var d Deployment
	if err := yaml.Unmarshal([]byte(manifest), &d); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("%s %s, replicas set: %v, value: %d\\n", d.Kind, d.Name, d.Spec.Replicas != nil, *d.Spec.Replicas)

	out, _ := json.Marshal(d)
	fmt.Println(string(out))

	d.Spec.Replicas, d.Labels = nil, nil // now omitempty drops them
	out, _ = json.Marshal(d)
	fmt.Println(string(out))

	dec := json.NewDecoder(strings.NewReader(\`{"kind":"Deployment","nmae":"typo"}\`))
	dec.DisallowUnknownFields()
	var strict Deployment
	fmt.Println("strict:", dec.Decode(&strict))

	back, _ := yaml.Marshal(Container{Name: "sidecar", Image: "busybox"})
	fmt.Print(string(back))
}
EOF
go run .`]
        ],
        verify: 'Prints `Deployment web, replicas set: true, value: 0`; the first JSON line keeps `"replicas":0` and sorted labels; the second has no `replicas` or `labels`; then `strict: json: unknown field "nmae"`, and YAML `image: busybox` / `name: sidecar`.'
      }],
      refs: [
        ['Package encoding/json', 'https://pkg.go.dev/encoding/json'],
        ['JSON and Go', 'https://go.dev/blog/json'],
        ['Package sigs.k8s.io/yaml', 'https://pkg.go.dev/sigs.k8s.io/yaml'],
        ['Kubernetes API conventions: optional vs required', 'https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#optional-vs-required']
      ],
      quiz: [
        { q: "A field `Replicas int32` is tagged `json:\"replicas,omitempty\"` and holds 0. What does `json.Marshal` output for it?",
          o: ["Nothing; the zero value is omitted, so use `*int32` to keep an explicit 0", "`\"replicas\":0`", "`\"replicas\":null`", "It returns an error"],
          why: "`omitempty` can't tell \"zero\" from \"unset\" on a plain int. A pointer can: nil is omitted, a pointer to 0 is encoded." },
        { q: "By default, what does `json.Unmarshal` do with a JSON key that matches no struct field?",
          o: ["Ignores it silently", "Returns an error", "Panics", "Stores it in a hidden map"],
          why: "Decoding is lenient by default. Use a `Decoder` with `DisallowUnknownFields()` to catch typos." },
        { q: "Which struct tags does `sigs.k8s.io/yaml` use?",
          o: ["`json` tags", "`yaml` tags", "`k8s` tags", "None; it matches field names exactly"],
          why: "It converts YAML to JSON and then uses `encoding/json`, which is why Kubernetes types only need `json` tags." },
        { q: "In what order does `json.Marshal` write the keys of a `map[string]int`?",
          o: ["Sorted by key", "Insertion order", "Random order", "Reverse insertion order"],
          why: "encoding/json sorts map keys, so output is deterministic even though map iteration isn't." },
        { q: "A struct has an unexported field `secret string`. What does `json.Marshal` do with it?",
          o: ["Skips it", "Encodes it as `\"secret\"`", "Returns an error", "Encodes it only with a tag"],
          why: "Reflection can't read unexported fields from another package, so encoders skip them, tag or not." }
      ]
    },
    {
      id: 'go-grpc',
      title: 'Protobuf and gRPC',
      basics: {
        summary: "**Protocol Buffers** describe messages and services in a `.proto` file, and `protoc` generates Go code from it. **gRPC** runs those services over HTTP/2 with typed, compact messages and built-in streaming. It's the glue inside cloud-native systems: the kubelet talks to containerd over gRPC (CRI), etcd's API is gRPC, and istiod pushes Envoy config over gRPC (xDS).",
        ideas: [
          "The **`.proto` file is the contract**: messages with numbered fields, and services with RPC methods.",
          "**protoc** plus two plugins generate messages (`protoc-gen-go`) and client/server code (`protoc-gen-go-grpc`).",
          "Your server **implements the generated interface**; clients call methods on a generated stub.",
          "Four call types: **unary**, **server streaming**, **client streaming**, **bidirectional**.",
          "**Field numbers are forever**: never change or reuse one, or old clients misread data."
        ]
      },
      points: [
        "proto3 scalars have no presence by default: a zero value isn't sent and reads back as zero. Mark a field `optional` to detect \"unset\".",
        "Remove a field by deleting it and adding `reserved 3;` (and its name) so the number can't be reused.",
        "Generated helpers: `pb.NewGreeterClient(conn)`, `pb.RegisterGreeterServer(s, impl)`, and nil-safe getters like `req.GetName()`.",
        "Embed `pb.UnimplementedGreeterServer` in your server. New RPCs added to the proto then return `Unimplemented` instead of breaking your build.",
        "Connect with `grpc.NewClient(target, grpc.WithTransportCredentials(…))` (it replaced `grpc.Dial`). Use TLS or mTLS outside of local tests.",
        "Errors carry a code: return `status.Error(codes.NotFound, \"…\")`; read it with `status.Code(err)`.",
        "Context deadlines travel to the server, which sees them in `ctx` and can stop early.",
        "Tools: `grpcurl` to call services by hand (with server reflection), and `buf` to lint protos and catch breaking changes."
      ],
      labs: [{
        title: 'Generate and run a Greeter service',
        goal: 'Install the tools, generate code from a proto, and call a unary RPC including an error case.',
        steps: [
          ['Create a module and install `protoc` plus the Go plugins:', `mkdir -p ~/go-lab/greeter/proto && cd ~/go-lab/greeter
go mod init example.com/greeter
PB=32.1   # see github.com/protocolbuffers/protobuf/releases for the latest
curl -sSLo protoc.zip https://github.com/protocolbuffers/protobuf/releases/download/v$PB/protoc-$PB-linux-x86_64.zip
unzip -q -o protoc.zip -d $HOME/.local && rm protoc.zip
export PATH=$PATH:$HOME/.local/bin:$(go env GOPATH)/bin
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
protoc --version`],
          ['Write the contract in `proto/greeter.proto` and generate Go code:', `cat > proto/greeter.proto <<'EOF'
syntax = "proto3";

package greeter.v1;

option go_package = "example.com/greeter/gen/greeterv1";

service Greeter {
  rpc SayHello(HelloRequest) returns (HelloReply);
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}
EOF
protoc --go_out=. --go_opt=module=example.com/greeter \\
       --go-grpc_out=. --go-grpc_opt=module=example.com/greeter proto/greeter.proto
ls gen/greeterv1`],
          ['Implement the server in `server/main.go`:', `mkdir -p server client && cat > server/main.go <<'EOF'
package main

import (
	"context"
	"log"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"example.com/greeter/gen/greeterv1"
)

type server struct {
	greeterv1.UnimplementedGreeterServer
}

func (server) SayHello(ctx context.Context, req *greeterv1.HelloRequest) (*greeterv1.HelloReply, error) {
	if req.GetName() == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}
	return &greeterv1.HelloReply{Message: "Hello, " + req.GetName()}, nil
}

func main() {
	lis, err := net.Listen("tcp", "localhost:50051")
	if err != nil {
		log.Fatal(err)
	}
	s := grpc.NewServer()
	greeterv1.RegisterGreeterServer(s, server{})
	log.Println("serving on", lis.Addr())
	log.Fatal(s.Serve(lis))
}
EOF`],
          ['Write the client in `client/main.go`:', `cat > client/main.go <<'EOF'
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	"example.com/greeter/gen/greeterv1"
)

func main() {
	conn, err := grpc.NewClient("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	c := greeterv1.NewGreeterClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	for _, name := range []string{"gopher", ""} {
		r, err := c.SayHello(ctx, &greeterv1.HelloRequest{Name: name})
		if err != nil {
			fmt.Println("error:", status.Code(err), status.Convert(err).Message())
			continue
		}
		fmt.Println(r.GetMessage())
	}
}
EOF`],
          ['Fetch the gRPC modules, then run the server and the client:', `go mod tidy
go build -o bin/server ./server && go build -o bin/client ./client
./bin/server & sleep 1
./bin/client
kill $!`]
        ],
        verify: '`ls` shows `greeter.pb.go` and `greeter_grpc.pb.go`. The client prints `Hello, gopher` and `error: InvalidArgument name is required`.'
      }],
      refs: [
        ['gRPC Go quick start', 'https://grpc.io/docs/languages/go/quickstart/'],
        ['gRPC Go basics tutorial', 'https://grpc.io/docs/languages/go/basics/'],
        ['Protocol Buffers: proto3 language guide', 'https://protobuf.dev/programming-guides/proto3/'],
        ['Package google.golang.org/grpc', 'https://pkg.go.dev/google.golang.org/grpc'],
        ['Kubernetes CRI API (gRPC)', 'https://github.com/kubernetes/cri-api']
      ],
      quiz: [
        { q: "Why must you never reuse a field number in a `.proto` file?",
          o: ["The wire format identifies fields by number, so old clients would decode the new data as the old field", "protoc rejects files with gaps in numbering", "Field numbers set the JSON key order", "gRPC uses them as port numbers"],
          why: "Names aren't sent on the wire, only numbers. Reserve removed numbers so nobody reuses them by accident." },
        { q: "What does embedding `greeterv1.UnimplementedGreeterServer` in your server give you?",
          o: ["RPCs you haven't implemented return `Unimplemented`, so adding RPCs doesn't break the build", "A default implementation of every RPC", "Automatic TLS", "Server reflection"],
          why: "It provides stub methods for every RPC in the service, keeping your type compatible as the proto grows." },
        { q: "A proto3 `string name = 1;` is set to \"\" by the client. What does the server see?",
          o: ["\"\"; it can't tell an empty string from an unset field", "nil", "An error", "The previous request's value"],
          why: "Without `optional`, proto3 scalars have no presence. Zero values aren't sent and read back as the zero value." },
        { q: "How does a server return a \"not found\" error the client can check?",
          o: ["`return nil, status.Error(codes.NotFound, \"…\")`", "`return nil, errors.New(\"404\")`", "Set an HTTP 404 header", "`panic(codes.NotFound)`"],
          why: "gRPC carries a status code plus message. Clients read it with `status.Code(err)`." },
        { q: "Which of these uses gRPC in a Kubernetes cluster?",
          o: ["The kubelet calling containerd through the CRI", "kubectl talking to the API server", "Browsers loading the Dashboard", "CoreDNS answering DNS queries"],
          why: "The Container Runtime Interface is a gRPC API. kubectl uses REST/JSON (or protobuf over HTTP), not gRPC." }
      ]
    },
    {
      id: 'go-m4-grpc-stream',
      title: 'Milestone 4: stream metrics to a gRPC aggregator',
      basics: {
        summary: "Build `metricsagg`: an **agent** opens a **client-streaming** RPC and sends a stream of metric samples; the **server** aggregates them (count, min, max, mean per metric) and replies once with a summary when the client closes the stream. This is the shape of real telemetry pipelines such as OpenTelemetry's OTLP exporters.",
        ideas: [
          "`rpc Push(stream Sample) returns (Summary)` declares a **client stream**.",
          "The client calls **`Send`** many times, then **`CloseAndRecv`** for the single reply.",
          "The server loops on **`Recv`** until it returns **`io.EOF`**, then calls **`SendAndClose`**.",
          "Server logic lives in its own package so a **bufconn** test can run it in memory.",
          "Generated code stays in **`gen/`** and is never edited by hand."
        ]
      },
      points: [
        "Each stream is handled in its own goroutine. Per-stream state (the aggregate map) needs no lock; state shared across streams (a global total) does.",
        "`Recv` returning an error other than `io.EOF` means the client went away or the context ended; return it.",
        "The client's context bounds the whole stream. Cancel it and both sides see the stream end.",
        "`google.golang.org/grpc/test/bufconn` provides an in-memory listener, so tests need no ports.",
        "With newer `protoc-gen-go-grpc` the stream types are generics (`grpc.ClientStreamingServer[Sample, Summary]`) with friendly aliases such as `Metrics_PushServer`.",
        "Extensions: a server-streaming `Watch` RPC for live dashboards, or bidirectional streaming for acknowledgements and backpressure.",
        "Use proto `map<string, Stat>` for keyed results; it becomes a Go `map[string]*Stat`."
      ],
      labs: [{
        title: 'Build metricsagg step by step',
        goal: 'A client-streaming gRPC service with an in-memory test, an agent, and a server.',
        steps: [
          ['Reference layout you will end up with:', `metricsagg/
├── go.mod
├── proto/
│   └── metrics.proto         # the contract
├── gen/metricsv1/            # generated by protoc; never edit
├── aggregator/
│   ├── aggregator.go         # Push: Recv until EOF, then SendAndClose
│   └── aggregator_test.go    # in-memory test with bufconn
└── cmd/
    ├── server/main.go        # listens on :50052
    └── agent/main.go         # streams samples, prints the summary`],
          ['Create the module (install protoc and the plugins first, as in the gRPC topic\'s lab):', `mkdir -p ~/go-lab/metricsagg/proto ~/go-lab/metricsagg/aggregator ~/go-lab/metricsagg/cmd/server ~/go-lab/metricsagg/cmd/agent
cd ~/go-lab/metricsagg
go mod init example.com/metricsagg
export PATH=$PATH:$HOME/.local/bin:$(go env GOPATH)/bin
command -v protoc >/dev/null || { PB=32.1; curl -sSLo protoc.zip https://github.com/protocolbuffers/protobuf/releases/download/v$PB/protoc-$PB-linux-x86_64.zip && unzip -q -o protoc.zip -d $HOME/.local && rm protoc.zip; }
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest`],
          ['Write `proto/metrics.proto` and generate code:', `cat > proto/metrics.proto <<'EOF'
syntax = "proto3";

package metrics.v1;

option go_package = "example.com/metricsagg/gen/metricsv1";

service Metrics {
  // The agent streams samples; the server replies once with a summary.
  rpc Push(stream Sample) returns (Summary);
}

message Sample {
  string node = 1;
  string name = 2; // e.g. "cpu"
  double value = 3;
  int64 unix_ms = 4;
}

message Stat {
  int64 count = 1;
  double min = 2;
  double max = 3;
  double mean = 4;
}

message Summary {
  int64 received = 1;
  map<string, Stat> by_name = 2;
}
EOF
protoc --go_out=. --go_opt=module=example.com/metricsagg \\
       --go-grpc_out=. --go-grpc_opt=module=example.com/metricsagg proto/metrics.proto`],
          ['Implement the aggregation in `aggregator/aggregator.go`:', `cat > aggregator/aggregator.go <<'EOF'
// Package aggregator implements the Metrics service.
package aggregator

import (
	"errors"
	"io"
	"log"
	"sync"

	"example.com/metricsagg/gen/metricsv1"
)

type Server struct {
	metricsv1.UnimplementedMetricsServer

	mu    sync.Mutex // guards total, shared by all streams
	total int64
}

func (s *Server) Push(stream metricsv1.Metrics_PushServer) error {
	stats := map[string]*metricsv1.Stat{} // per stream: no lock needed
	var n int64
	for {
		sample, err := stream.Recv()
		if errors.Is(err, io.EOF) { // the agent called CloseAndRecv
			for _, st := range stats {
				st.Mean /= float64(st.Count) // Mean held the running sum
			}
			s.mu.Lock()
			s.total += n
			total := s.total
			s.mu.Unlock()
			log.Printf("stream done: %d samples (%d since start)", n, total)
			return stream.SendAndClose(&metricsv1.Summary{Received: n, ByName: stats})
		}
		if err != nil {
			return err
		}
		n++
		v := sample.GetValue()
		st, ok := stats[sample.GetName()]
		if !ok {
			st = &metricsv1.Stat{Min: v, Max: v}
			stats[sample.GetName()] = st
		}
		st.Count++
		st.Min = min(st.Min, v)
		st.Max = max(st.Max, v)
		st.Mean += v
	}
}
EOF`],
          ['Test it in memory with bufconn:', `cat > aggregator/aggregator_test.go <<'EOF'
package aggregator

import (
	"context"
	"net"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	"example.com/metricsagg/gen/metricsv1"
)

func TestPush(t *testing.T) {
	lis := bufconn.Listen(1 << 20)
	s := grpc.NewServer()
	metricsv1.RegisterMetricsServer(s, &Server{})
	go s.Serve(lis)
	defer s.Stop()

	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) { return lis.DialContext(ctx) }),
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	stream, err := metricsv1.NewMetricsClient(conn).Push(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range []float64{1, 5, 3} {
		if err := stream.Send(&metricsv1.Sample{Name: "cpu", Value: v}); err != nil {
			t.Fatal(err)
		}
	}
	sum, err := stream.CloseAndRecv()
	if err != nil {
		t.Fatal(err)
	}
	st := sum.GetByName()["cpu"]
	if sum.GetReceived() != 3 || st.GetMin() != 1 || st.GetMax() != 5 || st.GetMean() != 3 {
		t.Fatalf("got %v", sum)
	}
}
EOF
go mod tidy
go test ./aggregator/`],
          ['Write the server in `cmd/server/main.go`:', `cat > cmd/server/main.go <<'EOF'
package main

import (
	"log"
	"net"

	"google.golang.org/grpc"

	"example.com/metricsagg/aggregator"
	"example.com/metricsagg/gen/metricsv1"
)

func main() {
	lis, err := net.Listen("tcp", "localhost:50052")
	if err != nil {
		log.Fatal(err)
	}
	s := grpc.NewServer()
	metricsv1.RegisterMetricsServer(s, &aggregator.Server{})
	log.Println("aggregator listening on", lis.Addr())
	log.Fatal(s.Serve(lis))
}
EOF`],
          ['Write the agent in `cmd/agent/main.go`:', `cat > cmd/agent/main.go <<'EOF'
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"maps"
	"slices"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"example.com/metricsagg/gen/metricsv1"
)

func main() {
	addr := flag.String("addr", "localhost:50052", "aggregator address")
	node := flag.String("node", "node-1", "node name to report as")
	count := flag.Int("count", 5, "samples per metric")
	interval := flag.Duration("interval", 100*time.Millisecond, "delay between samples")
	flag.Parse()

	conn, err := grpc.NewClient(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	stream, err := metricsv1.NewMetricsClient(conn).Push(ctx)
	if err != nil {
		log.Fatal(err)
	}
	for i := 1; i <= *count; i++ {
		for _, s := range []*metricsv1.Sample{
			{Node: *node, Name: "cpu", Value: float64(i * 10)},
			{Node: *node, Name: "mem", Value: float64(100 + i)},
		} {
			s.UnixMs = time.Now().UnixMilli()
			if err := stream.Send(s); err != nil {
				log.Fatalf("send: %v", err)
			}
		}
		time.Sleep(*interval)
	}

	sum, err := stream.CloseAndRecv()
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("server received %d samples\\n", sum.GetReceived())
	for _, name := range slices.Sorted(maps.Keys(sum.GetByName())) {
		st := sum.GetByName()[name]
		fmt.Printf("%-4s count=%d min=%.0f max=%.0f mean=%.1f\\n", name, st.GetCount(), st.GetMin(), st.GetMax(), st.GetMean())
	}
}
EOF`],
          ['Build, start the server, and stream from two agents:', `go build -o bin/server ./cmd/server && go build -o bin/agent ./cmd/agent
./bin/server & sleep 1
./bin/agent -node node-1
./bin/agent -node node-2 -count 3 -interval 10ms
kill $!`]
        ],
        verify: '`go test` prints `ok`. The first agent prints `server received 10 samples`, `cpu  count=5 min=10 max=50 mean=30.0`, `mem  count=5 min=101 max=105 mean=103.0`; the second prints `server received 6 samples`. The server log ends with `(16 since start)`.'
      }],
      refs: [
        ['gRPC Go basics: client-side streaming RPC', 'https://grpc.io/docs/languages/go/basics/#client-side-streaming-rpc'],
        ['gRPC core concepts: RPC life cycle', 'https://grpc.io/docs/what-is-grpc/core-concepts/'],
        ['Package grpc/test/bufconn', 'https://pkg.go.dev/google.golang.org/grpc/test/bufconn'],
        ['Protocol Buffers: maps', 'https://protobuf.dev/programming-guides/proto3/#maps'],
        ['OpenTelemetry Protocol (OTLP) specification', 'https://opentelemetry.io/docs/specs/otlp/']
      ],
      quiz: [
        { q: "How do you declare a client-streaming RPC in a `.proto` file?",
          o: ["`rpc Push(stream Sample) returns (Summary);`", "`rpc Push(Sample) returns (stream Summary);`", "`stream rpc Push(Sample) returns (Summary);`", "`rpc Push(repeated Sample) returns (Summary);`"],
          why: "`stream` before the request type makes the client side a stream. Before the response type it would be server streaming." },
        { q: "How does the server know the agent has sent its last sample?",
          o: ["`stream.Recv()` returns `io.EOF`", "The agent sends a sample with an empty name", "A timeout fires", "`Recv` returns nil, nil"],
          why: "`CloseAndRecv` (or `CloseSend`) half-closes the stream; the server's next `Recv` sees `io.EOF`." },
        { q: "How does the server send its single reply on a client stream?",
          o: ["`stream.SendAndClose(summary)`", "`return summary, nil`", "`stream.Send(summary)` in the loop", "It writes to a separate unary RPC"],
          why: "`SendAndClose` sends the one response and ends the RPC from the server side." },
        { q: "Two agents stream at the same time. Which state needs a mutex?",
          o: ["The counter shared by all streams; the per-stream map doesn't", "The per-stream map only", "Both", "Neither; gRPC serialises streams"],
          why: "Each stream runs in its own goroutine. Variables local to `Push` belong to one stream; fields on the server struct are shared." },
        { q: "What does `bufconn` give you in tests?",
          o: ["An in-memory listener, so a real gRPC client and server talk without network ports", "A fake client that returns canned responses", "Automatic proto generation", "TLS certificates for tests"],
          why: "It exercises the real gRPC stack (encoding, streaming, errors) without ports or flakiness from the network." }
      ]
    }
  ]
});
