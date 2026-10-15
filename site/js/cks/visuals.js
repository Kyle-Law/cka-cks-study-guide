// One diagram per CKS topic, drawn as inline SVG so it follows the light/dark theme (see .visual rules in style.css).
(function () {
  const { B, A, R, D, P, G, T, Steps, S } = window.SVGKIT;

  const V = {};

  // ---------- Cluster Setup ----------
  {
    const fe = B(30, 50, 140, 60, 'frontend', ['tier=frontend']);
    const be = B(220, 50, 140, 60, 'backend', ['tier=backend'], 'acc');
    const db = B(410, 50, 140, 60, 'db', ['tier=db']);
    const dns = B(610, 46, 140, 68, 'kube-dns', ['kube-system', 'UDP/TCP 53'], 'ok');
    V['cs-netpol'] = {
      caption: 'Default-deny blocks everything; each allow policy opens exactly one path. DNS needs its own egress rule.',
      svg: S(250, [G(10, 10, 560, 190, 'namespace app · default-deny ingress + egress'), fe, be, db, dns,
        R(fe, be, 'port 80', 'ok'), R(be, db, 'port 80', 'ok'), R(db, dns, '53', 'ok'),
        P([[100, 110], [100, 160], [480, 160], [480, 110]], 'frontend → db: no policy allows it', 'bad'),
        T(10, 232, 'allow-dns selects every Pod (podSelector: {}), so all of them can still resolve names.')])
    };
  }
  {
    const kb = B(10, 92, 140, 64, 'kube-bench', ['run --targets', 'master / node'], 'acc');
    const pass = B(200, 20, 120, 48, 'PASS', ['nothing to do'], 'ok');
    const fail = B(200, 100, 120, 48, 'FAIL', ['e.g. 1.2.18'], 'bad');
    const warn = B(200, 180, 120, 48, 'WARN', ['check by hand'], 'ghost');
    const rem = B(370, 92, 150, 64, 'Remediation', ['file + setting', 'to change']);
    const cp = B(560, 30, 190, 64, 'Control plane', ['/etc/kubernetes/', 'manifests/*.yaml']);
    const kl = B(560, 150, 190, 64, 'kubelet', ['/var/lib/kubelet/', 'config.yaml']);
    V['cs-cis'] = {
      caption: 'kube-bench grades each CIS check. Every FAIL tells you which file to edit; re-run to confirm the fix.',
      svg: S(275, [kb, pass, fail, warn, rem, cp, kl,
        A(150, 124, 200, 44), R(kb, fail), A(150, 124, 200, 204), R(fail, rem),
        A(520, 124, 560, 62), A(520, 124, 560, 182),
        P([[655, 214], [655, 258], [80, 258], [80, 156]], 're-run kube-bench to confirm PASS', 'ok')])
    };
  }
  {
    const cl = B(10, 50, 110, 64, 'Client', ['browser / curl']);
    const ic = B(210, 40, 180, 84, 'Ingress controller', ['terminates TLS', 'host: web.example.com'], 'acc');
    const svc = B(460, 50, 120, 64, 'Service', ['ClusterIP']);
    const pods = B(640, 50, 110, 64, 'Pods', ['plain HTTP']);
    const sec = B(210, 170, 180, 64, 'Secret web-tls', ['type kubernetes.io/tls', 'tls.crt + tls.key']);
    V['cs-ingress-tls'] = {
      caption: 'The Ingress controller holds the certificate (from a TLS Secret), decrypts HTTPS and forwards plain HTTP inside the cluster.',
      svg: S(250, [cl, ic, svc, pods, sec, R(cl, ic, 'HTTPS :443', 'ok'), R(ic, svc, 'HTTP'), R(svc, pods),
        A(300, 170, 300, 124, 'cert + key'),
        B(10, 170, 150, 64, 'Port 80', ['redirected (308)', 'to HTTPS'], 'ghost'),
        B(450, 170, 300, 64, 'Same namespace as the Ingress', ['tls.hosts must match rules.host', 'and the certificate names'], 'ghost')])
    };
  }
  {
    const pod = B(10, 100, 160, 64, 'Compromised Pod', ['any namespace'], 'bad');
    const np = B(250, 20, 220, 64, 'Egress NetworkPolicy', ['except 169.254.169.254/32'], 'ok');
    const fw = B(250, 200, 220, 64, 'Host firewall', ['10250 + 2379 only from', 'the control plane'], 'ok');
    const meta = B(560, 20, 190, 64, 'Cloud metadata', ['169.254.169.254', 'node IAM credentials']);
    const kl = B(560, 110, 190, 64, 'kubelet :10250', ['anonymous: false', 'authz: Webhook'], 'acc');
    const etcd = B(560, 200, 190, 64, 'etcd :2379', ['only from API server']);
    V['cs-metadata'] = {
      caption: 'A compromised Pod must not reach the metadata IP, the kubelet API or etcd. Block each path at a different layer.',
      svg: S(280, [pod, np, fw, meta, kl, etcd,
        A(170, 115, 250, 62), R(np, meta, 'blocked', 'bad'),
        A(170, 140, 560, 142, '401 / 403 without credentials', 'bad'),
        A(170, 150, 250, 225), R(fw, etcd, 'blocked', 'bad')])
    };
  }
  {
    const bin = B(10, 30, 190, 64, 'kubectl', ['downloaded binary']);
    const sum = B(10, 130, 190, 64, 'kubectl.sha256', ['published on dl.k8s.io'], 'acc');
    const chk = B(270, 80, 200, 64, 'sha256sum --check', ['compare the two hashes']);
    const ok = B(550, 20, 200, 64, 'kubectl: OK', ['install and use it'], 'ok');
    const bad = B(550, 140, 200, 64, 'kubectl: FAILED', ['delete, download again'], 'bad');
    V['cs-binaries'] = {
      caption: 'Compare the file with the official checksum for the same version and architecture. Any mismatch means don\'t use it.',
      svg: S(245, [bin, sum, chk, ok, bad, A(200, 62, 270, 100), A(200, 162, 270, 124),
        A(470, 104, 550, 52, '', 'ok'), A(470, 120, 550, 172, '', 'bad'),
        T(10, 232, 'Check: echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check', 'code')])
    };
  }

  // ---------- Cluster Hardening ----------
  {
    const xs = [10, 260, 510], w = 240;
    const danger = [['get / list secrets', ['reads every secret value']], ['create pods', ['can mount any Secret or SA']],
      ['pods/exec', ['a shell in running Pods']], ['bind / escalate', ['grant yourself more rights']],
      ['impersonate', ['act as another user or SA']], ['nodes/proxy', ['kubelet API on every node']]];
    const good = [['Role + RoleBinding', ['one namespace, exact verbs'], 'ok'], ['auth can-i --list --as', ['audit what a subject can do'], 'ok'],
      ['cluster-admin binding', ['never for apps or people'], 'bad']];
    V['ch-rbac'] = {
      caption: 'These permissions look narrow but are as good as admin. Grant them only when there is no other way.',
      svg: S(265, [T(10, 18, 'AS GOOD AS ADMIN', 'h'),
        ...danger.map((d, i) => B(xs[i % 3], 28 + Math.floor(i / 3) * 70, w, 60, d[0], d[1], 'bad')),
        T(10, 186, 'INSTEAD', 'h'), ...good.map((g, i) => B(xs[i], 196, w, 60, g[0], g[1], g[2]))])
    };
  }
  {
    const p1 = B(30, 40, 320, 64, 'Pod', ['serviceAccountName: default (implicit)']);
    const t1 = B(30, 140, 320, 64, 'Token mounted', ['/var/run/secrets/kubernetes.io/', 'serviceaccount/token'], 'bad');
    const p2 = B(410, 40, 320, 64, 'Pod', ['serviceAccountName: web'], 'acc');
    const t2 = B(410, 140, 320, 64, 'No token in the container', ['automountServiceAccountToken: false'], 'ok');
    V['ch-sa'] = {
      caption: 'By default every Pod carries an API token. If the app never calls the API, turn automounting off.',
      svg: S(260, [G(10, 10, 360, 236, 'Default'), G(390, 10, 360, 236, 'Hardened'), p1, t1, p2, t2, D(p1, t1), D(p2, t2),
        T(30, 232, 'stolen token → API calls as that SA'), T(410, 232, 'need one? kubectl create token --duration=15m')])
    };
  }
  {
    const w = 125, xs = [10, 165, 320, 475, 630];
    const req = B(xs[0], 40, w, 84, 'Request', ['kubectl / Pod', 'port 6443']);
    const an = B(xs[1], 40, w, 84, 'Authn', ['who are you?', 'certs / OIDC'], 'acc');
    const az = B(xs[2], 40, w, 84, 'Authz', ['may you do it?', 'Node,RBAC'], 'acc');
    const ad = B(xs[3], 40, w, 84, 'Admission', ['mutate, then', 'validate'], 'acc');
    const etcd = B(xs[4], 40, w, 84, 'etcd', ['object stored'], 'ok');
    const r1 = B(xs[1], 170, w, 50, '401', ['unknown user'], 'bad');
    const r2 = B(xs[2], 170, w, 50, '403', ['not allowed'], 'bad');
    const r3 = B(xs[3], 170, w, 50, 'Rejected', ['policy says no'], 'bad');
    V['ch-api'] = {
      caption: 'Every API request passes three gates in order. Harden each one and keep port 6443 off the internet.',
      svg: S(260, [req, an, az, ad, etcd, r1, r2, r3, R(req, an), R(an, az), R(az, ad), R(ad, etcd),
        D(an, r1, '', 'bad'), D(az, r2, '', 'bad'), D(ad, r3, '', 'bad'),
        T(10, 250, 'Never AlwaysAllow · no roles for system:anonymous · kubernetes Service stays ClusterIP')])
    };
  }
  {
    const xs = [10, 197, 384, 571], w = 179;
    const vs = [['N-3', ['no more patches', 'upgrade now'], 'bad'], ['N-2', ['patched', 'oldest supported'], 'ok'],
      ['N-1', ['patched'], 'ok'], ['N (newest)', ['patched'], 'ok']];
    V['ch-upgrade'] = {
      caption: 'Only the three newest minor versions get security patches. Upgrade one minor at a time, control plane first.',
      svg: S(275, [T(10, 18, 'SUPPORTED MINOR VERSIONS', 'h'), ...vs.map((v, i) => B(xs[i], 28, w, 70, v[0], v[1], v[2])),
        T(10, 140, 'KUBEADM UPGRADE ORDER (CONTROL PLANE, THEN EACH NODE)', 'h'),
        Steps(10, 180, 740, [['kubeadm', ['package']], ['upgrade plan'], ['upgrade apply', ['or upgrade node']],
          ['drain'], ['kubelet', ['+ kubectl']], ['uncordon']])])
    };
  }

  // ---------- System Hardening ----------
  {
    const extra = [['kubelet', ''], ['containerd', ''], ['sshd', ''], ['apache2', 'bad'], ['cups', 'bad'], ['vsftpd', 'bad'],
      ['gcc / make', 'bad'], ['snapd', 'bad'], ['telnet', 'bad']];
    const min = ['kubelet', 'containerd', 'CNI agent', 'sshd (admin)'];
    V['sh-footprint'] = {
      caption: 'Every extra package, service and port is attack surface. A node should run only what Kubernetes needs.',
      svg: S(290, [G(10, 10, 420, 200, 'General-purpose node'), G(450, 10, 300, 200, 'Minimal node'),
        ...extra.map((e, i) => B(30 + (i % 3) * 130, 40 + Math.floor(i / 3) * 56, 120, 44, e[0], [], e[1])),
        ...min.map((m, i) => B(470 + (i % 2) * 140, 40 + Math.floor(i / 2) * 56, 125, 44, m, [], 'ok')),
        T(470, 172, 'fewer packages, services,'), T(470, 192, 'open ports and users'),
        T(10, 245, 'find:   systemctl list-units --state=running · ss -tlnp · dpkg -l', 'code'),
        T(10, 268, 'remove: systemctl disable --now <svc> · apt purge <pkg> · userdel -r', 'code')])
    };
  }
  {
    const rows = [['Cloud', ['IAM'], 'Pods get their own identity (IRSA, Workload ID)', ['node role: only what kubelet + CNI need']],
      ['Linux', ['node users'], 'No root SSH login, keys not passwords', ['minimal sudo, no shared accounts']],
      ['Kubernetes', ['API users'], 'Per-person credentials (OIDC)', ['narrow RBAC, no shared admin.conf']],
      ['Container', ['process'], 'runAsNonRoot · drop ALL capabilities', ['allowPrivilegeEscalation: false']]];
    V['sh-iam'] = {
      caption: 'Least privilege at every layer: an attacker who breaks one layer should find nothing extra to use in the next.',
      svg: S(265, rows.flatMap((r, i) => [B(10, 15 + i * 62, 170, 52, r[0], r[1], 'acc'), B(210, 15 + i * 62, 540, 52, r[2], r[3]),
        A(180, 41 + i * 62, 210, 41 + i * 62)]))
    };
  }
  {
    const inet = B(10, 40, 130, 64, 'Internet', ['users']);
    const admin = B(10, 170, 130, 64, 'Admin network', ['VPN / bastion']);
    const fw = B(200, 20, 120, 230, 'Firewall', ['default deny', 'incoming'], 'acc');
    const ing = B(400, 40, 160, 56, 'Ingress / Gateway', [':443'], 'ok');
    const svc = B(590, 40, 140, 56, 'Services', ['ClusterIP']);
    const api = B(400, 118, 330, 56, 'API server :6443 · SSH :22', ['admin CIDR only']);
    const np = B(400, 192, 330, 56, 'NodePort / hostPort / hostNetwork', ['avoid: they bypass the entry point'], 'bad');
    V['sh-network'] = {
      caption: 'One controlled entry point for users, admin ports only from admin networks, and nothing else reachable.',
      svg: S(270, [G(380, 10, 370, 250, 'Cluster (private subnet)'), inet, admin, fw, ing, svc, api, np,
        A(140, 72, 200, 72, 'HTTPS'), A(140, 202, 200, 202, '22, 6443'),
        A(320, 68, 400, 68, '', 'ok'), R(ing, svc), A(320, 146, 400, 146, '', 'ok'), A(320, 220, 400, 220, '', 'bad')])
    };
  }
  {
    const proc = B(10, 50, 130, 64, 'Container', ['process']);
    const sc = B(190, 50, 160, 64, 'seccomp', ['which syscalls?', 'RuntimeDefault'], 'acc');
    const aa = B(400, 50, 160, 64, 'AppArmor', ['which files, caps,', 'network?'], 'acc');
    const k = B(610, 50, 140, 64, 'Host kernel', ['shared by all', 'containers']);
    const b1 = B(190, 160, 160, 50, 'Blocked', ['mount, keyctl, kexec…'], 'bad');
    const b2 = B(400, 160, 160, 50, 'Denied', ['write /etc, raw net'], 'bad');
    V['sh-kernel'] = {
      caption: 'Containers share the host kernel. seccomp filters the syscall itself; AppArmor checks what the call touches.',
      svg: S(285, [proc, sc, aa, k, b1, b2, R(proc, sc, 'syscall'), R(sc, aa, 'allowed', 'ok'), R(aa, k, 'allowed', 'ok'),
        D(sc, b1, '', 'bad'), D(aa, b2, '', 'bad'),
        T(10, 248, 'seccompProfile:  {type: RuntimeDefault}   # or Localhost: profiles/x.json', 'code'),
        T(10, 270, 'appArmorProfile: {type: Localhost, localhostProfile: k8s-deny-write}', 'code')])
    };
  }

  // ---------- Microservice Vulnerabilities ----------
  {
    const p = B(10, 30, 230, 84, 'privileged', ['no restrictions', 'system / infra only'], 'bad');
    const b = B(265, 30, 230, 84, 'baseline', ['no privileged, hostPath,', 'hostNetwork, hostPorts']);
    const r = B(520, 30, 230, 84, 'restricted', ['+ non-root, drop ALL,', 'seccomp, no escalation'], 'ok');
    V['mv-pss'] = {
      caption: 'Three levels, three modes. A namespace label picks the level for each mode.',
      svg: S(285, [T(10, 18, 'LEVELS (LEAST → MOST SECURE)', 'h'), p, b, r, R(p, b), R(b, r),
        T(10, 150, 'MODES', 'h'),
        B(10, 162, 230, 64, 'enforce', ['the Pod is rejected'], 'acc'), B(265, 162, 230, 64, 'warn', ['kubectl prints a warning']),
        B(520, 162, 230, 64, 'audit', ['entry in the audit log']),
        T(10, 262, 'kubectl label ns app pod-security.kubernetes.io/enforce=restricted', 'code')])
    };
  }
  {
    const row = (y, api, etcd, bk, k) => {
      const a = B(10, y, 140, 56, 'kubectl apply', ['Secret (base64)']);
      const b = B(200, y, 160, 56, 'kube-apiserver', [api], k === 'ok' ? 'acc' : '');
      const c = B(410, y, 160, 56, 'etcd', [etcd], k);
      const d = B(620, y, 130, 56, 'etcd backup', [bk], k);
      return [a, b, c, d, R(a, b), R(b, c), R(c, d)];
    };
    V['mv-secrets'] = {
      caption: 'Without an EncryptionConfiguration, anyone with etcd or a backup reads every Secret. With it, etcd holds only ciphertext.',
      svg: S(305, [T(10, 18, 'WITHOUT ENCRYPTION AT REST', 'h'), ...row(28, 'identity (none)', 'plaintext value', 'readable', 'bad'),
        T(10, 118, 'WITH ENCRYPTIONCONFIGURATION', 'h'), ...row(128, 'encrypts: aescbc', 'k8s:enc:aescbc:v1:…', 'ciphertext', 'ok'),
        A(280, 220, 280, 184),
        B(10, 220, 360, 72, 'EncryptionConfiguration', ['providers: aescbc, then identity {}', 'first encrypts · all can decrypt'], 'ghost'),
        B(390, 220, 360, 72, 'Existing Secrets stay plaintext', ['until rewritten:', 'get secrets -A -o json | replace -f -'], 'ghost')])
    };
  }
  {
    const cols = [[10, 'runc (default)', 'No extra layer', ['one exploit = node escape'], 'bad'],
      [262, 'gVisor (runsc)', 'Sentry', ['user-space kernel', 'handles syscalls'], 'acc'],
      [514, 'Kata Containers', 'Guest kernel', ['inside a small VM'], 'ok']];
    V['mv-isolation'] = {
      caption: 'runc lets containers call the host kernel directly. gVisor and Kata put another kernel in between.',
      svg: S(320, [...cols.flatMap(([x, g, t, s, k]) => {
        const c = B(x + 20, 40, 196, 50, 'Container', ['app process']), l = B(x + 20, 130, 196, 64, t, s, k);
        return [G(x, 10, 236, 205, g), c, l, D(c, l, 'syscalls'), A(x + 118, 194, x + 118, 235, '', k === 'bad' ? 'bad' : '')];
      }), B(10, 235, 740, 50, 'Host kernel', ['shared by every Pod on the node']),
      T(10, 310, 'Choose per Pod: RuntimeClass {handler: runsc} + spec.runtimeClassName: gvisor', 'code')])
    };
  }
  {
    const row = (y, g1, g2, a1, a2, b1, b2, label) => {
      const pa = B(25, y + 28, 125, 50, a1[0], [a1[1]]), xa = B(165, y + 28, 130, 50, a2[0], [a2[1]], 'acc');
      const xb = B(465, y + 28, 130, 50, b2[0], [b2[1]], 'acc'), pb = B(610, y + 28, 125, 50, b1[0], [b1[1]]);
      return [G(10, y, 300, 92, g1), G(450, y, 300, 92, g2), pa, xa, xb, pb, R(pa, xa), R(xa, xb, label, 'ok'), R(xb, pb)];
    };
    V['mv-mtls'] = {
      caption: 'Encrypt between nodes with the CNI (no identity), or between workloads with a mesh (each side proves who it is).',
      svg: S(300, [T(10, 18, 'CNI ENCRYPTION (CILIUM / CALICO WIREGUARD)', 'h'),
        ...row(28, 'Node 1', 'Node 2', ['Pod A', 'plain'], ['cilium', 'encrypts'], ['Pod B', 'plain'], ['cilium', 'decrypts'], 'WireGuard'),
        T(10, 148, 'SERVICE MESH mTLS (ISTIO)', 'h'),
        ...row(158, 'Pod frontend', 'Pod backend', ['app', 'plain HTTP'], ['Envoy', 'sa/frontend'], ['app', 'plain HTTP'], ['Envoy', 'sa/backend'], 'mTLS'),
        T(10, 285, 'PeerAuthentication mtls.mode: STRICT = mTLS only · PERMISSIVE = also plaintext (migration)')])
    };
  }

  // ---------- Supply Chain ----------
  {
    const bars = [['golang:1.23', 440, '≈ 800 MB · compiler, shell, apt', 'bad'], ['debian:12-slim', 42, '≈ 75 MB · shell + apt', ''],
      ['alpine:3.20', 8, '≈ 8 MB · busybox shell', ''], ['distroless/static', 4, '≈ 2 MB · no shell, no package manager', 'ok']];
    const build = B(10, 215, 220, 64, 'FROM golang:1.23 AS build', ['go build -o /app']);
    const bin = B(290, 215, 170, 64, '/app', ['static binary'], 'acc');
    const fin = B(520, 215, 230, 64, 'FROM distroless/static', [':nonroot · COPY --from=build'], 'ok');
    V['sc-base'] = {
      caption: 'Build in a big image, ship only the binary. The runtime image has nothing an attacker can use.',
      svg: S(295, [T(10, 18, 'APPROXIMATE IMAGE SIZE', 'h'),
        ...bars.flatMap(([n, w, t, k], i) => [T(10, 48 + i * 38, n), B(150, 30 + i * 38, w, 26, '', [], k),
          T(w > 300 ? 162 : 162 + w, 48 + i * 38, t)]),
        T(10, 200, 'MULTI-STAGE BUILD', 'h'), build, bin, fin, R(build, bin), R(bin, fin, 'COPY')])
    };
  }
  {
    const st = [['Source', ['malicious', 'commit'], ['reviews,', 'signed commits']], ['Dependencies', ['typosquatted', 'package'], ['pin versions,', 'scan']],
      ['CI build', ['compromised', 'runner'], ['short-lived', 'credentials']], ['Image + SBOM', ['unpatched', 'CVEs'], ['SBOM +', 'provenance']],
      ['Registry', ['tag', 'overwritten'], ['private,', 'immutable tags']], ['Deploy', ['unverified', 'image'], ['verify', 'signatures']]];
    const step = 740 / st.length;
    V['sc-understand'] = {
      caption: 'Every step from commit to Pod can be attacked. An SBOM tells you what is inside, so you can answer "are we affected?"',
      svg: S(275, [Steps(10, 30, 740, st.map(s => [s[0]])),
        ...st.flatMap((s, i) => {
          const x = 10 + i * step + step / 2 - 56;
          return [B(x, 98, 112, 72, 'risk', s[1], 'bad'), B(x, 190, 112, 72, 'defence', s[2], 'ok')];
        })])
    };
  }
  {
    const ci = B(10, 40, 150, 64, 'CI pipeline', ['build + push']);
    const sg = B(200, 40, 150, 64, 'cosign sign', ['--key cosign.key', 'image@sha256:…'], 'acc');
    const reg = B(390, 40, 150, 64, 'Registry', ['image + signature']);
    const adm = B(580, 30, 170, 84, 'Admission', ['allowed registry?', 'signature valid?'], 'acc');
    const run = B(580, 170, 170, 56, 'Pod runs', ['trusted image'], 'ok');
    const rej = B(370, 170, 170, 56, 'Rejected', ['unsigned / untrusted'], 'bad');
    V['sc-secure'] = {
      caption: 'Sign in CI, verify at admission. Images from other registries or without a valid signature never start.',
      svg: S(250, [ci, sg, reg, adm, run, rej, R(ci, sg), R(sg, reg), R(reg, adm, 'pull'), D(adm, run, 'yes', 'ok'),
        A(600, 114, 500, 170, '', 'bad'),
        B(10, 150, 320, 84, 'Policy engines', ['ValidatingAdmissionPolicy (CEL)', 'Kyverno verifyImages · ImagePolicyWebhook'], 'ghost')])
    };
  }
  {
    const rows = [['trivy image', 'Known CVEs in image packages', ['--severity HIGH,CRITICAL · --ignore-unfixed']],
      ['trivy config', 'Misconfig in YAML and Dockerfiles', ['root user, latest tag, privileged']],
      ['kubesec scan', 'Risk score for one manifest', ['critical: privileged · advise: readOnlyRootFS']],
      ['kube-linter lint', 'Best-practice checks (YAML, Helm)', ['run-as-non-root, latest-tag, no limits']]];
    V['sc-static'] = {
      caption: 'Each scanner looks at something different. Run them in CI, before anything reaches the cluster.',
      svg: S(295, [...rows.flatMap((r, i) => {
        const a = B(10, 15 + i * 62, 190, 52, r[0], [], 'acc'), b = B(250, 15 + i * 62, 500, 52, r[1], r[2]);
        return [a, b, R(a, b)];
      }), T(10, 282, 'Static analysis → admission control (block what fails) → runtime detection (Falco)')])
    };
  }

  // ---------- Runtime Security ----------
  {
    const c = B(10, 30, 170, 64, 'Container', ['runs bash,', 'reads /etc/shadow'], 'bad');
    const k = B(10, 150, 170, 64, 'Kernel', ['every syscall']);
    const pr = B(230, 150, 170, 64, 'eBPF probe', ['modern_ebpf'], 'acc');
    const rules = B(450, 20, 190, 64, 'Rules', ['falco_rules.yaml', '+ .local.yaml overrides']);
    const eng = B(450, 140, 190, 84, 'Falco engine', ['match rules +', 'Pod / ns metadata'], 'acc');
    const al = B(370, 262, 350, 64, 'Alert', ['Notice Shell in container (pod=web ns=prod)', 'journal · Pod logs · file · HTTP'], 'ok');
    V['rt-behavior'] = {
      caption: 'Falco reads syscalls through eBPF, adds Kubernetes context, and raises an alert when a rule\'s condition matches.',
      svg: S(340, [c, k, pr, rules, eng, al, D(c, k, 'syscalls'), R(k, pr, 'events'), R(pr, eng), D(rules, eng, 'loads'), D(eng, al),
        T(10, 296, 'rule: condition · output · priority', 'code')])
    };
  }
  {
    const rows = [['Cloud', 'CloudTrail / Cloud Audit Logs', ['metadata IP access, IAM key use']],
      ['Cluster', 'Kubernetes audit log', ['Secret reads, exec, new bindings']],
      ['Container', 'Falco / Tetragon', ['shells, file writes, odd processes']],
      ['Code + network', 'App logs, Hubble flows', ['DNS to odd domains, egress drops']]];
    V['rt-detect'] = {
      caption: 'Each layer of the 4Cs has its own signal source. Collect them all off the node, where an attacker can\'t erase them.',
      svg: S(300, [...rows.flatMap((r, i) => {
        const y = 20 + i * 60, a = B(10, y, 150, 50, r[0], [], 'acc'), b = B(180, y, 380, 50, r[1], r[2]);
        return [a, b, R(a, b), A(560, y + 25, 610, y + 25)];
      }), B(610, 20, 140, 230, 'Central store', ['SIEM, off the node', '', 'correlate across', 'layers'], 'ok'),
      T(10, 285, 'Red flags: privileged Pods · exec into Pods · new ClusterRoleBindings · 100% CPU (miners)')])
    };
  }
  {
    const xs = [10, 200, 390, 580], w = 170;
    const r1 = [['Initial access', ['leaked kubeconfig,', 'vulnerable app']], ['Execution', ['kubectl exec,', 'new Pod / Job']],
      ['Persistence', ['backdoor DaemonSet,', 'CronJob, static Pod']], ['Privilege escalation', ['privileged Pod,', 'hostPath /']]]
      .map((r, i) => B(xs[i], 30, w, 64, r[0], r[1], 'bad'));
    const r2 = [['Credential access', ['Secrets, SA tokens,', 'cloud metadata'], 'bad'], ['Lateral movement', ['other Pods,', 'nodes, cloud'], 'bad'],
      ['Impact', ['data theft,', 'cryptomining'], 'bad'], ['Respond', ['isolate · revoke ·', 'keep evidence'], 'ok']]
      .map((r, i) => B(xs[i], 140, w, 64, r[0], r[1], r[2]));
    V['rt-attack'] = {
      caption: 'Attacks move through recognisable phases. Knowing where you are in the chain tells you what to look for next.',
      svg: S(255, [T(10, 18, 'MITRE ATT&CK / THREAT MATRIX FOR KUBERNETES', 'h'), ...r1, ...r2,
        R(r1[0], r1[1]), R(r1[1], r1[2]), R(r1[2], r1[3]), P([[665, 94], [665, 117], [95, 117], [95, 140]]),
        R(r2[0], r2[1]), R(r2[1], r2[2]), R(r2[2], r2[3], '', 'ok'),
        T(10, 240, 'Rebuild the timeline from the audit log: user.username · sourceIPs · verb · objectRef · time')])
    };
  }
  {
    const root = B(30, 45, 440, 64, 'Root filesystem (from the image)', ['read-only: no new tools, no edited binaries'], 'ok');
    const dirs = ['/tmp', '/var/cache/nginx', '/var/run'].map((d, i) => B(30 + i * 150, 140, 140, 64, d, ['emptyDir'], 'acc'));
    const a1 = B(530, 30, 220, 64, 'apt install curl', ['Read-only file system'], 'bad');
    const a2 = B(530, 115, 220, 64, 'overwrite /usr/bin/ls', ['denied'], 'bad');
    V['rt-immutable'] = {
      caption: 'The image is read-only at runtime. The app writes only to small emptyDir volumes, so attackers can\'t install or modify tools.',
      svg: S(270, [G(10, 10, 480, 250, 'Container · readOnlyRootFilesystem: true'), root, ...dirs, a1, a2,
        A(530, 62, 470, 70, '', 'bad'), A(530, 147, 470, 95, '', 'bad'),
        T(30, 240, 'writable only where the app must write'),
        B(530, 200, 220, 60, '+ runAsNonRoot', ['no escalation, drop ALL'], 'ok')])
    };
  }
  {
    const req = B(10, 96, 150, 64, 'API request', ['get secret db-pass']);
    const rules = [['1. None', ['system:kube-proxy watches'], ''], ['2. Metadata', ['resources: secrets, configmaps'], 'acc'],
      ['3. RequestResponse', ['rbac, pods in kube-system'], ''], ['4. Metadata', ['catch-all'], '']]
      .map((r, i) => B(205, 40 + i * 54, 270, 46, r[0], r[1], r[2]));
    const log = B(530, 40, 220, 84, 'audit.log', ['one JSON line per event', 'Metadata: no body'], 'ok');
    const jq = B(530, 170, 220, 84, 'jq', ['select(.objectRef.resource', '=="secrets") | .user.username'], 'acc');
    V['rt-audit'] = {
      caption: 'Rules are checked top to bottom and the first match sets the level. Secrets match rule 2, so only metadata is logged.',
      svg: S(270, [G(190, 10, 300, 252, 'policy.yaml · first match wins'), req, ...rules, log, jq,
        A(160, 128, 205, 117), A(475, 117, 530, 90), D(log, jq, 'query')])
    };
  }

  window.COURSE_VISUALS = V;
})();
