// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'supply', title: 'Supply Chain Security', weight: 20,
  topics: [
    {
      id: 'sc-base',
      title: 'Minimize base image footprint',
      basics: {
        summary: "Every extra package in an image is another place for a vulnerability and another tool an attacker can use. Build images that contain **only your app and what it needs to run**, using small base images and multi-stage builds.",
        ideas: [
          "**Minimal bases**: distroless, alpine, or scratch for static binaries.",
          "**Multi-stage builds**: compile in a big image, ship only the result.",
          "**Run as non-root** (`USER` in the Dockerfile).",
          "**Pin versions** (tag + digest), never `latest`."
        ]
      },
      points: [
        "Smaller image = fewer packages = fewer CVEs, smaller downloads, and no shell or package manager for an attacker.",
        "Base choices: `gcr.io/distroless/static` (static binaries, no shell), `distroless/base`, language-specific distroless images, `alpine` (musl, has a shell), `scratch` (empty).",
        "Multi-stage: `FROM golang:1.23 AS build` … `FROM gcr.io/distroless/static:nonroot` + `COPY --from=build /app /app`.",
        "`USER 65532` (or `nonroot`) so the process isn't root; distroless `:nonroot` tags already set it.",
        "Pin: `FROM alpine:3.20@sha256:…`; rebuild regularly to pick up patched bases.",
        "Each `RUN` creates a layer: deleting a file later doesn't remove it from the earlier layer. Never `COPY` secrets; use build secrets (`RUN --mount=type=secret`).",
        "Use `.dockerignore`; clean package caches in the same `RUN` (`apt-get … && rm -rf /var/lib/apt/lists/*`, `apk add --no-cache`).",
        "Exam pattern: fix a Dockerfile (pinned base, non-root USER, remove a shell or package) or pick the image with the fewest CVEs."
      ],
      labs: [{
        title: 'Shrink an image with a multi-stage distroless build',
        goal: 'Needs Docker and trivy locally.',
        steps: [
          ['A tiny Go app and a naive single-stage Dockerfile:', `mkdir slim && cd slim
cat > main.go <<'EOF'
package main
import ("fmt"; "net/http")
func main() {
  http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { fmt.Fprintln(w, "hello") })
  http.ListenAndServe(":8080", nil)
}
EOF
cat > Dockerfile.fat <<'EOF'
FROM golang:1.23
WORKDIR /src
COPY main.go .
RUN go mod init demo && go build -o /app .
CMD ["/app"]
EOF
docker build -f Dockerfile.fat -t demo:fat .`],
          ['The multi-stage, distroless, non-root version:', `cat > Dockerfile <<'EOF'
FROM golang:1.23 AS build
WORKDIR /src
COPY main.go .
RUN go mod init demo && CGO_ENABLED=0 go build -o /app .

FROM gcr.io/distroless/static:nonroot
COPY --from=build /app /app
USER nonroot:nonroot
ENTRYPOINT ["/app"]
EOF
docker build -t demo:slim .`],
          ['Compare size, CVEs and attack tools:', `docker images demo
trivy image --severity HIGH,CRITICAL -q demo:fat  | grep Total
trivy image --severity HIGH,CRITICAL -q demo:slim | grep Total
docker run --rm --entrypoint sh demo:slim -c id || echo "NO SHELL"`]
        ],
        verify: 'The slim image is a few MB instead of hundreds, has far fewer (often zero) HIGH/CRITICAL CVEs, and has no shell.',
        cleanup: 'docker rmi demo:fat demo:slim; cd .. && rm -rf slim'
      }],
      refs: [
        ['Images (Kubernetes docs)', 'https://kubernetes.io/docs/concepts/containers/images/'],
        ['Distroless images', 'https://github.com/GoogleContainerTools/distroless'],
        ['Docker: multi-stage builds', 'https://docs.docker.com/build/building/multi-stage/'],
        ['Docker: building best practices', 'https://docs.docker.com/build/building/best-practices/']
      ],
      quiz: [
        { q: "Why are distroless images more secure?",
          o: ["They hold only the app and its runtime dependencies, with no shell or package manager", "They are encrypted", "They always run as root", "Kubernetes builds them"],
          why: "Less software means fewer CVEs and fewer tools for an attacker to use." },
        { q: "What does a multi-stage build achieve?",
          o: ["Build tools stay in the builder stage; only the result is copied into a small final image", "It runs several containers at once", "It signs the image", "It splits the image across registries"],
          why: "Compilers and source code never reach the image you ship." },
        { q: "Which Dockerfile line makes the container run as a non-root user?",
          o: ["`USER 65532`", "`RUN chmod 777 /`", "`ENTRYPOINT [\"sudo\"]`", "`EXPOSE 65532`"],
          why: "`USER` sets the default UID for the container's process." },
        { q: "Why avoid the `latest` tag?",
          o: ["It can point to different content at any time, so you don't know what you run", "It pulls more slowly", "Docker doesn't allow it", "It always contains CVEs"],
          why: "Pin a version and, ideally, a digest." },
        { q: "A secret was copied in one RUN step and deleted in the next. Is it gone from the image?",
          o: ["No; it is still in the earlier layer", "Yes, completely", "Only if the image is distroless", "Only after a rebuild"],
          why: "Layers are additive. Anyone who pulls the image can extract the earlier layer." }
      ]
    },
    {
      id: 'sc-understand',
      title: 'Understand your supply chain (SBOM, CI/CD, registries)',
      basics: {
        summary: "Your software supply chain is every step from source code to a running Pod: dependencies, the CI build, the image, the registry and the deployment. An **SBOM** (software bill of materials) lists everything inside an artifact, so you can quickly see whether you're affected by a new vulnerability.",
        ideas: [
          "**Every step can be attacked**: dependencies, build, registry, deployment.",
          "**SBOM** = an ingredient list of your image (formats SPDX and CycloneDX).",
          "Generate SBOMs with **syft**, **trivy** or the Kubernetes **bom** tool.",
          "**SLSA** describes how trustworthy a build is (provenance)."
        ]
      },
      points: [
        "Chain: source repo → third-party dependencies → CI build → image + SBOM + provenance → registry → CD/deploy → cluster.",
        "Typical attacks: malicious or typosquatted dependencies, compromised CI runners or credentials, tag overwrites in registries, unverified deploys.",
        "SBOM formats: SPDX (Linux Foundation) and CycloneDX (OWASP). Contents: package names, versions, licenses, hashes.",
        "Generate: `syft <image> -o spdx-json > sbom.json`, `trivy image --format cyclonedx --output sbom.cdx.json <image>`, `bom generate` (kubernetes-sigs/bom).",
        "Use SBOMs for vulnerability lookups: `trivy sbom sbom.cdx.json`, `grype sbom:sbom.json`.",
        "Registries: private and access-controlled, immutable tags, scan on push, retention policies.",
        "CI/CD: protected branches and reviews, least-privilege and short-lived CI credentials, pinned build tools, isolated runners.",
        "SLSA levels and provenance attestations (in-toto) record how and where an artifact was built; attach them to images with cosign."
      ],
      labs: [{
        title: 'Generate an SBOM and use it to answer "are we affected?"',
        goal: 'Needs syft and trivy locally (or run them as Docker images).',
        steps: [
          ['Generate SBOMs in both formats:', 'syft nginx:1.27 -o spdx-json > nginx.spdx.json\ntrivy image --format cyclonedx --output nginx.cdx.json nginx:1.27'],
          ['Look inside: how many packages, which OpenSSL?', "jq '.packages | length' nginx.spdx.json\njq -r '.packages[] | select(.name | test(\"openssl|libssl\")) | \"\\(.name) \\(.versionInfo)\"' nginx.spdx.json"],
          ['Scan the SBOM instead of the image (fast, works offline after the DB download):', 'trivy sbom --severity CRITICAL nginx.cdx.json | tail -20'],
          ['Optional: see the provenance and signatures of a Kubernetes image:', 'cosign tree registry.k8s.io/pause:3.10 2>/dev/null || echo "install cosign to explore attestations"']
        ],
        verify: 'You can say how many packages nginx contains, which OpenSSL version it ships, and how many CRITICAL CVEs that implies.',
        cleanup: 'rm -f nginx.spdx.json nginx.cdx.json'
      }],
      refs: [
        ['Cloud native security & the software supply chain', 'https://kubernetes.io/docs/concepts/security/cloud-native-security/'],
        ['SLSA framework', 'https://slsa.dev/'],
        ['SPDX', 'https://spdx.dev/'],
        ['CycloneDX', 'https://cyclonedx.org/'],
        ['syft (GitHub)', 'https://github.com/anchore/syft'],
        ['Kubernetes bom tool', 'https://github.com/kubernetes-sigs/bom']
      ],
      quiz: [
        { q: "What is an SBOM?",
          o: ["A list of every software component and version inside an artifact", "A signed image", "A build script", "A vulnerability report"],
          why: "It's an ingredient list; scanners use it to find vulnerable components." },
        { q: "Which two formats are the standards for SBOMs?",
          o: ["SPDX and CycloneDX", "JSON and YAML", "OCI and Docker", "SARIF and JUnit"],
          why: "Both can be serialised as JSON, but SPDX and CycloneDX are the schemas." },
        { q: "Which command generates an SBOM for an image?",
          o: ["`syft nginx:1.27 -o spdx-json`", "`cosign sign nginx:1.27`", "`kube-bench run`", "`helm template nginx`"],
          why: "syft (or `trivy image --format cyclonedx`) inventories an image's packages." },
        { q: "A new OpenSSL CVE is announced. How do SBOMs help?",
          o: ["Search them to find which images contain the vulnerable OpenSSL version", "They patch OpenSSL automatically", "They block the image from running", "They don't help"],
          why: "No need to pull and scan every image again; the inventory already exists." },
        { q: "What is SLSA?",
          o: ["A framework of levels for build integrity and provenance", "A Kubernetes admission plugin", "An SBOM format", "A container runtime"],
          why: "SLSA (\"salsa\") defines how trustworthy a build process is." }
      ]
    },
    {
      id: 'sc-secure',
      title: 'Secure the supply chain: allowed registries, signing',
      basics: {
        summary: "Only run images you trust. **Admission control** lets the cluster refuse images from unknown registries, and **image signing** (cosign) proves that an image really came from your build pipeline and hasn't changed.",
        ideas: [
          "**Allow-list registries** with an admission policy (ValidatingAdmissionPolicy, Kyverno, Gatekeeper, ImagePolicyWebhook).",
          "**Sign images** in CI with cosign; **verify** signatures before running them.",
          "Reference images by **digest**, so the content can't change under a tag.",
          "Admission config files must be **mounted** into the API server Pod."
        ]
      },
      points: [
        "ValidatingAdmissionPolicy (built in, CEL): e.g. `object.spec.containers.all(c, c.image.startsWith('registry.example.com/'))` plus a ValidatingAdmissionPolicyBinding with `validationActions: [Deny]`.",
        "ImagePolicyWebhook admission plugin: add it to `--enable-admission-plugins`, set `--admission-control-config-file` to an AdmissionConfiguration whose `imagePolicy` has `kubeConfigFile` (the webhook backend), `allowTTL`, `denyTTL`, `retryBackoff` and `defaultAllow`.",
        "`defaultAllow: false` fails closed: if the webhook is unreachable, Pods are denied.",
        "All referenced files (admission config, webhook kubeconfig, certificates) must be mounted into the kube-apiserver Pod with hostPath volumes.",
        "Sign with cosign: `cosign generate-key-pair`; `cosign sign --key cosign.key <image>@sha256:…`; verify `cosign verify --key cosign.pub <image>`. Keyless signing uses Sigstore Fulcio (certificates) and Rekor (transparency log).",
        "Enforce signatures at admission: Kyverno `verifyImages`, Sigstore policy-controller, Connaisseur.",
        "The `AlwaysPullImages` admission plugin forces a pull for every Pod, so private images cached on a node can't be used without credentials.",
        "Use `imagePullSecrets` for private registries and restrict who can push to them."
      ],
      labs: [
        {
          title: 'Allow images only from a trusted registry',
          goal: 'Works on kind (Kubernetes 1.30+ for ValidatingAdmissionPolicy v1).',
          steps: [
            ['Policy and binding (applies only to namespaces labelled `registry-policy=enforced`):', `cat <<EOF | kubectl apply -f -
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata: {name: allowed-registries}
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
    - apiGroups: [""]
      apiVersions: ["v1"]
      operations: ["CREATE", "UPDATE"]
      resources: ["pods"]
  validations:
  - expression: "object.spec.containers.all(c, c.image.startsWith('registry.k8s.io/'))"
    message: "Only images from registry.k8s.io are allowed"
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata: {name: allowed-registries}
spec:
  policyName: allowed-registries
  validationActions: [Deny]
  matchResources:
    namespaceSelector:
      matchLabels: {registry-policy: enforced}
EOF
kubectl create ns trusted && kubectl label ns trusted registry-policy=enforced`],
            ['Test both cases:', 'kubectl -n trusted run bad --image=nginx\nkubectl -n trusted run good --image=registry.k8s.io/pause:3.10']
          ],
          verify: '`bad` is denied with "Only images from registry.k8s.io are allowed"; `good` is created.',
          cleanup: 'kubectl delete ns trusted; kubectl delete validatingadmissionpolicybinding,validatingadmissionpolicy allowed-registries'
        },
        {
          title: 'Sign and verify an image with cosign',
          goal: 'Needs Docker and cosign locally. Uses a throwaway local registry.',
          steps: [
            ['Local registry and an image pushed to it:', 'docker run -d -p 5000:5000 --name reg registry:2\ndocker pull busybox && docker tag busybox localhost:5000/busybox:1 && docker push localhost:5000/busybox:1'],
            ['Create keys, sign by digest, verify:', `cosign generate-key-pair
DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' localhost:5000/busybox:1 | cut -d@ -f2)
cosign sign --key cosign.key --tlog-upload=false localhost:5000/busybox@$DIGEST
cosign verify --key cosign.pub --insecure-ignore-tlog localhost:5000/busybox@$DIGEST`],
            ['Push a different image under the same tag and see verification fail:', `docker pull alpine && docker tag alpine localhost:5000/busybox:1 && docker push localhost:5000/busybox:1
cosign verify --key cosign.pub --insecure-ignore-tlog localhost:5000/busybox:1 || echo "SIGNATURE CHECK FAILED"`]
          ],
          verify: 'The signed digest verifies; the retagged image fails verification.',
          cleanup: 'docker rm -f reg; rm -f cosign.key cosign.pub'
        }
      ],
      refs: [
        ['Validating Admission Policy', 'https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/'],
        ['Admission controllers: ImagePolicyWebhook', 'https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#imagepolicywebhook'],
        ['Sigstore cosign: signing containers', 'https://docs.sigstore.dev/cosign/signing/signing_with_containers/'],
        ['Kyverno: verify images', 'https://kyverno.io/docs/policy-types/cluster-policy/verify-images/'],
        ['OPA Gatekeeper', 'https://open-policy-agent.github.io/gatekeeper/website/docs/']
      ],
      quiz: [
        { q: "Which built-in admission plugin asks an external service whether an image may run?",
          o: ["ImagePolicyWebhook", "AlwaysPullImages", "NodeRestriction", "PodSecurity"],
          why: "It sends an ImageReview to the backend configured in its kubeconfig." },
        { q: "In the ImagePolicyWebhook configuration, what does `defaultAllow: false` do?",
          o: ["Denies Pods when the webhook can't be reached (fail closed)", "Allows every image", "Disables the plugin", "Allows only signed images"],
          why: "Failing closed means an outage of the webhook can't be used to slip images through." },
        { q: "Which tool signs container images?",
          o: ["cosign", "syft", "kube-bench", "falco"],
          why: "cosign is part of Sigstore and stores signatures next to the image in the registry." },
        { q: "Which CEL expression allows only images from `registry.example.com`?",
          o: ["`object.spec.containers.all(c, c.image.startsWith('registry.example.com/'))`", "`object.spec.containers.exists(c, c.image == 'registry.example.com')`", "`request.registry == 'registry.example.com'`", "`image.allowed('registry.example.com')`"],
          why: "`all` requires every container to match. `exists` would pass if just one did." },
        { q: "After adding `--admission-control-config-file`, the API server doesn't come back. What is a common cause?",
          o: ["The config file's directory isn't mounted into the kube-apiserver Pod", "kubectl is outdated", "etcd needs a restart", "The kubelet needs a new token"],
          why: "The API server runs in a container, so it can only read host files that are mounted in." }
      ]
    },
    {
      id: 'sc-static',
      title: 'Static analysis of workloads and images (Kubesec, KubeLinter, Trivy)',
      basics: {
        summary: "Static analysis inspects manifests and images **before** they reach the cluster. Image scanners like **Trivy** find known vulnerabilities (CVEs), and manifest checkers like **Kubesec** and **KubeLinter** flag risky settings such as privileged containers or running as root.",
        ideas: [
          "**trivy image**: known CVEs in an image's packages.",
          "**kubesec**: scores a manifest's security settings.",
          "**kube-linter**: flags misconfigurations in YAML and Helm charts.",
          "Run them **in CI** so problems are caught early."
        ]
      },
      points: [
        "Trivy: `trivy image --severity HIGH,CRITICAL nginx:1.27`; `trivy config ./manifests` (misconfigurations); `trivy k8s --report summary` (a live cluster); `--ignore-unfixed` hides CVEs without a fix.",
        "Kubesec: `kubesec scan pod.yaml` (or `docker run -i kubesec/kubesec scan /dev/stdin < pod.yaml`) returns a score, `critical` findings (e.g. privileged) and `advise` items (e.g. readOnlyRootFilesystem, runAsNonRoot, resource limits).",
        "KubeLinter: `kube-linter lint deploy.yaml` (also Helm charts). Checks include `run-as-non-root`, `no-read-only-root-fs`, `latest-tag`, `privileged-container`, `unset-cpu-requirements`.",
        "Dockerfile checks: `trivy config Dockerfile` or hadolint flag root users, `latest` tags, `ADD` of URLs and secrets in env.",
        "Exam pattern: list the images used by Pods in a namespace, scan each, and delete the Pods whose images have HIGH/CRITICAL CVEs.",
        "Find images in use: `kubectl get pods -n <ns> -o jsonpath='{range .items[*]}{.metadata.name}{\"\\t\"}{.spec.containers[*].image}{\"\\n\"}{end}'`.",
        "Static analysis is one layer. Combine it with admission control (block what fails) and runtime detection.",
        "Keep scanner databases fresh; a scan is only as good as its vulnerability data."
      ],
      labs: [{
        title: 'Scan a manifest and images, then fix the findings',
        goal: 'Needs kubesec (or Docker), kube-linter and trivy locally.',
        steps: [
          ['A deliberately bad Pod manifest:', `cat > bad.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: bad}
spec:
  containers:
  - name: c
    image: nginx:latest
    securityContext: {privileged: true}
EOF
docker run -i kubesec/kubesec:v2 scan /dev/stdin < bad.yaml | jq '.[0] | {score, critical: [.scoring.critical[]?.id]}'
kube-linter lint bad.yaml`],
          ['Fix it and scan again:', `cat > good.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: good}
spec:
  securityContext: {runAsNonRoot: true, runAsUser: 101, seccompProfile: {type: RuntimeDefault}}
  containers:
  - name: c
    image: nginxinc/nginx-unprivileged:1.27-alpine
    securityContext: {allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: {drop: ["ALL"]}}
    resources: {requests: {cpu: 50m, memory: 64Mi}, limits: {cpu: 200m, memory: 128Mi}}
EOF
docker run -i kubesec/kubesec:v2 scan /dev/stdin < good.yaml | jq '.[0].score'
kube-linter lint good.yaml`],
          ['Compare images for CRITICAL CVEs:', 'for i in nginx:1.19 nginx:1.27-alpine; do echo "== $i"; trivy image -q --severity CRITICAL $i | grep Total; done']
        ],
        verify: 'The bad manifest has a negative score with a `Privileged` critical finding; the fixed one scores positive with far fewer lint errors; the old nginx image has many more CRITICAL CVEs.',
        cleanup: 'rm -f bad.yaml good.yaml'
      }],
      refs: [
        ['Kubesec', 'https://kubesec.io/'],
        ['KubeLinter docs', 'https://docs.kubelinter.io/'],
        ['Trivy docs', 'https://trivy.dev/'],
        ['Kubernetes security checklist', 'https://kubernetes.io/docs/concepts/security/security-checklist/']
      ],
      quiz: [
        { q: "What does `kubesec scan pod.yaml` produce?",
          o: ["A security score with critical findings and advice for the manifest", "A list of CVEs in the image", "An SBOM", "A signed manifest"],
          why: "kubesec looks at the manifest's settings, not at the image contents." },
        { q: "Which tool scans an image for known CVEs?",
          o: ["`trivy image`", "kube-linter", "kubesec", "`kubectl explain`"],
          why: "Trivy compares the image's packages against vulnerability databases." },
        { q: "Which trivy command shows only high and critical vulnerabilities?",
          o: ["`trivy image --severity HIGH,CRITICAL nginx:1.27`", "`trivy image --only critical nginx`", "`trivy scan -c nginx`", "`trivy k8s --cve high`"],
          why: "`--severity` takes a comma-separated list of levels." },
        { q: "When is static analysis most effective?",
          o: ["Early, in CI, before manifests and images reach the cluster", "Only after an incident", "Only against running Pods", "Never; runtime tools are enough"],
          why: "Problems are cheapest to fix before deployment." },
        { q: "Which finding would KubeLinter report?",
          o: ["A container that doesn't set runAsNonRoot", "A Service of type ClusterIP", "A Deployment with 3 replicas", "A ConfigMap with 2 keys"],
          why: "`run-as-non-root` is one of KubeLinter's default checks." }
      ]
    }
  ]
});

COURSE.addDomain({
  id: 'runtime', title: 'Monitoring, Logging and Runtime Security', weight: 20,
  topics: [
    {
      id: 'rt-behavior',
      title: 'Behavioral analytics to detect malicious activity (Falco)',
      basics: {
        summary: "Even with every preventive control in place, something may get through. **Runtime detection** watches what containers actually do, such as starting a shell, reading `/etc/shadow` or opening an odd connection, and raises an alert. **Falco** is the standard CNCF tool for this.",
        ideas: [
          "Falco watches **system calls** using eBPF and adds container and Pod details.",
          "**Rules** say what is suspicious: condition, output message, priority.",
          "Put your own rules in **`falco_rules.local.yaml`**.",
          "Read alerts in the **journal**, the Falco Pod logs, or a central system."
        ]
      },
      points: [
        "Falco taps kernel syscalls (modern eBPF probe or kernel module) and enriches events with container, Pod and namespace metadata.",
        "Rule fields: `rule`, `desc`, `condition`, `output`, `priority` (EMERGENCY … DEBUG), optional `tags`, `enabled`. Reuse `macro` and `list` definitions.",
        "Example condition: `spawned_process and container and proc.name in (bash, sh, zsh)`.",
        "Output fields: `%evt.time`, `%container.id`, `%container.name`, `%k8s.pod.name`, `%k8s.ns.name`, `%proc.name`, `%proc.cmdline`, `%user.name`, `%fd.name`.",
        "Files: defaults in `/etc/falco/falco_rules.yaml` (don't edit), local overrides in `/etc/falco/falco_rules.local.yaml` or `/etc/falco/rules.d/`, main config `/etc/falco/falco.yaml` (outputs: stdout, file, syslog, HTTP, gRPC).",
        "Service name depends on the driver: `falco-modern-bpf`, `falco-kmod`… Logs: `journalctl -fu falco-modern-bpf`. In Kubernetes: `kubectl logs -n falco ds/falco`.",
        "Exam pattern: change a rule's output format or priority, or find the container that triggered an alert and stop it (scale its Deployment to 0).",
        "Alternatives: Cilium Tetragon (eBPF observability and enforcement), Aqua Tracee, Sysdig."
      ],
      labs: [{
        title: 'Detect a shell in a container and write a custom rule',
        tags: ['kubeadm VMs'],
        goal: 'Install Falco on the worker from its apt repository (see falco.org setup docs); choose the modern eBPF driver.',
        steps: [
          ['Check Falco is running and follow its alerts:', 'systemctl list-units "falco*" --no-pager\nsudo journalctl -fu falco-modern-bpf'],
          ['In another terminal, trigger the default "Terminal shell in container" rule:', 'kubectl run victim --image=nginx --overrides=\'{"spec":{"nodeName":"worker"}}\'\nkubectl exec -it victim -- sh -c "cat /etc/shadow; exit"'],
          ['Add a custom rule for package managers running in containers:', `cat <<'EOF' | sudo tee /etc/falco/falco_rules.local.yaml
- rule: Package manager in container
  desc: A package manager ran inside a container (images should be immutable)
  condition: spawned_process and container and proc.name in (apt, apt-get, apk, yum, dnf)
  output: "PKG MANAGER %evt.time container=%container.name pod=%k8s.pod.name ns=%k8s.ns.name cmd=%proc.cmdline user=%user.name"
  priority: WARNING
EOF
sudo systemctl restart falco-modern-bpf
kubectl exec victim -- apt-get update >/dev/null 2>&1; sudo journalctl -u falco-modern-bpf --since "1 min ago" | grep "PKG MANAGER"`]
        ],
        verify: 'The journal shows a "Terminal shell in container" notice, a "Read sensitive file untrusted" warning for `/etc/shadow`, and your `PKG MANAGER` alert with the Pod name.',
        cleanup: 'kubectl delete pod victim --now'
      }],
      refs: [
        ['Falco documentation', 'https://falco.org/docs/'],
        ['Falco rules', 'https://falco.org/docs/concepts/rules/'],
        ['Falco install on Linux', 'https://falco.org/docs/setup/packages/'],
        ['Cilium Tetragon', 'https://tetragon.io/docs/']
      ],
      quiz: [
        { q: "What does Falco watch to detect threats?",
          o: ["System calls made by processes, enriched with container and Kubernetes metadata", "Only container image layers", "Git commits", "Only network packets"],
          why: "Syscalls show what processes really do, regardless of the image." },
        { q: "Where should custom Falco rules go so upgrades don't overwrite them?",
          o: ["/etc/falco/falco_rules.local.yaml", "/etc/falco/falco_rules.yaml", "/var/log/falco.log", "/etc/kubernetes/falco.yaml"],
          why: "The default rules file is replaced on upgrade; the local file is loaded after it and overrides it." },
        { q: "Which output field prints the container ID in a Falco rule?",
          o: ["%container.id", "%pod.uid", "$CONTAINER", "{{container}}"],
          why: "Falco fields use the `%class.field` syntax." },
        { q: "Which condition detects a shell starting in a container?",
          o: ["`spawned_process and container and proc.name in (bash, sh)`", "`open_write and fd.name=/bin/sh`", "`k8s.pod.name = shell`", "`evt.type = exec and host`"],
          why: "`spawned_process` and `container` are built-in macros." },
        { q: "Falco runs as a systemd service on a node. How do you see its alerts?",
          o: ["`journalctl -u <falco service>` (e.g. falco-modern-bpf)", "`cat /etc/falco/falco.yaml`", "`falco --list`", "`kubectl get events`"],
          why: "By default alerts go to stdout/syslog, which the journal collects." }
      ]
    },
    {
      id: 'rt-detect',
      title: 'Detect threats across infrastructure, apps, networks, data and users',
      basics: {
        summary: "Attacks cross layers: a vulnerable app leads to a stolen token, which leads to the API, which leads to the cloud account. To see them, you need **signals from every layer** (cloud, cluster, container and code), collected in one place where an attacker can't erase them.",
        ideas: [
          "Think in the **4Cs**: Cloud, Cluster, Container, Code.",
          "**Audit logs** show API actions; **Falco** shows container actions; **flow logs** show network actions.",
          "Watch for **red flags**: privileged Pods, exec into Pods, Secret reads, odd outbound traffic.",
          "**Ship logs off the node** to a central system (SIEM)."
        ]
      },
      points: [
        "Infrastructure/nodes: `journalctl`, `/var/log/auth.log` (SSH and sudo), unexpected processes (`ps aux`, `crictl ps`), new listening ports, cloud logs (CloudTrail, Cloud Audit Logs).",
        "Cluster/API: audit logs: who created privileged Pods, read Secrets, exec'd into Pods, changed RBAC.",
        "Workloads: Falco/Tetragon syscall alerts, container logs, Pods running images from unknown registries.",
        "Network: CNI flow logs (Cilium Hubble `hubble observe --verdict DROPPED`, Calico flow logs), DNS queries to odd domains, egress to unknown IPs or mining pools, access to 169.254.169.254.",
        "Data and users: unusual Secret access, service accounts used from outside the cluster (`sourceIPs` in the audit log), logins at odd hours.",
        "Correlate everything in a central log store or SIEM; logs left on the node can be deleted by an attacker.",
        "Indicators of compromise: sustained 100% CPU (cryptominers), new DaemonSets or Pods in `kube-system`, Pods with hostPath `/`, new ClusterRoleBindings, deleted events.",
        "Baseline normal behaviour first; anomalies only stand out against a known baseline."
      ],
      labs: [{
        title: 'Hunt for suspicious activity in different signal sources',
        tags: ['kubeadm VMs'],
        goal: 'Best with audit logging (see the audit log topic) and Falco already enabled.',
        steps: [
          ['Act like an attacker:', `kubectl create ns hunt
kubectl -n hunt run shady --image=busybox --overrides='{"spec":{"containers":[{"name":"c","image":"busybox","command":["sleep","3600"],"securityContext":{"privileged":true}}]}}'
kubectl -n hunt exec shady -- cat /etc/hostname
kubectl -n kube-system get secrets >/dev/null`],
          ['Find it in the audit log (API layer):', `sudo jq -c 'select(.objectRef.namespace=="hunt" and (.objectRef.subresource=="exec" or .verb=="create")) | {user: .user.username, verb, res: .objectRef.resource, sub: .objectRef.subresource, ip: .sourceIPs[0]}' /var/log/kubernetes/audit/audit.log | tail -5
sudo jq -c 'select(.objectRef.resource=="secrets" and .verb=="list") | {user: .user.username, ns: .objectRef.namespace}' /var/log/kubernetes/audit/audit.log | tail -3`],
          ['Find it on the node (container layer):', 'sudo journalctl -u falco-modern-bpf --since "10 min ago" | grep -i hunt\nsudo crictl ps --label io.kubernetes.pod.namespace=hunt'],
          ['Find privileged Pods across the cluster:', "kubectl get pods -A -o json | jq -r '.items[] | select(any(.spec.containers[]; .securityContext.privileged==true)) | \"\\(.metadata.namespace)/\\(.metadata.name)\"'"]
        ],
        verify: 'You found the privileged Pod creation, the exec and the Secret listing in the audit log, the exec in Falco, and `hunt/shady` in the privileged-Pod search.',
        cleanup: 'kubectl delete ns hunt'
      }],
      refs: [
        ['Cloud native security (the 4Cs)', 'https://kubernetes.io/docs/concepts/security/cloud-native-security/'],
        ['Auditing', 'https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/'],
        ['Logging Architecture', 'https://kubernetes.io/docs/concepts/cluster-administration/logging/'],
        ['Cilium Hubble observability', 'https://docs.cilium.io/en/stable/observability/hubble/'],
        ['Falco documentation', 'https://falco.org/docs/']
      ],
      quiz: [
        { q: "What are the 4Cs of cloud native security?",
          o: ["Cloud, Cluster, Container, Code", "CPU, Cache, Cluster, Cloud", "Certificates, ConfigMaps, Containers, CRDs", "Control, Compute, Credentials, Code"],
          why: "Each layer depends on the security of the layer around it." },
        { q: "Which source tells you which user read a Secret through the API?",
          o: ["Kubernetes audit logs", "Container logs", "Falco syscall alerts", "The node's /var/log/syslog"],
          why: "Only the API server sees API requests and their authenticated user." },
        { q: "A Pod suddenly runs at 100% CPU and connects to an unknown mining pool. What is it most likely?",
          o: ["A cryptominer installed after a compromise", "A normal HPA scale-up", "A DNS problem", "An expired certificate"],
          why: "Cryptomining is the most common payload after a cluster compromise." },
        { q: "Why ship logs to a central system off the node?",
          o: ["An attacker with node access could delete local logs", "kubeadm requires it", "Local logs can't be read", "It makes Pods faster"],
          why: "Evidence must survive the incident." },
        { q: "Which tool shows network flows between Pods on Cilium?",
          o: ["Hubble", "kube-bench", "kubesec", "etcdctl"],
          why: "`hubble observe` shows flows with their verdicts (forwarded, dropped)." }
      ]
    },
    {
      id: 'rt-attack',
      title: 'Investigate phases of attack and bad actors',
      basics: {
        summary: "Attacks follow a pattern: **get in, run code, stay, gain more rights, steal credentials, spread, then do damage**. Frameworks such as **MITRE ATT&CK** and Microsoft's **Threat Matrix for Kubernetes** name each phase, which helps you understand what you find and what to look for next.",
        ideas: [
          "Learn the **phases**: initial access → execution → persistence → privilege escalation → credential access → lateral movement → impact.",
          "Use **audit logs** to rebuild a timeline: who, what, when, from where.",
          "**Contain first**: isolate the Pod or node and revoke credentials, while keeping the evidence.",
          "Then find **how they got in**, and close that door."
        ]
      },
      points: [
        "Initial access: exposed dashboards or APIs, a vulnerable app, a leaked kubeconfig or token, a compromised image.",
        "Execution: `kubectl exec`, new Pods or Jobs, a shell inside a container, a sidecar injected into a workload.",
        "Persistence: backdoor DaemonSets/CronJobs, writable hostPath mounts, static Pods dropped on a node, new ServiceAccount tokens.",
        "Privilege escalation: privileged Pods, hostPath `/`, hostPID, new bindings to `cluster-admin`, cloud metadata credentials.",
        "Defense evasion: deleting events or logs, Pod names mimicking system components, running in `kube-system`.",
        "Credential access: reading Secrets and mounted SA tokens, kubeconfigs on nodes, cloud metadata. Discovery: listing the API, network scanning. Lateral movement: other Pods, nodes, the cloud. Impact: data theft, cryptomining, denial of service.",
        "Investigate with audit fields `user.username`, `user.groups`, `sourceIPs`, `userAgent`, `verb`, `objectRef`, `requestReceivedTimestamp`; sort by time to rebuild the story.",
        "Respond: isolate (deny-all NetworkPolicy on the Pod's labels, cordon the node), scale the workload to 0, revoke credentials (delete SA tokens or the SA, rotate Secrets and keys), preserve evidence (logs, `crictl inspect`, node snapshot) before deleting things."
      ],
      labs: [{
        title: 'Rebuild an attacker\'s timeline from the audit log',
        tags: ['kubeadm VMs'],
        goal: 'Requires audit logging (see the audit log topic). You play both attacker and investigator.',
        steps: [
          ['The "attack": a ServiceAccount with too much power is abused:', `kubectl create ns victim
kubectl -n victim create sa ci-bot
kubectl create clusterrolebinding ci-bot-admin --clusterrole=cluster-admin --serviceaccount=victim:ci-bot
TOKEN=$(kubectl -n victim create token ci-bot)
kubectl --token=$TOKEN get secrets -A >/dev/null
kubectl --token=$TOKEN -n kube-system create deploy kube-proxy-helper --image=busybox -- sleep 3600`],
          ['Investigate: every action by that identity, in order:', `sudo jq -r 'select(.user.username=="system:serviceaccount:victim:ci-bot") | [.requestReceivedTimestamp, .verb, .objectRef.resource, (.objectRef.namespace // "-"), (.objectRef.name // "-"), .sourceIPs[0], .userAgent] | @tsv' /var/log/kubernetes/audit/audit.log`],
          ['Map what you see to phases: credential access (list Secrets), persistence and defense evasion (a deployment in kube-system with a system-like name). Who gave it the power?', "sudo jq -c 'select(.objectRef.resource==\"clusterrolebindings\" and .verb==\"create\") | {user: .user.username, name: .objectRef.name, time: .requestReceivedTimestamp}' /var/log/kubernetes/audit/audit.log"],
          ['Contain and clean up:', 'kubectl -n kube-system scale deploy kube-proxy-helper --replicas=0\nkubectl delete clusterrolebinding ci-bot-admin\nkubectl -n victim delete sa ci-bot     # invalidates its tokens\nkubectl -n kube-system delete deploy kube-proxy-helper']
        ],
        verify: 'Your timeline shows the Secret listing and the fake `kube-proxy-helper` creation by `ci-bot`, plus who created the binding, and the identity no longer works.',
        cleanup: 'kubectl delete ns victim'
      }],
      refs: [
        ['MITRE ATT&CK: Containers matrix', 'https://attack.mitre.org/matrices/enterprise/containers/'],
        ['Microsoft Threat Matrix for Kubernetes', 'https://microsoft.github.io/Threat-Matrix-for-Kubernetes/'],
        ['Auditing', 'https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/'],
        ['Kubernetes security checklist', 'https://kubernetes.io/docs/concepts/security/security-checklist/']
      ],
      quiz: [
        { q: "An attacker creates a privileged Pod that mounts the host's `/`. Which tactic is this?",
          o: ["Privilege escalation", "Discovery", "Collection", "Initial access"],
          why: "It turns access to the Kubernetes API into root access on a node." },
        { q: "Reading ServiceAccount tokens and cloud metadata credentials belongs to which tactic?",
          o: ["Credential access", "Impact", "Execution", "Persistence"],
          why: "The attacker is collecting credentials to use later." },
        { q: "Which audit log fields identify who made a request and from where?",
          o: ["`user.username` and `sourceIPs`", "`objectRef.name` and `stage`", "`level` and `auditID`", "`verb` and `requestURI`"],
          why: "`userAgent` and `user.groups` also help to identify the actor." },
        { q: "You find a compromised Pod. What should you do first?",
          o: ["Isolate it (deny-all NetworkPolicy or scale to 0) and preserve evidence", "Delete the whole namespace immediately", "Restart the API server", "Wait until the next upgrade"],
          why: "Contain the damage without destroying what you need for the investigation." },
        { q: "Which framework catalogues attacker tactics and techniques specifically for Kubernetes?",
          o: ["Microsoft Threat Matrix for Kubernetes", "CIS Benchmark", "SLSA", "SPDX"],
          why: "It adapts the MITRE ATT&CK structure to Kubernetes clusters." }
      ]
    },
    {
      id: 'rt-immutable',
      title: 'Ensure immutability of containers at runtime',
      basics: {
        summary: "An **immutable** container never changes while it runs. If an attacker can't write files or install tools, many attacks simply fail. When you need a change, you build and deploy a new image.",
        ideas: [
          "`readOnlyRootFilesystem: true` makes the container's filesystem read-only.",
          "Mount **emptyDir** volumes only where the app must write (e.g. /tmp).",
          "**No shell, no package manager** in the image (distroless).",
          "Combine with **non-root** and **no privilege escalation**."
        ]
      },
      points: [
        "`securityContext.readOnlyRootFilesystem: true` on each container; add `emptyDir` volumes for writable paths (`/tmp`, `/var/cache/nginx`, `/var/run`).",
        "Also set `runAsNonRoot`, `allowPrivilegeEscalation: false`, `capabilities.drop: [\"ALL\"]` and `privileged: false`. A root or privileged container can remount or escape.",
        "Use distroless images so there is no shell or package manager to use, even with `kubectl exec`.",
        "A workaround seen in exams: a `startupProbe` or command that deletes shells (`rm /bin/sh /bin/bash`). Prefer a proper minimal image.",
        "Detect drift: Falco rules for writes below binary directories, new executables, or package managers in containers.",
        "Enforce: PSS `restricted` (non-root, no escalation) plus a policy that requires `readOnlyRootFilesystem` (Kyverno, Gatekeeper or ValidatingAdmissionPolicy).",
        "Exam pattern: find Pods that aren't immutable (privileged, writable root FS, running as root) and delete them, or patch a Deployment so it works with a read-only root FS.",
        "Fixes ship as new images through the pipeline, never as edits inside running containers."
      ],
      labs: [{
        title: 'Make nginx run with a read-only root filesystem',
        goal: 'Works on kind.',
        steps: [
          ['Try it naively and watch it fail:', `kubectl run ro --image=nginx --overrides='{"spec":{"containers":[{"name":"ro","image":"nginx","securityContext":{"readOnlyRootFilesystem":true}}]}}'
sleep 5; kubectl logs ro | tail -2`],
          ['Give nginx writable emptyDirs only where it needs them:', `kubectl delete pod ro --now
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: ro}
spec:
  containers:
  - name: nginx
    image: nginx
    securityContext: {readOnlyRootFilesystem: true, allowPrivilegeEscalation: false}
    volumeMounts:
    - {name: cache, mountPath: /var/cache/nginx}
    - {name: run, mountPath: /var/run}
    - {name: tmp, mountPath: /tmp}
  volumes:
  - {name: cache, emptyDir: {}}
  - {name: run, emptyDir: {}}
  - {name: tmp, emptyDir: {}}
EOF`],
          ['Prove what an attacker can and can\'t change:', 'kubectl exec ro -- touch /usr/bin/evil || echo "ROOT FS READ-ONLY"\nkubectl exec ro -- sh -c "echo x > /usr/share/nginx/html/index.html" || echo "CANNOT DEFACE"\nkubectl exec ro -- touch /tmp/ok && echo "tmp is writable"'],
          ['Find Pods in the cluster without a read-only root FS:', "kubectl get pods -A -o json | jq -r '.items[] | select(any(.spec.containers[]; .securityContext.readOnlyRootFilesystem != true)) | \"\\(.metadata.namespace)/\\(.metadata.name)\"' | head"]
        ],
        verify: 'nginx runs, writes to `/usr/bin` and the web root fail, and `/tmp` still works.',
        cleanup: 'kubectl delete pod ro --now'
      }],
      refs: [
        ['Configure a Security Context', 'https://kubernetes.io/docs/tasks/configure-pod-container/security-context/'],
        ['Pod Security Standards', 'https://kubernetes.io/docs/concepts/security/pod-security-standards/'],
        ['Volumes: emptyDir', 'https://kubernetes.io/docs/concepts/storage/volumes/#emptydir']
      ],
      quiz: [
        { q: "Which setting makes a container's root filesystem read-only?",
          o: ["`securityContext.readOnlyRootFilesystem: true`", "`readOnly: true` on a volumeMount for /", "`immutable: true` on the Pod", "`fsGroup: 0`"],
          why: "It is a per-container securityContext field." },
        { q: "nginx crashes after you set `readOnlyRootFilesystem: true`. What is the usual fix?",
          o: ["Mount emptyDir volumes at the paths it writes to, like /var/cache/nginx and /var/run", "Run it privileged", "Remove the setting", "Mount hostPath /"],
          why: "Give the app writable scratch space only where it needs it." },
        { q: "Why is a container without a shell harder to attack?",
          o: ["`kubectl exec` and many attack scripts have nothing to run", "It uses less CPU", "It can't be scanned", "It has no network access"],
          why: "Attackers rely on shells and common tools after they get in." },
        { q: "With immutable containers, how do you fix a bug in production?",
          o: ["Build and roll out a new image", "SSH into the container and edit the file", "`kubectl cp` the fix in", "Edit files with `kubectl exec`"],
          why: "Running containers are never patched in place." },
        { q: "Which Pod is the LEAST immutable?",
          o: ["A privileged container running as root with a writable root filesystem", "A non-root container with readOnlyRootFilesystem", "A distroless container with all capabilities dropped", "A container whose only writable path is an emptyDir at /tmp"],
          why: "Privileged plus root plus a writable filesystem lets an attacker change anything." }
      ]
    },
    {
      id: 'rt-audit',
      title: 'Kubernetes audit logs',
      basics: {
        summary: "Audit logs are the API server's security camera: they record **who did what, when, and from where** for every request. You enable them with a **policy file** that decides how much detail to keep for each kind of request.",
        ideas: [
          "Enable with `--audit-policy-file` and `--audit-log-path` on the API server.",
          "Policy rules are checked **in order; the first match wins**.",
          "Levels: **None**, **Metadata**, **Request**, **RequestResponse**.",
          "Log Secrets at **Metadata** only, so their values never end up in the log."
        ]
      },
      points: [
        "API server flags: `--audit-policy-file=/etc/kubernetes/audit/policy.yaml`, `--audit-log-path=/var/log/kubernetes/audit/audit.log`, `--audit-log-maxage=30`, `--audit-log-maxbackup=10`, `--audit-log-maxsize=100`.",
        "Mount both into the kube-apiserver Pod: the policy file (read-only) and the log directory (hostPath `DirectoryOrCreate`).",
        "Policy: `apiVersion: audit.k8s.io/v1`, `kind: Policy`, `rules:` evaluated top to bottom; the **first matching rule** decides the level.",
        "Levels: `None` (not logged), `Metadata` (user, verb, resource, time; no bodies), `Request` (+ request body), `RequestResponse` (+ response body).",
        "Stages: `RequestReceived`, `ResponseStarted`, `ResponseComplete`, `Panic`. `omitStages: [RequestReceived]` halves the noise.",
        "Typical policy: `None` for noisy system reads, `Metadata` for secrets/configmaps/tokenreviews, `RequestResponse` for RBAC changes and Pod creation in sensitive namespaces, catch-all `Metadata` at the end.",
        "Each line is JSON: `user.username`, `verb`, `objectRef.{resource,namespace,name,subresource}`, `sourceIPs`, `userAgent`, `responseStatus.code`, `requestReceivedTimestamp`.",
        "Send events elsewhere with the webhook backend: `--audit-webhook-config-file`."
      ],
      labs: [{
        title: 'Enable audit logging and query it',
        tags: ['kubeadm VMs'],
        goal: 'On the control-plane node. Back up the API server manifest first.',
        steps: [
          ['Write the policy (order matters: first match wins):', `sudo mkdir -p /etc/kubernetes/audit /var/log/kubernetes/audit
cat <<'EOF' | sudo tee /etc/kubernetes/audit/policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
omitStages: [RequestReceived]
rules:
- level: None
  users: ["system:kube-proxy"]
  verbs: ["watch"]
- level: Metadata
  resources: [{group: "", resources: ["secrets", "configmaps"]}]
- level: RequestResponse
  resources: [{group: "rbac.authorization.k8s.io"}]
- level: Request
  resources: [{group: "", resources: ["pods"]}]
  verbs: ["create", "delete"]
- level: Metadata
EOF`],
          ['Add flags, volumes and mounts to `kube-apiserver.yaml`:', `sudo cp /etc/kubernetes/manifests/kube-apiserver.yaml ~/kube-apiserver.yaml.bak
sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml
# command:
#   - --audit-policy-file=/etc/kubernetes/audit/policy.yaml
#   - --audit-log-path=/var/log/kubernetes/audit/audit.log
#   - --audit-log-maxage=7
#   - --audit-log-maxbackup=2
#   - --audit-log-maxsize=50
# volumeMounts:
#   - {name: audit-policy, mountPath: /etc/kubernetes/audit/policy.yaml, readOnly: true}
#   - {name: audit-log, mountPath: /var/log/kubernetes/audit}
# volumes:
#   - {name: audit-policy, hostPath: {path: /etc/kubernetes/audit/policy.yaml, type: File}}
#   - {name: audit-log, hostPath: {path: /var/log/kubernetes/audit, type: DirectoryOrCreate}}
watch sudo crictl ps --name kube-apiserver`],
          ['Generate events and query them:', `kubectl create secret generic audit-test --from-literal=k=v
kubectl create clusterrole audit-demo --verb=get --resource=pods
sudo tail -n 200 /var/log/kubernetes/audit/audit.log | jq -c 'select(.objectRef.name=="audit-test" or .objectRef.name=="audit-demo") | {level, user: .user.username, verb, res: .objectRef.resource, hasBody: (.requestObject != null)}'`]
        ],
        verify: 'The Secret event is at `Metadata` with no body (`hasBody: false`); the ClusterRole event is at `RequestResponse` with a body.',
        cleanup: 'kubectl delete secret audit-test; kubectl delete clusterrole audit-demo'
      }],
      refs: [
        ['Auditing', 'https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/'],
        ['Audit policy API (audit.k8s.io/v1)', 'https://kubernetes.io/docs/reference/config-api/apiserver-audit.v1/'],
        ['kube-apiserver flags', 'https://kubernetes.io/docs/reference/command-line-tools-reference/kube-apiserver/']
      ],
      quiz: [
        { q: "In an audit policy, which rule applies to a request?",
          o: ["The first rule that matches", "The last rule that matches", "The most specific rule", "All matching rules combined"],
          why: "Put specific rules first and a catch-all at the end." },
        { q: "Which level logs both the request and the response bodies?",
          o: ["RequestResponse", "Metadata", "Request", "None"],
          why: "`Request` logs only the request body; `Metadata` logs no bodies." },
        { q: "Why log Secrets only at the `Metadata` level?",
          o: ["Higher levels would write the secret values into the audit log", "Metadata is faster", "Secrets can't be audited otherwise", "etcd requires it"],
          why: "The audit log would itself become a store of secrets." },
        { q: "Which two flags are needed to write audit logs to a file?",
          o: ["`--audit-policy-file` and `--audit-log-path`", "`--audit-enabled` and `--audit-file`", "`--enable-audit` and `--log-dir`", "`--audit-level` and `--audit-output`"],
          why: "Without a policy nothing is logged; without a path there is no file backend." },
        { q: "You added the audit flags, but the API server won't start. What is a common cause?",
          o: ["The policy file or log directory isn't mounted into the kube-apiserver Pod", "The kubelet is too old", "The policy uses the Metadata level", "jq isn't installed"],
          why: "The container can only see host paths that are mounted into it." }
      ]
    }
  ]
});
