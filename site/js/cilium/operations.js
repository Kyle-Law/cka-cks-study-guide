// Part 6: chapters 15-16. Quiz format: the FIRST option is correct; options are shuffled when shown.
COURSE.addDomain({
  id: 'operations', title: 'Observability & operations (ch. 15–16)', weight: 11,
  topics: [
    {
      id: 'cil-hubble',
      title: 'Ch 15: Observability with Hubble',
      basics: {
        summary: "**Hubble** is like a Kubernetes-aware tcpdump built into Cilium. It records every flow with Pod names, identities and verdicts, explains **why** traffic was dropped, and with L7 policies shows HTTP methods, paths and DNS names. It also exports **Prometheus metrics**.",
        ideas: [
          "A Hubble server runs **inside every agent**; **Hubble Relay** combines all nodes into one view.",
          "`hubble observe` with filters (`-n`, `--label`, `-t drop`, `--http-status`, `-o json`) answers most questions.",
          "Drops show their **reason** (e.g. `Policy denied`), the starting point for writing least-privilege policy.",
          "Protect flow data: **redact** sensitive headers, and prefer port-forwarding to Relay over exec into agents."
        ]
      },
      points: [
        "The per-node Hubble agent is on by default (`kubectl -n kube-system exec ds/cilium -c cilium-agent -- hubble observe` shows only that node). Flows are kept in a per-node ring buffer (e.g. 4,095 flows), not stored long-term.",
        "Relay (`hubble.relay.enabled=true`) aggregates all nodes; reach it with `kubectl -n kube-system port-forward deploy/hubble-relay 4245` or `cilium hubble port-forward`. That's safer than exec into a privileged agent. Flows from a node are unavailable while its agent restarts.",
        "Useful filters: `-n <ns>`, `--label app=frontend`, `--from-pod`/`--to-pod`, `-t drop` / `-t policy-verdict`, `--protocol http`, `--http-status`, `--http-path`, `-f` (follow), `-o json` (pipe to jq).",
        "A drop flow shows `Policy denied DROPPED`; JSON gives source/destination labels, ports and `drop_reason_desc: POLICY_DENIED`. Use it to write deliberate allow rules, not to allow everything you see.",
        "Hubble Exporter writes flows to a file on each node (`hubble.export.static.filePath`, size/backup rotation) for Loki, Fluent Bit, Splunk, etc.",
        "L7 visibility needs policies that send traffic through the proxies: a DNS rule (`matchPattern: \"*\"`) adds destination names like `example.com`; an HTTP rule with `http: [{}]` (allow all) adds method, URL, status code and latency, and headers in JSON. That adds Envoy's overhead.",
        "Redaction: `hubble.redact.enabled=true` with `http.headers.deny: [Authorization]` (or an `allow` list), `http.urlQuery`, `http.userInfo`. Values appear as `HUBBLE_REDACTED`.",
        "Hubble UI (`hubble.ui.enabled=true`; `cilium hubble ui` or port-forward 8081) shows a service map. Metrics (`hubble.metrics.enabled` list: dns, drop, tcp, flow, icmp, `httpV2` with context options like `sourceContext=workload|pod|dns|ip`) are exposed on port 9965, e.g. `hubble_drop_total`, `hubble_http_requests_total`. Since 1.17 metrics can be reconfigured without restarting the agent."
      ],
      labs: [{
        title: 'Find a policy mistake with Hubble, then add L7 visibility safely',
        goal: 'kind cluster with Cilium, Hubble Relay and UI enabled (`helm install … --set hubble.relay.enabled=true --set hubble.ui.enabled=true`), and the Hubble CLI.',
        steps: [
          ['A small app and an over-aggressive policy:', `kubectl create ns shop
kubectl -n shop create deploy backend --image=hashicorp/http-echo -- /http-echo -text=backend -listen=:8080
kubectl -n shop expose deploy backend --port=8080
kubectl -n shop run frontend --image=nicolaka/netshoot --labels=app=frontend -- sleep infinity
kubectl -n shop wait --for=condition=Ready pod/frontend
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: deny-all-ingress, namespace: shop}
spec:
  endpointSelector: {}
  ingress: [{}]
EOF
kubectl -n shop exec frontend -- curl -s -m3 backend:8080 || echo "broken"`],
          ['Let Hubble explain the failure:', `cilium hubble port-forward &
sleep 3; hubble status
hubble observe -n shop -t drop --last 5
hubble observe -n shop -t drop --last 1 -o json | jq '.flow | {src: .source.labels, dst: .destination.labels, port: .l4.TCP.destination_port, reason: .drop_reason_desc}'`],
          ['Write the precise allow rule the flows point to:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: backend-from-frontend, namespace: shop}
spec:
  endpointSelector: {matchLabels: {app: backend}}
  ingress:
  - fromEndpoints: [{matchLabels: {app: frontend}}]
    toPorts: [{ports: [{port: "8080", protocol: TCP}]}]
EOF
kubectl -n shop exec frontend -- curl -s -m3 backend:8080`],
          ['DNS and HTTP visibility for the frontend\'s egress, with the Authorization header redacted:', `helm upgrade cilium cilium/cilium -n kube-system --version 1.18.4 --reuse-values \\
  --set hubble.redact.enabled=true --set "hubble.redact.http.headers.deny={Authorization}"
kubectl -n kube-system rollout status ds/cilium
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: l7-visibility, namespace: shop}
spec:
  endpointSelector: {matchLabels: {app: frontend}}
  egress:
  - toPorts: [{ports: [{port: "53", protocol: ANY}], rules: {dns: [{matchPattern: "*"}]}}]
  - toPorts: [{ports: [{port: "80", protocol: TCP}], rules: {http: [{}]}}]
  - toEntities: [world, cluster]
EOF
sleep 5; kubectl -n shop exec frontend -- curl -s -o /dev/null -H "Authorization: Bearer MY_TOKEN" http://example.com
hubble observe -n shop --protocol http --last 2
hubble observe -n shop --protocol http --last 1 -o json | jq '.flow.l7.http.headers'`],
          ['Open the UI:', 'cilium hubble ui   # browse the "shop" namespace service map']
        ],
        verify: 'Hubble shows `Policy denied DROPPED` from frontend to backend:8080; after the allow rule the curl works; HTTP flows show `GET http://example.com/` with status and latency, and the Authorization header shows `HUBBLE_REDACTED`.',
        cleanup: 'kubectl delete ns shop'
      }],
      refs: [
        ['Hubble introduction', 'https://docs.cilium.io/en/stable/observability/hubble/'],
        ['Setting up Hubble observability', 'https://docs.cilium.io/en/stable/observability/hubble/setup/'],
        ['Inspecting network flows with the CLI', 'https://docs.cilium.io/en/stable/observability/hubble/hubble-cli/'],
        ['Hubble metrics', 'https://docs.cilium.io/en/stable/observability/metrics/#hubble-metrics'],
        ['Layer 7 protocol visibility', 'https://docs.cilium.io/en/stable/observability/visibility/']
      ],
      quiz: [
        { q: "Where does the Hubble server run?",
          o: ["Inside the Cilium agent on every node", "As a separate DaemonSet", "Only on the control plane", "In Hubble Relay"],
          why: "Relay is the optional Deployment that aggregates flows from all the per-node servers." },
        { q: "Which command lists recent dropped flows in namespace `shop`?",
          o: ["`hubble observe -n shop -t drop`", "`hubble drops shop`", "`cilium policy drops -n shop`", "`kubectl get drops -n shop`"],
          why: "Each drop includes a reason such as `Policy denied`." },
        { q: "What do you need to see HTTP methods and paths in Hubble?",
          o: ["An L7 policy that routes the traffic through Envoy (e.g. `http: [{}]`)", "Nothing; Hubble always shows them", "Hubble UI", "Transparent encryption"],
          why: "By default Hubble sees L3/L4; L7 details come from the proxies." },
        { q: "How do you stop bearer tokens appearing in Hubble's HTTP flows?",
          o: ["Enable redaction with `hubble.redact.http.headers.deny: [Authorization]`", "Turn off Hubble Relay", "Use HTTPS only", "Set `hubble.metrics.enabled=false`"],
          why: "The value shows as `HUBBLE_REDACTED`." },
        { q: "Why port-forward to Hubble Relay rather than `kubectl exec` into a Cilium agent?",
          o: ["exec into the privileged agent grants far more access than flow observation needs", "Relay shows less data", "exec doesn't work with Hubble", "Relay is faster"],
          why: "Least privilege: observability users shouldn't get a root shell on nodes." }
      ]
    },
    {
      id: 'cil-ops',
      title: 'Ch 16: Operations, upgrades and troubleshooting',
      basics: {
        summary: "Running Cilium in production is about **repeatable installs** (Helm + GitOps), **careful upgrades** (preflight, one minor at a time), **monitoring** its own metrics, and a **troubleshooting routine**. Know what keeps working when an agent restarts (the eBPF datapath) and what doesn't (Envoy, the DNS proxy, BGP sessions).",
        ideas: [
          "Prefer **Helm via GitOps** (Argo CD, Flux) to the imperative Cilium CLI, and plan for the CNI chicken-and-egg problem.",
          "Upgrade: run the **preflight** (pre-pulls images), get to the latest patch, then the next minor.",
          "Troubleshoot in order: `cilium status` → `cilium connectivity test` → `cilium-health status` → logs → `cilium sysdump`.",
          "During agent restarts, **L3/L4 keeps flowing**, but L7, DNS-policy and BGP routes may be disrupted."
        ]
      },
      points: [
        "Cilium CLI: great for quick starts and read-only checks (`cilium status`, `cilium bgp peers`), but it hides configuration and doesn't fit declarative, reviewed workflows. Helm from a laptop needs broad credentials and leaves no record of values.",
        "GitOps: Git as the source of truth, the same config across clusters. Caveats: the GitOps tool needs a working CNI (bootstrap Cilium with Terraform/Ansible or from another cluster); a bad Cilium change can also break the GitOps tool, so keep a recovery path. Cilium's CRDs only exist after the operator has run once.",
        "Releases: a new minor roughly every 6 months; patches for fixes. Preflight: `helm install cilium-preflight cilium/cilium --version <new> -n kube-system --set preflight.enabled=true --set agent=false --set operator.enabled=false`, then delete it and upgrade. Alternative: build a new cluster and migrate.",
        "While an agent restarts: Pod routing, Service routing and L3 policy keep working; maps go stale, so a backend replaced during the restart can cause transient errors. Envoy (`cilium-envoy`) restarts drop L7, Ingress/Gateway and TLS-interception connections (including long-lived HTTP/2 and WebSockets); DNS-policy lookups fail while the agent (DNS proxy) is down.",
        "Migrating from another CNI: new cluster; switch `/etc/cni/net.d` and recycle Pods (mixed networks meanwhile); node-by-node \"big bang\"; or Cilium's hybrid migration mode (separate PodCIDR and overlay port, node by node).",
        "Metrics (off by default): `prometheus.enabled` (agent, port 9962), `operator.prometheus.enabled` (9963), Hubble metrics (9965). Example Prometheus/Grafana dashboards exist in the Cilium docs.",
        "Troubleshooting: `cilium status`; `cilium connectivity test` (100+ tests; `--test '<regex>'` to select); `cilium-health status [--verbose]` for node-to-node reachability; agent/operator logs (e.g. missing Gateway API CRDs); `cilium sysdump --node-list … --logs-since-time 2h` (review before sharing: it can contain Hubble data).",
        "L2 announcement tuning: `l2announcements.leaseDuration` (default 15s) > `leaseRenewDeadline` (5s) > `leaseRetryPeriod` (2s), each with a 20% margin; too low overloads the API server. BGP: announce Services rather than Pods and keep ranges unique across clusters; graceful restart helps upgrades but delays failover on real outages (BFD is an enterprise option)."
      ],
      labs: [{
        title: 'Run the troubleshooting toolkit and rehearse an upgrade',
        goal: 'kind cluster with Cilium installed from Helm (any earlier lab setup works).',
        steps: [
          ['Health and configuration:', 'cilium status\ncilium config view | grep -E "routing-mode|tunnel-protocol|kube-proxy-replacement|enable-hubble"\nhelm get values cilium -n kube-system'],
          ['Node-to-node health:', 'kubectl -n kube-system exec ds/cilium -c cilium-agent -- cilium-health status'],
          ['A focused connectivity test (the full suite takes longer):', "cilium connectivity test --test '^(no-policies|client-egress)$'"],
          ['Turn on Cilium and operator metrics and check the endpoints:', `helm upgrade cilium cilium/cilium -n kube-system --version 1.18.4 --reuse-values \\
  --set prometheus.enabled=true --set operator.prometheus.enabled=true
kubectl -n kube-system rollout status ds/cilium
POD=$(kubectl -n kube-system get pod -l k8s-app=cilium -o name | head -1)
kubectl -n kube-system exec $POD -c cilium-agent -- sh -c 'curl -s localhost:9962/metrics | grep -m3 ^cilium_'`],
          ['Rehearse an upgrade: preflight, then a patch upgrade with the same values (pick a newer 1.18.x):', `NEW=1.18.5
helm install cilium-preflight cilium/cilium --version $NEW -n kube-system \\
  --set preflight.enabled=true --set agent=false --set operator.enabled=false
kubectl -n kube-system rollout status ds/cilium-pre-flight-check --timeout=5m
helm uninstall cilium-preflight -n kube-system
helm upgrade cilium cilium/cilium -n kube-system --version $NEW --reuse-values
cilium status --wait && cilium version`],
          ['Collect a diagnostic bundle (look inside before sharing):', 'cilium sysdump --node-list kind-worker --logs-since-time 1h\nunzip -l cilium-sysdump-*.zip | head -20']
        ],
        verify: 'Status is OK, `cilium-health` shows all nodes reachable, the selected connectivity tests pass, metrics are served on port 9962, the agents report the new version after the upgrade, and a sysdump zip is created.',
        cleanup: 'rm -f cilium-sysdump-*.zip; kind delete cluster'
      }],
      refs: [
        ['Upgrade guide', 'https://docs.cilium.io/en/stable/operations/upgrade/'],
        ['Troubleshooting', 'https://docs.cilium.io/en/stable/operations/troubleshooting/'],
        ['Monitoring & metrics', 'https://docs.cilium.io/en/stable/observability/metrics/'],
        ['Migrating a cluster to Cilium', 'https://docs.cilium.io/en/stable/installation/k8s-install-migration/'],
        ['Running Prometheus & Grafana', 'https://docs.cilium.io/en/stable/observability/grafana/']
      ],
      quiz: [
        { q: "Why does the book prefer Helm (ideally via GitOps) over the Cilium CLI for production installs?",
          o: ["Helm values are explicit, versionable and reproducible; the CLI is imperative and hides configuration", "The CLI can't install Cilium", "Helm installs a faster datapath", "The CLI only works on kind"],
          why: "Read-only CLI commands like `cilium status` remain fine to use." },
        { q: "What does the preflight check do before an upgrade?",
          o: ["Pre-pulls the new images on every node, shortening the upgrade window", "Upgrades the CRDs", "Runs the connectivity test", "Backs up etcd"],
          why: "Then remove the preflight release and run the real upgrade." },
        { q: "During a Cilium agent restart, which keeps working?",
          o: ["Pod and Service routing, and L3 policy, via the loaded eBPF datapath", "L7 HTTP policy through Envoy", "DNS-based (FQDN) policy lookups", "BGP route advertisements from that node"],
          why: "Proxies and the BGP speaker depend on running components; the eBPF programs stay in the kernel." },
        { q: "Which command checks node-to-node reachability as Cilium sees it?",
          o: ["`cilium-health status` inside an agent Pod", "`cilium bgp peers`", "`hubble list nodes`", "`kubectl get nodes`"],
          why: "Unreachable paths usually point to the network fabric." },
        { q: "What's the trade-off of enabling BGP graceful restart?",
          o: ["Fewer drops during planned agent restarts, but slower failover when a node really fails", "Better security at the cost of performance", "Faster failover but more route flaps", "No trade-off"],
          why: "The router keeps sending to the node until the restart timer expires." }
      ]
    }
  ]
});
