// Quiz questions keyed by topic id.
// In each question the FIRST option is the correct one; options are shuffled when shown.
Object.assign(window.COURSE_QUIZZES = window.COURSE_QUIZZES || {}, {
  'storage-classes': [
    { q: "A PVC sets no `storageClassName`. Which StorageClass does it use?",
      o: ["The cluster's default StorageClass", "None; it always waits for a manually created PV", "The first StorageClass in alphabetical order", "A random StorageClass"],
      why: "If the field is left out, the class with the `is-default-class` annotation is used. Setting `storageClassName: \"\"` turns dynamic provisioning off." },
    { q: "What does `volumeBindingMode: WaitForFirstConsumer` do?",
      o: ["Delays creating and binding the volume until a Pod that uses the PVC is scheduled", "Waits until an admin approves the PVC", "Makes the PVC read-only until the first write", "Retries provisioning forever"],
      why: "Waiting for the Pod lets the volume be created in the same zone or node as the Pod. Until then the PVC shows `Pending`, which is normal." },
    { q: "What is the default `reclaimPolicy` of a StorageClass if you don't set one?",
      o: ["Delete", "Retain", "Recycle", "Archive"],
      why: "Dynamically provisioned PVs inherit the class's policy, and the default is `Delete`." },
    { q: "You need to grow an existing PVC from 1Gi to 5Gi. What must be true?",
      o: ["Its StorageClass has `allowVolumeExpansion: true`", "The PV has the `Retain` reclaim policy", "The PVC uses `ReadWriteMany`", "Nothing; PVCs can always be resized up or down"],
      why: "Expansion only works if the class allows it, and a PVC can only grow, never shrink." },
    { q: "Which StorageClass field names the driver that creates the volumes?",
      o: ["provisioner", "driver", "parameters.type", "volumePlugin"],
      why: "`provisioner` (for example `ebs.csi.aws.com` or `rancher.io/local-path`) says which plug-in creates the volume." }
  ],
  'volume-types': [
    { q: "Which volume is deleted together with its Pod?",
      o: ["emptyDir", "persistentVolumeClaim", "nfs", "A CSI volume backed by a cloud disk"],
      why: "`emptyDir` is created when the Pod starts on a node and removed when the Pod is deleted." },
    { q: "Which access mode lets many nodes mount a volume read-write at the same time?",
      o: ["ReadWriteMany (RWX)", "ReadWriteOnce (RWO)", "ReadOnlyMany (ROX)", "ReadWriteOncePod (RWOP)"],
      why: "RWX = many nodes read-write. RWO = one node, ROX = many nodes read-only, RWOP = one single Pod." },
    { q: "A PV with reclaim policy `Retain` has its PVC deleted. What happens?",
      o: ["The PV becomes `Released` and the data stays", "The PV and its data are deleted", "The PV goes back to `Available` automatically", "The data is wiped and the PV is reused"],
      why: "`Retain` keeps the data. An admin must clean up and then delete or reuse the PV by hand." },
    { q: "Two containers in the same Pod need to share files. What is the simplest option?",
      o: ["Mount the same emptyDir volume in both", "Create two PVCs", "Use a hostPath on each node", "Use a ConfigMap"],
      why: "Volumes are defined at the Pod level, so any container in the Pod can mount the same `emptyDir`." },
    { q: "How do you change an existing PV's reclaim policy to Retain?",
      o: ["`kubectl patch pv <name> -p '{\"spec\":{\"persistentVolumeReclaimPolicy\":\"Retain\"}}'`", "Delete and recreate the StorageClass", "`kubectl annotate pv <name> reclaim=retain`", "Edit the PVC's `reclaimPolicy` field"],
      why: "The policy is a field on the PV (`spec.persistentVolumeReclaimPolicy`) and can be patched in place." }
  ],
  'pv-pvc': [
    { q: "Which of these objects is namespaced?",
      o: ["PersistentVolumeClaim", "PersistentVolume", "StorageClass", "CSIDriver"],
      why: "PVCs live in a namespace with the Pods that use them. PVs, StorageClasses and CSIDrivers are cluster-wide." },
    { q: "A PV offers 2Gi, RWO, class `manual`. Which PVC can bind to it?",
      o: ["1Gi, RWO, class `manual`", "5Gi, RWO, class `manual`", "1Gi, RWX, class `manual`", "1Gi, RWO, class `fast`"],
      why: "The PV must be at least as large as the request and have the same access mode and class name." },
    { q: "How does a Pod use persistent storage?",
      o: ["It references the PVC by `claimName` under `volumes`", "It references the PV by name under `volumes`", "It mounts the StorageClass", "It sets `storage:` in the container resources"],
      why: "Pods only know about claims: `volumes[].persistentVolumeClaim.claimName`, plus a `volumeMount` in the container." },
    { q: "A PVC stays `Pending`. Where do you look first?",
      o: ["The events in `kubectl describe pvc <name>`", "`kubectl logs` of the PVC", "The kubelet's journal", "`kubectl top pvc`"],
      why: "The PVC's events explain why it can't bind: no matching PV, no class, waiting for a consumer, and so on." },
    { q: "You delete a PVC while a running Pod still uses it. What happens?",
      o: ["It stays in `Terminating` until no Pod uses it", "It is deleted at once and the Pod crashes", "The deletion is refused with an error", "The Pod is deleted too"],
      why: "Storage object in use protection adds a finalizer, so the PVC isn't removed while a Pod uses it." }
  ]
});
