// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'operators', title: 'Phase 6 · Operators & CNCF Architecture', weight: 15,
  topics: [
    {
      id: 'go-controller',
      title: 'The controller pattern: observe, analyze, act',
      basics: {
        summary: "A controller is a loop that **observes** the current state, **compares** it with the desired state, and **acts** to close the gap, then does it again. Kubernetes is built from dozens of them: the ReplicaSet controller keeps N Pods running, the Deployment controller manages ReplicaSets, and the kubelet makes containers match Pod specs. An **operator** is a controller for your own resource type.",
        ideas: [
          "**Observe → analyze → act**, forever: the reconcile loop.",
          "**Level-triggered**: reconcile looks at the whole current state, not at the event, so a missed event is harmless.",
          "**Idempotent**: running reconcile twice in a row changes nothing the second time.",
          "Desired state lives in **`spec`**; what the controller saw and did goes in **`status`**.",
          "Objects a controller creates carry an **owner reference**, so they're cleaned up with their owner."
        ]
      },
      points: [
        "controller-runtime calls `Reconcile(ctx, req)` with only a namespace/name. Always re-read the current object; it may have changed or been deleted (`client.IgnoreNotFound(err)`).",
        "Returning an error requeues the request with exponential backoff. `ctrl.Result{RequeueAfter: time.Minute}` schedules a periodic re-check without an error.",
        "`controllerutil.CreateOrUpdate` reads, applies your mutate function, and writes only if something changed, which keeps reconcile idempotent.",
        "`controllerutil.SetControllerReference(owner, obj, scheme)` sets the owner reference. Then `Owns(&T{})` re-queues the owner when an owned object changes, and garbage collection deletes owned objects with their owner.",
        "Finalizers let a controller clean up things outside Kubernetes (cloud resources, DNS) before an object is really deleted.",
        "Report progress with status conditions (`meta.SetStatusCondition`) and `observedGeneration`, so users can tell whether the latest spec has been handled.",
        "Run several replicas with leader election; only the leader reconciles.",
        "The ReplicaSet controller is the textbook example: `manageReplicas` computes `diff := len(activePods) - int(*(rs.Spec.Replicas))` and creates or deletes Pods to make it zero."
      ],
      labs: [{
        title: 'A reconcile loop in plain Go',
        goal: 'See level-triggered reconciliation without any Kubernetes: the loop fixes drift whatever caused it.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/reconcile && cd ~/go-lab/reconcile
go mod init example.com/reconcile
cat > main.go <<'EOF'
package main

import (
	"fmt"
	"maps"
	"slices"
)

// World is the "actual state": the Pods that exist right now.
type World struct {
	pods map[string]bool
	next int
}

// reconcile drives the world towards desired replicas. It never looks at
// what changed, only at what is, so any drift gets fixed the same way.
func reconcile(w *World, desired int) {
	actual := len(w.pods)    // 1. observe
	diff := desired - actual // 2. analyze
	switch {                 // 3. act
	case diff > 0:
		for range diff {
			name := fmt.Sprintf("web-%d", w.next)
			w.next++
			w.pods[name] = true
			fmt.Println("  create", name)
		}
	case diff < 0:
		names := slices.Sorted(maps.Keys(w.pods))
		for _, name := range names[:-diff] {
			delete(w.pods, name)
			fmt.Println("  delete", name)
		}
	default:
		fmt.Println("  in sync, nothing to do")
	}
}

func main() {
	w := &World{pods: map[string]bool{}}
	desired := 3

	fmt.Println("start (no pods):")
	reconcile(w, desired)

	fmt.Println("a node dies and takes web-1 with it:")
	delete(w.pods, "web-1")
	reconcile(w, desired)

	fmt.Println("user scales to 2:")
	desired = 2
	reconcile(w, desired)

	fmt.Println("resync with no changes:")
	reconcile(w, desired)

	fmt.Println("final:", slices.Sorted(maps.Keys(w.pods)))
}
EOF
go run .`]
        ],
        verify: 'Prints `create web-0`, `create web-1`, `create web-2`; after the failure `create web-3`; after scaling `delete web-0`; then `in sync, nothing to do`; and `final: [web-2 web-3]`.'
      }, {
        title: 'A real controller with controller-runtime',
        tags: ['kind cluster'],
        goal: 'Every namespace labelled `netpol=default-deny` gets a default-deny NetworkPolicy, and it comes back if someone deletes it.',
        steps: [
          ['Create a module and `main.go`:', `mkdir -p ~/go-lab/nsctrl && cd ~/go-lab/nsctrl
go mod init example.com/nsctrl
cat > main.go <<'EOF'
package main

import (
	"context"
	"os"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
)

type NamespaceReconciler struct{ client.Client }

func (r *NamespaceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := ctrl.LoggerFrom(ctx)

	// Observe: re-read the namespace; the request only carries its name.
	var ns corev1.Namespace
	if err := r.Get(ctx, req.NamespacedName, &ns); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}
	if ns.Labels["netpol"] != "default-deny" || !ns.DeletionTimestamp.IsZero() {
		return ctrl.Result{}, nil
	}

	// Analyze + act: make the policy exist and look the way we want.
	np := &networkingv1.NetworkPolicy{ObjectMeta: metav1.ObjectMeta{Name: "default-deny", Namespace: ns.Name}}
	op, err := controllerutil.CreateOrUpdate(ctx, r.Client, np, func() error {
		np.Spec.PodSelector = metav1.LabelSelector{}
		np.Spec.PolicyTypes = []networkingv1.PolicyType{networkingv1.PolicyTypeIngress, networkingv1.PolicyTypeEgress}
		return controllerutil.SetControllerReference(&ns, np, r.Scheme())
	})
	if err != nil {
		return ctrl.Result{}, err // requeued with backoff
	}
	if op != controllerutil.OperationResultNone {
		log.Info("reconciled NetworkPolicy", "namespace", ns.Name, "operation", op)
	}
	return ctrl.Result{}, nil
}

func main() {
	ctrl.SetLogger(zap.New())
	mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
		Metrics: metricsserver.Options{BindAddress: "0"}, // no metrics endpoint for this demo
	})
	if err != nil {
		ctrl.Log.Error(err, "creating manager")
		os.Exit(1)
	}
	err = ctrl.NewControllerManagedBy(mgr).
		For(&corev1.Namespace{}).
		Owns(&networkingv1.NetworkPolicy{}). // a deleted policy re-queues its namespace
		Complete(&NamespaceReconciler{Client: mgr.GetClient()})
	if err != nil {
		ctrl.Log.Error(err, "creating controller")
		os.Exit(1)
	}
	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		ctrl.Log.Error(err, "running manager")
		os.Exit(1)
	}
}
EOF
go mod tidy
go build -o nsctrl .`],
          ['Run it, label a namespace, then try to delete the policy:', `./nsctrl 2> ctrl.log & sleep 5
kubectl create namespace team-a
kubectl label namespace team-a netpol=default-deny
sleep 3; kubectl get networkpolicy -n team-a
kubectl delete networkpolicy default-deny -n team-a
sleep 3; kubectl get networkpolicy -n team-a
kill $!; grep "reconciled NetworkPolicy" ctrl.log`]
        ],
        verify: '`default-deny` appears in `team-a` after labelling, and is back a few seconds after you delete it. The log shows `reconciled NetworkPolicy` with `"operation": "created"` twice.',
        cleanup: 'kubectl delete namespace team-a'
      }],
      refs: [
        ['Kubernetes: Controllers', 'https://kubernetes.io/docs/concepts/architecture/controller/'],
        ['Kubernetes: Operator pattern', 'https://kubernetes.io/docs/concepts/extend-kubernetes/operator/'],
        ['Package controller-runtime', 'https://pkg.go.dev/sigs.k8s.io/controller-runtime'],
        ['Package controllerutil', 'https://pkg.go.dev/sigs.k8s.io/controller-runtime/pkg/controller/controllerutil'],
        ['Garbage collection and owner references', 'https://kubernetes.io/docs/concepts/architecture/garbage-collection/']
      ],
      quiz: [
        { q: "What does \"level-triggered\" mean for a reconciler?",
          o: ["It acts on the whole current state each time, so missing an event doesn't matter", "It reacts only to the exact change in each event", "It runs only when the cluster is idle", "It processes events strictly in order"],
          why: "Reconcile compares desired and actual state from scratch. Whatever caused the drift, the next run fixes it." },
        { q: "`Reconcile` returns `ctrl.Result{}, err` with a non-nil error. What happens?",
          o: ["The request is requeued with exponential backoff", "The controller crashes", "The object is deleted", "Nothing; errors are only logged"],
          why: "Errors are retried with rate limiting. Use `RequeueAfter` for planned re-checks that aren't failures." },
        { q: "Why call `controllerutil.SetControllerReference(owner, obj, scheme)` on objects you create?",
          o: ["Deleting the owner garbage-collects them, and `Owns()` re-queues the owner when they change", "It gives the controller RBAC permission on them", "It makes them immutable", "It's required for `Create` to succeed"],
          why: "Owner references tie the lifecycle and the watch together, which is how self-healing children work." },
        { q: "Reconcile is called with a name, but `Get` returns NotFound. What should it usually do?",
          o: ["Return without error (`client.IgnoreNotFound`); the object was deleted", "Recreate the object", "Return the error so it's retried forever", "Panic"],
          why: "Deletion is a normal event. Owned objects are cleaned up by garbage collection, or by a finalizer you added earlier." },
        { q: "In the ReplicaSet controller, `diff := len(activePods) - int(*(rs.Spec.Replicas))` is negative. What does it do?",
          o: ["Creates Pods until there are enough", "Deletes Pods", "Nothing; negative means in sync", "Scales the Deployment down"],
          why: "Fewer active Pods than desired gives a negative diff, so it creates the missing Pods (in batches, up to `burstReplicas`)." }
      ]
    },
    {
      id: 'go-kubebuilder',
      title: 'Kubebuilder and Operator SDK',
      basics: {
        summary: "**Kubebuilder** scaffolds a complete operator project: Go types for your API, generated CRD YAML and DeepCopy code, a controller built on **controller-runtime**, RBAC generated from comments, Makefile targets, tests that run against a real API server (**envtest**), and manifests to deploy it. **Operator SDK** uses the same Go layout and adds packaging for the Operator Lifecycle Manager (OLM).",
        ideas: [
          "`kubebuilder init` creates the project; `kubebuilder create api` adds a kind with types and a controller.",
          "You edit **`api/<version>/*_types.go`**; comment **markers** drive validation, defaults and printer columns.",
          "**`make manifests generate`** regenerates CRD and RBAC YAML and the DeepCopy code.",
          "**`make test`** runs controller tests against a real kube-apiserver and etcd (envtest).",
          "**`make install`** applies the CRDs; **`make run`** runs the controller from your machine."
        ]
      },
      points: [
        "Layout: `cmd/main.go` (the manager), `api/v1alpha1/` (types, `groupversion_info.go`, generated `zz_generated.deepcopy.go`), `internal/controller/`, `config/` (kustomize bases for CRDs, RBAC, manager, samples), `test/e2e/`, `Makefile`, `PROJECT`.",
        "Validation markers: `// +kubebuilder:validation:MinLength=1`, `Minimum`, `Enum`, `Pattern`, `XValidation` (CEL). Defaults: `// +kubebuilder:default=…`. Printer columns: `// +kubebuilder:printcolumn:…`.",
        "RBAC comes from `// +kubebuilder:rbac:groups=…,resources=…,verbs=…` markers on the controller. Forgetting one isn't caught by `make run` (it uses your admin kubeconfig) but gives forbidden errors once deployed.",
        "The manager provides a shared cache, a client that reads from the cache and writes to the API server, leader election, metrics and health probes.",
        "Webhooks: `kubebuilder create webhook --defaulting --programmatic-validation` scaffolds mutating/validating webhooks (deployed with cert-manager for TLS).",
        "Deploy: `make docker-build docker-push IMG=…` then `make deploy IMG=…`; `make undeploy` removes it.",
        "Operator SDK: `operator-sdk init --plugins go/v4` gives the same layout plus OLM bundle tooling; it also supports Helm- and Ansible-based operators.",
        "Each kubebuilder release pins controller-runtime, the Kubernetes libraries and the Go version, so start new projects with a recent release."
      ],
      labs: [{
        title: 'Scaffold an operator, add a validated field, and test it',
        tags: ['kind cluster'],
        goal: 'Go from nothing to a tested controller that writes status, running against your cluster.',
        steps: [
          ['Install kubebuilder:', `KB=4.16.0   # see github.com/kubernetes-sigs/kubebuilder/releases for the latest
mkdir -p $HOME/.local/bin && export PATH=$PATH:$HOME/.local/bin
curl -sSLo $HOME/.local/bin/kubebuilder https://github.com/kubernetes-sigs/kubebuilder/releases/download/v$KB/kubebuilder_$(go env GOOS)_$(go env GOARCH)
chmod +x $HOME/.local/bin/kubebuilder
kubebuilder version`],
          ['Scaffold a project and an API:', `mkdir -p ~/go-lab/greeting && cd ~/go-lab/greeting
kubebuilder init --domain example.com --repo example.com/greeting
kubebuilder create api --group demo --version v1 --kind Greeting --resource --controller
ls api/v1 internal/controller config/crd`],
          ['Replace `api/v1/greeting_types.go` with a spec field that has validation and a default:', `cat > api/v1/greeting_types.go <<'EOF'
package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

// GreetingSpec is the desired state.
type GreetingSpec struct {
	// Message to publish in status.
	// +kubebuilder:validation:MinLength=1
	// +kubebuilder:validation:MaxLength=64
	// +kubebuilder:default="hello"
	// +optional
	Message string \`json:"message,omitempty"\`
}

// GreetingStatus is what the controller observed.
type GreetingStatus struct {
	// ObservedMessage is the last message the controller handled.
	// +optional
	ObservedMessage string \`json:"observedMessage,omitempty"\`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Message",type=string,JSONPath=\`.spec.message\`
// +kubebuilder:printcolumn:name="Observed",type=string,JSONPath=\`.status.observedMessage\`

// Greeting is the Schema for the greetings API.
type Greeting struct {
	metav1.TypeMeta \`json:",inline"\`
	// +optional
	metav1.ObjectMeta \`json:"metadata,omitzero"\`
	// +required
	Spec GreetingSpec \`json:"spec"\`
	// +optional
	Status GreetingStatus \`json:"status,omitzero"\`
}

// +kubebuilder:object:root=true

// GreetingList contains a list of Greeting.
type GreetingList struct {
	metav1.TypeMeta \`json:",inline"\`
	metav1.ListMeta \`json:"metadata,omitzero"\`
	Items           []Greeting \`json:"items"\`
}

func init() {
	SchemeBuilder.Register(func(s *runtime.Scheme) error {
		s.AddKnownTypes(SchemeGroupVersion, &Greeting{}, &GreetingList{})
		return nil
	})
}
EOF`],
          ['Replace `internal/controller/greeting_controller.go` with a reconcile that copies spec to status:', `cat > internal/controller/greeting_controller.go <<'EOF'
package controller

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	demov1 "example.com/greeting/api/v1"
)

// GreetingReconciler reconciles a Greeting object.
type GreetingReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=demo.example.com,resources=greetings,verbs=get;list;watch
// +kubebuilder:rbac:groups=demo.example.com,resources=greetings/status,verbs=get;update;patch

func (r *GreetingReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var g demov1.Greeting
	if err := r.Get(ctx, req.NamespacedName, &g); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}
	if g.Status.ObservedMessage == g.Spec.Message {
		return ctrl.Result{}, nil // already in sync
	}
	g.Status.ObservedMessage = g.Spec.Message
	log.Info("updating status", "message", g.Spec.Message)
	return ctrl.Result{}, r.Status().Update(ctx, &g)
}

// SetupWithManager sets up the controller with the Manager.
func (r *GreetingReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&demov1.Greeting{}).
		Named("greeting").
		Complete(r)
}
EOF`],
          ['Regenerate code and manifests, look at the generated schema, and run the envtest suite:', `make manifests generate
grep -A3 "message:" config/crd/bases/demo.example.com_greetings.yaml | head -8
make test`],
          ['Install the CRD, run the controller locally, and create a Greeting:', `make install build
./bin/manager 2> manager.log & sleep 5
cat <<'EOF' | kubectl apply -f -
apiVersion: demo.example.com/v1
kind: Greeting
metadata: {name: hi}
spec: {message: "hello, operators"}
EOF
sleep 2; kubectl get greetings
kubectl patch greeting hi --type=merge -p '{"spec":{"message":""}}' || echo "empty message rejected"
kill $!`]
        ],
        verify: 'The generated CRD shows `default: hello`, `maxLength: 64` and `minLength: 1` under `message`. `make test` ends with `ok … internal/controller`. `kubectl get greetings` shows `hi   hello, operators   hello, operators`, and the empty patch is rejected (`should be at least 1 chars long`).',
        cleanup: 'cd ~/go-lab/greeting && make uninstall'
      }],
      refs: [
        ['The Kubebuilder Book', 'https://book.kubebuilder.io/'],
        ['Kubebuilder quick start', 'https://book.kubebuilder.io/quick-start'],
        ['Kubebuilder: CRD generation markers', 'https://book.kubebuilder.io/reference/markers/crd.html'],
        ['Kubebuilder: writing controller tests (envtest)', 'https://book.kubebuilder.io/reference/envtest.html'],
        ['Operator SDK: Go operator tutorial', 'https://sdk.operatorframework.io/docs/building-operators/golang/tutorial/']
      ],
      quiz: [
        { q: "You add `// +kubebuilder:validation:MinLength=1` to a field. What makes it take effect?",
          o: ["Running `make manifests` and re-applying the CRD (`make install`)", "Nothing else; markers are read at run time", "Running `go build`", "Restarting the controller"],
          why: "Markers are read by controller-gen to generate the CRD schema. The API server enforces the schema once the new CRD is applied." },
        { q: "Your controller works with `make run` but gets \"forbidden\" errors after `make deploy`. Most likely cause?",
          o: ["A missing `+kubebuilder:rbac` marker, so the deployed ServiceAccount lacks permission", "envtest wasn't run", "The CRD wasn't installed", "The image is too old"],
          why: "`make run` uses your own (often admin) kubeconfig. In-cluster, the controller only has the RBAC generated from its markers." },
        { q: "What does `make test` in a kubebuilder project run the controller tests against?",
          o: ["A real kube-apiserver and etcd started locally by envtest", "Your current kind cluster", "A fake client with no API server", "Nothing; it only compiles"],
          why: "envtest gives real API semantics (validation, defaults, status subresource) without kubelets or nodes." },
        { q: "What does `make generate` produce?",
          o: ["DeepCopy methods (`zz_generated.deepcopy.go`) for your API types", "The CRD YAML", "A Docker image", "Go client libraries for other languages"],
          why: "`generate` runs controller-gen's object generator; `manifests` produces CRD, RBAC and webhook YAML." },
        { q: "How does Operator SDK relate to Kubebuilder for Go operators?",
          o: ["It uses the same project layout and libraries, adding OLM packaging and Helm/Ansible operator types", "It's an unrelated framework with its own runtime", "It replaces controller-runtime", "It only works on OpenShift"],
          why: "Operator SDK's Go plugin builds on kubebuilder, so skills transfer directly between the two." }
      ]
    },
    {
      id: 'go-cncf-code',
      title: 'Reading CNCF code: ReplicaSet controller, istiod, Cilium',
      basics: {
        summary: "Once you know client-go, informers and reconcile loops, the source of big CNCF projects becomes readable: they use the same few patterns at scale. This topic walks through three real code paths: the **ReplicaSet controller** keeping Pod counts right, **istiod** turning Kubernetes Services into Envoy configuration, and **Cilium** turning NetworkPolicies into eBPF policy maps.",
        ideas: [
          "**Find the entry point**: a `Run` method that starts informers and workers.",
          "**Follow an event**: handler → work queue → `sync`/`reconcile` function.",
          "**Look for the diff**: the line comparing desired and actual state.",
          "**istiod** watches Services and Endpoints, converts them to its own model, and **pushes xDS** to Envoy proxies.",
          "**Cilium** parses NetworkPolicies into rules and updates **per-endpoint eBPF policy maps** in the kernel."
        ]
      },
      points: [
        "ReplicaSet controller (`kubernetes/pkg/controller/replicaset/replica_set.go`): `Run` starts `worker` goroutines → `processNextWorkItem` → `syncReplicaSet(ctx, key)` → `manageReplicas`.",
        "`manageReplicas` caps each round at `burstReplicas`, records \"expectations\" (`ExpectCreations`) so it doesn't over-create before the informer catches up, and creates Pods in slow-start batches.",
        "When too many Pods exist, `getPodsToDelete` ranks them so that unscheduled, not-ready and recently started Pods are deleted first.",
        "istiod (`istio/pilot/pkg/serviceregistry/kube/controller/controller.go`): `registerHandlers(c, c.services, \"Services\", c.onServiceEvent, nil)`; `onServiceEvent` calls `kube.ConvertService` and then `addOrUpdateService`, which calls `XDSUpdater.SvcUpdate`/`EDSCacheUpdate` to push to proxies.",
        "Cilium (`cilium/pkg/policy/k8s/network_policy.go`): `addK8sNetworkPolicyV1` calls `k8s.ParseNetworkPolicy` and hands the rules to `policyImporter.UpdatePolicy`. Endpoints are regenerated and their eBPF policy maps (`pkg/maps/policymap`) updated.",
        "Reading tips: use `gopls` \"go to definition\" or pkg.go.dev's source links; search for `AddEventHandler` to find what a component watches; read tests to see intended behaviour.",
        "Sparse, shallow clones keep huge repos manageable: `git clone --depth 1 --filter=blob:none --sparse …` then `git sparse-checkout set <dirs>`.",
        "Line numbers drift between releases; function names are more stable, so search by name."
      ],
      labs: [{
        title: 'Trace three real code paths',
        goal: 'Find, in current source code, where each project turns observed state into action.',
        steps: [
          ['Fetch only the directories you need from each project:', `mkdir -p ~/go-lab/cncf && cd ~/go-lab/cncf
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/kubernetes/kubernetes.git
git -C kubernetes sparse-checkout set pkg/controller/replicaset
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/istio/istio.git
git -C istio sparse-checkout set pilot/pkg/serviceregistry/kube
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/cilium/cilium.git
git -C cilium sparse-checkout set pkg/policy/k8s pkg/k8s pkg/maps/policymap`],
          ['ReplicaSet controller: find the worker loop, the sync function and the diff:', `cd ~/go-lab/cncf/kubernetes/pkg/controller/replicaset
grep -n "^func (rsc \\*ReplicaSetController) \\(Run\\|worker\\|processNextWorkItem\\|syncReplicaSet\\|manageReplicas\\)" replica_set.go
grep -n "diff := \\|burstReplicas {\\|ExpectCreations" replica_set.go`],
          ['istiod: find where Service events become xDS pushes:', `cd ~/go-lab/cncf/istio/pilot/pkg/serviceregistry/kube
grep -n '"Services", c.onServiceEvent' controller/controller.go
grep -n "kube.ConvertService\\|XDSUpdater.SvcUpdate\\|XDSUpdater.EDSCacheUpdate" controller/controller.go`],
          ['Cilium: follow a Kubernetes NetworkPolicy into the policy engine:', `cd ~/go-lab/cncf/cilium
grep -n "^func (p \\*policyWatcher) addK8sNetworkPolicyV1\\|ParseNetworkPolicy\\|UpdatePolicy" pkg/policy/k8s/network_policy.go
grep -n "^func ParseNetworkPolicy" pkg/k8s/network_policy.go
ls pkg/maps/policymap`],
          ['Now read, with these questions in mind:', `# 1. replica_set.go: why does manageReplicas call ExpectCreations before creating Pods?
# 2. replica_set.go: which Pods does getPodsToDelete prefer to delete, and why?
# 3. controller.go (istio): what does onServiceEvent do differently for a delete event?
# 4. network_policy.go (cilium): what identifies the policy so a later delete removes exactly these rules?`]
        ],
        verify: 'Each grep finds its lines: `manageReplicas` with `diff := len(activePods) - int(*(rs.Spec.Replicas))`; istio\'s `registerHandlers(c, c.services, "Services", c.onServiceEvent, nil)` and the `XDSUpdater` calls; Cilium\'s `addK8sNetworkPolicyV1` calling `k8s.ParseNetworkPolicy` and `UpdatePolicy`. You can answer the four questions from the code.'
      }],
      refs: [
        ['ReplicaSet controller source', 'https://github.com/kubernetes/kubernetes/blob/master/pkg/controller/replicaset/replica_set.go'],
        ['istiod Kubernetes service registry', 'https://github.com/istio/istio/tree/master/pilot/pkg/serviceregistry/kube/controller'],
        ['Istio architecture', 'https://istio.io/latest/docs/ops/deployment/architecture/'],
        ['Cilium Kubernetes policy watcher', 'https://github.com/cilium/cilium/tree/main/pkg/policy/k8s'],
        ['Cilium: eBPF datapath', 'https://docs.cilium.io/en/stable/network/ebpf/']
      ],
      quiz: [
        { q: "Why does the ReplicaSet controller record \"expectations\" before creating Pods?",
          o: ["So it doesn't create duplicates before its informer cache has seen the new Pods", "To reserve IP addresses for the Pods", "To tell the scheduler where to place them", "To rate-limit the API server"],
          why: "The cache lags behind the API. Expectations make the controller wait until it has observed its own creates before acting again." },
        { q: "When a ReplicaSet has too many Pods, which ones are deleted first?",
          o: ["Unscheduled and not-ready Pods, then the most recently started", "The oldest Pods", "Pods chosen at random", "Pods with the highest CPU usage"],
          why: "Removing Pods that aren't serving yet keeps availability as high as possible while scaling down." },
        { q: "What does istiod do when a Kubernetes Service changes?",
          o: ["Converts it to its internal model and pushes updated xDS config to Envoy proxies", "Rewrites the Service's ClusterIP", "Restarts the Pods behind it", "Updates iptables rules on each node"],
          why: "istiod is a controller whose \"act\" step is pushing configuration over gRPC (xDS) to every sidecar or ztunnel." },
        { q: "How does Cilium enforce a Kubernetes NetworkPolicy?",
          o: ["It parses it into policy rules and programs per-endpoint eBPF policy maps in the kernel", "It converts it to iptables rules", "It runs a proxy sidecar in each Pod", "It asks kube-proxy to drop the packets"],
          why: "Cilium's datapath checks eBPF maps keyed by security identity and port for every packet." },
        { q: "What is the quickest way to find what a Kubernetes component watches?",
          o: ["Search its code for informer `AddEventHandler` calls (or `registerHandlers`-style helpers)", "Read its Dockerfile", "Check its Helm chart values", "Look at its CRDs only"],
          why: "Event handler registration lists exactly which resource types drive the component's reconcile loops." }
      ]
    },
    {
      id: 'go-m6-operator',
      title: 'Milestone 6: an operator that injects labels and a sidecar',
      basics: {
        summary: "Build the **DeploymentPolicy** operator with kubebuilder. A `DeploymentPolicy` custom resource selects Deployments by label and declares **labels** and a **sidecar container** to add to their Pod templates. The controller reconciles every matching Deployment, re-applies the policy when someone edits a Deployment, and reports how many Deployments matched in **status**.",
        ideas: [
          "**Your API**: `spec.selector`, `spec.labels`, `spec.sidecar` (a full `corev1.Container`); `status.matchedDeployments` and conditions.",
          "The controller watches **both** DeploymentPolicies and Deployments; a Deployment change re-queues the policies in its namespace.",
          "Changes are applied with a **merge patch**, and only when something is actually missing (idempotent).",
          "**`GenerationChangedPredicate`** stops status updates from triggering pointless reconciles.",
          "An **envtest** test proves the injection before you touch a real cluster."
        ]
      },
      points: [
        "Changing a Deployment's Pod template triggers a rolling update, which is exactly how sidecar injectors roll the sidecar out. Istio and Linkerd do the same with a mutating admission webhook at Pod creation instead.",
        "Map functions (`handler.EnqueueRequestsFromMapFunc`) translate an event on one kind into reconcile requests for another.",
        "`client.MergeFrom(original)` builds a patch from the difference, so you never overwrite fields other controllers own.",
        "Removing a policy doesn't remove what it injected. Doing that cleanly needs a finalizer, or server-side apply with a field manager, as an extension.",
        "Avoid fights: if another controller removes your sidecar, you'll re-add it forever. Make ownership clear (one policy per Deployment, or a label marking injected objects).",
        "RBAC needs `get;list;watch` on deploymentpolicies, `update;patch` on their status, and `get;list;watch;update;patch` on deployments.",
        "Status uses standard conditions: `meta.SetStatusCondition` with `ObservedGeneration`, so `kubectl wait --for=condition=Ready` works."
      ],
      labs: [{
        title: 'Build the DeploymentPolicy operator step by step',
        tags: ['kind cluster'],
        goal: 'An operator that injects labels and a sidecar into selected Deployments, with an envtest test, run against your cluster.',
        steps: [
          ['Reference layout (generated by kubebuilder; you write the starred files):', `deploypolicy/
├── Makefile, PROJECT, Dockerfile, go.mod
├── cmd/main.go                                   # manager (generated)
├── api/v1alpha1/
│   ├── deploymentpolicy_types.go                 # * spec and status
│   └── zz_generated.deepcopy.go                  # make generate
├── internal/controller/
│   ├── deploymentpolicy_controller.go            # * reconcile + watches
│   ├── deploymentpolicy_controller_test.go       # * envtest test
│   └── suite_test.go                             # envtest setup (generated)
└── config/
    ├── crd/bases/…deploymentpolicies.yaml        # make manifests
    ├── rbac/role.yaml                            # from +kubebuilder:rbac markers
    └── samples/policy_v1alpha1_deploymentpolicy.yaml  # * example policy`],
          ['Scaffold the project (install kubebuilder first, as in the Kubebuilder topic\'s lab):', `export PATH=$PATH:$HOME/.local/bin
command -v kubebuilder >/dev/null || { mkdir -p $HOME/.local/bin; curl -sSLo $HOME/.local/bin/kubebuilder https://github.com/kubernetes-sigs/kubebuilder/releases/download/v4.16.0/kubebuilder_$(go env GOOS)_$(go env GOARCH); chmod +x $HOME/.local/bin/kubebuilder; }
mkdir -p ~/go-lab/deploypolicy && cd ~/go-lab/deploypolicy
kubebuilder init --domain example.com --repo example.com/deploypolicy
kubebuilder create api --group policy --version v1alpha1 --kind DeploymentPolicy --resource --controller`],
          ['Define the API in `api/v1alpha1/deploymentpolicy_types.go`:', `cat > api/v1alpha1/deploymentpolicy_types.go <<'EOF'
package v1alpha1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

// DeploymentPolicySpec says which Deployments to change and how.
type DeploymentPolicySpec struct {
	// Selector picks Deployments in the policy's namespace.
	Selector metav1.LabelSelector \`json:"selector"\`
	// Labels to add to each matched Deployment's Pod template.
	// +optional
	Labels map[string]string \`json:"labels,omitempty"\`
	// Sidecar container to inject into each matched Deployment's Pod template.
	// +optional
	Sidecar *corev1.Container \`json:"sidecar,omitempty"\`
}

// DeploymentPolicyStatus reports what the controller last did.
type DeploymentPolicyStatus struct {
	// MatchedDeployments is how many Deployments the selector matched.
	// +optional
	MatchedDeployments int32 \`json:"matchedDeployments,omitempty"\`
	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition \`json:"conditions,omitempty"\`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=dpol
// +kubebuilder:printcolumn:name="Matched",type=integer,JSONPath=\`.status.matchedDeployments\`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=\`.metadata.creationTimestamp\`

// DeploymentPolicy injects labels and a sidecar into matching Deployments.
type DeploymentPolicy struct {
	metav1.TypeMeta \`json:",inline"\`
	// +optional
	metav1.ObjectMeta \`json:"metadata,omitzero"\`
	// +required
	Spec DeploymentPolicySpec \`json:"spec"\`
	// +optional
	Status DeploymentPolicyStatus \`json:"status,omitzero"\`
}

// +kubebuilder:object:root=true

// DeploymentPolicyList contains a list of DeploymentPolicy.
type DeploymentPolicyList struct {
	metav1.TypeMeta \`json:",inline"\`
	metav1.ListMeta \`json:"metadata,omitzero"\`
	Items           []DeploymentPolicy \`json:"items"\`
}

func init() {
	SchemeBuilder.Register(func(s *runtime.Scheme) error {
		s.AddKnownTypes(SchemeGroupVersion, &DeploymentPolicy{}, &DeploymentPolicyList{})
		return nil
	})
}
EOF`],
          ['Write the controller in `internal/controller/deploymentpolicy_controller.go`:', `cat > internal/controller/deploymentpolicy_controller.go <<'EOF'
package controller

import (
	"context"
	"fmt"
	"slices"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/predicate"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	policyv1alpha1 "example.com/deploypolicy/api/v1alpha1"
)

// DeploymentPolicyReconciler reconciles a DeploymentPolicy object.
type DeploymentPolicyReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=policy.example.com,resources=deploymentpolicies,verbs=get;list;watch
// +kubebuilder:rbac:groups=policy.example.com,resources=deploymentpolicies/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;update;patch

func (r *DeploymentPolicyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// Observe: the policy, and the Deployments it selects.
	var policy policyv1alpha1.DeploymentPolicy
	if err := r.Get(ctx, req.NamespacedName, &policy); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}
	sel, err := metav1.LabelSelectorAsSelector(&policy.Spec.Selector)
	if err != nil {
		return ctrl.Result{}, reconcile.TerminalError(err) // bad selector: retrying won't help
	}
	var deps appsv1.DeploymentList
	if err := r.List(ctx, &deps, client.InNamespace(policy.Namespace), client.MatchingLabelsSelector{Selector: sel}); err != nil {
		return ctrl.Result{}, err
	}

	// Analyze + act: patch only Deployments that are missing something.
	for i := range deps.Items {
		d := &deps.Items[i]
		original := d.DeepCopy()
		if !applyPolicy(&policy, &d.Spec.Template) {
			continue
		}
		if err := r.Patch(ctx, d, client.MergeFrom(original)); err != nil {
			return ctrl.Result{}, err
		}
		log.Info("applied policy", "deployment", d.Name)
	}

	// Report.
	policy.Status.MatchedDeployments = int32(len(deps.Items))
	meta.SetStatusCondition(&policy.Status.Conditions, metav1.Condition{
		Type: "Ready", Status: metav1.ConditionTrue, Reason: "Reconciled",
		Message:            fmt.Sprintf("%d deployment(s) match", len(deps.Items)),
		ObservedGeneration: policy.Generation,
	})
	return ctrl.Result{}, r.Status().Update(ctx, &policy)
}

// applyPolicy changes tmpl to match the policy and reports whether anything changed.
func applyPolicy(p *policyv1alpha1.DeploymentPolicy, tmpl *corev1.PodTemplateSpec) bool {
	changed := false
	for k, v := range p.Spec.Labels {
		if tmpl.Labels[k] != v {
			if tmpl.Labels == nil {
				tmpl.Labels = map[string]string{}
			}
			tmpl.Labels[k] = v
			changed = true
		}
	}
	if sc := p.Spec.Sidecar; sc != nil &&
		!slices.ContainsFunc(tmpl.Spec.Containers, func(c corev1.Container) bool { return c.Name == sc.Name }) {
		tmpl.Spec.Containers = append(tmpl.Spec.Containers, *sc.DeepCopy())
		changed = true
	}
	return changed
}

// policiesForDeployment re-queues every policy in a changed Deployment's namespace.
func (r *DeploymentPolicyReconciler) policiesForDeployment(ctx context.Context, obj client.Object) []reconcile.Request {
	var policies policyv1alpha1.DeploymentPolicyList
	if err := r.List(ctx, &policies, client.InNamespace(obj.GetNamespace())); err != nil {
		return nil
	}
	reqs := make([]reconcile.Request, 0, len(policies.Items))
	for _, p := range policies.Items {
		reqs = append(reqs, reconcile.Request{NamespacedName: types.NamespacedName{Namespace: p.Namespace, Name: p.Name}})
	}
	return reqs
}

// SetupWithManager sets up the controller with the Manager.
func (r *DeploymentPolicyReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		// Spec changes only: our own status updates don't re-trigger us.
		For(&policyv1alpha1.DeploymentPolicy{}, builder.WithPredicates(predicate.GenerationChangedPredicate{})).
		Watches(&appsv1.Deployment{}, handler.EnqueueRequestsFromMapFunc(r.policiesForDeployment)).
		Named("deploymentpolicy").
		Complete(r)
}
EOF`],
          ['Replace the generated test with one that checks the injection, in `internal/controller/deploymentpolicy_controller_test.go`:', `cat > internal/controller/deploymentpolicy_controller_test.go <<'EOF'
package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	policyv1alpha1 "example.com/deploypolicy/api/v1alpha1"
)

var _ = Describe("DeploymentPolicy Controller", func() {
	ctx := context.Background()
	key := types.NamespacedName{Name: "mesh", Namespace: "default"}

	It("injects labels and the sidecar into matching Deployments only", func() {
		replicas := int32(1)
		deployment := func(name, team string) *appsv1.Deployment {
			labels := map[string]string{"app": name, "team": team}
			return &appsv1.Deployment{
				ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default", Labels: labels},
				Spec: appsv1.DeploymentSpec{
					Replicas: &replicas,
					Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": name}},
					Template: corev1.PodTemplateSpec{
						ObjectMeta: metav1.ObjectMeta{Labels: labels},
						Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "app", Image: "nginx"}}},
					},
				},
			}
		}
		Expect(k8sClient.Create(ctx, deployment("web", "payments"))).To(Succeed())
		Expect(k8sClient.Create(ctx, deployment("other", "search"))).To(Succeed())
		Expect(k8sClient.Create(ctx, &policyv1alpha1.DeploymentPolicy{
			ObjectMeta: metav1.ObjectMeta{Name: key.Name, Namespace: key.Namespace},
			Spec: policyv1alpha1.DeploymentPolicySpec{
				Selector: metav1.LabelSelector{MatchLabels: map[string]string{"team": "payments"}},
				Labels:   map[string]string{"mesh": "enabled"},
				Sidecar:  &corev1.Container{Name: "proxy", Image: "busybox", Command: []string{"sleep", "infinity"}},
			},
		})).To(Succeed())

		r := &DeploymentPolicyReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		for range 2 { // the second run must change nothing
			_, err := r.Reconcile(ctx, reconcile.Request{NamespacedName: key})
			Expect(err).NotTo(HaveOccurred())
		}

		var web, other appsv1.Deployment
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: "web", Namespace: "default"}, &web)).To(Succeed())
		Expect(web.Spec.Template.Labels).To(HaveKeyWithValue("mesh", "enabled"))
		Expect(web.Spec.Template.Spec.Containers).To(HaveLen(2))
		Expect(web.Spec.Template.Spec.Containers[1].Name).To(Equal("proxy"))

		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: "other", Namespace: "default"}, &other)).To(Succeed())
		Expect(other.Spec.Template.Spec.Containers).To(HaveLen(1))

		var policy policyv1alpha1.DeploymentPolicy
		Expect(k8sClient.Get(ctx, key, &policy)).To(Succeed())
		Expect(policy.Status.MatchedDeployments).To(Equal(int32(1)))
	})
})
EOF`],
          ['Generate, then run the tests against envtest:', `make manifests generate
make test`],
          ['Write a sample policy in `config/samples/policy_v1alpha1_deploymentpolicy.yaml`:', `cat > config/samples/policy_v1alpha1_deploymentpolicy.yaml <<'EOF'
apiVersion: policy.example.com/v1alpha1
kind: DeploymentPolicy
metadata:
  name: payments-mesh
spec:
  selector:
    matchLabels: {team: payments}
  labels:
    mesh: enabled
  sidecar:
    name: log-shipper
    image: busybox:1.36
    command: [sh, -c, "tail -F /var/log/app.log 2>/dev/null || sleep infinity"]
EOF`],
          ['Install the CRD, run the operator, and watch it work:', `make install build
./bin/manager 2> manager.log & sleep 5
kubectl create deployment checkout --image=nginx
kubectl label deployment checkout team=payments
kubectl create deployment search --image=nginx
kubectl apply -f config/samples/policy_v1alpha1_deploymentpolicy.yaml
sleep 3
kubectl get deploymentpolicies
kubectl get deploy checkout -o jsonpath='{.spec.template.metadata.labels.mesh} {.spec.template.spec.containers[*].name}{"\\n"}'
kubectl get deploy search -o jsonpath='{.spec.template.spec.containers[*].name}{"\\n"}'`],
          ['Fight the operator: remove the sidecar by hand and watch it come back:', `kubectl patch deploy checkout --type=json -p '[{"op":"remove","path":"/spec/template/spec/containers/1"}]'
sleep 3
kubectl get deploy checkout -o jsonpath='{.spec.template.spec.containers[*].name}{"\\n"}'
kill $!; grep -c "applied policy" manager.log`]
        ],
        verify: '`make test` passes (`ok … internal/controller`). `kubectl get dpol` shows `payments-mesh` with `MATCHED 1`; `checkout` prints `enabled nginx log-shipper` while `search` still prints just `nginx`. After you remove the sidecar it is back as `nginx log-shipper`, and the log counts 2 `applied policy` lines.',
        cleanup: 'kubectl delete deploy checkout search; cd ~/go-lab/deploypolicy && make uninstall'
      }],
      refs: [
        ['The Kubebuilder Book: tutorial (CronJob)', 'https://book.kubebuilder.io/cronjob-tutorial/cronjob-tutorial'],
        ['controller-runtime: handler package (EnqueueRequestsFromMapFunc)', 'https://pkg.go.dev/sigs.k8s.io/controller-runtime/pkg/handler'],
        ['controller-runtime: predicate package', 'https://pkg.go.dev/sigs.k8s.io/controller-runtime/pkg/predicate'],
        ['Kubernetes API conventions: typical status properties', 'https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#typical-status-properties'],
        ['Istio: sidecar injection', 'https://istio.io/latest/docs/setup/additional-setup/sidecar-injection/']
      ],
      quiz: [
        { q: "Why does the controller also watch Deployments, not just DeploymentPolicies?",
          o: ["So a new or edited Deployment gets the policy applied without waiting for the policy to change", "Because `For()` can only take built-in types", "To delete Deployments that don't match", "To count Pods for the status"],
          why: "The map function turns each Deployment event into reconcile requests for the policies in that namespace." },
        { q: "What does `GenerationChangedPredicate` on the policy watch prevent?",
          o: ["Reconciling again every time the controller updates the policy's status", "Reconciling when the spec changes", "Watching Deployments", "Leader election"],
          why: "Status writes don't change `metadata.generation`. Filtering on it ignores the controller's own status updates." },
        { q: "Why patch with `client.MergeFrom(original)` instead of a full `Update`?",
          o: ["Only the changed fields are sent, so you don't overwrite fields others changed since your read", "Patches skip RBAC checks", "Update can't change Pod templates", "Patches don't trigger rollouts"],
          why: "A merge patch carries just your diff. Full updates are more likely to conflict and to clobber other writers' changes." },
        { q: "The operator injects a sidecar into a Deployment's Pod template. What happens to its running Pods?",
          o: ["A rolling update replaces them with Pods that include the sidecar", "Nothing until they're restarted by hand", "The sidecar is added to running Pods in place", "The Deployment is deleted and recreated"],
          why: "Any Pod template change creates a new ReplicaSet revision, and the Deployment controller rolls it out." },
        { q: "Someone deletes the DeploymentPolicy. What happens to Deployments it already changed?",
          o: ["They keep the labels and sidecar; cleaning up needs a finalizer or similar logic", "Kubernetes reverts them automatically", "They're deleted by garbage collection", "The API server rejects the delete"],
          why: "The policy doesn't own the Deployments, so nothing reverses its changes unless you write that cleanup." }
      ]
    }
  ]
});
