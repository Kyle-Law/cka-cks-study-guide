// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'system', title: 'System Hardening', weight: 10,
  topics: [
    {
      id: 'sh-footprint',
      title: 'Minimize host OS footprint',
      basics: {
        summary: "Every package, running service, open port and user account on a node is something an attacker could abuse. A node should run **only what Kubernetes needs**. Remove or disable everything else.",
        ideas: [
          "**Fewer packages** means fewer vulnerabilities to patch.",
          "**Stop and disable** services you don't need (`systemctl disable --now`).",
          "**Find open ports** with `ss -tlnp` and close what isn't required.",
          "Consider **minimal OSes** built for containers (Bottlerocket, Flatcar, Talos)."
        ]
      },
      points: [
        "Attack surface = installed packages + running services + listening ports + user accounts + kernel modules.",
        "List running services: `systemctl list-units --type=service --state=running`. Stop and disable: `systemctl disable --now <svc>`. Optionally `systemctl mask <svc>` so nothing can start it.",
        "List listening ports and their processes: `ss -tlnp` (or `netstat -tulpn`, `lsof -i :<port>`).",
        "Remove packages: `apt purge <pkg>` then `apt autoremove`; list them with `dpkg -l` or `apt list --installed`.",
        "Remove unneeded users (`userdel -r`), check `/etc/passwd` for extra UID 0 accounts, and review `/etc/sudoers.d/`.",
        "Unload and blacklist unused kernel modules (e.g. `/etc/modprobe.d/blacklist.conf`).",
        "Exam pattern: find the process listening on port X, stop its service, disable it, and delete its binary.",
        "Container-optimised OSes (Bottlerocket, Flatcar, Talos, COS) ship with a read-only root and almost no packages."
      ],
      labs: [{
        title: 'Find and remove an unnecessary service',
        tags: ['kubeadm VMs'],
        goal: 'Any Ubuntu VM (a worker node is fine).',
        steps: [
          ['Simulate an unwanted service:', 'sudo apt-get install -y apache2\nsystemctl status apache2 --no-pager | head -3'],
          ['Find who listens on which ports:', 'sudo ss -tlnp\nsudo ss -tlnp | grep ":80 "'],
          ['Stop, disable and remove it:', 'sudo systemctl disable --now apache2\nsudo apt-get purge -y apache2 && sudo apt-get autoremove -y'],
          ['Review what else runs and who can log in:', "systemctl list-units --type=service --state=running --no-pager\nawk -F: '$3==0 {print $1}' /etc/passwd     # accounts with UID 0\ngetent group sudo"]
        ],
        verify: '`ss -tlnp` no longer shows port 80, and `systemctl status apache2` says the unit isn\'t found.'
      }],
      refs: [
        ['Security checklist', 'https://kubernetes.io/docs/concepts/security/security-checklist/'],
        ['Cloud native security (the 4Cs)', 'https://kubernetes.io/docs/concepts/security/cloud-native-security/'],
        ['CIS Ubuntu Linux Benchmark', 'https://www.cisecurity.org/benchmark/ubuntu_linux'],
        ['Bottlerocket', 'https://bottlerocket.dev/']
      ],
      quiz: [
        { q: "Which command shows which process listens on port 8080?",
          o: ["`ss -tlnp | grep 8080`", "`systemctl list-ports`", "`kubectl top ports`", "`journalctl -p 8080`"],
          why: "`ss -tlnp` lists listening TCP sockets with the owning process (`-p` needs root)." },
        { q: "How do you stop a service now and keep it from starting at boot?",
          o: ["`systemctl disable --now <service>`", "`systemctl stop <service>`", "`kill -9 <pid>`", "`systemctl restart <service>`"],
          why: "`stop` alone lasts only until the next reboot; `disable --now` does both." },
        { q: "Why use a minimal OS like Bottlerocket or Flatcar for nodes?",
          o: ["Fewer packages and services means less attack surface", "kubeadm requires them", "They run containers faster", "They include more debugging tools"],
          why: "They contain little beyond what's needed to run containers." },
        { q: "Which action INCREASES a node's attack surface?",
          o: ["Installing a desktop environment to make debugging easier", "Removing unused packages", "Disabling unused services", "Closing unused ports"],
          why: "Every extra package adds code that could be vulnerable." },
        { q: "You found and stopped an unknown process listening on a node. What else should you do?",
          o: ["Delete its binary and disable whatever starts it", "Leave the binary in place", "Restart the kubelet", "Add a NetworkPolicy"],
          why: "Otherwise a service unit or cron job will simply start it again." }
      ]
    },
    {
      id: 'sh-iam',
      title: 'Least-privilege identity and access management',
      basics: {
        summary: "Least privilege applies at every layer: the cloud account, the node's Linux users, Kubernetes RBAC, and the process inside each container. Every identity should get **only the access it needs, and no more**.",
        ideas: [
          "**Cloud**: nodes get a minimal IAM role, and Pods get their own identity (IRSA, Workload Identity).",
          "**Linux**: no root SSH login, keys instead of passwords, limited `sudo`.",
          "**Kubernetes**: narrow RBAC and per-person credentials.",
          "**Containers**: run as non-root, drop capabilities, no privilege escalation."
        ]
      },
      points: [
        "Cloud: the node's IAM role should allow only what the kubelet and CNI need. Give Pods their own cloud identity (EKS IRSA / Pod Identity, GKE and AKS Workload Identity) instead of borrowing the node's.",
        "Linux: `PermitRootLogin no`, `PasswordAuthentication no` in `/etc/ssh/sshd_config`; members of `sudo`/`wheel` kept to a minimum; no shared accounts.",
        "Container user: `runAsNonRoot: true`, `runAsUser: 1000`, `runAsGroup`, `fsGroup` for volume permissions.",
        "Privilege: `allowPrivilegeEscalation: false` (blocks setuid gains), `privileged: false`, `capabilities: {drop: [\"ALL\"]}` and add back only what's needed (e.g. `NET_BIND_SERVICE`).",
        "If `runAsNonRoot: true` but the image runs as UID 0, the kubelet refuses to start the container (`CreateContainerConfigError`).",
        "Kubernetes: personal, revocable credentials (OIDC), narrow RBAC, no shared `admin.conf`.",
        "Files: kubeconfigs and private keys mode 600, owned by their user.",
        "Check effective identity inside a container: `id`; capabilities: `grep Cap /proc/1/status` (decode with `capsh --decode=<hex>`)."
      ],
      labs: [{
        title: 'Run a container with the least privilege it needs',
        goal: 'Works on kind.',
        steps: [
          ['Default: root with the default capabilities:', 'kubectl run root --image=busybox --restart=Never -- sleep 3600\nkubectl exec root -- id\nkubectl exec root -- grep CapEff /proc/1/status'],
          ['Hardened Pod:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: least}
spec:
  securityContext: {runAsNonRoot: true, runAsUser: 1000, runAsGroup: 3000}
  containers:
  - name: c
    image: busybox
    command: [sleep, "3600"]
    securityContext:
      allowPrivilegeEscalation: false
      capabilities: {drop: ["ALL"]}
EOF
kubectl exec least -- id
kubectl exec least -- grep CapEff /proc/1/status`],
          ['See `runAsNonRoot` block an image that runs as root:', `kubectl run nonroot --image=nginx --restart=Never --overrides='{"spec":{"securityContext":{"runAsNonRoot":true}}}'
sleep 5; kubectl get pod nonroot; kubectl describe pod nonroot | grep -i "non-root"`]
        ],
        verify: '`least` shows `uid=1000` and `CapEff: 0000000000000000`; `nonroot` is stuck in `CreateContainerConfigError`.',
        cleanup: 'kubectl delete pod root least nonroot --now'
      }],
      refs: [
        ['Configure a Security Context for a Pod or Container', 'https://kubernetes.io/docs/tasks/configure-pod-container/security-context/'],
        ['RBAC good practices', 'https://kubernetes.io/docs/concepts/security/rbac-good-practices/'],
        ['Pod Security Standards', 'https://kubernetes.io/docs/concepts/security/pod-security-standards/'],
        ['Linux kernel security constraints', 'https://kubernetes.io/docs/concepts/security/linux-kernel-security-constraints/']
      ],
      quiz: [
        { q: "Which securityContext setting stops a process from gaining more privileges than its parent (e.g. through setuid binaries)?",
          o: ["`allowPrivilegeEscalation: false`", "`privileged: false`", "`readOnlyRootFilesystem: true`", "`runAsGroup: 0`"],
          why: "It sets the `no_new_privs` flag, so setuid and file capabilities can't raise privileges." },
        { q: "How do you drop all Linux capabilities from a container?",
          o: ["`securityContext: {capabilities: {drop: [\"ALL\"]}}`", "`privileged: false`", "`capabilities: {add: [\"NONE\"]}`", "`runAsNonRoot: true`"],
          why: "Drop everything, then add back only what the app needs." },
        { q: "A Pod on EKS must read one S3 bucket. What is the least-privilege approach?",
          o: ["Give the Pod its own IAM role through its ServiceAccount (IRSA / Pod Identity)", "Add S3 permissions to the node's IAM role", "Store root account keys in a Secret", "Give every Pod admin access"],
          why: "A node role is shared by every Pod on the node; a per-Pod identity isn't." },
        { q: "`runAsNonRoot: true` is set, but the image's default user is root. What happens?",
          o: ["The kubelet refuses to start the container", "It runs as root anyway", "Kubernetes picks a random UID", "The Pod is scheduled on another node"],
          why: "The Pod shows `CreateContainerConfigError`. Set `runAsUser` or fix the image's USER." },
        { q: "Which SSH setting stops direct root logins?",
          o: ["`PermitRootLogin no`", "`AllowRoot false`", "`UsePAM no`", "`PasswordAuthentication yes`"],
          why: "Admins log in as themselves and use sudo, which leaves an audit trail." }
      ]
    },
    {
      id: 'sh-network',
      title: 'Minimize external access to the network',
      basics: {
        summary: "The fewer ways there are into your nodes and cluster from outside, the fewer ways an attacker has. Put **firewalls** in front of the nodes, expose apps only through a **controlled entry point**, and keep everything else private.",
        ideas: [
          "Keep Services **ClusterIP**; expose apps through one Ingress or Gateway.",
          "**Host firewall** (ufw, iptables) or cloud security groups: default deny incoming.",
          "Only admin networks should reach **SSH and the API server**.",
          "Avoid **NodePort**, **hostPort** and **hostNetwork** unless truly needed."
        ]
      },
      points: [
        "Default to ClusterIP Services. Expose apps through one Ingress or Gateway; avoid scattering NodePort/LoadBalancer Services.",
        "Find exposure: `kubectl get svc -A | grep -E 'NodePort|LoadBalancer'`, and Pods with `hostNetwork` or `hostPort` (`kubectl get pods -A -o yaml | grep -E 'hostNetwork: true|hostPort'`).",
        "Host firewall with ufw: `ufw default deny incoming`, `ufw default allow outgoing`, `ufw allow from <admin-cidr> to any port 22 proto tcp`, `ufw allow 6443/tcp`, `ufw enable`; check with `ufw status numbered`.",
        "Allow between nodes only the required ports: 6443 (API), 2379-2380 (etcd, control plane only), 10250 (kubelet from control plane), the CNI's ports (e.g. VXLAN 4789/UDP, BGP 179), and NodePorts only if used.",
        "Cloud: nodes in private subnets, security groups instead of public IPs, a bastion or VPN for SSH, API server private endpoint or authorized networks.",
        "Control egress too: default-deny egress NetworkPolicies, egress proxies, and blocking the metadata IP.",
        "NetworkPolicy protects Pods, not node ports or the API server; for those you need host or cloud firewalls.",
        "Remember the CNI's own traffic when tightening firewalls, or Pods on different nodes stop talking."
      ],
      labs: [{
        title: 'Close a node to everything except what Kubernetes needs',
        tags: ['kubeadm VMs'],
        goal: 'On a worker node. Keep a second SSH session open so a mistake can\'t lock you out.',
        steps: [
          ['See what is listening and exposed:', 'sudo ss -tlnp\nkubectl get svc -A | grep -E "NodePort|LoadBalancer"'],
          ['Set up ufw (replace the CIDRs with your admin network and node subnet):', `sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp     # admin SSH
sudo ufw allow from 10.0.0.0/24 to any port 10250 proto tcp     # kubelet, from nodes
sudo ufw allow from 10.0.0.0/24                                  # node-to-node CNI traffic
sudo ufw enable
sudo ufw status numbered`],
          ['Convert an unnecessary NodePort Service to ClusterIP:', `kubectl create deploy demo --image=nginx
kubectl expose deploy demo --type=NodePort --port=80
kubectl patch svc demo -p '{"spec":{"type":"ClusterIP"}}'
kubectl get svc demo`]
        ],
        verify: '`ufw status` shows default deny incoming with only your rules; the cluster still works (`kubectl get nodes` stays Ready) and `demo` is ClusterIP.',
        cleanup: 'kubectl delete deploy demo; kubectl delete svc demo   # keep or `sudo ufw disable` the firewall as you prefer'
      }],
      refs: [
        ['Ports and Protocols', 'https://kubernetes.io/docs/reference/networking/ports-and-protocols/'],
        ['Service types', 'https://kubernetes.io/docs/concepts/services-networking/service/#publishing-services-service-types'],
        ['Network Policies', 'https://kubernetes.io/docs/concepts/services-networking/network-policies/'],
        ['Ubuntu: UFW firewall', 'https://ubuntu.com/server/docs/how-to/security/firewalls/']
      ],
      quiz: [
        { q: "Which Service type keeps an app reachable only from inside the cluster?",
          o: ["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"],
          why: "NodePort and LoadBalancer open the app to traffic from outside the cluster." },
        { q: "Which ufw command blocks all incoming traffic by default?",
          o: ["`ufw default deny incoming`", "`ufw deny all`", "`ufw block in`", "`ufw reset incoming`"],
          why: "Set the default, then add `allow` rules for the ports you need." },
        { q: "Why avoid `hostNetwork: true`?",
          o: ["The Pod shares the node's network and can bypass NetworkPolicies", "It disables DNS", "It only works on Windows", "It makes the Pod slower"],
          why: "The Pod can bind node ports and reach anything the node can reach." },
        { q: "How do you find Services that are reachable from outside the cluster?",
          o: ["`kubectl get svc -A` and look for NodePort and LoadBalancer types", "`kubectl get endpoints`", "`kubectl top svc`", "`kubectl get netpol -A`"],
          why: "Those two types open ports on the nodes or on an external load balancer." },
        { q: "Where do you limit who can reach the API server from the internet?",
          o: ["A firewall, security group or authorized-networks list in front of port 6443", "A NetworkPolicy in kube-system", "A Pod Security Standard", "An RBAC Role"],
          why: "NetworkPolicy only filters traffic to and from Pods, not access to the API server's port on the node." }
      ]
    },
    {
      id: 'sh-kernel',
      title: 'Kernel hardening: AppArmor and seccomp',
      basics: {
        summary: "Containers share the host's kernel, so limiting what a container may ask the kernel to do is powerful. **seccomp** filters which **system calls** a process can make. **AppArmor** limits which **files, capabilities and network** access a program gets.",
        ideas: [
          "**seccomp `RuntimeDefault`** blocks dangerous syscalls and is a safe default for almost every Pod.",
          "**AppArmor profiles** are loaded on each node, then referenced by the Pod.",
          "Both are set in the Pod's **securityContext**.",
          "If a profile isn't present on the node, the **Pod fails to start**."
        ]
      },
      points: [
        "AppArmor: profiles live in `/etc/apparmor.d/`, are loaded with `apparmor_parser -q <file>` (`-r` to replace), and listed with `aa-status`.",
        "Kubernetes 1.30+: `securityContext.appArmorProfile: {type: Localhost, localhostProfile: <profile-name>}` (also `RuntimeDefault` or `Unconfined`). Older clusters use the annotation `container.apparmor.security.beta.kubernetes.io/<container>: localhost/<profile>`.",
        "The profile must be loaded on the node where the Pod lands, or the container fails to start. Pin the Pod with `nodeSelector`/`nodeName` when only one node has it.",
        "seccomp: `securityContext.seccompProfile: {type: RuntimeDefault}`, or `{type: Localhost, localhostProfile: profiles/my.json}`. The path is relative to `/var/lib/kubelet/seccomp/` on the node.",
        "Make `RuntimeDefault` the default for every Pod on a node with kubelet config `seccompDefault: true`.",
        "The PSS `restricted` level requires seccomp `RuntimeDefault` or `Localhost`.",
        "Verify inside the container: AppArmor `cat /proc/1/attr/current` (shows the profile); seccomp `grep Seccomp /proc/1/status` (`2` = filtering).",
        "Related tools: SELinux (`seLinuxOptions`), capabilities, and safe namespaced sysctls."
      ],
      labs: [{
        title: 'Deny file writes with AppArmor and filter syscalls with seccomp',
        tags: ['kubeadm VMs'],
        goal: 'Ubuntu worker node with AppArmor enabled (`aa-enabled`). Profile from the Kubernetes AppArmor tutorial.',
        steps: [
          ['On the worker, create and load a profile that denies all file writes:', `cat <<'EOF' | sudo tee /etc/apparmor.d/k8s-deny-write
#include <tunables/global>
profile k8s-deny-write flags=(attach_disconnected) {
  #include <abstractions/base>
  file,
  deny /** w,
}
EOF
sudo apparmor_parser -q /etc/apparmor.d/k8s-deny-write
sudo aa-status | grep k8s-deny-write`],
          ['Run a Pod with the profile, pinned to that worker:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: aa}
spec:
  nodeName: worker            # the node where you loaded the profile
  containers:
  - name: c
    image: busybox
    command: [sleep, "3600"]
    securityContext:
      appArmorProfile: {type: Localhost, localhostProfile: k8s-deny-write}
EOF
kubectl exec aa -- cat /proc/1/attr/current
kubectl exec aa -- touch /tmp/x || echo "WRITE DENIED"`],
          ['seccomp: RuntimeDefault, then a custom Localhost profile that only logs:', `kubectl run sc --image=busybox --restart=Never --overrides='{"spec":{"securityContext":{"seccompProfile":{"type":"RuntimeDefault"}}}}' -- sleep 3600
kubectl exec sc -- grep Seccomp /proc/1/status
# on the worker:
sudo mkdir -p /var/lib/kubelet/seccomp/profiles
echo '{"defaultAction":"SCMP_ACT_LOG"}' | sudo tee /var/lib/kubelet/seccomp/profiles/audit.json`],
          ['Use the Localhost profile:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: sc-local}
spec:
  nodeName: worker
  securityContext:
    seccompProfile: {type: Localhost, localhostProfile: profiles/audit.json}
  containers: [{name: c, image: busybox, command: [sleep, "3600"]}]
EOF
kubectl get pod sc-local`]
        ],
        verify: 'The AppArmor Pod shows `k8s-deny-write (enforce)` and prints `WRITE DENIED`; both seccomp Pods run with `Seccomp: 2`.',
        cleanup: 'kubectl delete pod aa sc sc-local --now'
      }],
      refs: [
        ['Restrict a container\'s access with AppArmor', 'https://kubernetes.io/docs/tutorials/security/apparmor/'],
        ['Restrict a container\'s syscalls with seccomp', 'https://kubernetes.io/docs/tutorials/security/seccomp/'],
        ['Linux kernel security constraints', 'https://kubernetes.io/docs/concepts/security/linux-kernel-security-constraints/'],
        ['Configure a Security Context', 'https://kubernetes.io/docs/tasks/configure-pod-container/security-context/']
      ],
      quiz: [
        { q: "Where must an AppArmor profile be loaded for a Pod to use it?",
          o: ["On the node where the Pod runs", "In a ConfigMap", "On the control-plane node only", "Inside the container image"],
          why: "The node's kernel enforces AppArmor, so the profile has to be loaded there." },
        { q: "How do you set an AppArmor profile on Kubernetes 1.30 or newer?",
          o: ["`securityContext.appArmorProfile: {type: Localhost, localhostProfile: my-profile}`", "`securityContext.apparmor: my-profile`", "`spec.runtimeClassName: apparmor`", "A label `apparmor: my-profile`"],
          why: "The field replaced the beta annotation, which still works on older clusters." },
        { q: "A `Localhost` seccomp profile `profiles/audit.json` is read from where?",
          o: ["/var/lib/kubelet/seccomp/profiles/audit.json on the node", "/etc/seccomp/profiles/audit.json inside the container", "A ConfigMap named audit", "/etc/kubernetes/seccomp/"],
          why: "Localhost paths are relative to the kubelet's seccomp directory." },
        { q: "Which seccomp profile is a good safe default for most Pods?",
          o: ["RuntimeDefault", "Unconfined", "A Localhost profile that allows everything", "Privileged"],
          why: "The container runtime's default profile blocks rarely-needed, dangerous syscalls." },
        { q: "Which command loads an AppArmor profile on a node?",
          o: ["`apparmor_parser -q /etc/apparmor.d/<profile>`", "`aa-status --load <profile>`", "`kubectl apply -f <profile>`", "`systemctl start <profile>`"],
          why: "`aa-status` only lists the loaded profiles." }
      ]
    }
  ]
});

COURSE.addDomain({
  id: 'microservice', title: 'Minimize Microservice Vulnerabilities', weight: 20,
  topics: [
    {
      id: 'mv-pss',
      title: 'Pod Security Standards',
      basics: {
        summary: "The **Pod Security Standards** define three safety levels for Pods: privileged, baseline and restricted. The built-in **Pod Security Admission** checks every Pod against the level chosen by a **namespace label** and can block, warn about or record violations.",
        ideas: [
          "**privileged**: no limits. **baseline**: blocks known escalations. **restricted**: full hardening.",
          "Set the level with a label: `pod-security.kubernetes.io/enforce=restricted`.",
          "Modes: **enforce** (reject), **warn** (warning message), **audit** (audit log entry).",
          "For custom rules, use policy engines (Kyverno, Gatekeeper) or ValidatingAdmissionPolicy."
        ]
      },
      points: [
        "**baseline** forbids: privileged containers, hostNetwork/hostPID/hostIPC, hostPath volumes, hostPorts, adding capabilities beyond the default set, unsafe sysctls, AppArmor/SELinux overrides.",
        "**restricted** adds: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [\"ALL\"]` (only `NET_BIND_SERVICE` may be added), seccomp `RuntimeDefault` or `Localhost`, and only safe volume types.",
        "Labels on the namespace: `pod-security.kubernetes.io/<mode>=<level>` for modes `enforce`, `audit`, `warn`; pin with `<mode>-version=v1.33` (default `latest`).",
        "Enforcement checks Pods. A Deployment is still created, but its ReplicaSet can't create Pods; read the error with `kubectl describe rs` or `kubectl get events`.",
        "Preview before enforcing: `kubectl label --dry-run=server --overwrite ns <ns> pod-security.kubernetes.io/enforce=restricted` lists the existing Pods that would violate it.",
        "Cluster-wide defaults and exemptions: AdmissionConfiguration for the `PodSecurity` plugin (`--admission-control-config-file`).",
        "PodSecurityPolicy was removed in 1.25; Pod Security Admission replaced it.",
        "For rules PSS doesn't cover (allowed registries, required labels…) use ValidatingAdmissionPolicy (CEL), Kyverno or OPA Gatekeeper."
      ],
      labs: [{
        title: 'Enforce the restricted standard on a namespace',
        goal: 'Works on kind.',
        steps: [
          ['Create the namespace and preview, then enforce:', `kubectl create ns secure
kubectl label --dry-run=server --overwrite ns secure pod-security.kubernetes.io/enforce=restricted
kubectl label ns secure pod-security.kubernetes.io/enforce=restricted pod-security.kubernetes.io/warn=restricted`],
          ['A normal Pod is rejected, with the reasons:', 'kubectl -n secure run bad --image=nginx'],
          ['A compliant Pod is accepted:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: good, namespace: secure}
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    seccompProfile: {type: RuntimeDefault}
  containers:
  - name: c
    image: busybox
    command: [sleep, "3600"]
    securityContext:
      allowPrivilegeEscalation: false
      capabilities: {drop: ["ALL"]}
EOF`],
          ['Deployments fail more quietly. Find the error:', 'kubectl -n secure create deploy web --image=nginx\nkubectl -n secure get deploy,rs,pods\nkubectl -n secure describe rs | grep -A3 -i forbidden']
        ],
        verify: '`bad` is refused with a list of violations, `good` runs, and the `web` ReplicaSet shows `FailedCreate`.',
        cleanup: 'kubectl delete ns secure'
      }],
      refs: [
        ['Pod Security Standards', 'https://kubernetes.io/docs/concepts/security/pod-security-standards/'],
        ['Pod Security Admission', 'https://kubernetes.io/docs/concepts/security/pod-security-admission/'],
        ['Enforce Pod Security Standards with namespace labels', 'https://kubernetes.io/docs/tasks/configure-pod-container/enforce-standards-namespace-labels/'],
        ['Validating Admission Policy', 'https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/']
      ],
      quiz: [
        { q: "Which label enforces the restricted standard in namespace `prod`?",
          o: ["`pod-security.kubernetes.io/enforce=restricted`", "`pod-security.kubernetes.io/level=restricted`", "`podsecuritypolicy=restricted`", "`security.kubernetes.io/restricted=true`"],
          why: "The label key is `pod-security.kubernetes.io/<mode>` and its value is the level." },
        { q: "Which mode rejects non-compliant Pods?",
          o: ["enforce", "warn", "audit", "dryrun"],
          why: "`warn` only shows a warning to the client; `audit` only adds an annotation in the audit log." },
        { q: "A Deployment is created in an `enforce=restricted` namespace, but no Pods appear. Where is the error?",
          o: ["In the ReplicaSet's events", "In the Deployment's container logs", "In the CoreDNS logs", "Nowhere; it fails silently"],
          why: "The ReplicaSet controller is the one whose Pod creation is rejected, so `kubectl describe rs` shows `FailedCreate`." },
        { q: "Which requirement is in `restricted` but not in `baseline`?",
          o: ["`runAsNonRoot: true`", "No hostNetwork", "No privileged containers", "No hostPID"],
          why: "The other three are already forbidden by baseline." },
        { q: "What replaced PodSecurityPolicy (removed in 1.25)?",
          o: ["Pod Security Admission with the Pod Security Standards", "NetworkPolicy", "RuntimeClass", "ResourceQuota"],
          why: "Pod Security Admission is built in and configured with namespace labels." }
      ]
    },
    {
      id: 'mv-secrets',
      title: 'Manage Kubernetes Secrets',
      basics: {
        summary: "Kubernetes Secrets are only **base64-encoded**, and by default they are stored **unencrypted in etcd**. Protect them by **encrypting them at rest**, limiting who can read them, and using an external secret store when you can.",
        ideas: [
          "Configure **encryption at rest** with an EncryptionConfiguration on the API server.",
          "Existing Secrets stay plaintext until you **rewrite** them.",
          "Restrict `get`/`list`/`watch` on Secrets with **RBAC**.",
          "Prefer mounting Secrets as **files** over env vars, and consider Vault or cloud secret managers."
        ]
      },
      points: [
        "EncryptionConfiguration (`apiVersion: apiserver.config.k8s.io/v1`) lists `resources: [secrets]` and `providers` in order: `aescbc`, `aesgcm`, `secretbox`, `kms` (v2), `identity` (no encryption).",
        "The **first** provider encrypts new writes; every listed provider can decrypt. Keep `identity: {}` last while migrating so old plaintext data still reads.",
        "Key: 32 random bytes, base64 — `head -c 32 /dev/urandom | base64`.",
        "Enable with `--encryption-provider-config=/etc/kubernetes/enc/enc.yaml` on kube-apiserver, plus a hostPath volume and volumeMount for that directory.",
        "Re-encrypt existing Secrets: `kubectl get secrets -A -o json | kubectl replace -f -`.",
        "Verify directly in etcd: `ETCDCTL_API=3 etcdctl … get /registry/secrets/<ns>/<name> | hexdump -C` should start with `k8s:enc:aescbc:v1:` instead of readable text.",
        "Env vars leak more easily (child processes, crash dumps, debug output); prefer volume mounts. Mark Secrets `immutable: true` when they never change.",
        "External stores: HashiCorp Vault, cloud secret managers via the Secrets Store CSI Driver or External Secrets Operator. Never commit Secrets to Git (use Sealed Secrets or SOPS if you must)."
      ],
      labs: [{
        title: 'Encrypt Secrets at rest in etcd',
        tags: ['kubeadm VMs'],
        goal: 'On the control-plane node. Back up the API server manifest first.',
        steps: [
          ['Create a Secret and read it straight from etcd (plaintext):', `kubectl create secret generic s1 --from-literal=pw=supersecret
E="sudo ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key"
$E get /registry/secrets/default/s1 | hexdump -C | head`],
          ['Write the EncryptionConfiguration:', `sudo mkdir -p /etc/kubernetes/enc
KEY=$(head -c 32 /dev/urandom | base64)
cat <<EOF | sudo tee /etc/kubernetes/enc/enc.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
- resources: [secrets]
  providers:
  - aescbc:
      keys:
      - name: key1
        secret: $KEY
  - identity: {}
EOF`],
          ['Add the flag, volume and mount to `kube-apiserver.yaml`:', `sudo cp /etc/kubernetes/manifests/kube-apiserver.yaml ~/kube-apiserver.yaml.bak
sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml
# command:       - --encryption-provider-config=/etc/kubernetes/enc/enc.yaml
# volumeMounts:  - {name: enc, mountPath: /etc/kubernetes/enc, readOnly: true}
# volumes:       - {name: enc, hostPath: {path: /etc/kubernetes/enc, type: DirectoryOrCreate}}
watch sudo crictl ps --name kube-apiserver`],
          ['Rewrite all Secrets so they are stored encrypted, then check etcd again:', `kubectl get secrets -A -o json | kubectl replace -f -
$E get /registry/secrets/default/s1 | hexdump -C | head -3
kubectl get secret s1 -o jsonpath='{.data.pw}' | base64 -d; echo`]
        ],
        verify: 'etcd now shows `k8s:enc:aescbc:v1:key1` followed by unreadable bytes, while `kubectl` still returns `supersecret`.',
        cleanup: 'kubectl delete secret s1'
      }],
      refs: [
        ['Secrets', 'https://kubernetes.io/docs/concepts/configuration/secret/'],
        ['Good practices for Kubernetes Secrets', 'https://kubernetes.io/docs/concepts/security/secrets-good-practices/'],
        ['Encrypting Confidential Data at Rest', 'https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/'],
        ['Using a KMS provider for data encryption', 'https://kubernetes.io/docs/tasks/administer-cluster/kms-provider/'],
        ['Secrets Store CSI Driver', 'https://secrets-store-csi-driver.sigs.k8s.io/']
      ],
      quiz: [
        { q: "Are Secrets encrypted in etcd by default?",
          o: ["No; they are only base64-encoded until encryption at rest is configured", "Yes, with AES", "Yes, with the cluster CA", "Only in kube-system"],
          why: "Anyone with access to etcd or its backups can read default Secrets." },
        { q: "Which API server flag enables encryption at rest?",
          o: ["`--encryption-provider-config`", "`--secret-encryption=true`", "`--etcd-encrypt`", "`--tls-cipher-suites`"],
          why: "It points to the EncryptionConfiguration file, which must also be mounted into the API server Pod." },
        { q: "In an EncryptionConfiguration, which provider encrypts new writes?",
          o: ["The first one in the list", "The last one in the list", "`identity`, always", "A random one"],
          why: "If `identity` were first, new Secrets would be stored in plaintext." },
        { q: "After enabling encryption, how do you encrypt the Secrets that already exist?",
          o: ["Rewrite them: `kubectl get secrets -A -o json | kubectl replace -f -`", "Restart etcd", "Nothing; they are encrypted automatically", "Delete the EncryptionConfiguration"],
          why: "Data is only encrypted when it is written, so each Secret has to be written again." },
        { q: "How can you confirm that a Secret is encrypted in etcd?",
          o: ["`etcdctl get /registry/secrets/<ns>/<name>` shows a `k8s:enc:aescbc:v1:` prefix instead of plaintext", "`kubectl get secret -o yaml` shows scrambled data", "The Secret's type changes to Encrypted", "`kubectl describe secret` says encrypted"],
          why: "The API always returns decrypted data, so you have to look in etcd itself." }
      ]
    },
    {
      id: 'mv-isolation',
      title: 'Isolation: multi-tenancy and sandboxed containers',
      basics: {
        summary: "When different teams or untrusted workloads share a cluster, you need walls between them. Namespaces, RBAC and NetworkPolicies separate them logically. **Sandboxed runtimes** like gVisor and Kata add a stronger wall around the host kernel itself.",
        ideas: [
          "**Soft multi-tenancy**: namespace + RBAC + NetworkPolicy + ResourceQuota + PSS per tenant.",
          "**Harder isolation**: dedicated nodes per tenant, or separate clusters.",
          "**gVisor** gives containers a user-space kernel; **Kata** runs each Pod in a small VM.",
          "Choose a sandbox per Pod with a **RuntimeClass**."
        ]
      },
      points: [
        "Normal containers (runc) share the host kernel; one kernel exploit can escape to the node.",
        "gVisor (`runsc`) intercepts syscalls in a user-space kernel; Kata Containers run each Pod in a lightweight VM with its own kernel.",
        "RuntimeClass maps a name to a runtime handler configured in containerd: `apiVersion: node.k8s.io/v1, kind: RuntimeClass, handler: runsc`. Pods use `spec.runtimeClassName: gvisor`.",
        "Verify gVisor inside the Pod: `dmesg` shows gVisor's own boot messages; `uname -r` differs from the node's kernel.",
        "If the handler isn't configured on the node, the Pod fails with a `RunContainerError` / no-runtime error. Use `scheduling.nodeSelector` in the RuntimeClass to steer Pods to capable nodes.",
        "Per-tenant controls: namespace, RBAC, default-deny NetworkPolicy, ResourceQuota/LimitRange, PSS `restricted`, separate ServiceAccounts.",
        "Node isolation: taints/tolerations and node affinity to dedicate node pools to sensitive tenants.",
        "User namespaces: `spec.hostUsers: false` maps root in the container to an unprivileged UID on the host."
      ],
      labs: [{
        title: 'Run a Pod in a gVisor sandbox',
        tags: ['kubeadm VMs'],
        goal: 'Install gVisor on the worker following its containerd quick start (or use `minikube start --container-runtime=containerd` and `minikube addons enable gvisor`).',
        steps: [
          ['On the worker: install `runsc` and register it with containerd (summary of the gVisor quick start):', `# after installing runsc and containerd-shim-runsc-v1 from gvisor.dev:
cat <<'EOF' | sudo tee -a /etc/containerd/config.toml
[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runsc]
  runtime_type = "io.containerd.runsc.v1"
EOF
sudo systemctl restart containerd`],
          ['Create the RuntimeClass and a sandboxed Pod:', `cat <<EOF | kubectl apply -f -
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata: {name: gvisor}
handler: runsc
---
apiVersion: v1
kind: Pod
metadata: {name: sandboxed}
spec:
  runtimeClassName: gvisor
  nodeName: worker
  containers: [{name: c, image: busybox, command: [sleep, "3600"]}]
EOF`],
          ['Compare it with a normal Pod:', `kubectl run normal --image=busybox --restart=Never --overrides='{"spec":{"nodeName":"worker"}}' -- sleep 3600
kubectl exec sandboxed -- dmesg | head -3
kubectl exec normal -- uname -r; kubectl exec sandboxed -- uname -r`]
        ],
        verify: '`dmesg` in `sandboxed` prints gVisor\'s boot messages, and its kernel version differs from the `normal` Pod\'s.',
        cleanup: 'kubectl delete pod sandboxed normal --now; kubectl delete runtimeclass gvisor'
      }],
      refs: [
        ['Multi-tenancy', 'https://kubernetes.io/docs/concepts/security/multi-tenancy/'],
        ['Runtime Class', 'https://kubernetes.io/docs/concepts/containers/runtime-class/'],
        ['User Namespaces', 'https://kubernetes.io/docs/concepts/workloads/pods/user-namespaces/'],
        ['gVisor: containerd quick start', 'https://gvisor.dev/docs/user_guide/containerd/quick_start/'],
        ['Kata Containers', 'https://katacontainers.io/']
      ],
      quiz: [
        { q: "Why do sandboxed runtimes like gVisor improve isolation?",
          o: ["The container no longer talks directly to the host kernel", "They encrypt network traffic", "They make images smaller", "They replace RBAC"],
          why: "gVisor handles syscalls in its own user-space kernel, which shrinks the host kernel's attack surface." },
        { q: "How does a Pod choose gVisor?",
          o: ["`runtimeClassName` pointing to a RuntimeClass with `handler: runsc`", "`securityContext.sandbox: true`", "A label `runtime=gvisor`", "`spec.nodeName: gvisor`"],
          why: "The RuntimeClass handler must match a runtime configured in containerd on the node." },
        { q: "Which set of controls gives soft multi-tenancy inside one cluster?",
          o: ["Namespace, RBAC, NetworkPolicy and ResourceQuota per tenant", "One Deployment per tenant", "Different image tags per tenant", "Separate ConfigMaps per tenant"],
          why: "Together they separate access, network, resource use and identities." },
        { q: "What does `hostUsers: false` do?",
          o: ["Runs the Pod in a user namespace, so root inside maps to an unprivileged user on the host", "Removes all users from the image", "Blocks SSH to the node", "Disables ServiceAccounts"],
          why: "An escaped \"root\" process has no root rights on the node." },
        { q: "What is Kata Containers?",
          o: ["A runtime that runs each Pod inside a lightweight VM", "A NetworkPolicy engine", "An image scanner", "A secrets manager"],
          why: "Each Pod gets its own kernel inside a VM, giving hardware-level isolation." }
      ]
    },
    {
      id: 'mv-mtls',
      title: 'Pod-to-Pod encryption (Cilium, Istio)',
      basics: {
        summary: "Traffic between Pods is **plaintext** by default, so anyone who can watch the network can read it. You can encrypt it at the **network layer** with the CNI (Cilium or Calico with WireGuard), or at the **application layer** with a service mesh using **mutual TLS** (Istio, Linkerd).",
        ideas: [
          "**Cilium/Calico WireGuard**: transparent node-to-node encryption, with no app changes.",
          "**Istio mTLS**: sidecar or ambient proxies encrypt traffic and verify each workload's identity.",
          "In Istio, `PeerAuthentication` with mode **STRICT** allows only mTLS.",
          "**PERMISSIVE** accepts both and is meant for migration."
        ]
      },
      points: [
        "CNI encryption (transparent): Cilium `--set encryption.enabled=true --set encryption.type=wireguard` (or `ipsec`); Calico `wireguardEnabled: true` in FelixConfiguration. It encrypts traffic between nodes.",
        "Check Cilium: `cilium status` / `kubectl -n kube-system exec ds/cilium -- cilium-dbg status | grep Encryption`.",
        "Service mesh mTLS: each workload gets a certificate (SPIFFE identity) from the mesh CA; proxies encrypt and authenticate both sides.",
        "Istio: label the namespace `istio-injection=enabled` (sidecars) or use ambient mode; restart workloads to inject.",
        "Enforce: `PeerAuthentication` with `spec.mtls.mode: STRICT` in a namespace, or in `istio-system` for the whole mesh.",
        "`PERMISSIVE` (Istio's default) accepts plaintext and mTLS. Use it while migrating, then switch to STRICT.",
        "mTLS identities enable `AuthorizationPolicy` rules (e.g. only `sa/frontend` may call `backend`).",
        "Prove it: in STRICT mode a client without a sidecar fails to connect; `tcpdump` on the node shows encrypted payloads."
      ],
      labs: [{
        title: 'Enforce strict mTLS with Istio',
        goal: 'Works on kind with about 4 GB of memory free. Install istioctl from istio.io.',
        steps: [
          ['Install Istio and create a meshed namespace plus an outside one:', `istioctl install --set profile=demo -y
kubectl create ns mesh && kubectl label ns mesh istio-injection=enabled
kubectl create ns outside
kubectl -n mesh create deploy web --image=nginx && kubectl -n mesh expose deploy web --port=80
kubectl -n mesh run client --image=curlimages/curl -- sleep 3600
kubectl -n outside run client --image=curlimages/curl -- sleep 3600`],
          ['PERMISSIVE (default): both clients can connect:', 'kubectl -n mesh exec client -c client -- curl -s -o /dev/null -w "%{http_code}\\n" web.mesh\nkubectl -n outside exec client -- curl -s -o /dev/null -w "%{http_code}\\n" web.mesh'],
          ['Enforce STRICT mTLS in the `mesh` namespace:', `cat <<EOF | kubectl apply -f -
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata: {name: default, namespace: mesh}
spec:
  mtls: {mode: STRICT}
EOF`],
          ['Test again:', 'kubectl -n mesh exec client -c client -- curl -s -o /dev/null -w "%{http_code}\\n" web.mesh\nkubectl -n outside exec client -- curl -s -m5 web.mesh || echo "PLAINTEXT REJECTED"']
        ],
        verify: 'After STRICT, the meshed client still gets `200`, while the client without a sidecar prints `PLAINTEXT REJECTED`.',
        cleanup: 'kubectl delete ns mesh outside; istioctl uninstall --purge -y'
      }],
      refs: [
        ['Cilium: WireGuard transparent encryption', 'https://docs.cilium.io/en/stable/security/network/encryption-wireguard/'],
        ['Istio: mutual TLS migration', 'https://istio.io/latest/docs/tasks/security/authentication/mtls-migration/'],
        ['Istio: PeerAuthentication', 'https://istio.io/latest/docs/reference/config/security/peer_authentication/'],
        ['Calico: encrypt in-cluster pod traffic', 'https://docs.tigera.io/calico/latest/network-policy/encrypt-cluster-pod-traffic'],
        ['Kubernetes cluster networking', 'https://kubernetes.io/docs/concepts/cluster-administration/networking/']
      ],
      quiz: [
        { q: "Which Istio resource makes a namespace accept only mTLS traffic?",
          o: ["PeerAuthentication with `mtls.mode: STRICT`", "DestinationRule with `tls.mode: DISABLE`", "NetworkPolicy with `encrypt: true`", "A Gateway with an HTTPS listener"],
          why: "PeerAuthentication controls what the receiving side accepts." },
        { q: "What does Istio's PERMISSIVE mode allow?",
          o: ["Both plaintext and mTLS connections, for migration", "Only mTLS", "No traffic at all", "Only traffic from outside the mesh"],
          why: "It lets workloads join the mesh one by one before you switch to STRICT." },
        { q: "How does Cilium encrypt Pod traffic between nodes?",
          o: ["Transparent WireGuard or IPsec tunnels between nodes", "Sidecar proxies in every Pod", "TLS certificates inside each app", "It can't"],
          why: "The CNI encrypts at the network layer, so apps don't change." },
        { q: "Besides encryption, what does service-mesh mTLS give you?",
          o: ["A verifiable identity for each workload, usable in authorization rules", "Smaller images", "Faster DNS", "Automatic RBAC rules"],
          why: "Both sides present certificates, so the mesh knows exactly who is calling." },
        { q: "How do you turn on automatic Istio sidecar injection for namespace `shop`?",
          o: ["`kubectl label ns shop istio-injection=enabled`", "`kubectl annotate ns shop sidecar=true`", "`istioctl encrypt shop`", "`kubectl create sidecar shop`"],
          why: "Existing Pods need a restart to receive the sidecar." }
      ]
    }
  ]
});
