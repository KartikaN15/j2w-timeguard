# J2W Timeguard — Setup & Deployment Guide

This repo is a **monorepo** with two independently deployable apps:

```
j2w-timeguard/
├── backend/      Express + TypeScript REST API (talks to MongoDB)
├── frontend/     Vite + React SPA (served by nginx in production)
└── docker-compose.yml   MongoDB + backend + frontend, one command
```

There is **no Supabase** anymore. Data lives in MongoDB; auth is custom
email + password with bcrypt-hashed passwords and JWT access tokens.

---

## 1. Prerequisites

| Tool | Version | Needed for |
|------|---------|------------|
| Node.js | 20+ (22 recommended) | local dev without Docker |
| Docker + Docker Compose | recent | running everything in containers |
| MongoDB | 7 | the database (or use the Docker one / Atlas) |

---

## 2. Where the environment variables go

| File | Committed? | Holds |
|------|-----------|-------|
| `backend/.env`  | **No** (gitignored) | `MONGO_URI`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN` — **secrets** |
| `frontend/.env` | **No** (gitignored) | `VITE_API_URL` — **public**, baked into the bundle at build time |
| `backend/.env.example`, `frontend/.env.example` | Yes | templates to copy from |

Create the real files from the templates:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Generate a strong JWT secret for `backend/.env`:

```bash
openssl rand -base64 48
```

> ⚠️ Never put secrets in `frontend/.env` — everything there ships to the browser.

---

## 3. Setting up MongoDB (pick ONE)

### Option A — Docker (easiest, recommended)
The included `docker-compose.yml` runs MongoDB for you in a container with a
persistent volume (`mongo_data`). Nothing to install. In this mode the backend
connects with `MONGO_URI=mongodb://mongo:27017/j2w_timeguard` (already set in
compose).

### Option B — MongoDB Atlas (managed cloud, free tier)
1. Create a free cluster at <https://www.mongodb.com/atlas>.
2. Add a database user and allow your server's IP (or `0.0.0.0/0` for testing).
3. Copy the connection string and put it in `backend/.env`:
   ```
   MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/j2w_timeguard
   ```

### Option C — Install MongoDB on the VM directly (Ubuntu)
```bash
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod
# Then in backend/.env: MONGO_URI=mongodb://127.0.0.1:27017/j2w_timeguard
```

---

## 4. Running locally (without Docker)

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env          # edit MONGO_URI / JWT_SECRET
npm install
npm run seed                  # optional: demo users + sample data
npm run dev                   # http://localhost:4000

# Terminal 2 — frontend
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:3000
```

Open <http://localhost:3000> and log in with a demo account (see §8).

---

## 5. Running everything with Docker Compose (recommended)

From the repo root:

```bash
# 1. Provide a JWT secret (and optionally a CORS origin) for the backend
export JWT_SECRET="$(openssl rand -base64 48)"

# 2. Build and start MongoDB + backend + frontend
docker compose up -d --build

# 3. (First time only) seed demo data
docker compose run --rm backend npm run seed
```

Then:
- Frontend → <http://localhost:3000>  (nginx serves the SPA and proxies `/api` to the backend)
- Backend  → <http://localhost:4000>
- MongoDB  → `localhost:27017` (data persists in the `mongo_data` volume)

Stop / remove:
```bash
docker compose down            # keep data
docker compose down -v         # also delete the MongoDB volume
```

---

## 6. Building the Docker images individually

If you want to push images to a registry instead of building on the VM:

```bash
# Backend
docker build -t j2w-backend:latest ./backend

# Frontend — same-origin API (nginx proxy). Leave VITE_API_URL empty.
docker build -t j2w-frontend:latest ./frontend

# Frontend — API on a different host (no nginx proxy):
docker build -t j2w-frontend:latest \
  --build-arg VITE_API_URL=https://api.your-domain.com ./frontend
```

Push to a registry (example with Docker Hub):
```bash
docker tag j2w-backend:latest <your-user>/j2w-backend:latest
docker tag j2w-frontend:latest <your-user>/j2w-frontend:latest
docker push <your-user>/j2w-backend:latest
docker push <your-user>/j2w-frontend:latest
```

---

## 7. Deploying on an Ubuntu VM

### 7.1 Install Docker + Compose on the VM
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER     # log out / back in so this takes effect
```

### 7.2 Get the code and configure
```bash
git clone <your-repo-url> j2w-timeguard
cd j2w-timeguard
cp backend/.env.example backend/.env
nano backend/.env                 # set a strong JWT_SECRET; MONGO_URI stays mongo:27017 for compose
export JWT_SECRET="$(openssl rand -base64 48)"
export CORS_ORIGIN="http://<your-vm-ip-or-domain>:3000"
```

### 7.3 Launch
```bash
docker compose up -d --build
docker compose run --rm backend npm run seed   # first time only
docker compose ps                              # check all three are healthy
docker compose logs -f backend                 # view logs
```

### 7.4 Open the firewall (if using ufw)
```bash
sudo ufw allow 3000/tcp      # frontend
# port 4000/27017 only needed if you expose the API/DB directly
```

The app is now reachable at `http://<your-vm-ip>:3000`.

### 7.5 (Optional) Serve on port 80 / HTTPS
- To serve the frontend on port 80, change the frontend port mapping in
  `docker-compose.yml` from `"3000:80"` to `"80:80"`.
- For HTTPS, put a reverse proxy (Caddy, or nginx + certbot) in front, or add a
  TLS-terminating load balancer. Point it at the frontend container.

### 7.6 Updating a running deployment
```bash
git pull
docker compose up -d --build      # rebuilds changed images, recreates containers
```

---

## 8. Demo accounts

After running the seed (`npm run seed`), these exist (password `demo@123`):

| Email | Role |
|-------|------|
| `admin@j2w.in` | HR Admin (super_admin + hr_admin) |
| `arjun.mehta@ge.com` | GE Healthcare employee (hybrid schedule) |
| `priya.nair@ge.com` | GE Healthcare employee |
| `ravi.kumar@tcs.com` | TCS employee (has a pending device + a flagged punch today) |

> The seed **wipes** the relevant collections before inserting. Don't run it
> against a database with real data.

If you skip seeding, the **first account you sign up** automatically becomes
`super_admin` + `hr_admin`.

---

## 9. MongoDB collections (schema)

Mongoose models in `backend/src/models/` define these collections:

| Collection | Replaces Postgres table | Notes |
|------------|------------------------|-------|
| `users` | `profiles` + `auth.users` + `user_roles` | email, bcrypt `password_hash`, `roles[]`, `client_company` |
| `employeeconfigs` | `employee_config` | geofence + `weekly_schedule` |
| `devices` | `user_devices` + `pending_devices` | one collection, `status: approved\|pending` |
| `attendanceevents` | `attendance_events` | append-only punches |
| `auditevents` | `audit_events` | append-only audit trail |
| `companyconfig` | `company_config` | single document |
| `leavetypes` | `leave_types` | CL / SL / PL / LOP |
| `leavebalances` | `leave_balances` | per user / type / year |
| `leaverequests` | `leave_requests` | apply / approve / reject |

Row-Level Security from Postgres is now enforced by the Express auth middleware
(`requireAuth` / `requireAdmin`).
