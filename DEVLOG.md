# DEVLOG — Full GitOps Pipeline + DeployBoard

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

---

## Step 2 — Terraform (Infrastructure Provisioning)

**What:** Wrote Terraform configuration to provision 3 EC2 instances on AWS.

**First principles — what is Terraform?**
Normally to create a server on AWS you log into a console and click through
15 screens. If you need 3 servers you do it 3 times. If something breaks you
have no record of what you clicked. Terraform lets you describe what you want
in a file, and it builds it. Run it again after a change — it only modifies
what actually changed. This is called Infrastructure as Code (IaC).

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

---

## Step 3 — kubeadm (Kubernetes Cluster Bootstrap)

**What:** Turned 3 bare Ubuntu servers into a working Kubernetes cluster.

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

**What was built:**
- Backend Dockerfile: node:18-alpine, exposes port 5000
- Frontend Dockerfile: multi-stage — node:18-alpine builds React via Vite,
  nginx:alpine serves the static output. Final image has no Node.js at all.
- Two ECR repos created: `gitops-backend`, `gitops-frontend`

**Why multi-stage for frontend:**
Stage 1 compiles React into static HTML/CSS/JS.
Stage 2 is just nginx serving those files.
The final image is ~25MB instead of ~400MB.

---

## Step 5 — GitHub Actions (CI Pipeline)

**What:** Automated the entire build on every push to main.

**What the pipeline does on every push:**
1. Checks if `infra/` files changed — if yes, runs Terraform apply
2. Builds Docker image for backend, tags with commit SHA, pushes to ECR
3. Builds Docker image for frontend, tags with commit SHA, pushes to ECR
4. Updates `k8s/backend/deployment.yaml` and `k8s/frontend/deployment.yaml`
   with the new image URI + SHA
5. Commits the updated manifests back to Git
6. Logs the deployment to DeployBoard via POST /deployments

**Why commit SHA as the image tag:**
Every image is traceable to an exact commit.
If something breaks in production, you know exactly which commit caused it.
`:latest` tags are dangerous — you never know what version is actually running.

---

## Step 6 — Kubernetes Manifests

**What:** Wrote the YAML files that describe how the app runs in K8s.

**What was created:**
- `k8s/backend/deployment.yaml` — 2 replicas, ECR image, MONGO_URI env var
- `k8s/backend/service.yaml` — NodePort 30001
- `k8s/frontend/deployment.yaml` — 2 replicas, ECR image
- `k8s/frontend/service.yaml` — NodePort 30002
- `k8s/mongo/statefulset.yaml` — 1 replica, hostPath at /data/mongo
- `k8s/mongo/service.yaml` — headless service (clusterIP: None)

---

## Step 7 — ArgoCD (GitOps CD)

**What:** Installed ArgoCD and connected it to the repo so it auto-deploys
any manifest change.

**What was done:**
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "NodePort"}}'
```

ArgoCD Application config:
```yaml
source:
  repoURL: https://github.com/sarva0-0/GitOps
  path: k8s
  directory:
    recurse: true
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

---

## Step 8 — Prometheus + Grafana (Monitoring)

**What:** Deployed monitoring stack via Helm.

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
  --set grafana.adminPassword=admin123
```

---

## Step 9 — DeployBoard App

**What:** Replaced the placeholder status board with DeployBoard — a real-time
deployment tracking dashboard that makes the GitOps pipeline observable.

**Backend (Express + MongoDB):**
- `POST /deployments` — called by CI pipeline after every deploy
- `GET /deployments` — paginated list with filters (service, env, status)
- `GET /deployments/stats` — aggregate stats: today's count, success rate, avg duration
- `GET /services` — distinct service names
- `DELETE /deployments` — clear all (demo reset)

**Frontend (React + Vite):**
- Stat cards — deploys today, success rate, avg build time, busiest service, all-time
- 7-day activity bar chart — green = all passed, red = any failed
- Success rate SVG ring — visual pass/fail ratio
- Environment breakdown — progress bars for prod/staging/dev
- Deployment feed — every deploy with full details, filtered and sortable
- Auto-refreshes every 8 seconds

**Pipeline integration — one curl at the end of ci.yml:**
```bash
curl -s -X POST http://54.84.239.147:30001/deployments \
  -H "Content-Type: application/json" \
  -d '{"service":"GitOps","environment":"production","sha":"$SHA",...}'
```

**Why this app fits the pipeline perfectly:**
The pipeline does deployments. DeployBoard records and visualises them.
It's the observability layer that makes everything that just happened visible.
Every push to main produces a new entry in the dashboard — the pipeline
demonstrates itself through the app it deploys.

---

## Step 10 — End-to-End Verify

**Change made:** Updated App.jsx with full DeployBoard UI

**What happened:**
1. Pushed to main → GitHub Actions triggered
2. New Docker images built and pushed to ECR with commit SHA
3. k8s manifests updated with new image tag
4. ArgoCD detected change, synced to cluster
5. Rolling restart — old pods terminated, new ones came up
6. Deployment automatically logged to DeployBoard
7. Dashboard showed new deploy in real time

**GitOps loop confirmed end to end.**

---

## Incidents Log

---

### Incident 1 — Terraform firing on every push

**Problem:** CI pipeline was running `terraform apply` on every push.

**Fix:** Added a `git diff` check:
```bash
git diff --name-only HEAD~1 HEAD | grep '^infra/' && \
  echo "changed=true" >> $GITHUB_OUTPUT || \
  echo "changed=false" >> $GITHUB_OUTPUT
```

**Lesson:** Treat infra changes and app changes differently in CI.

---

### Incident 2 — GitHub Actions 403 on git push

**Problem:** Pipeline failed when trying to commit manifests back.
Error: `remote: Permission to sarva0-0/GitOps.git denied`

**Fix:**
1. Repo Settings → Actions → Workflow permissions → Read and write
2. Add to ci.yml:
```yaml
permissions:
  contents: write
steps:
  - uses: actions/checkout@v4
    with:
      token: ${{ secrets.GITHUB_TOKEN }}
```

**Lesson:** GitHub's write access is opt-in in two places — both must be set.

---

### Incident 3 — ArgoCD Synced + Healthy but zero pods

**Problem:** ArgoCD showed Synced and Healthy but no pods existed.

**Fix:** Add `directory.recurse: true` to the Application spec.

**Lesson:** ArgoCD doesn't recurse subdirectories by default. Opt in explicitly.

---

### Incident 4 — MongoDB stuck Pending forever

**Problem:** `mongo-0` pod stayed Pending — PVC could not be bound.

**Fix:** Replaced PVC with hostPath volume:
```yaml
volumes:
  - name: mongo-storage
    hostPath:
      path: /data/mongo
      type: DirectoryOrCreate
```

**Lesson:** Bare kubeadm has no storage provisioner. Use hostPath for dev.

---

### Incident 5 — ImagePullBackOff on worker nodes

**Problem:** Pods stuck pulling images from ECR.

**Root causes:**
- containerd doesn't use IAM roles automatically — needs explicit credentials
- ECR tokens expire every 12 hours
- AWS CLI wasn't installed on master

**Fix:** On every node:
```bash
TOKEN=$(aws ecr get-login-password --region us-east-1)
sudo sed -i "s|password = \".*\"|password = \"$TOKEN\"|" /etc/containerd/config.toml
sudo systemctl restart containerd
```

**Lesson:** IAM roles control EC2 access. containerd is separate and needs
its own credentials. In production, use amazon-ecr-credential-helper.

---

### Incident 6 — Disk pressure causing pod evictions

**Problem:** Pods getting evicted across all nodes.

**Fix:** Resized EBS from 8GB to 20GB and expanded partition:
```bash
sudo growpart /dev/xvda 1
sudo resize2fs /dev/xvda1
```

**Lesson:** Default 8GB EBS is not enough for a full K8s stack with monitoring.
Always provision at least 20GB.

---

### Incident 7 — sed pattern not updating image tags after first run

**Problem:** Pipeline ran green but pods kept running old image.

**Fix:** Changed sed pattern to match full ECR URI with wildcard:
```bash
sed -i "s|image: 740186512853.dkr.ecr.us-east-1.amazonaws.com/gitops-frontend:.*|image: <new>|g"
```

**Lesson:** Test your pipeline with a second push, not just the first.

---

### Incident 8 — ArgoCD repo-server crashed, sync stopped

**Problem:** ArgoCD showed `Unknown` sync status.
Error: `dial tcp 10.105.176.88:8081: connect: connection refused`

**Root cause:** ArgoCD repo-server pod crashed after cluster instability.

**Fix:**
```bash
kubectl rollout restart deployment argocd-repo-server -n argocd
```

**Lesson:** ArgoCD components can crash independently. repo-server is the
one that fetches and renders manifests — without it nothing syncs.

---

### Incident 9 — Blank screen despite backend working

**Problem:** Frontend served 200 OK but showed a black screen with no UI.

**Root causes (three separate issues):**
1. Old placeholder `App.jsx` was in the repo — the new full UI code was never committed
2. Google Fonts CDN was blocked on the school network — fonts never loaded,
   text rendered invisible (dark on dark)
3. `VITE_API_URL` build arg was named `REACT_APP_API_URL` in ci.yml —
   wrong name for Vite, so the API URL defaulted to localhost

**Fix:**
1. Replaced App.jsx with full DeployBoard UI
2. Switched font CDN from Google to Bunny Fonts (network-unrestricted mirror)
3. Hardcoded API URL directly in App.jsx as fallback
4. Fixed build arg name in ci.yml to `VITE_API_URL`

**Lesson:** Vite and Create React App use different env variable prefixes.
`REACT_APP_` is CRA. `VITE_` is Vite. Using the wrong one silently produces
no error — the variable just evaluates to undefined.

---

### Incident 10 — New image built but old pods still serving old JS

**Problem:** Pipeline ran green, new image in ECR, but browser still showed old UI.

**Root cause:** ArgoCD had not synced — it detected the manifest change but
the pod rollout used the old image because `kubectl rollout restart` restarts
pods with the current spec, not the new one if ArgoCD hasn't applied it yet.

**Fix:** Forced image directly:
```bash
kubectl set image deployment/frontend \
  frontend=740186512853.dkr.ecr.us-east-1.amazonaws.com/gitops-frontend:<new-sha> \
  -n default
```

**Lesson:** `kubectl rollout restart` restarts pods with whatever image is in
the current deployment spec. If ArgoCD hasn't applied the new spec yet,
restart does nothing useful. Force the image directly or wait for ArgoCD to sync.

---

## Final State

```
Cluster:    3 nodes healthy (master + 2 workers)
App pods:   5/5 Running (2 backend, 2 frontend, 1 mongo)
Monitoring: Running (Prometheus, Grafana, Alertmanager)
ArgoCD:     Synced + Healthy
Pipeline:   Green on every push to main
App:        http://54.84.239.147:30002 — DeployBoard live
API:        http://54.84.239.147:30001/deployments/stats — live data
```

**Project complete.**
