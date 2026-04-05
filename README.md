# Project — Full GitOps Pipeline + DeployBoard

> A complete CI/CD pipeline where every change — from code to infrastructure —
> flows through Git automatically. No manual deployments. No clicking in consoles.
> Git is the single source of truth.
>
> The app deployed by this pipeline is **DeployBoard** — a real-time deployment
> tracking dashboard that logs every pipeline run, visualises deployment history,
> and shows live success rates across all services.

---

## What is GitOps?

Imagine you're building with LEGO. Instead of someone standing at the table making
changes by hand, you write down exactly what you want on a piece of paper. A robot
reads that paper and builds it. If something changes on the table that doesn't match
the paper, the robot fixes it back. That paper is Git. That robot is ArgoCD.

GitOps means: **the desired state of your system lives in Git. Always.**

---

## What This Project Does

A developer pushes code to GitHub. Without touching anything else:

1. GitHub Actions wakes up, builds Docker images of the backend and frontend
2. Tags them with the exact commit SHA (every deploy is traceable)
3. Pushes images to AWS ECR (private image registry)
4. Updates the Kubernetes manifest files with the new image tag
5. Commits that change back to Git
6. ArgoCD detects the manifest change, syncs it to the live cluster
7. New pods roll out, old ones shut down — zero downtime
8. The deploy is automatically logged to DeployBoard via a curl call in the pipeline
9. Prometheus records cluster metrics, Grafana shows them on a dashboard

Total human involvement after the push: **zero.**

---

## The App — DeployBoard

A real-time deployment intelligence dashboard. Every time the CI pipeline runs,
it logs a deployment record to the backend API. The frontend displays:

- **Live stats** — deploys today, success rate, average build time, busiest service
- **7-day activity chart** — deployment frequency per day, colour-coded by pass/fail
- **Success rate ring** — visual pass/fail ratio for the last 24 hours
- **Environment breakdown** — what proportion of deploys went to prod vs staging vs dev
- **Deployment feed** — every deploy with service name, environment badge, commit SHA,
  branch, commit message, status, duration, deployer avatar, and relative timestamp
- **Filters** — filter by environment, status, or service name

This is what gets deployed by the pipeline. The app itself is the observability
layer that makes the DevOps work visible.

---

## Live Endpoints

| Service       | URL                               |
|---------------|-----------------------------------|
| DeployBoard   | http://54.84.239.147:30002        |
| API           | http://54.84.239.147:30001        |
| ArgoCD UI     | http://54.84.239.147:32657        |
| Prometheus    | http://54.84.239.147:30090        |
| Grafana       | http://54.84.239.147:30030        |

---

## Architecture

```
Developer
    │
    ▼
GitHub (source of truth)
    │
    ├── infra/          ← Terraform reads this to provision AWS infra
    ├── k8s/            ← ArgoCD watches this to sync to the cluster
    ├── backend/        ← Express API source code
    ├── frontend/       ← React frontend source code
    └── .github/        ← GitHub Actions pipeline lives here
    │
    ▼
GitHub Actions (CI)
    │
    ├── Terraform: create/update EC2 instances if infra/ changed
    ├── Docker: build backend + frontend images
    ├── ECR: push images tagged with commit SHA
    ├── Git: update k8s/ manifests with new image tag, commit back
    └── DeployBoard: POST /deployments to log the pipeline run
    │
    ▼
ArgoCD (CD) — watching k8s/ in this repo
    │
    └── Syncs any manifest change to the K8s cluster automatically
    │
    ▼
Kubernetes Cluster (3 EC2 nodes on AWS)
    │
    ├── backend pods   (2 replicas) — Express API + MongoDB
    ├── frontend pods  (2 replicas) — React + nginx
    └── mongo pod      (1 replica, hostPath storage)
    │
    ▼
Prometheus + Grafana — watching cluster metrics
```

---

## Tech Stack

| Layer           | Tool                    | Why                                              |
|-----------------|-------------------------|--------------------------------------------------|
| Cloud           | AWS EC2 (us-east-1)     | Where the servers live                           |
| Infra as Code   | Terraform               | Provisions servers via code, not clicking        |
| Container Runtime | containerd            | Runs Docker images on the nodes                  |
| Orchestration   | Kubernetes (kubeadm)    | Manages containers across 3 nodes                |
| CI Pipeline     | GitHub Actions          | Automates build + deploy on every push           |
| Image Registry  | AWS ECR                 | Stores Docker images privately                   |
| CD / GitOps     | ArgoCD                  | Syncs Git state to cluster state                 |
| Monitoring      | Prometheus + Grafana    | Metrics collection and dashboards                |
| App Backend     | Node.js + Express       | REST API — 5 routes                              |
| App Frontend    | React + Vite            | Single page deployment dashboard                 |
| Database        | MongoDB                 | Stores deployment records                        |

---

## API Routes

| Method   | Route                  | Description                              |
|----------|------------------------|------------------------------------------|
| POST     | /deployments           | Log a new deployment (called by CI)      |
| GET      | /deployments           | List deployments with filters + pagination |
| GET      | /deployments/stats     | Summary stats — today, success rate, avg duration |
| GET      | /services              | List distinct service names              |
| DELETE   | /deployments           | Clear all records (demo reset)           |
| GET      | /health                | Health check                             |

---

## Repo Structure

```
GitOps/
├── backend/
│   ├── server.js             # All API routes
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/App.jsx           # Full DeployBoard UI
│   ├── src/main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile            # Multi-stage: Vite build → nginx serve
├── infra/
│   ├── main.tf               # VPC, subnet, security group, 3 EC2 instances
│   ├── variables.tf
│   └── outputs.tf
├── k8s/
│   ├── backend/
│   │   ├── deployment.yaml   # 2 replicas, ECR image (updated by CI)
│   │   └── service.yaml      # NodePort 30001
│   ├── frontend/
│   │   ├── deployment.yaml   # 2 replicas, ECR image (updated by CI)
│   │   └── service.yaml      # NodePort 30002
│   └── mongo/
│       ├── statefulset.yaml  # 1 replica, hostPath storage
│       └── service.yaml      # Headless service
├── monitoring/
│   └── prometheus-values.yaml
├── seed.sh                   # Populate DeployBoard with demo data
└── .github/
    └── workflows/
        ├── ci.yml            # Main pipeline — triggers on push to main
        └── infra.yml         # Terraform only — manual trigger
```

---

## How to Run the Pipeline

Push any change to `main`:
```bash
git add .
git commit -m "your change"
git push origin main
```

Watch it at: `github.com/sarva0-0/GitOps/actions`

The pipeline will build, push, update manifests, and log the deploy to DeployBoard automatically.

---

## Seed Demo Data

To populate DeployBoard with 7 days of realistic deployment history:
```bash
chmod +x seed.sh
./seed.sh http://54.84.239.147:30001
```

---

## Infrastructure Details

| Node         | Role                        | Public IP       |
|--------------|-----------------------------|-----------------|
| k8s-master   | Control plane + API server  | 54.84.239.147   |
| k8s-worker-1 | App workloads               | 35.173.5.220    |
| k8s-worker-2 | App workloads               | 52.3.71.57      |

Instance type: `m7i-flex.large` (2 vCPU, 8GB RAM)
Region: `us-east-1`
EBS volume: 20GB per node

**ECR token note:** The ECR auth token expires every 12 hours.
On cluster restart or token expiry, refresh it on all 3 nodes:
```bash
TOKEN=$(aws ecr get-login-password --region us-east-1)
sudo sed -i "s|password = \".*\"|password = \"$TOKEN\"|" /etc/containerd/config.toml
sudo systemctl restart containerd
```

---

## Contributors

| Name        | Contribution                                                              |
|-------------|---------------------------------------------------------------------------|
| Sarvagna    | GitOps pipeline — Terraform, kubeadm, GitHub Actions, ArgoCD, Prometheus |
| Chandradeep | Backend — Express API, MongoDB, Dockerfile                                |
| Sahithi     | Frontend — React UI, Vite, Dockerfile                                     |
