// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'k8s', title: 'Phase 5 · Bridging Go and Kubernetes', weight: 15,
  topics: [
    {
      id: 'go-clientgo',
      title: 'client-go: list Pods and Deployments, watch events',
      basics: {
        summary: "**client-go** is the official Go library for talking to the Kubernetes API; kubectl and every controller are built on it. You load a **rest.Config** (from your kubeconfig, or in-cluster credentials), build a **Clientset**, and call typed methods such as `CoreV1().Pods(ns).List(ctx, opts)`. A **Watch** streams changes as they happen.",
        ideas: [
          "**Config**: same rules as kubectl (`$KUBECONFIG`, then `~/.kube/config`), or `rest.InClusterConfig()` inside a Pod.",
          "**Clientset**: one typed client per API group: `CoreV1()`, `AppsV1()`, `BatchV1()`…",
          "Every call takes a **context** and options: `List(ctx, metav1.ListOptions{LabelSelector: \"app=web\"})`.",
          "**Watch** returns a channel of `ADDED`, `MODIFIED` and `DELETED` events.",
          "Check errors with **`apierrors.IsNotFound`**, `IsAlreadyExists`, `IsConflict`."
        ]
      },
      points: [
        "Modules: `k8s.io/client-go`, `k8s.io/api` (types like `corev1.Pod`) and `k8s.io/apimachinery` (`metav1`, errors, selectors). Keep their minor versions matched (v0.X for Kubernetes 1.X).",
        "`clientcmd.NewNonInteractiveDeferredLoadingClientConfig(clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{})` mirrors kubectl's kubeconfig handling, including contexts.",
        "In a Pod, `rest.InClusterConfig()` uses the mounted ServiceAccount token and the `KUBERNETES_SERVICE_HOST` env var. RBAC then decides what the program may do.",
        "Selectors: `LabelSelector: \"app=web,tier!=db\"`, `FieldSelector: \"status.phase=Running\"` (only some fields are supported).",
        "Large lists: page with `Limit` and `Continue`. For anything long-running, use informers (next topic) instead of repeated Lists.",
        "Updates use optimistic concurrency: if someone changed the object since you read it, you get a Conflict. Wrap read-modify-write in `retry.RetryOnConflict`.",
        "A raw Watch can end at any time (timeouts, API server restarts) and may fail with \"resource version too old\". Informers handle this; plain watches are for short-lived tools.",
        "The `dynamic` client works with any resource as `unstructured.Unstructured`, useful for CRDs without Go types."
      ],
      labs: [{
        title: 'List Pods and Deployments, and handle NotFound',
        tags: ['kind cluster'],
        goal: 'A kind cluster (`kind create cluster`) and `kubectl get nodes` working.',
        steps: [
          ['Create something to list:', `kubectl create deployment web --image=nginx --replicas=2
kubectl rollout status deploy/web --timeout=120s || true`],
          ['Create a module:', `mkdir -p ~/go-lab/clientgo && cd ~/go-lab/clientgo
go mod init example.com/clientgo`],
          ['Write `main.go`, then let `go mod tidy` fetch client-go and its dependencies:', `cat > main.go <<'EOF'
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

func main() {
	// Same rules as kubectl: $KUBECONFIG, then ~/.kube/config.
	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{}).ClientConfig()
	if err != nil {
		log.Fatal(err)
	}
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		log.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	deps, err := cs.AppsV1().Deployments("default").List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Fatal(err)
	}
	for _, d := range deps.Items {
		fmt.Printf("deployment %s replicas=%d ready=%d\\n", d.Name, *d.Spec.Replicas, d.Status.ReadyReplicas)
	}

	pods, err := cs.CoreV1().Pods("default").List(ctx, metav1.ListOptions{LabelSelector: "app=web"})
	if err != nil {
		log.Fatal(err)
	}
	for _, p := range pods.Items {
		fmt.Printf("pod %s phase=%s node=%s\\n", p.Name, p.Status.Phase, p.Spec.NodeName)
	}

	_, err = cs.CoreV1().Pods("default").Get(ctx, "does-not-exist", metav1.GetOptions{})
	fmt.Println("missing pod is NotFound:", apierrors.IsNotFound(err))
}
EOF
go mod tidy
go run .`]
        ],
        verify: 'Prints `deployment web replicas=2 ready=2`, two `pod web-… phase=Running` lines, and `missing pod is NotFound: true`.'
      }, {
        title: 'Watch Pod events as they happen',
        tags: ['kind cluster'],
        goal: 'Stream ADDED, MODIFIED and DELETED events while you change Pods with kubectl.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/watch && cd ~/go-lab/watch
go mod init example.com/watch
cat > main.go <<'EOF'
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

func main() {
	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{}).ClientConfig()
	if err != nil {
		log.Fatal(err)
	}
	cs := kubernetes.NewForConfigOrDie(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	w, err := cs.CoreV1().Pods("default").Watch(ctx, metav1.ListOptions{LabelSelector: "app=demo"})
	if err != nil {
		log.Fatal(err)
	}
	defer w.Stop()
	fmt.Println("watching pods with app=demo")
	for ev := range w.ResultChan() {
		pod, ok := ev.Object.(*corev1.Pod)
		if !ok {
			continue // e.g. a *metav1.Status error event
		}
		fmt.Printf("%-8s %s phase=%s labels=%v\\n", ev.Type, pod.Name, pod.Status.Phase, pod.Labels)
	}
}
EOF
go mod tidy
go build -o watch .`],
          ['Run the watcher in the background and change a Pod:', `./watch & sleep 2
kubectl run demo --image=nginx --labels=app=demo
sleep 3
kubectl label pod demo tier=web
sleep 2
kubectl delete pod demo
sleep 2; kill $!`]
        ],
        verify: 'You see `ADDED demo phase=Pending`, several `MODIFIED` lines as the Pod is scheduled and starts, one with `tier:web` in its labels, and finally `DELETED demo`.',
        cleanup: 'kubectl delete deployment web'
      }],
      refs: [
        ['client-go (GitHub, with examples)', 'https://github.com/kubernetes/client-go'],
        ['Package k8s.io/client-go/kubernetes', 'https://pkg.go.dev/k8s.io/client-go/kubernetes'],
        ['client-go example: out-of-cluster client', 'https://github.com/kubernetes/client-go/tree/master/examples/out-of-cluster-client-configuration'],
        ['Kubernetes API concepts: efficient detection of changes (watch)', 'https://kubernetes.io/docs/reference/using-api/api-concepts/#efficient-detection-of-changes'],
        ['Access clusters using the Kubernetes API', 'https://kubernetes.io/docs/tasks/administer-cluster/access-cluster-api/']
      ],
      quiz: [
        { q: "Your program runs inside a Pod. How should it build its `rest.Config`?",
          o: ["`rest.InClusterConfig()`, which uses the mounted ServiceAccount token", "Read `~/.kube/config` from the container image", "Hard-code the API server IP and an admin token", "Call `kubectl config view` and parse it"],
          why: "In-cluster config uses the Pod's ServiceAccount credentials, so RBAC controls what the program can do." },
        { q: "`cs.CoreV1().Pods(\"\").List(ctx, opts)` — what does the empty namespace mean?",
          o: ["All namespaces", "The `default` namespace", "The current kubeconfig context's namespace", "It's an error"],
          why: "`metav1.NamespaceAll` is the empty string. Use `\"default\"` (or `metav1.NamespaceDefault`) for the default namespace." },
        { q: "How do you check that a `Get` failed because the object doesn't exist?",
          o: ["`apierrors.IsNotFound(err)`", "`err == nil && obj == nil`", "`errors.Is(err, os.ErrNotExist)`", "`strings.Contains(err.Error(), \"404\")`"],
          why: "`k8s.io/apimachinery/pkg/api/errors` inspects the API's status reason and code reliably." },
        { q: "An `Update` fails with a Conflict error. What does it mean?",
          o: ["The object changed since you read it; re-read and retry (`retry.RetryOnConflict`)", "Two objects have the same name", "You lack RBAC permission", "The API server is overloaded"],
          why: "Kubernetes uses `resourceVersion` for optimistic concurrency. Conflicts are normal under contention; retry with fresh data." },
        { q: "Why do long-running controllers use informers rather than a plain `Watch` loop?",
          o: ["Informers handle relists, reconnects and caching; a raw watch can end or expire at any time", "Plain watches are deprecated", "Watch only works for Pods", "Informers use less CPU on the client because they poll"],
          why: "Watches time out, and an old resourceVersion can't be resumed. Informers re-list and re-watch automatically and keep a local cache." }
      ]
    },
    {
      id: 'go-informers',
      title: 'Informers, listers and work queues',
      basics: {
        summary: "An **informer** lists a resource once, then watches it, keeping a **local in-memory cache** up to date and calling your **event handlers** on every change. Reads go to the cache through a **lister**, not the API server. Controllers don't do work inside handlers; they push the object's key onto a **work queue** and process it in worker goroutines.",
        ideas: [
          "**List + Watch → cache**: the informer re-lists and re-watches on its own when connections drop.",
          "**Handlers** (`AddFunc`, `UpdateFunc`, `DeleteFunc`) only enqueue a `namespace/name` key.",
          "**Listers** read from the cache: fast, and no load on the API server.",
          "**`WaitForCacheSync`** before trusting the cache.",
          "Never modify objects from the cache: **`DeepCopy()`** first."
        ]
      },
      points: [
        "Inside an informer: Reflector (ListAndWatch) → a FIFO queue of changes → Indexer (a thread-safe store) → your handlers. The queue is `RealFIFO`, which keeps events in order; it became the default in client-go 1.33 and the only option in 1.36. Older code and articles show `DeltaFIFO`.",
        "`SharedInformerFactory` gives one informer per resource type that all parts of your program share, so there's one watch per type instead of many.",
        "The resync period re-delivers Update events for every cached object from the cache (it does not re-list from the API). Handy for periodic reconciliation.",
        "`DeleteFunc` may receive a `cache.DeletedFinalStateUnknown` tombstone if a delete was missed; `cache.DeletionHandlingMetaNamespaceKeyFunc` handles it.",
        "The work queue deduplicates keys, ensures one worker handles a key at a time, and supports rate-limited retries (`AddRateLimited`, then `Forget` on success).",
        "Reduce memory with `informers.WithNamespace` or `WithTweakListOptions` (label/field selectors).",
        "Custom indexes (e.g. Pods by node name) let listers answer \"which Pods are on node X\" without scanning everything.",
        "controller-runtime (phase 6) builds its manager cache and cached client on exactly these pieces."
      ],
      labs: [{
        title: 'An informer feeding a work queue',
        tags: ['kind cluster'],
        goal: 'See handlers enqueue keys and a worker read the current state from the lister.',
        steps: [
          ['Create a module:', `mkdir -p ~/go-lab/informer && cd ~/go-lab/informer
go mod init example.com/informer`],
          ['Write `main.go`:', `cat > main.go <<'EOF'
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	listersv1 "k8s.io/client-go/listers/core/v1"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/workqueue"
)

func main() {
	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{}).ClientConfig()
	if err != nil {
		log.Fatal(err)
	}
	cs := kubernetes.NewForConfigOrDie(cfg)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	factory := informers.NewSharedInformerFactoryWithOptions(cs, 10*time.Minute, informers.WithNamespace("default"))
	pods := factory.Core().V1().Pods()
	queue := workqueue.NewTypedRateLimitingQueue(workqueue.DefaultTypedControllerRateLimiter[string]())
	defer queue.ShutDown()

	enqueue := func(why string) func(obj any) {
		return func(obj any) {
			key, err := cache.DeletionHandlingMetaNamespaceKeyFunc(obj)
			if err == nil {
				log.Printf("event %-6s %s", why, key)
				queue.Add(key)
			}
		}
	}
	pods.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: enqueue("add"),
		UpdateFunc: func(oldObj, newObj any) {
			if oldObj.(*corev1.Pod).ResourceVersion != newObj.(*corev1.Pod).ResourceVersion {
				enqueue("update")(newObj)
			}
		},
		DeleteFunc: enqueue("delete"),
	})

	factory.Start(ctx.Done())
	if !cache.WaitForCacheSync(ctx.Done(), pods.Informer().HasSynced) {
		log.Fatal("cache never synced")
	}
	log.Printf("cache synced: %d pods in default", len(pods.Informer().GetStore().ListKeys()))

	go func() {
		for processNext(queue, pods.Lister()) {
		}
	}()
	<-ctx.Done()
}

// processNext handles one key: read the current state from the cache, never from the event.
func processNext(queue workqueue.TypedRateLimitingInterface[string], lister listersv1.PodLister) bool {
	key, shutdown := queue.Get()
	if shutdown {
		return false
	}
	defer queue.Done(key)

	ns, name, _ := cache.SplitMetaNamespaceKey(key)
	pod, err := lister.Pods(ns).Get(name)
	switch {
	case apierrors.IsNotFound(err):
		log.Printf("sync   %s: gone", key)
	case err != nil:
		queue.AddRateLimited(key) // retry later with backoff
		return true
	default:
		log.Printf("sync   %s: phase=%s labels=%v", key, pod.Status.Phase, pod.Labels)
	}
	queue.Forget(key)
	return true
}
EOF
go mod tidy
go build -o informer .`],
          ['Run it and change Pods:', `./informer & sleep 3
kubectl run demo --image=nginx --labels=app=demo
sleep 3
kubectl label pod demo tier=web
sleep 2
kubectl delete pod demo
sleep 2; kill $!`]
        ],
        verify: 'The log shows `cache synced`, then `event add default/demo` followed by `sync default/demo: phase=Pending …`, update events (fewer syncs than events when updates arrive close together, because the queue deduplicates keys), a sync showing `tier:web`, and finally `event delete` and `sync default/demo: gone`.'
      }],
      refs: [
        ['client-go under the hood (sample-controller docs)', 'https://github.com/kubernetes/sample-controller/blob/master/docs/controller-client-go.md'],
        ['Package k8s.io/client-go/informers', 'https://pkg.go.dev/k8s.io/client-go/informers'],
        ['Package k8s.io/client-go/tools/cache', 'https://pkg.go.dev/k8s.io/client-go/tools/cache'],
        ['Package k8s.io/client-go/util/workqueue', 'https://pkg.go.dev/k8s.io/client-go/util/workqueue'],
        ['Writing controllers (Kubernetes community guide)', 'https://github.com/kubernetes/community/blob/master/contributors/devel/sig-api-machinery/controllers.md']
      ],
      quiz: [
        { q: "Where does `podLister.Pods(ns).Get(name)` read from?",
          o: ["The informer's local cache", "The API server, every call", "etcd directly", "The kubelet on the Pod's node"],
          why: "Listers are backed by the informer's indexer, which is why controllers can read often without loading the API server." },
        { q: "Why do controllers enqueue a key instead of doing the work in the event handler?",
          o: ["The queue deduplicates bursts, retries with backoff, and lets workers process each key one at a time", "Handlers can't access the API", "Handlers run only once per object", "Keys use less memory than objects in the handler"],
          why: "Handlers should be fast and non-blocking. The queue turns many events into one reconcile of the latest state." },
        { q: "What must you do before trusting the cache after `factory.Start`?",
          o: ["Wait for `cache.WaitForCacheSync` (HasSynced) to return true", "Sleep for the resync period", "Call `List` on the API once", "Nothing; Start blocks until synced"],
          why: "Start returns immediately. Until the initial list is loaded, the cache would wrongly report objects as missing." },
        { q: "A handler gets a Pod from the cache and sets a label on it before calling Update. What's wrong?",
          o: ["It modified a shared cached object; call `DeepCopy()` first", "Nothing", "Labels can't be updated", "The informer will panic"],
          why: "The cache hands out pointers to shared objects. Mutating them corrupts what every other reader sees." },
        { q: "What does the informer's resync period do?",
          o: ["Re-delivers Update events for every cached object from the local cache", "Re-lists everything from the API server", "Restarts the watch connection", "Deletes stale objects from etcd"],
          why: "Resync replays the cache to handlers so controllers periodically re-check state. It doesn't hit the API server." }
      ]
    },
    {
      id: 'go-crds',
      title: 'Custom Resource Definitions (CRDs)',
      basics: {
        summary: "A **CustomResourceDefinition** adds your own resource type to the Kubernetes API. After you apply one, `kubectl get backups` works, objects are stored in etcd, and the API server validates them against your **OpenAPI schema**. From Go you can use them through the **dynamic client** (no Go types needed) or through generated, typed Go structs, which kubebuilder creates in phase 6.",
        ideas: [
          "A CRD defines a **group, version, kind** and **schema**: e.g. `Backup` in `demo.example.com/v1`.",
          "The API server **validates** objects (types, ranges, required fields) and fills **defaults**.",
          "The **dynamic client** works with any resource as `unstructured.Unstructured`.",
          "**Typed** Go structs with `DeepCopy` methods are generated by `controller-gen`.",
          "A CRD only stores data; a **controller** gives it behaviour."
        ]
      },
      points: [
        "CRD essentials: `spec.group`, `spec.names` (kind, plural, singular, shortNames), `spec.scope` (Namespaced or Cluster), `spec.versions[]` with exactly one `storage: true`.",
        "Schemas must be structural. Unknown fields are pruned unless the schema says `x-kubernetes-preserve-unknown-fields: true`.",
        "Validation: `type`, `required`, `enum`, `minimum`/`maximum`, `pattern`, and CEL rules in `x-kubernetes-validations` for cross-field checks.",
        "`subresources.status` adds a `/status` endpoint: spec changes bump `metadata.generation`, status updates don't, and users can be given RBAC to one but not the other.",
        "`additionalPrinterColumns` controls what `kubectl get` shows.",
        "Dynamic client: `dynamic.NewForConfig(cfg)`, then `dyn.Resource(gvr).Namespace(ns).List/Create/…` with a `schema.GroupVersionResource`. Read fields with `unstructured.NestedString` and friends.",
        "Kubebuilder markers on Go types (`// +kubebuilder:validation:Minimum=1`, `// +kubebuilder:subresource:status`) generate both the CRD YAML and DeepCopy code.",
        "Version changes: serve several versions and convert with a conversion webhook; only the storage version is written to etcd."
      ],
      labs: [{
        title: 'Define a Backup CRD and use it from Go',
        tags: ['kind cluster'],
        goal: 'Register a CRD with validation and defaults, then create and list objects with the dynamic client.',
        steps: [
          ['Create the CRD:', `mkdir -p ~/go-lab/crd && cd ~/go-lab/crd
cat > backup-crd.yaml <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.demo.example.com
spec:
  group: demo.example.com
  names: {kind: Backup, plural: backups, singular: backup, shortNames: [bk]}
  scope: Namespaced
  versions:
  - name: v1
    served: true
    storage: true
    subresources: {status: {}}
    additionalPrinterColumns:
    - {name: Schedule, type: string, jsonPath: .spec.schedule}
    - {name: Retain, type: integer, jsonPath: .spec.retain}
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            required: [schedule]
            properties:
              schedule: {type: string}
              retain: {type: integer, minimum: 1, maximum: 30, default: 7}
          status:
            type: object
            properties:
              lastRun: {type: string}
EOF
kubectl apply -f backup-crd.yaml
kubectl wait --for condition=established crd/backups.demo.example.com`],
          ['Create one object with kubectl, and try an invalid one:', `cat <<'EOF' | kubectl apply -f -
apiVersion: demo.example.com/v1
kind: Backup
metadata: {name: nightly}
spec: {schedule: "0 2 * * *"}
EOF
cat <<'EOF' | kubectl apply -f - || echo "rejected as expected"
apiVersion: demo.example.com/v1
kind: Backup
metadata: {name: broken}
spec: {schedule: "@daily", retain: 99}
EOF`],
          ['Create and list Backups from Go with the dynamic client:', `go mod init example.com/crd
cat > main.go <<'EOF'
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/tools/clientcmd"
)

var backups = schema.GroupVersionResource{Group: "demo.example.com", Version: "v1", Resource: "backups"}

func main() {
	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{}).ClientConfig()
	if err != nil {
		log.Fatal(err)
	}
	dyn := dynamic.NewForConfigOrDie(cfg)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	weekly := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "demo.example.com/v1",
		"kind":       "Backup",
		"metadata":   map[string]any{"name": "weekly"},
		"spec":       map[string]any{"schedule": "0 3 * * 0"},
	}}
	_, err = dyn.Resource(backups).Namespace("default").Create(ctx, weekly, metav1.CreateOptions{})
	if err != nil && !apierrors.IsAlreadyExists(err) {
		log.Fatal(err)
	}

	list, err := dyn.Resource(backups).Namespace("default").List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Fatal(err)
	}
	for _, item := range list.Items {
		schedule, _, _ := unstructured.NestedString(item.Object, "spec", "schedule")
		retain, _, _ := unstructured.NestedInt64(item.Object, "spec", "retain")
		fmt.Printf("%s schedule=%q retain=%d\\n", item.GetName(), schedule, retain)
	}
}
EOF
go mod tidy
go run .
kubectl get backups`]
        ],
        verify: 'The invalid Backup is rejected with `spec.retain … should be less than or equal to 30` and `rejected as expected`. Go prints `nightly schedule="0 2 * * *" retain=7` and `weekly schedule="0 3 * * 0" retain=7` (the default was filled in), and `kubectl get backups` shows the SCHEDULE and RETAIN columns.',
        cleanup: 'kubectl delete -f ~/go-lab/crd/backup-crd.yaml'
      }],
      refs: [
        ['Extend the Kubernetes API with CustomResourceDefinitions', 'https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/'],
        ['Custom Resources (concepts)', 'https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/'],
        ['Package k8s.io/client-go/dynamic', 'https://pkg.go.dev/k8s.io/client-go/dynamic'],
        ['Kubebuilder: CRD validation markers', 'https://book.kubebuilder.io/reference/markers/crd-validation.html']
      ],
      quiz: [
        { q: "A Backup is created without `retain`, and the schema says `default: 7`. What does a later `kubectl get backup -o yaml` show?",
          o: ["`retain: 7`; the API server filled in the default", "No `retain` field", "`retain: 0`", "The create fails because retain is missing"],
          why: "Structural schemas support defaulting, applied when objects are created or read from etcd." },
        { q: "What does the dynamic client return for a custom resource?",
          o: ["`*unstructured.Unstructured`, a wrapper around `map[string]interface{}`", "A generated Go struct", "Raw JSON bytes only", "A `runtime.RawExtension`"],
          why: "The dynamic client needs no Go types. Helpers like `unstructured.NestedString` read nested fields safely." },
        { q: "Why enable the `status` subresource?",
          o: ["Spec and status update through separate endpoints, and status writes don't bump `metadata.generation`", "It's required for `kubectl get` to work", "It makes the CRD cluster-scoped", "It encrypts the status in etcd"],
          why: "Controllers write status, users write spec; separating them avoids conflicts and lets `generation` track only spec changes." },
        { q: "You apply a Backup with `retain: 99` and the schema has `maximum: 30`. What happens?",
          o: ["The API server rejects it with a validation error", "It's stored and clamped to 30", "It's stored as 99 and a warning is logged", "The controller must reject it later"],
          why: "OpenAPI validation in the CRD is enforced by the API server before anything reaches etcd." },
        { q: "You've created a CRD but no controller. What happens when you create a Backup object?",
          o: ["It's validated and stored, but nothing acts on it", "The API server rejects it", "Kubernetes runs a backup with default settings", "The object is deleted after a timeout"],
          why: "A CRD extends the API's storage and validation. Behaviour comes only from a controller watching those objects." }
      ]
    },
    {
      id: 'go-m5-watcher',
      title: 'Milestone 5: watch the cluster and log Pod failures',
      basics: {
        summary: "Build `podwatch`, a client-go program that watches every Pod through an **informer** and logs a line whenever a Pod **fails**, a container **restarts** (with exit code and reason, e.g. `OOMKilled`), or gets stuck in **CrashLoopBackOff** or **ImagePullBackOff**. The detection logic is a **pure function** from (old Pod, new Pod) to problems, so it's tested without a cluster.",
        ideas: [
          "An **informer on all namespaces** delivers old and new Pod objects on every change.",
          "**Compare old and new** so each problem is logged once, on the transition.",
          "Container problems live in **`status.containerStatuses`**: `restartCount`, `state.waiting.reason`, `lastState.terminated`.",
          "The pure **`detect.Problems`** function gets **table-driven tests** with hand-built Pods.",
          "The same binary runs **in-cluster** with a ServiceAccount that may only get/list/watch Pods."
        ]
      },
      points: [
        "Phase `Failed` means all containers stopped and at least one failed (for `restartPolicy: Never`/`OnFailure` Pods), or the Pod was evicted (`status.reason: Evicted`).",
        "A rising `restartCount` means the container restarted; `lastState.terminated` holds the previous run's `exitCode` and `reason` (`Error`, `OOMKilled`, `Completed`).",
        "Exit code 137 = killed by SIGKILL (often OOM); 143 = SIGTERM; 1 = application error.",
        "Waiting reasons worth alerting on: `CrashLoopBackOff`, `ErrImagePull`, `ImagePullBackOff`, `CreateContainerConfigError` (missing ConfigMap/Secret key), `InvalidImageName`.",
        "On start-up the informer calls `AddFunc` for every existing Pod with old = nil, so already-broken Pods are reported once.",
        "In-cluster RBAC: a ClusterRole with `pods: [get, list, watch]` bound to the program's ServiceAccount, and `rest.InClusterConfig()`.",
        "Next steps: emit Kubernetes Events or Prometheus metrics instead of log lines, and add a rate limit so a crash-looping Pod doesn't flood the log."
      ],
      labs: [{
        title: 'Build podwatch step by step',
        tags: ['kind cluster'],
        goal: 'Detection logic with unit tests, wired to an informer, tried against Pods that really fail.',
        steps: [
          ['Reference layout you will end up with:', `podwatch/
├── go.mod
├── main.go             # config (in-cluster or kubeconfig), informer, signals
├── detect/
│   ├── detect.go       # Problems(old, cur *corev1.Pod) []string  (pure)
│   └── detect_test.go  # table tests with hand-built Pods, no cluster
└── deploy/
    └── rbac.yaml       # ServiceAccount + ClusterRole for running in-cluster`],
          ['Create the module:', `mkdir -p ~/go-lab/podwatch/detect ~/go-lab/podwatch/deploy && cd ~/go-lab/podwatch
go mod init example.com/podwatch`],
          ['Write the detection logic in `detect/detect.go`:', `cat > detect/detect.go <<'EOF'
// Package detect finds Pod problems that appeared between two versions of a Pod.
package detect

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
)

var badWaiting = map[string]bool{
	"CrashLoopBackOff":           true,
	"ErrImagePull":               true,
	"ImagePullBackOff":           true,
	"CreateContainerConfigError": true,
	"InvalidImageName":           true,
}

// Problems returns the problems present in cur but not in old. old is nil for a newly seen Pod.
func Problems(old, cur *corev1.Pod) []string {
	var out []string
	if cur.Status.Phase == corev1.PodFailed && (old == nil || old.Status.Phase != corev1.PodFailed) {
		reason := cur.Status.Reason
		if reason == "" {
			reason = "a container exited with an error"
		}
		out = append(out, "pod failed: "+reason)
	}

	prev := map[string]corev1.ContainerStatus{}
	if old != nil {
		for _, cs := range old.Status.ContainerStatuses {
			prev[cs.Name] = cs
		}
	}
	for _, cs := range cur.Status.ContainerStatuses {
		was := prev[cs.Name]
		if cs.RestartCount > was.RestartCount {
			msg := fmt.Sprintf("container %s restarted (restarts: %d)", cs.Name, cs.RestartCount)
			if t := cs.LastTerminationState.Terminated; t != nil {
				msg += fmt.Sprintf(": exit code %d, reason %s", t.ExitCode, t.Reason)
			}
			out = append(out, msg)
		}
		if w := cs.State.Waiting; w != nil && badWaiting[w.Reason] &&
			(was.State.Waiting == nil || was.State.Waiting.Reason != w.Reason) {
			out = append(out, fmt.Sprintf("container %s waiting: %s", cs.Name, w.Reason))
		}
	}
	return out
}
EOF`],
          ['Test it without a cluster in `detect/detect_test.go`:', `cat > detect/detect_test.go <<'EOF'
package detect

import (
	"slices"
	"testing"

	corev1 "k8s.io/api/core/v1"
)

func pod(phase corev1.PodPhase, cs ...corev1.ContainerStatus) *corev1.Pod {
	return &corev1.Pod{Status: corev1.PodStatus{Phase: phase, ContainerStatuses: cs}}
}

func waiting(name, reason string, restarts int32) corev1.ContainerStatus {
	return corev1.ContainerStatus{Name: name, RestartCount: restarts,
		State: corev1.ContainerState{Waiting: &corev1.ContainerStateWaiting{Reason: reason}}}
}

func TestProblems(t *testing.T) {
	oom := corev1.ContainerStatus{Name: "app", RestartCount: 1,
		LastTerminationState: corev1.ContainerState{Terminated: &corev1.ContainerStateTerminated{ExitCode: 137, Reason: "OOMKilled"}}}
	tests := []struct {
		name     string
		old, cur *corev1.Pod
		want     []string
	}{
		{"healthy new pod", nil, pod(corev1.PodRunning), nil},
		{"pod failed", pod(corev1.PodRunning), pod(corev1.PodFailed), []string{"pod failed: a container exited with an error"}},
		{"still failed is not repeated", pod(corev1.PodFailed), pod(corev1.PodFailed), nil},
		{"oom restart", pod(corev1.PodRunning, corev1.ContainerStatus{Name: "app"}), pod(corev1.PodRunning, oom),
			[]string{"container app restarted (restarts: 1): exit code 137, reason OOMKilled"}},
		{"enters crash loop", pod(corev1.PodRunning, waiting("app", "ContainerCreating", 0)), pod(corev1.PodRunning, waiting("app", "CrashLoopBackOff", 0)),
			[]string{"container app waiting: CrashLoopBackOff"}},
		{"crash loop unchanged", pod(corev1.PodRunning, waiting("app", "CrashLoopBackOff", 2)), pod(corev1.PodRunning, waiting("app", "CrashLoopBackOff", 2)), nil},
		{"bad image on first sight", nil, pod(corev1.PodPending, waiting("web", "ImagePullBackOff", 0)),
			[]string{"container web waiting: ImagePullBackOff"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Problems(tt.old, tt.cur); !slices.Equal(got, tt.want) {
				t.Errorf("Problems() = %q, want %q", got, tt.want)
			}
		})
	}
}
EOF
go mod tidy
go test ./detect/`],
          ['Wire it to an informer in `main.go`:', `cat > main.go <<'EOF'
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd"

	"example.com/podwatch/detect"
)

func main() {
	kubeconfig := flag.String("kubeconfig", "", "kubeconfig path (default: in-cluster, then $KUBECONFIG or ~/.kube/config)")
	namespace := flag.String("namespace", "", "namespace to watch (default: all)")
	flag.Parse()

	cfg, err := loadConfig(*kubeconfig)
	if err != nil {
		log.Fatal(err)
	}
	cs := kubernetes.NewForConfigOrDie(cfg)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	factory := informers.NewSharedInformerFactoryWithOptions(cs, 10*time.Minute, informers.WithNamespace(*namespace))
	podInformer := factory.Core().V1().Pods().Informer()
	report := func(old, cur *corev1.Pod) {
		for _, p := range detect.Problems(old, cur) {
			log.Printf("%s/%s: %s", cur.Namespace, cur.Name, p)
		}
	}
	podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj any) { report(nil, obj.(*corev1.Pod)) },
		UpdateFunc: func(oldObj, newObj any) { report(oldObj.(*corev1.Pod), newObj.(*corev1.Pod)) },
	})

	factory.Start(ctx.Done())
	if !cache.WaitForCacheSync(ctx.Done(), podInformer.HasSynced) {
		log.Fatal("pod cache never synced")
	}
	log.Println("watching pods; press Ctrl-C to stop")
	<-ctx.Done()
	factory.Shutdown()
}

func loadConfig(path string) (*rest.Config, error) {
	if path == "" {
		if cfg, err := rest.InClusterConfig(); err == nil {
			return cfg, nil
		}
	}
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	rules.ExplicitPath = path
	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, &clientcmd.ConfigOverrides{}).ClientConfig()
}
EOF
go mod tidy
go build -o podwatch .`],
          ['Add RBAC for running it inside the cluster later:', `cat > deploy/rbac.yaml <<'EOF'
apiVersion: v1
kind: ServiceAccount
metadata: {name: podwatch, namespace: default}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata: {name: podwatch}
rules:
- apiGroups: [""]
  resources: [pods]
  verbs: [get, list, watch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: {name: podwatch}
roleRef: {apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: podwatch}
subjects:
- {kind: ServiceAccount, name: podwatch, namespace: default}
EOF
kubectl apply -f deploy/rbac.yaml
kubectl auth can-i watch pods --as=system:serviceaccount:default:podwatch -A`],
          ['Run it and break some Pods:', `./podwatch & sleep 3
kubectl run crasher --image=busybox -- sh -c "echo bye; exit 3"
kubectl run badimage --image=nginx:no-such-tag
kubectl run oneshot --image=busybox --restart=Never -- sh -c "exit 1"
sleep 60; kill $!`]
        ],
        verify: '`go test` prints `ok`, and `can-i` prints `yes`. Within a minute the log shows lines like `default/crasher: container crasher restarted (restarts: 1): exit code 3, reason Error`, `default/crasher: container crasher waiting: CrashLoopBackOff`, `default/badimage: container badimage waiting: ErrImagePull` (then `ImagePullBackOff`), and `default/oneshot: pod failed: a container exited with an error`.',
        cleanup: 'kubectl delete pod crasher badimage oneshot; kubectl delete -f ~/go-lab/podwatch/deploy/rbac.yaml'
      }],
      refs: [
        ['Pod lifecycle: container states and restart policy', 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/'],
        ['Debug running Pods', 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/'],
        ['k8s.io/api/core/v1 ContainerStatus', 'https://pkg.go.dev/k8s.io/api/core/v1#ContainerStatus'],
        ['client-go example: in-cluster client', 'https://github.com/kubernetes/client-go/tree/master/examples/in-cluster-client-configuration'],
        ['Using RBAC authorization', 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/']
      ],
      quiz: [
        { q: "Where do you find the exit code of a container's previous (crashed) run?",
          o: ["`status.containerStatuses[].lastState.terminated.exitCode`", "`status.phase`", "`spec.containers[].exitCode`", "`metadata.annotations`"],
          why: "`state` is the current state; `lastState` keeps the previous termination, including exit code and reason." },
        { q: "A container's last termination shows exit code 137 and reason `OOMKilled`. What happened?",
          o: ["It used more memory than its limit and the kernel killed it with SIGKILL", "It exited normally", "The image couldn't be pulled", "The node ran out of disk"],
          why: "137 = 128 + 9 (SIGKILL). With reason OOMKilled, the memory limit was exceeded." },
        { q: "Why compare the old and new Pod instead of just looking at the new one?",
          o: ["So each problem is logged once, when it appears, not on every status update", "The new Pod doesn't include status", "Informers only send diffs", "It's required by client-go"],
          why: "A crash-looping Pod gets many updates. Reporting only transitions keeps the log useful." },
        { q: "What RBAC does podwatch need to run in-cluster across all namespaces?",
          o: ["A ClusterRole with get, list and watch on pods, bound to its ServiceAccount", "cluster-admin", "A Role in the default namespace with create on pods", "No RBAC; reads are always allowed"],
          why: "An informer lists and watches; cluster-wide needs a ClusterRole. Nothing more is required." },
        { q: "Why is `detect.Problems` a pure function of two Pods?",
          o: ["It can be unit-tested with hand-built Pods, with no cluster or mocks", "Informers require pure functions", "It runs faster", "Kubernetes forbids side effects in handlers"],
          why: "Separating decision logic from I/O is what makes controllers testable. The informer wiring stays thin." }
      ]
    }
  ]
});
