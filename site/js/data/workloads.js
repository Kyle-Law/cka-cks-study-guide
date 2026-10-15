(window.COURSE_DOMAINS = window.COURSE_DOMAINS || []).push({
  id: 'workloads', title: 'Workloads & Scheduling', weight: 15,
  topics: [
    {
      id: 'wl-deployments',
      title: 'Deployments, rolling updates & rollbacks',
      points: [
        'Deployment → ReplicaSet → Pods. Changing the Pod template creates a new ReplicaSet (a new revision).',
        'Strategy `RollingUpdate` (default) uses `maxSurge` and `maxUnavailable` (numbers or %). `Recreate` kills all old Pods first.',
        'Update image: `kubectl set image deploy/web nginx=nginx:1.27`. Watch: `kubectl rollout status deploy/web`.',
        'History and rollback: `kubectl rollout history deploy/web [--revision=2]`, `kubectl rollout undo deploy/web [--to-revision=1]`. Retention is `revisionHistoryLimit` (default 10).',
        '`kubectl rollout pause|resume` lets you batch several changes into one rollout. `kubectl rollout restart` re-creates Pods.',
        'Scale: `kubectl scale deploy/web --replicas=5`. A stuck rollout (bad image) is bounded by `progressDeadlineSeconds`.',
        'Selector is immutable; labels in the template must match the selector.',
        'Use `--record` is deprecated; set the `kubernetes.io/change-cause` annotation instead.'
      ],
      labs: [{
        title: 'Rolling update, bad release, rollback',
        goal: 'Control a rollout end-to-end.',
        steps: [
          ['Create with a surge/unavailable policy:', `kubectl create deploy web --image=nginx:1.25 --replicas=4
kubectl patch deploy web -p '{"spec":{"strategy":{"rollingUpdate":{"maxSurge":1,"maxUnavailable":0}}}}'
kubectl annotate deploy web kubernetes.io/change-cause="initial 1.25"`],
          ['Roll out a good version, then a bad one:', `kubectl set image deploy/web nginx=nginx:1.27
kubectl annotate deploy web kubernetes.io/change-cause="to 1.27" --overwrite
kubectl rollout status deploy/web
kubectl set image deploy/web nginx=nginx:doesnotexist
kubectl rollout status deploy/web --timeout=30s
kubectl get pods`],
          ['Inspect history and roll back:', 'kubectl rollout history deploy/web\nkubectl rollout undo deploy/web\nkubectl rollout status deploy/web'],
          ['Generate YAML for the exam instead of typing it:', 'kubectl create deploy api --image=nginx --replicas=3 --dry-run=client -o yaml > api.yaml']
        ],
        verify: 'After the undo, `kubectl get deploy web -o jsonpath="{.spec.template.spec.containers[0].image}"` prints `nginx:1.27`, and no Pod is in `ImagePullBackOff`.',
        cleanup: 'kubectl delete deploy web api'
      }],
      refs: [
        ['Deployments', 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/'],
        ['Performing a Rolling Update', 'https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/'],
        ['kubectl rollout', 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/'],
        ['kubectl cheat sheet: updating resources', 'https://kubernetes.io/docs/reference/kubectl/quick-reference/#updating-resources']
      ]
    },
    {
      id: 'wl-config',
      title: 'ConfigMaps and Secrets',
      points: [
        'ConfigMap: non-confidential key/value config. Secret: sensitive data, base64-**encoded** (not encrypted unless etcd encryption at rest is configured).',
        'Create: `kubectl create configmap app --from-literal=K=V --from-file=app.properties`; `kubectl create secret generic db --from-literal=password=s3cr3t`. Types: `generic`, `docker-registry`, `tls`.',
        'Consume as env: `env[].valueFrom.configMapKeyRef|secretKeyRef`, or all keys with `envFrom`.',
        'Consume as files: mount as a volume; each key becomes a file. Volume-mounted values **update automatically** (eventually); env vars do **not** until Pod restart. `subPath` mounts never update.',
        '`immutable: true` prevents changes and improves performance.',
        'Decode: `kubectl get secret db -o jsonpath="{.data.password}" | base64 -d`.',
        'Both are namespaced, and the Pod must be in the same namespace.',
        'Secret hygiene: RBAC to limit `get/list` on Secrets, encryption at rest, avoid putting them in images or Git.'
      ],
      labs: [{
        title: 'Inject config via env and volume',
        goal: 'Use both consumption methods and see the update behaviour difference.',
        steps: [
          ['Create the objects:', 'kubectl create configmap app --from-literal=MODE=dev --from-literal=LEVEL=info\nkubectl create secret generic db --from-literal=password=s3cr3t'],
          ['Pod consuming both:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: cfg}
spec:
  containers:
  - name: c
    image: busybox
    command: [sh,-c,"sleep 3600"]
    envFrom: [{configMapRef: {name: app}}]
    env:
    - name: DB_PASS
      valueFrom: {secretKeyRef: {name: db, key: password}}
    volumeMounts:
    - {name: conf, mountPath: /etc/app}
    - {name: sec, mountPath: /etc/secret, readOnly: true}
  volumes:
  - {name: conf, configMap: {name: app}}
  - {name: sec, secret: {secretName: db}}
EOF`],
          ['Check, then change the ConfigMap and compare env vs file after ~1 min:', 'kubectl exec cfg -- sh -c \'echo $MODE $DB_PASS; cat /etc/app/MODE\'\nkubectl patch cm app -p \'{"data":{"MODE":"prod"}}\'\nsleep 70; kubectl exec cfg -- sh -c \'echo env=$MODE file=$(cat /etc/app/MODE)\'']
        ],
        verify: 'env still shows `dev` while the file shows `prod`.',
        cleanup: 'kubectl delete pod cfg --now; kubectl delete cm app; kubectl delete secret db'
      }],
      refs: [
        ['ConfigMaps', 'https://kubernetes.io/docs/concepts/configuration/configmap/'],
        ['Secrets', 'https://kubernetes.io/docs/concepts/configuration/secret/'],
        ['Configure a Pod to Use a ConfigMap', 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/'],
        ['Distribute Credentials Securely Using Secrets', 'https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/'],
        ['Encrypting Confidential Data at Rest', 'https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/']
      ]
    },
    {
      id: 'wl-autoscaling',
      title: 'Workload autoscaling (HPA)',
      points: [
        'HorizontalPodAutoscaler (`autoscaling/v2`) scales replicas of a Deployment/StatefulSet/ReplicaSet based on metrics. Needs **metrics-server** for CPU/memory.',
        'Formula: `desired = ceil(current × currentMetric / targetMetric)`. Utilization is relative to the container **requests**, so Pods **must define CPU requests**.',
        'Quick create: `kubectl autoscale deploy web --cpu-percent=50 --min=2 --max=10`.',
        '`behavior` controls scale-up/down policies and `stabilizationWindowSeconds` (default 300s for scale-down).',
        'Targets can be `Resource`, `Pods`, `Object`, or `External` metrics (custom metrics need an adapter).',
        'HPA conflicts with manually managed `replicas` in a Deployment manifest; remove `replicas` from GitOps manifests.',
        'Related: VerticalPodAutoscaler (add-on; not core) and Cluster Autoscaler (nodes).',
        '`TARGETS <unknown>/50%` means no metrics: missing metrics-server or no requests.'
      ],
      labs: [{
        title: 'Autoscale an app under load',
        goal: 'Watch HPA scale up and back down.',
        steps: [
          ['Needs metrics-server (see the monitoring lab). Deploy with CPU requests:', `kubectl create deploy php --image=registry.k8s.io/hpa-example
kubectl set resources deploy php --requests=cpu=200m --limits=cpu=500m
kubectl expose deploy php --port=80
kubectl autoscale deploy php --cpu-percent=50 --min=1 --max=5`],
          ['Generate load:', 'kubectl run load --image=busybox --restart=Never -- sh -c "while true; do wget -q -O- http://php; done"'],
          ['Watch scaling in a second terminal:', 'kubectl get hpa php -w'],
          ['Stop load and wait for scale down (~5 min):', 'kubectl delete pod load --now']
        ],
        verify: 'REPLICAS rises above 1 under load and returns to 1 afterwards.',
        cleanup: 'kubectl delete hpa php; kubectl delete deploy php; kubectl delete svc php'
      }],
      refs: [
        ['Horizontal Pod Autoscaling', 'https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/'],
        ['HPA Walkthrough', 'https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/'],
        ['kubectl autoscale', 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_autoscale/'],
        ['Autoscaling Workloads', 'https://kubernetes.io/docs/concepts/workloads/autoscaling/']
      ]
    },
    {
      id: 'wl-selfhealing',
      title: 'Self-healing & robust deployment primitives',
      points: [
        'Controllers reconcile desired vs actual state: **ReplicaSet** (N copies), **Deployment** (rollouts), **StatefulSet** (stable identity/storage/ordering, needs a headless Service), **DaemonSet** (one Pod per node), **Job/CronJob** (run to completion).',
        '`restartPolicy`: `Always` (Deployments), `OnFailure`/`Never` (Jobs). Crashes use exponential back-off (`CrashLoopBackOff`).',
        'Probes: **liveness** (restart container), **readiness** (remove from Service endpoints), **startup** (protect slow starters; disables the others until it succeeds). Types: `httpGet`, `tcpSocket`, `exec`, `grpc`.',
        'Resource `requests/limits` and QoS classes: `Guaranteed`, `Burstable`, `BestEffort` (evicted first).',
        '`PodDisruptionBudget` limits voluntary disruptions (drain/upgrade): `minAvailable` or `maxUnavailable`.',
        'Init containers run sequentially before app containers. Sidecars: init containers with `restartPolicy: Always`.',
        '`terminationGracePeriodSeconds` and `preStop` hooks enable graceful shutdown.',
        'Spread replicas for HA with `topologySpreadConstraints` or pod anti-affinity.'
      ],
      labs: [{
        title: 'Probes, PDB and self-healing in action',
        goal: 'Prove a failing liveness probe restarts a container and a readiness probe removes traffic.',
        steps: [
          ['Pod whose liveness fails after 15s:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: live}
spec:
  containers:
  - name: c
    image: busybox
    command: [sh,-c,"touch /tmp/ok; sleep 15; rm /tmp/ok; sleep 3600"]
    livenessProbe: {exec: {command: [cat,/tmp/ok]}, initialDelaySeconds: 5, periodSeconds: 5}
EOF
kubectl get pod live -w`],
          ['Deployment with a readiness probe, and a Service:', `kubectl create deploy r --image=nginx --replicas=3
kubectl patch deploy r --type=json -p='[{"op":"add","path":"/spec/template/spec/containers/0/readinessProbe","value":{"httpGet":{"path":"/","port":80}}}]'
kubectl expose deploy r --port=80
kubectl exec deploy/r -- rm /usr/share/nginx/html/index.html
kubectl get endpoints r`],
          ['Pod disruption budget and a drain attempt:', 'kubectl create pdb r-pdb --selector=app=r --min-available=2\nkubectl get pdb'],
          ['Delete a Pod from a Deployment and watch it be replaced:', 'kubectl delete pod -l app=r --wait=false; kubectl get pods -w']
        ],
        verify: 'RESTARTS on `live` increments; the Pod with the removed index file leaves the Endpoints list.',
        cleanup: 'kubectl delete pod live --now; kubectl delete deploy r; kubectl delete svc r; kubectl delete pdb r-pdb'
      }],
      refs: [
        ['ReplicaSet', 'https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/'],
        ['StatefulSets', 'https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/'],
        ['DaemonSet', 'https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/'],
        ['Jobs', 'https://kubernetes.io/docs/concepts/workloads/controllers/job/'],
        ['CronJob', 'https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/'],
        ['Liveness, Readiness and Startup Probes', 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/'],
        ['Disruptions & PodDisruptionBudget', 'https://kubernetes.io/docs/concepts/workloads/pods/disruptions/'],
        ['Init Containers', 'https://kubernetes.io/docs/concepts/workloads/pods/init-containers/']
      ]
    },
    {
      id: 'wl-scheduling',
      title: 'Pod admission & scheduling (limits, affinity, taints…)',
      points: [
        '**Requests** drive scheduling; **limits** cap usage. `LimitRange` sets per-namespace defaults/min/max; `ResourceQuota` caps namespace totals (a quota on cpu/memory forces Pods to specify them).',
        '`nodeSelector`: simplest label match. `nodeName` bypasses the scheduler.',
        '**Node affinity**: `requiredDuringSchedulingIgnoredDuringExecution` (hard) and `preferred…` (soft, with weights). Operators: `In, NotIn, Exists, DoesNotExist, Gt, Lt`.',
        '**Pod affinity / anti-affinity** use `topologyKey` (e.g. `kubernetes.io/hostname`) to co-locate or spread Pods.',
        '**Taints** repel Pods from nodes (`key=value:NoSchedule|PreferNoSchedule|NoExecute`); **tolerations** let Pods through. A toleration does not attract; combine with affinity.',
        'Commands: `kubectl label node n1 disk=ssd`, `kubectl taint nodes n1 gpu=true:NoSchedule`, remove with trailing `-`.',
        '`topologySpreadConstraints` spread Pods evenly across zones/nodes. `priorityClassName` and preemption influence who gets scheduled.',
        'Static Pods (`/etc/kubernetes/manifests`) are run directly by the kubelet; a manually-scheduled alternative is a custom scheduler or `schedulerName`.',
        'A Pod stuck `Pending` → `kubectl describe pod` → scheduler event explains (insufficient cpu, taints, affinity, unbound PVC).'
      ],
      labs: [{
        title: 'Steer Pods with labels, affinity, taints and quotas',
        goal: 'Use a multi-node kind cluster (see the drain lab for the config).',
        steps: [
          ['Label and taint nodes:', 'kubectl label node kind-worker disk=ssd\nkubectl taint nodes kind-worker2 dedicated=gpu:NoSchedule'],
          ['nodeSelector and node affinity:', `kubectl run sel --image=nginx --overrides='{"spec":{"nodeSelector":{"disk":"ssd"}}}'
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: aff}
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions: [{key: disk, operator: In, values: [ssd]}]
  containers: [{name: c, image: nginx}]
EOF
kubectl get pods -o wide`],
          ['Toleration: schedule onto the tainted node:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: tol}
spec:
  nodeSelector: {kubernetes.io/hostname: kind-worker2}
  tolerations: [{key: dedicated, operator: Equal, value: gpu, effect: NoSchedule}]
  containers: [{name: c, image: nginx}]
EOF`],
          ['Pod anti-affinity: spread 3 replicas to different nodes:', `cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata: {name: spread}
spec:
  replicas: 2
  selector: {matchLabels: {app: spread}}
  template:
    metadata: {labels: {app: spread}}
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector: {matchLabels: {app: spread}}
            topologyKey: kubernetes.io/hostname
      containers: [{name: c, image: nginx}]
EOF
kubectl get pods -l app=spread -o wide`],
          ['LimitRange and ResourceQuota:', `kubectl create ns q
kubectl -n q create quota qt --hard=pods=2,requests.cpu=1,limits.cpu=2
kubectl -n q run a --image=nginx --requests=cpu=100m --limits=cpu=200m
kubectl -n q run b --image=nginx --requests=cpu=100m --limits=cpu=200m
kubectl -n q run c --image=nginx --requests=cpu=100m --limits=cpu=200m`]
        ],
        verify: '`sel`/`aff` run on `kind-worker`; `tol` on `kind-worker2`; the third Pod in namespace `q` is rejected by the quota (`exceeded quota`).',
        cleanup: 'kubectl delete pod sel aff tol --now; kubectl delete deploy spread; kubectl delete ns q; kubectl taint nodes kind-worker2 dedicated-; kubectl label node kind-worker disk-'
      }],
      refs: [
        ['Assigning Pods to Nodes', 'https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/'],
        ['Taints and Tolerations', 'https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/'],
        ['Resource Management for Pods and Containers', 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/'],
        ['Limit Ranges', 'https://kubernetes.io/docs/concepts/policy/limit-range/'],
        ['Resource Quotas', 'https://kubernetes.io/docs/concepts/policy/resource-quotas/'],
        ['Pod Topology Spread Constraints', 'https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/'],
        ['Pod Priority and Preemption', 'https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/'],
        ['Pod QoS Classes', 'https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/']
      ]
    }
  ]
});
