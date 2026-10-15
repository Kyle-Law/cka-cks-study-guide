// Course settings read by js/app.js. `id` prefixes the localStorage keys (cilium-done, cilium-quiz, cilium-notes).
// Follows the structure of the book "Cilium: Up and Running" (Vibert, Nikolic, Laverack; O'Reilly). All text here is
// original study material; the book itself is not part of this repo.
window.COURSE = {
  id: 'cilium',
  name: 'Cilium',
  title: 'Cilium: Up and Running, study guide',
  order: ['foundations', 'networking', 'traffic', 'connectivity', 'security', 'operations'],
  weightLabel: 'of the book',
  detailsLabel: 'In depth',
  intro: `A study companion to <i>Cilium: Up and Running</i> (O'Reilly). The 16 chapters are grouped into six parts. Each topic has <b>key learning points</b>, a <b>diagram</b>, <b>hands-on labs</b> on a local kind cluster, a <b>quiz</b>, and <b>links to the official Cilium docs</b>. The % on each part is its share of the book's pages.`,
  howto: `
        <li><b>Read the chapter</b> named in the topic title, then use "In a nutshell" and the key ideas to check you got the main points. Open "In depth" for the details worth remembering.</li>
        <li><b>Do the lab</b> on a throwaway kind cluster. Run the steps in order and check the "Verify" line. Labs tagged <span class="tag">cloud</span> cost money.</li>
        <li><b>Take the quiz.</b> You get instant feedback and an explanation for every answer. Your best score appears in the sidebar.</li>
        <li><b>Use the Cilium docs</b> for exact Helm values. Cilium changes quickly, so check the docs for your version.</li>`,
  home: `
      <h2>Lab environment</h2>
      <div class="card"><ul class="points">
        <li>Install Docker, <a href="https://kind.sigs.k8s.io/docs/user/quick-start/" target="_blank" rel="noopener">kind</a>, kubectl, Helm 3, the <a href="https://docs.cilium.io/en/stable/gettingstarted/k8s-install-default/#install-the-cilium-cli" target="_blank" rel="noopener">Cilium CLI</a> and the <a href="https://docs.cilium.io/en/stable/observability/hubble/setup/#install-the-hubble-client" target="_blank" rel="noopener">Hubble CLI</a> (on macOS: <code>brew install kind helm cilium-cli hubble</code>).</li>
        <li>Most labs start from this cluster, with kind's own CNI turned off so Cilium can be installed:<pre><code>cat > kind.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes: [{role: control-plane}, {role: worker}, {role: worker}]
networking:
  disableDefaultCNI: true
EOF
kind create cluster --config kind.yaml
helm repo add cilium https://helm.cilium.io/</code></pre></li>
        <li>The labs pin <b>Cilium 1.18.4</b>, the version the book uses. Newer versions mostly work, but Helm values sometimes change, so check the docs for the version you install.</li>
        <li>Some features can't be changed on a running cluster (IPAM mode, routing mode, kube-proxy replacement). For those labs, delete and recreate the cluster: <code>kind delete cluster</code>.</li>
        <li><code>nicolaka/netshoot</code> is used as a client Pod throughout; it has curl, dig, tcpdump and more.</li>
        <li>Labs tagged <span class="tag">cloud</span> (EKS ENI mode, AKS Geneve) create paid resources. Delete them when you finish.</li>
      </ul></div>
      <h2>Command cheat sheet</h2>
      <div class="card"><ul class="points">
        <li><code>cilium status --wait</code>: health of the agent, operator, Envoy, Hubble and Cluster Mesh.</li>
        <li><code>cilium config view</code>: the running configuration (the <code>cilium-config</code> ConfigMap).</li>
        <li><code>cilium connectivity test</code>: a full battery of datapath and policy tests.</li>
        <li><code>kubectl -n kube-system exec ds/cilium -- cilium-dbg status --verbose</code>: node-level detail from the agent (named <code>cilium</code> before 1.15).</li>
        <li><code>cilium-dbg service list</code>, <code>cilium-dbg bpf ipcache list</code>, <code>cilium-dbg endpoint list</code>, <code>cilium-dbg identity list</code>: what's in the eBPF maps.</li>
        <li><code>cilium hubble port-forward &</code> then <code>hubble observe</code>: watch flows with verdicts.</li>
      </ul></div>`,
  footer: `References: <a href="https://docs.cilium.io/en/stable/" target="_blank" rel="noopener">Cilium documentation</a> · <a href="https://ebpf.io/what-is-ebpf/" target="_blank" rel="noopener">What is eBPF?</a> · <a href="https://www.oreilly.com/search/?q=Cilium%20Up%20and%20Running" target="_blank" rel="noopener">Cilium: Up and Running (O'Reilly)</a> · <a href="https://isovalent.com/labs/" target="_blank" rel="noopener">Free Isovalent labs</a>`,

  // Each part file keeps a topic's intro and quiz next to its content; this moves them into the shared maps.
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
