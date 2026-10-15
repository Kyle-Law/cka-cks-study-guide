// Part 4: chapters 9-11. Quiz format: the FIRST option is correct; options are shuffled when shown.
COURSE.addDomain({
  id: 'connectivity', title: 'Beyond the cluster (ch. 9–11)', weight: 21,
  topics: [
    {
      id: 'cil-mesh',
      title: 'Ch 9: Cluster Mesh architecture and setup',
      basics: {
        summary: "Normally Cilium's identities, policies and services stop at the cluster edge. **Cluster Mesh** connects several Cilium clusters so they share Service endpoints and security identities. There's **no central controller**: each cluster runs a **Cluster Mesh API server** that the others read from.",
        ideas: [
          "Shares **service discovery** and **identity-aware policy** across clusters.",
          "It does **not** create the network: nodes (and Pods, in native routing) must already reach each other at layer 3.",
          "Each cluster needs a **unique name, numeric ID and Pod CIDR**, and the same routing mode.",
          "Clusters must **trust each other's TLS certificates** (shared CA or CA bundle)."
        ]
      },
      points: [
        "Why multicluster: org structure, resilience across sites/regions (stretching etcd across regions is discouraged), Kubernetes scale limits (~10,000 nodes), multicloud mandates.",
        "Without Cluster Mesh: per-cluster LoadBalancers + BGP + DNS with multiple A records (relies on clients failing over; DNS TTL delays) or an external load balancer appliance. Cluster Mesh replaces these with normal `<svc>.<ns>.svc` names resolved by Cilium.",
        "Architecture: each cluster's `clustermesh-apiserver` Pod reads local state from the Kubernetes API into its own in-memory etcd (a cache, not the Kubernetes etcd) and exposes it to other clusters. **KVStoreMesh** (default since 1.16) caches remote clusters' data locally for the agents. Full mesh: n(n−1)/2 connections, no single point of failure.",
        "Application traffic never passes through the API server; it goes node-to-node (tunnelled in encapsulation mode, routed in native mode).",
        "Requirements: Cilium in every cluster, same routing mode, non-overlapping PodCIDRs, L3 reachability between all nodes (and Pods if native), same max mesh size (255 default, or 511 which halves identities per cluster to 32,767). Keep versions within one minor of each other.",
        "Helm: `cluster.name`, `cluster.id` (unique), `clustermesh.useAPIServer: true`, `clustermesh.config.enabled: true` with a `clusters` list (name, IPs, port 32379 for the NodePort), `clustermesh.config.domain` (default `mesh.cilium.io`), `clustermesh.apiserver.tls.auto` (e.g. `method: cronJob`). Declarative Helm config is preferred over `cilium clustermesh connect`.",
        "Trust: each cluster's auto-generated CA must be trusted by the others: combine the `cilium-ca` secrets into a CA bundle (`tls.caBundle`), or (simpler, and recommended) use one shared CA. Symptom of missing trust: `x509: certificate signed by unknown authority` in `kvstoremesh-dbg troubleshoot`.",
        "Check: `cilium clustermesh status --context <ctx>`; test: `cilium connectivity test --context kind-a --multi-cluster kind-b` (context names, not cluster names). Tip: give every cluster a unique Pod range from day one, even if you never mesh."
      ],
      labs: [{
        title: 'Mesh two kind clusters',
        goal: 'About 4 GB RAM. Two small kind clusters on the same Docker network share one CA so they trust each other. The CLI is used here for brevity; the Helm-only method is in "In depth".',
        steps: [
          ['Two clusters, each with one worker:', `cat > kind-mesh.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes: [{role: control-plane}, {role: worker}]
networking: {disableDefaultCNI: true}
EOF
kind create cluster --config kind-mesh.yaml --name red
kind create cluster --config kind-mesh.yaml --name blue`],
          ['Install Cilium in red with a unique name, ID and Pod range:', `helm install cilium cilium/cilium -n kube-system --version 1.18.4 --kube-context kind-red \\
  --set cluster.name=red --set cluster.id=1 \\
  --set ipam.mode=cluster-pool --set ipam.operator.clusterPoolIPv4PodCIDRList=10.1.0.0/16
cilium status --wait --context kind-red`],
          ['Copy red\'s CA to blue, then install blue (shared CA = mutual trust):', `kubectl --context kind-red -n kube-system get secret cilium-ca -o yaml \\
  | grep -v -E 'resourceVersion|uid|creationTimestamp' | kubectl --context kind-blue create -f -
helm install cilium cilium/cilium -n kube-system --version 1.18.4 --kube-context kind-blue \\
  --set cluster.name=blue --set cluster.id=2 \\
  --set ipam.mode=cluster-pool --set ipam.operator.clusterPoolIPv4PodCIDRList=10.2.0.0/16
cilium status --wait --context kind-blue`],
          ['Enable the Cluster Mesh API server in both and connect them:', `for c in red blue; do cilium clustermesh enable --context kind-$c --service-type NodePort; done
for c in red blue; do cilium clustermesh status --context kind-$c --wait; done
cilium clustermesh connect --context kind-red --destination-context kind-blue
cilium clustermesh status --context kind-red --wait`],
          ['Optional: the full multi-cluster connectivity test (takes several minutes):', "cilium connectivity test --context kind-red --multi-cluster kind-blue --test '!check-log-errors/no-errors-in-logs'"]
        ],
        verify: '`cilium clustermesh status` reports all nodes connected to the remote cluster, and `kubectl --context kind-red -n kube-system get pods -l app.kubernetes.io/name=clustermesh-apiserver` is Running.',
        cleanup: 'Keep both clusters for the next topic.'
      }],
      refs: [
        ['Cluster Mesh overview', 'https://docs.cilium.io/en/stable/network/clustermesh/'],
        ['Setting up Cluster Mesh', 'https://docs.cilium.io/en/stable/network/clustermesh/clustermesh/'],
        ['Cluster Mesh troubleshooting', 'https://docs.cilium.io/en/stable/operations/troubleshooting/#troubleshooting-clustermesh']
      ],
      quiz: [
        { q: "What does Cluster Mesh NOT do for you?",
          o: ["Provide network connectivity between the clusters' nodes", "Share Service endpoints between clusters", "Share security identities for policy", "Let Pods use normal Service DNS names for remote backends"],
          why: "You must provide L3 reachability (VPN, routing, etc.) yourself." },
        { q: "Which component exposes a cluster's endpoints and identities to other clusters?",
          o: ["The Cluster Mesh API server, backed by its own in-memory etcd", "The Kubernetes API server's etcd", "Hubble Relay", "The Cilium operator"],
          why: "Its etcd is a cache with no canonical data; KVStoreMesh caches remote data for local agents." },
        { q: "Which pair of settings must be unique for each cluster in a mesh?",
          o: ["`cluster.name` and `cluster.id` (plus a non-overlapping Pod CIDR)", "`routingMode` and `tunnelProtocol`", "`kubeProxyReplacement` and `ipam.mode`", "The Cilium version and Helm chart"],
          why: "Routing mode, in contrast, must be the same in all clusters." },
        { q: "`kvstoremesh-dbg troubleshoot` shows `x509: certificate signed by unknown authority`. What's wrong?",
          o: ["The clusters don't trust each other's CA; share one CA or distribute a CA bundle", "The NodePort is closed", "The cluster IDs collide", "Hubble is disabled"],
          why: "Each cluster auto-generates its own CA unless you share one." },
        { q: "Does application traffic flow through the Cluster Mesh API server?",
          o: ["No; it goes directly between nodes, and only metadata goes through the API server", "Yes, all cross-cluster traffic", "Only DNS traffic", "Only encrypted traffic"],
          why: "The API server only propagates state such as endpoints and identities." }
      ]
    },
    {
      id: 'cil-mesh-global',
      title: 'Ch 9: Global services and cross-cluster policy',
      basics: {
        summary: "Once clusters are meshed, give a Service **the same name and namespace in each cluster** and annotate it as **global**. Clients then reach backends in any cluster through their normal Service name. You can prefer local backends, and write policies that name the **cluster** a Pod lives in.",
        ideas: [
          "`service.cilium.io/global: \"true\"` (quoted) merges endpoints across clusters.",
          "`service.cilium.io/affinity: local` prefers local backends and **fails over** to remote ones.",
          "Settings apply **only in the cluster where you set them**; there's no global view of a Service.",
          "Policies can match `io.cilium.k8s.policy.cluster: <name>` to allow Pods from a specific cluster."
        ]
      },
      points: [
        "A global Service is the same name/namespace in each cluster with the annotation `service.cilium.io/global: \"true\"`. The quotes matter: annotations must be strings. ClusterIPs are not synchronised; each cluster just learns the others' endpoints.",
        "Traffic is load-balanced randomly across all backends in all clusters by default (eBPF Service translation happens as the packet leaves the Pod).",
        "`service.cilium.io/affinity`: `local` (prefer local, fail over to remote), `remote`, or `none`. Affinity only affects clients in the cluster where the annotation is set.",
        "Test failover regularly: cross-region latency during failover can cause cascading failures in latency-sensitive apps.",
        "With KPR, NodePort and LoadBalancer Services also work with global backends; without KPR only ClusterIP does.",
        "Identities are shared across the mesh, so `fromEndpoints`/`toEndpoints` can select remote Pods. The label `io.cilium.k8s.policy.cluster` holds the cluster name.",
        "Version behaviour: up to 1.18 policies select endpoints from any cluster unless the cluster label is given; from 1.19 they select only the local cluster by default. Policies are never synchronised; a CCNP applies only in the cluster it's created in.",
        "Cluster Mesh certificates: one server cert (`clustermesh-apiserver-server-cert`, SANs `<cluster>.<domain>`, `clustermesh-apiserver.<ns>.svc`, `localhost`, `127.0.0.1`, `::1`) and three client certs (admin, remote, local). Using a single shared CA is easier than CA bundles."
      ],
      labs: [{
        title: 'Load-balance, fail over and secure across clusters',
        goal: 'The meshed `red` and `blue` clusters from the previous topic.',
        steps: [
          ['The same app and global Service in both clusters; each replies with its cluster name:', `for c in red blue; do
  kubectl --context kind-$c create deploy hello --image=hashicorp/http-echo -- /http-echo -text="hello from $c" -listen=:8080
  cat <<EOF | kubectl --context kind-$c apply -f -
apiVersion: v1
kind: Service
metadata:
  name: hello
  annotations: {service.cilium.io/global: "true"}
spec:
  selector: {app: hello}
  ports: [{port: 80, targetPort: 8080}]
EOF
done
kubectl --context kind-red run client --image=nicolaka/netshoot --labels=app=frontend -- sleep infinity
kubectl --context kind-red wait --for=condition=Ready pod/client
for i in $(seq 8); do kubectl --context kind-red exec client -- curl -s hello; done | sort | uniq -c`],
          ['Prefer local backends in red, then fail over:', `kubectl --context kind-red annotate svc hello service.cilium.io/affinity=local
for i in $(seq 6); do kubectl --context kind-red exec client -- curl -s hello; done | sort | uniq -c
kubectl --context kind-red scale deploy hello --replicas=0
sleep 5; for i in $(seq 6); do kubectl --context kind-red exec client -- curl -s -m3 hello; done | sort | uniq -c`],
          ['Cross-cluster policy in blue: only `app=frontend` Pods from cluster red may connect:', `cat <<EOF | kubectl --context kind-blue apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: {name: hello-from-red-frontend}
spec:
  endpointSelector: {matchLabels: {app: hello}}
  ingress:
  - fromEndpoints:
    - matchLabels: {app: frontend, io.cilium.k8s.policy.cluster: red}
    toPorts: [{ports: [{port: "8080", protocol: TCP}]}]
EOF
kubectl --context kind-red exec client -- curl -s -m3 hello
kubectl --context kind-red run other --image=nicolaka/netshoot --rm -it --restart=Never -- curl -s -m3 hello || echo BLOCKED`]
        ],
        verify: 'Both cluster names appear at first; with local affinity only "red" answers until red is scaled to 0, then "blue" takes over; after the policy, the `frontend` client still gets "hello from blue" but the unlabelled Pod prints `BLOCKED`.',
        cleanup: 'kind delete cluster --name red; kind delete cluster --name blue'
      }],
      refs: [
        ['Load-balancing & service discovery with Cluster Mesh', 'https://docs.cilium.io/en/stable/network/clustermesh/services/'],
        ['Cluster Mesh: network policy', 'https://docs.cilium.io/en/stable/network/clustermesh/policy/'],
        ['Service affinity', 'https://docs.cilium.io/en/stable/network/clustermesh/affinity/']
      ],
      quiz: [
        { q: "How do you make Service `hello` global across meshed clusters?",
          o: ["Create it with the same name and namespace in each cluster and annotate `service.cilium.io/global: \"true\"`", "Create it in one cluster only with type GlobalService", "Label the namespace `global=true`", "Use the same ClusterIP in every cluster"],
          why: "ClusterIPs can differ; Cilium shares endpoints between Services with matching name and namespace." },
        { q: "Why must `\"true\"` be quoted in the annotation?",
          o: ["Annotations are strings; an unquoted `true` is a YAML boolean and the object is rejected", "Cilium is case-sensitive", "It enables encryption", "It doesn't matter"],
          why: "The API server can't unmarshal a bool into an annotation value." },
        { q: "With `service.cilium.io/affinity: local` and no local backends left, what happens?",
          o: ["Traffic fails over to backends in remote clusters", "Requests fail", "Traffic goes to the API server", "The Service is deleted"],
          why: "Local is a preference, not a restriction." },
        { q: "You set local affinity on the Service in cluster red. Does it affect clients in cluster blue?",
          o: ["No; affinity only applies in the cluster where it's set", "Yes, everywhere", "Only for NodePort clients", "Only after a restart"],
          why: "There's no global view of a Service; each cluster's settings are local." },
        { q: "Which label lets a policy allow Pods from a specific cluster?",
          o: ["`io.cilium.k8s.policy.cluster`", "`topology.kubernetes.io/zone`", "`cilium.io/cluster-id`", "`kubernetes.io/cluster`"],
          why: "It's part of every endpoint's identity in a mesh." }
      ]
    },
    {
      id: 'cil-l2',
      title: 'Ch 10: L2 announcements',
      basics: {
        summary: "A NodePort makes the client pick a node and deal with failures itself. **L2 announcements** give a LoadBalancer IP a home on the local network instead: one elected node **answers ARP** for the virtual IP, and if that node fails, another takes over. Simple, but one node carries all the traffic and failover can be slow.",
        ideas: [
          "Enable with `l2announcements.enabled=true` (needs KPR).",
          "A **CiliumL2AnnouncementPolicy** picks which Services, nodes and interfaces announce.",
          "One node per IP is elected via a **Kubernetes Lease** and replies to ARP with its own MAC.",
          "Failover relies on **gratuitous ARP** or ARP cache expiry; good for labs and simple networks."
        ]
      },
      points: [
        "NodePort's problem is client-side node selection: if the chosen node dies, the client must notice and retry another node.",
        "The VIP (from LB IPAM) belongs to no interface; the elected node answers ARP for it, receives the traffic and load-balances it to backends anywhere in the cluster.",
        "The VIP must be in the client's subnet (e.g. pool `172.18.255.200/29` inside kind's `172.18.0.0/16`), or clients need a route to it.",
        "Policy (`cilium.io/v2alpha1`): `serviceSelector` (e.g. label `announcement: l2`), `nodeSelector` (usually exclude control-plane nodes), `interfaces` (RE2 regexes like `^eth0`; not a security boundary), `loadBalancerIPs: true` and/or `externalIPs: true`.",
        "Leader: `kubectl -n kube-system get lease | grep l2announce` → `cilium-l2announce-<ns>-<svc>` held by a node.",
        "Failover: the lease expires, another node takes it and sends gratuitous ARP. Many clients ignore gratuitous ARP (spoofing risk) and keep the stale MAC until their ARP entry expires.",
        "Limitations: no load balancing between nodes (one node per VIP), slow or client-dependent failover. IPv6 (Neighbor Discovery) arrives in 1.19. Pod IP announcement exists (`l2podAnnouncements`) but is discouraged.",
        "Lease timing is tunable (lease duration, renew deadline, retry period); shorter means faster failover but more API server load (ch. 16)."
      ],
      labs: [{
        title: 'Watch ARP select a node, then fail it over',
        goal: 'kind cluster without kube-proxy (`kind-kpr.yaml`). A container on the kind network is the client.',
        steps: [
          ['Install with KPR and L2 announcements; add a pool, an app and a LoadBalancer Service:', `helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set kubeProxyReplacement=true --set k8sServiceHost=kind-control-plane --set k8sServicePort=6443 \\
  --set l2announcements.enabled=true
cilium status --wait
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumLoadBalancerIPPool
metadata: {name: pool}
spec: {blocks: [{cidr: 172.18.255.200/29}]}
EOF
kubectl create deploy httpd --image=httpd:2.4 --replicas=2
kubectl expose deploy httpd --type=LoadBalancer --port=80
kubectl label svc httpd announcement=l2
sleep 5; kubectl get svc httpd`],
          ['The IP exists but nobody answers ARP yet:', 'docker run -d --rm --net kind --name client nicolaka/netshoot sleep infinity\nVIP=$(kubectl get svc httpd -o jsonpath=\'{.status.loadBalancer.ingress[0].ip}\')\ndocker exec client curl -s -m3 $VIP || echo "no answer yet"'],
          ['Announce it from worker nodes on eth0:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2alpha1
kind: CiliumL2AnnouncementPolicy
metadata: {name: l2-policy}
spec:
  serviceSelector: {matchLabels: {announcement: l2}}
  nodeSelector:
    matchExpressions: [{key: node-role.kubernetes.io/control-plane, operator: DoesNotExist}]
  interfaces: [^eth0]
  loadBalancerIPs: true
EOF
sleep 5; kubectl -n kube-system get lease | grep l2announce`],
          ['Capture the ARP exchange and compare MACs:', `docker exec -d client sh -c "timeout 8 tcpdump -ni eth0 arp -c 2 > /tmp/arp.txt"
docker exec client curl -s $VIP
sleep 2; docker exec client cat /tmp/arp.txt
LEADER=$(kubectl -n kube-system get lease cilium-l2announce-default-httpd -o jsonpath='{.spec.holderIdentity}')
docker exec $LEADER ip link show eth0 | grep ether`],
          ['Fail the leader and watch another node take over:', `docker stop $LEADER
docker exec client curl -s -m3 $VIP || echo "black hole (stale ARP)"
sleep 30; kubectl -n kube-system get lease cilium-l2announce-default-httpd -o jsonpath='{.spec.holderIdentity}'; echo
docker exec client ip neigh flush all; docker exec client curl -s -m5 $VIP
docker start $LEADER`]
        ],
        verify: 'The ARP reply for the VIP carries the leader node\'s MAC; after stopping it, the lease moves to the other worker and the client reaches the VIP again (immediately after flushing its ARP cache).',
        cleanup: 'docker rm -f client; kind delete cluster'
      }],
      refs: [
        ['L2 announcements / L2 aware LB', 'https://docs.cilium.io/en/stable/network/l2-announcements/'],
        ['LB IPAM', 'https://docs.cilium.io/en/stable/network/lb-ipam/'],
        ['Kubernetes leases', 'https://kubernetes.io/docs/concepts/architecture/leases/']
      ],
      quiz: [
        { q: "How does a client find the node behind an L2-announced LoadBalancer IP?",
          o: ["It sends an ARP request; the elected node replies with its own MAC address", "Through BGP routes", "Through DNS", "It tries every node in turn"],
          why: "From the client's view the VIP looks directly attached to the network." },
        { q: "How many nodes handle traffic for one L2-announced VIP at a time?",
          o: ["One, the current lease holder", "All worker nodes", "Two, for redundancy", "Only the control plane"],
          why: "That's why L2 announcements don't load-balance across nodes." },
        { q: "Why can failover with L2 announcements be slow?",
          o: ["Many clients ignore gratuitous ARP and keep the old MAC until their ARP cache expires", "Leases never expire", "The Service IP changes", "kube-proxy must be restarted"],
          why: "Gratuitous ARP can be abused for spoofing, so devices often ignore it." },
        { q: "Where can you see which node currently announces a Service's IP?",
          o: ["In the Lease `cilium-l2announce-<namespace>-<service>` in kube-system", "In the Service's annotations", "In `cilium bgp peers`", "In the node's labels"],
          why: "Leader election uses Kubernetes Lease objects." },
        { q: "Is the `interfaces` selector in an L2 announcement policy a security control?",
          o: ["No; the Service may still be reachable through other interfaces", "Yes, it blocks traffic on other interfaces", "Only for IPv6", "Only when encryption is on"],
          why: "It only limits where ARP replies are sent." }
      ]
    },
    {
      id: 'cil-bgp',
      title: 'Ch 10: BGP Control Plane',
      basics: {
        summary: "In production networks, Cilium can speak **BGP** with your routers. Nodes advertise Service IPs (or Pod ranges) as routes, so clients anywhere in the network can reach them. With equal-cost routes (**ECMP**) traffic spreads across several nodes, and failover is as fast as routing.",
        ideas: [
          "Enable with `bgpControlPlane.enabled=true`; configure it with three CRDs.",
          "**CiliumBGPClusterConfig**: which nodes peer, their ASN, and the peers.",
          "**CiliumBGPPeerConfig**: timers, address families, graceful restart, auth.",
          "**CiliumBGPAdvertisement**: what to announce (Service IPs, PodCIDRs, pools), linked by **labels**."
        ]
      },
      points: [
        "BGP Control Plane v2 (Cilium 1.16+) uses ClusterConfig/PeerConfig/Advertisement; the older `CiliumBGPPeeringPolicy` is deprecated.",
        "CiliumBGPClusterConfig: `nodeSelector`, `bgpInstances[]` with `localASN`, optional `localPort` (by default Cilium only dials out; set 179 to listen, which needs CAP_NET_BIND_SERVICE), and `peers[]` with `peerASN`, `peerAddress`, `peerConfigRef`.",
        "CiliumBGPPeerConfig: `timers` (connectRetry, keepAlive < holdTime, hold ≈ 3× keepalive; peers negotiate the lower value), `families` (afi ipv4/ipv6, safi unicast) with `advertisements.matchLabels`, `gracefulRestart` (peer keeps routes while the agent restarts, RFC 8538), `authSecretRef` for MD5 auth (recommended).",
        "CiliumBGPAdvertisement: `advertisementType` `Service` (with `service.addresses`: LoadBalancerIP, ClusterIP, ExternalIP, plus a label `selector`), `PodCIDR`, or `CiliumPodIPPool`. Optional `attributes` such as `localPreference` (iBGP, higher wins) and `communities` (tags with meaning only if routers use them).",
        "The advertisement's labels must match the peer config's `advertisements.matchLabels`; that's how routes are linked to peers.",
        "Advertise Services rather than Pods: Pod IPs change and offer no load balancing or health handling. PodCIDR advertisement is mainly for native routing (ch. 5).",
        "Check: `cilium bgp peers`, `cilium bgp routes advertised ipv4 unicast`, `cilium-dbg bgp peers/routes`; on the router: `vtysh -c 'show bgp summary'`, `ip route` (multiple next hops = ECMP).",
        "`externalTrafficPolicy: Local` makes only nodes with backends advertise a LoadBalancer IP. Compared with L2: scalable, fast failover, clients in any network, any routable IP, ECMP load balancing; needs BGP-capable routers and routing know-how."
      ],
      labs: [{
        title: 'Peer Cilium with an FRR router and advertise a Service',
        goal: 'kind cluster without kube-proxy (`kind-kpr.yaml`), plus an FRR container on the kind network acting as the upstream router.',
        steps: [
          ['Install Cilium with BGP, a pool, and an app with a LoadBalancer Service:', `helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set kubeProxyReplacement=true --set k8sServiceHost=kind-control-plane --set k8sServicePort=6443 \\
  --set bgpControlPlane.enabled=true
cilium status --wait
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumLoadBalancerIPPool
metadata: {name: pool}
spec: {blocks: [{cidr: 172.18.255.200/29}]}
EOF
kubectl create deploy httpd --image=httpd:2.4 --replicas=2
kubectl expose deploy httpd --type=LoadBalancer --port=80 && kubectl label svc httpd announcement=bgp`],
          ['Start FRR (AS 64512) peering with both workers:', `W1=$(docker inspect -f '{{.NetworkSettings.Networks.kind.IPAddress}}' kind-worker)
W2=$(docker inspect -f '{{.NetworkSettings.Networks.kind.IPAddress}}' kind-worker2)
mkdir -p frr && cd frr
printf 'bgpd=yes\\nvtysh_enable=yes\\nzebra_options=" -A 127.0.0.1 -s 90000000"\\nbgpd_options=" -A 127.0.0.1"\\n' > daemons
echo 'service integrated-vtysh-config' > vtysh.conf
cat > frr.conf <<EOF
router bgp 64512
 bgp router-id 172.18.255.254
 no bgp ebgp-requires-policy
 neighbor $W1 remote-as 64512
 neighbor $W2 remote-as 64512
 address-family ipv4 unicast
  neighbor $W1 activate
  neighbor $W2 activate
 exit-address-family
EOF
docker run -d --privileged --rm --net kind --name frr -v $PWD/frr.conf:/etc/frr/frr.conf \\
  -v $PWD/vtysh.conf:/etc/frr/vtysh.conf -v $PWD/daemons:/etc/frr/daemons quay.io/frrouting/frr:10.3.1
cd ..; FRR=$(docker inspect -f '{{.NetworkSettings.Networks.kind.IPAddress}}' frr); echo "FRR at $FRR"
docker exec frr vtysh -c "show bgp summary"`],
          ['Configure Cilium\'s side: cluster config, peer config and advertisement:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumBGPClusterConfig
metadata: {name: frr}
spec:
  nodeSelector:
    matchExpressions: [{key: node-role.kubernetes.io/control-plane, operator: DoesNotExist}]
  bgpInstances:
  - name: instance-64512
    localASN: 64512
    peers:
    - {name: frr, peerASN: 64512, peerAddress: $FRR, peerConfigRef: {name: peer-config}}
---
apiVersion: cilium.io/v2
kind: CiliumBGPPeerConfig
metadata: {name: peer-config}
spec:
  timers: {connectRetryTimeSeconds: 10, keepAliveTimeSeconds: 20, holdTimeSeconds: 60}
  gracefulRestart: {enabled: true, restartTimeSeconds: 15}
  families:
  - afi: ipv4
    safi: unicast
    advertisements: {matchLabels: {advertise: bgp}}
---
apiVersion: cilium.io/v2
kind: CiliumBGPAdvertisement
metadata: {name: services, labels: {advertise: bgp}}
spec:
  advertisements:
  - advertisementType: Service
    service: {addresses: [LoadBalancerIP]}
    selector: {matchLabels: {announcement: bgp}}
EOF
sleep 20; cilium bgp peers; cilium bgp routes advertised ipv4 unicast`],
          ['On the router: established sessions, an ECMP route, and a working request:', 'docker exec frr vtysh -c "show bgp summary"\ndocker exec frr ip route | grep -A2 172.18.255\nVIP=$(kubectl get svc httpd -o jsonpath=\'{.status.loadBalancer.ingress[0].ip}\')\ndocker exec frr wget -qO- $VIP']
        ],
        verify: 'Both sessions are `Established` with 1 prefix received each, FRR\'s route to the VIP has two next hops (both workers), and `wget` returns "It works!".',
        cleanup: 'docker rm -f frr; rm -rf frr; kind delete cluster'
      }],
      refs: [
        ['BGP Control Plane', 'https://docs.cilium.io/en/stable/network/bgp-control-plane/bgp-control-plane/'],
        ['BGP Control Plane configuration (v2)', 'https://docs.cilium.io/en/stable/network/bgp-control-plane/bgp-control-plane-v2/'],
        ['FRRouting documentation', 'https://docs.frrouting.org/en/latest/bgp.html']
      ],
      quiz: [
        { q: "Which CRD decides which prefixes (Service IPs, PodCIDRs) Cilium announces?",
          o: ["CiliumBGPAdvertisement", "CiliumBGPClusterConfig", "CiliumBGPPeerConfig", "CiliumLoadBalancerIPPool"],
          why: "ClusterConfig defines instances and peers; PeerConfig defines per-peer settings." },
        { q: "How is a CiliumBGPAdvertisement linked to a peer?",
          o: ["Its labels must match `families[].advertisements.matchLabels` in the CiliumBGPPeerConfig", "By sharing the same name", "Through the peer's IP address", "Automatically for all peers"],
          why: "Label selection keeps advertisements reusable across peers." },
        { q: "What does BGP graceful restart give you during a Cilium agent upgrade?",
          o: ["The router keeps the node's routes for a while, avoiding a traffic black hole", "Faster BGP convergence for new routes", "Encryption of BGP sessions", "Automatic failover to L2 announcements"],
          why: "The BGP session lives in the agent, so a restart would otherwise withdraw all routes." },
        { q: "FRR shows two next hops for a LoadBalancer IP. What does that give you?",
          o: ["ECMP: traffic is spread across both nodes", "A primary and an idle backup only", "Duplicate packets", "A routing loop"],
          why: "Equal-cost routes let the router load-balance, unlike L2 announcements." },
        { q: "Why does the book recommend advertising Services rather than Pod IPs to external clients?",
          o: ["Pod IPs change and give clients no load balancing or failure handling", "Pod IPs can't be advertised", "BGP doesn't support /32 routes", "Services are encrypted"],
          why: "PodCIDR advertisement is mainly for native routing inside your network." }
      ]
    },
    {
      id: 'cil-masq',
      title: 'Ch 11: Masquerading',
      basics: {
        summary: "Pod IPs are usually private and unknown outside the cluster, so replies from outside couldn't find their way back. By default Cilium **masquerades** traffic leaving the cluster: it swaps the Pod's IP for the **node's IP**. That fixes routing, but outside systems can no longer tell which Pod sent the traffic.",
        ideas: [
          "**Masquerading** = many-to-one source NAT to the node IP; on by default.",
          "Traffic to the node's own PodCIDR, or to `ipv4NativeRoutingCIDR`, is **not** masqueraded.",
          "Prefer **eBPF masquerading** (`bpf.masquerade=true`) over the iptables default.",
          "**ip-masq-agent** lets you list destinations that keep the Pod's source IP."
        ]
      },
      points: [
        "Disable per family with `enable-ipv4-masquerade: false` / `enable-ipv6-masquerade: false` (only if the network can route Pod IPs back).",
        "Destinations within `ipv4NativeRoutingCIDR` (or `ipv6NativeRoutingCIDR`) skip masquerading; that's why native routing and masquerading are linked (ch. 5).",
        "Modes: iptables (default, works on all kernels) or eBPF (`bpf.masquerade: true`, kernel 4.19+; more efficient and flexible, required by Egress Gateway). Check with `cilium-dbg status | grep Masquerading`.",
        "ip-masq-agent (`ipMasqAgent.enabled: true`) uses a default list of private/reserved ranges that are never masqueraded (`cilium-dbg bpf ipmasq list`). Override it with the `ip-masq-agent` ConfigMap in kube-system (`nonMasqueradeCIDRs`, `masqLinkLocal`).",
        "Danger: if you stop masquerading to destinations that have no route back to the Pod CIDR, replies get lost and connections hang. The SYN arrives with the Pod IP, but the SYN-ACK never returns.",
        "Trade-off: masquerading keeps connectivity simple, but firewalls and monitoring see only node IPs, so identity-based control at the network edge is lost. Egress Gateway (next topic) addresses this."
      ],
      labs: [{
        title: 'See masquerading, then break it on purpose',
        goal: 'kind cluster from the home page; an echo server container on the kind network plays the external system.',
        steps: [
          ['Default install; external echo server; check the source IP it sees:', `cilium install --version 1.18.4 && cilium status --wait
kubectl -n kube-system exec ds/cilium -c cilium-agent -- cilium-dbg status | grep Masquerading
docker run -d --rm --name echo-ext --net kind kicbase/echo-server:1.0
EXT=$(docker inspect -f '{{.NetworkSettings.Networks.kind.IPAddress}}' echo-ext)
kubectl run client --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker"}}' -- sleep infinity
kubectl wait --for=condition=Ready pod/client
kubectl exec client -- curl -s $EXT:8080 >/dev/null; docker logs echo-ext | tail -1
kubectl get node kind-worker -o jsonpath='{.status.addresses[0].address}'; echo`],
          ['Switch to eBPF masquerading with ip-masq-agent:', 'cilium upgrade --version 1.18.4 --set kubeProxyReplacement=true --set bpf.masquerade=true --set ipMasqAgent.enabled=true\ncilium status --wait; kubectl -n kube-system rollout restart ds/cilium; kubectl -n kube-system rollout status ds/cilium\nkubectl -n kube-system exec ds/cilium -c cilium-agent -- cilium-dbg status | grep Masquerading\nkubectl -n kube-system exec ds/cilium -c cilium-agent -- cilium-dbg bpf ipmasq list'],
          ['Exclude private ranges from masquerading and watch the reply get lost:', `cat <<EOF | kubectl -n kube-system apply -f -
apiVersion: v1
kind: ConfigMap
metadata: {name: ip-masq-agent}
data:
  config: |
    nonMasqueradeCIDRs: [10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16]
    masqLinkLocal: true
EOF
sleep 60; kubectl -n kube-system exec ds/cilium -c cilium-agent -- cilium-dbg bpf ipmasq list
docker run --rm --net container:echo-ext nicolaka/netshoot timeout 8 tcpdump -ni eth0 port 8080 -c 2 &
sleep 2; kubectl exec client -- curl -s -m4 $EXT:8080 || echo "HANGS: echo-ext has no route back to the Pod IP"`]
        ],
        verify: 'At first the echo server logs the node IP (`172.18.x.x`); after excluding 172.16.0.0/12, tcpdump shows a SYN from the Pod IP (`10.x.x.x`) and the curl times out.',
        cleanup: 'docker rm -f echo-ext; kind delete cluster'
      }],
      refs: [
        ['Masquerading', 'https://docs.cilium.io/en/stable/network/concepts/masquerading/'],
        ['Routing and ipv4NativeRoutingCIDR', 'https://docs.cilium.io/en/stable/network/concepts/routing/'],
        ['Kubernetes ip-masq-agent concepts', 'https://kubernetes.io/docs/tasks/administer-cluster/ip-masq-agent/']
      ],
      quiz: [
        { q: "What does Cilium do by default to Pod traffic leaving the cluster?",
          o: ["Masquerades it: the source IP becomes the node's IP", "Encrypts it", "Sends it through an egress gateway", "Drops it unless a policy allows it"],
          why: "External systems can route back to node IPs, but usually not to Pod IPs." },
        { q: "Which destinations are NOT masqueraded by default?",
          o: ["The node's own PodCIDR and anything inside `ipv4NativeRoutingCIDR`", "All private IP ranges", "Only the API server", "Everything outside the cluster"],
          why: "Those destinations can route Pod IPs, so translation isn't needed." },
        { q: "Why prefer `bpf.masquerade=true`?",
          o: ["It's more efficient and flexible than iptables, and Egress Gateway requires it", "It's the only mode that works on old kernels", "It encrypts traffic", "It disables NAT"],
          why: "iptables remains the default only because it works on every kernel." },
        { q: "You exclude `172.16.0.0/12` from masquerading and connections to a server at 172.18.0.7 now hang. Why?",
          o: ["The server receives the Pod's IP as the source but has no route back to the Pod network", "The server is down", "eBPF masquerading is broken", "DNS fails"],
          why: "Only skip masquerading when the destination can route to Pod IPs." },
        { q: "What is the main downside of masquerading?",
          o: ["External systems only see node IPs, so they can't tell which Pod or tenant sent the traffic", "It slows DNS", "It breaks Services", "It needs BGP"],
          why: "Egress Gateway restores a meaningful, predictable source IP." }
      ]
    },
    {
      id: 'cil-egress',
      title: 'Ch 11: Egress Gateway and Bandwidth Manager',
      basics: {
        summary: "**Egress Gateway** routes selected Pods' outbound traffic through chosen gateway nodes and gives it a **fixed, predictable source IP**, for example one per tenant, so firewalls and SaaS allow-lists can identify it. **Bandwidth Manager** caps how fast a Pod can send, using a simple annotation.",
        ideas: [
          "**CiliumEgressGatewayPolicy**: which Pods, which destinations, which gateway node and IP.",
          "Requires **KPR** and **eBPF masquerading**; enable with `egressGateway.enabled=true`.",
          "Traffic reaches the gateway node over **VXLAN** carrying the Pod's identity, even in native routing.",
          "Bandwidth: annotate a Pod with `kubernetes.io/egress-bandwidth: \"10M\"` once `bandwidthManager.enabled=true`."
        ]
      },
      points: [
        "Use cases: per-tenant egress IPs for auditing, restricting egress to trusted destinations, environment-specific egress paths, and static IPs for SaaS allow-lists (Snowflake, GitHub, Datadog…).",
        "Policy `selectors[]`: `podSelector`, `namespaceSelector` (by namespace labels), optional `nodeSelector` (source nodes). `destinationCIDRs` with optional `excludeCIDRs`.",
        "`egressGateway.nodeSelector` picks the gateway node; then `egressIP` (an address on that node) **or** `interface`, never both (a policy with both is ignored). With neither, the first IP of the default-route interface is used.",
        "Helm: `kubeProxyReplacement: true`, `egressGateway.enabled: true`, `bpf.masquerade: true` (and often `devices`).",
        "Inspect: `cilium-dbg bpf egress list` shows source Pod IP, destination CIDR, gateway IP, and egress IP (`0.0.0.0` on nodes that aren't the gateway).",
        "Traffic not matching `destinationCIDRs` uses normal masquerading. The selected gateway node is a single point of failure in open-source Cilium (no HA failover; Isovalent Enterprise adds it).",
        "Bandwidth Manager: `bandwidthManager.enabled: true`; status shows `EDT with BPF`. Enforces limits per Pod at the node's physical interface using Earliest Departure Time. Egress limits are effective; `kubernetes.io/ingress-bandwidth` acts after traffic already crossed the wire.",
        "Bandwidth Manager doesn't work in kind (needs host sysctls in `/proc/sys/net/core`); use VMs, bare metal or a cloud cluster. netperf `TCP_MAERTS` measures server-to-client throughput."
      ],
      labs: [
        {
          title: 'Give each tenant its own egress IP',
          goal: 'kind cluster with two app workers and two gateway workers, no kube-proxy.',
          steps: [
            ['Cluster with 4 workers; keep apps off the gateway nodes and add an egress IP to each:', `cat > kind-egress.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes: [{role: control-plane}, {role: worker}, {role: worker}, {role: worker}, {role: worker}]
networking: {disableDefaultCNI: true, kubeProxyMode: "none"}
EOF
kind create cluster --config kind-egress.yaml
for n in kind-worker3 kind-worker4; do kubectl taint node $n egress-gw=true:NoSchedule; done
docker exec kind-worker3 ip addr add 172.18.0.100/16 dev eth0
docker exec kind-worker4 ip addr add 172.18.0.101/16 dev eth0
kubectl label node kind-worker3 egress-gw=hr; kubectl label node kind-worker4 egress-gw=sales`],
            ['Install Cilium with Egress Gateway, plus an external echo server:', `helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set kubeProxyReplacement=true --set k8sServiceHost=kind-control-plane --set k8sServicePort=6443 \\
  --set egressGateway.enabled=true --set bpf.masquerade=true --set devices=eth0
cilium status --wait
docker run -d --rm --name echo-ext --net kind kicbase/echo-server:1.0
EXT=$(docker inspect -f '{{.NetworkSettings.Networks.kind.IPAddress}}' echo-ext)`],
            ['Tenants and one policy each:', `for t in hr sales; do kubectl create ns $t; kubectl label ns $t name=$t; kubectl -n $t run client --image=nicolaka/netshoot -- sleep infinity; done
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumEgressGatewayPolicy
metadata: {name: hr-egress}
spec:
  destinationCIDRs: ["172.18.0.0/16"]
  selectors: [{namespaceSelector: {matchLabels: {name: hr}}}]
  egressGateway: {nodeSelector: {matchLabels: {egress-gw: hr}}, egressIP: 172.18.0.100}
---
apiVersion: cilium.io/v2
kind: CiliumEgressGatewayPolicy
metadata: {name: sales-egress}
spec:
  destinationCIDRs: ["172.18.0.0/16"]
  selectors: [{namespaceSelector: {matchLabels: {name: sales}}}]
  egressGateway: {nodeSelector: {matchLabels: {egress-gw: sales}}, egressIP: 172.18.0.101}
EOF
kubectl -n hr wait --for=condition=Ready pod/client; kubectl -n sales wait --for=condition=Ready pod/client`],
            ['Call the external server from each tenant and from `default`:', `kubectl -n hr exec client -- curl -s $EXT:8080 >/dev/null
kubectl -n sales exec client -- curl -s $EXT:8080 >/dev/null
kubectl run plain --image=nicolaka/netshoot --rm -it --restart=Never -- curl -s $EXT:8080 >/dev/null
docker logs echo-ext | tail -3
kubectl -n kube-system exec ds/cilium -c cilium-agent -- cilium-dbg bpf egress list`]
          ],
          verify: 'The echo server logs `172.18.0.100` for hr, `172.18.0.101` for sales, and a plain node IP for the `default` Pod; `bpf egress list` shows both policies.',
          cleanup: 'docker rm -f echo-ext; kind delete cluster'
        },
        {
          title: 'Rate-limit a Pod with Bandwidth Manager',
          tags: ['cloud'],
          goal: 'Needs real VMs or a cloud cluster (e.g. AKS in BYOCNI mode, as in the Geneve lab); kind can\'t enforce bandwidth.',
          steps: [
            ['Enable it and confirm:', 'helm upgrade cilium cilium/cilium -n kube-system --version 1.18.4 --reuse-values --set bandwidthManager.enabled=true\nkubectl -n kube-system rollout restart ds/cilium && kubectl -n kube-system rollout status ds/cilium\nkubectl -n kube-system exec ds/cilium -- cilium-dbg status | grep BandwidthManager'],
            ['netperf server and client on different nodes, baseline throughput:', `kubectl run netperf-server --image=cilium/netperf --labels=app=netperf-server
kubectl run netperf-client --image=cilium/netperf --overrides='{"spec":{"affinity":{"podAntiAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":[{"labelSelector":{"matchLabels":{"app":"netperf-server"}},"topologyKey":"kubernetes.io/hostname"}]}}}}' -- sleep infinity
kubectl wait --for=condition=Ready pod/netperf-server pod/netperf-client
S=$(kubectl get pod netperf-server -o jsonpath='{.status.podIP}')
kubectl exec netperf-client -- netperf -t TCP_MAERTS -H $S | tail -1`],
            ['Limit the server\'s egress to 10 Mbit/s and measure again:', 'kubectl annotate pod netperf-server kubernetes.io/egress-bandwidth=10M\nsleep 5; kubectl exec netperf-client -- netperf -t TCP_MAERTS -H $S | tail -1']
          ],
          verify: 'Throughput drops from several Gbit/s to just under 10 Mbit/s after the annotation.',
          cleanup: 'kubectl delete pod netperf-server netperf-client; delete the cloud cluster when done'
        }
      ],
      refs: [
        ['Egress Gateway', 'https://docs.cilium.io/en/stable/network/egress-gateway/egress-gateway/'],
        ['Bandwidth Manager', 'https://docs.cilium.io/en/stable/network/kubernetes/bandwidth-manager/'],
        ['Masquerading', 'https://docs.cilium.io/en/stable/network/concepts/masquerading/']
      ],
      quiz: [
        { q: "What does Egress Gateway give you that plain masquerading doesn't?",
          o: ["A predictable, per-workload source IP via chosen gateway nodes", "Encryption of egress traffic", "Load balancing of egress across all nodes", "Faster DNS"],
          why: "Firewalls and SaaS allow-lists can then identify the tenant or app." },
        { q: "Which two features must be enabled for Egress Gateway?",
          o: ["kube-proxy replacement and eBPF masquerading", "Hubble and BGP", "IPv6 and native routing", "Cluster Mesh and WireGuard"],
          why: "Plus `egressGateway.enabled=true`." },
        { q: "A CiliumEgressGatewayPolicy sets both `egressIP` and `interface`. What happens?",
          o: ["Cilium ignores the policy", "egressIP wins", "interface wins", "Both IPs are used alternately"],
          why: "They are mutually exclusive." },
        { q: "How does traffic travel from a Pod's node to the egress gateway node in a natively routed cluster?",
          o: ["Over VXLAN, with the Pod's identity in the VNI", "Natively routed, unencapsulated", "Through Envoy", "Through the API server"],
          why: "The tunnel preserves identity for consistent policy enforcement." },
        { q: "Why does the book's Bandwidth Manager lab not run on kind?",
          o: ["Enforcement needs global host sysctls that nested kind network namespaces can't access", "kind doesn't support annotations", "netperf isn't available for kind", "Bandwidth Manager needs BGP"],
          why: "Use VMs, bare metal or a managed cloud cluster instead." }
      ]
    }
  ]
});
