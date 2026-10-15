// Course settings read by js/app.js. `id` prefixes the localStorage keys (cks-done, cks-quiz, cks-notes).
window.COURSE = {
  id: 'cks',
  name: 'CKS',
  title: 'Certified Kubernetes Security Specialist (CKS) Study Guide',
  order: ['setup', 'hardening', 'system', 'microservice', 'supply', 'runtime'],
  home: `
      <h2>Lab environment</h2>
      <div class="card"><ul class="points">
        <li>Most CKS tasks change files on the nodes (API server flags, kubelet config, AppArmor, Falco), so use <b>real VMs</b>: 1 control plane + 1 worker, Ubuntu 22.04/24.04, 2 CPU / 4 GB each, built with kubeadm (see the CKA guide's kubeadm lab).</li>
        <li>Labs tagged <span class="tag">kubeadm VMs</span> need those VMs. Untagged labs also work on <b>kind</b>. Labs tagged <span class="tag">CNI</span> need Calico or Cilium.</li>
        <li>Tools used in the labs: <code>trivy</code>, <code>kube-bench</code>, <code>falco</code>, <code>kubesec</code>, <code>kube-linter</code>, <code>syft</code>, <code>cosign</code>, <code>jq</code>, <code>apparmor-utils</code>, and gVisor (<code>runsc</code>).</li>
        <li><b>Before editing any static Pod manifest, copy it somewhere safe</b>: <code>cp /etc/kubernetes/manifests/kube-apiserver.yaml ~/</code>. Never keep the backup inside the manifests folder, or the kubelet will try to run it too.</li>
      </ul></div>
      <h2>Exam tips</h2>
      <div class="card"><ul class="points">
        <li>CKS is a 2-hour, hands-on exam. You need an active CKA to sit it. Besides kubernetes.io, a few tool docs are allowed (such as Falco, Trivy, AppArmor and etcd); check the current list in the candidate handbook.</li>
        <li>When the API server doesn't come back after an edit: <code>crictl ps -a | grep apiserver</code>, <code>crictl logs &lt;id&gt;</code>, <code>journalctl -u kubelet | tail</code>, and <code>/var/log/pods/kube-system_kube-apiserver-*</code>.</li>
        <li>New files passed to the API server (audit policy, encryption config, admission config) must also be <b>mounted</b> into its Pod with a <code>hostPath</code> volume and a <code>volumeMount</code>.</li>
        <li>Wait for the API server to return: <code>watch crictl ps</code>, then check that <code>kubectl get nodes</code> works before moving on.</li>
        <li>Many tasks end with "delete the offending Pods" or "scale to 0". Read the question for exactly which objects to change.</li>
      </ul></div>`,
  footer: `Reference: <a href="https://training.linuxfoundation.org/certification/certified-kubernetes-security-specialist/" target="_blank" rel="noopener">CKS curriculum &amp; exam page</a> · <a href="https://kubernetes.io/docs/concepts/security/" target="_blank" rel="noopener">Kubernetes security docs</a>`,

  // CKS domain files keep each topic's intro and quiz next to its content; this moves them into the shared maps.
  addDomain(d) {
    (window.COURSE_DOMAINS = window.COURSE_DOMAINS || []).push(d);
    window.COURSE_BASICS = window.COURSE_BASICS || {};
    window.COURSE_QUIZZES = window.COURSE_QUIZZES || {};
    d.topics.forEach(t => {
      if (t.basics) window.COURSE_BASICS[t.id] = t.basics;
      if (t.quiz) window.COURSE_QUIZZES[t.id] = t.quiz;
    });
  }
};
