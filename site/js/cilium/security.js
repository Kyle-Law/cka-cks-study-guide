// Part 5: chapters 12-14. Quiz format: the FIRST option is correct; options are shuffled when shown.
// Shared lab app: two ports in one Pod (8080 "app", 9113 "metrics") with matching Services.
const CIL_WEBSERVER = `cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata: {name: webserver}
spec:
  replicas: 2
  selector: {matchLabels: {app.kubernetes.io/name: webserver}}
  template:
    metadata: {labels: {app.kubernetes.io/name: webserver}}
    spec:
      containers:
      - {name: app, image: hashicorp/http-echo, args: ["-text=Hello from the webserver", "-listen=:8080"]}
      - {name: metrics, image: hashicorp/http-echo, args: ["-text=metrics_requests_total 42", "-listen=:9113"]}
---
apiVersion: v1
kind: Service
metadata: {name: webserver}
spec: {selector: {app.kubernetes.io/name: webserver}, ports: [{port: 80, targetPort: 8080}]}
---
apiVersion: v1
kind: Service
metadata: {name: webserver-metrics}
spec: {selector: {app.kubernetes.io/name: webserver}, ports: [{port: 9113, targetPort: 9113}]}
EOF
kubectl wait --for=condition=Available deploy/webserver`;

COURSE.addDomain({
  id: 'security', title: 'Security (ch. 12–14)', weight: 18,
  topics: [
    {
      id: 'cil-policy',
      title: 'Ch 12: Network policy basics and identity',
      basics: {
        summary: "Pod IPs change all the time, so firewall rules based on IPs don't work well in Kubernetes. Cilium gives every set of Pods with the same labels a numeric **identity**, maps each IP to an identity in an eBPF map (the **ipcache**), and precomputes the allowed traffic per identity. Policies are written with **labels**, and enforcement is a couple of fast lookups.",
        ideas: [
          "No policy = **allow all**. A policy with rules for a direction = **default deny** in that direction for the selected endpoints.",
          "**Identity**: one per unique set of security labels; replicas share it.",
          "Per packet: **IP → identity** (ipcache), then **identity + direction + protocol + port → verdict** (policy map).",
          "Blocked L3/L4 traffic is **dropped silently**, so the client times out."
        ]
      },
      points: [
        "A CiliumNetworkPolicy (CNP) is namespaced: `endpointSelector` picks endpoints (by security labels), `ingress`/`egress` contain rules. Ports in policies are strings (`\"8080\"`) and may be names.",
        "Service translation happens before policy, so allow the **target port** (8080), not the Service port (80).",
        "A CiliumEndpoint exists for every Cilium-managed Pod. Policy is computed ahead of time (\"regeneration\") when Pods or policies change, not per packet. `hostNetwork` Pods can't be enforced by endpoint policy.",
        "Default deny is per direction: an ingress-only policy leaves egress open. Replies to allowed connections are always allowed (stateful). An empty rule (`egress: [{}]`) turns on default deny but matches nothing, so it blocks all egress. `enableDefaultDeny: {ingress: false, egress: false}` lets a policy add rules without triggering default deny.",
        "Policy doesn't apply inside a Pod (localhost); `kubectl debug` ephemeral containers share the Pod's network namespace.",
        "Identities are stored as CiliumIdentity objects (cluster-scoped; filter with `-l io.kubernetes.pod.namespace=<ns>`). The ipcache is a longest-prefix-match trie: `/32` (or `/128`) for Pods, `0.0.0.0/0` → world (identity 2), host = identity 1.",
        "In tunnel mode the source identity travels in the VXLAN/Geneve VNI, so no ipcache lookup is needed at the receiver.",
        "Large clusters: limit identity-relevant labels (Helm `labels`, with `!` to exclude) so labels like batch task IDs don't create a new identity per Pod and trigger cluster-wide policy recalculation. There's no `fromPorts`: the datapath can't encode source ports."
      ],
      labs: [{
        title: 'Lock a two-port app down to one port, then block its egress',
        goal: 'Any kind cluster with Cilium (`cilium install --version 1.18.4`).',
        steps: [
          ['Deploy the app (port 8080) with metrics (port 9113) and test without policy:', `${CIL_WEBSERVER}
kubectl run test --image=nicolaka/netshoot -- sleep infinity; kubectl wait --for=condition=Ready pod/test
kubectl exec test -- curl -s -m2 webserver
kubectl exec test -- curl -s -m2 webserver-metrics:9113`],
          ['Allow only TCP 8080 into the webserver (note: the target port, not 80):', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: webserver}
spec:
  endpointSelector: {matchLabels: {app.kubernetes.io/name: webserver}}
  ingress:
  - toPorts: [{ports: [{port: "8080", protocol: TCP}]}]
EOF
kubectl exec test -- curl -s -m2 webserver
kubectl exec test -- curl -s -m2 webserver-metrics:9113 || echo "9113 TIMED OUT (dropped)"`],
          ['Look at endpoints and identities:', `kubectl get ciliumendpoints
kubectl get ciliumidentity -l io.kubernetes.pod.namespace=default -o custom-columns=ID:.metadata.name,LABELS:.security-labels
kubectl -n kube-system exec ds/cilium -c cilium-agent -- cilium-dbg bpf ipcache list | head`],
          ['Block all egress from the webserver; replies to allowed requests still work:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: webserver-no-egress}
spec:
  endpointSelector: {matchLabels: {app.kubernetes.io/name: webserver}}
  egress: [{}]
EOF
POD=$(kubectl get pod -l app.kubernetes.io/name=webserver -o name | head -1)
kubectl debug $POD --image=nicolaka/netshoot --profile=general -it -- curl -s -m3 https://cilium.io -o /dev/null || echo "EGRESS BLOCKED"
kubectl exec test -- curl -s -m2 webserver`]
        ],
        verify: 'Port 8080 answers while 9113 times out; both webserver replicas share one identity; the webserver can\'t reach cilium.io, yet the test Pod still gets "Hello from the webserver".',
        cleanup: 'Keep the app and test Pod for the next topic, or `kubectl delete cnp --all; kubectl delete deploy webserver; kubectl delete svc webserver webserver-metrics; kubectl delete pod test`.'
      }],
      refs: [
        ['Network policy overview', 'https://docs.cilium.io/en/stable/security/policy/'],
        ['Identity-based security', 'https://docs.cilium.io/en/stable/security/network/identity/'],
        ['Policy enforcement modes', 'https://docs.cilium.io/en/stable/security/policy/intro/'],
        ['Limiting identity-relevant labels', 'https://docs.cilium.io/en/stable/operations/performance/scalability/identity-relevant-labels/']
      ],
      quiz: [
        { q: "A Pod isn't selected by any policy. What traffic can reach it?",
          o: ["All traffic (default allow)", "No traffic", "Only traffic from its namespace", "Only DNS"],
          why: "Default deny starts once a policy with rules for that direction selects the endpoint." },
        { q: "The Service maps port 80 to targetPort 8080. Which port must an ingress policy on the backend allow?",
          o: ["8080", "80", "Both", "Neither; Services bypass policy"],
          why: "Service translation happens before policy, so the policy sees the backend port." },
        { q: "What is a Cilium identity?",
          o: ["A number shared by all endpoints with the same security labels", "A Pod's IP address", "A ServiceAccount token", "A per-Pod certificate"],
          why: "Replicas of a Deployment share an identity, so policy maps stay small." },
        { q: "What does the ipcache map store?",
          o: ["IP prefixes mapped to identities, looked up by longest prefix match", "Allowed ports per Pod", "DNS answers", "Service backends"],
          why: "Then the endpoint's policy map is checked with identity, direction, protocol and port." },
        { q: "A policy contains only `egress: [{}]`. What does it do to the selected Pods?",
          o: ["Blocks all their egress (default deny with a rule that matches nothing)", "Allows all egress", "Has no effect", "Blocks ingress"],
          why: "Responses to allowed incoming connections are still permitted." }
      ]
    },
    {
      id: 'cil-policy-adv',
      title: 'Ch 12: Selecting identities, entities, CIDRs and deny rules',
      basics: {
        summary: "Beyond ports, policies say **who** may talk: other endpoints by label (`fromEndpoints`), built-in groups like `world` or `kube-apiserver` (**entities**), or IP ranges outside the cluster (**CIDR**). **Cluster-wide** policies apply to every namespace, and **deny rules** always win over allows.",
        ideas: [
          "Statements in one rule are **AND**; separate rules are **OR**. Watch the YAML dash!",
          "**Entities**: `cluster`, `world`, `host`, `kube-apiserver`, `ingress`…",
          "**CIDR** rules only cover addresses **outside** the cluster; use labels for Pods.",
          "**Deny** (`ingressDeny`/`egressDeny`) beats any allow, everywhere."
        ]
      },
      points: [
        "`fromEndpoints`/`toEndpoints` select identities by label; `io.kubernetes.pod.namespace` (set by Cilium, can't be spoofed by a Pod label) selects another namespace.",
        "Classic mistake: an extra `-` before `toPorts` splits one rule (label AND port) into two rules (label OR port), which opens every port to the labelled Pods and the port to everyone.",
        "CiliumClusterwideNetworkPolicy (CCNP): same features, not namespaced; `endpointSelector: {}` selects every endpoint in the cluster. Pair it with `enableDefaultDeny: false` or you can lock out the whole cluster.",
        "Reserved labels (`reserved:` prefix), reserved identities (1 host, 2 world, 6 remote-node, 7 kube-apiserver, 8 ingress, 9/10 world-ipv4/ipv6, …) and entities (shorthands used with `fromEntities`/`toEntities`). `cluster` covers the host, remote nodes, the API server, ingress, health and this cluster's endpoints.",
        "Some statements can't be combined in one rule (e.g. `toEndpoints` + `toEntities`); the whole policy then becomes invalid (`kubectl get cnp` → `VALID False`, reason in `kubectl describe`). `toServices` can't be combined with `toPorts`.",
        "`toCIDR`/`fromCIDR` and `toCIDRSet` (with `except`) create CIDR identities in the ipcache. They don't apply to IPs that already have an identity (Pods, Services).",
        "Traffic arriving through Cilium Ingress/Gateway API comes from the `ingress` identity (Envoy's internal IP), so backends must allow `fromEntities: [ingress]`.",
        "Deny rules count as rules for default deny (use `enableDefaultDeny: false` alongside them). Policy is unordered and deny always wins, which is good for un-overridable baselines (e.g. deny `kube-apiserver` from all namespaces except kube-system) but leaves no room for exceptions."
      ],
      labs: [{
        title: 'Labels, a cluster-wide rule, entities and a deny baseline',
        goal: 'Continue from the previous topic (webserver app and policies; delete the no-egress policy first).',
        steps: [
          ['Only Pods labelled `app.kubernetes.io/name=test` may reach 8080:', `kubectl delete cnp webserver-no-egress --ignore-not-found
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: webserver}
spec:
  endpointSelector: {matchLabels: {app.kubernetes.io/name: webserver}}
  ingress:
  - fromEndpoints: [{matchLabels: {app.kubernetes.io/name: test}}]
    toPorts: [{ports: [{port: "8080", protocol: TCP}]}]
EOF
kubectl exec test -- curl -s -m2 webserver || echo "unlabelled: BLOCKED"
kubectl run t2 --image=nicolaka/netshoot --labels=app.kubernetes.io/name=test --rm -it --restart=Never -- curl -s -m2 webserver`],
          ['A cluster-wide rule letting a metrics collector scrape 9113 everywhere, without triggering default deny:', `kubectl create ns metrics
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumClusterwideNetworkPolicy
metadata: {name: clusterwide-metrics}
spec:
  endpointSelector: {}
  enableDefaultDeny: {ingress: false}
  ingress:
  - fromEndpoints: [{matchLabels: {io.kubernetes.pod.namespace: metrics, app.kubernetes.io/name: metrics-collector}}]
    toPorts: [{ports: [{port: "9113", protocol: TCP}]}]
EOF
kubectl -n metrics run collector --image=nicolaka/netshoot --labels=app.kubernetes.io/name=metrics-collector --rm -it --restart=Never -- curl -s -m2 webserver-metrics.default:9113`],
          ['An invalid rule makes the whole policy invalid:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: invalid-policy}
spec:
  endpointSelector: {matchLabels: {app.kubernetes.io/name: test}}
  egress:
  - toEndpoints: [{matchLabels: {exposed: "true"}}]
    toEntities: [world]
EOF
kubectl get cnp invalid-policy; kubectl describe cnp invalid-policy | grep -i message; kubectl delete cnp invalid-policy`],
          ['Deny baseline: no Pod outside kube-system may reach the API server:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumClusterwideNetworkPolicy
metadata: {name: kube-api-deny}
spec:
  endpointSelector:
    matchExpressions: [{key: io.kubernetes.pod.namespace, operator: NotIn, values: [kube-system]}]
  enableDefaultDeny: {egress: false}
  egressDeny: [{toEntities: [kube-apiserver]}]
EOF
kubectl exec test -- curl -sk -m3 https://kubernetes.default/version || echo "API SERVER DENIED"
kubectl exec test -- curl -s -m3 -o /dev/null -w "internet still OK: %{http_code}\\n" https://cilium.io`]
        ],
        verify: 'Only the labelled Pod reaches 8080; the collector in `metrics` scrapes 9113; the invalid policy shows `VALID False` with "combining ToEndpoints and ToEntities is not supported"; the API server is denied while the internet still works.',
        cleanup: 'kubectl delete ccnp --all; kubectl delete cnp --all; kubectl delete ns metrics'
      }],
      refs: [
        ['Policy language (L3/L4)', 'https://docs.cilium.io/en/stable/security/policy/language/'],
        ['Entities and reserved identities', 'https://docs.cilium.io/en/stable/security/policy/language/#entities-based'],
        ['Deny policies', 'https://docs.cilium.io/en/stable/security/policy/language/#deny-policies'],
        ['Network Policy Editor', 'https://editor.networkpolicy.io/']
      ],
      quiz: [
        { q: "One ingress rule contains both `fromEndpoints` and `toPorts`. What does it allow?",
          o: ["Traffic that matches both: from those endpoints AND to those ports", "Traffic matching either one", "Nothing; it's invalid", "All traffic to those ports"],
          why: "Statements in a rule are ANDed; separate rules (a new `-`) are ORed." },
        { q: "Why is a CCNP with `endpointSelector: {}` and allow rules risky?",
          o: ["Without `enableDefaultDeny: false`, every endpoint in the cluster becomes default-deny", "CCNPs can't select all endpoints", "It disables Hubble", "It only applies to kube-system"],
          why: "It's an easy way to lock out the whole cluster by accident." },
        { q: "A `fromCIDR: [10.0.0.0/8]` rule should allow traffic from Pods in 10.0.1.0/24. Does it?",
          o: ["No; CIDR rules don't apply to IPs that already have an identity, such as Pods", "Yes", "Only in native routing", "Only for egress"],
          why: "Select in-cluster sources with `fromEndpoints` or `fromEntities`." },
        { q: "Traffic is allowed by one policy and denied by another. What happens?",
          o: ["It's denied; deny always wins", "It's allowed", "The newer policy wins", "The namespaced policy wins over the cluster-wide one"],
          why: "Cilium policy is unordered and deny takes priority, whatever the scope." },
        { q: "Pods behind Cilium Gateway API must allow traffic from which source?",
          o: ["The `ingress` entity", "The `world` entity", "The client's real IP via fromCIDR", "The `host` entity"],
          why: "Envoy forwards using an internal IP that carries the reserved ingress identity." }
      ]
    },
    {
      id: 'cil-l7',
      title: 'Ch 13: Layer 7 policy for HTTP and DNS',
      basics: {
        summary: "Port-based rules can't tell a read from a write, or `/api` from `/admin`. **Layer 7 rules** add HTTP method, path and host conditions to a port. Traffic on that port is redirected to the node's **Envoy**, which allows the request or answers **403**. **DNS rules** limit which names a Pod may look up.",
        ideas: [
          "Add `rules.http` (method, path regex, host, headers) under `toPorts`.",
          "Denied HTTP requests get **403 Access denied** from Envoy, not a timeout.",
          "Envoy adds **latency and CPU** cost, so use L7 rules where they're worth it.",
          "`rules.dns` with `matchPattern` filters DNS queries, but DNS filtering alone can be bypassed."
        ]
      },
      points: [
        "Use cases: read-only access (GET only), per-path access for different clients, and virtual hosts or CDN-hosted sites sharing one IP (filter on the Host header).",
        "`path` is a regular expression: `/api` matches only `/api`; use `/api/.*` for a subtree (not `/api.*`, which also matches `/api-beta`).",
        "Flow: the eBPF datapath sees the port has L7 rules → redirects to the node-local Envoy (`to-proxy` in Hubble) → Envoy completes the TCP handshake, reads the request, then answers 403 or opens its own connection to the backend.",
        "The backend sees Envoy's `CiliumInternalIP` (from the node's Pod range; see `kubectl get ciliumnode -o yaml`) as the source, not the client's Pod IP.",
        "Performance: always slower than pure eBPF; a deep chain of HTTP calls multiplies the cost. Gateway traffic to backends with L7 rules goes through Envoy twice, so prefer filtering at the Gateway and allow `fromEntities: [ingress]` on the L7 port.",
        "DNS rules: allow port 53 (protocol `ANY` = UDP+TCP) to kube-dns with `rules.dns: [{matchPattern: \"cilium.io\"}]` (`*` wildcards allowed). Queries for other names fail.",
        "DNS-only filtering is bypassable: with port 443 open, a Pod can use DNS over HTTPS (e.g. 1.1.1.1) and connect to the IP directly. Use FQDN rules (next topic) to restrict the actual connections.",
        "Use trailing dots (`cilium.io.`) when testing, or the resolver first tries search domains (`ndots:5`)."
      ],
      labs: [{
        title: 'Allow only GET /api, measure the cost, and filter DNS',
        goal: 'Any kind cluster with Cilium; reuses the webserver app from the network policy topic.',
        steps: [
          ['App, labelled test client, and an L4 policy as a baseline:', `${CIL_WEBSERVER}
kubectl delete pod test --now --ignore-not-found
kubectl run test --image=nicolaka/netshoot --labels=app.kubernetes.io/name=test -- sleep infinity
kubectl wait --for=condition=Ready pod/test
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: webserver}
spec:
  endpointSelector: {matchLabels: {app.kubernetes.io/name: webserver}}
  ingress:
  - fromEndpoints: [{matchLabels: {app.kubernetes.io/name: test}}]
    toPorts: [{ports: [{port: "8080", protocol: TCP}]}]
EOF
kubectl exec test -- sh -c 'time (for i in $(seq 200); do curl -s -o /dev/null webserver/api; done)'`],
          ['Add the L7 rule and compare:', `kubectl patch cnp webserver --type=json -p='[{"op":"add","path":"/spec/ingress/0/toPorts/0/rules","value":{"http":[{"method":"GET","path":"/api"}]}}]'
sleep 3
for p in /api / /admin /api/v1; do echo -n "$p -> "; kubectl exec test -- curl -s -o /dev/null -w "%{http_code}\\n" webserver$p; done
kubectl exec test -- curl -s -D - -o /dev/null webserver/admin | grep -i server
kubectl exec test -- sh -c 'time (for i in $(seq 200); do curl -s -o /dev/null webserver/api; done)'`],
          ['See Envoy\'s internal IP as the source the backend sees:', "kubectl get ciliumnodes -o jsonpath='{range .items[*]}{.metadata.name}{\"\\t\"}{.spec.addresses[?(@.type==\"CiliumInternalIP\")].ip}{\"\\n\"}{end}'"],
          ['DNS rule: the test Pod may only resolve cilium.io (web egress otherwise open):', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: dns-egress}
spec:
  endpointSelector: {matchLabels: {app.kubernetes.io/name: test}}
  egress:
  - toEntities: [world]
    toPorts: [{ports: [{port: "80", protocol: TCP}, {port: "443", protocol: TCP}]}]
  - toEndpoints: [{matchLabels: {k8s-app: kube-dns, io.kubernetes.pod.namespace: kube-system}}]
    toPorts: [{ports: [{port: "53", protocol: ANY}], rules: {dns: [{matchPattern: "cilium.io"}]}}]
EOF
kubectl exec test -- curl -sI -m5 https://cilium.io. | head -1
kubectl exec test -- curl -s -m5 https://example.com. || echo "example.com: cannot resolve"
kubectl exec test -- sh -c "curl -s -H 'accept: application/dns-json' 'https://1.1.1.1/dns-query?name=example.com&type=A' | head -c 200"; echo "  <- DoH bypass works"`]
        ],
        verify: 'Only `GET /api` returns 200; `/`, `/admin` and `/api/v1` return 403 with `server: envoy`; the timed loop is noticeably slower with L7; cilium.io resolves, example.com doesn\'t, yet DNS over HTTPS still leaks an answer.',
        cleanup: 'kubectl delete cnp --all'
      }],
      refs: [
        ['Layer 7 policy examples', 'https://docs.cilium.io/en/stable/security/policy/language/#layer-7-examples'],
        ['HTTP policy getting started', 'https://docs.cilium.io/en/stable/security/http/'],
        ['DNS-based policies', 'https://docs.cilium.io/en/stable/security/policy/language/#dns-based'],
        ['Envoy proxy in Cilium', 'https://docs.cilium.io/en/stable/security/network/proxy/envoy/']
      ],
      quiz: [
        { q: "An L7 rule allows `GET /api`. What does a client get for `GET /admin`?",
          o: ["An HTTP 403 \"Access denied\" from Envoy", "A connection timeout", "A TCP reset", "The admin page"],
          why: "Envoy terminates the connection and answers on the backend's behalf." },
        { q: "Which `path` value allows `/api/v1/posts` but not `/api-beta`?",
          o: ["`/api/.*`", "`/api`", "`/api.*`", "`/api*`"],
          why: "Paths are regular expressions; `/api.*` also matches `/api-beta`." },
        { q: "Where does L7 policy enforcement run?",
          o: ["In the node's Envoy (cilium-envoy DaemonSet), after eBPF redirects the port's traffic", "In a sidecar in each Pod", "In the API server", "In CoreDNS"],
          why: "Only ports with L7 rules are redirected; other traffic stays in eBPF." },
        { q: "With an L7 rule in place, which source IP does the backend see?",
          o: ["Envoy's CiliumInternalIP on that node", "The client Pod's IP", "The Service ClusterIP", "The node's eth0 IP"],
          why: "Envoy opens its own connection to the backend." },
        { q: "A Pod may only resolve `cilium.io` via a DNS rule, but port 443 to the world is open. Is example.com unreachable?",
          o: ["No; it can use DNS over HTTPS to get the IP and connect directly", "Yes, completely", "Only over IPv6", "Only if it uses HTTP/2"],
          why: "Restrict the connections themselves with FQDN rules." }
      ]
    },
    {
      id: 'cil-fqdn',
      title: 'Ch 13: FQDN policy and TLS interception',
      basics: {
        summary: "**FQDN policies** allow egress to domain names instead of IPs. Cilium's DNS proxy watches the Pod's lookups and turns the answers into identities, so only IPs that the domain really resolved to are allowed, for any protocol. To filter **inside HTTPS** (e.g. by path), Cilium can **intercept TLS** with your own CA.",
        ideas: [
          "`toFQDNs: [{matchName: cilium.io}]` plus a DNS rule that sends lookups through the **DNS proxy**.",
          "Works for **any protocol** (it becomes an L3 rule on the resolved IPs).",
          "Only allow DNS to the **cluster's CoreDNS**, or a malicious resolver could poison the mapping.",
          "**CDNs** share IPs between sites; for strict host control, use L7 rules (with TLS interception for HTTPS)."
        ]
      },
      points: [
        "A fully qualified name ends with a dot (`cilium.io.`); without it, search domains are tried first (`dig +showsearch` shows the sequence).",
        "An FQDN policy needs two egress rules: `toFQDNs` (`matchName` or `matchPattern`) with ports, and a DNS rule to kube-dns with `rules.dns` (often `matchPattern: \"*\"`) so the agent's DNS proxy sees the answers.",
        "Flow: Pod queries CoreDNS → eBPF redirects the query to the agent's DNS proxy → proxy checks it is allowed and forwards it → reads the answer → maps the returned IPs to the FQDN identity in the ipcache (may regenerate policy) → returns the answer → the Pod's connection to that IP is allowed at L3.",
        "Because only resolved IPs are allowed, the DoH bypass from the DNS-only policy no longer works.",
        "Cache poisoning: if DNS to arbitrary servers is allowed, an attacker-controlled resolver can map an allowed name to any IP. Mappings are node-wide, which also affects egress deny rules.",
        "CDN collision: cilium.io and isovalent.com share a CDN; allowing one IP may let `curl --resolve` reach the other. Use an L7 `host` rule if you must be sure.",
        "TLS interception: Envoy terminates the Pod's TLS with a certificate from your internal CA (`terminatingTLS`), checks L7 rules, and opens a new TLS connection upstream that it verifies with a public CA bundle (`originatingTLS`). The Pod must trust the internal CA (mount it over its CA bundle).",
        "Secrets for this live in the `cilium-secrets` namespace (agents can only read there by default; `tls.secretSync` can copy them). Limits: one certificate per domain (no SNI-based selection), so use it for targeted policies, not as a blanket rule. cert-manager + trust-manager can automate the CA, certificates and bundles."
      ],
      labs: [
        {
          title: 'Allow egress to one domain, and see the CDN caveat',
          goal: 'Any kind cluster with Cilium and internet access.',
          steps: [
            ['FQDN policy for the test Pod:', `kubectl run test --image=nicolaka/netshoot --labels=app.kubernetes.io/name=test -- sleep infinity 2>/dev/null; kubectl wait --for=condition=Ready pod/test
kubectl delete cnp dns-egress --ignore-not-found
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: fqdn-egress}
spec:
  endpointSelector: {matchLabels: {app.kubernetes.io/name: test}}
  egress:
  - toFQDNs: [{matchName: cilium.io}]
    toPorts: [{ports: [{port: "80", protocol: TCP}, {port: "443", protocol: TCP}]}]
  - toEndpoints: [{matchLabels: {k8s-app: kube-dns, io.kubernetes.pod.namespace: kube-system}}]
    toPorts: [{ports: [{port: "53", protocol: ANY}], rules: {dns: [{matchPattern: "*"}]}}]
EOF`],
            ['Allowed, blocked, and the DoH bypass now fails:', `kubectl exec test -- curl -sI -m5 https://cilium.io | head -1
kubectl exec test -- curl -s -m3 https://example.com || echo "example.com BLOCKED"
kubectl exec test -- curl -s -m3 'https://1.1.1.1/dns-query?name=example.com&type=A' -H 'accept: application/dns-json' || echo "DoH BLOCKED"`],
            ['See the FQDN mapping the agent learned:', 'NODE=$(kubectl get pod test -o jsonpath=\'{.spec.nodeName}\')\nCIL=$(kubectl -n kube-system get pod -l k8s-app=cilium --field-selector spec.nodeName=$NODE -o name)\nkubectl -n kube-system exec $CIL -c cilium-agent -- cilium-dbg fqdn cache list | grep cilium.io'],
            ['The CDN caveat (works only if the two sites share a CDN IP when you try it):', 'IP=$(kubectl exec test -- dig +short cilium.io | head -1)\nkubectl exec test -- curl -s -m5 --resolve "isovalent.com:443:$IP" https://isovalent.com -o /dev/null -w "isovalent.com via cilium.io IP: %{http_code}\\n"']
          ],
          verify: 'cilium.io returns 200, example.com and the DoH request time out, the fqdn cache lists cilium.io\'s IPs, and (if the sites still share a CDN) isovalent.com is reachable through cilium.io\'s IP.',
          cleanup: 'kubectl delete cnp fqdn-egress; kubectl delete pod test'
        },
        {
          title: 'Inspect HTTPS paths with TLS interception',
          goal: 'Advanced. Fresh kind cluster; Cilium with `tls.secretSync.enabled=false`; cert-manager and trust-manager create the CA, certificate and bundles.',
          steps: [
            ['Cilium, cert-manager and trust-manager:', `helm install cilium cilium/cilium -n kube-system --version 1.18.4 --set tls.secretSync.enabled=false
cilium status --wait
helm upgrade --install cert-manager oci://quay.io/jetstack/charts/cert-manager --version v1.19.0 -n cert-manager --create-namespace --set crds.enabled=true
helm upgrade --install trust-manager oci://quay.io/jetstack/charts/trust-manager --version v0.20.2 -n cert-manager \\
  --set secretTargets.enabled=true --set "secretTargets.authorizedSecrets[0]=public-ca-bundle"
kubectl get ns cilium-secrets || kubectl create ns cilium-secrets
kubectl label ns cilium-secrets secrets-namespace=true`],
            ['Public CA bundle for Envoy, an internal CA, a cilium.io certificate, and the internal CA as a ConfigMap for Pods:', `cat <<EOF | kubectl apply -f -
apiVersion: trust.cert-manager.io/v1alpha1
kind: Bundle
metadata: {name: public-ca-bundle}
spec:
  sources: [{useDefaultCAs: true}]
  target: {secret: {key: trust-bundle.pem}, namespaceSelector: {matchLabels: {secrets-namespace: "true"}}}
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata: {name: selfsigned, namespace: cert-manager}
spec: {selfSigned: {}}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata: {name: root, namespace: cert-manager}
spec:
  isCA: true
  commonName: internal-ca
  secretName: root
  privateKey: {algorithm: ECDSA, size: 256}
  issuerRef: {name: selfsigned, kind: Issuer}
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: {name: internal-ca}
spec: {ca: {secretName: root}}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata: {name: cilium-io-cert, namespace: cilium-secrets}
spec:
  commonName: cilium.io
  dnsNames: [cilium.io]
  secretName: cilium-io-cert
  privateKey: {algorithm: ECDSA, size: 256}
  issuerRef: {name: internal-ca, kind: ClusterIssuer}
---
apiVersion: trust.cert-manager.io/v1alpha1
kind: Bundle
metadata: {name: internal-ca-bundle}
spec:
  sources: [{secret: {name: root, key: ca.crt}}]
  target: {configMap: {key: ca.crt}}
EOF
sleep 20; kubectl -n cilium-secrets get secrets`],
            ['A client that trusts only the internal CA, and the TLS-intercepting policy:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: test, labels: {app.kubernetes.io/name: test}}
spec:
  containers:
  - name: netshoot
    image: nicolaka/netshoot
    args: [sleep, infinity]
    volumeMounts: [{name: ca, mountPath: /etc/ssl/certs/}]
  volumes:
  - name: ca
    configMap: {name: internal-ca-bundle, items: [{key: ca.crt, path: ca-certificates.crt}]}
---
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: client}
spec:
  endpointSelector: {matchLabels: {app.kubernetes.io/name: test}}
  egress:
  - toPorts:
    - ports: [{port: "443", protocol: TCP}]
      originatingTLS: {secret: {namespace: cilium-secrets, name: public-ca-bundle, key: trust-bundle.pem}}
      terminatingTLS: {secret: {namespace: cilium-secrets, name: cilium-io-cert}}
      rules: {http: [{host: cilium.io, path: "/blog/.*"}]}
  - toEndpoints: [{matchLabels: {k8s-app: kube-dns, io.kubernetes.pod.namespace: kube-system}}]
    toPorts: [{ports: [{port: "53", protocol: ANY}]}]
EOF
kubectl wait --for=condition=Ready pod/test`],
            ['HTTPS requests with no `-k`:', 'kubectl exec test -- curl -sI https://cilium.io/blog/ | head -1\nkubectl exec test -- curl -sI https://cilium.io/ | head -1\nkubectl exec test -- curl -s https://example.com 2>&1 | head -2']
          ],
          verify: '`/blog/` returns 200, `/` returns 403, and example.com fails with a certificate-name mismatch (Envoy presented the cilium.io certificate).',
          cleanup: 'kind delete cluster'
        }
      ],
      refs: [
        ['DNS-based policies (toFQDNs)', 'https://docs.cilium.io/en/stable/security/policy/language/#dns-based'],
        ['Locking down external access with DNS-based policies', 'https://docs.cilium.io/en/stable/security/dns/'],
        ['TLS inspection (TLS interception)', 'https://docs.cilium.io/en/stable/security/tls-visibility/'],
        ['trust-manager', 'https://cert-manager.io/docs/trust/trust-manager/']
      ],
      quiz: [
        { q: "Why does an FQDN policy also need a DNS rule (`rules.dns`) to kube-dns?",
          o: ["So lookups pass through Cilium's DNS proxy, which learns which IPs the name resolves to", "To speed up DNS", "To block DNS entirely", "It doesn't need one"],
          why: "Without seeing DNS answers, Cilium can't map the name to IPs." },
        { q: "Does an FQDN rule only work for HTTP?",
          o: ["No; resolved IPs become an L3 identity, so any protocol (SSH, FTP…) works", "Yes, HTTP only", "HTTP and HTTPS only", "Only UDP"],
          why: "No proxy sits in the data path; it's IP-based after the lookup." },
        { q: "Why should Pods only be allowed to query the cluster's CoreDNS?",
          o: ["A malicious resolver could map an allowed name to arbitrary IPs (cache poisoning)", "CoreDNS is faster", "Other resolvers don't support TCP", "Cilium can't proxy other servers"],
          why: "Mappings are node-wide, so poisoning can affect other Pods too." },
        { q: "cilium.io and another site share a CDN IP. Can an FQDN rule for cilium.io guarantee the Pod only talks to cilium.io?",
          o: ["No; the shared IP can serve the other site. Use an L7 `host` rule for that guarantee", "Yes, always", "Only with IPv6", "Only for HTTP/1.1"],
          why: "L3 rules see IPs, not Host headers or SNI." },
        { q: "In TLS interception, what does `terminatingTLS` provide?",
          o: ["The certificate Envoy presents to the Pod, signed by your internal CA", "The public CA bundle used to verify the upstream server", "The Pod's client certificate", "A WireGuard key"],
          why: "`originatingTLS` holds the trust bundle for the upstream connection." }
      ]
    },
    {
      id: 'cil-encryption',
      title: 'Ch 14: Transparent encryption',
      basics: {
        summary: "**Transparent encryption** encrypts Pod traffic as it leaves one node and decrypts it on the other, with no app changes and no sidecars. Cilium uses the kernel's **WireGuard** (or **IPsec**) and handles the keys itself. It protects against someone watching or tampering with the network between nodes.",
        ideas: [
          "Enable with `encryption.enabled=true`, `encryption.type=wireguard` (or `ipsec`).",
          "Only **Pod-to-Pod traffic between different nodes** is encrypted.",
          "WireGuard public keys are shared through **CiliumNode annotations**, so trust comes from the Kubernetes API.",
          "Works for any protocol (TCP, UDP) because it isn't mTLS."
        ]
      },
      points: [
        "Motivations: compliance (\"encryption in flight\" enforced by the platform team without each app doing TLS) and threat models where an attacker can watch or alter the network or a hypervisor's virtual switch but isn't root on the nodes.",
        "WireGuard: automatic key management, kernel 5.6+. IPsec: you manage pre-shared keys and algorithms; useful when regulations demand specific ciphers or key lengths.",
        "Not encrypted: same-node Pod-to-Pod (it never leaves the kernel), Pod↔host or hostNetwork processes, host↔host, traffic leaving the cluster, UNIX sockets, and processes in the same Pod.",
        "Order of operations: Service translation first (only encrypted if the chosen backend is on another node); with L7 policy, packets are encrypted after leaving Envoy and decrypted before entering the remote Envoy.",
        "On the wire: UDP port 51871 (Cilium's WireGuard port) between node IPs; in tunnel mode the VXLAN packet is wrapped inside WireGuard (double encapsulation); in native routing only WireGuard.",
        "Each agent generates a key pair and publishes its public key as `network.cilium.io/wg-pub-key` on its CiliumNode; peers accept only traffic from expected keys. Interface: `cilium_wg0`.",
        "Check: `cilium status -o json | jq '.cilium_status[].encryption'`, or `cilium-dbg encrypt status`. Enabling it on a running cluster needs an agent and operator restart and causes brief disruption.",
        "Encryption hides contents, not metadata: observers still see which nodes talk, how often, and packet sizes."
      ],
      labs: [{
        title: 'Sniff a bearer token, then turn on WireGuard',
        goal: 'kind cluster from the home page. You capture on the Docker bridge that connects the kind nodes, as an attacker on the network would.',
        steps: [
          ['Install Cilium (encryption off for now) and a client/server pair on different nodes:', `helm install cilium cilium/cilium -n kube-system --version 1.18.4 --set encryption.enabled=false --set encryption.type=wireguard
cilium status --wait
kubectl create deploy webserver --image=nginx && kubectl expose deploy webserver --port=80
kubectl patch deploy webserver -p '{"spec":{"template":{"spec":{"nodeName":"kind-worker"}}}}'
kubectl run client --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker2"}}' -- sleep infinity
kubectl wait --for=condition=Available deploy/webserver; kubectl wait --for=condition=Ready pod/client
BR=br-$(docker network inspect kind -f '{{.Id}}' | cut -c1-12); echo "kind bridge: $BR"`],
          ['Capture plaintext on the bridge while sending a "secret":', `docker run --rm --net host --privileged nicolaka/netshoot timeout 10 tcpdump -lAi $BR 2>/dev/null | grep -m1 Bearer &
sleep 2; kubectl exec client -- curl -s -o /dev/null -H "Authorization: Bearer MYSECRETTOKEN" webserver; wait`],
          ['Turn on WireGuard and restart Cilium:', `helm upgrade cilium cilium/cilium -n kube-system --version 1.18.4 --reuse-values --set encryption.enabled=true
kubectl -n kube-system rollout restart deploy/cilium-operator ds/cilium
kubectl -n kube-system rollout status ds/cilium
cilium status -o json | jq '.cilium_status[] | .encryption.wireguard.interfaces[0] | {name, "listen-port", "peer-count"}' | head -8
kubectl get ciliumnodes -o custom-columns=NODE:.metadata.name,WGKEY:".metadata.annotations.network\\.cilium\\.io/wg-pub-key"`],
          ['Repeat: no plaintext, only UDP 51871:', `docker run --rm --net host --privileged nicolaka/netshoot timeout 10 tcpdump -lAi $BR 2>/dev/null | grep -m1 Bearer || echo "no plaintext token seen" &
sleep 2; kubectl exec client -- curl -s -o /dev/null -H "Authorization: Bearer MYSECRETTOKEN" webserver; wait
docker run --rm --net host --privileged nicolaka/netshoot timeout 8 tcpdump -ni $BR udp port 51871 -c 3 &
sleep 2; kubectl exec client -- curl -s -o /dev/null webserver; wait`],
          ['Counter-example: a hostNetwork client is not encrypted:', `kubectl delete pod client --now
kubectl run client --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker2","hostNetwork":true,"dnsPolicy":"ClusterFirstWithHostNet"}}' -- sleep infinity
kubectl wait --for=condition=Ready pod/client
docker run --rm --net host --privileged nicolaka/netshoot timeout 10 tcpdump -lAi $BR 2>/dev/null | grep -m1 Bearer &
sleep 2; kubectl exec client -- curl -s -o /dev/null -H "Authorization: Bearer HOSTNETTOKEN" webserver.default.svc.cluster.local; wait`]
        ],
        verify: 'Before encryption the capture prints `Authorization: Bearer MYSECRETTOKEN`; after, it prints nothing and you see only UDP 51871 packets between node IPs; the hostNetwork client\'s token is visible again.',
        cleanup: 'kind delete cluster'
      }],
      refs: [
        ['Transparent encryption', 'https://docs.cilium.io/en/stable/security/network/encryption/'],
        ['WireGuard transparent encryption', 'https://docs.cilium.io/en/stable/security/network/encryption-wireguard/'],
        ['IPsec transparent encryption', 'https://docs.cilium.io/en/stable/security/network/encryption-ipsec/'],
        ['WireGuard protocol', 'https://www.wireguard.com/protocol/']
      ],
      quiz: [
        { q: "Which traffic does Cilium transparent encryption encrypt?",
          o: ["Pod-to-Pod traffic between Pods on different nodes", "All traffic, including to the internet", "Only traffic between Pods on the same node", "Only HTTP traffic"],
          why: "Same-node traffic never leaves the kernel, and traffic leaving the cluster isn't covered." },
        { q: "How do nodes learn each other's WireGuard public keys?",
          o: ["Through the `network.cilium.io/wg-pub-key` annotation on CiliumNode objects", "From a shared Secret you create", "Over BGP", "They don't; WireGuard uses no keys"],
          why: "Trust in encryption is therefore rooted in the security of the Kubernetes API." },
        { q: "Why might you choose IPsec over WireGuard?",
          o: ["Regulations require specific algorithms or key lengths you need to configure", "It's simpler to set up", "It encrypts same-node traffic", "It doesn't need keys"],
          why: "WireGuard is simpler and manages keys automatically; IPsec is more configurable." },
        { q: "A hostNetwork Pod calls a Pod on another node with encryption on. Is that traffic encrypted?",
          o: ["No; only traffic between Cilium-managed Pods on different nodes is", "Yes", "Only if L7 policy applies", "Only over IPv6"],
          why: "Host-network processes aren't Cilium endpoints." },
        { q: "What can an observer still learn with transparent encryption enabled?",
          o: ["Which nodes communicate, how often, and packet sizes", "The HTTP paths requested", "The Pods' bearer tokens", "Nothing at all"],
          why: "Encryption hides contents, not traffic patterns." }
      ]
    }
  ]
});
