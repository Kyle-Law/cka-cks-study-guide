(window.COURSE_DOMAINS = window.COURSE_DOMAINS || []).push({
  id: 'architecture', title: 'Cluster Architecture, Installation & Configuration', weight: 25,
  topics: [
    {
      id: 'arch-rbac',
      title: 'Role-based access control (RBAC)',
      points: [
        'Four objects: `Role` (namespaced permissions), `ClusterRole` (cluster-wide or reusable), `RoleBinding`, `ClusterRoleBinding`. Permissions are additive; there are no deny rules.',
        'Rule = `apiGroups` + `resources` (+ `resourceNames`) + `verbs` (`get, list, watch, create, update, patch, delete`). Core group is `""`.',
        'Subjects: `User`, `Group`, `ServiceAccount` (`system:serviceaccount:<ns>:<name>`).',
        'A RoleBinding can reference a ClusterRole to grant it only within one namespace.',
        'Imperative: `kubectl create role r --verb=get,list --resource=pods -n dev`; `kubectl create rolebinding rb --role=r --user=jane -n dev`; `kubectl create clusterrole`, `clusterrolebinding`.',
        'Test: `kubectl auth can-i list pods -n dev --as jane`; list all: `kubectl auth can-i --list --as jane`.',
        'ServiceAccounts: each Pod gets a token (projected, short-lived). Set `serviceAccountName`; `kubectl create token <sa>` for a temporary token.',
        'Human users come from client certs (CSR API) or external IdP. `kubectl create csr` flow: CSR object → `kubectl certificate approve` → kubeconfig.'
      ],
      labs: [{
        title: 'Grant least-privilege access to a user and a ServiceAccount',
        goal: 'Create roles, bind them and test with `can-i`.',
        steps: [
          ['Namespace, Role and binding for user `jane`:', 'kubectl create ns dev\nkubectl -n dev create role pod-reader --verb=get,list,watch --resource=pods\nkubectl -n dev create rolebinding jane-read --role=pod-reader --user=jane'],
          ['Test as jane:', 'kubectl auth can-i list pods -n dev --as jane      # yes\nkubectl auth can-i delete pods -n dev --as jane    # no\nkubectl auth can-i list pods -n default --as jane  # no'],
          ['ServiceAccount with a ClusterRole across the cluster:', 'kubectl -n dev create sa deployer\nkubectl create clusterrole deploy-manager --verb=get,list,create,update --resource=deployments\nkubectl create clusterrolebinding deployer-all --clusterrole=deploy-manager --serviceaccount=dev:deployer\nkubectl auth can-i create deployments --as system:serviceaccount:dev:deployer -n default'],
          ['Challenge: issue a real client certificate for jane via a CSR and add her to your kubeconfig.', 'openssl genrsa -out jane.key 2048\nopenssl req -new -key jane.key -out jane.csr -subj "/CN=jane"\n# base64 jane.csr into a CertificateSigningRequest (signerName: kubernetes.io/kube-apiserver-client, usages: [client auth])\nkubectl certificate approve jane\nkubectl get csr jane -o jsonpath=\'{.status.certificate}\' | base64 -d > jane.crt\nkubectl config set-credentials jane --client-key=jane.key --client-certificate=jane.crt --embed-certs\nkubectl config set-context jane --cluster=<cluster> --user=jane']
        ],
        verify: '`can-i` answers match the comments above.',
        cleanup: 'kubectl delete ns dev; kubectl delete clusterrole deploy-manager; kubectl delete clusterrolebinding deployer-all'
      }],
      refs: [
        ['Using RBAC Authorization', 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/'],
        ['Managing Service Accounts', 'https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/'],
        ['Certificates and Certificate Signing Requests', 'https://kubernetes.io/docs/reference/access-authn-authz/certificate-signing-requests/'],
        ['Configure Service Accounts for Pods', 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/'],
        ['Organizing access with kubeconfig', 'https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/']
      ]
    },
    {
      id: 'arch-infra',
      title: 'Prepare infrastructure for a cluster',
      points: [
        'Minimums per node: 2 CPU, 2 GB RAM, unique hostname/MAC/`product_uuid`, full network connectivity between nodes, Linux with systemd.',
        '**Disable swap** (`swapoff -a` and remove from `/etc/fstab`) unless explicitly configured.',
        'Load kernel modules `overlay` and `br_netfilter`, and set sysctls `net.bridge.bridge-nf-call-iptables=1`, `net.bridge.bridge-nf-call-ip6tables=1`, `net.ipv4.ip_forward=1`.',
        'Install a CRI runtime (containerd) with `SystemdCgroup = true` in `/etc/containerd/config.toml`; kubelet and runtime must use the same cgroup driver (systemd).',
        'Required ports: control plane 6443 (API), 2379–2380 (etcd), 10250 (kubelet), 10257, 10259; workers 10250, 30000–32767 (NodePort).',
        'Install `kubeadm`, `kubelet`, `kubectl` from the pkgs.k8s.io repository for the chosen minor version, and `apt-mark hold` them.',
        'Plan the networking: Pod CIDR must not overlap node/service CIDRs; choose a CNI compatible with it.',
        'For HA, plan a load balancer endpoint (`--control-plane-endpoint`) and an odd number of etcd members.'
      ],
      labs: [{
        title: 'Prepare two Ubuntu VMs',
        tags: ['kubeadm VMs'],
        goal: 'Run on every node (control-plane and worker). Multipass: `multipass launch 22.04 -n cp -c 2 -m 3G -d 20G`.',
        steps: [
          ['Swap and kernel prerequisites:', `sudo swapoff -a && sudo sed -i '/ swap / s/^/#/' /etc/fstab
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
sudo modprobe overlay && sudo modprobe br_netfilter
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system`],
          ['Container runtime:', `sudo apt-get update && sudo apt-get install -y containerd
sudo mkdir -p /etc/containerd && containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl restart containerd && sudo systemctl enable containerd`],
          ['kubeadm, kubelet, kubectl (replace v1.33 with the version you want):', `sudo apt-get install -y apt-transport-https ca-certificates curl gpg
sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.33/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.33/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update && sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl`]
        ],
        verify: '`kubeadm version`, `containerd --version`, `lsmod | grep br_netfilter` and `free -h` (swap = 0) all look right.'
      }],
      refs: [
        ['Installing kubeadm', 'https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/'],
        ['Container Runtimes', 'https://kubernetes.io/docs/setup/production-environment/container-runtimes/'],
        ['Ports and Protocols', 'https://kubernetes.io/docs/reference/networking/ports-and-protocols/'],
        ['Production environment', 'https://kubernetes.io/docs/setup/production-environment/']
      ]
    },
    {
      id: 'arch-kubeadm',
      title: 'Create and manage clusters with kubeadm',
      points: [
        'Control plane: `sudo kubeadm init --pod-network-cidr=10.244.0.0/16 [--apiserver-advertise-address=<ip>] [--control-plane-endpoint=<lb>]`.',
        'Then copy admin kubeconfig: `mkdir -p ~/.kube && sudo cp /etc/kubernetes/admin.conf ~/.kube/config && sudo chown $(id -u):$(id -g) ~/.kube/config`.',
        'Install a CNI (Calico/Flannel/Cilium/Weave). Nodes stay `NotReady` and CoreDNS `Pending` until you do.',
        'Join workers with the printed `kubeadm join …`. Regenerate if expired: `kubeadm token create --print-join-command` (tokens last 24h).',
        'Artefacts: certs in `/etc/kubernetes/pki`, static Pod manifests in `/etc/kubernetes/manifests`, configs `admin.conf`, `kubelet.conf`, cluster config in ConfigMap `kubeadm-config` (`kube-system`).',
        'Inspect: `kubeadm config print init-defaults`, `kubeadm certs check-expiration`.',
        'Remove a node: `kubectl drain`, `kubectl delete node`, then `kubeadm reset` on the node (cleans up iptables/CNI manually).',
        'Taint `node-role.kubernetes.io/control-plane:NoSchedule` keeps workloads off the control plane by default.'
      ],
      labs: [{
        title: 'Bootstrap a 2-node cluster',
        tags: ['kubeadm VMs'],
        goal: 'Prerequisites from the previous topic must be done on both VMs.',
        steps: [
          ['On the control plane:', 'sudo kubeadm init --pod-network-cidr=10.244.0.0/16\nmkdir -p ~/.kube && sudo cp /etc/kubernetes/admin.conf ~/.kube/config && sudo chown $(id -u):$(id -g) ~/.kube/config'],
          ['Install a CNI (Flannel matches the CIDR above):', 'kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml'],
          ['On the worker, join (use your own command):', 'sudo kubeadm join <cp-ip>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>'],
          ['If you lost the command:', 'kubeadm token create --print-join-command'],
          ['Validate and test a workload:', 'kubectl get nodes -o wide\nkubectl -n kube-system get pods\nkubectl create deploy hello --image=nginx --replicas=2\nkubectl get pods -o wide'],
          ['Practice teardown and rebuild on the worker:', 'kubectl drain <worker> --ignore-daemonsets --delete-emptydir-data\nkubectl delete node <worker>\n# on the worker\nsudo kubeadm reset -f && sudo rm -rf /etc/cni/net.d']
        ],
        verify: 'Both nodes are `Ready`, all kube-system Pods `Running`, and the Pods are spread over nodes.'
      }],
      refs: [
        ['Creating a cluster with kubeadm', 'https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/'],
        ['kubeadm init', 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/'],
        ['kubeadm join', 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/'],
        ['kubeadm token', 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-token/'],
        ['Installing Addons (CNI)', 'https://kubernetes.io/docs/concepts/cluster-administration/addons/']
      ]
    },
    {
      id: 'arch-lifecycle',
      title: 'Manage the cluster lifecycle (upgrade, etcd backup)',
      points: [
        'Upgrade one minor version at a time (1.N → 1.N+1); kubelet may lag the API server by up to 3 minors (policy-dependent), never be newer.',
        'Control-plane order: upgrade `kubeadm` package → `kubeadm upgrade plan` → `kubeadm upgrade apply v1.X.Y` → drain node → upgrade `kubelet`/`kubectl` → `systemctl daemon-reload && restart kubelet` → uncordon.',
        'Additional control-plane nodes and workers use `kubeadm upgrade node` instead of `apply`.',
        'Packages are held: `apt-mark unhold kubeadm` (or `apt-get install --allow-change-held-packages`), then hold again.',
        '**etcd backup**: `ETCDCTL_API=3 etcdctl snapshot save /opt/snap.db --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key`.',
        '**Restore**: `etcdutl snapshot restore /opt/snap.db --data-dir=/var/lib/etcd-restore`, then edit `/etc/kubernetes/manifests/etcd.yaml` so the `etcd-data` hostPath volume points at the new dir.',
        'Find etcd flags from `kubectl -n kube-system describe pod etcd-<node>` or the static manifest.',
        'Also: certificate renewal (`kubeadm certs renew`), node maintenance (`cordon/drain`), OS patching.'
      ],
      labs: [
        {
          title: 'Back up and restore etcd',
          tags: ['kubeadm VMs'],
          goal: 'Run on the control-plane node as root.',
          steps: [
            ['Create something recognisable, then snapshot:', `kubectl create ns before-backup
sudo ETCDCTL_API=3 etcdctl snapshot save /opt/etcd-backup.db \\
  --endpoints=https://127.0.0.1:2379 \\
  --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key
sudo etcdutl snapshot status /opt/etcd-backup.db -w table`],
            ['Make a change that will be lost:', 'kubectl create ns after-backup'],
            ['Restore into a new directory and point etcd at it:', 'sudo etcdutl snapshot restore /opt/etcd-backup.db --data-dir=/var/lib/etcd-restored\nsudo sed -i \'s#path: /var/lib/etcd$#path: /var/lib/etcd-restored#\' /etc/kubernetes/manifests/etcd.yaml\n# wait for etcd + apiserver to restart (crictl ps)']
          ],
          verify: '`kubectl get ns` shows `before-backup` but not `after-backup`.'
        },
        {
          title: 'Upgrade the cluster by one minor version',
          tags: ['kubeadm VMs'],
          goal: 'Example: 1.32 → 1.33. Change the apt repo to the next minor first.',
          steps: [
            ['Control plane: upgrade kubeadm and apply:', `sudo sed -i 's/v1.32/v1.33/' /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-mark unhold kubeadm && sudo apt-get install -y kubeadm='1.33.*' && sudo apt-mark hold kubeadm
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.33.x`],
            ['Drain, upgrade kubelet/kubectl, restart, uncordon:', `kubectl drain cp --ignore-daemonsets
sudo apt-mark unhold kubelet kubectl && sudo apt-get install -y kubelet='1.33.*' kubectl='1.33.*' && sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload && sudo systemctl restart kubelet
kubectl uncordon cp`],
            ['Worker: same repo change, then:', `kubectl drain worker --ignore-daemonsets --delete-emptydir-data   # from cp
# on worker:
sudo apt-get install -y kubeadm='1.33.*'
sudo kubeadm upgrade node
sudo apt-get install -y kubelet='1.33.*' kubectl='1.33.*'
sudo systemctl daemon-reload && sudo systemctl restart kubelet
# from cp:
kubectl uncordon worker`]
          ],
          verify: '`kubectl get nodes` shows the new version on every node.'
        }
      ],
      refs: [
        ['Upgrading kubeadm clusters', 'https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/'],
        ['Operating etcd clusters for Kubernetes (backup/restore)', 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/'],
        ['Version skew policy', 'https://kubernetes.io/releases/version-skew-policy/'],
        ['Certificate management with kubeadm', 'https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/'],
        ['Safely Drain a Node', 'https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/']
      ]
    },
    {
      id: 'arch-ha',
      title: 'Highly-available control plane',
      points: [
        'Two topologies: **stacked etcd** (etcd on each control-plane node, simpler) and **external etcd** (separate etcd cluster, more machines, more resilient).',
        'Need ≥3 control-plane nodes (odd count) for etcd quorum: quorum = ⌊n/2⌋+1; 3 nodes tolerate 1 failure, 5 tolerate 2.',
        'A load balancer (HAProxy/keepalived, cloud LB) fronts port 6443 of all API servers. Use it as `--control-plane-endpoint` on `kubeadm init`.',
        'First node: `kubeadm init --control-plane-endpoint "LB:6443" --upload-certs`. Others: `kubeadm join LB:6443 --control-plane --certificate-key <key> …`.',
        'Certificate key from `--upload-certs` expires in 2h; regenerate with `kubeadm init phase upload-certs --upload-certs`.',
        'Scheduler and controller-manager use leader election (only one active); API servers are all active.',
        'Workers talk to the API via the LB endpoint, so a single control-plane failure is transparent.',
        'Verify etcd membership: `etcdctl member list -w table`.'
      ],
      labs: [{
        title: 'Design and rehearse an HA control plane',
        tags: ['kubeadm VMs'],
        goal: '3 control-plane VMs + 1 LB VM + 1 worker (or use only the commands to rehearse on paper).',
        steps: [
          ['Load balancer (HAProxy) on the LB VM:', `sudo apt-get install -y haproxy
cat <<EOF | sudo tee -a /etc/haproxy/haproxy.cfg
frontend k8s-api
  bind *:6443
  mode tcp
  default_backend cp
backend cp
  mode tcp
  balance roundrobin
  server cp1 <cp1-ip>:6443 check
  server cp2 <cp2-ip>:6443 check
  server cp3 <cp3-ip>:6443 check
EOF
sudo systemctl restart haproxy`],
          ['Init the first control-plane node:', 'sudo kubeadm init --control-plane-endpoint "<lb-ip>:6443" --upload-certs --pod-network-cidr=10.244.0.0/16'],
          ['Join the other two control-plane nodes using the printed command that includes `--control-plane --certificate-key`.', ''],
          ['Test failover: power off `cp1`, then:', 'kubectl get nodes   # still works through the LB\nkubectl -n kube-system get pods -l component=etcd\nkubectl -n kube-system get lease kube-scheduler -o yaml | grep holderIdentity']
        ],
        verify: 'API remains available with one control-plane node down; the scheduler lease holder changes.'
      }],
      refs: [
        ['Creating Highly Available Clusters with kubeadm', 'https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/'],
        ['Options for Highly Available Topology', 'https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/'],
        ['Set up a High Availability etcd Cluster with kubeadm', 'https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/setup-ha-etcd-with-kubeadm/'],
        ['Leases & leader election', 'https://kubernetes.io/docs/concepts/architecture/leases/']
      ]
    },
    {
      id: 'arch-helm-kustomize',
      title: 'Helm and Kustomize',
      points: [
        '**Helm** packages manifests as *charts*; a *release* is an installed chart. Templates + `values.yaml` render YAML.',
        'Core commands: `helm repo add NAME URL`, `helm repo update`, `helm search repo X`, `helm install REL CHART -n NS --create-namespace -f values.yaml --set k=v`, `helm list -A`, `helm upgrade`, `helm rollback REL REV`, `helm uninstall REL`, `helm show values CHART`, `helm template`, `helm get values REL`.',
        'Use `--dry-run --debug` or `helm template` to see rendered manifests before applying.',
        '**Kustomize** (built into kubectl): `kubectl apply -k dir/`, `kubectl kustomize dir/`. A `kustomization.yaml` lists `resources`, `patches`, `namePrefix`, `namespace`, `images`, `configMapGenerator`, `secretGenerator`, `commonLabels`.',
        'Overlays: `base/` + `overlays/dev|prod/` that reference `../../base` and patch it (strategic merge or JSON 6902).',
        'Generators append a content hash to names so config changes trigger Pod rollouts.',
        'Helm = templating + release management; Kustomize = template-free patching. Know when each fits.',
        'Cluster components (ingress controller, metrics-server, CNI, cert-manager) are commonly installed with Helm.'
      ],
      labs: [
        {
          title: 'Install, upgrade and roll back a Helm release',
          goal: 'Install Helm first: `brew install helm` or the official script.',
          steps: [
            ['Add a repo and inspect a chart:', 'helm repo add bitnami https://charts.bitnami.com/bitnami\nhelm repo update\nhelm search repo nginx\nhelm show values bitnami/nginx | head -50'],
            ['Install with overrides:', 'helm install web bitnami/nginx -n demo --create-namespace --set replicaCount=2 --set service.type=ClusterIP\nhelm list -n demo\nkubectl -n demo get all'],
            ['Upgrade, check history and roll back:', 'helm upgrade web bitnami/nginx -n demo --set replicaCount=3\nhelm history web -n demo\nhelm rollback web 1 -n demo\nhelm get values web -n demo'],
            ['Render only, no install:', 'helm template web bitnami/nginx --set replicaCount=1 | less']
          ],
          verify: 'Replicas go 2 → 3 → 2 after the rollback.',
          cleanup: 'helm uninstall web -n demo; kubectl delete ns demo'
        },
        {
          title: 'Kustomize base and overlays',
          goal: 'Layer a prod overlay on a shared base.',
          steps: [
            ['Create the base:', `mkdir -p kz/base kz/overlays/prod && cd kz
kubectl create deploy web --image=nginx:1.25 --dry-run=client -o yaml > base/deploy.yaml
cat > base/kustomization.yaml <<EOF
resources: [deploy.yaml]
EOF`],
            ['Prod overlay: prefix, namespace, replicas, image tag and a ConfigMap generator:', `cat > overlays/prod/kustomization.yaml <<EOF
resources: [../../base]
namePrefix: prod-
namespace: prod
replicas:
- {name: web, count: 3}
images:
- {name: nginx, newTag: "1.27"}
configMapGenerator:
- name: settings
  literals: [MODE=prod]
EOF
kubectl create ns prod
kubectl kustomize overlays/prod
kubectl apply -k overlays/prod`],
            ['Add a patch (JSON 6902) setting CPU requests:', `cat >> overlays/prod/kustomization.yaml <<EOF
patches:
- target: {kind: Deployment, name: web}
  patch: |-
    - op: add
      path: /spec/template/spec/containers/0/resources
      value: {requests: {cpu: 100m}}
EOF
kubectl apply -k overlays/prod`]
          ],
          verify: '`kubectl -n prod get deploy` shows `prod-web` 3/3 using `nginx:1.27`.',
          cleanup: 'kubectl delete -k overlays/prod; kubectl delete ns prod'
        }
      ],
      refs: [
        ['Helm: Using Helm (official docs)', 'https://helm.sh/docs/intro/using_helm/'],
        ['Helm: Quickstart', 'https://helm.sh/docs/intro/quickstart/'],
        ['Helm: command reference', 'https://helm.sh/docs/helm/'],
        ['Declarative Management using Kustomize', 'https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/'],
        ['kubectl kustomize', 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_kustomize/'],
        ['Kustomize reference', 'https://kubectl.docs.kubernetes.io/references/kustomize/']
      ]
    },
    {
      id: 'arch-extension',
      title: 'Extension interfaces (CNI, CSI, CRI…)',
      points: [
        '**CRI** (Container Runtime Interface): kubelet ↔ runtime (containerd, CRI-O) via gRPC socket, e.g. `unix:///run/containerd/containerd.sock`. Dockershim was removed in 1.24. Debug with `crictl`.',
        '**CNI** (Container Network Interface): plugins set up Pod networking. Config in `/etc/cni/net.d/`, binaries in `/opt/cni/bin/`. Examples: Calico, Cilium, Flannel, Weave. The CNI decides if NetworkPolicy works.',
        '**CSI** (Container Storage Interface): out-of-tree storage drivers (controller + node plugin) used via StorageClass `provisioner`. Components: external-provisioner, attacher, resizer, snapshotter, node-driver-registrar.',
        'Other extension points: device plugins (GPUs), admission webhooks, aggregated API, CRDs + controllers (operators), scheduler plugins/profiles, cloud-controller-manager.',
        'OCI is the image/runtime spec (runc is the low-level runtime); a RuntimeClass selects alternative runtimes (gVisor, Kata).',
        'Identify what is in use: `kubectl get nodes -o wide` (runtime column), `ls /etc/cni/net.d`, `kubectl get csidrivers`, `kubectl get storageclass`, `kubectl get runtimeclass`.',
        'kubelet flag/config `containerRuntimeEndpoint` points to the CRI socket; `/etc/crictl.yaml` configures crictl.',
        'Pods `ContainerCreating` with "network plugin not ready" or "failed to set up sandbox" → CNI problem.'
      ],
      labs: [{
        title: 'Inspect the CRI, CNI and CSI on your cluster',
        goal: 'Map each interface to real files, sockets and objects.',
        steps: [
          ['CRI. On a node (kind: `docker exec -it kind-control-plane bash`):', 'kubectl get nodes -o wide        # CONTAINER-RUNTIME column\nsudo crictl --runtime-endpoint unix:///run/containerd/containerd.sock ps\nsudo crictl images | head\ncat /var/lib/kubelet/config.yaml | grep -i endpoint'],
          ['CNI:', 'ls /etc/cni/net.d/ && cat /etc/cni/net.d/*\nls /opt/cni/bin\nkubectl -n kube-system get pods -o wide | grep -i "flannel\\|calico\\|cilium\\|kindnet"'],
          ['CSI:', 'kubectl get csidrivers\nkubectl get storageclass -o custom-columns=NAME:.metadata.name,PROVISIONER:.provisioner\nkubectl -n local-path-storage get pods   # kind provisioner'],
          ['RuntimeClass example:', `cat <<EOF | kubectl apply -f -
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata: {name: demo}
handler: runc
EOF
kubectl run rc --image=nginx --overrides='{"spec":{"runtimeClassName":"demo"}}'`]
        ],
        verify: 'You can state which runtime, CNI plugin and CSI driver the cluster uses and where each is configured.',
        cleanup: 'kubectl delete pod rc --now; kubectl delete runtimeclass demo'
      }],
      refs: [
        ['Container Runtime Interface (CRI)', 'https://kubernetes.io/docs/concepts/architecture/cri/'],
        ['Network Plugins (CNI)', 'https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/'],
        ['Cluster Networking & Addons', 'https://kubernetes.io/docs/concepts/cluster-administration/addons/'],
        ['CSI volumes', 'https://kubernetes.io/docs/concepts/storage/volumes/#csi'],
        ['Container Runtimes', 'https://kubernetes.io/docs/setup/production-environment/container-runtimes/'],
        ['Runtime Class', 'https://kubernetes.io/docs/concepts/containers/runtime-class/'],
        ['Extending Kubernetes', 'https://kubernetes.io/docs/concepts/extend-kubernetes/']
      ]
    },
    {
      id: 'arch-crd',
      title: 'CRDs, operators',
      points: [
        'A **CustomResourceDefinition** adds a new resource type to the API (`group`, `names.kind/plural`, `scope: Namespaced|Cluster`, `versions[].schema.openAPIV3Schema`). Then `kubectl get <plural>` works.',
        'A CRD alone only stores data. A **controller** watching those resources and reconciling the world makes it an **operator**.',
        'Typical operator install: apply CRDs + Deployment (+ RBAC) via manifests, Helm, or OLM. Examples: cert-manager, Prometheus Operator, ArgoCD.',
        'Find CRDs: `kubectl get crd`, `kubectl api-resources --api-group=<g>`, `kubectl explain <kind>.spec`.',
        'Delete a CRD → all its custom resources are deleted. Be careful in labs.',
        'Schema validation (structural schema) is required in `apiextensions.k8s.io/v1`; `served`/`storage` flags control versions.',
        'RBAC applies to custom resources like built-ins (`apiGroups: ["example.com"]`).',
        'Know the difference between CRDs and API aggregation (a separate API server).'
      ],
      labs: [{
        title: 'Define a CRD and install an operator (cert-manager)',
        goal: 'See CRDs on their own, then a real controller using them.',
        steps: [
          ['Create a CRD, then a custom resource:', `cat <<EOF | kubectl apply -f -
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: {name: backups.example.com}
spec:
  group: example.com
  scope: Namespaced
  names: {plural: backups, singular: backup, kind: Backup, shortNames: [bk]}
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              schedule: {type: string}
              retention: {type: integer}
EOF
cat <<EOF | kubectl apply -f -
apiVersion: example.com/v1
kind: Backup
metadata: {name: nightly}
spec: {schedule: "0 2 * * *", retention: 7}
EOF
kubectl get bk
kubectl explain backup.spec`],
          ['Validation test: a wrong type must be rejected:', `kubectl apply -f - <<EOF
apiVersion: example.com/v1
kind: Backup
metadata: {name: bad}
spec: {retention: "seven"}
EOF`],
          ['Install a real operator, cert-manager, with Helm:', 'helm repo add jetstack https://charts.jetstack.io && helm repo update\nhelm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set crds.enabled=true\nkubectl get crd | grep cert-manager\nkubectl -n cert-manager get pods'],
          ['Use its custom resources:', `cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: {name: selfsigned}
spec: {selfSigned: {}}
EOF
kubectl get clusterissuer`]
        ],
        verify: '`kubectl get bk` lists `nightly`; the bad object is rejected; ClusterIssuer `selfsigned` shows `READY=True`.',
        cleanup: 'helm uninstall cert-manager -n cert-manager; kubectl delete crd backups.example.com'
      }],
      refs: [
        ['Custom Resources', 'https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/'],
        ['Extend the Kubernetes API with CustomResourceDefinitions', 'https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/'],
        ['Operator pattern', 'https://kubernetes.io/docs/concepts/extend-kubernetes/operator/'],
        ['Versions of CustomResourceDefinitions', 'https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definition-versioning/'],
        ['cert-manager install docs', 'https://cert-manager.io/docs/installation/helm/']
      ]
    }
  ]
});
