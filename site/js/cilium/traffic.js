// Part 3: chapters 7-8. Quiz format: the FIRST option is correct; options are shuffled when shown.
COURSE.addDomain({
  id: 'traffic', title: 'Traffic management (ch. 7–8)', weight: 17,
  topics: [
    {
      id: 'cil-ingress',
      title: 'Ch 7: Cilium Ingress and TLS termination',
      basics: {
        summary: "Services balance traffic at layer 4, but web apps also need **HTTP routing and TLS**. Cilium has a built-in **Ingress controller**, implemented by its per-node **Envoy**, so you don't need to install NGINX or another proxy. An Ingress gets a LoadBalancer IP from LB IPAM, made reachable with BGP or L2 announcements.",
        ideas: [
          "Enable with `ingressController.enabled=true`; it needs **kube-proxy replacement**.",
          "Use `ingressClassName: cilium` on your Ingress objects.",
          "Each Ingress gets a **LoadBalancer Service**, so add an IP pool and an announcement policy.",
          "**TLS termination**: reference a TLS Secret in `spec.tls`; Envoy decrypts and forwards plain HTTP."
        ]
      },
      points: [
        "Kubernetes defines the Ingress API but no implementation; you need a controller. With Cilium it's built in, which avoids running and upgrading a separate proxy.",
        "Helm: `kubeProxyReplacement: true`, `ingressController.enabled: true` (off by default); for kind also `l2announcements.enabled: true` so the IP answers ARP on the Docker network.",
        "The controller creates a Service `cilium-ingress-<name>` of type LoadBalancer. It stays `<pending>` until a `CiliumLoadBalancerIPPool` exists (ch. 6), then `kubectl get ingress` shows the address.",
        "`CiliumL2AnnouncementPolicy` (`cilium.io/v2alpha1`) chooses nodes (`nodeSelector`), `interfaces` and `loadBalancerIPs: true`; those nodes answer ARP (IPv4) for the Service IPs (details in ch. 10).",
        "Rules: optional `host`, list of `paths` (`pathType: Prefix`/`Exact`) to `backend.service.name/port`. Unmatched paths return 404 from Envoy.",
        "Under the hood, Ingress and Gateway API objects are translated into `CiliumEnvoyConfig` (CEC) / `CiliumClusterwideEnvoyConfig` (CCEC) objects that program Envoy: `kubectl get cec -A`.",
        "TLS: `kubectl create secret tls demo-cert --cert … --key …`, then `spec.tls: [{hosts: [...], secretName: demo-cert}]`. Use cert-manager in production; mkcert is fine for labs (don't install its CA system-wide). Test with `curl --resolve host:443:<ip> --cacert rootCA.pem`.",
        "Ingress limitations (all implementations): one shared configuration role, weak multitenancy, non-portable controller-specific annotations, and no first-class TCP/gRPC/traffic shaping. Gateway API was created to fix these."
      ],
      labs: [{
        title: 'Expose Bookinfo through Cilium Ingress over HTTP and HTTPS',
        goal: 'Fresh kind cluster without kube-proxy (use `kind-kpr.yaml` from the kube-proxy replacement lab). Requests are sent from a container on the `kind` Docker network, which works on Linux and macOS.',
        steps: [
          ['Install Cilium with KPR, Ingress and L2 announcements:', `helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set kubeProxyReplacement=true --set k8sServiceHost=kind-control-plane --set k8sServicePort=6443 \\
  --set ingressController.enabled=true --set l2announcements.enabled=true --set ipam.mode=kubernetes
cilium status --wait`],
          ['IP pool, L2 policy and the Bookinfo app:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumLoadBalancerIPPool
metadata: {name: pool}
spec: {blocks: [{cidr: 172.18.255.200/29}]}
---
apiVersion: cilium.io/v2alpha1
kind: CiliumL2AnnouncementPolicy
metadata: {name: l2}
spec:
  loadBalancerIPs: true
  interfaces: [eth0]
  nodeSelector:
    matchExpressions: [{key: node-role.kubernetes.io/control-plane, operator: DoesNotExist}]
EOF
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.24/samples/bookinfo/platform/kube/bookinfo.yaml
kubectl wait --for=condition=Available deploy --all --timeout=300s`],
          ['An Ingress with two paths:', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: {name: basic-ingress}
spec:
  ingressClassName: cilium
  rules:
  - http:
      paths:
      - {path: /details, pathType: Prefix, backend: {service: {name: details, port: {number: 9080}}}}
      - {path: /, pathType: Prefix, backend: {service: {name: productpage, port: {number: 9080}}}}
EOF
sleep 10; kubectl get ingress basic-ingress; kubectl get svc | grep cilium-ingress
kubectl get cec -A`],
          ['Test from a client on the kind network:', `IP=$(kubectl get ingress basic-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
docker run -d --rm --net kind --name client nicolaka/netshoot sleep infinity
docker exec client curl -s -o /dev/null -w "/ -> %{http_code}\\n" http://$IP/
docker exec client curl -s http://$IP/details/1; echo
docker exec client curl -s -o /dev/null -w "/ratings -> %{http_code}\\n" http://$IP/ratings`],
          ['TLS termination with a self-signed wildcard certificate:', `openssl req -x509 -nodes -newkey rsa:2048 -days 30 -keyout tls.key -out tls.crt \\
  -subj "/CN=*.cilium.rocks" -addext "subjectAltName=DNS:*.cilium.rocks"
kubectl create secret tls demo-cert --cert=tls.crt --key=tls.key
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: {name: tls-ingress}
spec:
  ingressClassName: cilium
  tls: [{hosts: [bookinfo.cilium.rocks], secretName: demo-cert}]
  rules:
  - host: bookinfo.cilium.rocks
    http:
      paths:
      - {path: /details, pathType: Prefix, backend: {service: {name: details, port: {number: 9080}}}}
EOF
sleep 10; TIP=$(kubectl get ingress tls-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
docker cp tls.crt client:/tmp/tls.crt
docker exec client curl -s --resolve bookinfo.cilium.rocks:443:$TIP --cacert /tmp/tls.crt https://bookinfo.cilium.rocks/details/1; echo`]
        ],
        verify: '`/` returns 200, `/details/1` returns the book JSON, `/ratings` returns 404, and the HTTPS request succeeds with the self-signed CA.',
        cleanup: 'docker rm -f client; kind delete cluster'
      }],
      refs: [
        ['Cilium Kubernetes Ingress support', 'https://docs.cilium.io/en/stable/network/servicemesh/ingress/'],
        ['Ingress HTTP example', 'https://docs.cilium.io/en/stable/network/servicemesh/http/'],
        ['TLS termination example', 'https://docs.cilium.io/en/stable/network/servicemesh/tls-termination/'],
        ['L2 announcements', 'https://docs.cilium.io/en/stable/network/l2-announcements/']
      ],
      quiz: [
        { q: "What must be enabled for Cilium Ingress to work?",
          o: ["kube-proxy replacement, plus `ingressController.enabled=true`", "Hubble Relay", "Native routing", "IPv6"],
          why: "Ingress relies on KPR; the controller is off by default." },
        { q: "Which `ingressClassName` tells Kubernetes that Cilium should handle an Ingress?",
          o: ["cilium", "envoy", "cilium-ingress", "nginx"],
          why: "The class name selects the controller." },
        { q: "The Ingress is created but its address stays empty. What's the most likely missing piece on a cluster without a cloud load balancer?",
          o: ["A CiliumLoadBalancerIPPool, so the Ingress's LoadBalancer Service can get an IP", "A TLS Secret", "A NetworkPolicy", "The Gateway API CRDs"],
          why: "Cilium Ingress is fronted by a LoadBalancer Service, which needs LB IPAM (and BGP or L2 announcements to be reachable)." },
        { q: "What does Cilium turn Ingress and Gateway API objects into to program Envoy?",
          o: ["CiliumEnvoyConfig (and CiliumClusterwideEnvoyConfig) objects", "iptables rules", "CiliumNetworkPolicies", "ConfigMaps for each Pod"],
          why: "`kubectl get cec -A` shows the rendered configuration." },
        { q: "Which is a limitation of the Ingress API itself (not of Cilium)?",
          o: ["Advanced features rely on controller-specific annotations that aren't portable", "It can't route by path", "It can't terminate TLS", "It only works with Cilium"],
          why: "Gateway API was designed to standardise those features and separate roles." }
      ]
    },
    {
      id: 'cil-gateway',
      title: 'Ch 7: Gateway API, routing, splitting, gRPC and GAMMA',
      basics: {
        summary: "**Gateway API** is the successor to Ingress. It splits configuration by role: the **GatewayClass** (which implementation), the **Gateway** (listeners: ports, protocols, TLS) and **Routes** (how requests reach Services). Cilium implements it with the same Envoy, including traffic splitting, header edits, redirects, gRPC and in-cluster (GAMMA) routing.",
        ideas: [
          "**Install the Gateway API CRDs first**, then enable `gatewayAPI.enabled=true` (needs KPR).",
          "**Gateway** = entry point; **HTTPRoute** attaches to it with `parentRefs`.",
          "Match on **path, headers, query params, method**; split traffic with **weights** (50/50, 99/1).",
          "**GAMMA**: attach an HTTPRoute to a **Service** to apply L7 routing to east-west traffic."
        ]
      },
      points: [
        "Roles: infrastructure provider (GatewayClass), cluster operator (Gateway), app developer (Routes). RBAC can let developers manage Routes in their namespace without touching shared Gateways.",
        "CRDs: install them yourself (e.g. Gateway API v1.3.0 standard channel for Cilium 1.18) before installing or upgrading Cilium. If they are missing, the `cilium` GatewayClass isn't created. Cilium supports the standard and experimental channels.",
        "Helm: `gatewayAPI.enabled=true` (plus KPR). On an existing install, restart the operator and agents. The GatewayClass `cilium` uses controller `io.cilium/gateway-controller`.",
        "Gateway `listeners`: `protocol` (HTTP/HTTPS), `port`, optional `hostname`, `tls.certificateRefs`, and `allowedRoutes.namespaces.from` (`Same` or `All`). Status: `PROGRAMMED True` and an address from LB IPAM.",
        "HTTPRoute: `parentRefs`, optional `hostnames`, `rules[].matches` (`path` type `PathPrefix`/`Exact`, `headers`, `queryParams`, `method`) → `backendRefs` (Service + port + optional `weight`). Check `status.parents[].conditions` for `Accepted`.",
        "Filters: `RequestHeaderModifier` / `ResponseHeaderModifier` (`add`/`set`/`remove`), `RequestRedirect` (`path.replacePrefixMatch`, `hostname`, `scheme`, `statusCode` 301/302), `URLRewrite`, `RequestMirror`. Avoid HTTP→HTTPS redirects for APIs: clients may send tokens in plain text before being redirected.",
        "GRPCRoute (standard since Gateway API 1.1) matches `method.service` and `method.method` (e.g. `hipstershop.CurrencyService` / `GetSupportedCurrencies`); test with `grpcurl -plaintext -proto …`. Cilium 1.18 doesn't support TCPRoute/UDPRoute.",
        "GAMMA (Gateway API for Mesh Management and Administration): an HTTPRoute with `parentRefs: [{kind: Service, name: echo}]` applies L7 rules to in-cluster traffic to that Service. It adds Envoy to the path, with a performance cost. `ingress2gateway` converts Ingress objects to Gateway API."
      ],
      labs: [{
        title: 'Route, split, rewrite and redirect with Gateway API',
        goal: 'Fresh kind cluster without kube-proxy (`kind-kpr.yaml`). Same IP pool and L2 policy as the Ingress lab.',
        steps: [
          ['Install the Gateway API CRDs, then Cilium with Gateway API on:', `V=v1.3.0; B=https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/$V/config/crd/standard
for c in gatewayclasses gateways httproutes referencegrants grpcroutes; do kubectl apply -f $B/gateway.networking.k8s.io_$c.yaml; done
helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set kubeProxyReplacement=true --set k8sServiceHost=kind-control-plane --set k8sServicePort=6443 \\
  --set gatewayAPI.enabled=true --set l2announcements.enabled=true
cilium status --wait
kubectl get gatewayclass`],
          ['Pool + L2 policy (as in the Ingress lab), two echo backends, and a Gateway:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumLoadBalancerIPPool
metadata: {name: pool}
spec: {blocks: [{cidr: 172.18.255.200/29}]}
---
apiVersion: cilium.io/v2alpha1
kind: CiliumL2AnnouncementPolicy
metadata: {name: l2}
spec: {loadBalancerIPs: true, interfaces: [eth0]}
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata: {name: my-gateway}
spec:
  gatewayClassName: cilium
  listeners: [{name: web, protocol: HTTP, port: 80, allowedRoutes: {namespaces: {from: Same}}}]
EOF
for n in 1 2; do
  kubectl create deploy echo-$n --image=mendhak/http-https-echo:31   # echoes the request, incl. Pod hostname
  kubectl expose deploy echo-$n --port=8080
done
sleep 15; kubectl get gateway my-gateway`],
          ['A route that splits /echo 50/50, then shifts to 99/1:', `cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: {name: split}
spec:
  parentRefs: [{name: my-gateway}]
  rules:
  - matches: [{path: {type: PathPrefix, value: /echo}}]
    backendRefs: [{name: echo-1, port: 8080, weight: 50}, {name: echo-2, port: 8080, weight: 50}]
EOF
GW=$(kubectl get gateway my-gateway -o jsonpath='{.status.addresses[0].value}')
docker run -d --rm --net kind --name client nicolaka/netshoot sleep infinity
docker exec client sh -c "for i in \\$(seq 200); do curl -s http://$GW/echo | grep -o '\\"hostname\\": *\\"echo-[12]'; done | sort | uniq -c"
kubectl patch httproute split --type=json -p='[{"op":"replace","path":"/spec/rules/0/backendRefs/0/weight","value":99},{"op":"replace","path":"/spec/rules/0/backendRefs/1/weight","value":1}]'
sleep 5; docker exec client sh -c "for i in \\$(seq 200); do curl -s http://$GW/echo | grep -o '\\"hostname\\": *\\"echo-[12]'; done | sort | uniq -c"`],
          ['Add a request header and a redirect:', `cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: {name: filters}
spec:
  parentRefs: [{name: my-gateway}]
  rules:
  - matches: [{path: {type: PathPrefix, value: /add-header}}]
    filters: [{type: RequestHeaderModifier, requestHeaderModifier: {add: [{name: my-cilium-header, value: hello}]}}]
    backendRefs: [{name: echo-1, port: 8080}]
  - matches: [{path: {type: PathPrefix, value: /old}}]
    filters: [{type: RequestRedirect, requestRedirect: {path: {type: ReplacePrefixMatch, replacePrefixMatch: /new}, statusCode: 301}}]
EOF
sleep 5
docker exec client curl -s http://$GW/add-header | grep -i my-cilium-header
docker exec client curl -s -o /dev/null -w "%{http_code} %{redirect_url}\\n" http://$GW/old/page`],
          ['GAMMA: L7 routing for in-cluster traffic, attached to a Service:', `kubectl create svc clusterip echo --tcp=8080:8080
cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: {name: gamma}
spec:
  parentRefs: [{group: "", kind: Service, name: echo, port: 8080}]
  rules:
  - matches: [{path: {type: PathPrefix, value: /v1}}]
    backendRefs: [{name: echo-1, port: 8080}]
  - matches: [{path: {type: PathPrefix, value: /v2}}]
    backendRefs: [{name: echo-2, port: 8080}]
EOF
kubectl run c --image=nicolaka/netshoot --rm -it --restart=Never -- sh -c 'curl -s echo:8080/v1 | grep hostname; curl -s echo:8080/v2 | grep hostname'`]
        ],
        verify: 'The split is roughly 100/100 and then ~198/2; `/add-header` echoes `my-cilium-header: hello`; `/old/page` returns `301` to `/new/page`; GAMMA sends `/v1` to echo-1 and `/v2` to echo-2.',
        cleanup: 'docker rm -f client; kind delete cluster'
      }],
      refs: [
        ['Cilium Gateway API support', 'https://docs.cilium.io/en/stable/network/servicemesh/gateway-api/gateway-api/'],
        ['Gateway API: traffic splitting', 'https://docs.cilium.io/en/stable/network/servicemesh/gateway-api/splitting/'],
        ['Gateway API: GAMMA support', 'https://docs.cilium.io/en/stable/network/servicemesh/gateway-api/gamma/'],
        ['Gateway API project docs', 'https://gateway-api.sigs.k8s.io/'],
        ['ingress2gateway', 'https://github.com/kubernetes-sigs/ingress2gateway']
      ],
      quiz: [
        { q: "Why must you install the Gateway API CRDs yourself before enabling Cilium's Gateway API?",
          o: ["So Cilium doesn't overwrite a standard or experimental CRD version you chose; without them the `cilium` GatewayClass isn't created", "Cilium can't read CRDs", "They contain Cilium's own policies", "Helm doesn't support CRDs"],
          why: "Unlike its own CRDs, Cilium leaves the Gateway API CRDs to you." },
        { q: "Which object defines the ports, protocols and TLS certificates of the entry point?",
          o: ["Gateway", "GatewayClass", "HTTPRoute", "ReferenceGrant"],
          why: "GatewayClass picks the implementation; Routes define request handling." },
        { q: "How do you send 99% of /echo traffic to echo-1 and 1% to echo-2?",
          o: ["Set `weight: 99` and `weight: 1` on the two `backendRefs`", "Create two Gateways", "Scale echo-1 to 99 replicas", "Use a NetworkPolicy"],
          why: "Weighted backends are native in Gateway API; no mesh or annotations are needed." },
        { q: "What is GAMMA?",
          o: ["Using Gateway API Routes attached to Services to manage east-west (in-cluster) traffic", "A new load-balancing algorithm", "A gRPC-only gateway", "Cilium's multicluster API"],
          why: "It needs no new resource types; an HTTPRoute's parentRef is a Service instead of a Gateway." },
        { q: "Why does the book advise against HTTP→HTTPS redirects for machine-to-machine API endpoints?",
          o: ["A misconfigured client sends its request (including bearer tokens) in plain text before being redirected", "Redirects aren't supported by Gateway API", "They break gRPC", "They disable TLS on the Gateway"],
          why: "Refusing plain HTTP entirely is safer for APIs." }
      ]
    },
    {
      id: 'cil-locality',
      title: 'Ch 8: Keeping traffic close, traffic distribution and LRP',
      basics: {
        summary: "Sending a request to a Pod in another zone, or even on another node, adds latency and can cost money. **Service Traffic Distribution** prefers backends in the client's zone. **Local Redirect Policy (LRP)** goes further and keeps traffic on the same node, a classic use being node-local DNS caching.",
        ideas: [
          "`trafficDistribution: PreferClose` (or `PreferSameZone` in Kubernetes 1.34+) prefers same-zone backends.",
          "It needs KPR and `loadBalancer.serviceTopology=true`, and falls back to other zones if none are local.",
          "**CiliumLocalRedirectPolicy** rewrites a Service (or IP:port) to **node-local** Pods only.",
          "Typical LRP use: send DNS to a **NodeLocal DNSCache** Pod on the same node."
        ]
      },
      points: [
        "Topology-aware routing reduces latency and cross-zone egress charges. Zones come from the node label `topology.kubernetes.io/zone`.",
        "Service field `trafficDistribution: PreferClose`. Kubernetes 1.34 added `PreferSameZone` and `PreferSameNode` (`PreferClose` becomes an alias of `PreferSameZone`). It's the successor of Topology Aware Routing/Hints.",
        "Cilium: `loadBalancer.serviceTopology: true` plus KPR.",
        "If `internalTrafficPolicy`/`externalTrafficPolicy` is `Local`, that wins over trafficDistribution for that traffic type. Works best when load is spread evenly across zones; one busy zone can overload its local backends.",
        "LRP: Helm `localRedirectPolicies.enabled: true` (KPR recommended). Object `CiliumLocalRedirectPolicy` with `redirectFrontend` and `redirectBackend.localEndpointSelector` + `toPorts`.",
        "Frontend types: `serviceMatcher` (a Service by name/namespace; most common) or `addressMatcher` (an IP:port, e.g. `169.254.169.254:80` for a node-local metadata cache).",
        "With an LRP active, `cilium-dbg service list` shows the Service as type `LocalRedirect` with only node-local backends.",
        "NodeLocal DNSCache: a caching CoreDNS DaemonSet (`node-local-dns`) plus an LRP for `kube-dns` in `kube-system` on UDP and TCP 53. Check per-node metrics on port 9253 to prove queries stay local."
      ],
      labs: [{
        title: 'Prefer same-zone backends, then force node-local backends',
        goal: 'kind cluster with 4 workers labelled with zones, no kube-proxy.',
        steps: [
          ['Cluster with zones and Cilium with KPR, topology and LRP:', `cat > kind-zones.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- {role: worker, labels: {topology.kubernetes.io/zone: zone-a}}
- {role: worker, labels: {topology.kubernetes.io/zone: zone-a}}
- {role: worker, labels: {topology.kubernetes.io/zone: zone-b}}
- {role: worker, labels: {topology.kubernetes.io/zone: zone-b}}
networking: {disableDefaultCNI: true, kubeProxyMode: "none"}
EOF
kind create cluster --config kind-zones.yaml
helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set kubeProxyReplacement=true --set k8sServiceHost=kind-control-plane --set k8sServicePort=6443 \\
  --set loadBalancer.serviceTopology=true --set localRedirectPolicies.enabled=true
cilium status --wait
kubectl get nodes -L topology.kubernetes.io/zone`],
          ['Eight echo Pods and a client in zone-a:', `kubectl create deploy echo --image=mendhak/http-https-echo:31 --replicas=8
kubectl expose deploy echo --port=8080
kubectl run client --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker"}}' -- sleep infinity
kubectl wait --for=condition=Available deploy/echo; kubectl wait --for=condition=Ready pod/client
kubectl get pods -l app=echo -o custom-columns=POD:.metadata.name,NODE:.spec.nodeName
count() { kubectl exec client -- sh -c 'for i in $(seq 100); do curl -s echo:8080 | grep -o "\\"hostname\\": *\\"[^\\"]*"; done' | sort | uniq -c; }
count`],
          ['Prefer same-zone backends and count again:', 'kubectl patch svc echo -p \'{"spec":{"trafficDistribution":"PreferClose"}}\'\nsleep 5; count'],
          ['Now force node-local backends with an LRP:', `kubectl patch svc echo --type=json -p='[{"op":"remove","path":"/spec/trafficDistribution"}]'
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumLocalRedirectPolicy
metadata: {name: echo-lrp}
spec:
  redirectFrontend:
    serviceMatcher: {serviceName: echo, namespace: default}
  redirectBackend:
    localEndpointSelector: {matchLabels: {app: echo}}
    toPorts: [{port: "8080", protocol: TCP}]
EOF
sleep 5; count
CIL=$(kubectl -n kube-system get pod -l k8s-app=cilium --field-selector spec.nodeName=kind-worker -o name)
kubectl -n kube-system exec $CIL -- cilium-dbg service list | grep LocalRedirect`]
        ],
        verify: 'Without settings, all 8 Pods answer; with PreferClose, only Pods on kind-worker/kind-worker2 (zone-a) answer; with the LRP, only Pods on kind-worker answer and the Service shows as `LocalRedirect`.',
        cleanup: 'kind delete cluster'
      }],
      refs: [
        ['Local Redirect Policy', 'https://docs.cilium.io/en/stable/network/kubernetes/local-redirect-policy/'],
        ['Kubernetes: traffic distribution', 'https://kubernetes.io/docs/concepts/services-networking/service/#traffic-distribution'],
        ['Kubernetes: NodeLocal DNSCache', 'https://kubernetes.io/docs/tasks/administer-cluster/nodelocaldns/'],
        ['Kubernetes without kube-proxy (topology-aware hints)', 'https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/']
      ],
      quiz: [
        { q: "What does `trafficDistribution: PreferClose` do?",
          o: ["Prefers backends in the client's zone, falling back to others if none are available", "Only uses backends on the client's node", "Blocks cross-zone traffic completely", "Preserves the client IP"],
          why: "In Kubernetes 1.34+ the explicit name is `PreferSameZone`." },
        { q: "A Service has `internalTrafficPolicy: Local` and `trafficDistribution: PreferClose`. Which wins for in-cluster traffic?",
          o: ["`internalTrafficPolicy: Local`", "`trafficDistribution`", "Whichever was set last", "Neither; it's an invalid combination"],
          why: "A `Local` traffic policy takes precedence for its traffic type." },
        { q: "What does a CiliumLocalRedirectPolicy do?",
          o: ["Redirects traffic for a Service or IP:port to backends on the same node", "Redirects HTTP to HTTPS", "Moves Pods to a different node", "Redirects DNS to an external resolver"],
          why: "The Service entry becomes type `LocalRedirect` with only node-local backends." },
        { q: "Which LRP frontend type would you use to send `169.254.169.254:80` to a node-local metadata cache?",
          o: ["addressMatcher", "serviceMatcher", "nodeMatcher", "endpointSelector"],
          why: "addressMatcher matches an IP:port; serviceMatcher matches a Kubernetes Service." },
        { q: "What is the best-known use of LRP?",
          o: ["Keeping DNS queries on the node with NodeLocal DNSCache", "Encrypting traffic", "Load balancing across clusters", "Rate-limiting egress"],
          why: "It cuts DNS latency and avoids cross-node DNS traffic." }
      ]
    },
    {
      id: 'cil-perf',
      title: 'Ch 8: DSR, XDP, Maglev and netkit',
      basics: {
        summary: "Cilium has several switches for raw performance at the cluster edge and on each node. **DSR** lets a backend reply straight to the client and keeps the client's IP. **XDP** processes packets in the network driver. **Maglev** picks the same backend for a connection on every node. **netkit** replaces the old veth device.",
        ideas: [
          "**DSR** (`loadBalancer.mode=dsr`): client IP preserved, shorter return path. Needs KPR and native routing or Geneve (not VXLAN).",
          "**XDP** (`loadBalancer.acceleration=native|best-effort`): earliest packet processing, for external traffic only.",
          "**Maglev** (`loadBalancer.algorithm=maglev`): consistent hashing of the 5-tuple, so connections survive a load-balancing node failing.",
          "**netkit**: eBPF runs inside the Pod's namespace, for near-host-network performance."
        ]
      },
      points: [
        "Without DSR, a node that forwards NodePort/LoadBalancer traffic to a backend on another node SNATs it: the backend sees the forwarding node's `cilium_host` IP, and replies return via that node.",
        "DSR: Helm `kubeProxyReplacement: true`, `routingMode: native` (or Geneve tunnel), `loadBalancer.mode: dsr`. `cilium-dbg status --verbose` shows `Mode: DSR` and the dispatch mode (IP option/extension); `cilium-dbg bpf lb list` marks Services `[NodePort, dsr]`.",
        "DSR vs `externalTrafficPolicy: Local`: Local is per Service and only nodes with backends accept traffic; DSR is cluster-wide and any node can accept traffic.",
        "XDP runs in the NIC driver before the kernel stack (or offloaded to hardware): early drops for DDoS mitigation and firewalling, fast load balancing. It only helps traffic arriving on a physical interface, not Pod-to-Pod on one node. Not on by default because not all drivers support native XDP.",
        "Default backend selection is random. If the node that handled a connection fails, another node may pick a different backend, and the TCP connection is reset.",
        "Maglev (from Google) hashes the 5-tuple against a lookup table that every node computes the same way, so all nodes pick the same backend without sharing state. Requires KPR; uses a fixed-size table (default 16381 entries, more memory). Shown as `Backend Selection: Maglev (Table Size: 16381)`.",
        "Testing Maglev: fix the client source port (`curl --local-port 6000`); otherwise the changing 5-tuple hits different backends anyway.",
        "netkit (Linux 6.7+; Cilium 1.16+): host-side primary device controls the eBPF programs and the peer sits in the Pod; layer 3 by default (no ARP); avoids per-CPU backlog queues. Enable with `bpf.datapathMode=netkit` on a supported kernel. Also mentioned: BIG TCP, BBR congestion control, and eBPF host routing (on by default when the kernel supports it)."
      ],
      labs: [{
        title: 'See the client IP disappear, then come back with DSR',
        goal: 'Two kind clusters in turn. A container on the `kind` Docker network plays the external client.',
        steps: [
          ['Default install: a NodePort "what\'s my IP" app:', `kind create cluster --config kind.yaml
cilium install --version 1.18.4 && cilium status --wait
kubectl create deploy echo --image=quay.io/isovalent-dev/egressgw-whatismyip:latest --replicas=2
kubectl expose deploy echo --type=NodePort --port=80 --target-port=8000 --name=echo-np
kubectl patch svc echo-np --type=json -p='[{"op":"replace","path":"/spec/ports/0/nodePort","value":30080}]'
docker run -d --rm --net kind --name client nicolaka/netshoot sleep infinity
CP=$(docker inspect -f '{{.NetworkSettings.Networks.kind.IPAddress}}' kind-control-plane)
echo "client is $(docker inspect -f '{{.NetworkSettings.Networks.kind.IPAddress}}' client)"
kubectl wait --for=condition=Available deploy/echo
docker exec client curl -s $CP:30080; echo`],
          ['Rebuild with KPR, native routing and DSR:', `docker rm -f client; kind delete cluster
kind create cluster --config kind-kpr.yaml
helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set kubeProxyReplacement=true --set k8sServiceHost=kind-control-plane --set k8sServicePort=6443 \\
  --set routingMode=native --set autoDirectNodeRoutes=true --set ipv4NativeRoutingCIDR=172.18.0.0/16 \\
  --set loadBalancer.mode=dsr --set loadBalancer.algorithm=maglev
cilium status --wait
kubectl -n kube-system exec ds/cilium -- cilium-dbg status --verbose | grep -E "Mode|DSR|Backend Selection"`],
          ['Same app and test:', `kubectl create deploy echo --image=quay.io/isovalent-dev/egressgw-whatismyip:latest --replicas=2
kubectl expose deploy echo --type=NodePort --port=80 --target-port=8000 --name=echo-np
kubectl patch svc echo-np --type=json -p='[{"op":"replace","path":"/spec/ports/0/nodePort","value":30080}]'
docker run -d --rm --net kind --name client nicolaka/netshoot sleep infinity
CP=$(docker inspect -f '{{.NetworkSettings.Networks.kind.IPAddress}}' kind-control-plane)
kubectl wait --for=condition=Available deploy/echo
docker exec client curl -s $CP:30080; echo
kubectl -n kube-system exec ds/cilium -- cilium-dbg bpf lb list | grep 30080`],
          ['Optional: check whether your kernel supports netkit before trying it:', 'docker exec kind-worker uname -r   # netkit needs a recent kernel; see the Cilium docs for the minimum']
        ],
        verify: 'Before: the app reports a `10.x` `cilium_host` address. After: it reports the client container\'s `172.18.x.x` address, status shows `Mode: DSR` and `Backend Selection: Maglev`, and the NodePort entry is marked `dsr`.',
        cleanup: 'docker rm -f client; kind delete cluster'
      }],
      refs: [
        ['Kubernetes without kube-proxy: DSR, Maglev, XDP', 'https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/'],
        ['Tuning guide (netkit, BIG TCP, BBR, eBPF host routing)', 'https://docs.cilium.io/en/stable/operations/performance/tuning/'],
        ['Maglev paper (Google)', 'https://research.google/pubs/maglev-a-fast-and-reliable-software-network-load-balancer/'],
        ['LWN: the BPF-programmable network device (netkit)', 'https://lwn.net/Articles/949960/']
      ],
      quiz: [
        { q: "Without DSR, what IP does a backend see for an external client that came in through another node's NodePort?",
          o: ["The forwarding node's internal (cilium_host) IP, because the traffic was source-NATed", "The client's real IP", "The Service ClusterIP", "The backend's own IP"],
          why: "That's the loss of observability DSR fixes; replies also take the longer path back through that node." },
        { q: "Which routing setup does NOT support DSR in Cilium 1.18?",
          o: ["VXLAN encapsulation", "Native routing", "Geneve encapsulation", "Native routing with BGP"],
          why: "Geneve can carry the needed metadata in TLV options; VXLAN can't." },
        { q: "Why might a TCP connection be reset after a load-balancing node fails, with Cilium's default settings?",
          o: ["Random backend selection: the new node may choose a different backend that has no state for the connection", "XDP drops it", "DSR is enabled", "The Service IP changes"],
          why: "Maglev makes every node pick the same backend for the same 5-tuple." },
        { q: "Which traffic does XDP acceleration help?",
          o: ["Traffic arriving on a physical network interface, such as external clients hitting LoadBalancer Services", "Pod-to-Pod traffic on the same node", "Traffic inside Envoy", "DNS lookups between Pods"],
          why: "XDP hooks into the NIC driver; local Pod traffic never passes through it." },
        { q: "What does netkit change compared with veth?",
          o: ["eBPF runs inside the Pod's namespace and packets skip extra host-stack steps, for near-host performance", "It adds encryption to Pod traffic", "It replaces kube-proxy", "It moves Pods into VMs"],
          why: "It works at layer 3 by default, so no ARP is needed, and the host-side device controls the programs." }
      ]
    }
  ]
});
