// One diagram per topic, drawn as inline SVG so it follows the light/dark theme (see .visual rules in style.css).
(function () {
  const { B, A, R, D, P, G, T, Steps, S } = window.SVGKIT;

  const V = {};

  // ---------- Storage ----------
  {
    const pvc = B(10, 40, 150, 64, 'PVC', ['class: fast', '10Gi RWO']);
    const sc = B(210, 40, 150, 64, 'StorageClass', ['fast', 'provisioner: csi'], 'acc');
    const pr = B(410, 40, 150, 64, 'CSI driver', ['creates the disk']);
    const pv = B(610, 40, 140, 64, 'PV', ['created for you'], 'ok');
    const pod = B(10, 150, 150, 56, 'Pod', ['mounts the PVC']);
    V['storage-classes'] = {
      caption: 'Dynamic provisioning: the claim names a class, and that class\'s driver creates a matching volume.',
      svg: S(220, [pvc, sc, pr, pv, pod, R(pvc, sc, 'names'), R(sc, pr, 'calls'), R(pr, pv, 'creates'),
        A(85, 150, 85, 104, 'uses'),
        B(210, 146, 540, 60, 'PVC ⇄ PV are bound one-to-one', ['WaitForFirstConsumer: nothing is created until a Pod needs it'], 'ghost')])
    };
  }
  {
    const xs = [10, 197, 384, 571], w = 179;
    const modes = [['RWO', ['ReadWriteOnce', 'one node, read-write', 'e.g. cloud block disk']],
      ['ROX', ['ReadOnlyMany', 'many nodes, read-only', 'e.g. shared datasets']],
      ['RWX', ['ReadWriteMany', 'many nodes, read-write', 'e.g. NFS, CephFS']],
      ['RWOP', ['ReadWriteOncePod', 'one single Pod', 'strictest mode']]];
    const life = [['emptyDir / configMap', ['deleted with the Pod'], 'bad'], ['PersistentVolume', ['outlives the Pod'], 'ok'],
      ['Retain', ['PV → Released, data kept'], 'ok'], ['Delete', ['disk removed with PVC'], 'bad']];
    V['volume-types'] = {
      caption: 'Access modes control who can mount a volume; lifetime and reclaim policy control how long the data lives.',
      svg: S(270, [T(10, 18, 'ACCESS MODES', 'h'), ...modes.map((m, i) => B(xs[i], 28, w, 118, m[0], m[1], i === 0 ? 'acc' : '')),
        T(10, 180, 'LIFETIME & RECLAIM POLICY', 'h'), ...life.map((m, i) => B(xs[i], 190, w, 66, m[0], m[1], m[2]))])
    };
  }
  {
    const pod = B(10, 20, 130, 64, 'Pod', ['claimName: data']);
    const pvc = B(200, 20, 170, 64, 'PVC data', ['namespaced', '1Gi · RWO · manual'], 'acc');
    const pv = B(440, 20, 170, 64, 'PV task-pv', ['cluster-wide', '2Gi · RWO · manual']);
    const st = B(660, 20, 90, 64, 'Storage', ['disk, NFS…']);
    const ph = [B(10, 160, 150, 56, 'Available', ['no claim yet']), B(210, 160, 150, 56, 'Bound', ['claimed by a PVC'], 'ok'),
      B(410, 160, 200, 56, 'Released', ['PVC deleted, data kept']), B(660, 160, 90, 56, 'Failed', ['reclaim error'], 'bad')];
    V['pv-pvc'] = {
      caption: 'The Pod only knows the claim. Kubernetes binds the claim to one matching PV.',
      svg: S(230, [pod, pvc, pv, st, R(pod, pvc, 'uses'), R(pvc, pv, 'binds', 'both'), R(pv, st),
        T(380, 112, 'A PVC binds to a PV with capacity ≥ request, the same access mode and the same storageClassName.', 'mid'),
        T(10, 148, 'PV LIFECYCLE', 'h'), ...ph, R(ph[0], ph[1]), R(ph[1], ph[2]), R(ph[2], ph[3], '', 'bad')])
    };
  }

  // ---------- Troubleshooting ----------
  {
    const rt = B(30, 46, 210, 70, 'containerd', ['systemctl status containerd', 'crictl ps -a']);
    const kl = B(280, 46, 210, 70, 'kubelet', ['systemctl status kubelet', 'journalctl -u kubelet'], 'acc');
    const cni = B(30, 150, 210, 70, 'CNI plugin', ['/etc/cni/net.d', 'CNI Pods in kube-system']);
    const res = B(280, 150, 210, 70, 'Resources', ['disk / memory / PID pressure', 'kubectl describe node']);
    const api = B(580, 46, 170, 70, 'API server', ['marks node NotReady', 'when heartbeats stop']);
    const you = B(580, 150, 170, 70, 'You', ['kubectl get nodes', 'kubectl describe node']);
    V['ts-nodes'] = {
      caption: 'What to check when a node is NotReady. The kubelet is the usual suspect.',
      svg: S(250, [G(10, 10, 500, 230, 'Worker node: check these in order'), rt, kl, cni, res, api, you,
        A(280, 81, 240, 81, 'CRI'), R(kl, api, 'heartbeat'), A(665, 150, 665, 116, 'asks')])
    };
  }
  {
    const api = B(150, 40, 180, 60, 'kube-apiserver', ['port 6443'], 'acc');
    const sch = B(30, 125, 150, 60, 'kube-scheduler', ['down → Pods Pending']);
    const cm = B(300, 125, 165, 60, 'controller-manager', ['down → no new Pods']);
    const etcd = B(150, 210, 180, 60, 'etcd', ['cluster database']);
    const kl = B(540, 50, 190, 64, 'kubelet', ['systemd service, not a Pod']);
    const kp = B(540, 135, 190, 54, 'kube-proxy', ['DaemonSet']);
    const dns = B(540, 205, 190, 54, 'CoreDNS', ['Deployment']);
    V['ts-components'] = {
      caption: 'Control-plane components run as static Pods. Their symptoms point to which one is broken.',
      svg: S(290, [G(10, 10, 470, 272, 'Control plane · /etc/kubernetes/manifests'), G(520, 10, 230, 272, 'Every node'),
        api, sch, cm, etcd, kl, kp, dns,
        A(105, 125, 190, 100), A(382, 125, 290, 100), A(240, 100, 240, 210, 'read / write', 'both'),
        A(540, 82, 330, 70, 'reports')])
    };
  }
  {
    const kl = B(10, 60, 150, 70, 'kubelet', ['/metrics/resource', 'on every node']);
    const ms = B(210, 60, 160, 70, 'metrics-server', ['keeps the latest', 'CPU & memory'], 'acc');
    const api = B(420, 60, 150, 70, 'metrics.k8s.io', ['aggregated API']);
    const top = B(620, 15, 130, 60, 'kubectl top', ['nodes / pods']);
    const hpa = B(620, 115, 130, 60, 'HPA', ['scales replicas']);
    V['ts-monitor'] = {
      caption: 'The resource metrics pipeline. Without metrics-server, both kubectl top and the HPA are blind.',
      svg: S(205, [kl, ms, api, top, hpa, R(kl, ms, 'scrapes'), R(ms, api, 'serves'), A(570, 95, 620, 45), A(570, 95, 620, 145),
        T(10, 196, 'metrics-server keeps only current values. Use Prometheus or similar for history.')])
    };
  }
  {
    const c = B(10, 30, 140, 70, 'Container', ['writes to', 'stdout / stderr'], 'acc');
    const rt = B(190, 30, 140, 70, 'containerd', ['captures streams']);
    const f = B(370, 30, 190, 70, 'Node disk', ['/var/log/pods/…', '/var/log/containers/…']);
    const kl = B(600, 30, 150, 70, 'kubelet', ['reads the files']);
    const api = B(370, 145, 190, 54, 'API server');
    const you = B(600, 145, 150, 54, 'kubectl logs', ['-c, -p, -f, --tail']);
    V['ts-logs'] = {
      caption: 'Where container logs live and how kubectl logs reaches them.',
      svg: S(215, [c, rt, f, kl, api, you, R(c, rt), R(rt, f, 'writes'), R(f, kl),
        A(600, 172, 560, 172, 'asks'), A(465, 145, 640, 100),
        B(10, 145, 320, 54, 'Log files inside the container', ['are NOT collected by kubectl logs'], 'bad')])
    };
  }
  {
    const steps = [['Pod Running & Ready?', 'kubectl get pods -o wide'],
      ['Labels match the selector?', 'kubectl get pods --show-labels'],
      ['Endpoints listed?', 'kubectl get endpoints <svc>'],
      ['targetPort = container port?', 'kubectl describe svc <svc>'],
      ['DNS name resolves?', 'kubectl exec <pod> -- nslookup <svc>'],
      ['NetworkPolicy allows it?', 'kubectl get netpol -A']];
    const items = [];
    steps.forEach(([q, cmd], i) => {
      const b = B(10, 10 + i * 58, 270, 42, `${i + 1}. ${q}`, null, i === 2 ? 'acc' : '');
      items.push(b, T(310, b.cy + 5, cmd, 'code'));
      if (i) items.push(A(145, b.y - 16, 145, b.y));
    });
    V['ts-services'] = {
      caption: 'Follow the traffic path top to bottom. Stop at the first "no": that is where to fix.',
      svg: S(360, items)
    };
  }

  // ---------- Workloads & Scheduling ----------
  {
    const dep = B(10, 100, 150, 60, 'Deployment', ['web'], 'acc');
    const v1 = B(220, 25, 180, 64, 'ReplicaSet v1', ['nginx:1.25 · 3 → 0']);
    const v2 = B(220, 170, 180, 64, 'ReplicaSet v2', ['nginx:1.27 · 0 → 3'], 'ok');
    const p1 = [B(450, 37, 80, 40, 'Pod', ['v1']), B(550, 37, 80, 40, 'Pod', ['v1']), B(650, 37, 100, 40, 'Pod', ['terminating'], 'ghost')];
    const p2 = [B(450, 182, 80, 40, 'Pod', ['v2'], 'ok'), B(550, 182, 80, 40, 'Pod', ['v2'], 'ok'), B(650, 182, 100, 40, 'Pod', ['starting'], 'ghost')];
    V['wl-deployments'] = {
      caption: 'A rolling update: the new ReplicaSet scales up while the old one scales down. The old one is kept so you can roll back.',
      svg: S(275, [dep, v1, v2, ...p1, ...p2, A(160, 120, 220, 57), A(160, 140, 220, 202), R(v1, p1[0]), R(v2, p2[0]),
        T(10, 265, 'kubectl rollout undo → scales v1 back up and v2 down.')])
    };
  }
  {
    const cm = B(10, 30, 170, 60, 'ConfigMap', ['MODE=dev']);
    const sec = B(10, 140, 170, 60, 'Secret', ['password (base64)']);
    const env = B(260, 30, 200, 60, 'As env variables', ['set at container start', 'no live update']);
    const vol = B(260, 140, 200, 60, 'As files (volume)', ['/etc/app/MODE', 'updates automatically'], 'ok');
    const ctr = B(550, 60, 200, 110, 'Container', ['$MODE, $DB_PASS', '/etc/app/*', '/etc/secret/*'], 'acc');
    V['wl-config'] = {
      caption: 'Both ConfigMaps and Secrets can be used as environment variables or as mounted files.',
      svg: S(215, [cm, sec, env, vol, ctr, R(cm, env), A(180, 70, 260, 160), A(180, 160, 260, 70), R(sec, vol),
        A(460, 60, 550, 95), A(460, 170, 550, 135)])
    };
  }
  {
    const ms = B(10, 90, 150, 60, 'metrics-server', ['CPU / memory']);
    const hpa = B(220, 90, 170, 60, 'HPA', ['compares usage', 'with the target'], 'acc');
    const dep = B(450, 90, 140, 60, 'Deployment', ['replicas: N']);
    const pods = [B(640, 50, 110, 36, 'Pod'), B(640, 102, 110, 36, 'Pod'), B(640, 154, 110, 36, 'Pod (added)', null, 'ok')];
    V['wl-autoscaling'] = {
      caption: 'The HPA control loop runs every 15 seconds.',
      svg: S(240, [T(320, 26, 'desired = ceil( current replicas × current usage ÷ target )', 'mid code'),
        T(320, 48, 'e.g. 2 × 90% ÷ 50% = 3.6 → 4 replicas', 'mid'),
        ms, hpa, dep, ...pods, R(ms, hpa, 'reads'), R(hpa, dep, 'sets'), A(590, 120, 640, 120),
        P([[695, 190], [695, 222], [85, 222], [85, 150]], 'measures Pod usage (vs. their CPU requests)')])
    };
  }
  {
    const probes = [
      B(10, 20, 240, 112, 'startupProbe', ['Has the app finished starting?', 'Fails → container restarted', 'Others wait until it passes']),
      B(260, 20, 240, 112, 'livenessProbe', ['Is the app still alive?', 'Fails → container restarted'], 'bad'),
      B(510, 20, 240, 112, 'readinessProbe', ['Can it take traffic now?', 'Fails → removed from Service', 'No restart'], 'acc')];
    const ctl = [['ReplicaSet', 'N identical Pods'], ['StatefulSet', 'stable names + storage'], ['DaemonSet', 'one Pod per node'], ['Job', 'runs to completion']];
    V['wl-selfhealing'] = {
      caption: 'Probes decide what happens to an unhealthy container; controllers recreate Pods that disappear.',
      svg: S(235, [...probes, T(10, 162, 'CONTROLLERS THAT RECREATE PODS', 'h'),
        ...ctl.map(([t, s], i) => B(10 + i * 187, 172, 177, 54, t, [s]))])
    };
  }
  {
    const cols = [10, 265, 520];
    const items = [];
    const pods = [['Pod A', 'nodeSelector: disk=ssd'], ['Pod B', 'tolerates the gpu taint'], ['Pod C', 'no rules']];
    const chips = [['label', 'disk=ssd', 'acc'], ['taint', 'gpu=true:NoSchedule', 'bad'], ['no labels or taints', '', '']];
    cols.forEach((x, i) => {
      items.push(B(x + 20, 10, 190, 50, pods[i][0], [pods[i][1]]), G(x, 90, 230, 170, `Node ${i + 1}`),
        B(x + 20, 115, 190, 50, chips[i][0], chips[i][1] ? [chips[i][1]] : null, chips[i][2]), B(x + 20, 185, 190, 50, `${pods[i][0]} runs here`, null, 'ok'),
        A(x + 115, 60, x + 115, 90, '', 'ok'));
    });
    items.push(A(580, 60, 450, 90, '✗ taint', 'bad'));
    V['wl-scheduling'] = {
      caption: 'Labels attract Pods that ask for them; taints repel every Pod without a matching toleration.',
      svg: S(270, items)
    };
  }

  // ---------- Cluster Architecture ----------
  {
    const subs = [B(10, 20, 170, 50, 'User', ['jane']), B(10, 85, 170, 50, 'Group', ['dev-team']), B(10, 150, 170, 50, 'ServiceAccount', ['dev:deployer'])];
    const rb = B(250, 75, 180, 70, 'RoleBinding', ['namespace: dev', 'subjects + roleRef'], 'acc');
    const role = B(500, 60, 250, 100, 'Role pod-reader', ['apiGroups: "" (core)', 'resources: pods', 'verbs: get, list, watch']);
    V['arch-rbac'] = {
      caption: 'A binding connects WHO (subjects) to WHAT they may do (a role).',
      svg: S(255, [...subs, rb, role, ...subs.map(s => A(s.r, s.cy, rb.x, rb.cy)), R(rb, role, 'roleRef'),
        T(10, 228, 'ClusterRole + ClusterRoleBinding work the same way, but cluster-wide.'),
        T(10, 248, 'Test it: kubectl auth can-i list pods -n dev --as jane', 'code')])
    };
  }
  {
    const layers = [['Your cluster', ['ready for kubeadm init'], 'acc'], ['kubelet · kubeadm · kubectl', ['from pkgs.k8s.io · apt-mark hold']],
      ['containerd', ['SystemdCgroup = true']], ['Kernel prep', ['swap off · br_netfilter · overlay · ip_forward=1']],
      ['Linux host', ['2 CPU · 2 GB RAM · unique hostname / MAC']]];
    V['arch-infra'] = {
      caption: 'Prepare every node from the bottom up. Open the listed ports between nodes.',
      svg: S(275, [...layers.map(([t, s, k], i) => B(10, 10 + i * 52, 480, 46, t, s, k)),
        B(520, 10, 230, 254, 'Ports to open', ['Control plane:', '6443  API server', '2379-2380  etcd', '10250  kubelet', '10257 / 10259', '', 'Workers:', '10250  kubelet', '30000-32767  NodePort'])])
    };
  }
  V['arch-kubeadm'] = {
    caption: 'Building a cluster with kubeadm, start to finish.',
    svg: S(165, [Steps(10, 30, 740, [['Prepare', ['swap off,', 'containerd']], ['kubeadm init', ['control plane']],
      ['kubeconfig', ['admin.conf →', '~/.kube/config']], ['Install CNI', ['nodes go Ready']],
      ['kubeadm join', ['on each worker']], ['Verify', ['kubectl get nodes']]]),
      T(380, 155, 'Lost the join command?  kubeadm token create --print-join-command', 'mid code')])
  };
  {
    const e1 = B(10, 190, 100, 60, 'etcd', ['running']);
    const snap = B(220, 190, 110, 60, 'snap.db', ['backup file'], 'acc');
    const dir = B(450, 190, 130, 60, 'etcd-new/', ['restored data dir']);
    const e2 = B(680, 190, 70, 60, 'etcd', ['restored'], 'ok');
    V['arch-lifecycle'] = {
      caption: 'Upgrade one node at a time, control plane first. Take an etcd snapshot before any risky change.',
      svg: S(265, [T(10, 18, 'UPGRADE · ONE MINOR VERSION AT A TIME, CONTROL PLANE FIRST', 'h'),
        Steps(10, 50, 740, [['Upgrade kubeadm', ['apt install kubeadm']], ['kubeadm upgrade', ['apply (1st CP)', 'node (others)']],
          ['Drain', ['kubectl drain']], ['Upgrade kubelet', ['+ kubectl']], ['Restart', ['daemon-reload', '+ restart kubelet']], ['Uncordon', ['kubectl uncordon']]]),
        T(10, 178, 'ETCD BACKUP & RESTORE', 'h'), e1, snap, dir, e2,
        R(e1, snap, 'snapshot save'), R(snap, dir, 'snapshot restore'), R(dir, e2, 'edit etcd.yaml')])
    };
  }
  {
    const users = B(10, 30, 170, 54, 'kubectl / users');
    const workers = B(10, 120, 170, 54, 'Worker kubelets');
    const lb = B(240, 70, 150, 64, 'Load balancer', ['LB:6443'], 'acc');
    const cps = [0, 1, 2].map(i => B(460, 10 + i * 82, 290, 70, `control-plane-${i + 1}`, ['API server · etcd (stacked)', `scheduler & CM: ${i ? 'standby' : 'leader'}`], i ? '' : 'ok'));
    V['arch-ha'] = {
      caption: 'Highly-available control plane with stacked etcd. Everyone talks to the API through the load balancer.',
      svg: S(285, [users, workers, lb, ...cps, A(180, 57, 240, 92), A(180, 147, 240, 112), ...cps.map(c => A(lb.r, lb.cy, c.x, c.cy)),
        T(10, 275, 'etcd quorum = ⌊n/2⌋ + 1  →  3 members survive 1 failure, 5 survive 2.')])
    };
  }
  {
    const h = [B(10, 30, 160, 60, 'Chart + values', ['templates/', 'values.yaml, --set']), B(220, 30, 150, 60, 'Render', ['templates → YAML']),
      B(420, 30, 160, 60, 'Kubernetes objects', ['applied to cluster']), B(630, 30, 120, 60, 'Release', ['rev 1, 2, 3…'], 'acc')];
    const base = B(10, 150, 160, 54, 'base/', ['deploy.yaml']);
    const ov = B(10, 215, 160, 54, 'overlays/prod/', ['patches, prefix, images']);
    const k = [B(220, 180, 150, 60, 'Kustomize', ['merges, no templates']), B(420, 180, 160, 60, 'Final YAML', ['prod-web · 3 replicas']),
      B(630, 180, 120, 60, 'apply -k', ['kubectl'], 'acc')];
    V['arch-helm-kustomize'] = {
      caption: 'Helm renders templates and tracks releases; Kustomize patches plain YAML. Both end as normal Kubernetes objects.',
      svg: S(280, [T(10, 18, 'HELM', 'h'), ...h, R(h[0], h[1], 'install'), R(h[1], h[2]), R(h[2], h[3]),
        T(10, 140, 'KUSTOMIZE', 'h'), base, ov, ...k, A(170, 177, 220, 200), A(170, 242, 220, 220), R(k[0], k[1]), R(k[1], k[2])])
    };
  }
  {
    const api = B(10, 100, 140, 60, 'API server');
    const kl = B(220, 100, 160, 60, 'kubelet', ['on every node'], 'acc');
    const cri = B(470, 20, 280, 60, 'CRI → containerd / CRI-O', ['runs the containers']);
    const cni = B(470, 100, 280, 60, 'CNI → Calico / Cilium / Flannel', ['Pod networking (called via the runtime)']);
    const csi = B(470, 180, 280, 60, 'CSI → storage driver', ['create, attach, mount volumes']);
    V['arch-extension'] = {
      caption: 'Kubernetes delegates to plug-ins through three standard interfaces.',
      svg: S(275, [api, kl, cri, cni, csi, R(api, kl), A(380, 130, 470, 50), A(380, 130, 470, 130), A(380, 130, 470, 210),
        T(10, 266, 'Find them: /etc/cni/net.d · crictl info · kubectl get csidrivers · kubectl get runtimeclass', 'code')])
    };
  }
  {
    const crd = B(200, 10, 160, 50, 'CRD', ['defines kind: Backup']);
    const you = B(10, 90, 130, 60, 'You', ['kubectl apply']);
    const cr = B(200, 90, 160, 60, 'Backup "nightly"', ['custom resource'], 'acc');
    const ctl = B(430, 90, 160, 60, 'Operator', ['controller watching', 'Backup objects']);
    const work = B(650, 90, 100, 60, 'Real work', ['e.g. backups'], 'ok');
    V['arch-crd'] = {
      caption: 'A CRD adds the type, and the operator\'s controller turns each object into real work.',
      svg: S(215, [crd, you, cr, ctl, work, D(crd, cr, 'allows'), R(you, cr, 'creates'), R(cr, ctl, 'watched by'), R(ctl, work, 'does'),
        P([[510, 150], [510, 192], [280, 192], [280, 150]], 'writes status back')])
    };
  }

  // ---------- Services & Networking ----------
  {
    const a = B(30, 45, 140, 60, 'Pod A', ['10.244.1.5']);
    const b = B(190, 45, 130, 60, 'Pod B', ['10.244.1.6']);
    const c = B(440, 45, 140, 60, 'Pod C', ['10.244.2.7']);
    const d = B(600, 45, 130, 60, 'Pod D', ['10.244.2.8']);
    V['net-connectivity'] = {
      caption: 'Every Pod has its own IP and reaches every other Pod directly, across nodes, with no NAT.',
      svg: S(270, [G(10, 10, 330, 200, 'Node 1 · podCIDR 10.244.1.0/24'), G(420, 10, 330, 200, 'Node 2 · podCIDR 10.244.2.0/24'),
        a, b, c, d, R(b, c, 'direct', 'both'),
        B(30, 130, 290, 64, 'Containers in one Pod', ['share one IP · talk via localhost'], 'ghost'),
        B(440, 130, 290, 64, 'Pod IPs change on restart', ['so use Services for stable names'], 'ghost'),
        B(10, 222, 740, 40, 'CNI network (overlay or routed) connects all Pod CIDRs', null, 'acc')])
    };
  }
  {
    const web = B(40, 60, 150, 60, 'web', ['tier=web']);
    const api = B(40, 160, 150, 60, 'api', ['tier=api']);
    const db = B(540, 95, 190, 90, 'db', ['tier=db', 'policies: default-deny', '+ allow from api :80'], 'acc');
    V['net-policy'] = {
      caption: 'After a default-deny, only explicitly allowed traffic reaches a Pod.',
      svg: S(250, [G(10, 10, 740, 230, 'Namespace shop'), web, api, db,
        A(190, 90, 540, 125, '✗ dropped (no rule allows web)', 'bad'), A(190, 190, 540, 160, '✓ allowed on port 80', 'ok'),
        T(740, 30, 'green = allowed · red dashed = dropped', 'end')])
    };
  }
  {
    const cl = B(10, 20, 120, 54, 'Outside client');
    const lb = B(170, 20, 140, 54, 'LoadBalancer', ['cloud IP :80']);
    const np = B(350, 20, 140, 54, 'NodePort', ['node-ip :30080']);
    const cip = B(530, 20, 160, 54, 'ClusterIP', ['10.96.0.20 :80'], 'acc');
    const ep = B(530, 125, 160, 54, 'EndpointSlice', ['Ready Pods only']);
    const pods = [B(400, 225, 110, 50, 'Pod', ['app=web :8080'], 'ok'), B(530, 225, 110, 50, 'Pod', ['app=web :8080'], 'ok'), B(650, 225, 100, 50, 'Pod', ['not Ready'], 'ghost')];
    const inpod = B(10, 125, 150, 54, 'Pod in cluster', ['web.default.svc']);
    V['net-services'] = {
      caption: 'Service types stack: LoadBalancer builds on NodePort, which builds on ClusterIP. Traffic ends at Ready Pods on the targetPort.',
      svg: S(285, [cl, lb, np, cip, ep, ...pods, inpod, R(cl, lb), R(lb, np), R(np, cip), D(cip, ep, 'selector app=web'),
        A(560, 179, 455, 225), A(610, 179, 585, 225), A(160, 150, 530, 70, 'by DNS name'),
        T(10, 240, 'Service port 80 → targetPort 8080'), T(10, 260, 'Unready Pods are left out of the endpoints')])
    };
  }
  {
    const gc = B(10, 40, 200, 70, 'GatewayClass eg', ['controller: Envoy Gateway']);
    const gw = B(280, 40, 200, 70, 'Gateway web-gw', ['listener HTTP :80'], 'acc');
    const rt = B(550, 40, 200, 70, 'HTTPRoute app', ['host app.example.com', 'parentRefs: web-gw']);
    const v1 = B(520, 170, 110, 54, 'Service v1', ['weight 90'], 'ok');
    const v2 = B(640, 170, 110, 54, 'Service v2', ['weight 10']);
    const cl = B(280, 170, 200, 54, 'Client', ['Host: app.example.com']);
    V['net-gateway'] = {
      caption: 'Gateway API splits ownership: the infrastructure provider, the cluster operator and app developers each own one resource.',
      svg: S(235, [T(110, 22, 'Infrastructure provider', 'mid'), T(380, 22, 'Cluster operator', 'mid'), T(650, 22, 'App developer', 'mid'),
        gc, gw, rt, v1, v2, cl, R(gc, gw, 'implements'), A(550, 75, 480, 75, 'attaches'), A(380, 170, 380, 110, 'request'),
        A(620, 110, 575, 170), A(680, 110, 695, 170)])
    };
  }
  {
    const cl = B(10, 85, 150, 60, 'Client', ['fruit.example.com/apple']);
    const ing = B(210, 5, 180, 54, 'Ingress fruit', ['rules + ingressClassName']);
    const ctl = B(210, 85, 180, 70, 'Ingress controller', ['ingress-nginx Pods', 'exposed by NodePort / LB'], 'acc');
    const sa = B(450, 45, 150, 54, 'Service apple', ['path /apple']);
    const sb = B(450, 135, 150, 54, 'Service banana', ['path /banana']);
    const pa = B(650, 45, 100, 54, 'Pods', null, 'ok');
    const pb = B(650, 135, 100, 54, 'Pods', null, 'ok');
    V['net-ingress'] = {
      caption: 'The Ingress object only holds rules. The controller is the proxy that applies them.',
      svg: S(200, [cl, ing, ctl, sa, sb, pa, pb, A(160, 115, 210, 120), D(ing, ctl, 'read by'),
        A(390, 110, 450, 72), A(390, 130, 450, 162), R(sa, pa), R(sb, pb)])
    };
  }
  {
    const pod = B(10, 60, 160, 70, 'Pod', ['/etc/resolv.conf:', 'nameserver 10.96.0.10']);
    const svc = B(220, 60, 160, 70, 'kube-dns Service', ['10.96.0.10 :53']);
    const dns = B(430, 60, 160, 70, 'CoreDNS Pods', ['Corefile in the', 'coredns ConfigMap'], 'acc');
    const inC = B(640, 15, 110, 60, 'cluster.local', ['answered from', 'the API'], 'ok');
    const out = B(640, 115, 110, 60, 'Other names', ['forwarded', 'upstream']);
    V['net-coredns'] = {
      caption: 'How a Pod resolves a name, and how a Service name is built.',
      svg: S(250, [pod, svc, dns, inC, out, R(pod, svc, 'query'), R(svc, dns), A(590, 85, 640, 45), A(590, 105, 640, 145),
        T(10, 172, 'ANATOMY OF A SERVICE NAME', 'h'),
        B(10, 182, 90, 50, 'web', ['service'], 'acc'), B(108, 182, 110, 50, 'default', ['namespace']),
        B(226, 182, 70, 50, 'svc', ['fixed']), B(304, 182, 150, 50, 'cluster.local', ['cluster domain']),
        T(470, 205, 'Same namespace: just "web"'), T(470, 225, 'Other namespace: "web.default"')])
    };
  }

  window.COURSE_VISUALS = V;
})();
