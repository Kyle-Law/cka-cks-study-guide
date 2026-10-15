(window.COURSE_DOMAINS = window.COURSE_DOMAINS || []).push({
  id: 'networking', title: 'Services & Networking', weight: 20,
  topics: [
    {
      id: 'net-connectivity',
      title: 'Connectivity between Pods',
      points: [
        'The Kubernetes network model: every Pod gets its own IP; Pods can talk to all other Pods **without NAT**; agents on a node can reach all Pods on that node.',
        'Containers in the same Pod share a network namespace: they talk via `localhost` and must use distinct ports.',
        'Pod-to-Pod across nodes is provided by the **CNI plugin** (overlay such as VXLAN, or routed such as BGP). Pod CIDR per node is assigned by the controller-manager (`--cluster-cidr`, `--allocate-node-cidrs`).',
        'Pod IPs are ephemeral. Use Services for stable addresses.',
        'Find IPs: `kubectl get pods -o wide`; node Pod CIDR: `kubectl get node <n> -o jsonpath="{.spec.podCIDR}"`.',
        'Test with `kubectl exec <pod> -- curl <ip>:<port>` or a `busybox`/`netshoot` Pod.',
        'Without NetworkPolicies all traffic is allowed. Namespaces are **not** a network boundary.',
        'Services get virtual IPs from the service CIDR (`--service-cluster-ip-range`); kube-proxy programs iptables/IPVS (or the CNI replaces it, e.g. Cilium).'
      ],
      labs: [{
        title: 'Prove Pod-to-Pod reachability across nodes',
        goal: 'Multi-node kind cluster.',
        steps: [
          ['Two Pods pinned to different nodes:', `kubectl run p1 --image=nginx --overrides='{"spec":{"nodeName":"kind-worker"}}'
kubectl run p2 --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker2"}}' -- sleep 3600
kubectl get pods -o wide`],
          ['Curl directly by Pod IP across nodes:', 'IP=$(kubectl get pod p1 -o jsonpath="{.status.podIP}")\nkubectl exec p2 -- curl -s -m3 $IP | head -4'],
          ['Look at the plumbing:', 'kubectl get nodes -o custom-columns=NAME:.metadata.name,CIDR:.spec.podCIDR\nkubectl exec p2 -- ip route\nkubectl exec p2 -- cat /etc/resolv.conf'],
          ['Shared network namespace in one Pod:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: two}
spec:
  containers:
  - {name: web, image: nginx}
  - {name: side, image: busybox, command: [sleep, "3600"]}
EOF
kubectl wait --for=condition=Ready pod/two
kubectl exec two -c side -- wget -qO- localhost | head -4`]
        ],
        verify: 'Cross-node curl returns the nginx page; the sidecar reaches nginx on `localhost`.',
        cleanup: 'kubectl delete pod p1 p2 two --now'
      }],
      refs: [
        ['Cluster Networking', 'https://kubernetes.io/docs/concepts/cluster-administration/networking/'],
        ['The Kubernetes network model', 'https://kubernetes.io/docs/concepts/services-networking/#the-kubernetes-network-model'],
        ['Services, Load Balancing, and Networking', 'https://kubernetes.io/docs/concepts/services-networking/'],
        ['Network Plugins', 'https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/']
      ]
    },
    {
      id: 'net-policy',
      title: 'Network Policies',
      points: [
        'A `NetworkPolicy` is enforced by the **CNI** (Calico, Cilium, Weave…). Flannel alone and kindnet do **not** enforce it, so the policy is silently ignored.',
        'Pods are non-isolated until selected by a policy. Once a policy with `policyTypes: [Ingress]` selects a Pod, only listed ingress is allowed (same for Egress). Policies are additive (union).',
        '`podSelector: {}` selects all Pods in the namespace. Empty rule lists + policyType = deny all.',
        'Peers (`from`/`to`): `podSelector`, `namespaceSelector`, `ipBlock` (CIDR + `except`). Combine **in the same list item** for AND; separate items for OR (classic trap).',
        '`namespaceSelector` matches namespace labels. Namespaces carry `kubernetes.io/metadata.name=<name>` automatically.',
        'Egress deny-all also blocks DNS, so allow UDP/TCP 53 to kube-dns (e.g. `namespaceSelector` kube-system, port 53).',
        '`ports` entries: `protocol` + `port` (+ `endPort` range).',
        'Debug: `kubectl describe netpol`, test with temporary client Pods; remember it filters on Pod IPs, not Service IPs (after DNAT).'
      ],
      labs: [{
        title: 'Default-deny, then allow only the frontend',
        tags: ['CNI'],
        goal: 'Needs Calico/Cilium. For kind: `networking: {disableDefaultCNI: true}` in the kind config, then `kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.1/manifests/calico.yaml`.',
        steps: [
          ['App tiers:', `kubectl create ns shop
kubectl -n shop run db --image=nginx --labels=tier=db
kubectl -n shop run api --image=nginx --labels=tier=api
kubectl -n shop run web --image=nginx --labels=tier=web
kubectl -n shop expose pod db --port=80`],
          ['Baseline: all open. Then default-deny ingress for the namespace:', `kubectl -n shop exec web -- curl -s -m2 db | head -1
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: default-deny, namespace: shop}
spec:
  podSelector: {}
  policyTypes: [Ingress]
EOF
kubectl -n shop exec web -- curl -s -m2 db || echo BLOCKED`],
          ['Allow only `tier=api` Pods to reach the DB on port 80:', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: db-from-api, namespace: shop}
spec:
  podSelector: {matchLabels: {tier: db}}
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: {matchLabels: {tier: api}}
    ports: [{protocol: TCP, port: 80}]
EOF
kubectl -n shop exec api -- curl -s -m2 db | head -1
kubectl -n shop exec web -- curl -s -m2 db || echo BLOCKED`],
          ['Cross-namespace allowance (AND of namespace + pod selector in one item):', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: db-from-ops, namespace: shop}
spec:
  podSelector: {matchLabels: {tier: db}}
  policyTypes: [Ingress]
  ingress:
  - from:
    - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: ops}}
      podSelector: {matchLabels: {role: admin}}
EOF`],
          ['Egress deny with DNS allowed:', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: web-egress, namespace: shop}
spec:
  podSelector: {matchLabels: {tier: web}}
  policyTypes: [Egress]
  egress:
  - to:
    - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: kube-system}}
    ports: [{protocol: UDP, port: 53}, {protocol: TCP, port: 53}]
EOF`]
        ],
        verify: 'API→DB works; Web→DB is blocked (curl times out).',
        cleanup: 'kubectl delete ns shop'
      }],
      refs: [
        ['Network Policies', 'https://kubernetes.io/docs/concepts/services-networking/network-policies/'],
        ['Declare Network Policy', 'https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/'],
        ['Network Policy recipes (community)', 'https://github.com/ahmetb/kubernetes-network-policy-recipes'],
        ['Namespaces and labels', 'https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/']
      ]
    },
    {
      id: 'net-services',
      title: 'Services: ClusterIP, NodePort, LoadBalancer & Endpoints',
      points: [
        '**ClusterIP** (default): virtual IP reachable only in-cluster. **NodePort**: also opens a port (30000–32767) on every node. **LoadBalancer**: asks the cloud (or MetalLB) for an external IP, building on NodePort. **ExternalName**: DNS CNAME. **Headless** (`clusterIP: None`): DNS returns Pod IPs, used by StatefulSets.',
        'Selector → Pods with matching labels → **EndpointSlices** (legacy `Endpoints`). Only **Ready** Pods are included.',
        'Fields: `port` (service), `targetPort` (container, number or named port), `nodePort`, `protocol`, `sessionAffinity`, `externalTrafficPolicy` (`Cluster`/`Local`: `Local` preserves client IP).',
        'Create fast: `kubectl expose deploy web --port=80 --target-port=8080 --type=NodePort`, or `kubectl create svc nodeport web --tcp=80:8080`.',
        'Services without selector + manual EndpointSlice point to external backends.',
        'Discovery: DNS `<svc>.<ns>.svc.cluster.local` and env vars `<SVC>_SERVICE_HOST` (set at Pod start only).',
        'kube-proxy implements Services (iptables/IPVS/nftables). It is a DaemonSet; check `kubectl -n kube-system get ds kube-proxy`.',
        'On bare metal `LoadBalancer` stays `<pending>` unless you install MetalLB (or `minikube tunnel`).'
      ],
      labs: [{
        title: 'Expose an app three ways',
        goal: 'ClusterIP, NodePort and a headless Service; inspect endpoints.',
        steps: [
          ['Deployment and a ClusterIP Service:', 'kubectl create deploy web --image=nginx --replicas=3\nkubectl expose deploy web --port=80\nkubectl get svc web\nkubectl get endpointslices -l kubernetes.io/service-name=web\nkubectl run c --rm -it --image=busybox --restart=Never -- wget -qO- web | head -3'],
          ['NodePort:', 'kubectl expose deploy web --name=web-np --port=80 --type=NodePort\nkubectl get svc web-np\n# kind: docker exec kind-control-plane curl -s localhost:<nodePort>\n# minikube: minikube service web-np --url'],
          ['Headless Service and its DNS answer:', 'kubectl create svc clusterip web-hl --clusterip=None --tcp=80\nkubectl set selector svc web-hl app=web\nkubectl run d --rm -it --image=nicolaka/netshoot --restart=Never -- dig +short web-hl.default.svc.cluster.local'],
          ['Scale down and watch endpoints change; break the selector and see them vanish:', 'kubectl scale deploy web --replicas=1; kubectl get endpoints web\nkubectl patch svc web -p \'{"spec":{"selector":{"app":"nope"}}}\'; kubectl get endpoints web'],
          ['LoadBalancer on minikube:', 'kubectl expose deploy web --name=web-lb --port=80 --type=LoadBalancer\nminikube tunnel   # separate terminal\nkubectl get svc web-lb']
        ],
        verify: 'Headless DNS returns Pod IPs (several A records), while the ClusterIP returns one.',
        cleanup: 'kubectl delete deploy web; kubectl delete svc web web-np web-hl web-lb --ignore-not-found'
      }],
      refs: [
        ['Service', 'https://kubernetes.io/docs/concepts/services-networking/service/'],
        ['EndpointSlices', 'https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/'],
        ['Connecting Applications with Services', 'https://kubernetes.io/docs/tutorials/services/connect-applications-service/'],
        ['Use a Service to Access an Application', 'https://kubernetes.io/docs/tasks/access-application-cluster/service-access-application-cluster/'],
        ['Create an External Load Balancer', 'https://kubernetes.io/docs/tasks/access-application-cluster/create-external-load-balancer/'],
        ['Virtual IPs and Service Proxies', 'https://kubernetes.io/docs/reference/networking/virtual-ips/']
      ]
    },
    {
      id: 'net-gateway',
      title: 'Gateway API',
      points: [
        'Gateway API is the successor to Ingress: role-oriented, expressive, portable. It is installed as **CRDs** (not built in) plus a controller implementation (Envoy Gateway, NGINX Gateway Fabric, Cilium, Istio, Traefik…).',
        '**GatewayClass** (cluster-wide, which controller; infra provider), **Gateway** (listeners: port/protocol/hostname; platform operator), **HTTPRoute** / GRPCRoute / TLSRoute / TCPRoute (routing rules; app developer).',
        '`HTTPRoute`: `parentRefs` (which Gateway), `hostnames`, `rules[]` with `matches` (path, headers, method, query), `filters` (redirect, rewrite, header modifier, mirror) and `backendRefs` (Service + port + `weight` for traffic splitting).',
        'Cross-namespace attachment is controlled by the Gateway listener `allowedRoutes` and `ReferenceGrant` for cross-namespace backends.',
        'Check status: `kubectl get gatewayclass,gateway,httproute -A`; conditions `Accepted`, `Programmed`, `ResolvedRefs` in `kubectl describe`.',
        'TLS terminates at a Gateway listener with `tls.certificateRefs` (a Secret).',
        'Migrate from Ingress with the `ingress2gateway` tool; the CKA expects you to create Gateway/HTTPRoute resources and translate an Ingress to them.',
        'Compared to Ingress: separate roles, more route types, header/weighted routing without annotations.'
      ],
      labs: [{
        title: 'Route traffic with Gateway API (Envoy Gateway)',
        goal: 'Works on kind/minikube. Use `kubectl port-forward` to reach the Gateway.',
        steps: [
          ['Install Gateway API CRDs + Envoy Gateway:', 'helm install eg oci://docker.io/envoyproxy/gateway-helm -n envoy-gateway-system --create-namespace\nkubectl -n envoy-gateway-system wait --for=condition=Available deploy/envoy-gateway --timeout=2m\nkubectl get crd | grep gateway.networking.k8s.io'],
          ['GatewayClass + Gateway:', `cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata: {name: eg}
spec: {controllerName: gateway.envoyproxy.io/gatewayclass-controller}
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata: {name: web-gw}
spec:
  gatewayClassName: eg
  listeners:
  - {name: http, protocol: HTTP, port: 80}
EOF
kubectl get gateway web-gw`],
          ['Two backends and an HTTPRoute with path routing and a 90/10 split:', `kubectl create deploy v1 --image=hashicorp/http-echo -- /http-echo -text=v1 -listen=:5678
kubectl create deploy v2 --image=hashicorp/http-echo -- /http-echo -text=v2 -listen=:5678
kubectl expose deploy v1 --port=80 --target-port=5678
kubectl expose deploy v2 --port=80 --target-port=5678
cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: {name: app}
spec:
  parentRefs: [{name: web-gw}]
  hostnames: ["app.example.com"]
  rules:
  - matches: [{path: {type: PathPrefix, value: /}}]
    backendRefs:
    - {name: v1, port: 80, weight: 90}
    - {name: v2, port: 80, weight: 10}
EOF
kubectl describe httproute app | grep -A3 Conditions`],
          ['Send requests:', 'SVC=$(kubectl -n envoy-gateway-system get svc -l gateway.envoyproxy.io/owning-gateway-name=web-gw -o name)\nkubectl -n envoy-gateway-system port-forward $SVC 8080:80 &\nfor i in $(seq 20); do curl -s -H "Host: app.example.com" localhost:8080; echo; done | sort | uniq -c']
        ],
        verify: 'Output is roughly 18× `v1` and 2× `v2`.',
        cleanup: 'kubectl delete httproute app; kubectl delete gateway web-gw; kubectl delete deploy v1 v2; kubectl delete svc v1 v2; helm uninstall eg -n envoy-gateway-system'
      }],
      refs: [
        ['Gateway API (Kubernetes docs)', 'https://kubernetes.io/docs/concepts/services-networking/gateway/'],
        ['Gateway API project documentation', 'https://gateway-api.sigs.k8s.io/'],
        ['Gateway API: HTTP routing guide', 'https://gateway-api.sigs.k8s.io/guides/http-routing/'],
        ['Migrating from Ingress', 'https://gateway-api.sigs.k8s.io/guides/getting-started/migrating-from-ingress/'],
        ['Envoy Gateway quickstart', 'https://gateway.envoyproxy.io/docs/tasks/quickstart/']
      ]
    },
    {
      id: 'net-ingress',
      title: 'Ingress controllers & Ingress resources',
      points: [
        'An **Ingress** is a set of L7 HTTP(S) routing rules; it does nothing without an **Ingress controller** (ingress-nginx, Traefik, HAProxy…). Choose the controller via `ingressClassName` (an `IngressClass` object; can be marked default).',
        'Rules: `host` (optional) + `paths[]` with `pathType` (`Exact`, `Prefix`, `ImplementationSpecific`) → `backend.service.name/port`. `defaultBackend` catches the rest.',
        'TLS: `spec.tls[].secretName` (type `kubernetes.io/tls`, from `kubectl create secret tls`).',
        'Imperative: `kubectl create ingress web --rule="app.example.com/*=web:80" --class=nginx`.',
        'Behaviour tuned with controller-specific **annotations** (e.g. `nginx.ingress.kubernetes.io/rewrite-target`).',
        'The controller itself is exposed via a NodePort/LoadBalancer Service. Reach it with the node IP + `Host` header (`curl -H "Host: app.example.com" <ip>:<port>`).',
        'Debug: `kubectl describe ingress` (backend resolved? events), controller Pod logs, Service endpoints, class name typo.',
        'Ingress is frozen/feature-complete; Gateway API is the future. Know both for the exam.'
      ],
      labs: [{
        title: 'Install ingress-nginx and route by host and path',
        goal: 'kind needs the ingress-ready cluster config (extraPortMappings 80/443 + node label `ingress-ready=true`). minikube: `minikube addons enable ingress`.',
        steps: [
          ['Install the controller (kind variant):', 'kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml\nkubectl -n ingress-nginx wait --for=condition=Ready pod -l app.kubernetes.io/component=controller --timeout=2m\nkubectl get ingressclass'],
          ['Two apps:', 'for n in apple banana; do\n  kubectl create deploy $n --image=hashicorp/http-echo -- /http-echo -text=$n -listen=:5678\n  kubectl expose deploy $n --port=80 --target-port=5678\ndone'],
          ['Ingress with path routing:', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: fruit
  annotations: {nginx.ingress.kubernetes.io/rewrite-target: /}
spec:
  ingressClassName: nginx
  rules:
  - host: fruit.example.com
    http:
      paths:
      - {path: /apple, pathType: Prefix, backend: {service: {name: apple, port: {number: 80}}}}
      - {path: /banana, pathType: Prefix, backend: {service: {name: banana, port: {number: 80}}}}
EOF
kubectl describe ingress fruit`],
          ['Test:', 'curl -H "Host: fruit.example.com" localhost/apple   # kind\ncurl -H "Host: fruit.example.com" localhost/banana'],
          ['Add TLS:', 'openssl req -x509 -nodes -newkey rsa:2048 -days 30 -keyout tls.key -out tls.crt -subj "/CN=fruit.example.com"\nkubectl create secret tls fruit-tls --cert=tls.crt --key=tls.key\nkubectl patch ingress fruit --type=merge -p \'{"spec":{"tls":[{"hosts":["fruit.example.com"],"secretName":"fruit-tls"}]}}\'\ncurl -k --resolve fruit.example.com:443:127.0.0.1 https://fruit.example.com/apple']
        ],
        verify: '`/apple` returns `apple` and `/banana` returns `banana`.',
        cleanup: 'kubectl delete ingress fruit; kubectl delete deploy apple banana; kubectl delete svc apple banana; kubectl delete secret fruit-tls'
      }],
      refs: [
        ['Ingress', 'https://kubernetes.io/docs/concepts/services-networking/ingress/'],
        ['Ingress Controllers', 'https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/'],
        ['ingress-nginx documentation', 'https://kubernetes.github.io/ingress-nginx/'],
        ['TLS secrets', 'https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets']
      ]
    },
    {
      id: 'net-coredns',
      title: 'CoreDNS',
      points: [
        'CoreDNS runs as a Deployment (`coredns`, 2 replicas) in `kube-system`, fronted by Service `kube-dns` (ClusterIP e.g. 10.96.0.10). The kubelet writes that IP into each Pod’s `/etc/resolv.conf` (`clusterDNS` in kubelet config).',
        'Names: Service `svc.ns.svc.cluster.local` → ClusterIP; headless → Pod IPs; Pod `10-1-2-3.ns.pod.cluster.local`; StatefulSet Pod `pod-0.svc.ns.svc.cluster.local`; SRV for named ports.',
        'Search path: `<ns>.svc.cluster.local svc.cluster.local cluster.local` with `options ndots:5`. Short names like `db` resolve within the same namespace; use `db.other-ns` across.',
        'Config lives in ConfigMap `coredns` (`Corefile`): plugins `kubernetes`, `forward . /etc/resolv.conf`, `cache`, `loop`, `reload`, `health`, `ready`. Edit it, and CoreDNS reloads (or `kubectl -n kube-system rollout restart deploy coredns`).',
        'Customise: add a `stub domain` / custom upstream via another server block, e.g. `example.com:53 { forward . 10.0.0.53 }`, or use the `hosts` plugin.',
        'Per-Pod DNS: `dnsPolicy` (`ClusterFirst` default, `Default`, `None`) and `dnsConfig`.',
        'Debug: check Pods + logs (`kubectl -n kube-system logs -l k8s-app=kube-dns`), test with `nslookup`/`dig` from a Pod, verify the `kube-dns` Service has endpoints, then check upstream.',
        'Common failures: CoreDNS `CrashLoopBackOff` due to a `loop` (resolv.conf points at 127.0.0.53), CNI down, NetworkPolicy blocking UDP 53, wrong clusterDNS IP.'
      ],
      labs: [{
        title: 'Explore, customise and break CoreDNS',
        goal: 'Works on any cluster.',
        steps: [
          ['Inspect the pieces:', 'kubectl -n kube-system get deploy,svc,ep -l k8s-app=kube-dns\nkubectl -n kube-system get cm coredns -o yaml\nkubectl run t --image=busybox:1.36 --restart=Never -- sleep 3600\nkubectl exec t -- cat /etc/resolv.conf'],
          ['Resolve different record types:', 'kubectl create deploy web --image=nginx; kubectl expose deploy web --port=80\nkubectl exec t -- nslookup web\nkubectl exec t -- nslookup web.default.svc.cluster.local\nkubectl exec t -- nslookup kubernetes.default'],
          ['Add a custom domain with the `hosts` plugin (edit the Corefile):', 'kubectl -n kube-system edit cm coredns\n# inside the .:53 { } block, before "kubernetes", add:\n#   hosts {\n#     10.1.2.3 legacy.example.internal\n#     fallthrough\n#   }\nkubectl -n kube-system rollout restart deploy coredns\nkubectl exec t -- nslookup legacy.example.internal'],
          ['Custom per-Pod DNS:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: dns-custom}
spec:
  dnsPolicy: None
  dnsConfig: {nameservers: [1.1.1.1], searches: [my.dns.local], options: [{name: ndots, value: "2"}]}
  containers: [{name: c, image: busybox:1.36, command: [sleep, "3600"]}]
EOF
kubectl exec dns-custom -- cat /etc/resolv.conf`],
          ['Break it and fix it: scale CoreDNS to 0, observe lookups failing, restore:', 'kubectl -n kube-system scale deploy coredns --replicas=0\nkubectl exec t -- nslookup web   # fails\nkubectl -n kube-system scale deploy coredns --replicas=2']
        ],
        verify: '`legacy.example.internal` resolves to `10.1.2.3`; lookups fail with 0 replicas and recover after scale up.',
        cleanup: 'kubectl delete pod t dns-custom --now; kubectl delete deploy web; kubectl delete svc web'
      }],
      refs: [
        ['DNS for Services and Pods', 'https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/'],
        ['Using CoreDNS for Service Discovery', 'https://kubernetes.io/docs/tasks/administer-cluster/coredns/'],
        ['Customizing DNS Service', 'https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/'],
        ['Debugging DNS Resolution', 'https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/'],
        ['CoreDNS Kubernetes plugin', 'https://coredns.io/plugins/kubernetes/']
      ]
    }
  ]
});
