// Course settings read by js/app.js. `id` prefixes the localStorage keys (cka-done, cka-quiz, cka-notes).
window.COURSE = {
  id: 'cka',
  name: 'CKA',
  title: 'Certified Kubernetes Administrator (CKA) Study Guide',
  order: ['architecture', 'troubleshooting', 'networking', 'workloads', 'storage'],
  home: `
      <h2>Lab environment</h2>
      <div class="card"><ul class="points">
        <li>Most labs work on <b>kind</b> (<code>kind create cluster</code>) or <b>minikube</b>. Install Docker first.</li>
        <li>Labs tagged <span class="tag">kubeadm VMs</span> (cluster install, upgrade, etcd backup, kubelet/control-plane failures) need real VMs: 1 control-plane + 1 worker (2 CPU / 2 GB each) using Multipass, Vagrant or cloud instances.</li>
        <li>Labs tagged <span class="tag">CNI</span> need a NetworkPolicy-capable CNI. Create kind without the default CNI and install Calico or Cilium (see the NetworkPolicy lab).</li>
        <li>Use a throwaway namespace per lab: <code>kubectl create ns lab</code>, then delete it afterwards.</li>
      </ul></div>
      <h2>Exam tips</h2>
      <div class="card"><ul class="points">
        <li>The exam is a 2-hour, performance-based test in a terminal, with access to kubernetes.io docs. Practise finding things in the docs fast.</li>
        <li>Set up at the start: <pre><code>alias k=kubectl
export do="--dry-run=client -o yaml"
source &lt;(kubectl completion bash); complete -o default -F __start_kubectl k</code></pre></li>
        <li>Generate YAML instead of writing it: <code>k run</code>, <code>k create deploy</code>, <code>k expose</code>, <code>k create role</code>… with <code>$do</code>.</li>
        <li>Always check the context for each question: <code>kubectl config use-context &lt;name&gt;</code>.</li>
        <li><code>kubectl explain pod.spec.containers --recursive</code> is faster than searching the docs for field names.</li>
        <li>Skip hard questions and return later. Weighting is shown per question.</li>
      </ul></div>`,
  footer: `Reference: <a href="https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/" target="_blank" rel="noopener">CKA curriculum &amp; exam page</a> · <a href="https://kubernetes.io/docs/reference/kubectl/quick-reference/" target="_blank" rel="noopener">kubectl quick reference</a>`
};
