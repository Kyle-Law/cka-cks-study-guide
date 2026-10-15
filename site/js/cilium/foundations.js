// Part 1: chapters 1-3. Quiz format: the FIRST option is correct; options are shuffled when shown.
COURSE.addDomain({
  id: 'foundations', title: 'Foundations (ch. 1–3)', weight: 14,
  topics: [
    {
      id: 'cil-why',
      title: 'Ch 1: Why Cilium? eBPF and the use cases',
      basics: {
        summary: "Early Kubernetes network plugins were built on **iptables**, a tool designed for static firewalls, and it struggles when Pods and Services change all the time. Cilium uses **eBPF**, a safe way to run small programs inside the Linux kernel, to do networking, security and observability faster and at larger scale.",
        ideas: [
          "**eBPF**: sandboxed programs that run in the kernel, checked by a verifier and compiled to native code.",
          "Cilium is a **CNI** and much more: load balancing, Ingress/Gateway API, multicluster, BGP, policy, encryption and observability.",
          "You **don't have to enable everything**: start as a CNI and switch features on as you need them.",
          "Widely adopted (GKE Dataplane V2, Azure CNI powered by Cilium, EKS Anywhere) and a **CNCF graduated** project (2023)."
        ]
      },
      points: [
        "Workloads need the same things regardless of platform: reachable IPs, pod-to-pod and outbound connectivity, inbound access, security, resilience, compliance and visibility.",
        "The CNI specification standardised how Kubernetes plugs in a network implementation. Flannel and Weave focused on basic connectivity; Calico added policy and BGP; all relied on iptables for filtering, NAT and load balancing.",
        "iptables rules must be rewritten as Pods and Services change, and packets walk the rule chains one by one, so cost grows with cluster size.",
        "eBPF (once \"extended Berkeley Packet Filter\") runs custom programs in the kernel without kernel modules or recompiling. A verifier rejects unsafe programs; JIT compilation makes them fast. Often compared to what JavaScript did for the browser.",
        "Cilium started in December 2015, added Cluster Mesh, Transparent Encryption, Hubble and sidecar-free service mesh, and graduated from the CNCF in 2023 (the only graduated project in the Cloud Native Networking category).",
        "Use cases covered in the book: CNI networking (ch. 4–5), Ingress and Gateway API (ch. 7), sidecarless service mesh (Envoy per node), multicluster with Cluster Mesh (ch. 9), BGP and L2 connectivity to the wider network (ch. 10), network policy at L3–L7 with identities (ch. 12–13), transparent encryption with IPsec or WireGuard (ch. 14), and Hubble observability (ch. 15).",
        "Cilium policies are based on Kubernetes labels and identities (\"frontend may call payments\"), not on IP addresses that change constantly.",
        "Looking ahead: AI/GPU workloads needing high throughput, VMs via KubeVirt, netkit as a faster replacement for veth, and eBPF on Windows."
      ],
      labs: [{
        title: 'See what eBPF and Cilium run on a node',
        goal: 'A first look before installing anything substantial. Uses the kind cluster from the home page, with Cilium installed by the default `cilium install`.',
        steps: [
          ['Create the cluster (CNI disabled) and confirm the nodes are NotReady because no CNI is installed yet:', 'kind create cluster --config kind.yaml\nkubectl get nodes\nkubectl get node kind-worker -o jsonpath=\'{.status.conditions[?(@.type=="Ready")].message}\'; echo'],
          ['Install Cilium with the CLI and wait for it:', 'cilium install --version 1.18.4\ncilium status --wait'],
          ['List the eBPF programs Cilium attached to network devices on a node:', 'kubectl -n kube-system exec ds/cilium -c cilium-agent -- bpftool net show | head -20'],
          ['Count the eBPF maps the agent manages (state shared between programs and the agent):', 'kubectl -n kube-system exec ds/cilium -c cilium-agent -- bpftool map show | grep -c cilium']
        ],
        verify: 'Nodes go from `NotReady` (cni plugin not initialized) to `Ready`, and `bpftool net show` lists programs such as `cil_from_container` and `cil_from_netdev`.',
        cleanup: 'Keep the cluster for the next topic, or `kind delete cluster`.'
      }],
      refs: [
        ['Introduction to Cilium & Hubble', 'https://docs.cilium.io/en/stable/overview/intro/'],
        ['What is eBPF?', 'https://ebpf.io/what-is-ebpf/'],
        ['Cilium project site', 'https://cilium.io/'],
        ['CNCF: Cilium graduation', 'https://www.cncf.io/announcements/2023/10/11/cloud-native-computing-foundation-announces-cilium-graduation/']
      ],
      quiz: [
        { q: "Why do iptables-based Kubernetes networking setups slow down at large scale?",
          o: ["Rules must be rewritten as Pods and Services change, and packets are matched against long rule chains one by one", "iptables can't route IPv4", "iptables only works on a single node", "iptables needs a separate database"],
          why: "iptables was designed for fairly static firewalls. Lookups are linear and rule updates are expensive." },
        { q: "What makes it safe to load eBPF programs into a running kernel?",
          o: ["A verifier checks each program before it runs (no invalid memory access, no infinite loops)", "They run in a separate virtual machine", "They are signed by the kernel maintainers", "They only run in user space"],
          why: "After verification, programs are JIT-compiled to native code for speed." },
        { q: "Which statement about Cilium's features is true?",
          o: ["You can start with Cilium as a plain CNI and enable other features later", "All features must be enabled at install time", "Hubble is required for Cilium to work", "Cilium only provides network policy"],
          why: "Cilium is modular; encryption, mesh, Hubble and so on are opt-in." },
        { q: "How do Cilium network policies identify workloads?",
          o: ["By Kubernetes labels and the identities derived from them", "Only by Pod IP address", "By MAC address", "By container image name"],
          why: "Label-based identities survive Pods being rescheduled with new IPs." },
        { q: "How does Cilium provide service mesh features without sidecars?",
          o: ["eBPF in the kernel plus one Envoy proxy per node when layer 7 is needed", "It injects a smaller sidecar", "It requires Istio", "It runs a proxy in every container image"],
          why: "Only traffic that needs L7 processing goes to the node's Envoy; everything else stays in eBPF." }
      ]
    },
    {
      id: 'cil-arch',
      title: 'Ch 2: Inside Cilium, the components',
      basics: {
        summary: "Cilium is a set of cooperating parts. The **agent** on each node loads eBPF programs and keeps their data up to date. The **operator** handles cluster-wide jobs like IP ranges. The **CNI plugin** wires new Pods in. **Envoy** and a **DNS proxy** step in when layer 7 or domain-name rules apply, and **Hubble** shows what's happening.",
        ideas: [
          "**Agent** (DaemonSet): loads eBPF programs and maps, watches Kubernetes, installs the CNI plugin.",
          "**Operator** (Deployment): registers Cilium CRDs and hands out per-node IP ranges via CiliumNode objects.",
          "**eBPF programs** make per-packet decisions; **eBPF maps** hold the state they look up.",
          "**Envoy** (L7: HTTP, gRPC, TLS) and the **DNS proxy** (FQDN policy) only see traffic that needs them."
        ]
      },
      points: [
        "Agent responsibilities: install the CNI plugin, load eBPF programs and maps, reconcile Kubernetes and Cilium CRD state into the maps, apply config from the `cilium-config` ConfigMap and CRDs, and expose debugging via `cilium-dbg` (called `cilium` before 1.15).",
        "CNI flow: kubectl → API server → scheduler → kubelet → container runtime creates the network namespace → runtime runs the CNI plugin from `/etc/cni/net.d/05-cilium.conflist` and `/opt/cni/bin/cilium-cni` → the plugin asks the agent to set up the interface and update maps.",
        "A CNI plugin implements ADD, DEL, CHECK and VERSION.",
        "The operator runs cluster-wide (one active replica via leader election). It registers Cilium's CRDs itself (they aren't shipped as separate manifests) and, for IPAM, creates a CiliumNode per node with its PodCIDRs so there are no overlaps.",
        "eBPF programs are stateless, event-driven and attached to hook points (e.g. a packet entering an interface). Maps are in-kernel key/value stores used for connection tracking, NAT, load-balancing backends, policy, identities and metrics.",
        "Cilium CLI (on your laptop): install, upgrade, `cilium status`, `cilium connectivity test`, sysdumps, key rotation, enabling features. Different from `cilium-dbg` inside the agent Pod.",
        "Hubble: server built into each agent, optional Hubble Relay for a cluster-wide view, the Hubble CLI and Hubble UI. Relay and UI aren't enabled by default.",
        "Envoy runs as its own DaemonSet (`cilium-envoy`) and is used for Ingress/Gateway API, L7 policy and L7 visibility. The DNS proxy runs inside the agent and maps resolved IPs to names for FQDN policy. Cluster Mesh API server shares state between clusters (ch. 9)."
      ],
      labs: [{
        title: 'Find every Cilium component on a running cluster',
        goal: 'Uses the cluster from the previous topic (Cilium installed with defaults).',
        steps: [
          ['Status overview:', 'cilium status'],
          ['The Kubernetes objects behind it:', 'kubectl -n kube-system get ds cilium cilium-envoy\nkubectl -n kube-system get deploy cilium-operator\nkubectl get crd | grep cilium.io'],
          ['The CNI plugin config and binary on a node:', 'docker exec kind-worker cat /etc/cni/net.d/05-cilium.conflist\ndocker exec kind-worker ls -l /opt/cni/bin/cilium-cni'],
          ['The operator-managed CiliumNode objects and their PodCIDRs:', "kubectl get ciliumnodes -o custom-columns=NODE:.metadata.name,PODCIDRS:.spec.ipam.podCIDRs"],
          ['The agent\'s debug tool, and the running configuration:', 'kubectl -n kube-system exec ds/cilium -- cilium-dbg status | head -25\ncilium config view | head -20']
        ],
        verify: 'You can point to the agent DaemonSet, the Envoy DaemonSet, the operator Deployment, the `05-cilium.conflist` file, and one CiliumNode per node with its PodCIDR.'
      }],
      refs: [
        ['Component overview', 'https://docs.cilium.io/en/stable/overview/component-overview/'],
        ['Cilium CLI reference', 'https://docs.cilium.io/en/stable/cheatsheet/'],
        ['eBPF datapath introduction', 'https://docs.cilium.io/en/stable/network/ebpf/intro/'],
        ['CNI specification', 'https://github.com/containernetworking/cni/blob/main/SPEC.md']
      ],
      quiz: [
        { q: "Which component loads eBPF programs and keeps eBPF maps in sync with Kubernetes on each node?",
          o: ["The Cilium agent", "The Cilium operator", "Hubble Relay", "The Cilium CLI"],
          why: "The agent runs as a DaemonSet with elevated privileges on every node." },
        { q: "What does the Cilium operator do for IP address management?",
          o: ["Creates a CiliumNode per node and assigns it non-overlapping PodCIDRs", "Assigns IPs to each Pod directly", "Runs DHCP on the nodes", "Configures the cloud VPC"],
          why: "Because it sees the whole cluster, it can avoid overlaps; the agent then reads its node's CiliumNode." },
        { q: "Where does the container runtime find Cilium's CNI configuration?",
          o: ["/etc/cni/net.d/05-cilium.conflist", "/etc/cilium/cni.yaml", "The cilium-config ConfigMap only", "/var/lib/kubelet/cni.json"],
          why: "The runtime reads `/etc/cni/net.d/` and runs the binary from `/opt/cni/bin/`; the agent installs both." },
        { q: "When is traffic sent to Envoy?",
          o: ["Only when layer 7 processing is needed, such as L7 policy, Ingress or Gateway API", "For every packet", "Only for DNS", "Only for traffic between clusters"],
          why: "Everything else stays in the eBPF datapath, which is cheaper." },
        { q: "What is `cilium-dbg`?",
          o: ["The debugging tool inside each agent Pod (called `cilium` before 1.15)", "The CLI you install on your laptop to install Cilium", "Hubble's command-line client", "The operator's binary"],
          why: "The laptop tool is the Cilium CLI (`cilium`); `cilium-dbg` shows node-local state." }
      ]
    },
    {
      id: 'cil-start',
      title: 'Ch 3: Getting started, install, policy and Hubble',
      basics: {
        summary: "The fastest way to learn Cilium is to use it. Create a kind cluster without a CNI, install Cilium with the **Cilium CLI** or **Helm**, deploy an app, lock it down with a **CiliumNetworkPolicy**, and watch the traffic with **Hubble**.",
        ideas: [
          "`cilium install` autodetects your environment; **Helm** is recommended for repeatable, GitOps-friendly installs.",
          "A **CiliumNetworkPolicy** selects Pods by label; selected Pods become **default deny** in that direction.",
          "**L7 rules** (HTTP method and path) are enforced by Envoy and return **403** instead of a timeout.",
          "**Hubble** shows every flow and its verdict: forwarded, dropped, or denied by policy."
        ]
      },
      points: [
        "kind config `networking.disableDefaultCNI: true` stops kindnetd being installed; nodes stay `NotReady` (\"cni plugin not initialized\") until Cilium is in.",
        "`cilium install --dry-run-helm-values` shows the values the CLI would use; on kind: `ipam.mode: kubernetes`, `routingMode: tunnel`, `tunnelProtocol: vxlan`, one operator replica.",
        "Helm: `helm repo add cilium https://helm.cilium.io/` then `helm install cilium cilium/cilium -n kube-system --version 1.18.4 -f values.yaml`. Pin the version in production.",
        "Even with kube-proxy installed, Cilium handles ClusterIP traffic in eBPF. EndpointSlices list a Service's backends; Cilium also keeps CiliumEndpoints and CiliumEndpointSlices for routing and policy.",
        "CiliumNetworkPolicy basics: `endpointSelector` (which Pods), `ingress`/`egress`, `fromEndpoints`/`toEndpoints` (by label), `toPorts`. All traffic is allowed until a policy selects an endpoint; then that direction is default deny.",
        "An L3/L4 deny drops packets (client times out); an L7 deny is answered by Envoy with an application error (HTTP 403 \"Access denied\").",
        "Hubble: enable Relay (`--set hubble.relay.enabled=true` or `cilium hubble enable`), then `cilium hubble port-forward &`, `hubble status`, `hubble list nodes`, `hubble observe` with filters like `--from-pod`, `--label`, `--http-path`, `-t policy-verdict`.",
        "Hubble UI: `--set hubble.ui.enabled=true`, open with `cilium hubble ui`. L7 policies also add L7 details (method, path, latency) to flows."
      ],
      labs: [{
        title: 'Install with Helm, secure an app at L4 and L7, and observe it',
        goal: 'Fresh kind cluster from the home page (CNI disabled).',
        steps: [
          ['Install Cilium with Helm, with Hubble Relay and UI on:', `helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set ipam.mode=kubernetes --set routingMode=tunnel --set tunnelProtocol=vxlan \\
  --set operator.replicas=1 --set hubble.relay.enabled=true --set hubble.ui.enabled=true
cilium status --wait`],
          ['Deploy nginx on one worker, an allowed client on the other, and an unlabelled client:', `kubectl create deploy nginx --image=nginx
kubectl patch deploy nginx -p '{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/hostname":"kind-worker2"}}}}}'
kubectl expose deploy nginx --port=80
kubectl run netshoot-client --image=nicolaka/netshoot --labels=app=netshoot-client \\
  --overrides='{"spec":{"nodeSelector":{"kubernetes.io/hostname":"kind-worker"}}}' -- sleep infinity
kubectl run unauthorized --image=nicolaka/netshoot -- sleep infinity
kubectl wait --for=condition=Ready pod --all --timeout=120s`],
          ['L4 policy: only `netshoot-client` may reach nginx on port 80:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: nginx-policy}
spec:
  endpointSelector: {matchLabels: {app: nginx}}
  ingress:
  - fromEndpoints: [{matchLabels: {app: netshoot-client}}]
    toPorts: [{ports: [{port: "80", protocol: TCP}]}]
EOF
kubectl exec netshoot-client -- curl -s -o /dev/null -w "%{http_code}\\n" nginx
kubectl exec unauthorized -- curl -s -m3 nginx || echo "TIMED OUT (dropped)"`],
          ['Add an L7 rule: only `GET /index.html` is allowed:', `kubectl patch cnp nginx-policy --type=json -p='[{"op":"add","path":"/spec/ingress/0/toPorts/0/rules","value":{"http":[{"method":"GET","path":"/index.html"}]}}]'
kubectl exec netshoot-client -- curl -s nginx/index.html | grep -o "Welcome to nginx"
kubectl exec netshoot-client -- curl -s nginx/50x.html`],
          ['Observe it with Hubble:', `cilium hubble port-forward &
hubble status
hubble observe --from-pod default/netshoot-client --last 10
hubble observe -t policy-verdict --last 10
cilium hubble ui   # opens http://localhost:12000`]
        ],
        verify: 'The allowed client gets `200`; the unlabelled one times out; `/50x.html` returns `Access denied` (403) while `/index.html` works; Hubble shows `policy-verdict` ALLOWED and DENIED flows and `to-proxy` for the L7 traffic.',
        cleanup: 'kind delete cluster'
      }],
      refs: [
        ['Cilium quick installation', 'https://docs.cilium.io/en/stable/gettingstarted/k8s-install-default/'],
        ['Installation using kind', 'https://docs.cilium.io/en/stable/installation/kind/'],
        ['Network policy overview', 'https://docs.cilium.io/en/stable/security/policy/'],
        ['Setting up Hubble observability', 'https://docs.cilium.io/en/stable/observability/hubble/setup/'],
        ['Isovalent Network Policy Editor', 'https://editor.networkpolicy.io/']
      ],
      quiz: [
        { q: "Why do kind nodes stay `NotReady` after `kind create cluster` with `disableDefaultCNI: true`?",
          o: ["No CNI plugin is installed, so the kubelet reports the network isn't ready", "Docker is out of memory", "The control plane failed", "kube-proxy is missing"],
          why: "They become Ready as soon as Cilium (the CNI) is installed." },
        { q: "Which install method does the book recommend for long-term operation?",
          o: ["Helm, because it gives explicit, repeatable, GitOps-friendly configuration", "`cilium install` with no options", "Applying raw manifests from GitHub", "Building Cilium from source"],
          why: "`cilium install` is great for quick starts; Helm values are easier to version and review." },
        { q: "A CiliumNetworkPolicy with an `ingress` section selects the nginx Pods. What happens to other ingress traffic to them?",
          o: ["It is denied; the selected Pods become default-deny for ingress", "It is still allowed", "It is redirected to Envoy", "Only egress is affected"],
          why: "Selection switches that direction to default deny; only the listed traffic is allowed." },
        { q: "A request blocked by an L7 HTTP rule behaves differently from one blocked at L3/L4. How?",
          o: ["Envoy answers with an HTTP 403 instead of the packets being silently dropped", "Both time out", "L7 denials reset the node", "L7 denials are only logged"],
          why: "L3/L4 denials drop packets (timeout); Envoy understands HTTP and replies with an error." },
        { q: "Which Hubble command shows only flows where a policy decision was made?",
          o: ["`hubble observe -t policy-verdict`", "`hubble observe --verdict-only`", "`hubble policy list`", "`cilium hubble verdicts`"],
          why: "`-t` (`--type`) filters by event type." }
      ]
    }
  ]
});
