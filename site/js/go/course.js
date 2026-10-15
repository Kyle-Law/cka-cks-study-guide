// Course settings read by js/app.js. `id` prefixes the localStorage keys (go-done, go-quiz, go-notes).
window.COURSE = {
  id: 'go',
  name: 'Go',
  title: 'Go for Cloud Native: a learning path from first program to Kubernetes operator',
  order: ['fundamentals', 'interfaces', 'concurrency', 'networking', 'k8s', 'operators'],
  weightLabel: 'of study time',
  detailsLabel: 'In depth',
  intro: `Six phases that take you from your first Go program to a Kubernetes operator. Each topic has <b>key learning points</b>, a <b>diagram</b>, <b>hands-on coding labs</b>, a <b>quiz</b> on Go semantics, and <b>links to the official docs</b>. Each phase ends with a <b>milestone project</b> that puts the phase together. The % on each phase is a rough share of total study time.`,
  howto: `
        <li><b>Read "In a nutshell" and the key ideas.</b> They explain the topic in plain language. Open "In depth" once the basics make sense.</li>
        <li><b>Type the lab code yourself</b> rather than pasting it, run it, and compare with the "Verify" line. Then change something and predict the result before running it again.</li>
        <li><b>Take the quiz.</b> The questions test what Go actually does, which is often not what other languages do. Your best score appears in the sidebar.</li>
        <li><b>Build the milestone project</b> at the end of each phase before moving on. It is where the topics come together.</li>`,
  home: `
      <h2>Setup</h2>
      <div class="card"><ul class="points">
        <li>Install a current Go release (1.25 or newer) from <a href="https://go.dev/doc/install" target="_blank" rel="noopener">go.dev/doc/install</a> and check with <code>go version</code>. Recent gRPC and Kubernetes libraries require 1.25+; if a module needs a newer version, the <code>go</code> command downloads that toolchain for you. Several quiz answers depend on behaviour introduced in 1.22 (for example, loop variables).</li>
        <li>Each lab starts in a fresh folder with <code>go mod init</code>, so labs never interfere with each other. Run code with <code>go run .</code>, format it with <code>gofmt -w .</code>, and catch mistakes with <code>go vet ./...</code>.</li>
        <li>Phases 1 to 4 need only Go. Phase 4's gRPC labs also need <code>protoc</code> plus the <code>protoc-gen-go</code> and <code>protoc-gen-go-grpc</code> plugins (installed in the lab).</li>
        <li>Phases 5 and 6 need a cluster: install Docker and <a href="https://kind.sigs.k8s.io/docs/user/quick-start/" target="_blank" rel="noopener">kind</a>, then <code>kind create cluster</code>. Labs tagged <span class="tag">kind cluster</span> need it. Phase 6 also uses <a href="https://book.kubebuilder.io/quick-start" target="_blank" rel="noopener">kubebuilder</a>.</li>
        <li>An editor with <code>gopls</code> (VS Code's Go extension, GoLand, or Neovim) shows types and errors as you type, which speeds up learning a lot.</li>
      </ul></div>
      <h2>Study tips</h2>
      <div class="card"><ul class="points">
        <li>Do the <a href="https://go.dev/tour/" target="_blank" rel="noopener">Tour of Go</a> alongside phases 1 and 2. It is short, interactive and official.</li>
        <li>Read the standard library. <code>go doc io.Reader</code> or the source on pkg.go.dev shows how idiomatic Go is written.</li>
        <li>When something surprises you, write a 10-line program to test it. That habit is how most Go programmers learned the language's corners.</li>
        <li>From phase 5 on, keep the client-go and controller-runtime docs open. Kubernetes code is large, but it reuses the same few patterns everywhere.</li>
      </ul></div>`,
  footer: `References: <a href="https://go.dev/doc/" target="_blank" rel="noopener">Go documentation</a> · <a href="https://go.dev/doc/effective_go" target="_blank" rel="noopener">Effective Go</a> · <a href="https://pkg.go.dev/std" target="_blank" rel="noopener">Standard library</a> · <a href="https://book.kubebuilder.io/" target="_blank" rel="noopener">The Kubebuilder Book</a>`,

  // Each phase file keeps a topic's intro and quiz next to its content; this moves them into the shared maps.
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
