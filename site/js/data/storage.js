(window.COURSE_DOMAINS = window.COURSE_DOMAINS || []).push({
  id: 'storage', title: 'Storage', weight: 10,
  topics: [
    {
      id: 'storage-classes',
      title: 'Storage classes & dynamic provisioning',
      points: [
        'A `StorageClass` describes a "class" of storage: the `provisioner` (CSI driver), `parameters`, `reclaimPolicy` and `volumeBindingMode`.',
        'Dynamic provisioning: a PVC that names a StorageClass makes the provisioner create the PV automatically. No pre-created PV needed.',
        'Default class: annotation `storageclass.kubernetes.io/is-default-class: "true"`. A PVC with no `storageClassName` uses it. `storageClassName: ""` disables dynamic provisioning.',
        '`volumeBindingMode: WaitForFirstConsumer` delays binding until a Pod is scheduled, so the volume is created in the right zone/node. `Immediate` is the default.',
        '`allowVolumeExpansion: true` lets you grow a PVC by editing `spec.resources.requests.storage` (grow only, never shrink).',
        'StorageClass `reclaimPolicy` (default `Delete`) is copied to dynamically created PVs.',
        'A PVC stuck in `Pending` usually means: no matching class, no default class, no provisioner, or `WaitForFirstConsumer` with no Pod yet.'
      ],
      labs: [{
        title: 'Create a StorageClass and dynamically provision a PVC',
        goal: 'Use kind (ships with `rancher.io/local-path` class `standard`) or minikube (`k8s.io/minikube-hostpath`).',
        steps: [
          ['List classes and see which one is default:', 'kubectl get storageclass\nkubectl describe sc standard'],
          ['Create a new class with `WaitForFirstConsumer` and `Retain` (kind example):', `cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-retain
provisioner: rancher.io/local-path
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
EOF`],
          ['Create a PVC. It will stay Pending because there is no consumer yet:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  storageClassName: fast-retain
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
EOF
kubectl get pvc data`],
          ['Create a Pod that uses it, then watch the PVC bind and a PV appear:', `kubectl run app --image=busybox --restart=Never --overrides='{"spec":{"containers":[{"name":"app","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"d","mountPath":"/data"}]}],"volumes":[{"name":"d","persistentVolumeClaim":{"claimName":"data"}}]}}'
kubectl get pvc,pv`],
          ['Make `fast-retain` the default class (and remove the default from `standard`):', `kubectl patch sc standard -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
kubectl patch sc fast-retain -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'`]
        ],
        verify: '`kubectl get pvc data` shows `Bound`, and `kubectl exec app -- sh -c "echo hi > /data/x"` succeeds.',
        cleanup: 'kubectl delete pod app; kubectl delete pvc data; kubectl delete pv --all; kubectl delete sc fast-retain'
      }],
      refs: [
        ['Storage Classes', 'https://kubernetes.io/docs/concepts/storage/storage-classes/'],
        ['Dynamic Volume Provisioning', 'https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/'],
        ['Change the default StorageClass', 'https://kubernetes.io/docs/tasks/administer-cluster/change-default-storage-class/'],
        ['Volume expansion (PVC resize)', 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/#expanding-persistent-volumes-claims']
      ]
    },
    {
      id: 'volume-types',
      title: 'Volume types, access modes & reclaim policies',
      points: [
        'Ephemeral volumes live with the Pod: `emptyDir` (scratch, optional `medium: Memory`), `configMap`, `secret`, `downwardAPI`, `projected`.',
        '`hostPath` mounts a node path. Fine for single-node labs and static pods, risky elsewhere.',
        'Persistent volumes outlive Pods: via PV/PVC backed by CSI drivers, NFS, local, etc.',
        'Access modes: `ReadWriteOnce` (RWO, one node), `ReadOnlyMany` (ROX), `ReadWriteMany` (RWX), `ReadWriteOncePod` (RWOP, a single Pod). Mode is a capability of the volume, matched at binding.',
        'Reclaim policies: `Retain` (PV becomes `Released`, data kept, needs manual cleanup), `Delete` (backing storage deleted with the PVC), `Recycle` (deprecated).',
        'Change a PV policy: `kubectl patch pv <pv> -p \'{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}\'`.',
        '`volumeMode`: `Filesystem` (default) or `Block` (raw device via `volumeDevices`).',
        'Pod-level volume sharing: multiple containers in one Pod can mount the same `emptyDir`.'
      ],
      labs: [{
        title: 'Share an emptyDir and compare reclaim policies',
        goal: 'See ephemeral vs persistent behaviour and how Retain/Delete differ.',
        steps: [
          ['Two containers sharing an `emptyDir`:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: share}
spec:
  volumes: [{name: scratch, emptyDir: {}}]
  containers:
  - {name: writer, image: busybox, command: [sh,-c,"date > /out/now; sleep 3600"], volumeMounts: [{name: scratch, mountPath: /out}]}
  - {name: reader, image: busybox, command: [sh,-c,"sleep 3600"], volumeMounts: [{name: scratch, mountPath: /in}]}
EOF
kubectl exec share -c reader -- cat /in/now`],
          ['Delete and recreate the Pod: the file is gone because emptyDir is tied to the Pod lifetime:', 'kubectl delete pod share --now'],
          ['Create a PV with `Retain` using hostPath, plus a PVC, then delete the PVC:', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata: {name: pv-retain}
spec:
  capacity: {storage: 1Gi}
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath: {path: /tmp/pv-retain}
EOF
kubectl get pv pv-retain`]
        ],
        verify: 'After the PVC using `pv-retain` is deleted, `kubectl get pv` shows `Released`, not removed.',
        cleanup: 'kubectl delete pv pv-retain'
      }],
      refs: [
        ['Volumes', 'https://kubernetes.io/docs/concepts/storage/volumes/'],
        ['Persistent Volumes: access modes & reclaim policy', 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/'],
        ['Change the reclaim policy of a PV', 'https://kubernetes.io/docs/tasks/administer-cluster/change-pv-reclaim-policy/'],
        ['Container Storage Interface (CSI)', 'https://kubernetes.io/docs/concepts/storage/volumes/#csi']
      ]
    },
    {
      id: 'pv-pvc',
      title: 'Persistent volumes & persistent volume claims',
      points: [
        'PV is cluster-scoped supply; PVC is namespaced demand. A PVC binds one-to-one to a PV that satisfies its size (≥), access modes, `storageClassName` and selector.',
        'Static provisioning: an admin creates PVs. Dynamic: a StorageClass creates them.',
        'Use in a Pod: `volumes[].persistentVolumeClaim.claimName`, then `volumeMounts`.',
        'PV phases: `Available` → `Bound` → `Released` → (`Failed`). A Released PV with a stale `claimRef` is not reusable until the `claimRef` is cleared.',
        'Storage Object in Use protection: PVCs used by a Pod, or PVs bound to a PVC, are not removed until unused (finalizers).',
        'Expand: edit the PVC request (class must allow expansion). Pod may need restart for filesystem resize.',
        'Debug Pending PVC: `kubectl describe pvc` (events), check class, capacity, access mode and `nodeAffinity` mismatches.',
        'Exam pattern: create PV (hostPath), PVC, Pod/Deployment mounting it at a given path with matching `storageClassName`.'
      ],
      labs: [{
        title: 'Static PV + PVC + Pod, survive Pod deletion',
        goal: 'Create all three objects by hand and prove data persists across Pods.',
        steps: [
          ['Create the PV and PVC (same `storageClassName`, request ≤ capacity):', `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata: {name: task-pv}
spec:
  capacity: {storage: 2Gi}
  accessModes: [ReadWriteOnce]
  storageClassName: manual
  hostPath: {path: /mnt/data}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: task-pvc}
spec:
  storageClassName: manual
  accessModes: [ReadWriteOnce]
  resources: {requests: {storage: 1Gi}}
EOF
kubectl get pv,pvc`],
          ['Write data from one Pod:', `kubectl run w --image=busybox --restart=Never --overrides='{"spec":{"containers":[{"name":"w","image":"busybox","command":["sh","-c","echo persisted > /d/f; sleep 5"],"volumeMounts":[{"name":"v","mountPath":"/d"}]}],"volumes":[{"name":"v","persistentVolumeClaim":{"claimName":"task-pvc"}}]}}'`],
          ['Read it from a brand new Pod:', `kubectl run r --image=busybox --restart=Never --overrides='{"spec":{"containers":[{"name":"r","image":"busybox","command":["cat","/d/f"],"volumeMounts":[{"name":"v","mountPath":"/d"}]}],"volumes":[{"name":"v","persistentVolumeClaim":{"claimName":"task-pvc"}}]}}'
kubectl logs r`],
          ['Break it on purpose: create a PVC requesting 5Gi with `storageClassName: manual` and read why it is Pending:', 'kubectl describe pvc <name>']
        ],
        verify: '`kubectl logs r` prints `persisted`.',
        cleanup: 'kubectl delete pod w r; kubectl delete pvc task-pvc; kubectl delete pv task-pv'
      }],
      refs: [
        ['Persistent Volumes', 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/'],
        ['Configure a Pod to Use a PersistentVolume', 'https://kubernetes.io/docs/tutorials/configuration/configure-persistent-volume-storage/'],
        ['Storage object in use protection', 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/#storage-object-in-use-protection']
      ]
    }
  ]
});
