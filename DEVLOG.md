# DEVLOG — Full GitOps Pipeline

This file documents every step of the build in order —
what was done, why, what broke, and what we learned.
Written so anyone can read it cold and understand exactly what happened.

---

## What is a DEVLOG?

A devlog is a running diary of a project. Not the polished version — the real version.
Every decision, every mistake, every fix. If you're reading this to learn,
the incidents section is the most valuable part.

---

## Step 1 — Repository Setup

**What:** Created the GitHub monorepo and scaffolded the folder structure.

**Why this comes first:**
In GitOps, Git is not just where code lives — it is the control plane for the
entire system. ArgoCD watches Git. GitHub Actions triggers from Git. Terraform
configs live in Git. If it is not in Git, it does not exist in this pipeline.
So before any infrastructure, before any code — the repo structure comes first.

**What we created:**
- `backend/` — Express API source code
- `frontend/` — React frontend source code
- `infra/` — Terraform configuration (provisions AWS infra)
- `k8s/` — Kubernetes manifests (ArgoCD watches this folder)
- `.github/workflows/` — GitHub Actions pipeline YAML files
- `monitoring/` — Prometheus + Grafana configuration

**Commands:**
```bash
git clone https://github.com/sarva0-0/GitOps.git
cd GitOps
mkdir -p backend frontend infra k8s/backend k8s/frontend k8s/mongo \
  .github/workflows monitoring
touch backend/.gitkeep frontend/.gitkeep infra/.gitkeep \
  k8s/backend/.gitkeep k8s/frontend/.gitkeep k8s/mongo/.gitkeep \
  .github/workflows/.gitkeep monitoring/.gitkeep
git add . && git commit -m "init: project structure" && git push origin main
```

---

## Step 2 — Terraform (Infrastructure Provisioning)

**What:** Wrote Terraform configuration to provision 3 EC2 instances on AWS.

**First principles — what is Terraform?**
Normally to create a server on AWS you log into a console and click through
15 screens. If you need 3 servers you do it 3 times. If something breaks you
have no record of what you clicked. Terraform lets you describe what you want
in a file, and it builds it. Run it again after a change — it only modifies
what actually changed. This is called Infrastructure as Code (IaC).

**Key concepts:**
- **Provider** — the plugin connecting Terraform to AWS
- **Resource** — a thing to create (EC2 instance, VPC, security group)
- **Variables** — avoid hardcoding values like region or instance type
- **Outputs** — values printed after apply (e.g. public IPs of your nodes)
- **State file** — Terraform's memory of what it has built. Stored in S3.

**What was provisioned:**
- VPC `10.0.0.0/16` with DNS hostnames enabled
- Public subnet `10.0.1.0/24` in `us-east-1a`
- Internet Gateway + Route Table attached to subnet
- Security Group: ports 22 (SSH), 6443 (K8s API), 30000–32767 (NodePort),
  all internal VPC traffic
- 1 master node + 2 worker nodes — Ubuntu 22.04, m7i-flex.large
- Terraform state stored in S3: `gitops-terraform-state-740186512853`

**Why m7i-flex.large:**
kubeadm requires minimum 2 vCPU and 2GB RAM per node.
t3.micro (1 vCPU, 1GB) fails outright. t3.medium works but is tight.
m7i-flex.large (2 vCPU, 8GB) gives comfortable headroom for the full stack.

**Commands:**
```bash
cd infra/
terraform init
terraform plan -var="key_name=gitops-key"
terraform apply -var="key_name=gitops-key"
```

---

## Step 3 — kubeadm (Kubernetes Cluster Bootstrap)

**What:** Turned 3 bare Ubuntu servers into a working Kubernetes cluster.

**First principles — what is Kubernetes?**
You have 3 servers and you want to run your app across them.
Kubernetes is the system that decides which server runs what, restarts
things when they crash, and lets containers talk to each other.
kubeadm is the tool that sets Kubernetes up on raw servers.

**Key concepts:**
- **Control plane (master)** — the brain. Manages scheduling and state.
  You never run your app here.
- **Worker nodes** — where your actual app containers run
- **CNI** — a network plugin that lets pods talk across nodes. We use Flannel.
- **kubeconfig** — credentials file that lets kubectl talk to your cluster

**What was done on all 3 nodes:**
- Disabled swap (K8s requirement)
- Loaded kernel modules: overlay, br_netfilter
- Installed and configured containerd as container runtime
  (SystemdCgroup = true is critical — without this kubelet won't start)
- Installed kubeadm, kubelet, kubectl v1.29 and held versions

**What was done on master only:**
- `kubeadm init --pod-network-cidr=10.244.0.0/16`
- Configured kubectl (`~/.kube/config`)
- Applied Flannel CNI
- Saved the `kubeadm join` command for workers

**What was done on both workers:**
- Ran the `kubeadm join` command from master output

**Verification:**
```bash
kubectl get nodes
# NAME             STATUS   ROLES           VERSION
# k8s-master       Ready    control-plane   v1.29.x
# k8s-worker-1     Ready    <none>          v1.29.x
# k8s-worker-2     Ready    <none>          v1.29.x
```

---

## Step 4 — Docker + ECR

**What:** Containerised the app and pushed images to AWS ECR.

**First principles — what is Docker?**
Your app runs fine on your laptop. But on a fresh server it might break
because of different OS versions, missing libraries, wrong Node version.
A Docker image bundles your app with everything it needs to run — OS layer,
runtime, dependencies. Same image runs identically everywhere.

**First principles — what is ECR?**
Docker Hub is a public image store. ECR is AWS's private version.
Your K8s nodes (which are on AWS) can pull from ECR without extra auth setup
once IAM roles are configured.

**What was built:**
- Backend Dockerfile: node:18-alpine, exposes port 5000
- Frontend Dockerfile: multi-stage build — node:18-alpine compiles React,
  nginx:alpine serves the static output. Final image has no Node.js at all.
- Two ECR repos created: `gitops-backend`, `gitops-frontend`
- Images tagged `:latest` and pushed manually to verify

**Why multi-stage for frontend:**
Stage 1 compiles React into static HTML/CSS/JS.
Stage 2 is just nginx serving those files.
The final image is ~25MB instead of ~400MB.

---

## Step 5 — GitHub Actions (CI Pipeline)

**What:** Automated the entire build on every push to main.

**First principles — what is CI?**
CI means every time code is pushed, a machine automatically builds it,
tests it, and prepares it for deployment. No human manually runs build commands.
GitHub Actions is GitHub's built-in CI system. Your workflow YAML lives in
`.github/workflows/` and GitHub reads it automatically.

**What the pipeline does on every push:**
1. Checks if `infra/` files changed — if yes, runs Terraform apply
2. Builds Docker image for backend, tags with commit SHA, pushes to ECR
3. Builds Docker image for frontend, tags with commit SHA, pushes to ECR
4. Updates `k8s/backend/deployment.yaml` and `k8s/frontend/deployment.yaml`
   with the new image URI + SHA
5. Commits the updated manifests back to Git
6. That commit is what ArgoCD will detect and sync

**Why commit SHA as the image tag:**
Every image is traceable to an exact commit.
If something breaks in production, you know exactly which commit caused it.
`:latest` tags are dangerous — you never know what version is actually running.

**Key fix applied:**
The `sed` command that updates image tags must match the full ECR URI pattern,
not just a placeholder. Once the placeholder is replaced once, it never appears
again — so the pattern must match the existing URI on every subsequent push:
```bash
sed -i "s|image: 740186512853.dkr.ecr.us-east-1.amazonaws.com/gitops-backend:.*|image: <new-uri>|g"
```

**Incidents fixed in this step:**
- GitHub Actions bot got 403 on git push — fixed with `contents: write`
  permission + `token: ${{ secrets.GITHUB_TOKEN }}` in checkout step

---

## Step 6 — Kubernetes Manifests

**What:** Wrote the YAML files that describe how the app runs in K8s.

**First principles — what are manifests?**
Kubernetes doesn't run containers directly. You give it a YAML file that says
"I want 2 copies of this container, always keep them running, expose them on
this port." Kubernetes makes it happen and keeps it that way.
If a container crashes — K8s restarts it. If a node dies — K8s moves the
container to another node. The manifest is the desired state declaration.

**Key concepts:**
- **Deployment** — run N copies of a container, keep them alive
- **Service** — stable network address in front of pods
  (pods are temporary and get new IPs on restart — Services stay fixed)
- **StatefulSet** — like Deployment but for databases. Pods get stable names.
- **NodePort** — exposes your app on a port on the node's public IP
- **hostPath** — mounts a folder from the node's disk into the container

**What was created:**
- `k8s/backend/deployment.yaml` — 2 replicas, ECR image, MONGO_URI env var
- `k8s/backend/service.yaml` — NodePort 30001
- `k8s/frontend/deployment.yaml` — 2 replicas, ECR image, API_URL env var
- `k8s/frontend/service.yaml` — NodePort 30002
- `k8s/mongo/statefulset.yaml` — 1 replica, hostPath at /data/mongo
- `k8s/mongo/service.yaml` — headless service (clusterIP: None)

**Why headless service for MongoDB:**
MongoDB doesn't need load balancing — there's one instance.
A headless service lets pods reach it directly via DNS: `mongo:27017`.

---

## Step 7 — ArgoCD (GitOps CD)

**What:** Installed ArgoCD and connected it to the repo so it auto-deploys
any manifest change.

**First principles — what is ArgoCD?**
ArgoCD runs inside your cluster and watches a folder in your Git repo.
Every few minutes it compares what's in Git against what's running in the cluster.
If they differ — it syncs. If someone manually changes something in the cluster
that doesn't match Git — it reverts it. Git always wins. This is GitOps.

**What was done:**
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "NodePort"}}'
```

ArgoCD Application pointing at this repo:
```yaml
source:
  repoURL: https://github.com/sarva0-0/GitOps
  path: k8s
  directory:
    recurse: true        # critical — without this ArgoCD ignores subdirectories
syncPolicy:
  automated:
    prune: true          # delete K8s resources removed from Git
    selfHeal: true       # revert manual cluster changes back to Git state
```

**ArgoCD UI:** http://54.84.239.147:32657 (admin / get password from secret)

---

## Step 8 — Prometheus + Grafana (Monitoring)

**What:** Deployed monitoring stack via Helm.

**First principles — what is Prometheus?**
Every component in K8s exposes a `/metrics` endpoint with numbers about
itself — CPU used, requests per second, errors. Prometheus hits all these
endpoints every 15 seconds and stores the data.

**What is Grafana?**
Grafana connects to Prometheus and draws those numbers as graphs on dashboards.
You get a visual overview of everything happening in the cluster.

**What is Helm?**
Helm is a package manager for Kubernetes. Like apt for Ubuntu but for K8s apps.
`kube-prometheus-stack` is a Helm chart that installs Prometheus + Grafana +
all the K8s-specific exporters in one command.

**Commands:**
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
kubectl create namespace monitoring
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.service.type=NodePort \
  --set prometheus.service.nodePort=30090 \
  --set grafana.service.type=NodePort \
  --set grafana.service.nodePort=30030 \
  --set grafana.adminPassword=admin123 \
  [... resource limit flags to fit on nodes]
```

**Dashboards:**
- Prometheus: http://54.84.239.147:30090 → Status → Targets
- Grafana: http://54.84.239.147:30030 → Dashboards → K8s Compute Resources

---

## Step 9 — End-to-End Verify

**What:** Proved the full GitOps loop works by pushing a real code change
and watching it flow all the way to production automatically.

**Change made:** Added `/version` endpoint to `backend/server.js`

**What happened:**
1. Pushed to main → GitHub Actions triggered
2. New Docker image built, tagged `807632779844c6744f3f5c093c4bd0c03ffd3208`
3. Image pushed to ECR
4. `k8s/backend/deployment.yaml` updated with new image tag
5. That commit pushed back to repo by Actions bot
6. ArgoCD detected manifest change, synced to cluster
7. Rolling restart — old backend pods terminated, new ones came up
8. Verified live:
```bash
curl http://54.84.239.147:30001/version
# {"version":"v2","status":"live"}
```

**GitOps loop confirmed end to end.**

---

## Incidents Log

These are the real problems hit during the build.
This is the most valuable section — understanding why things broke
teaches more than understanding why things worked.

---

### Incident 1 — Terraform firing on every push

**Problem:** CI pipeline was running `terraform apply` on every push,
causing failures and email spam.

**Root cause:** `terraform apply` was inside the main CI job with no condition.
Every push triggered a full infra apply even when only app code changed.

**Fix:** Added a `git diff` check — Terraform only runs if files inside
`infra/` actually changed:
```bash
git diff --name-only HEAD~1 HEAD | grep '^infra/' && \
  echo "changed=true" >> $GITHUB_OUTPUT || \
  echo "changed=false" >> $GITHUB_OUTPUT
```
Each Terraform step got `if: steps.infra_check.outputs.changed == 'true'`

**Lesson:** CI/CD doesn't mean "run everything on every push blindly."
Infra changes are rare, app changes are frequent. Treat them differently.

---

### Incident 2 — GitHub Actions 403 on git push

**Problem:** Pipeline built and pushed images fine but failed when trying
to commit the updated manifests back to the repo.
Error: `remote: Permission to sarva0-0/GitOps.git denied to github-actions[bot]`

**Root cause:** GitHub Actions bot has read-only access by default.
Write access must be explicitly granted in two places.

**Fix:**
1. Repo Settings → Actions → General → Workflow permissions → Read and write
2. Add to the job in ci.yml:
```yaml
permissions:
  contents: write
steps:
  - uses: actions/checkout@v4
    with:
      token: ${{ secrets.GITHUB_TOKEN }}
```

**Lesson:** GitHub's security model is opt-in for write access.
Both the repo setting AND the workflow YAML need to be set — one alone is not enough.

---

### Incident 3 — ArgoCD Synced + Healthy but zero pods

**Problem:** ArgoCD showed `Synced` and `Healthy` but `kubectl get pods -n default`
returned nothing.

**Root cause:** ArgoCD by default only reads manifests at the root of the path
you give it. Our manifests were in subdirectories (`k8s/backend/`, `k8s/frontend/`).
ArgoCD found nothing at the root of `k8s/`, reported success, created nothing.

**Fix:** Add `directory.recurse: true` to the Application spec:
```yaml
source:
  path: k8s
  directory:
    recurse: true
```

**Lesson:** ArgoCD not recursing is intentional — it lets monorepos have
multiple apps in different folders without them interfering. You opt into
recursion explicitly.

---

### Incident 4 — MongoDB stuck Pending forever

**Problem:** `mongo-0` pod stayed in `Pending` status indefinitely.
`kubectl describe pod mongo-0` showed it could not bind a PersistentVolumeClaim.

**Root cause:** A PVC is a request for storage. On managed Kubernetes (EKS, GKE)
there is a cloud storage provisioner that fulfils PVC requests automatically.
On bare kubeadm there is no provisioner — the PVC sits in `Pending` forever
with nothing to fulfil it.

**Fix:** Replaced the PVC with a `hostPath` volume — mounts a directory
directly from the node's disk:
```yaml
volumes:
  - name: mongo-storage
    hostPath:
      path: /data/mongo
      type: DirectoryOrCreate
```

**Lesson:** Managed K8s and bare kubeadm behave differently for storage.
hostPath is fine for dev/learning. In production you would use a proper
storage class (EBS CSI driver on AWS).

---

### Incident 5 — ImagePullBackOff on worker nodes

**Problem:** Pods stuck in `ImagePullBackOff`. K8s could not pull images from ECR.

**Root cause (part 1):** IAM instance profile was attached to worker nodes but
containerd (the container runtime) doesn't use IAM roles automatically.
It needs explicit credentials configured in `/etc/containerd/config.toml`.

**Root cause (part 2):** AWS ECR tokens expire every 12 hours.
After the cluster was left running overnight, all nodes needed token refresh.

**Root cause (part 3):** AWS CLI was not installed on the master node,
so it could never generate a fresh ECR token. Workers had it, master didn't.

**Fix:** On every node that needs to pull from ECR:
```bash
sudo apt-get install -y awscli
TOKEN=$(aws ecr get-login-password --region us-east-1)
# Write token to containerd config using single-quote heredoc to prevent
# shell expansion, then sed-replace the placeholder safely
sudo tee /etc/containerd/config.toml > /dev/null <<'EOF'
...
        password = "REPLACE_TOKEN"
EOF
sudo sed -i "s|REPLACE_TOKEN|$TOKEN|g" /etc/containerd/config.toml
sudo systemctl restart containerd
```

**Why single-quote heredoc:** ECR tokens contain special characters.
Double-quote heredoc (`<<EOF`) expands variables inside — if `$TOKEN` contains
special chars it corrupts the file. Single-quote heredoc (`<<'EOF'`) is literal.

**Lesson:** IAM roles control what the EC2 *instance* can do.
containerd is a separate process that doesn't inherit IAM automatically.
In production this is solved with `amazon-ecr-credential-helper` running
as a DaemonSet that auto-refreshes tokens cluster-wide.

---

### Incident 6 — Disk pressure causing pod evictions

**Problem:** Pods getting evicted across all nodes. Monitoring pods especially
kept getting evicted in a loop — Grafana alone had 15+ evicted copies.

**Root cause:** Default EC2 EBS volume is 8GB. After pulling multiple large
Docker images (Node.js, nginx, MongoDB, Prometheus, Grafana, ArgoCD components)
the disks hit ~74% usage. K8s evicts pods when disk usage crosses ~85%.

**Fix:** Resized all 3 EBS volumes from 8GB to 20GB via AWS console,
then expanded the partition on each node:
```bash
sudo growpart /dev/xvda 1
sudo resize2fs /dev/xvda1
```

**Lesson:** Default EBS size is not enough for a full K8s stack with monitoring.
Always provision at least 20GB for nodes running multiple workloads.
Disk pressure is harder to debug than memory pressure because pods evict
silently without obvious error messages.

---

### Incident 7 — sed pattern not updating image tags after first run

**Problem:** Pipeline ran green, showed it updated the manifest, but pods
kept running the old image. The `deployment.yaml` still showed the old SHA.

**Root cause:** The original sed command replaced `IMAGE_TAG_BACKEND` with
a real ECR URI. That worked once. On subsequent runs, `IMAGE_TAG_BACKEND`
no longer existed in the file — it had been replaced. So sed found nothing
to replace and silently did nothing. The manifest stayed on the old SHA.

**Fix:** Changed the sed pattern to match the full ECR URI with a wildcard
for the tag portion:
```bash
sed -i "s|image: 740186512853.dkr.ecr.us-east-1.amazonaws.com/gitops-backend:.*|image: <new-uri>|g"
```
The `.*` matches any existing tag — so every push updates the tag correctly
regardless of what the current tag is.

**Lesson:** Sed replacements that only work once are a silent failure mode.
Always test your pipeline end-to-end with a second push, not just the first.

---

## Final State
```
Cluster:    3 nodes healthy (master + 2 workers)
App pods:   5/5 Running (2 backend, 2 frontend, 1 mongo)
Monitoring: 10/10 Running (Prometheus, Grafana, Alertmanager, exporters)
ArgoCD:     Synced + Healthy
Pipeline:   Green on every push to main
App:        http://54.84.239.147:30002 — live
API:        http://54.84.239.147:30001/version → {"version":"v2","status":"live"}
```

**Project complete.**
