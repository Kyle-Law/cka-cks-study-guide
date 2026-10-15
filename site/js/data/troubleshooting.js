(window.COURSE_DOMAINS = window.COURSE_DOMAINS || []).push({
  id: 'troubleshooting', title: 'Troubleshooting', weight: 30,
  topics: [
    {
      id: 'ts-nodes',
      title: 'Troubleshoot clusters and nodes',
      points: [
        'Start broad: `kubectl get nodes -o wide`, `kubectl describe node <n>` (Conditions: `Ready`, `MemoryPressure`, `DiskPressure`, `PIDPressure`, `NetworkUnavailable`; Events; Allocatable vs Allocated).',
        '`NotReady` is almost always kubelet, the container runtime, or the CNI. SSH to the node and run `systemctl status kubelet`, `journalctl -u kubelet -e --no-pager`, `systemctl status containerd`.',
        'Kubelet config: `/var/lib/kubelet/config.yaml`, service drop-in `/usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf`, kubeconfig `/etc/kubernetes/kubelet.conf`. After edits: `systemctl daemon-reload && systemctl restart kubelet`.',
        'Common causes: kubelet stopped/disabled, wrong path to CA/kubeconfig, swap on, wrong `containerRuntimeEndpoint`, expired certs, disk full, firewall on 6443/10250.',
        'Cordon/drain: `kubectl cordon`, `kubectl drain <n> --ignore-daemonsets --delete-emptydir-data`, `kubectl uncordon`.',
        'API server unreachable: check `~/.kube/config` (server address, context, cert expiry), then control-plane static pods via `crictl ps -a`.',
        'Certificates: `kubeadm certs check-expiration`, `kubeadm certs renew all`.',
        'Use `crictl` (not docker) on nodes: `crictl ps -a`, `crictl logs <id>`, `crictl pods`.'
      ],
      labs: [
        {
          title: 'Fix a NotReady worker (kubelet stopped)',
          tags: ['kubeadm VMs'],
          goal: 'Practise the node-level diagnosis loop.',
          steps: [
            ['On the worker, stop the kubelet:', 'sudo systemctl stop kubelet'],
            ['From the control plane, observe the node go `NotReady` (takes ~40s):', 'kubectl get nodes -w'],
            ['SSH to the worker and diagnose:', 'systemctl status kubelet\nsudo journalctl -u kubelet -n 50 --no-pager'],
            ['Fix and confirm:', 'sudo systemctl enable --now kubelet'],
            ['Variant: break the config. Edit `/var/lib/kubelet/config.yaml` (e.g. wrong `clientCAFile`), restart, and find the error in `journalctl`. Then fix it.', '']
          ],
          verify: '`kubectl get nodes` shows both nodes `Ready`.'
        },
        {
          title: 'Drain and cordon',
          goal: 'Move workloads off a node safely (works on kind multi-node).',
          steps: [
            ['Create a 3-node kind cluster if needed:', 'cat > kind.yaml <<EOF\nkind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\nnodes: [{role: control-plane},{role: worker},{role: worker}]\nEOF\nkind create cluster --config kind.yaml'],
            ['Deploy and drain:', 'kubectl create deploy web --image=nginx --replicas=4\nkubectl get pods -o wide\nkubectl drain kind-worker --ignore-daemonsets --delete-emptydir-data\nkubectl get pods -o wide'],
            ['Return the node:', 'kubectl uncordon kind-worker']
          ],
          verify: 'No `web` Pods ran on the drained node while it was cordoned.'
        }
      ],
      refs: [
        ['Troubleshooting Clusters', 'https://kubernetes.io/docs/tasks/debug/debug-cluster/'],
        ['Node status & conditions', 'https://kubernetes.io/docs/reference/node/node-status/'],
        ['Troubleshooting kubeadm', 'https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/troubleshooting-kubeadm/'],
        ['Safely Drain a Node', 'https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/'],
        ['Debugging Kubernetes nodes with crictl', 'https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/'],
        ['Certificate management with kubeadm', 'https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/']
      ]
    },
    {
      id: 'ts-components',
      title: 'Troubleshoot cluster components',
      points: [
        'On kubeadm clusters the control plane runs as **static Pods** from `/etc/kubernetes/manifests/` (`kube-apiserver`, `kube-controller-manager`, `kube-scheduler`, `etcd`). The kubelet watches that directory; editing a manifest restarts the component.',
        'If the API server is down, `kubectl` fails. Use `crictl ps -a | grep kube-apiserver` and `crictl logs <id>` on the control-plane node, or `/var/log/pods/` and `/var/log/containers/`.',
        'Typical breakages: typo in manifest flags, wrong cert/key path, wrong `--etcd-servers`, wrong `--service-cluster-ip-range`, bad image tag, wrong `hostPath` volume.',
        'Scheduler down → new Pods stay `Pending` with no events. Controller-manager down → Deployments do not create ReplicaSets/Pods, nodes never marked NotReady.',
        'etcd health: `ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key endpoint health`.',
        'Component health endpoints: `kubectl get --raw=/readyz?verbose`, `/livez?verbose`.',
        'kube-proxy and CoreDNS are DaemonSet/Deployment in `kube-system`: `kubectl -n kube-system get pods`, `kubectl -n kube-system logs <pod>`.',
        'Kubelet is **not** a Pod. It is a systemd service: use `journalctl -u kubelet`.'
      ],
      labs: [{
        title: 'Break and fix the scheduler and API server',
        tags: ['kubeadm VMs'],
        goal: 'Learn to find the fault from symptoms alone.',
        steps: [
          ['On the control-plane node, break the scheduler by mistyping a flag:', 'sudo cp /etc/kubernetes/manifests/kube-scheduler.yaml /root/\nsudo sed -i \'s/- kube-scheduler/- kube-schedulerr/\' /etc/kubernetes/manifests/kube-scheduler.yaml'],
          ['Create a Pod and observe it stuck Pending with no events, then find the crash:', 'kubectl run t --image=nginx\nkubectl get pod t\nsudo crictl ps -a | grep scheduler\nsudo crictl logs <container-id>'],
          ['Restore the file and see the Pod schedule:', 'sudo cp /root/kube-scheduler.yaml /etc/kubernetes/manifests/'],
          ['Harder: change `--etcd-servers` in `kube-apiserver.yaml` to a wrong port. Observe `kubectl` refusing connections, and recover using `crictl logs`.', '']
        ],
        verify: 'Pod `t` goes `Running`; `kubectl get --raw=/readyz` returns `ok`.'
      }],
      refs: [
        ['Troubleshooting Clusters: components', 'https://kubernetes.io/docs/tasks/debug/debug-cluster/'],
        ['Kubernetes components', 'https://kubernetes.io/docs/concepts/overview/components/'],
        ['Static Pods', 'https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/'],
        ['Kubernetes API health endpoints', 'https://kubernetes.io/docs/reference/using-api/health-checks/'],
        ['Operating etcd clusters', 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/']
      ]
    },
    {
      id: 'ts-monitor',
      title: 'Monitor cluster and application resource usage',
      points: [
        '`kubectl top node` and `kubectl top pod [-A] [--containers] [--sort-by=cpu]` need **metrics-server**. They show current CPU (millicores) and memory.',
        'metrics-server scrapes kubelets (`/metrics/resource`) and serves the `metrics.k8s.io` API. Check with `kubectl get apiservice v1beta1.metrics.k8s.io`.',
        'In labs, metrics-server often needs `--kubelet-insecure-tls`. Edit its Deployment args.',
        'Requests vs limits: scheduler uses requests; limits are enforced at runtime (CPU throttled, memory OOMKilled).',
        '`kubectl describe node` → "Allocated resources" shows requested totals per node.',
        'Events: `kubectl get events -A --sort-by=.lastTimestamp`.',
        'Exit code 137 / reason `OOMKilled` means memory limit exceeded. See `kubectl describe pod` → Last State.',
        'Full monitoring (Prometheus, Grafana) is beyond the exam; metrics-server + `kubectl top` is the core.'
      ],
      labs: [{
        title: 'Install metrics-server and find the hungry Pod',
        goal: 'Get `kubectl top` working and identify heavy consumers.',
        steps: [
          ['Install metrics-server:', 'kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml'],
          ['On kind/minikube add `--kubelet-insecure-tls` to args:', 'kubectl -n kube-system patch deploy metrics-server --type=json -p=\'[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]\''],
          ['Create a CPU burner and a memory-limited Pod:', 'kubectl run burn --image=busybox -- sh -c "while true; do :; done"\nkubectl run oom --image=polinux/stress --restart=Never --limits=memory=50Mi -- stress --vm 1 --vm-bytes 200M'],
          ['Observe:', 'kubectl top nodes\nkubectl top pods -A --sort-by=cpu\nkubectl describe pod oom | grep -A5 "Last State\\|State:"']
        ],
        verify: '`burn` tops the CPU list; `oom` shows `OOMKilled`.',
        cleanup: 'kubectl delete pod burn oom'
      }],
      refs: [
        ['Tools for Monitoring Resources', 'https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-usage-monitoring/'],
        ['Resource metrics pipeline', 'https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/'],
        ['Resource Management for Pods and Containers', 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/'],
        ['metrics-server (GitHub)', 'https://github.com/kubernetes-sigs/metrics-server']
      ]
    },
    {
      id: 'ts-logs',
      title: 'Manage and evaluate container output streams',
      points: [
        '`kubectl logs <pod> [-c container] [-f] [--tail=N] [--since=10m] [--timestamps]`. Add `--previous` (`-p`) for the last crashed container.',
        '`kubectl logs -l app=web --all-containers --prefix` aggregates by label; `kubectl logs deploy/web`, `job/x` also work.',
        'Containers should log to stdout/stderr; the runtime writes them to `/var/log/pods/…` and `/var/log/containers/` on the node (rotated by kubelet).',
        'Node-level logs when the API is unavailable: `crictl logs`, `journalctl -u kubelet`, `journalctl -u containerd`.',
        'Multi-container Pods: you must choose the container with `-c` (or `--all-containers`). Init containers: `-c <init-name>`.',
        'Cluster-level logging (EFK, Loki, etc.) uses a node agent DaemonSet or sidecars. Know the patterns.',
        'Diagnose with the trio: `kubectl describe pod` (events, state, exit code), `kubectl logs`, `kubectl get events`.',
        '`kubectl debug` / `kubectl exec` for interactive inspection; `kubectl debug node/<n> -it --image=busybox` for node access.'
      ],
      labs: [{
        title: 'Read logs from crashed and multi-container Pods',
        goal: 'Use every logs flag in a realistic failure.',
        steps: [
          ['A crash-looping Pod and a two-container Pod:', `kubectl run crash --image=busybox -- sh -c 'echo starting; echo fatal error >&2; exit 1'
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: two}
spec:
  containers:
  - {name: a, image: busybox, command: [sh,-c,"while true; do echo from-a; sleep 2; done"]}
  - {name: b, image: busybox, command: [sh,-c,"while true; do echo from-b; sleep 2; done"]}
EOF`],
          ['Read the previous crashed instance:', 'kubectl get pod crash\nkubectl logs crash --previous\nkubectl describe pod crash | grep -i "exit code\\|reason"'],
          ['Multi-container variants:', 'kubectl logs two -c a --tail=3\nkubectl logs two --all-containers --prefix --timestamps\nkubectl logs two -c b -f --since=1m'],
          ['Save logs to a file (typical exam task):', 'kubectl logs two -c a > /tmp/a.log']
        ],
        verify: '`--previous` shows `starting` and `fatal error`.',
        cleanup: 'kubectl delete pod crash two --now'
      }],
      refs: [
        ['Logging Architecture', 'https://kubernetes.io/docs/concepts/cluster-administration/logging/'],
        ['Determine the Reason for Pod Failure', 'https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/'],
        ['Debug Running Pods', 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/'],
        ['kubectl logs reference', 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/'],
        ['Debug Pods', 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/']
      ]
    },
    {
      id: 'ts-services',
      title: 'Troubleshoot services and networking',
      points: [
        'Work down the path: Pod healthy? → Service selector matches Pod labels? → Endpoints populated? → `targetPort` correct? → DNS resolves? → NetworkPolicy blocking? → kube-proxy/CNI OK?',
        '`kubectl get endpoints <svc>` (or `endpointslices`) empty = selector mismatch or Pods not Ready (failing readiness probe).',
        '`port` is what the Service exposes; `targetPort` is the container port. `nodePort` range 30000–32767.',
        'Test from inside the cluster: `kubectl run tmp --rm -it --image=busybox --restart=Never -- wget -qO- http://svc.ns.svc.cluster.local`. Use `nicolaka/netshoot` for dig/curl/tcpdump.',
        'DNS: `nslookup kubernetes.default`; check CoreDNS Pods and logs, and the Pod `/etc/resolv.conf` (`ndots:5`, search domains).',
        'Pods can’t reach each other or the Service IP: check CNI Pods in `kube-system`, node `NetworkUnavailable`, kube-proxy logs, `iptables-save | grep <svc>`.',
        'Ingress 404/502: check the Ingress class, controller logs, backend Service/port name, and path type.',
        'NetworkPolicy default-deny silently drops traffic. List with `kubectl get netpol -A`.'
      ],
      labs: [{
        title: 'Diagnose three broken Services',
        goal: 'Fix selector, targetPort and readiness faults.',
        steps: [
          ['Create the app and three deliberately broken Services:', `kubectl create deploy web --image=nginx --replicas=2
kubectl expose deploy web --name=bad-selector --port=80
kubectl patch svc bad-selector -p '{"spec":{"selector":{"app":"wrong"}}}'
kubectl expose deploy web --name=bad-port --port=80 --target-port=8080
kubectl set env deploy/web X=1 >/dev/null
kubectl patch deploy web --type=json -p='[{"op":"add","path":"/spec/template/spec/containers/0/readinessProbe","value":{"httpGet":{"path":"/nope","port":80}}}]'`],
          ['Look at endpoints for each service and find why each fails:', 'kubectl get svc,endpoints\nkubectl describe pod -l app=web | grep -i readiness'],
          ['Fix each (selector → `app=web`, targetPort → 80, remove the bad probe):', 'kubectl patch svc bad-selector -p \'{"spec":{"selector":{"app":"web"}}}\'\nkubectl patch svc bad-port -p \'{"spec":{"ports":[{"port":80,"targetPort":80}]}}\'\nkubectl patch deploy web --type=json -p=\'[{"op":"remove","path":"/spec/template/spec/containers/0/readinessProbe"}]\''],
          ['Test connectivity from a client Pod:', 'kubectl run c --rm -it --image=busybox --restart=Never -- wget -qO- -T3 bad-selector']
        ],
        verify: 'Both Services have endpoints and return the nginx welcome page.',
        cleanup: 'kubectl delete deploy web; kubectl delete svc bad-selector bad-port'
      }],
      refs: [
        ['Debug Services', 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/'],
        ['Debugging DNS Resolution', 'https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/'],
        ['Connecting Applications with Services', 'https://kubernetes.io/docs/tutorials/services/connect-applications-service/'],
        ['Cluster Networking', 'https://kubernetes.io/docs/concepts/cluster-administration/networking/'],
        ['Virtual IPs and Service Proxies', 'https://kubernetes.io/docs/reference/networking/virtual-ips/']
      ]
    }
  ]
});
