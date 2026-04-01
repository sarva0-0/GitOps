# Project — Full GitOps Pipeline

> A complete CI/CD pipeline where every change — from code to infrastructure —
> flows through Git automatically. No manual deployments. No clicking in consoles.
> Git is the single source of truth.

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

1. GitHub Actions wakes up, builds a Docker image of the app
2. Tags it with the exact commit ID (so every deploy is traceable)
3. Pushes it to AWS ECR (a private image store)
4. Updates the Kubernetes config file with the new image tag
5. Commits that change back to Git
6. ArgoCD notices the config changed, syncs it to the live cluster
7. New pods roll out, old ones shut down — zero downtime
8. Prometheus records the activity, Grafana shows it on a dashboard

Total human involvement after the push: zero.

---

## Live Endpoints

| Service | URL |
|---|---|
| Status Board App | http://54.84.239.147:30002 |
| API | http://54.84.239.147:30001 |
| ArgoCD UI | http://54.84.239.147:32657 |
| Prometheus | http://54.84.239.147:30090 |
| Grafana | http://54.84.239.147:30030 |

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
    └── Git: update k8s/ manifests with new image tag, commit back
    │
    ▼
ArgoCD (CD) — watching k8s/ in this repo
    │
    └── Syncs any manifest change to the K8s cluster automatically
    │
    ▼
Kubernetes Cluster (3 EC2 nodes on AWS)
    │
    ├── backend pods (2 replicas)
    ├── frontend pods (2 replicas)
    └── mongo pod (1 replica, hostPath storage)
    │
    ▼
Prometheus + Grafana — watching the cluster metrics
```

---

## Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Cloud | AWS EC2 (us-east-1) | Where the servers live |
| Infra as Code | Terraform | Provisions servers via code, not clicking |
| Container Runtime | containerd | Runs Docker images on the nodes |
| Orchestration | Kubernetes (kubeadm) | Manages containers across 3 nodes |
| CI Pipeline | GitHub Actions | Automates build + deploy on every push |
| Image Registry | AWS ECR | Stores Docker images privately |
| CD / GitOps | ArgoCD | Syncs Git state to cluster state |
| Monitoring | Prometheus + Grafana | Metrics collection and dashboards |
| App Backend | Node.js + Express | REST API, 4 routes |
| App Frontend | React | Single page status board UI |
| Database | MongoDB | Stores service status data |

---

## Repo Structure
```
GitOps/
├── backend/                  # Express API
│   ├── server.js             # All routes — GET/POST/PATCH/DELETE /services
│   ├── package.json
│   └── Dockerfile
├── frontend/                 # React app
│   ├── src/App.jsx           # Single page UI
│   ├── package.json
│   └── Dockerfile
├── infra/                    # Terraform
│   ├── main.tf               # VPC, subnet, security group, 3 EC2 instances
│   ├── variables.tf          # Region, instance type, key name
│   └── outputs.tf            # Prints public IPs after apply
├── k8s/                      # Kubernetes manifests (ArgoCD watches this)
│   ├── backend/
│   │   ├── deployment.yaml   # 2 replicas, ECR image
│   │   └── service.yaml      # NodePort 30001
│   ├── frontend/
│   │   ├── deployment.yaml   # 2 replicas, ECR image
│   │   └── service.yaml      # NodePort 30002
│   └── mongo/
│       ├── statefulset.yaml  # 1 replica, hostPath storage
│       └── service.yaml      # Headless service
├── monitoring/
│   └── prometheus-values.yaml
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

---

## Infrastructure Details

| Node | Role | Public IP |
|---|---|---|
| k8s-master | Control plane + API server | 54.84.239.147 |
| k8s-worker-1 | App workloads | 35.173.5.220 |
| k8s-worker-2 | App workloads | 52.3.71.57 |

Instance type: `m7i-flex.large` (2 vCPU, 8GB RAM)
Region: `us-east-1`
EBS volume: 20GB per node

**ECR token note:** The ECR auth token expires every 12 hours.
On cluster restart, refresh it on all 3 nodes:
```bash
TOKEN=$(aws ecr get-login-password --region us-east-1)
sudo sed -i "s|password = \".*\"|password = \"$TOKEN\"|" /etc/containerd/config.toml
sudo systemctl restart containerd
```

---

## The App — System Status Board

A live service status page. Add services, set their status, post incident notes.
Thematically on point — a DevOps project deploying a DevOps tool.

Status levels: `operational` `degraded` `outage` `maintenance`

This is what gets deployed by the pipeline. The app itself is intentionally simple —
the infrastructure around it is the point.

---

## Contributors

| Name | Contribution |
|---|---|
| Sarvagna | GitOps pipeline — Terraform, kubeadm, GitHub Actions, ArgoCD, Prometheus |
| Chandradeep | Backend — Express API, MongoDB, Dockerfile |
| Sahithi | Frontend — React UI, Dockerfile |
