// Quiz format: the FIRST option of each question is the correct one; options are shuffled when shown.
COURSE.addDomain({
  id: 'setup', title: 'Cluster Setup', weight: 15,
  topics: [
    {
      id: 'cs-netpol',
      title: 'Network policies to restrict cluster-level access',
      basics: {
        summary: "Out of the box every Pod can talk to every other Pod, so an attacker who breaks into one Pod can move freely. NetworkPolicies act as **firewalls for Pods**: deny everything by default, then open only the paths your apps need.",
        ideas: [
          "**Default-deny first**: one policy that blocks all ingress and egress in the namespace.",
          "**Allow-list** the paths each app needs, by Pod label, namespace and port.",
          "**Remember DNS**: with egress denied, allow port 53 to kube-dns or name lookups fail.",
          "Policies only work if the **CNI enforces them** (Calico, Cilium…)."
        ]
      },
      points: [
        "Start each application namespace with a default-deny policy: `podSelector: {}` and `policyTypes: [Ingress, Egress]` with no rules.",
        "Then add narrow allow rules: `from`/`to` with `podSelector`, `namespaceSelector` (use the automatic `kubernetes.io/metadata.name` label) and `ports`.",
        "Allow DNS egress explicitly: UDP and TCP 53 to Pods labelled `k8s-app: kube-dns` in `kube-system`.",
        "`ipBlock` with `except` lets Pods reach the internet but not internal ranges or the cloud metadata IP `169.254.169.254/32`.",
        "Policies are namespaced and additive (allowed traffic = union of all policies). There is no explicit \"deny\" rule.",
        "`namespaceSelector` and `podSelector` in the **same** `from` item = AND; in separate items = OR.",
        "Protect sensitive namespaces (`kube-system`, monitoring, databases) so only the Pods that need them can connect.",
        "NetworkPolicy is L3/L4 only. For HTTP-aware (L7) rules use CiliumNetworkPolicy or a service mesh."
      ],
      labs: [{
        title: 'Lock down a namespace, then open only the needed paths',
        tags: ['CNI'],
        goal: 'Cluster with Calico or Cilium (kind: `networking: {disableDefaultCNI: true}`, then install Calico).',
        steps: [
          ['Deploy a 3-tier app:', `kubectl create ns app
kubectl -n app run frontend --image=nginx --labels=tier=frontend
kubectl -n app run backend --image=nginx --labels=tier=backend
kubectl -n app run db --image=nginx --labels=tier=db
kubectl -n app expose pod backend --port=80
kubectl -n app expose pod db --port=80`],
          ['Default-deny ingress and egress for the whole namespace:', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: default-deny, namespace: app}
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
EOF
kubectl -n app exec frontend -- curl -s -m3 backend || echo BLOCKED`],
          ['Allow DNS for every Pod in the namespace:', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: allow-dns, namespace: app}
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to:
    - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: kube-system}}
      podSelector: {matchLabels: {k8s-app: kube-dns}}
    ports: [{protocol: UDP, port: 53}, {protocol: TCP, port: 53}]
EOF`],
          ['Open frontend → backend and backend → db only:', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: frontend-to-backend, namespace: app}
spec:
  podSelector: {matchLabels: {tier: frontend}}
  policyTypes: [Egress]
  egress: [{to: [{podSelector: {matchLabels: {tier: backend}}}], ports: [{port: 80}]}]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: backend-from-frontend, namespace: app}
spec:
  podSelector: {matchLabels: {tier: backend}}
  policyTypes: [Ingress, Egress]
  ingress: [{from: [{podSelector: {matchLabels: {tier: frontend}}}], ports: [{port: 80}]}]
  egress: [{to: [{podSelector: {matchLabels: {tier: db}}}], ports: [{port: 80}]}]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: db-from-backend, namespace: app}
spec:
  podSelector: {matchLabels: {tier: db}}
  policyTypes: [Ingress]
  ingress: [{from: [{podSelector: {matchLabels: {tier: backend}}}], ports: [{port: 80}]}]
EOF`],
          ['Test the allowed and blocked paths:', `kubectl -n app exec frontend -- curl -s -m3 backend | head -1   # allowed
kubectl -n app exec backend -- curl -s -m3 db | head -1         # allowed
kubectl -n app exec frontend -- curl -s -m3 db || echo BLOCKED  # blocked`]
        ],
        verify: 'Only frontend → backend and backend → db return the nginx page; frontend → db prints `BLOCKED`.',
        cleanup: 'kubectl delete ns app'
      }],
      refs: [
        ['Network Policies', 'https://kubernetes.io/docs/concepts/services-networking/network-policies/'],
        ['Declare Network Policy', 'https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/'],
        ['Securing a Cluster', 'https://kubernetes.io/docs/tasks/administer-cluster/securing-a-cluster/'],
        ['Network policy recipes (community)', 'https://github.com/ahmetb/kubernetes-network-policy-recipes']
      ],
      quiz: [
        { q: "Which policy blocks all incoming and outgoing traffic for every Pod in a namespace?",
          o: ["`podSelector: {}` with `policyTypes: [Ingress, Egress]` and no rules", "`podSelector: {}` with an empty rule `ingress: [{}]`", "A policy with `ipBlock: {cidr: 0.0.0.0/0}`", "Deleting the namespace's default ServiceAccount"],
          why: "Selecting every Pod and listing both policy types with no allow rules denies everything. `ingress: [{}]` is the opposite: one empty rule allows all traffic." },
        { q: "After you apply an egress default-deny, Pods can't resolve any names. What must you add?",
          o: ["An egress rule allowing UDP and TCP port 53 to kube-dns", "An ingress rule on port 53", "A new ClusterIP Service for CoreDNS", "`hostNetwork: true` on the Pods"],
          why: "DNS queries are egress traffic from the Pod to CoreDNS, so they need an explicit egress allow on port 53." },
        { q: "How do you allow traffic only from Pods in namespace `monitoring`?",
          o: ["`namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: monitoring}}`", "`podSelector: {matchLabels: {namespace: monitoring}}`", "`ipBlock: {cidr: monitoring}`", "`from: [{namespace: monitoring}]`"],
          why: "Every namespace automatically carries the `kubernetes.io/metadata.name` label, so a namespaceSelector can match it by name." },
        { q: "Which statement about NetworkPolicies is true?",
          o: ["Allowed traffic is the union of all matching policies; there are no deny rules", "A newer policy overrides an older one", "A policy applies to the whole cluster", "Policies can filter by HTTP path"],
          why: "Policies only add allowed paths. Anything not allowed by some policy is denied once a Pod is selected." },
        { q: "Pods should reach the internet but never the range 10.0.0.0/8. Which egress peer do you use?",
          o: ["`ipBlock: {cidr: 0.0.0.0/0, except: [10.0.0.0/8]}`", "`ipBlock: {cidr: 10.0.0.0/8, deny: true}`", "`namespaceSelector: {}`", "`podSelector: {}`"],
          why: "`except` carves ranges out of an allowed CIDR. There is no `deny` field." }
      ]
    },
    {
      id: 'cs-cis',
      title: 'CIS benchmark review of Kubernetes components',
      basics: {
        summary: "The **CIS Kubernetes Benchmark** is a long checklist of safe settings for the API server, etcd, kubelet and other parts. **kube-bench** runs those checks for you and tells you exactly which file and flag to fix.",
        ideas: [
          "**kube-bench** marks each check PASS, FAIL or WARN.",
          "Every FAIL comes with a **remediation**: the file and setting to change.",
          "Control-plane fixes go in `/etc/kubernetes/manifests/*.yaml`; kubelet fixes go in `/var/lib/kubelet/config.yaml`.",
          "Re-run kube-bench afterwards to confirm the check now passes."
        ]
      },
      points: [
        "Run kube-bench on each node: `kube-bench run --targets master` (control plane), `--targets node` (kubelet), `etcd`, `policies`. Or run it as a Kubernetes Job and read the Pod logs.",
        "Each result has an ID (e.g. `1.2.18`), a status, and a remediation telling you which file and flag to change.",
        "API server: `--authorization-mode` includes `Node,RBAC` (never `AlwaysAllow`), `--profiling=false`, audit logging flags set, `--kubelet-certificate-authority` set, admission plugin `NodeRestriction` enabled.",
        "etcd: `--client-cert-auth=true`, `--peer-client-cert-auth=true`, `--auto-tls=false`; data dir `/var/lib/etcd` with mode 700, owned by etcd.",
        "kubelet (`/var/lib/kubelet/config.yaml`): `authentication.anonymous.enabled: false`, `authorization.mode: Webhook`, `readOnlyPort: 0`, `protectKernelDefaults: true`, `rotateCertificates: true`. Then `systemctl restart kubelet`.",
        "Controller manager and scheduler: `--profiling=false`, `--bind-address=127.0.0.1`; controller manager also `--use-service-account-credentials=true`.",
        "File checks: manifests and kubeconfigs with mode 600 (or stricter) owned by `root:root`; PKI keys 600. Check with `stat -c '%a %U:%G' <file>`.",
        "CoreDNS (kube-dns): keep it patched, give it minimal RBAC, and never expose it outside the cluster."
      ],
      labs: [{
        title: 'Run kube-bench and fix failing checks',
        tags: ['kubeadm VMs'],
        goal: 'On the control-plane node. Back up manifests before editing.',
        steps: [
          ['Install kube-bench (check the latest release on GitHub) and run the control-plane checks:', `KB=0.10.1   # use the current release
curl -L https://github.com/aquasecurity/kube-bench/releases/download/v$KB/kube-bench_\${KB}_linux_amd64.tar.gz | tar xz
sudo ./kube-bench run --targets master --config-dir cfg --config cfg/config.yaml | tee master.txt
grep -E "\\[FAIL\\]" master.txt`],
          ['Pick a FAIL, for example "Ensure that the --profiling argument is set to false", and read its remediation:', 'grep -A6 "profiling" master.txt'],
          ['Apply the fix in the static Pod manifest:', `sudo cp /etc/kubernetes/manifests/kube-apiserver.yaml ~/kube-apiserver.yaml.bak
sudo sed -i 's/- kube-apiserver$/- kube-apiserver\\n    - --profiling=false/' /etc/kubernetes/manifests/kube-apiserver.yaml
sudo grep -n profiling /etc/kubernetes/manifests/kube-apiserver.yaml
watch sudo crictl ps --name kube-apiserver   # wait until it restarts`],
          ['Check the kubelet (node) checks and fix one in the kubelet config:', `sudo ./kube-bench run --targets node --config-dir cfg --config cfg/config.yaml | grep FAIL
sudo grep -nE "anonymous|mode:|readOnlyPort" -A2 /var/lib/kubelet/config.yaml
# set authentication.anonymous.enabled: false and authorization.mode: Webhook, then:
sudo systemctl restart kubelet`],
          ['Alternative: run kube-bench as a Job:', 'kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml\nkubectl logs job/kube-bench | grep FAIL']
        ],
        verify: 'Re-running kube-bench shows the profiling check (and the kubelet check you fixed) as `[PASS]`, and `kubectl get nodes` still works.'
      }],
      refs: [
        ['CIS Kubernetes Benchmark', 'https://www.cisecurity.org/benchmark/kubernetes'],
        ['kube-bench (GitHub)', 'https://github.com/aquasecurity/kube-bench'],
        ['kube-apiserver flags', 'https://kubernetes.io/docs/reference/command-line-tools-reference/kube-apiserver/'],
        ['Set kubelet parameters via a config file', 'https://kubernetes.io/docs/tasks/administer-cluster/kubelet-config-file/'],
        ['Kubelet authentication/authorization', 'https://kubernetes.io/docs/reference/access-authn-authz/kubelet-authn-authz/'],
        ['Securing a Cluster', 'https://kubernetes.io/docs/tasks/administer-cluster/securing-a-cluster/']
      ],
      quiz: [
        { q: "What does kube-bench do?",
          o: ["Checks a node's Kubernetes setup against the CIS Benchmark", "Benchmarks API server performance", "Scans container images for CVEs", "Enforces Pod Security Standards"],
          why: "kube-bench runs the CIS checks for the control plane, etcd, kubelet and policies, and prints a remediation for each failure." },
        { q: "kube-bench says `--profiling` is not set to false on the API server. Where do you fix it on a kubeadm cluster?",
          o: ["/etc/kubernetes/manifests/kube-apiserver.yaml", "/var/lib/kubelet/config.yaml", "A kube-apiserver ConfigMap in kube-system", "/etc/default/kubelet"],
          why: "The API server is a static Pod. Edit its manifest and the kubelet restarts it with the new flag." },
        { q: "Which kubelet settings does the CIS Benchmark recommend?",
          o: ["Anonymous authentication off and authorization mode Webhook", "`readOnlyPort: 10255`", "Authorization mode AlwaysAllow", "Anonymous authentication on, for health checks"],
          why: "Without these, anyone who can reach port 10250 can query the kubelet API." },
        { q: "Which API server setting fails the CIS check?",
          o: ["`--authorization-mode=AlwaysAllow`", "`--authorization-mode=Node,RBAC`", "`--authorization-mode=Node,RBAC,Webhook`", "`--authorization-mode=Node,Webhook,RBAC`"],
          why: "AlwaysAllow skips authorization entirely; every authenticated request is allowed." },
        { q: "Which etcd flag makes etcd require client certificates?",
          o: ["`--client-cert-auth=true`", "`--auto-tls=true`", "`--insecure-skip-tls-verify=true`", "`--peer-auto-tls=true`"],
          why: "`--client-cert-auth` makes etcd reject clients without a certificate signed by its CA. `--auto-tls` should be false, because it uses self-signed certs." }
      ]
    },
    {
      id: 'cs-ingress-tls',
      title: 'Set up Ingress with TLS',
      basics: {
        summary: "Traffic from users to your apps should be encrypted with HTTPS. With an Ingress, the **Ingress controller terminates TLS** using a certificate stored in a Kubernetes Secret, then forwards the request to your Service.",
        ideas: [
          "Store the certificate and key in a **TLS Secret** in the same namespace as the Ingress.",
          "Add a `tls` section to the Ingress listing the hosts and the Secret name.",
          "The controller then **redirects HTTP to HTTPS** automatically.",
          "**cert-manager** can issue and renew certificates for you."
        ]
      },
      points: [
        "Create the Secret: `kubectl create secret tls web-tls --cert=tls.crt --key=tls.key -n <ns>` (type `kubernetes.io/tls`, keys `tls.crt` and `tls.key`).",
        "The Secret must be in the **same namespace** as the Ingress.",
        "`spec.tls[].hosts` must match `spec.rules[].host` and the certificate's names (CN/SAN); otherwise clients get a name mismatch.",
        "If the host or Secret doesn't match, ingress-nginx serves its default \"Kubernetes Ingress Controller Fake Certificate\".",
        "ingress-nginx redirects HTTP → HTTPS by default when TLS is set (`ssl-redirect`). Use `nginx.ingress.kubernetes.io/force-ssl-redirect: \"true\"` when TLS is terminated before the controller.",
        "Test: `curl -kv --resolve host:443:<ip> https://host/` and `openssl s_client -connect <ip>:443 -servername host` to see the served certificate.",
        "Automate issuing and renewal with cert-manager (`cert-manager.io/cluster-issuer` annotation on the Ingress).",
        "Gateway API equivalent: a listener with `protocol: HTTPS` and `tls.certificateRefs` pointing at the Secret."
      ],
      labs: [{
        title: 'Serve an app over HTTPS with a self-signed certificate',
        goal: 'Needs an Ingress controller (kind: install the ingress-nginx kind manifest, see the CKA Ingress lab).',
        steps: [
          ['App and Service:', 'kubectl create ns web\nkubectl -n web create deploy secure --image=nginx\nkubectl -n web expose deploy secure --port=80'],
          ['Create a certificate with the right name (SAN) and store it as a TLS Secret:', `openssl req -x509 -nodes -newkey rsa:2048 -days 30 \\
  -keyout tls.key -out tls.crt -subj "/CN=secure.example.com" \\
  -addext "subjectAltName=DNS:secure.example.com"
kubectl -n web create secret tls secure-tls --cert=tls.crt --key=tls.key`],
          ['Ingress with TLS:', `cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: {name: secure, namespace: web}
spec:
  ingressClassName: nginx
  tls:
  - hosts: [secure.example.com]
    secretName: secure-tls
  rules:
  - host: secure.example.com
    http:
      paths:
      - {path: /, pathType: Prefix, backend: {service: {name: secure, port: {number: 80}}}}
EOF`],
          ['Test HTTPS, the certificate, and the HTTP redirect:', `curl -sk --resolve secure.example.com:443:127.0.0.1 https://secure.example.com | head -4
openssl s_client -connect 127.0.0.1:443 -servername secure.example.com </dev/null 2>/dev/null | openssl x509 -noout -subject
curl -sI -H "Host: secure.example.com" http://127.0.0.1 | head -3   # 308 Permanent Redirect`]
        ],
        verify: 'openssl shows `subject=CN = secure.example.com` (not the Fake Certificate), and plain HTTP gets a `308` redirect.',
        cleanup: 'kubectl delete ns web'
      }],
      refs: [
        ['Ingress: TLS', 'https://kubernetes.io/docs/concepts/services-networking/ingress/#tls'],
        ['TLS Secrets', 'https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets'],
        ['ingress-nginx: TLS/HTTPS', 'https://kubernetes.github.io/ingress-nginx/user-guide/tls/'],
        ['cert-manager: securing Ingress resources', 'https://cert-manager.io/docs/usage/ingress/']
      ],
      quiz: [
        { q: "Which Secret type does an Ingress `tls` section use?",
          o: ["kubernetes.io/tls", "Opaque with a `cert.pem` key", "kubernetes.io/service-account-token", "kubernetes.io/dockerconfigjson"],
          why: "TLS Secrets hold `tls.crt` and `tls.key`. `kubectl create secret tls` creates exactly this type." },
        { q: "Where must the TLS Secret be?",
          o: ["In the same namespace as the Ingress", "In kube-system", "In the Ingress controller's namespace", "Anywhere; Secrets are cluster-wide"],
          why: "An Ingress can only reference Secrets in its own namespace." },
        { q: "curl shows the certificate \"Kubernetes Ingress Controller Fake Certificate\". What is the likely cause?",
          o: ["The TLS host or Secret doesn't match, so the controller falls back to its default certificate", "The backend Pods are not Ready", "ingress-nginx doesn't support TLS", "The Service is a NodePort"],
          why: "The fake certificate is the controller's default. Check `tls.hosts`, the rule's `host`, and that the Secret exists in the right namespace." },
        { q: "TLS is terminated at a cloud load balancer, before ingress-nginx. Which annotation still forces HTTPS redirects?",
          o: ["`nginx.ingress.kubernetes.io/force-ssl-redirect: \"true\"`", "`nginx.ingress.kubernetes.io/rewrite-target: https`", "`kubernetes.io/tls-acme: \"true\"`", "`nginx.ingress.kubernetes.io/backend-protocol: HTTPS`"],
          why: "`ssl-redirect` only applies when the Ingress has TLS configured. `force-ssl-redirect` redirects even without it." },
        { q: "Which command creates a TLS Secret from certificate files?",
          o: ["`kubectl create secret tls web-tls --cert=tls.crt --key=tls.key`", "`kubectl create secret generic web-tls --tls`", "`kubectl create certificate web-tls`", "`kubectl create secret docker-registry web-tls`"],
          why: "The `tls` subcommand checks the files and stores them under the standard keys." }
      ]
    },
    {
      id: 'cs-metadata',
      title: 'Protect node metadata and endpoints',
      basics: {
        summary: "Nodes expose sensitive endpoints. In the cloud, the **metadata service** at `169.254.169.254` can hand out the node's cloud credentials. The **kubelet API** on port 10250 can run commands in Pods. A compromised Pod must not be able to reach either.",
        ideas: [
          "**Block 169.254.169.254** from Pods with an egress NetworkPolicy (or cloud features such as IMDSv2).",
          "**Lock down the kubelet**: anonymous auth off, Webhook authorization, read-only port 0.",
          "**Firewall node ports**: only the control plane should reach 10250, and only the API server should reach etcd.",
          "Avoid `hostNetwork` Pods, which see the node's network directly."
        ]
      },
      points: [
        "Cloud instance metadata (IMDS) at `169.254.169.254` can return node IAM credentials and bootstrap data. Pods rarely need it.",
        "Block it per namespace: egress NetworkPolicy with `ipBlock: {cidr: 0.0.0.0/0, except: [169.254.169.254/32]}`. Cloud options: AWS IMDSv2 with hop limit 1, GKE Workload Identity / metadata concealment.",
        "Kubelet API (10250): anyone who can call it unauthenticated can list Pods and exec into them. Set `authentication.anonymous.enabled: false` and `authorization.mode: Webhook`.",
        "Disable the unauthenticated read-only port: `readOnlyPort: 0` in the kubelet config.",
        "etcd (2379-2380) should be reachable only from control-plane nodes; kubelet 10250 only from the control plane. Enforce with host firewalls or security groups.",
        "Enable the `NodeRestriction` admission plugin so a kubelet can only change its own Node object and the Pods bound to it.",
        "Pods with `hostNetwork: true` see node ports and usually bypass NetworkPolicy. Allow it only for system components.",
        "Test from a Pod: `curl -m3 http://169.254.169.254/` should time out; `curl -k https://<node>:10250/pods` should return 401 or 403."
      ],
      labs: [{
        title: 'Block the metadata IP and check kubelet authentication',
        tags: ['CNI'],
        goal: 'Any cluster with a policy-enforcing CNI. On a laptop the metadata IP simply doesn\'t answer, but you can still prove the policy drops the traffic.',
        steps: [
          ['Allow all egress except the metadata service:', `kubectl create ns meta
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: deny-metadata, namespace: meta}
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0
        except: [169.254.169.254/32]
EOF`],
          ['Test: metadata blocked, everything else allowed:', `kubectl -n meta run t --rm -it --image=curlimages/curl --restart=Never -- \\
  sh -c 'curl -s -m3 http://169.254.169.254/ || echo METADATA-BLOCKED; curl -sI -m5 https://kubernetes.io | head -1'`],
          ['Check the kubelet refuses anonymous requests (run from any machine that can reach the node):', `NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[0].address}')
kubectl run k --rm -it --image=curlimages/curl --restart=Never -- curl -sk https://$NODE_IP:10250/pods | head -c 200`],
          ['On the node, confirm the settings that make that true:', 'sudo grep -A3 -E "anonymous|authorization:" /var/lib/kubelet/config.yaml\nsudo grep readOnlyPort /var/lib/kubelet/config.yaml || echo "readOnlyPort not set (defaults to 0 with kubeadm)"']
        ],
        verify: 'The Pod prints `METADATA-BLOCKED` but reaches kubernetes.io; the kubelet answers `Unauthorized` instead of a Pod list.',
        cleanup: 'kubectl delete ns meta'
      }],
      refs: [
        ['Restricting cloud metadata API access', 'https://kubernetes.io/docs/tasks/administer-cluster/securing-a-cluster/#restricting-cloud-metadata-api-access'],
        ['Kubelet authentication/authorization', 'https://kubernetes.io/docs/reference/access-authn-authz/kubelet-authn-authz/'],
        ['Admission controllers: NodeRestriction', 'https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#noderestriction'],
        ['Ports and Protocols', 'https://kubernetes.io/docs/reference/networking/ports-and-protocols/']
      ],
      quiz: [
        { q: "Why block Pods from reaching 169.254.169.254?",
          o: ["The cloud metadata service can hand out the node's credentials", "It is the cluster DNS server", "It is the API server's internal IP", "It slows down Pod networking"],
          why: "A compromised Pod could use node credentials to attack the cloud account. That's a classic escalation path." },
        { q: "Which egress rule lets Pods use the internet but blocks the metadata service?",
          o: ["`ipBlock: {cidr: 0.0.0.0/0, except: [169.254.169.254/32]}`", "`ipBlock: {cidr: 169.254.169.254/32}`", "`podSelector: {matchLabels: {app: metadata}}`", "`namespaceSelector: {}`"],
          why: "Allow everything, minus the single metadata address." },
        { q: "`curl -k https://node:10250/pods` returns the node's Pod list without any credentials. What is wrong?",
          o: ["The kubelet allows anonymous requests and isn't using Webhook authorization", "The read-only port is closed", "NodeRestriction is enabled", "The API server is down"],
          why: "Set `authentication.anonymous.enabled: false` and `authorization.mode: Webhook` in the kubelet config, then restart the kubelet." },
        { q: "What does the NodeRestriction admission plugin do?",
          o: ["Limits each kubelet to changing its own Node object and its own Pods", "Blocks Pods from reaching node ports", "Stops Pods from running on control-plane nodes", "Encrypts kubelet traffic"],
          why: "A stolen kubelet credential then can't relabel other nodes or tamper with Pods elsewhere." },
        { q: "Which kubelet setting turns off the unauthenticated read-only port 10255?",
          o: ["`readOnlyPort: 0`", "`anonymousPort: false`", "`port: 0`", "`healthzPort: 0`"],
          why: "The read-only port serves Pod and node info with no authentication at all." }
      ]
    },
    {
      id: 'cs-binaries',
      title: 'Verify platform binaries before deploying',
      basics: {
        summary: "A tampered `kubelet` or `kubectl` binary could give an attacker full control. Before you install one, compare its **checksum** with the official value published by the Kubernetes project. If they differ, don't use it.",
        ideas: [
          "Every release binary has a published **SHA256/SHA512 checksum** on `dl.k8s.io`.",
          "`sha256sum --check` (or `sha512sum`) compares the file with that value.",
          "**Mismatch = don't use it.** Delete it and download again from the official source.",
          "Release artifacts are also **signed** (Sigstore cosign)."
        ]
      },
      points: [
        "Binaries: `https://dl.k8s.io/release/v1.33.0/bin/linux/amd64/kubectl`; checksums sit next to them: `…/kubectl.sha256` and `…/kubectl.sha512`.",
        "Check: `echo \"$(cat kubectl.sha256)  kubectl\" | sha256sum --check` → `kubectl: OK` or `FAILED`.",
        "Manual comparison: `sha512sum kubelet` and compare with the published value (`diff` or by eye).",
        "Know the version you are checking: `kubelet --version`, `kubeadm version -o short`, `kubectl version --client`. The checksum must be for exactly that version and architecture.",
        "Exam pattern: several binaries are given; find those whose hash doesn't match the official release and delete them.",
        "The release also publishes Sigstore signatures and certificates; verify with `cosign verify-blob` against the release's identity.",
        "Prefer the signed package repositories at `pkgs.k8s.io` over ad-hoc downloads.",
        "For container images, use digests (`image@sha256:…`) so the content can't change under the same tag."
      ],
      labs: [{
        title: 'Verify a binary, then catch a tampered copy',
        goal: 'Any Linux machine (on macOS use `shasum -a 256` instead of `sha256sum`).',
        steps: [
          ['Download kubectl and its checksum:', `V=$(curl -Ls https://dl.k8s.io/release/stable.txt); echo $V
curl -LO "https://dl.k8s.io/release/$V/bin/linux/amd64/kubectl"
curl -LO "https://dl.k8s.io/release/$V/bin/linux/amd64/kubectl.sha256"`],
          ['Verify it:', 'echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check'],
          ['Tamper with a copy and verify again:', 'cp kubectl kubectl-evil && echo "x" >> kubectl-evil\necho "$(cat kubectl.sha256)  kubectl-evil" | sha256sum --check'],
          ['Compare the version of a binary already installed on a node with the release:', `V=$(kubelet --version | awk '{print $2}')
curl -Ls "https://dl.k8s.io/release/$V/bin/linux/amd64/kubelet.sha512" -o kubelet.sha512
echo "$(cat kubelet.sha512)  $(which kubelet)" | sha512sum --check`]
        ],
        verify: 'The original prints `kubectl: OK`; the tampered copy prints `kubectl-evil: FAILED`.',
        cleanup: 'rm -f kubectl kubectl-evil kubectl.sha256 kubelet.sha512'
      }],
      refs: [
        ['Install kubectl on Linux (validate the binary)', 'https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/'],
        ['Verify signed Kubernetes artifacts', 'https://kubernetes.io/docs/tasks/administer-cluster/verify-signed-artifacts/'],
        ['Download Kubernetes', 'https://kubernetes.io/releases/download/']
      ],
      quiz: [
        { q: "How do you check that a downloaded kubectl is genuine?",
          o: ["Compare its SHA256/SHA512 hash with the checksum published on dl.k8s.io", "Run `kubectl version` and check it prints a version", "Compare the file size with a colleague's copy", "Check the file's modification date"],
          why: "A version string or file size is easy to fake; a cryptographic hash isn't." },
        { q: "Which command checks `kubectl` against `kubectl.sha256`?",
          o: ["`echo \"$(cat kubectl.sha256)  kubectl\" | sha256sum --check`", "`sha256sum --verify kubectl.sha256`", "`kubectl verify --sha256`", "`md5sum kubectl`"],
          why: "The `.sha256` file contains only the hash, so you pair it with the file name and pipe it to `sha256sum --check`." },
        { q: "The hash of a kubelet binary doesn't match the release. What do you do?",
          o: ["Don't use it: delete it and download it again from the official source", "Run it once to see if it works", "Rename it", "Recompute the hash until it matches"],
          why: "A mismatch means the file was corrupted or modified." },
        { q: "Besides checksums, how are Kubernetes release artifacts signed?",
          o: ["With Sigstore (cosign) signatures", "With PGP signatures inside the binary", "With a Kubernetes Secret", "They aren't signed"],
          why: "The project signs binaries and images with Sigstore, and you can check them with `cosign verify-blob`." },
        { q: "Why pin container images by digest (`@sha256:…`)?",
          o: ["A digest always points to exactly the same content; a tag can be moved", "Digests download faster", "Tags aren't allowed in Pods", "It encrypts the image"],
          why: "Anyone with push access can repoint a tag. A digest is the content's hash." }
      ]
    }
  ]
});

COURSE.addDomain({
  id: 'hardening', title: 'Cluster Hardening', weight: 15,
  topics: [
    {
      id: 'ch-rbac',
      title: 'RBAC to minimize exposure',
      basics: {
        summary: "Give every user and app **only the permissions it really needs**, in the smallest scope. Some permissions look harmless but are as good as admin, such as reading Secrets or creating Pods, so review them carefully.",
        ideas: [
          "Prefer a **Role** (one namespace) over a **ClusterRole**, and avoid `*` wildcards.",
          "**Dangerous rights**: read Secrets, create Pods, `pods/exec`, `bind`, `escalate`, `impersonate`.",
          "**Audit** with `kubectl auth can-i --list --as …`.",
          "Remove bindings nobody uses, especially to `cluster-admin`."
        ]
      },
      points: [
        "Least privilege: specific `verbs`, `resources` and `resourceNames`; namespace-scoped Roles wherever possible.",
        "Avoid wildcards (`verbs: [\"*\"]`, `resources: [\"*\"]`) and bindings to `cluster-admin`.",
        "`get`/`list`/`watch` on `secrets` exposes every secret value. `list` returns the data too, not just names.",
        "`create pods` in a namespace lets someone mount any Secret or ServiceAccount of that namespace, so it equals access to all of them.",
        "Other escalation paths: `pods/exec`, `pods/attach`, `nodes/proxy`, `bind` and `escalate` on roles, `impersonate`, write access to `rolebindings`/`clusterrolebindings`, `serviceaccounts/token` create.",
        "The `system:masters` group bypasses RBAC completely. Never issue client certificates with `O=system:masters` to people.",
        "Audit: `kubectl auth can-i --list --as=jane -n dev`, `kubectl get clusterrolebindings -o wide | grep -E 'cluster-admin|system:anonymous|system:unauthenticated'`.",
        "Use the built-in `view`, `edit` and `admin` ClusterRoles through RoleBindings for common cases."
      ],
      labs: [{
        title: 'Find and fix an over-privileged ServiceAccount',
        goal: 'Works on kind.',
        steps: [
          ['Create the problem: an app SA bound to cluster-admin:', `kubectl create ns shop
kubectl -n shop create sa shop-app
kubectl create clusterrolebinding shop-app-admin --clusterrole=cluster-admin --serviceaccount=shop:shop-app`],
          ['Detect it:', `kubectl get clusterrolebindings -o wide | grep cluster-admin
kubectl auth can-i --list --as=system:serviceaccount:shop:shop-app | head
kubectl auth can-i get secrets -A --as=system:serviceaccount:shop:shop-app`],
          ['Replace it with a narrow Role (the app only needs to read its ConfigMaps):', `kubectl delete clusterrolebinding shop-app-admin
kubectl -n shop create role cm-reader --verb=get,list --resource=configmaps
kubectl -n shop create rolebinding shop-app-cm --role=cm-reader --serviceaccount=shop:shop-app`],
          ['Re-check, including the dangerous permissions:', `for v in "get configmaps" "get secrets" "create pods" "create pods/exec"; do
  echo -n "$v: "; kubectl -n shop auth can-i $v --as=system:serviceaccount:shop:shop-app; done`]
        ],
        verify: 'Only `get configmaps` answers `yes`; Secrets, Pods and exec answer `no`.',
        cleanup: 'kubectl delete ns shop'
      }],
      refs: [
        ['Using RBAC Authorization', 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/'],
        ['RBAC good practices', 'https://kubernetes.io/docs/concepts/security/rbac-good-practices/'],
        ['Authorization overview', 'https://kubernetes.io/docs/reference/access-authn-authz/authorization/']
      ],
      quiz: [
        { q: "Why is `list` on Secrets as dangerous as `get`?",
          o: ["The list response includes every Secret's data", "It only shows names", "It also lets you delete Secrets", "It isn't dangerous"],
          why: "`kubectl get secrets -o yaml` uses list and prints all values." },
        { q: "A user can create Pods in a namespace but has no rights on Secrets. What can they still do?",
          o: ["Create a Pod that mounts any Secret or ServiceAccount in that namespace", "Nothing involving Secrets", "Only read ConfigMaps", "Change RBAC rules"],
          why: "Pod creation is an indirect way to read Secrets and use other ServiceAccounts' tokens." },
        { q: "Which group bypasses RBAC completely?",
          o: ["system:masters", "system:authenticated", "system:serviceaccounts", "system:nodes"],
          why: "Members of `system:masters` are always authorized, even if every RBAC binding is removed." },
        { q: "Which command lists everything a ServiceAccount may do in namespace `dev`?",
          o: ["`kubectl auth can-i --list --as=system:serviceaccount:dev:app -n dev`", "`kubectl get sa app -o yaml`", "`kubectl describe role app`", "`kubectl auth whoami app`"],
          why: "`--list` with impersonation shows the effective permissions from all bindings." },
        { q: "Which verb lets someone create a RoleBinding to a role with more rights than they have?",
          o: ["bind", "patch", "watch", "list"],
          why: "RBAC normally blocks granting rights you don't hold. The `bind` (and, for roles, `escalate`) verbs lift that check." }
      ]
    },
    {
      id: 'ch-sa',
      title: 'Use ServiceAccounts with caution',
      basics: {
        summary: "Each Pod runs as a **ServiceAccount**, and by default gets a token for it mounted inside the container. If the app never calls the Kubernetes API, that token only helps an attacker, so **turn automounting off** and give each app its own account with minimal rights.",
        ideas: [
          "Every namespace has a **default** ServiceAccount; never grant it permissions.",
          "`automountServiceAccountToken: false` stops the token being mounted.",
          "**One ServiceAccount per app**, bound to a minimal Role.",
          "Modern tokens are **short-lived and auto-rotated**; avoid creating long-lived token Secrets."
        ]
      },
      points: [
        "Pods without `serviceAccountName` use the namespace's `default` ServiceAccount.",
        "Disable token mounting on the ServiceAccount or the Pod: `automountServiceAccountToken: false`. If both are set, the Pod's value wins.",
        "The token is mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token` (with `ca.crt` and `namespace`).",
        "Since 1.24 tokens are projected: time-limited (about 1 hour, refreshed by the kubelet), audience-bound and invalidated when the Pod is deleted. Long-lived token Secrets are no longer created automatically.",
        "Need a token for a tool? `kubectl create token <sa> --duration=15m` instead of a permanent Secret.",
        "Find Pods using the default SA: `kubectl get pods -A -o custom-columns=NS:.metadata.namespace,POD:.metadata.name,SA:.spec.serviceAccountName | grep default`.",
        "Bind permissions to dedicated SAs only; check with `kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa>`.",
        "Exam pattern: create an SA with automount disabled, use it in a Deployment, and delete unused SAs."
      ],
      labs: [{
        title: 'Run a Pod without an API token',
        goal: 'Works on kind.',
        steps: [
          ['Default behaviour: a token is mounted:', 'kubectl run withtoken --image=busybox --restart=Never -- sleep 3600\nkubectl exec withtoken -- ls /var/run/secrets/kubernetes.io/serviceaccount/'],
          ['A dedicated SA with automount off, used by a Pod:', `kubectl create sa web-sa
kubectl patch sa web-sa -p '{"automountServiceAccountToken": false}'
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: {name: notoken}
spec:
  serviceAccountName: web-sa
  containers: [{name: c, image: busybox, command: [sleep, "3600"]}]
EOF
kubectl exec notoken -- ls /var/run/secrets/kubernetes.io/serviceaccount/ || echo "NO TOKEN"`],
          ['See that the Pod-level setting overrides the SA:', `kubectl run override --image=busybox --restart=Never \\
  --overrides='{"spec":{"serviceAccountName":"web-sa","automountServiceAccountToken":true}}' -- sleep 3600
kubectl exec override -- ls /var/run/secrets/kubernetes.io/serviceaccount/`],
          ['Short-lived token for a tool, and what it can do:', 'kubectl create token web-sa --duration=10m | cut -c1-40\nkubectl auth can-i --list --as=system:serviceaccount:default:web-sa | head -5']
        ],
        verify: '`notoken` has no token directory; `override` does, because the Pod setting wins.',
        cleanup: 'kubectl delete pod withtoken notoken override --now; kubectl delete sa web-sa'
      }],
      refs: [
        ['Service Accounts', 'https://kubernetes.io/docs/concepts/security/service-accounts/'],
        ['Configure Service Accounts for Pods', 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/'],
        ['Managing Service Accounts', 'https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/']
      ],
      quiz: [
        { q: "How do you stop a Pod from getting a ServiceAccount token?",
          o: ["Set `automountServiceAccountToken: false` on the Pod or its ServiceAccount", "Delete the namespace's default ServiceAccount", "Set `serviceAccountName: none`", "Add a NetworkPolicy"],
          why: "Without automounting, no token is placed in the container." },
        { q: "The Pod sets `automountServiceAccountToken: true` and its ServiceAccount sets `false`. Is the token mounted?",
          o: ["Yes; the Pod setting wins", "No; the ServiceAccount setting wins", "Only for init containers", "The Pod is rejected"],
          why: "The Pod spec takes precedence over the ServiceAccount's default." },
        { q: "Where is the token mounted by default?",
          o: ["/var/run/secrets/kubernetes.io/serviceaccount/token", "/etc/kubernetes/token", "/root/.kube/config", "/var/lib/kubelet/token"],
          why: "Next to it are `ca.crt` and `namespace`. Client libraries look there automatically." },
        { q: "Which is true of ServiceAccount tokens on Kubernetes 1.24+?",
          o: ["They are short-lived projected tokens, refreshed by the kubelet", "They never expire", "A Secret holding a token is created for every SA", "Every Pod in a namespace shares one token"],
          why: "Projected tokens expire and are bound to the Pod, which limits the damage if one leaks." },
        { q: "An app only needs to read ConfigMaps. What is the best setup?",
          o: ["Its own ServiceAccount + a Role allowing get/list on configmaps + a RoleBinding", "Bind cluster-admin to the default ServiceAccount", "Give the default ServiceAccount the `edit` ClusterRole", "Store the admin kubeconfig in a Secret"],
          why: "A dedicated account with a minimal Role limits what a compromise can do." }
      ]
    },
    {
      id: 'ch-api',
      title: 'Restrict access to the Kubernetes API',
      basics: {
        summary: "Every request to the API server passes three gates: **who are you** (authentication), **may you do this** (authorization) and **is the object acceptable** (admission). Harden each gate, and keep the API server itself off the open internet.",
        ideas: [
          "**Authentication**: certificates, tokens or OIDC. Anonymous access should be off or harmless.",
          "**Authorization**: `--authorization-mode=Node,RBAC`, never `AlwaysAllow`.",
          "**Admission**: plugins like `NodeRestriction` and policy webhooks check objects.",
          "**Network**: firewall port 6443 and keep the `kubernetes` Service as ClusterIP."
        ]
      },
      points: [
        "Request flow: authentication → authorization → admission control (mutating, then validating) → stored in etcd.",
        "Authentication methods: X.509 client certs, ServiceAccount tokens, OIDC tokens, webhooks. Avoid static token files and basic auth.",
        "Anonymous requests come in as `system:anonymous` (group `system:unauthenticated`). Never bind roles to them. CIS recommends `--anonymous-auth=false`; if you set it, check that health probes still pass.",
        "Authorization: `--authorization-mode=Node,RBAC`. `AlwaysAllow` turns authorization off.",
        "Admission: enable `NodeRestriction`; add policy with ValidatingAdmissionPolicy, Pod Security Admission or webhooks (Kyverno, Gatekeeper).",
        "Network: don't expose 6443 to the internet; use firewall rules, cloud authorized networks or a private endpoint. The `kubernetes` Service in `default` must stay ClusterIP (an exam trap is changing it to NodePort).",
        "The old insecure HTTP port was removed (1.20+); `--insecure-port` flags are gone.",
        "Protect kubeconfigs: `admin.conf` is cluster-admin. Prefer per-user credentials that can be revoked."
      ],
      labs: [{
        title: 'Check what anonymous users and the network can reach',
        tags: ['kubeadm VMs'],
        goal: 'Run on the control-plane node.',
        steps: [
          ['Inspect the API server\'s security flags:', "sudo grep -E 'authorization-mode|anonymous-auth|enable-admission-plugins|insecure' /etc/kubernetes/manifests/kube-apiserver.yaml"],
          ['Try an anonymous request:', `curl -sk https://localhost:6443/api/v1/namespaces | head -5     # expect 403 for system:anonymous
curl -sk https://localhost:6443/version | head -3                # often allowed (public info)`],
          ['Look for anything granted to anonymous users:', "kubectl get clusterrolebindings,rolebindings -A -o wide | grep -E 'system:anonymous|system:unauthenticated'"],
          ['Exam trap: the API exposed through a NodePort. Simulate it, then fix it:', `kubectl patch svc kubernetes -p '{"spec":{"type":"NodePort"}}'
kubectl get svc kubernetes
kubectl patch svc kubernetes -p '{"spec":{"type":"ClusterIP"}}'
kubectl get svc kubernetes`]
        ],
        verify: 'Anonymous listing is `Forbidden`, nothing is bound to `system:anonymous`, and the `kubernetes` Service is back to ClusterIP.'
      }],
      refs: [
        ['Controlling Access to the Kubernetes API', 'https://kubernetes.io/docs/concepts/security/controlling-access/'],
        ['Authenticating', 'https://kubernetes.io/docs/reference/access-authn-authz/authentication/'],
        ['Admission Controllers', 'https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/'],
        ['kube-apiserver flags', 'https://kubernetes.io/docs/reference/command-line-tools-reference/kube-apiserver/']
      ],
      quiz: [
        { q: "In what order does the API server process a request?",
          o: ["Authentication → authorization → admission control", "Admission → authentication → authorization", "Authorization → authentication → admission", "Only RBAC is checked"],
          why: "First it identifies the caller, then checks permissions, then validates or mutates the object." },
        { q: "Someone changed the `kubernetes` Service in `default` to NodePort. Why is that a problem?",
          o: ["It exposes the API server on every node's IP", "Pods lose DNS", "etcd stops", "Nothing; NodePort is the default"],
          why: "The API becomes reachable from anywhere that can reach a node, outside your intended network controls." },
        { q: "Which `--authorization-mode` value is recommended?",
          o: ["Node,RBAC", "AlwaysAllow", "ABAC", "AlwaysDeny"],
          why: "The Node authorizer limits kubelets; RBAC handles everyone else." },
        { q: "An anonymous `curl -k https://<api>:6443/api/v1/secrets` returns data. What is misconfigured?",
          o: ["Anonymous access is allowed and RBAC grants rights to system:anonymous or system:unauthenticated", "TLS is disabled", "No admission plugins are enabled", "etcd isn't encrypted"],
          why: "Remove the binding that gives anonymous users access (and consider disabling anonymous auth)." },
        { q: "Which admission plugin stops a kubelet from labelling other nodes?",
          o: ["NodeRestriction", "AlwaysPullImages", "LimitRanger", "NamespaceLifecycle"],
          why: "NodeRestriction limits each kubelet to its own Node and Pods." }
      ]
    },
    {
      id: 'ch-upgrade',
      title: 'Upgrade Kubernetes to avoid vulnerabilities',
      basics: {
        summary: "Old Kubernetes versions stop receiving security fixes. Staying on a **supported version** and applying **patch releases** quickly is one of the simplest ways to stay safe.",
        ideas: [
          "Only the **three newest minor versions** get patches.",
          "**Patch releases** (x.y.**Z**) carry security fixes, so apply them soon.",
          "Upgrade **one minor version at a time**: control plane first, then nodes.",
          "Watch the official **CVE feed** and security announcements."
        ]
      },
      points: [
        "Kubernetes maintains release branches for the three most recent minor versions (about 14 months of patches each).",
        "Patch releases include CVE fixes. Read the changelog and the security announcements list.",
        "The official CVE feed lists known vulnerabilities and fixed versions.",
        "Version skew: the kubelet may be up to three minor versions older than the API server, but never newer.",
        "kubeadm upgrade order: upgrade the kubeadm package → `kubeadm upgrade plan` → `kubeadm upgrade apply v1.X.Y` → drain → upgrade kubelet/kubectl → `systemctl daemon-reload && systemctl restart kubelet` → uncordon. Workers use `kubeadm upgrade node`.",
        "Also upgrade add-ons (CNI, CoreDNS, ingress controller, metrics-server) and rebuild workload images with patched bases.",
        "Check versions: `kubectl get nodes` (VERSION column), `kubeadm version`, `kubectl version`.",
        "Exam pattern: upgrade a node to match the control plane, e.g. bring a worker from 1.32.x to the control plane's 1.33.x."
      ],
      labs: [{
        title: 'Bring a lagging worker up to the control plane version',
        tags: ['kubeadm VMs'],
        goal: 'Same procedure as the CKA upgrade lab. Replace the versions with yours.',
        steps: [
          ['Find the gap:', 'kubectl get nodes\nkubectl version | grep Server'],
          ['Drain the worker (from the control plane):', 'kubectl drain worker --ignore-daemonsets --delete-emptydir-data'],
          ['On the worker: point apt at the target minor, then upgrade kubeadm and the node:', `sudo sed -i 's#/v1.32/#/v1.33/#' /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-mark unhold kubeadm kubelet kubectl
sudo apt-get install -y kubeadm='1.33.*'
sudo kubeadm upgrade node
sudo apt-get install -y kubelet='1.33.*' kubectl='1.33.*'
sudo apt-mark hold kubeadm kubelet kubectl
sudo systemctl daemon-reload && sudo systemctl restart kubelet`],
          ['Back on the control plane:', 'kubectl uncordon worker\nkubectl get nodes']
        ],
        verify: 'Both nodes show the same VERSION and are `Ready`.'
      }],
      refs: [
        ['Upgrading kubeadm clusters', 'https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/'],
        ['Releases & support period', 'https://kubernetes.io/releases/'],
        ['Version skew policy', 'https://kubernetes.io/releases/version-skew-policy/'],
        ['Official CVE feed', 'https://kubernetes.io/docs/reference/issues-security/official-cve-feed/'],
        ['Kubernetes security and disclosure information', 'https://kubernetes.io/docs/reference/issues-security/security/']
      ],
      quiz: [
        { q: "How many minor versions of Kubernetes receive patches at a time?",
          o: ["The three most recent", "Only the latest", "All since 1.0", "Five"],
          why: "Older minors stop getting fixes, including security fixes." },
        { q: "Why apply patch releases (e.g. 1.33.1 → 1.33.4) quickly?",
          o: ["They contain security and bug fixes", "They add new APIs", "kubectl requires them", "They reset etcd"],
          why: "Patch releases don't add features; they fix bugs and vulnerabilities." },
        { q: "Which component must never be newer than the API server?",
          o: ["kubelet", "kubectl", "containerd", "CoreDNS"],
          why: "The kubelet may lag the API server by up to three minors, but it must never lead." },
        { q: "On a worker node, after installing the new kubeadm, which command upgrades the node's configuration?",
          o: ["`kubeadm upgrade node`", "`kubeadm upgrade apply`", "`kubeadm init`", "`kubectl upgrade`"],
          why: "`apply` is only for the first control-plane node." },
        { q: "Where do you check for known Kubernetes CVEs?",
          o: ["The official CVE feed on kubernetes.io", "`kubectl get cve`", "The kubelet logs", "`kubeadm certs check-expiration`"],
          why: "The feed lists every published Kubernetes CVE with a link to its details." }
      ]
    }
  ]
});
