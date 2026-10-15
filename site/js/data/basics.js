// Beginner-friendly intro for each topic: a plain-language summary and a few key ideas.
// The detailed exam points stay in each domain file as `points`.
window.COURSE_BASICS = {
  // Storage
  'storage-classes': {
    summary: "Think of a StorageClass as a menu of storage types your cluster offers, such as \"fast SSD\" or \"cheap disk\". When an app asks for storage from that menu, Kubernetes creates the disk for it automatically. This is called **dynamic provisioning**.",
    ideas: [
      "**StorageClass**: names a type of storage and the driver (provisioner) that creates it.",
      "**Dynamic provisioning**: a claim (PVC) that names a class gets a new volume made for it, with no admin work.",
      "**Default class**: used when a claim doesn't name a class.",
      "**Binding mode**: `WaitForFirstConsumer` waits until a Pod needs the volume, so it is created on the right node."
    ]
  },
  'volume-types': {
    summary: "A volume is a folder a container can read and write. Some volumes disappear when the Pod goes away (scratch space, config files). Others keep the data safe even after the Pod is deleted.",
    ideas: [
      "**Ephemeral volumes** (like `emptyDir`) live and die with the Pod.",
      "**Persistent volumes** keep data after the Pod is gone.",
      "**Access modes** say how the volume can be shared: one node (RWO), many nodes read-only (ROX) or many nodes read-write (RWX).",
      "**Reclaim policy** decides what happens to the data when you are done: `Retain` keeps it, `Delete` removes it."
    ]
  },
  'pv-pvc': {
    summary: "Storage in Kubernetes works like renting. A **PersistentVolume (PV)** is the actual piece of storage, and a **PersistentVolumeClaim (PVC)** is a request for it. Kubernetes matches each claim to a suitable volume, and the Pod uses the claim.",
    ideas: [
      "**PV**: a real piece of storage in the cluster, created by an admin or automatically.",
      "**PVC**: an app's request, such as \"I need 1Gi, read-write\".",
      "**Binding**: Kubernetes pairs a PVC with one PV that fits its size, access mode and class.",
      "**Pod**: mounts the PVC by name, never the PV directly."
    ]
  },

  // Troubleshooting
  'ts-nodes': {
    summary: "A node is a machine that runs your Pods. When a node shows `NotReady`, Kubernetes can't use it. The cause is usually on the machine itself: the kubelet agent, the container runtime or networking.",
    ideas: [
      "Start with `kubectl get nodes` and `kubectl describe node` to see the node's condition and recent events.",
      "The **kubelet** is the agent on every node. If it stops, the node goes `NotReady`.",
      "On the node, `systemctl` and `journalctl` show whether the kubelet is running and why it fails.",
      "**Drain** a node to move its Pods away safely before maintenance; **uncordon** it to bring it back."
    ]
  },
  'ts-components': {
    summary: "The control plane is the cluster's brain: the API server, scheduler, controller manager and the etcd database. On kubeadm clusters they run as special Pods defined by files on the control-plane node, so most fixes mean finding a mistake in those files.",
    ideas: [
      "**API server**: the front door for every `kubectl` command. If it is down, `kubectl` stops working.",
      "**Scheduler**: picks a node for new Pods. If it is down, Pods stay `Pending`.",
      "**Controller manager**: keeps things at the desired state, for example the right number of replicas.",
      "**etcd**: the database that stores all cluster state.",
      "Their config lives in `/etc/kubernetes/manifests/`. Edit a file and that component restarts."
    ]
  },
  'ts-monitor': {
    summary: "To know whether your cluster is healthy or overloaded, you need to see how much CPU and memory nodes and Pods use. Kubernetes gets these numbers from an add-on called **metrics-server**, and you read them with `kubectl top`.",
    ideas: [
      "**metrics-server** collects CPU and memory usage from every node.",
      "`kubectl top nodes` and `kubectl top pods` show current usage.",
      "**Requests** are what a Pod reserves; **limits** are the most it may use.",
      "Using more memory than the limit gets the container killed (`OOMKilled`)."
    ]
  },
  'ts-logs': {
    summary: "Anything an app prints to its screen (stdout/stderr) is kept as logs. `kubectl logs` lets you read them, and it is usually the fastest way to learn why an app is failing.",
    ideas: [
      "`kubectl logs <pod>` shows what the container printed.",
      "`--previous` shows logs from the last crash, which is often where the error is.",
      "In a Pod with several containers, choose one with `-c <name>`.",
      "If the app never started, there are no logs: use `kubectl describe pod` and its events instead."
    ]
  },
  'ts-services': {
    summary: "When an app can't be reached through its Service, follow the path the traffic takes. Is the Pod running? Does the Service find it? Is the port right? Does the name resolve? Is anything blocking it? Usually one link in that chain is broken.",
    ideas: [
      "A Service finds Pods by **labels**. A wrong label means no backends.",
      "`kubectl get endpoints <svc>` shows which Pods the Service found. Empty means a problem.",
      "**port** is what clients call; **targetPort** is where the app actually listens.",
      "Test from inside the cluster with a temporary Pod (`busybox`, `curl`)."
    ]
  },

  // Workloads & Scheduling
  'wl-deployments': {
    summary: "A Deployment keeps a set number of copies of your app running and lets you update it without downtime. It replaces old Pods with new ones a few at a time (a **rolling update**) and can go back to the previous version if something breaks.",
    ideas: [
      "**Deployment** manages ReplicaSets, which manage Pods.",
      "**Rolling update**: new Pods start before old ones stop, so the app stays up.",
      "Every change creates a **revision**; `kubectl rollout history` lists them.",
      "`kubectl rollout undo` returns to the previous version."
    ]
  },
  'wl-config': {
    summary: "Keep configuration out of your container image. **ConfigMaps** hold normal settings and **Secrets** hold sensitive ones like passwords. Pods read them as environment variables or as files.",
    ideas: [
      "**ConfigMap**: plain key/value settings.",
      "**Secret**: passwords, tokens and keys. Encoded (base64), but not encrypted by default.",
      "Use them as **environment variables** or as **files** in a mounted volume.",
      "Files update when the ConfigMap changes; environment variables need a Pod restart."
    ]
  },
  'wl-autoscaling': {
    summary: "Autoscaling adds Pods when your app is busy and removes them when it is quiet. The **HorizontalPodAutoscaler (HPA)** watches CPU or memory use and changes the number of replicas for you.",
    ideas: [
      "**HPA** changes the replica count of a Deployment based on metrics.",
      "It needs **metrics-server** to see usage.",
      "Pods must set **CPU requests**, because the target is a percentage of the request.",
      "You set a **min** and **max** so it never scales too low or too high."
    ]
  },
  'wl-selfhealing': {
    summary: "Kubernetes constantly compares what you asked for with what is actually running, and fixes any difference. Crashed containers restart, missing Pods are recreated, and unhealthy Pods stop receiving traffic.",
    ideas: [
      "**Controllers** (ReplicaSet, StatefulSet, DaemonSet, Job) keep the desired state.",
      "**Liveness probe**: restarts a container that is stuck.",
      "**Readiness probe**: stops sending traffic to a Pod that isn't ready.",
      "**PodDisruptionBudget**: keeps a minimum number of Pods up during maintenance."
    ]
  },
  'wl-scheduling': {
    summary: "The scheduler decides which node each Pod runs on. You can guide it: say how much CPU and memory a Pod needs, ask for nodes with certain labels, or keep Pods off special nodes.",
    ideas: [
      "**Requests** tell the scheduler how much room a Pod needs.",
      "**nodeSelector / node affinity**: run only on nodes with certain labels.",
      "**Taints** keep Pods away from a node; **tolerations** let chosen Pods in anyway.",
      "**ResourceQuota / LimitRange** cap what a namespace can use."
    ]
  },

  // Cluster Architecture, Installation & Configuration
  'arch-rbac': {
    summary: "RBAC controls who can do what in the cluster. You write a **Role** that lists allowed actions (like \"read Pods\") and a **RoleBinding** that gives that Role to a user or an app.",
    ideas: [
      "**Role**: a list of allowed actions in one namespace. **ClusterRole**: the same, cluster-wide.",
      "**RoleBinding / ClusterRoleBinding**: gives a role to a user, group or ServiceAccount.",
      "**ServiceAccount**: an identity for apps running in Pods.",
      "Check access with `kubectl auth can-i`."
    ]
  },
  'arch-infra': {
    summary: "Before installing Kubernetes, each machine needs a few things ready: swap turned off, some kernel networking settings, a container runtime such as containerd, and the Kubernetes tools.",
    ideas: [
      "Each node needs at least 2 CPUs and 2 GB RAM, and the nodes must be able to reach each other.",
      "Turn **swap off**.",
      "Enable the kernel modules and settings that let Pod traffic be routed.",
      "Install a **container runtime** (containerd) and `kubeadm`, `kubelet`, `kubectl`."
    ]
  },
  'arch-kubeadm': {
    summary: "`kubeadm` is the official tool to build a cluster. Run `kubeadm init` on the first machine to create the control plane, install a network add-on, then run `kubeadm join` on the other machines to add them.",
    ideas: [
      "`kubeadm init` creates the control plane.",
      "Install a **CNI network plugin**, or nodes stay `NotReady`.",
      "`kubeadm join` adds worker nodes using a token.",
      "The admin kubeconfig (`/etc/kubernetes/admin.conf`) lets you use `kubectl`."
    ]
  },
  'arch-lifecycle': {
    summary: "Running a cluster means looking after it over time: upgrading Kubernetes to new versions, and backing up its database (etcd) so you can recover if something goes wrong.",
    ideas: [
      "Upgrade **one minor version at a time** (for example 1.32 → 1.33).",
      "Upgrade the control plane first, then the workers, draining each node before you upgrade it.",
      "**etcd** holds all cluster state, so back it up with `etcdctl snapshot save`.",
      "Restoring a snapshot brings the cluster back to the moment it was taken."
    ]
  },
  'arch-ha': {
    summary: "A highly available control plane has several copies of the cluster's brain, so the cluster keeps working if one machine fails. You run three (or more) control-plane nodes behind a load balancer.",
    ideas: [
      "Run **3 or 5** control-plane nodes. An odd number lets etcd keep a majority.",
      "A **load balancer** sends API traffic to any healthy control-plane node.",
      "**Stacked** etcd runs on the control-plane nodes; **external** etcd uses separate machines.",
      "Only one scheduler and one controller manager are active at a time (leader election)."
    ]
  },
  'arch-helm-kustomize': {
    summary: "Both tools help you install and manage sets of Kubernetes YAML. **Helm** is a package manager: install an app with one command and a few settings. **Kustomize** takes base YAML and layers small changes on top for each environment.",
    ideas: [
      "**Helm chart**: a package of templates. **Release**: an installed copy of a chart.",
      "`helm install`, `helm upgrade` and `helm rollback` manage releases.",
      "**Kustomize**: a `kustomization.yaml` lists resources and patches. It is built into kubectl (`kubectl apply -k`).",
      "**Overlays** customise one shared base for dev, prod and so on."
    ]
  },
  'arch-extension': {
    summary: "Kubernetes doesn't run containers, wire up networks or create disks by itself. It talks to plug-ins through standard interfaces, so you can swap a plug-in without changing Kubernetes.",
    ideas: [
      "**CRI**: how the kubelet talks to the container runtime (containerd, CRI-O).",
      "**CNI**: how Pods get network connectivity (Calico, Cilium, Flannel).",
      "**CSI**: how volumes are created and attached (cloud disks, NFS…).",
      "Your choice of CNI also decides whether NetworkPolicies work."
    ]
  },
  'arch-crd': {
    summary: "A **CustomResourceDefinition (CRD)** teaches Kubernetes a new kind of object, such as `Backup` or `Certificate`. An **operator** is a program that watches those objects and does the real work, like running backups or renewing certificates.",
    ideas: [
      "**CRD**: adds a new resource type to the Kubernetes API.",
      "**Custom resource**: an object of that new type.",
      "**Operator** = CRDs + a controller that acts on them.",
      "Operators are usually installed with Helm or manifests; `kubectl get crd` lists the types they add."
    ]
  },

  // Services & Networking
  'net-connectivity': {
    summary: "Every Pod gets its own IP address and can talk to every other Pod directly, even on another node. A network plug-in (CNI) makes this work.",
    ideas: [
      "Each Pod has a **unique IP**.",
      "Pods talk to each other **without NAT**, across nodes.",
      "Containers in the same Pod share an IP and talk over `localhost`.",
      "Pod IPs change when Pods are recreated, so use Services for stable addresses."
    ]
  },
  'net-policy': {
    summary: "By default, any Pod can talk to any other Pod. A **NetworkPolicy** is a firewall rule for Pods: once a policy selects a Pod, only the traffic you allow can reach it.",
    ideas: [
      "No policies = all traffic allowed.",
      "A policy **selects Pods** by label and lists the allowed traffic sources or destinations.",
      "A **default-deny** policy blocks everything; then you add allow rules.",
      "Policies only work if your **CNI supports them** (for example Calico or Cilium)."
    ]
  },
  'net-services': {
    summary: "Pods come and go, so their IPs change. A **Service** gives a group of Pods one stable name and IP, and spreads traffic across them.",
    ideas: [
      "**ClusterIP**: reachable only inside the cluster (the default).",
      "**NodePort**: opens the same port on every node for outside access.",
      "**LoadBalancer**: gets an external IP from the cloud provider.",
      "A Service finds its Pods with a **label selector**; the matching Pod IPs are its **endpoints**."
    ]
  },
  'net-gateway': {
    summary: "Gateway API is the newer, more flexible way to bring outside HTTP traffic into the cluster. A **Gateway** is the entry point, and **Routes** (like HTTPRoute) say which requests go to which Service.",
    ideas: [
      "**GatewayClass**: which controller implements the gateways.",
      "**Gateway**: the entry point, with the ports and protocols it listens on.",
      "**HTTPRoute**: rules that match a host or path and send the traffic to Services.",
      "It is installed as CRDs plus a controller; it is not built in."
    ]
  },
  'net-ingress': {
    summary: "An **Ingress** is a set of rules that sends outside web traffic to Services based on the hostname or URL path. The rules only take effect if an **Ingress controller** (like ingress-nginx) is running.",
    ideas: [
      "**Ingress**: rules like \"`shop.example.com/cart` → cart service\".",
      "**Ingress controller**: the proxy that actually applies the rules. You must install one.",
      "**IngressClass** picks which controller handles an Ingress.",
      "HTTPS uses a TLS certificate stored in a Secret."
    ]
  },
  'net-coredns': {
    summary: "CoreDNS is the cluster's phone book. It lets Pods reach Services by name (like `web` or `db.prod`) instead of by IP address.",
    ideas: [
      "Every Service gets a DNS name: `<service>.<namespace>.svc.cluster.local`.",
      "Pods in the same namespace can use just the short name (`web`).",
      "CoreDNS runs as Pods in `kube-system`; its settings live in the `coredns` ConfigMap.",
      "If DNS breaks, apps can't find each other by name, so check the CoreDNS Pods first."
    ]
  }
};
