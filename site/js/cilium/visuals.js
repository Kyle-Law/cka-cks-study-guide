// One diagram per Cilium topic, drawn as inline SVG so it follows the light/dark theme (see .visual rules in style.css).
(function () {
  const { B, A, R, D, P, G, T, Steps, S } = window.SVGKIT;

  const V = {};

  // ---------- Foundations ----------
  {
    const pkt = B(10, 28, 90, 44, 'Packet');
    const rules = ['rule 1', 'rule 2', 'rule 3', '…', 'rule 5,000'].map((t, i) => B(130 + i * 105, 28, 90, 44, t, null, i === 4 ? 'bad' : ''));
    const pkt2 = B(10, 120, 90, 50, 'Packet');
    const map = B(200, 120, 300, 50, 'eBPF hash map', ['key → backend or verdict, constant time'], 'acc');
    const out = B(600, 120, 150, 50, 'Decision', null, 'ok');
    const chips = ['CNI networking', 'Kube-proxy repl.', 'Ingress / Gateway', 'Sidecarless mesh', 'Cluster Mesh', 'BGP / L2', 'Policy L3–L7', 'Encryption + Hubble'];
    V['cil-why'] = {
      caption: 'iptables matches packets against long rule chains; eBPF looks the answer up in a kernel map. On that base Cilium builds many opt-in features.',
      svg: S(310, [T(10, 18, 'IPTABLES: CHECK RULES ONE BY ONE', 'h'), pkt, ...rules, R(pkt, rules[0]), ...rules.slice(1).map((r, i) => R(rules[i], r)),
        T(10, 110, 'EBPF: ONE LOOKUP', 'h'), pkt2, map, out, R(pkt2, map), R(map, out),
        T(10, 200, 'WHAT CILIUM PROVIDES (ENABLE AS NEEDED)', 'h'),
        ...chips.map((c, i) => B(10 + (i % 4) * 187, 210 + Math.floor(i / 4) * 48, 177, 40, c, null, i === 0 ? 'acc' : ''))])
    };
  }
  {
    const api = B(10, 20, 150, 50, 'API server');
    const op = B(10, 110, 150, 60, 'Operator', ['CRDs, CiliumNode', 'IPAM ranges']);
    const cli = B(10, 205, 150, 50, 'Cilium CLI', ['on your laptop']);
    const agent = B(220, 40, 180, 70, 'Cilium agent', ['DNS proxy', 'Hubble server'], 'acc');
    const cni = B(420, 40, 135, 70, 'CNI plugin', ['05-cilium.conflist']);
    const ebpf = B(220, 135, 335, 56, 'eBPF programs + maps', ['policy · NAT · load balancing · conntrack']);
    const envoy = B(220, 210, 335, 50, 'cilium-envoy (DaemonSet)', ['L7: Ingress, Gateway API, HTTP policy']);
    const relay = B(600, 40, 150, 60, 'Hubble Relay', ['flows from all nodes']);
    const ui = B(600, 125, 150, 50, 'Hubble CLI / UI');
    const pod = B(600, 200, 150, 60, 'Pod traffic', ['hits eBPF hooks'], 'ok');
    V['cil-arch'] = {
      caption: 'The agent on every node loads and feeds the eBPF datapath; the operator handles cluster-wide jobs; Envoy and the DNS proxy only see traffic that needs them.',
      svg: S(275, [G(200, 10, 375, 260, 'Every node'), api, op, cli, agent, cni, ebpf, envoy, relay, ui, pod,
        R(api, agent, 'watch'), A(85, 110, 85, 70, 'CRDs'), A(310, 110, 310, 135), A(420, 75, 400, 75),
        A(600, 70, 575, 70), D(relay, ui), A(600, 230, 555, 170)])
    };
  }
  {
    const bad1 = B(10, 140, 180, 46, 'unauthorized Pod');
    const res1 = B(560, 140, 190, 46, 'dropped → timeout', null, 'bad');
    const c2 = B(10, 205, 180, 46, 'netshoot-client', ['app=netshoot-client']);
    const env = B(285, 205, 175, 46, 'Envoy', ['checks method + path'], 'acc');
    const res2 = B(560, 205, 190, 46, '/index.html → 200', ['/50x.html → 403'], 'ok');
    V['cil-start'] = {
      caption: 'The getting-started flow, and how an L3/L4 denial (silent drop) differs from an L7 denial (HTTP 403 from Envoy).',
      svg: S(265, [Steps(10, 30, 740, [['kind cluster', ['no default CNI']], ['Install', ['Helm or CLI']], ['Deploy app', ['nginx + clients']],
        ['L3/L4 policy', ['by label + port']], ['L7 rule', ['GET /index.html']], ['Observe', ['hubble observe']]]),
        bad1, res1, A(190, 163, 560, 163, 'L3/L4 policy', 'bad'), c2, env, res2, R(c2, env, 'allowed'), R(env, res2)])
    };
  }

  // ---------- Core networking ----------
  {
    const modes = [['Kubernetes Host Scope', ['k8s sets node podCIDR', 'simple but fixed', 'ipam.mode=kubernetes']],
      ['Cluster Scope (default)', ['operator → CiliumNode', 'static pool', 'ipam.mode=cluster-pool']],
      ['Multi-Pool', ['pools per namespace', 'grows on demand', 'recommended'], 'acc'],
      ['ENI (AWS EKS)', ['VPC secondary IPs', 'no NAT, SG-aware', 'density limits']]];
    const ns = B(10, 190, 160, 50, 'namespace acme', ['ip-pool annotation']);
    const pool = B(210, 190, 170, 50, 'acme-pool', ['10.20.0.0/16'], 'acc');
    const node = B(420, 190, 160, 50, 'node blocks', ['/27, more on demand']);
    const pods = B(620, 190, 130, 50, 'Pods', ['10.20.0.x'], 'ok');
    V['cil-ipam'] = {
      caption: 'The four common IPAM modes, and how Multi-Pool gives one tenant its own range.',
      svg: S(255, [...modes.map((m, i) => B(10 + i * 187, 10, 177, 120, m[0], m[1], m[2] || '')),
        T(10, 175, 'MULTI-POOL EXAMPLE', 'h'), ns, pool, node, pods, R(ns, pool), R(pool, node), R(node, pods)])
    };
  }
  {
    const cols = [['IPv4 only', ['10.244.1.20'], 'the safe default'], ['Dual stack', ['10.244.1.117', 'fd00:10:244:1::8204'], 'transition step'], ['IPv6 only', ['2001:db8:10:1::4d69'], 'greenfield']];
    const items = [];
    cols.forEach(([t, ips, note], i) => {
      const x = 10 + i * 250;
      items.push(G(x, 10, 240, 135, t), B(x + 20, 40, 200, 60, 'Pod', ips, i === 1 ? 'acc' : ''), T(x + 120, 125, note, 'mid'));
    });
    const p6 = B(10, 190, 150, 50, 'IPv6-only Pod');
    const dns = B(200, 190, 160, 50, 'DNS64', ['synthesises AAAA']);
    const nat = B(400, 190, 160, 50, 'NAT64', ['IPv6 → IPv4 at edge']);
    const reg = B(600, 190, 150, 50, 'IPv4-only service', null, 'ok');
    V['cil-ipv6'] = {
      caption: 'The three IP-family choices, and how an IPv6-only cluster still reaches IPv4-only services.',
      svg: S(255, [...items, T(10, 175, 'REACHING IPV4 FROM IPV6-ONLY', 'h'), p6, dns, nat, reg, R(p6, dns), R(dns, nat), R(nat, reg)])
    };
  }
  {
    const pa = B(30, 30, 170, 56, 'pod-a', ['eth0 10.244.1.203/32']);
    const pb = B(560, 30, 170, 56, 'pod-b', ['eth0 10.244.1.69/32']);
    const la = B(30, 140, 170, 56, 'lxc… (pod-a)', ['cil_from_container'], 'acc');
    const mid = B(260, 140, 240, 56, 'eBPF datapath', ['identity · policy · conntrack']);
    const lb = B(560, 140, 170, 56, 'lxc… (pod-b)');
    V['cil-intranode'] = {
      caption: 'Same-node traffic: out of pod-a\'s veth, through the eBPF program on the host side, straight into pod-b. No tunnel involved.',
      svg: S(290, [G(10, 110, 740, 170, 'Host network namespace'), pa, pb, la, mid, lb,
        D(pa, la), R(la, mid), R(mid, lb), A(645, 140, 645, 86, 'veth'),
        B(30, 215, 170, 50, 'cilium_host', ['Pod gateway']), B(220, 215, 150, 50, 'cilium_net'),
        B(390, 215, 170, 50, 'cilium_vxlan', ['between nodes only'], 'ghost'), B(580, 215, 150, 50, 'eth0', ['cil_from_netdev'])])
    };
  }
  {
    const n = [B(10, 28, 140, 50, 'Pod A', ['10.0.1.5']), B(190, 28, 230, 50, 'Node 1 route', ['10.0.2.0/24 via 172.18.0.3']),
      B(460, 28, 130, 50, 'Network', ['knows Pod CIDRs']), B(630, 28, 120, 50, 'Pod B', ['10.0.2.7'], 'ok')];
    const e = [B(10, 120, 140, 50, 'Pod A'), B(190, 120, 230, 50, 'cilium_vxlan', ['wraps the packet'], 'acc'),
      B(460, 120, 130, 50, 'Network', ['sees node IPs only']), B(630, 120, 120, 50, 'Pod B', null, 'ok')];
    V['cil-internode'] = {
      caption: 'Native routing needs the network to know Pod ranges; encapsulation hides them inside node-to-node UDP and carries the source identity in the VNI.',
      svg: S(300, [T(10, 18, 'NATIVE ROUTING', 'h'), ...n, R(n[0], n[1]), R(n[1], n[2]), R(n[2], n[3]),
        T(10, 110, 'ENCAPSULATION (VXLAN, THE DEFAULT)', 'h'), ...e, R(e[0], e[1]), R(e[1], e[2]), R(e[2], e[3]),
        T(10, 200, 'VXLAN PACKET ON THE WIRE', 'h'),
        B(10, 210, 170, 50, 'Outer IP', ['node → node']), B(182, 210, 110, 50, 'UDP', ['dst 8472']),
        B(294, 210, 160, 50, 'VXLAN header', ['VNI = source identity'], 'acc'), B(456, 210, 294, 50, 'Original Pod packet', ['10.0.1.5 → 10.0.2.7, unchanged'], 'ok'),
        T(10, 288, 'Geneve: same idea on UDP 6081, plus optional TLV options. Overhead is about 50 bytes per packet.')])
    };
  }
  {
    const k = [B(30, 40, 320, 40, 'KUBE-SERVICES'), B(30, 100, 320, 40, 'KUBE-SVC-… (per Service)'), B(30, 160, 320, 40, 'KUBE-SEP-1 … KUBE-SEP-n', null, 'bad')];
    const c = [B(410, 40, 320, 40, 'Pod connects to 10.96.45.144:80'), B(410, 100, 320, 50, 'eBPF service map', ['frontend → backends, constant-time lookup'], 'acc'), B(410, 166, 320, 34, 'DNAT to a Pod IP', null, 'ok')];
    const ag = B(10, 235, 220, 56, 'Cilium agent', ['watches Services/EndpointSlices']);
    const mp = B(290, 235, 190, 56, 'eBPF maps', ['live in the kernel'], 'acc');
    const dp = B(540, 235, 210, 56, 'Datapath', ['keeps forwarding if agent is down'], 'ok');
    V['cil-kpr'] = {
      caption: 'kube-proxy walks chains that grow with every Service; KPR does one map lookup. The agent fills the maps, and the datapath keeps working if the agent is briefly gone.',
      svg: S(300, [G(10, 10, 360, 205, 'kube-proxy · iptables mode'), G(390, 10, 360, 205, 'Cilium kube-proxy replacement'), ...k, ...c,
        D(k[0], k[1]), D(k[1], k[2]), D(c[0], c[1]), D(c[1], c[2]), ag, mp, dp, R(ag, mp, 'writes'), R(mp, dp, 'read by')])
    };
  }
  {
    const cl1 = B(25, 40, 95, 40, 'Client'); const a1 = B(150, 40, 100, 46, 'Node 1', ['no backend']); const b1 = B(260, 105, 100, 56, 'Node 2', ['backend Pod'], 'ok');
    const cl2 = B(400, 40, 95, 40, 'Client'); const a2 = B(525, 40, 100, 46, 'Node 1', ['no backend'], 'bad'); const b2 = B(635, 105, 100, 56, 'Node 2', ['backend Pod'], 'ok');
    const lb = [B(10, 215, 180, 50, 'type LoadBalancer', ['EXTERNAL-IP <pending>']), B(235, 215, 210, 50, 'CiliumLoadBalancerIPPool', ['cidr or start/stop'], 'acc'),
      B(490, 215, 120, 50, 'IP assigned', ['172.16.0.1'], 'ok'), B(650, 215, 100, 50, 'Announce', ['BGP or L2'])];
    V['cil-svc-behavior'] = {
      caption: 'externalTrafficPolicy trades even spreading (Cluster) for client-IP preservation (Local). LB IPAM gives LoadBalancer Services an address when there is no cloud.',
      svg: S(280, [G(10, 10, 365, 175, 'externalTrafficPolicy: Cluster'), G(385, 10, 365, 175, 'externalTrafficPolicy: Local'),
        cl1, a1, b1, R(cl1, a1), A(250, 70, 300, 105), T(25, 175, 'any node forwards · client IP replaced'),
        cl2, a2, b2, R(cl2, a2, '', 'bad'), A(450, 80, 635, 133, '', 'ok'), T(400, 175, 'client IP kept · no local backend = drop'),
        T(10, 205, 'LB IPAM', 'h'), ...lb, R(lb[0], lb[1]), R(lb[1], lb[2]), R(lb[2], lb[3])])
    };
  }

  // ---------- Traffic management ----------
  {
    const cl = B(10, 90, 130, 56, 'Client', ['HTTP / HTTPS']);
    const lb = B(170, 90, 160, 56, 'LB Service IP', ['LB IPAM + L2/BGP']);
    const ing = B(365, 8, 180, 46, 'Ingress', ['ingressClassName: cilium']);
    const env = B(365, 82, 180, 74, 'Envoy (per node)', ['cilium-envoy', 'TLS terminated here'], 'acc');
    const sec = B(170, 185, 160, 50, 'TLS Secret', ['demo-cert']);
    const s1 = B(600, 40, 150, 50, 'details:9080', ['/details'], 'ok');
    const s2 = B(600, 140, 150, 50, 'productpage:9080', ['/'], 'ok');
    V['cil-ingress'] = {
      caption: 'Cilium Ingress: the Ingress becomes Envoy configuration (CiliumEnvoyConfig); a LoadBalancer IP brings clients to Envoy, which routes by path and can terminate TLS.',
      svg: S(250, [cl, lb, ing, env, sec, s1, s2, R(cl, lb), R(lb, env), D(ing, env, 'CEC'), A(330, 205, 365, 150), A(545, 105, 600, 70), A(545, 135, 600, 160)])
    };
  }
  {
    const gc = B(10, 40, 200, 64, 'GatewayClass cilium', ['io.cilium/gateway-controller']);
    const gw = B(280, 40, 200, 64, 'Gateway my-gateway', ['listener HTTP :80'], 'acc');
    const rt = B(550, 40, 200, 64, 'HTTPRoute', ['match /echo', 'parentRefs: my-gateway']);
    const b1 = B(520, 165, 110, 50, 'echo-1', ['weight 99'], 'ok');
    const b2 = B(640, 165, 110, 50, 'echo-2', ['weight 1']);
    V['cil-gateway'] = {
      caption: 'Gateway API splits roles across objects. Routes match requests, can rewrite or redirect them, and split traffic by weight; GAMMA attaches the same Routes to Services.',
      svg: S(235, [T(110, 22, 'Infrastructure provider', 'mid'), T(380, 22, 'Cluster operator', 'mid'), T(650, 22, 'App developer', 'mid'),
        gc, gw, rt, b1, b2, R(gc, gw, 'implements'), A(550, 72, 480, 72, 'attaches'), A(620, 104, 575, 165), A(680, 104, 695, 165),
        B(10, 150, 230, 64, 'GAMMA', ['HTTPRoute parentRef = Service', 'L7 rules for east-west'], 'ghost'),
        B(270, 150, 220, 64, 'Route filters', ['header modifier · redirect', 'URL rewrite · mirror'], 'ghost')])
    };
  }
  {
    const cl = B(40, 70, 135, 40, 'client');
    const a = [B(40, 130, 135, 36, 'echo', null, 'ok'), B(40, 180, 135, 36, 'echo', null, 'ok')];
    const b = [B(215, 130, 135, 36, 'echo'), B(215, 180, 135, 36, 'echo')];
    const pod = B(410, 50, 150, 44, 'client Pod');
    const svc = B(590, 50, 150, 44, 'kube-dns Service', ['10.96.0.10']);
    const loc = B(410, 150, 150, 56, 'node-local-dns', ['same node'], 'ok');
    const rem = B(590, 150, 150, 56, 'CoreDNS', ['other node'], 'ghost');
    V['cil-locality'] = {
      caption: 'PreferClose keeps traffic in the client\'s zone when it can; a Local Redirect Policy keeps it on the client\'s node.',
      svg: S(250, [G(10, 10, 370, 230, 'trafficDistribution: PreferClose'), G(25, 40, 165, 190, 'zone-a'), G(200, 40, 165, 190, 'zone-b'),
        cl, ...a, ...b, D(cl, a[0], '', 'ok'), A(175, 90, 215, 148, '', 'bad'),
        G(390, 10, 360, 230, 'Local Redirect Policy (one node)'), pod, svc, loc, rem, R(pod, svc),
        A(640, 94, 500, 150, '', 'ok'), A(690, 94, 690, 150, '', 'bad'), T(420, 228, 'Service entry becomes type LocalRedirect')])
    };
  }
  {
    const c1 = B(25, 45, 90, 40, 'Client'), n1 = B(140, 45, 90, 40, 'Node 1'), n2 = B(255, 45, 105, 40, 'Backend', null, 'ok');
    const nic = B(400, 45, 100, 40, 'NIC'), xdp = B(520, 45, 110, 40, 'XDP program', null, 'acc'), st = B(650, 45, 90, 40, 'Kernel'), dr = B(520, 105, 110, 36, 'drop early', null, 'bad');
    const cn = B(25, 215, 110, 44, 'Connection', ['5-tuple']), m1 = B(160, 195, 90, 36, 'Node 1'), m2 = B(160, 245, 90, 36, 'Node 2'), be = B(275, 220, 85, 40, 'Pod B', null, 'ok');
    const v = [B(400, 200, 90, 36, 'Pod'), B(510, 200, 120, 36, 'veth path'), B(650, 200, 90, 36, 'NIC')];
    const k = [B(400, 260, 90, 36, 'Pod', null, 'ok'), B(510, 260, 120, 36, 'netkit', null, 'acc'), B(650, 260, 90, 36, 'NIC')];
    V['cil-perf'] = {
      caption: 'Four performance tools: DSR shortens the return path, XDP acts in the driver, Maglev keeps connections on one backend, netkit trims the Pod\'s path.',
      svg: S(330, [G(10, 10, 365, 150, 'DSR'), c1, n1, n2, R(c1, n1), R(n1, n2), P([[307, 85], [307, 125], [70, 125], [70, 85]], 'reply direct, client IP kept', 'ok'),
        G(385, 10, 365, 150, 'XDP'), nic, xdp, st, dr, R(nic, xdp), R(xdp, st), D(xdp, dr),
        G(10, 170, 365, 150, 'Maglev'), cn, m1, m2, be, A(135, 230, 160, 213), A(135, 245, 160, 263), A(250, 213, 275, 235), A(250, 263, 275, 245),
        G(385, 170, 365, 150, 'veth vs netkit'), ...v, ...k, R(v[0], v[1]), R(v[1], v[2]), R(k[0], k[1]), R(k[1], k[2])])
    };
  }

  // ---------- Beyond the cluster ----------
  {
    const items = [];
    const apis = [];
    [['red', 1], ['green', 2], ['blue', 3]].forEach(([n, id], i) => {
      const x = 10 + i * 255;
      const api = B(x + 15, 40, 200, 56, 'clustermesh-apiserver', ['+ in-memory etcd cache'], 'acc');
      const ag = B(x + 15, 135, 200, 56, 'Cilium agents', ['use KVStoreMesh cache']);
      apis.push(api);
      items.push(G(x, 10, 230, 200, `cluster ${n} (id ${id})`), api, ag, D(api, ag, 'reads'));
    });
    V['cil-mesh'] = {
      caption: 'Cluster Mesh is decentralised: every cluster\'s API server shares its endpoints and identities with the others; Pod traffic goes straight between nodes.',
      svg: S(280, [...items, A(225, 68, 280, 68, '', 'both'), A(480, 68, 535, 68, '', 'both'),
        B(10, 225, 740, 48, 'Pod traffic flows directly between nodes', ['only metadata (endpoints, identities) goes through the API servers; red ↔ blue are also connected'], 'ghost')])
    };
  }
  {
    const cl = B(30, 45, 150, 44, 'client', ['app=frontend']);
    const sv = B(200, 45, 155, 44, 'svc hello', ['global: "true"'], 'acc');
    const pr = B(200, 150, 155, 50, 'hello Pod', ['cluster red'], 'ok');
    const sv2 = B(410, 45, 155, 44, 'svc hello', ['global: "true"']);
    const pb = B(410, 150, 155, 50, 'hello Pod', ['cluster blue'], 'ok');
    V['cil-mesh-global'] = {
      caption: 'A global Service merges backends from every cluster. Local affinity prefers the client\'s cluster and fails over; policies can name the source cluster.',
      svg: S(230, [G(10, 10, 360, 210, 'cluster red'), G(390, 10, 360, 210, 'cluster blue'), cl, sv, pr, sv2, pb,
        R(cl, sv), D(sv, pr, 'affinity: local'), A(355, 80, 410, 168, 'failover'),
        B(580, 45, 155, 110, 'CNP on hello', ['allow app=frontend', 'io.cilium.k8s.', 'policy.cluster: red'], 'ghost')])
    };
  }
  {
    const cl = B(10, 85, 140, 56, 'Client', ['172.18.0.5']);
    const ld = B(300, 30, 190, 64, 'kind-worker2', ['holds the Lease', 'answers ARP for the VIP'], 'acc');
    const sb = B(300, 140, 190, 56, 'kind-worker', ['standby'], 'ghost');
    const pods = B(590, 30, 160, 64, 'httpd Pods', ['on any node'], 'ok');
    const ls = B(590, 140, 160, 56, 'Lease', ['cilium-l2announce-…']);
    V['cil-l2'] = {
      caption: 'One elected node answers ARP for the VIP and carries all its traffic. If it fails, another node takes the Lease and sends gratuitous ARP.',
      svg: S(235, [cl, ld, sb, pods, ls, A(150, 100, 300, 62, 'ARP, then traffic'), R(ld, pods, 'load-balances'),
        A(395, 94, 395, 140, 'takes over'), A(490, 80, 590, 160, 'renews'),
        T(10, 225, 'Failover waits for gratuitous ARP or for the client\'s ARP cache to expire.')])
    };
  }
  {
    const rt = B(300, 10, 160, 56, 'FRR router', ['AS 64512'], 'acc');
    const cl = B(620, 10, 130, 56, 'Clients', ['any network']);
    const w1 = B(150, 115, 170, 56, 'kind-worker', ['advertises VIP /32']);
    const w2 = B(440, 115, 170, 56, 'kind-worker2', ['advertises VIP /32']);
    const c = [B(10, 220, 210, 56, 'CiliumBGPClusterConfig', ['nodes, localASN, peers']), B(275, 220, 210, 56, 'CiliumBGPPeerConfig', ['timers, graceful restart']),
      B(540, 220, 210, 56, 'CiliumBGPAdvertisement', ['Service IPs / PodCIDR'], 'acc')];
    V['cil-bgp'] = {
      caption: 'Each node peers with the router and advertises the Service IP; two equal routes give ECMP load balancing. Three CRDs, linked by a reference and a label, define it all.',
      svg: S(290, [rt, cl, w1, w2, A(620, 38, 460, 38, 'to VIP'), A(235, 115, 340, 66, 'BGP'), A(525, 115, 420, 66, 'BGP'),
        T(380, 196, 'Router sees two equal next hops → ECMP', 'mid'), ...c, R(c[0], c[1], 'ref'), R(c[1], c[2], 'labels')])
    };
  }
  {
    const p1 = B(10, 40, 150, 56, 'Pod', ['10.244.1.3']), n1 = B(220, 40, 200, 56, 'Node: masquerade', ['src → 172.18.0.3'], 'acc'), e1 = B(490, 40, 260, 56, 'External server', ['sees 172.18.0.3, replies'], 'ok');
    const p2 = B(10, 150, 150, 56, 'Pod', ['10.244.1.3']), n2 = B(220, 150, 200, 56, 'Node: no masquerade', ['dst in nonMasqueradeCIDRs']), e2 = B(490, 150, 260, 56, 'External server', ['sees 10.244.1.3, no route back'], 'bad');
    V['cil-masq'] = {
      caption: 'Masquerading swaps the Pod IP for the node IP so replies find their way back. Skip it only where the network can route Pod IPs.',
      svg: S(255, [T(10, 25, 'DEFAULT', 'h'), p1, n1, e1, R(p1, n1), R(n1, e1), T(10, 135, 'MASQUERADING SKIPPED', 'h'), p2, n2, e2, R(p2, n2), R(n2, e2),
        P([[620, 206], [620, 238], [85, 238], [85, 206]], 'reply lost', 'bad')])
    };
  }
  {
    const hr = B(10, 30, 150, 56, 'hr Pod', ['namespace hr']);
    const sa = B(10, 140, 150, 56, 'sales Pod', ['namespace sales']);
    const g1 = B(260, 30, 210, 56, 'kind-worker3', ['egressIP 172.18.0.100'], 'acc');
    const g2 = B(260, 140, 210, 56, 'kind-worker4', ['egressIP 172.18.0.101'], 'acc');
    const ex = B(570, 75, 180, 76, 'Directory server', ['.100 = hr', '.101 = sales'], 'ok');
    V['cil-egress'] = {
      caption: 'Egress Gateway sends each tenant\'s traffic out through a chosen node and IP, so outside systems can tell tenants apart. Bandwidth Manager caps each Pod\'s send rate.',
      svg: S(280, [hr, sa, g1, g2, ex, R(hr, g1, 'VXLAN'), R(sa, g2, 'VXLAN'), A(470, 58, 570, 100), A(470, 168, 570, 128),
        B(10, 220, 740, 50, 'Bandwidth Manager', ['annotation kubernetes.io/egress-bandwidth: "10M" → rate-limited at the node\'s NIC'], 'ghost')])
    };
  }

  // ---------- Security ----------
  {
    const pk = B(10, 60, 120, 56, 'Packet', ['src 10.0.0.68']);
    const ipc = B(170, 60, 190, 56, 'ipcache (LPM)', ['10.0.0.68/32 → 22727'], 'acc');
    const pm = B(400, 60, 200, 56, 'Policy map', ['(22727, in, TCP, 8080)']);
    const vs = [B(640, 10, 110, 40, 'ALLOW', null, 'ok'), B(640, 68, 110, 40, 'DROP', null, 'bad'), B(640, 126, 110, 40, 'TO PROXY')];
    const id = [B(10, 195, 230, 56, 'webserver Pods ×3', ['same labels']), B(290, 195, 200, 56, 'Identity 11866', ['CiliumIdentity'], 'acc'), B(540, 195, 210, 56, 'Policy map entries', ['computed ahead of time'])];
    V['cil-policy'] = {
      caption: 'Per packet: the source IP becomes an identity, then the precomputed policy map decides. Pods with the same labels share one identity.',
      svg: S(290, [pk, ipc, pm, ...vs, R(pk, ipc), R(ipc, pm), A(600, 80, 640, 30), R(pm, vs[1]), A(600, 100, 640, 146),
        ...id, R(id[0], id[1]), R(id[1], id[2]), T(10, 280, 'No policy = allow all. Any rule for a direction = default deny in that direction.')])
    };
  }
  {
    V['cil-policy-adv'] = {
      caption: 'Statements inside a rule must all match; any one rule is enough. Entities name groups outside Pod labels, and deny rules beat every allow.',
      svg: S(280, [G(10, 10, 470, 200, 'One policy, two ingress rules'),
        B(30, 42, 430, 60, 'Rule 1', ['fromEndpoints: app=test  AND  toPorts: 8080'], 'acc'), T(245, 125, 'OR', 'h mid'),
        B(30, 140, 430, 60, 'Rule 2', ['fromEndpoints: metrics-collector  AND  toPorts: 9113'], 'acc'),
        B(500, 10, 250, 200, 'Entities', ['world · cluster · host', 'remote-node · kube-apiserver', 'ingress · all', '', 'CIDR rules: only for', 'IPs outside the cluster']),
        B(10, 225, 740, 46, 'ingressDeny / egressDeny always win over allows, in any policy', null, 'bad')])
    };
  }
  {
    const cl = B(10, 60, 130, 56, 'Client', ['GET /admin']);
    const eb = B(180, 60, 160, 56, 'eBPF datapath', ['port has L7 rules']);
    const en = B(380, 60, 160, 56, 'Envoy', ['checks method/path'], 'acc');
    const ok = B(600, 15, 150, 56, 'Backend', ['sees CiliumInternalIP'], 'ok');
    const no = B(600, 110, 150, 50, '403 Access denied', null, 'bad');
    const q = B(10, 200, 200, 50, 'Pod DNS query', ['example.com?']);
    const rl = B(260, 200, 200, 50, 'DNS rule', ['matchPattern: cilium.io'], 'acc');
    const rf = B(510, 200, 240, 50, 'refused', ['…but DoH on :443 can bypass it'], 'bad');
    V['cil-l7'] = {
      caption: 'Ports with L7 rules are redirected to Envoy, which forwards allowed requests and answers 403 for the rest. DNS rules filter names, but only at DNS level.',
      svg: S(260, [cl, eb, en, ok, no, R(cl, eb), R(eb, en), A(540, 78, 600, 43), A(540, 100, 600, 135),
        T(10, 190, 'DNS RULES', 'h'), q, rl, rf, R(q, rl), R(rl, rf)])
    };
  }
  {
    const t = [B(10, 165, 140, 56, 'Pod', ['trusts internal CA']), B(185, 165, 180, 56, 'Envoy terminates', ['internal cert for cilium.io'], 'acc'),
      B(400, 165, 150, 56, 'Check rules', ['host + path']), B(585, 165, 165, 56, 'Envoy originates', ['verifies public CA'])];
    V['cil-fqdn'] = {
      caption: 'FQDN policy learns IPs from DNS answers through the DNS proxy and allows only those. TLS interception lets Envoy see inside HTTPS using your own CA.',
      svg: S(250, [Steps(10, 30, 740, [['DNS query', ['to CoreDNS']], ['Redirected', ['to DNS proxy']], ['Name allowed?', ['proxy forwards']],
        ['Answer', ['IP for cilium.io']], ['Map IP', ['→ FQDN identity']], ['Connect', ['allowed at L3']]]),
        T(10, 150, 'TLS INTERCEPTION', 'h'), ...t, R(t[0], t[1], 'TLS'), R(t[1], t[2]), R(t[2], t[3]),
        T(10, 242, 'Only allow DNS to the cluster\'s CoreDNS, or a hostile resolver could poison the mapping.')])
    };
  }
  {
    const pa = B(30, 45, 210, 40, 'Pod A'), w1 = B(30, 105, 210, 40, 'cilium_wg0', null, 'acc');
    const pb = B(520, 45, 210, 40, 'Pod B'), w2 = B(520, 105, 210, 40, 'cilium_wg0', null, 'acc');
    V['cil-encryption'] = {
      caption: 'Pod traffic between nodes is wrapped in WireGuard (UDP 51871). Keys are published on CiliumNode objects. Some paths are never encrypted.',
      svg: S(255, [G(10, 10, 250, 150, 'Node 1'), G(500, 10, 250, 150, 'Node 2'), pa, w1, pb, w2, D(pa, w1), R(w1, w2, 'UDP 51871 · encrypted', 'ok'), A(625, 105, 625, 85),
        B(285, 35, 190, 50, 'CiliumNode', ['wg-pub-key annotation'], 'ghost'),
        T(10, 190, 'NOT ENCRYPTED', 'h'), ...['same-node Pods', 'host / hostNetwork', 'leaving the cluster', 'inside one Pod'].map((s, i) => B(10 + i * 187, 200, 177, 44, s, null, 'ghost'))])
    };
  }

  // ---------- Observability & operations ----------
  {
    const ns = [0, 1, 2].map(i => B(10, 15 + i * 72, 170, 56, `node ${i + 1}`, ['agent + Hubble server']));
    const rl = B(260, 87, 170, 56, 'Hubble Relay', ['port 4245'], 'acc');
    const cli = B(510, 15, 240, 56, 'hubble observe / UI', ['filters, verdicts, L7 details']);
    const pr = B(510, 95, 240, 50, 'Prometheus :9965', ['hubble_drop_total, …']);
    const ex = B(510, 165, 240, 50, 'Hubble Exporter', ['flows → file → Loki / Splunk']);
    V['cil-hubble'] = {
      caption: 'Each agent observes its own node; Relay merges them for the CLI and UI. Metrics and exported flow logs come from the agents.',
      svg: S(245, [...ns, rl, cli, pr, ex, A(180, 43, 260, 105), R(ns[1], rl), A(180, 187, 260, 125), A(430, 105, 510, 43),
        T(10, 238, 'Flows live in per-node ring buffers; use the exporter or metrics for history.')])
    };
  }
  V['cil-ops'] = {
    caption: 'Upgrade one step at a time, and know what keeps working while an agent restarts and what doesn\'t.',
    svg: S(290, [Steps(10, 30, 740, [['Preflight', ['pre-pull images']], ['Latest patch', ['of current minor']], ['helm upgrade', ['same values']],
      ['Verify', ['status, tests']], ['Next minor', ['repeat']]]),
      T(10, 130, 'WHILE AN AGENT RESTARTS', 'h'),
      B(10, 140, 365, 110, 'Keeps working', ['Pod and Service routing', 'L3/L4 policy (maps may be stale)', 'existing connections'], 'ok'),
      B(385, 140, 365, 110, 'Disrupted', ['Envoy restart: L7, Ingress/Gateway, TLS', 'DNS proxy down: FQDN lookups fail', 'BGP session (unless graceful restart)'], 'bad'),
      T(380, 278, 'cilium status → connectivity test → cilium-health → logs → sysdump', 'mid code')])
  };

  window.COURSE_VISUALS = V;
})();
