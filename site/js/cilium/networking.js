// Part 2: chapters 4-6. Quiz format: the FIRST option is correct; options are shuffled when shown.
COURSE.addDomain({
  id: 'networking', title: 'Core networking (ch. 4–6)', weight: 19,
  topics: [
    {
      id: 'cil-ipam',
      title: 'Ch 4: IP address management (IPAM) modes',
      basics: {
        summary: "Every Pod needs an IP address. **IPAM** decides where those addresses come from: Kubernetes' per-node ranges, ranges the Cilium operator hands out, several named pools, or (on AWS) the cloud network itself. Choose carefully: **changing the IPAM mode later disrupts running workloads**.",
        ideas: [
          "**Kubernetes Host Scope**: use the PodCIDR Kubernetes gives each node. Simple, but fixed.",
          "**Cluster Scope** (`cluster-pool`, the default): the operator assigns each node a range from Cilium's own pool.",
          "**Multi-Pool**: several pools, picked per namespace or Pod, grown on demand. The most flexible and recommended.",
          "**ENI** (AWS EKS): Pods get real VPC addresses from the node's network interfaces, so no NAT is needed."
        ]
      },
      points: [
        "Each node gets one or more PodCIDRs; Pods on that node get IPs from them. Two addresses per node go to Cilium's `cilium_host` (router) and health endpoint.",
        "Kubernetes Host Scope (`ipam.mode: kubernetes`): ranges come from the controller manager (`node.spec.podCIDRs`). You can't change the per-node size or add ranges later.",
        "Cluster Scope (`ipam.mode: cluster-pool`): defaults to `10.0.0.0/8` split into `/24`s; set `ipam.operator.clusterPoolIPv4PodCIDRList` and `clusterPoolIPv4MaskSize`. Ranges are recorded in CiliumNode objects. The pool is still static, so running out means redeploying.",
        "Signs of exhaustion: Pods stuck in `ContainerCreating`; `cilium-dbg status` shows `IPv4: 6/6 allocated`.",
        "Multi-Pool (`ipam.mode: multi-pool`): `CiliumPodIPPool` objects (`cilium.io/v2alpha1`) with `cidrs` and `maskSize`; `autoCreateCiliumPodIPPools.default` creates the default pool. Annotate a namespace (or Pod) with `ipam.cilium.io/ip-pool=<pool>`. Nodes request more blocks as they need them (see `spec.ipam.pools.requested/allocated` on the CiliumNode).",
        "Pool selection by namespace helps identify a tenant's traffic, but Pods can request a pool themselves, so it isn't an isolation boundary.",
        "ENI mode (`ipam.mode: eni`, `eni.enabled: true`): IPs are secondary addresses on AWS ENIs, routable in the VPC and compatible with security groups. Pod density is limited by instance type (e.g. m5.large: 3 ENIs × 10 IPs ≈ 30 Pods); prefix delegation (/28 per ENI) raises it. No IPv6 support for ENI mode.",
        "Other modes exist (e.g. CRD-backed, where an external operator manages IPs and routing). In clouds with a pre-installed CNI, the `node.cilium.io/agent-not-ready` taint keeps Pods off a node until Cilium is ready."
      ],
      labs: [{
        title: 'Compare Cluster Scope and Multi-Pool, and run out of IPs on purpose',
        goal: 'Each step uses a fresh kind cluster from the home page; IPAM mode can\'t be changed in place.',
        steps: [
          ['Cluster Scope with deliberately tiny pools (two /28s split into /29s = 6 usable IPs per node):', `kind create cluster --config kind.yaml
helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set ipam.mode=cluster-pool \\
  --set ipam.operator.clusterPoolIPv4PodCIDRList='{10.0.42.0/28,10.0.84.0/28}' \\
  --set ipam.operator.clusterPoolIPv4MaskSize=29
cilium status --wait
kubectl get ciliumnodes -o custom-columns=NODE:.metadata.name,CIDR:.spec.ipam.podCIDRs`],
          ['Exhaust one node:', `kubectl create deploy many --image=nginx --replicas=10
kubectl patch deploy many -p '{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/hostname":"kind-worker2"}}}}}'
sleep 30; kubectl get pods -o wide | grep -c ContainerCreating
CIL=$(kubectl -n kube-system get pod -l k8s-app=cilium --field-selector spec.nodeName=kind-worker2 -o name)
kubectl -n kube-system exec $CIL -- cilium-dbg status | grep IPAM`],
          ['Rebuild with Multi-Pool and one pool per tenant namespace:', `kind delete cluster && kind create cluster --config kind.yaml
helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set ipam.mode=multi-pool --set routingMode=native --set autoDirectNodeRoutes=true \\
  --set ipv4NativeRoutingCIDR=10.0.0.0/8 --set endpointRoutes.enabled=true \\
  --set ipam.operator.autoCreateCiliumPodIPPools.default.ipv4.cidrs='{10.10.0.0/16}' \\
  --set ipam.operator.autoCreateCiliumPodIPPools.default.ipv4.maskSize=27
cilium status --wait
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2alpha1
kind: CiliumPodIPPool
metadata: {name: acme-pool}
spec: {ipv4: {cidrs: [10.20.0.0/16], maskSize: 27}}
EOF
kubectl create ns acme && kubectl annotate ns acme ipam.cilium.io/ip-pool=acme-pool`],
          ['Deploy, scale, and watch the node request more blocks:', `kubectl -n acme create deploy web --image=nginx --replicas=10
kubectl -n acme get pods -o wide | awk 'NR>1{print $6}' | sort | head -3
kubectl -n acme scale deploy web --replicas=40
sleep 30; kubectl get ciliumnode kind-worker -o jsonpath='{.spec.ipam.pools}' | jq`]
        ],
        verify: 'In Cluster Scope several Pods stay `ContainerCreating` and IPAM shows `6/6 allocated`; in Multi-Pool the `acme` Pods get `10.20.x.x` addresses and nodes receive extra `/27` blocks as you scale.',
        cleanup: 'kind delete cluster'
      }],
      refs: [
        ['IP address management (IPAM)', 'https://docs.cilium.io/en/stable/network/concepts/ipam/'],
        ['Cluster Scope (default) IPAM', 'https://docs.cilium.io/en/stable/network/concepts/ipam/cluster-pool/'],
        ['Multi-Pool IPAM', 'https://docs.cilium.io/en/stable/network/concepts/ipam/multi-pool/'],
        ['AWS ENI IPAM', 'https://docs.cilium.io/en/stable/network/concepts/ipam/eni/']
      ],
      quiz: [
        { q: "Which IPAM mode is Cilium's default?",
          o: ["Cluster Scope (`cluster-pool`)", "Kubernetes Host Scope", "Multi-Pool", "ENI"],
          why: "It needs no special Kubernetes configuration; the operator assigns ranges from Cilium's own pool." },
        { q: "What is the main limitation of Kubernetes Host Scope mode?",
          o: ["You can't change per-node range sizes or add ranges once the cluster runs", "It only supports IPv6", "It only works on AWS", "It requires BGP"],
          why: "The ranges come from Kubernetes' controller manager and are fixed." },
        { q: "How do you make every Pod in namespace `acme` get IPs from pool `acme-pool` in Multi-Pool mode?",
          o: ["Annotate the namespace with `ipam.cilium.io/ip-pool=acme-pool`", "Label each node with the pool name", "Create a NetworkPolicy", "Set `ipam.mode=acme-pool`"],
          why: "Pods can also request a pool with the same annotation, so it's not an isolation mechanism." },
        { q: "Several Pods on one node are stuck in `ContainerCreating` and `cilium-dbg status` shows `IPv4: 6/6 allocated`. What's wrong?",
          o: ["The node's PodCIDR has run out of addresses", "The image can't be pulled", "kube-proxy is down", "The Pods fail their readiness probe"],
          why: "With a static pool (Cluster Scope) you can't grow it in place; Multi-Pool allocates more blocks on demand." },
        { q: "What is a key benefit of ENI IPAM mode on EKS?",
          o: ["Pod IPs are real VPC addresses, routable without NAT", "Unlimited Pods per node", "Full IPv6 support", "It works on any cloud"],
          why: "The trade-off is Pod density limited by the instance's ENI and IP capacity (prefix delegation helps)." }
      ]
    },
    {
      id: 'cil-ipv6',
      title: 'Ch 4: IPv6 and dual-stack clusters',
      basics: {
        summary: "Besides where addresses come from, you choose **which IP version**: IPv4 only, **dual stack** (every Pod and Service gets both), or **IPv6 only**. Cilium supports all three. IPv6 is turned off by default and you enable it in the Helm values.",
        ideas: [
          "**IPv4 only**: the safe default, but doesn't future-proof you.",
          "**Dual stack**: a transition step; both versions work, at the cost of more complexity.",
          "**IPv6 only**: for greenfield setups; reaching IPv4-only services needs **NAT64/DNS64**.",
          "Enable with `ipv6.enabled=true`; for IPv6 only, also set `ipv4.enabled=false`."
        ]
      },
      points: [
        "Cilium began as IPv6-only; IPv4 was added because the ecosystem wasn't ready. Most features support IPv6 (ENI mode is a notable exception).",
        "Decision factors: your organisation's IPv6 strategy (some public sectors mandate it), operational readiness (monitoring and tooling must be IPv6-aware), and ecosystem gaps (some registries and services are IPv4-only).",
        "NAT64 translates IPv6 traffic to IPv4 at the edge; DNS64 creates AAAA records from A records so IPv6 clients can resolve IPv4-only names.",
        "kind dual stack: `networking.ipFamily: dual`; nodes get both an IPv4 and an IPv6 InternalIP, and PodCIDRs come in pairs (e.g. `10.244.1.0/24,fd00:10:244:1::/64`).",
        "Services choose families with `ipFamilyPolicy` (`SingleStack`, `PreferDualStack`, `RequireDualStack`) and `ipFamilies` (order matters: the first is the primary ClusterIP).",
        "Test both stacks: `curl -4` / `curl -6`, `ping6`, `nslookup -q=AAAA <svc>`.",
        "In 1.18, IPv6 Pod traffic in a dual-stack VXLAN cluster is carried inside an IPv4 tunnel; an IPv6 underlay for dual stack arrives in 1.19.",
        "IPv6 only: `ipv6.enabled: true`, `ipv4.enabled: false`, usually native routing with `ipv6NativeRoutingCIDR`. In production use your organisation's global IPv6 space for Pods (huge: a /116 per node is 4,000+ Pods) and unique local addresses for Services; `2001:db8::/32` is for documentation only."
      ],
      labs: [{
        title: 'Run a dual-stack cluster and reach a Service over both IP versions',
        goal: 'Needs a Linux host with IPv6 enabled for Docker. On macOS, add `apiServerAddress: 127.0.0.1` under `networking` in the kind config.',
        steps: [
          ['Dual-stack kind cluster and Cilium with IPv6 on:', `cat > kind-dual.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes: [{role: control-plane}, {role: worker}, {role: worker}]
networking:
  disableDefaultCNI: true
  ipFamily: dual
EOF
kind create cluster --config kind-dual.yaml
helm install cilium cilium/cilium -n kube-system --version 1.18.4 --set ipv6.enabled=true --set ipam.mode=kubernetes
cilium status --wait
kubectl describe nodes | grep PodCIDRs`],
          ['Two Pods on different nodes; ping over IPv6:', `kubectl run pod-a --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker"}}' -- sleep infinity
kubectl run pod-b --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker2"}}' -- sleep infinity
kubectl wait --for=condition=Ready pod/pod-a pod/pod-b
B6=$(kubectl get pod pod-b -o jsonpath='{.status.podIPs[1].ip}'); echo $B6
kubectl exec pod-a -- ping6 -c 2 $B6`],
          ['A dual-stack Service, IPv6 first:', `kubectl create deploy echo --image=nginx --replicas=3
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata: {name: echo}
spec:
  ipFamilyPolicy: PreferDualStack
  ipFamilies: [IPv6, IPv4]
  selector: {app: echo}
  ports: [{port: 80}]
EOF
kubectl get svc echo -o jsonpath='{.spec.clusterIPs}'; echo`],
          ['Reach it over both versions:', 'kubectl exec pod-a -- nslookup -q=AAAA echo\nkubectl exec pod-a -- curl -s -o /dev/null -w "IPv4 %{http_code}\\n" -4 http://echo\nkubectl exec pod-a -- curl -s -o /dev/null -w "IPv6 %{http_code}\\n" -6 http://echo']
        ],
        verify: 'Each Pod has two IPs, the IPv6 ping succeeds, the Service has an IPv6 and an IPv4 ClusterIP, and both curls print `200`.',
        cleanup: 'kind delete cluster'
      }],
      refs: [
        ['IPv6 and dual stack in Cilium (IPAM)', 'https://docs.cilium.io/en/stable/network/concepts/ipam/'],
        ['Kubernetes: IPv4/IPv6 dual-stack', 'https://kubernetes.io/docs/concepts/services-networking/dual-stack/'],
        ['kind: IPv6 and dual-stack configuration', 'https://kind.sigs.k8s.io/docs/user/configuration/#ip-family'],
        ['RFC 6146: NAT64', 'https://www.rfc-editor.org/rfc/rfc6146']
      ],
      quiz: [
        { q: "How do you turn on IPv6 in Cilium?",
          o: ["Set `ipv6.enabled=true` in the Helm values", "It's on by default", "Install a separate IPv6 plugin", "Set `ipam.mode=ipv6`"],
          why: "IPv4 is on by default; for IPv6 only, also set `ipv4.enabled=false`." },
        { q: "In a dual-stack cluster, what does each Pod get?",
          o: ["One IPv4 and one IPv6 address", "Only an IPv6 address", "Two IPv4 addresses", "An IPv6 address translated from IPv4"],
          why: "That lets Pods talk to IPv6 systems and to IPv4-only applications." },
        { q: "An IPv6-only cluster must reach an IPv4-only registry. What helps?",
          o: ["NAT64 together with DNS64", "Dual-stack Services", "VXLAN encapsulation", "Multi-Pool IPAM"],
          why: "DNS64 synthesises AAAA records; NAT64 translates the traffic to IPv4 at the edge." },
        { q: "A Service has `ipFamilyPolicy: PreferDualStack` and `ipFamilies: [IPv6, IPv4]`. What is `spec.clusterIP`?",
          o: ["The IPv6 address, because IPv6 is listed first", "The IPv4 address, always", "Empty; dual-stack Services have no ClusterIP", "A random one of the two"],
          why: "The first family in `ipFamilies` is the primary; `clusterIPs` lists both." },
        { q: "Which IPAM mode does NOT support IPv6 in Cilium?",
          o: ["ENI", "Kubernetes Host Scope", "Cluster Scope", "Multi-Pool"],
          why: "IPv6 ENIs are not supported yet." }
      ]
    },
    {
      id: 'cil-intranode',
      title: 'Ch 5: The datapath, traffic on one node',
      basics: {
        summary: "Each Pod has its own **network namespace**, connected to the node by a **veth pair**: `eth0` inside the Pod, an `lxc…` device on the node. Cilium attaches eBPF programs to the node side, so every packet leaving a Pod is checked and forwarded right there, before the rest of the network stack.",
        ideas: [
          "**Network namespace**: a Pod's private copy of interfaces, routes and firewall rules.",
          "**veth pair**: `eth0@ifN` in the Pod ↔ `lxcXXXX@ifM` on the host.",
          "**`cil_from_container`** runs on the host side of each Pod's veth as packets leave the Pod.",
          "Pod-to-Pod on the same node is **never encapsulated**."
        ]
      },
      points: [
        "Inside a Pod, the address is a `/32` and the default route points to the node's `cilium_host` address (the Pod's gateway).",
        "Match the veth ends by index: `eth0@if24` in the Pod pairs with interface 24 on the host, shown as `lxc…@if23`.",
        "Devices Cilium creates on each node: `cilium_host` and `cilium_net` (a veth pair linking host and datapath), `cilium_vxlan` or `cilium_geneve` (tunnel device, used only between nodes), `lxc_health` (health endpoint), and one `lxc*` per Pod.",
        "`bpftool net show` (inside the agent container) lists attached programs: `cil_from_netdev` on `eth0`, `cil_to_host`/`cil_from_host` on `cilium_host`, `cil_from_overlay`/`cil_to_overlay` on the tunnel device, and `cil_from_container` on each `lxc*` (tcx ingress = traffic leaving the Pod).",
        "Unlike bridge- or iptables-based CNIs, the forwarding decision (identity, policy, conntrack lookups in eBPF maps) happens at the earliest point.",
        "Prove the path with `tcpdump -i <lxc of destination Pod>` on the node.",
        "`pwru` (\"packet, where are you?\") is an eBPF tool from the Cilium project that traces a packet through the kernel.",
        "netkit (Cilium 1.16+, Linux 6.7+) can replace veth and run the eBPF program inside the Pod's namespace for near-host performance (ch. 8)."
      ],
      labs: [{
        title: 'Trace a packet between two Pods on the same node',
        goal: 'Default kind cluster with `cilium install --version 1.18.4`.',
        steps: [
          ['Two Pods on the same node:', `kubectl run pod-a --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker"}}' -- sleep infinity
kubectl run pod-b --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker"}}' -- sleep infinity
kubectl wait --for=condition=Ready pod/pod-a pod/pod-b
kubectl get pods -o wide`],
          ['Inside pod-a: its /32 address, the peer index, and the gateway:', 'kubectl exec pod-a -- ip -br address show eth0\nkubectl exec pod-a -- ip route'],
          ['On the node: find the matching `lxc` device and the `cilium_host` gateway:', `IDX=$(kubectl exec pod-a -- cat /sys/class/net/eth0/iflink); echo "host-side index: $IDX"
docker exec kind-worker ip -br link | grep "^lxc"
docker exec kind-worker ip -br address show cilium_host`],
          ['See the eBPF programs attached to those devices:', 'CIL=$(kubectl -n kube-system get pod -l k8s-app=cilium --field-selector spec.nodeName=kind-worker -o name)\nkubectl -n kube-system exec $CIL -c cilium-agent -- bpftool net show | head -20'],
          ['Capture the ping on pod-b\'s host-side device:', `B=$(kubectl get pod pod-b -o jsonpath='{.status.podIP}')
BIDX=$(kubectl exec pod-b -- cat /sys/class/net/eth0/iflink)
LXC=$(docker exec kind-worker ip -o link | awk -F': ' -v i=$BIDX '$1==i{print $2}' | cut -d@ -f1)
docker exec -d kind-worker timeout 10 tcpdump -ni $LXC icmp -c 4 -w /tmp/p.pcap
kubectl exec pod-a -- ping -c 2 $B
sleep 2; docker exec kind-worker tcpdump -nr /tmp/p.pcap`]
        ],
        verify: 'pod-a\'s default route points at the `cilium_host` address, its peer index matches an `lxc…` device on the node, and tcpdump shows the echo request and reply on pod-b\'s `lxc` device with plain Pod IPs (no tunnel headers).',
        cleanup: 'kubectl delete pod pod-a pod-b --now'
      }],
      refs: [
        ['eBPF datapath', 'https://docs.cilium.io/en/stable/network/ebpf/intro/'],
        ['Life of a packet', 'https://docs.cilium.io/en/stable/network/ebpf/lifeofapacket/'],
        ['pwru: packet, where are you?', 'https://github.com/cilium/pwru'],
        ['Kubernetes cluster networking model', 'https://kubernetes.io/docs/concepts/cluster-administration/networking/']
      ],
      quiz: [
        { q: "How is a Pod's network namespace connected to the node?",
          o: ["A veth pair: `eth0` in the Pod, `lxc…` on the host", "A Linux bridge called docker0", "A VXLAN tunnel", "Directly on the node's eth0"],
          why: "Cilium attaches its eBPF program to the host-side `lxc` end." },
        { q: "What is the default gateway inside a Cilium-managed Pod?",
          o: ["The node's `cilium_host` address", "The node's eth0 address", "The Service CIDR", "There is no default route"],
          why: "Traffic leaves the Pod toward `cilium_host`, where the datapath takes over." },
        { q: "Is traffic between two Pods on the same node encapsulated in VXLAN?",
          o: ["No; it never leaves the node, so no tunnel is used", "Yes, always", "Only with IPv6", "Only when policy is enabled"],
          why: "`cilium_vxlan` is only for traffic to other nodes." },
        { q: "Which eBPF program processes packets as they leave a Pod?",
          o: ["`cil_from_container` on the Pod's host-side `lxc` device", "`cil_from_netdev` on eth0", "`cil_to_overlay` on cilium_vxlan", "`cil_to_host` on cilium_net"],
          why: "tcx ingress on the host-side veth = egress from the Pod's point of view." },
        { q: "Which tool lists the eBPF programs attached to network devices?",
          o: ["`bpftool net show`", "`ip route show`", "`iptables -L`", "`kubectl get ebpf`"],
          why: "Run it inside the agent container (`-c cilium-agent`), or use `cilium-dbg`." }
      ]
    },
    {
      id: 'cil-internode',
      title: 'Ch 5: The datapath, native routing vs encapsulation',
      basics: {
        summary: "To reach a Pod on another node, the network must know where that Pod's range lives. With **native routing**, the nodes or the network carry routes to every Pod range. With **encapsulation** (the default), Cilium wraps Pod packets in VXLAN or Geneve between nodes, so the network only sees node-to-node traffic.",
        ideas: [
          "**Native routing**: fastest, no extra headers; needs routes via auto-direct node routes, static routes or **BGP**.",
          "**Encapsulation** (VXLAN UDP 8472, Geneve UDP 6081): works on any network that connects the nodes.",
          "Encapsulation costs about **50 bytes per packet** (lower MTU).",
          "Cilium puts the **source identity** in the tunnel's VNI field, so the receiver can apply policy without a lookup."
        ]
      },
      points: [
        "Kubernetes rule: every Pod reaches every Pod by IP, without NAT; the source IP is seen unchanged.",
        "Native routing: `routingMode: native` plus `ipv4NativeRoutingCIDR` (the range the network can route; no masquerading inside it). The host's routing table forwards Pod traffic.",
        "Ways to spread routes: `autoDirectNodeRoutes: true` (nodes must share an L2 network; Cilium adds `<podCIDR> via <nodeIP>` routes), static `ip route add` (tiny labs only), or BGP advertising `PodCIDR` (`CiliumBGPAdvertisement`, ch. 10).",
        "Encapsulation (`routingMode: tunnel`, default) with `tunnelProtocol: vxlan` (default) or `geneve`. Host routes send remote PodCIDRs to `cilium_host`; the datapath wraps them and sends them out of `cilium_vxlan`/`cilium_geneve`.",
        "VXLAN packet: outer IP (node → node), outer UDP 8472 (Cilium's default, not IANA's 4789), VXLAN header whose VNI carries the source security identity, then the untouched inner Pod packet.",
        "Geneve: same idea on UDP 6081 plus optional TLV metadata fields (used, for example, by DSR with Geneve). The VNI also carries the identity: check it with `kubectl get ciliumid <decimal VNI>`.",
        "`cilium-dbg bpf ipcache list` maps each remote PodCIDR to its `tunnelendpoint` (node IP).",
        "Trade-off: encapsulation is simplest and portable (clouds, networks you don't control); native routing gives better performance and visibility of real Pod IPs in the network."
      ],
      labs: [
        {
          title: 'See VXLAN encapsulation on the wire',
          goal: 'Default kind cluster with `cilium install --version 1.18.4` (VXLAN tunnel mode).',
          steps: [
            ['Routes to remote PodCIDRs point to `cilium_host`:', 'docker exec kind-worker ip route | grep cilium_host'],
            ['Two Pods on different nodes:', `kubectl run a --image=nicolaka/netshoot --overrides='{"spec":{"nodeName":"kind-worker"}}' -- sleep infinity
kubectl run b --image=nginx --overrides='{"spec":{"nodeName":"kind-worker2"}}'
kubectl wait --for=condition=Ready pod/a pod/b`],
            ['Capture on the node\'s eth0 while curling across nodes:', `B=$(kubectl get pod b -o jsonpath='{.status.podIP}')
docker exec -d kind-worker timeout 8 tcpdump -ni eth0 udp port 8472 -c 6 -w /tmp/vx.pcap
kubectl exec a -- curl -s -o /dev/null $B
sleep 3; docker exec kind-worker tcpdump -nr /tmp/vx.pcap -v | head -12`],
            ['Find the identity carried in the tunnel and look it up:', 'kubectl get ciliumendpoint a -o jsonpath=\'{.status.identity.id}\'; echo\nkubectl -n kube-system exec ds/cilium -- cilium-dbg bpf ipcache list | head']
          ],
          verify: 'tcpdump shows outer node IPs on UDP 8472 wrapping an inner packet between the two Pod IPs, and the ipcache lists each remote PodCIDR with a `tunnelendpoint`.',
          cleanup: 'kubectl delete pod a b --now'
        },
        {
          title: 'Switch to native routing with auto-direct node routes',
          goal: 'Fresh kind cluster; the routing mode is chosen at install time.',
          steps: [
            ['Install in native routing mode:', `kind delete cluster; kind create cluster --config kind.yaml
helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set routingMode=native --set autoDirectNodeRoutes=true \\
  --set ipv4NativeRoutingCIDR=10.0.0.0/8 --set ipam.mode=cluster-pool
cilium status --wait`],
            ['Each node now routes other nodes\' PodCIDRs straight to their node IPs:', 'kubectl get ciliumnodes -o custom-columns=NODE:.metadata.name,CIDR:.spec.ipam.podCIDRs,IP:.spec.addresses[0].ip\ndocker exec kind-worker ip route | grep "via 172"'],
            ['No tunnel device, no UDP 8472:', 'docker exec kind-worker ip link show cilium_vxlan || echo "no cilium_vxlan: native routing"']
          ],
          verify: 'Routes like `10.0.2.0/24 via 172.18.0.x dev eth0` appear, and there is no `cilium_vxlan` device.',
          cleanup: 'kind delete cluster'
        }
      ],
      refs: [
        ['Routing (encapsulation and native routing)', 'https://docs.cilium.io/en/stable/network/concepts/routing/'],
        ['Cilium ports and firewall requirements', 'https://docs.cilium.io/en/stable/operations/system_requirements/#firewall-rules'],
        ['BGP Control Plane', 'https://docs.cilium.io/en/stable/network/bgp-control-plane/bgp-control-plane/'],
        ['RFC 8926: Geneve', 'https://www.rfc-editor.org/rfc/rfc8926']
      ],
      quiz: [
        { q: "What is Cilium's default routing mode?",
          o: ["Encapsulation (tunnel) with VXLAN", "Native routing", "BGP", "Static routes"],
          why: "It works anywhere nodes can reach each other, without changing the network." },
        { q: "Which UDP port does Cilium use by default for VXLAN?",
          o: ["8472", "4789", "6081", "179"],
          why: "4789 is IANA's VXLAN port; 6081 is Geneve; 179 is BGP." },
        { q: "What does Cilium put in the VXLAN/Geneve VNI field?",
          o: ["The source endpoint's security identity", "The destination Pod's IP", "The namespace name", "A random tenant ID"],
          why: "The receiving node can enforce policy without looking up the identity." },
        { q: "What does `autoDirectNodeRoutes: true` require?",
          o: ["All nodes on the same layer 2 network", "A BGP router", "IPv6", "An external load balancer"],
          why: "Cilium installs routes with other nodes' IPs as next hops, so they must be directly reachable." },
        { q: "What is the main cost of encapsulation?",
          o: ["About 50 extra bytes per packet, reducing the effective MTU", "It can't cross subnets", "It disables network policy", "Pods lose their identities"],
          why: "For performance-sensitive clusters, native routing is preferred where possible." }
      ]
    },
    {
      id: 'cil-kpr',
      title: 'Ch 6: Service networking and kube-proxy replacement',
      basics: {
        summary: "A Kubernetes Service gives a group of Pods one stable virtual IP. Normally **kube-proxy** makes that work with iptables rules, which grow with every Service. Cilium's **kube-proxy replacement (KPR)** keeps Services in **eBPF hash maps** instead, so lookups take the same time whether you have ten Services or ten thousand.",
        ideas: [
          "**kube-proxy** (iptables, IPVS, nftables) rewrites Service IPs to Pod IPs (DNAT).",
          "**KPR** does the same in eBPF with constant-time lookups and no iptables rules.",
          "Without kube-proxy, set **`k8sServiceHost`/`k8sServicePort`** so Cilium can reach the API server.",
          "The datapath **keeps forwarding if the agent is down**, but its maps go stale until it returns."
        ]
      },
      points: [
        "Service types: ClusterIP (internal VIP), NodePort (same port on every node), LoadBalancer (external IP from a cloud or Cilium LB IPAM), headless (no VIP; DNS returns Pod IPs).",
        "kube-proxy watches Services and EndpointSlices and programs DNAT rules. With iptables, 100 Services already create hundreds of `KUBE-SEP` rules; lookups are linear and rule updates get slow (a famous example: 5 hours to update 20,000 Services).",
        "Even without KPR, Cilium handles ClusterIP traffic in eBPF.",
        "Enable KPR: kind `kubeProxyMode: \"none\"`, Helm `kubeProxyReplacement: true`, `k8sServiceHost`, `k8sServicePort` (avoids the chicken-and-egg of reaching the API server through a Service nobody programs). The Cilium CLI detects these automatically.",
        "Check: `cilium-dbg status --verbose` → KubeProxyReplacement Details (Socket LB, mode SNAT, backend selection Random, session affinity, supported Service types). `cilium-dbg service list` shows frontends and backends; `iptables-save | grep KUBE-SEP` shows 0.",
        "Socket-level load balancing translates the Service IP at connect time, so the app's socket already points at a Pod IP (visible in `/proc/<pid>/net/tcp`).",
        "Control plane and datapath are separate: with all agents removed, existing Services still work, but changes (e.g. a backend Pod replaced) aren't reflected, so requests can time out until the agent reconciles. Keep agent downtime short.",
        "KPR works with both native and encapsulation routing; advanced options (DSR, XDP, Maglev) are in ch. 8."
      ],
      labs: [{
        title: 'Replace kube-proxy and compare with iptables',
        goal: 'Two kind clusters in turn: first with kube-proxy (iptables) and kindnet, then without kube-proxy and with Cilium KPR.',
        steps: [
          ['Baseline: kube-proxy in iptables mode, 100 Services:', `cat > kind-iptables.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes: [{role: control-plane}, {role: worker}]
networking: {kubeProxyMode: iptables}
EOF
kind create cluster --config kind-iptables.yaml
kubectl create deploy httpd --image=httpd --replicas=2
for i in $(seq 1 100); do kubectl expose deploy httpd --port=80 --name=httpd-$i >/dev/null; done
docker exec kind-worker iptables-save | grep -c KUBE-SEP
kind delete cluster`],
          ['KPR cluster: no kube-proxy at all:', `cat > kind-kpr.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes: [{role: control-plane}, {role: worker}, {role: worker}]
networking: {disableDefaultCNI: true, kubeProxyMode: "none"}
EOF
kind create cluster --config kind-kpr.yaml
helm install cilium cilium/cilium -n kube-system --version 1.18.4 \\
  --set kubeProxyReplacement=true --set k8sServiceHost=kind-control-plane --set k8sServicePort=6443
cilium status --wait
kubectl -n kube-system exec ds/cilium -- cilium-dbg status --verbose | sed -n '/KubeProxyReplacement Details/,/Annotations/p'`],
          ['Same 100 Services, zero iptables rules, all in eBPF:', `kubectl create deploy httpd --image=httpd --replicas=2
for i in $(seq 1 100); do kubectl expose deploy httpd --port=80 --name=httpd-$i >/dev/null; done
docker exec kind-worker iptables-save | grep -c KUBE-SEP
kubectl -n kube-system exec ds/cilium -- cilium-dbg service list | grep -c ClusterIP`],
          ['Resiliency: remove every agent, then test:', `kubectl run client --image=nicolaka/netshoot -- sleep infinity; kubectl wait --for=condition=Ready pod/client
kubectl -n kube-system patch ds cilium --type=merge -p '{"spec":{"template":{"spec":{"nodeSelector":{"foo":"bar"}}}}}'
sleep 20; kubectl -n kube-system get ds cilium
kubectl exec client -- curl -s -m3 httpd-1 | head -1
kubectl -n kube-system patch ds cilium --type=json -p='[{"op":"remove","path":"/spec/template/spec/nodeSelector/foo"}]'
cilium status --wait`]
        ],
        verify: 'The iptables cluster shows hundreds of `KUBE-SEP` rules; the KPR cluster shows 0 but 100+ ClusterIP entries in `cilium-dbg service list`; with all agents removed, `curl httpd-1` still returns "It works!".',
        cleanup: 'kind delete cluster'
      }],
      refs: [
        ['Kubernetes without kube-proxy', 'https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/'],
        ['Kubernetes: virtual IPs and service proxies', 'https://kubernetes.io/docs/reference/networking/virtual-ips/'],
        ['Kubernetes Service', 'https://kubernetes.io/docs/concepts/services-networking/service/']
      ],
      quiz: [
        { q: "Why does Cilium's kube-proxy replacement scale better than iptables mode?",
          o: ["Service backends live in eBPF hash maps with constant-time lookups instead of linear rule chains", "It caches DNS answers", "It runs on the control plane only", "It skips load balancing"],
          why: "Lookup cost stays the same however many Services exist." },
        { q: "Why must you set `k8sServiceHost` and `k8sServicePort` when installing with KPR and no kube-proxy?",
          o: ["Nothing else programs the `kubernetes` Service, so Cilium needs the API server's real address", "They select the Hubble endpoint", "They configure BGP", "They are only for IPv6"],
          why: "It avoids a chicken-and-egg problem; the Cilium CLI detects them automatically." },
        { q: "All Cilium agents are removed from the cluster. What happens to existing Service traffic?",
          o: ["It keeps working, because the eBPF programs and maps stay in the kernel; but changes aren't applied", "It stops immediately", "It falls back to iptables", "Only NodePort Services keep working"],
          why: "Stale maps can send traffic to Pods that no longer exist until the agent reconciles." },
        { q: "Which command lists the Service frontends and backends that Cilium has programmed?",
          o: ["`kubectl -n kube-system exec ds/cilium -- cilium-dbg service list`", "`iptables -t nat -L`", "`kubectl get endpoints -A`", "`hubble observe --services`"],
          why: "It reads the eBPF load-balancing maps." },
        { q: "Is ClusterIP traffic handled by eBPF when Cilium is installed but kube-proxy is still running?",
          o: ["Yes; Cilium still resolves ClusterIP Services in eBPF", "No; kube-proxy always handles it", "Only for headless Services", "Only on the control-plane node"],
          why: "Full KPR additionally covers NodePort, LoadBalancer, externalIPs and HostPort." }
      ]
    },
    {
      id: 'cil-svc-behavior',
      title: 'Ch 6: Session affinity, traffic policies and LB IPAM',
      basics: {
        summary: "KPR supports all the Service behaviours Kubernetes defines: **sticky sessions**, **local-only traffic policies**, and external **NodePort/LoadBalancer** Services. Where there's no cloud load balancer, Cilium's **LB IPAM** hands out external IPs to LoadBalancer Services from pools you define.",
        ideas: [
          "`sessionAffinity: ClientIP` sends one client to the same Pod. Use it sparingly.",
          "`internalTrafficPolicy: Local` keeps in-cluster traffic on the same node.",
          "`externalTrafficPolicy: Local` **keeps the client's IP** but only uses Pods on the receiving node.",
          "**CiliumLoadBalancerIPPool** gives LoadBalancer Services an IP; BGP or L2 announcements then make it reachable."
        ]
      },
      points: [
        "Session affinity: `None` (default) or `ClientIP`. Sticky sessions skew load and reduce resilience; treat them as a workaround for non-cloud-native apps.",
        "`internalTrafficPolicy: Local`: in-cluster clients only reach backends on their own node (e.g. node-local agents; Hubble's `hubble-peer` Service uses it). If a node has no local backend, the Service has no backends from that node.",
        "`externalTrafficPolicy: Cluster` (default): any node forwards to any backend; possible extra hop; the client IP is replaced by the node's (SNAT).",
        "`externalTrafficPolicy: Local`: only local backends; client IP preserved; nodes without a backend drop the traffic. With BGP, LoadBalancer IPs are then announced only from nodes that have backends.",
        "NodePort exposes the same port on all nodes, so clients must know node IPs or use an external load balancer. LoadBalancer gives one external IP; clouds provision it via the cloud controller manager.",
        "LB IPAM is always on but dormant until a `CiliumLoadBalancerIPPool` exists. `blocks` take `cidr` or `start`/`stop`; `allowFirstLastIPs: \"No\"` (quoted string!) skips network and broadcast addresses.",
        "`serviceSelector` restricts a pool (e.g. `environment: production`, or `io.kubernetes.service.namespace: payments`). Avoid overlapping selectors: the result is undefined.",
        "LB IPAM only assigns addresses; announcing them is done by BGP or L2 announcements (ch. 10). ClusterIPs still come from Kubernetes."
      ],
      labs: [{
        title: 'Sticky sessions and LoadBalancer IPs without a cloud',
        goal: 'The KPR cluster from the previous topic (or any cluster with Cilium).',
        steps: [
          ['A deployment that reports which Pod answered:', 'kubectl create deploy podinfo --image=stefanprodan/podinfo --replicas=3\nkubectl expose deploy podinfo --port=9898\nkubectl run client --image=nicolaka/netshoot -- sleep infinity 2>/dev/null; kubectl wait --for=condition=Ready pod/client\nfor i in 1 2 3 4; do kubectl exec client -- curl -s podinfo:9898 | grep hostname; done'],
          ['Turn on session affinity and repeat:', 'kubectl patch svc podinfo -p \'{"spec":{"sessionAffinity":"ClientIP"}}\'\nfor i in 1 2 3 4; do kubectl exec client -- curl -s podinfo:9898 | grep hostname; done'],
          ['A LoadBalancer Service stays pending with no pool:', 'kubectl expose deploy podinfo --name=podinfo-lb --type=LoadBalancer --port=80 --target-port=9898\nkubectl get svc podinfo-lb'],
          ['Create a pool that skips the first and last addresses:', `cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumLoadBalancerIPPool
metadata: {name: lb-pool}
spec:
  allowFirstLastIPs: "No"
  blocks: [{cidr: 172.18.250.0/24}]
EOF
sleep 5; kubectl get svc podinfo-lb`],
          ['Reach it from a kind node (same Docker network); real reachability comes from BGP/L2 in ch. 10:', 'LB=$(kubectl get svc podinfo-lb -o jsonpath=\'{.status.loadBalancer.ingress[0].ip}\')\ndocker exec kind-worker curl -s $LB | head -3']
        ],
        verify: 'Hostnames vary before affinity and stay the same after; the LoadBalancer Service gets `172.18.250.1` (not `.0`) once the pool exists, and a node can curl it.',
        cleanup: 'kubectl delete deploy podinfo; kubectl delete svc podinfo podinfo-lb; kubectl delete ciliumloadbalancerippool lb-pool; kubectl delete pod client'
      }],
      refs: [
        ['LoadBalancer IP Address Management (LB IPAM)', 'https://docs.cilium.io/en/stable/network/lb-ipam/'],
        ['Kubernetes without kube-proxy: traffic policies and session affinity', 'https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/'],
        ['Kubernetes: Service traffic policies', 'https://kubernetes.io/docs/reference/networking/virtual-ips/#traffic-policies'],
        ['Kubernetes: session affinity', 'https://kubernetes.io/docs/reference/networking/virtual-ips/#session-affinity']
      ],
      quiz: [
        { q: "What does `externalTrafficPolicy: Local` give you?",
          o: ["The client's source IP is preserved, but only Pods on the receiving node are used", "Traffic is spread across all nodes with the client IP preserved", "Internal traffic stays on the node", "Sticky sessions"],
          why: "Nodes without a local backend drop the traffic. With `Cluster`, any node forwards, but the client IP is replaced." },
        { q: "A LoadBalancer Service on kind stays `<pending>`. With Cilium, what assigns it an IP?",
          o: ["A CiliumLoadBalancerIPPool (LB IPAM)", "kube-proxy", "CoreDNS", "The Cilium CNI plugin"],
          why: "LB IPAM is dormant until the first pool exists." },
        { q: "Why must `allowFirstLastIPs` be written as `\"No\"` with quotes?",
          o: ["Cilium expects a string; unquoted, YAML reads it as a boolean and the object fails validation", "Quotes make it case-insensitive", "It's a Helm template requirement", "It doesn't matter"],
          why: "YAML treats bare `No` as false." },
        { q: "After LB IPAM assigns `192.168.9.1` to a Service, can clients outside the cluster reach it?",
          o: ["Not by itself; the address must be announced with BGP or L2 announcements", "Yes, always", "Only from the control plane", "Only over IPv6"],
          why: "LB IPAM allocates addresses; announcing them is a separate feature (ch. 10)." },
        { q: "What does `sessionAffinity: ClientIP` do?",
          o: ["Sends requests from the same client IP to the same backend Pod", "Preserves the client IP for the backend", "Limits each client to one connection", "Routes traffic to the client's node"],
          why: "Useful for apps with in-memory state, but it skews load, so prefer stateless designs." }
      ]
    }
  ]
});
