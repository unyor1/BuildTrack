# BuildTrack: Development Roadmap & Architecture

**Project:** BuildTrack - An Integrated 2D-Mapping Platform for Site Progress, Quality Assurance Logging and Biometric Workforce Management

**Team:** Armillo Gilbert Jr. | Clyne Arvey Tayona | Adrian Dale Valencia  
**Institution:** University of Makati, College of Computing and Information Sciences

---

## 📋 Executive Summary

BuildTrack is an enterprise-grade construction management platform combining:
- **Interactive 2D Blueprint Mapping** – Real-time milestone tracking with pinnable annotations
- **Quality Assurance (QA) Defect Logging** – Spatial coordinate pins with photographic evidence
- **Biometric Workforce Management** – Worker timekeeping and automated payroll
- **Offline-First Architecture** – Field-resilient with store-and-forward sync
- **RBAC & Security** – Role-based access, audit trails, and regulatory compliance

---

## 🛠️ Tech Stack Recommendation

### Frontend
- **Framework:** React 18 + TypeScript + Vite
- **2D Canvas/Mapping:** Fabric.js (blueprint pinning) or Konva.js (high-performance)
- **UI Components:** Radix UI + Tailwind CSS v4
- **State Management:** TanStack Query (React Query) + Zustand
- **Real-time:** WebSocket (Socket.io) for live collaboration
- **Offline Support:** Workbox (service workers) + IndexedDB

### Backend
- **Language:** Python 3.11+
- **Framework:** FastAPI (async, modern, auto-docs) OR Flask (simpler, mature)
- **Recommendation:** **FastAPI** for this project
  - Better async support for real-time features
  - Built-in validation (Pydantic)
  - Auto-generated OpenAPI/Swagger docs
  - Excellent for WebSocket handling
  - Superior performance for high-concurrency biometric logging

### Database
- **Primary:** PostgreSQL 15+ (Supabase managed)
- **Local SQLite** (edge/field devices for offline persistence)
- **Cache:** Redis (optional, for real-time collaboration)
- **File Storage:** Supabase Storage (defect photos, blueprints)

### DevOps & Deployment
- **Container:** Docker + docker-compose
- **IaaC:** Terraform (optional, for Supabase config)
- **CI/CD:** GitHub Actions
- **Hosting:** Supabase (PostgreSQL + Auth + Storage) + Cloud Run/Render/Railway (backend)

---

## 📊 Database Schema Overview

### Core Tables

```sql
-- Projects & Sites
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  location POINT,
  site_manager_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR DEFAULT 'active'
);

-- Blueprints (2D Maps)
CREATE TABLE blueprints (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  file_path VARCHAR,
  file_type VARCHAR,
  dimensions_width INT,
  dimensions_height INT,
  scale_ratio FLOAT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Progress Tracking (Pins on blueprints)
CREATE TABLE progress_milestones (
  id UUID PRIMARY KEY,
  blueprint_id UUID REFERENCES blueprints(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  x_coord FLOAT NOT NULL,
  y_coord FLOAT NOT NULL,
  status VARCHAR ('pending', 'in_progress', 'completed'),
  assigned_to UUID REFERENCES users(id),
  completion_date TIMESTAMP,
  photos_url TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- QA Defects
CREATE TABLE qa_defects (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  blueprint_id UUID REFERENCES blueprints(id),
  location_x FLOAT,
  location_y FLOAT,
  defect_category VARCHAR,
  severity VARCHAR ('low', 'medium', 'high', 'critical'),
  description TEXT,
  photographic_evidence TEXT[],
  reported_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  status VARCHAR ('open', 'in_review', 'resolved', 'closed'),
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  INDEX (project_id, status),
  INDEX (severity)
);

-- Biometric Worker Timekeeping
CREATE TABLE worker_timesheets (
  id UUID PRIMARY KEY,
  worker_id UUID REFERENCES users(id) NOT NULL,
  project_id UUID REFERENCES projects(id) NOT NULL,
  clock_in TIMESTAMP NOT NULL,
  clock_out TIMESTAMP,
  hours_worked FLOAT,
  daily_wage DECIMAL(10,2),
  overtime_hours FLOAT DEFAULT 0,
  overtime_multiplier FLOAT DEFAULT 1.25,
  total_compensation DECIMAL(10,2),
  biometric_validated BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX (worker_id, project_id, clock_in)
);

-- Payroll
CREATE TABLE payroll_records (
  id UUID PRIMARY KEY,
  worker_id UUID REFERENCES users(id) NOT NULL,
  project_id UUID REFERENCES projects(id) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_hours FLOAT,
  regular_pay DECIMAL(10,2),
  overtime_pay DECIMAL(10,2),
  deductions DECIMAL(10,2) DEFAULT 0,
  net_pay DECIMAL(10,2),
  status VARCHAR ('draft', 'approved', 'paid'),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(worker_id, period_start)
);

-- Users & RBAC
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  full_name VARCHAR NOT NULL,
  phone VARCHAR,
  role VARCHAR NOT NULL, -- 'admin', 'foreman', 'engineer', 'worker', 'qa_inspector'
  project_ids UUID[] DEFAULT '{}',
  biometric_enrolled BOOLEAN DEFAULT FALSE,
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR NOT NULL,
  resource_type VARCHAR,
  resource_id VARCHAR,
  changes JSONB,
  ip_address INET,
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX (timestamp DESC, user_id)
);

-- Offline Sync Queue
CREATE TABLE sync_queue (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR,
  entity_type VARCHAR,
  entity_data JSONB,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP
);
```

---

## 🏗️ Backend Architecture (FastAPI)

### Project Structure
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app entry
│   ├── config.py               # Config & env variables
│   ├── dependencies.py         # Dependency injection (DB, auth)
│   ├── middleware.py           # Auth, CORS, audit logging
│   │
│   ├── api/
│   │   ├── v1/
│   │   │   ├── endpoints/
│   │   │   │   ├── projects.py
│   │   │   │   ├── blueprints.py
│   │   │   │   ├── progress.py
│   │   │   │   ├── qa_defects.py
│   │   │   │   ├── workers.py
│   │   │   │   ├── timekeeping.py
│   │   │   │   ├── payroll.py
│   │   │   │   └── auth.py
│   │   │   └── router.py       # APIRouter aggregation
│   │
│   ├── services/               # Business logic layer
│   │   ├── project_service.py
│   │   ├── blueprint_service.py
│   │   ├── qa_service.py
│   │   ├── payroll_service.py
│   │   ├── sync_service.py     # Offline sync
│   │   └── biometric_service.py
│   │
│   ├── models/                 # Pydantic schemas
│   │   ├── project.py
│   │   ├── blueprint.py
│   │   ├── defect.py
│   │   ├── timesheet.py
│   │   └── user.py
│   │
│   ├── db/
│   │   ├── database.py         # SQLAlchemy setup
│   │   ├── models.py           # ORM models
│   │   └── migrations/         # Alembic
│   │
│   ├── websocket/
│   │   ├── manager.py          # WebSocket connection manager
│   │   └── handlers.py         # Real-time sync handlers
│   │
│   ├── auth/
│   │   ├── jwt.py              # JWT token handling
│   │   └── rbac.py             # Role-based access control
│   │
│   ├── integrations/
│   │   ├── supabase_client.py  # Supabase auth & storage
│   │   └── biometric.py        # Biometric device integration
│   │
│   └── utils/
│       ├── logger.py
│       ├── validators.py
│       └── helpers.py
│
├── requirements.txt
├── .env.example
├── docker-compose.yml
└── Dockerfile
```

### Key FastAPI Features to Implement

```python
# 1. Authentication & RBAC
- JWT token with Supabase Auth
- Dependency injection for current user
- Role-based endpoint protection (@require_role decorator)
- Audit logging middleware

# 2. Real-time Features (WebSocket)
- Live blueprint collaboration (multiple users pinning)
- Instant QA defect notifications
- Real-time timesheet updates
- Push notifications for approvals

# 3. Pagination & Filtering
- Cursor-based pagination for large defect lists
- Filter by date, severity, status, assigned_to
- Full-text search on descriptions

# 4. Background Tasks
- Celery + Redis for async operations:
  - Payroll calculations (nightly)
  - Biometric sync validation
  - Report generation
  - Notification dispatch
```

---

## 📡 API Endpoints (RESTful + WebSocket)

### Authentication
```
POST   /api/v1/auth/register          # User registration
POST   /api/v1/auth/login             # Login (returns JWT)
POST   /api/v1/auth/refresh           # Refresh token
POST   /api/v1/auth/logout            # Logout
GET    /api/v1/auth/me                # Current user info
```

### Projects
```
GET    /api/v1/projects               # List projects (paginated, filtered)
POST   /api/v1/projects               # Create project
GET    /api/v1/projects/{id}          # Get project details
PUT    /api/v1/projects/{id}          # Update project
DELETE /api/v1/projects/{id}          # Archive project
GET    /api/v1/projects/{id}/analytics # Project dashboard/stats
```

### Blueprints
```
GET    /api/v1/blueprints             # List blueprints
POST   /api/v1/blueprints             # Upload blueprint
GET    /api/v1/blueprints/{id}        # Get blueprint (image + metadata)
PUT    /api/v1/blueprints/{id}        # Update blueprint metadata
DELETE /api/v1/blueprints/{id}        # Delete blueprint
GET    /api/v1/blueprints/{id}/pins   # Get all pins on blueprint
```

### Progress Tracking (Pins)
```
GET    /api/v1/blueprints/{id}/milestones           # List all progress pins
POST   /api/v1/blueprints/{id}/milestones           # Add progress pin (x, y, name, photo)
GET    /api/v1/milestones/{id}                      # Get milestone details
PUT    /api/v1/milestones/{id}                      # Update milestone (status, photo)
DELETE /api/v1/milestones/{id}                      # Remove milestone
PATCH  /api/v1/milestones/{id}/complete            # Mark as complete
```

### Quality Assurance (Defects)
```
GET    /api/v1/projects/{id}/defects                # List defects (filter: severity, status, date range)
POST   /api/v1/projects/{id}/defects                # Log new defect (x, y, category, photo, description)
GET    /api/v1/defects/{id}                         # Get defect details
PUT    /api/v1/defects/{id}                         # Update defect
PATCH  /api/v1/defects/{id}/assign                  # Assign to worker
PATCH  /api/v1/defects/{id}/resolve                 # Mark resolved + resolution notes
DELETE /api/v1/defects/{id}                         # Delete defect
GET    /api/v1/projects/{id}/defects/stats          # Defects summary (by severity, status)
POST   /api/v1/defects/{id}/photos                  # Upload additional photos
```

### Workers & Timekeeping
```
GET    /api/v1/workers                              # List workers
POST   /api/v1/workers                              # Register worker
GET    /api/v1/workers/{id}                         # Get worker profile
POST   /api/v1/workers/{id}/biometric/enroll        # Enroll biometric (fingerprint/iris)
POST   /api/v1/timekeeping/clock-in                 # Clock in (with biometric)
POST   /api/v1/timekeeping/clock-out                # Clock out
GET    /api/v1/workers/{id}/timesheets              # Get worker's timesheet history
GET    /api/v1/timekeeping/daily                    # Get daily attendance (foreman view)
```

### Payroll
```
GET    /api/v1/payroll/periods                      # List payroll periods
POST   /api/v1/payroll/periods                      # Create payroll period
GET    /api/v1/payroll/workers/{id}                 # Get worker's payroll records
POST   /api/v1/payroll/calculate                    # Calculate payroll (nightly job)
GET    /api/v1/payroll/period/{period_id}          # Get full period payroll
PATCH  /api/v1/payroll/{id}/approve                 # Approve payroll
PATCH  /api/v1/payroll/{id}/export                  # Export to CSV/PDF
```

### Offline Sync
```
POST   /api/v1/sync/pull                            # Client requests pending changes
POST   /api/v1/sync/push                            # Client uploads offline changes
GET    /api/v1/sync/status                          # Check sync status
```

### WebSocket (Real-time)
```
WS     /ws/projects/{id}/live          # Live project collaboration
       - broadcast progress_pin_added
       - broadcast progress_pin_updated
       - broadcast defect_logged
       - broadcast worker_clocked_in
```

---

## 🎯 Development Roadmap (6-8 Months)

### Phase 1: Foundation (Weeks 1-4)
**Goals:** Core infrastructure, auth, database

- [x] Project setup (Python env, FastAPI, PostgreSQL)
- [x] Database schema design & Supabase setup
- [x] Authentication (JWT + Supabase Auth)
- [x] RBAC middleware
- [x] Audit logging infrastructure
- [x] API documentation (Swagger/OpenAPI)
- [x] Docker setup
- [ ] Frontend: Login & landing page
- [ ] Basic project CRUD

**Deliverable:** Running backend with auth, empty projects endpoint

---

### Phase 2: Core Features (Weeks 5-10)
**Goals:** 2D mapping, blueprint management, progress tracking

- [ ] Blueprint upload & storage (Supabase)
- [ ] 2D canvas library integration (Fabric.js/Konva)
- [ ] Progress milestone pinning (add, edit, delete)
- [ ] Real-time collaboration (WebSocket)
- [ ] Frontend: Blueprint viewer + pin interaction
- [ ] Project dashboard with milestone overview

**Deliverable:** Full blueprint & progress tracking workflow

---

### Phase 3: QA & Defect Management (Weeks 11-15)
**Goals:** Defect logging, photo evidence, tracking

- [ ] Defect logging API (spatial coords + photos)
- [ ] QA dashboard with defect list (filters, sorting)
- [ ] Defect resolution workflow (assign, resolve, close)
- [ ] Photo storage & retrieval (Supabase)
- [ ] Defect statistics & reports
- [ ] Frontend: QA inspector interface

**Deliverable:** Complete QA workflow + inspector dashboard

---

### Phase 4: Biometric & Payroll (Weeks 16-22)
**Goals:** Worker timekeeping, payroll automation

- [ ] Biometric device integration (fingerprint/iris SDK)
- [ ] Worker enrollment flow
- [ ] Timekeeping API (clock-in/out)
- [ ] Timesheet calculations
- [ ] Payroll calculation engine (daily wage, overtime, deductions)
- [ ] Payroll approval workflow
- [ ] Frontend: Worker & Foreman dashboards

**Deliverable:** Full workforce management + payroll system

---

### Phase 5: Offline-First & Sync (Weeks 23-25)
**Goals:** Field resilience, data sync

- [ ] Service Worker setup (Workbox)
- [ ] IndexedDB local schema mirroring
- [ ] Offline sync queue (capture actions locally)
- [ ] Store-and-forward sync engine
- [ ] Conflict resolution strategy
- [ ] Frontend: Offline indicator + sync status

**Deliverable:** Full offline capability with automatic sync

---

### Phase 6: Security & Compliance (Weeks 26-28)
**Goals:** Hardening, audit, compliance

- [ ] Security audit (OWASP top 10, SQL injection, XSS)
- [ ] Rate limiting & DDoS protection
- [ ] Data encryption (at-rest, in-transit)
- [ ] GDPR/RA 10173 compliance review
- [ ] ISO/IEC 27001 alignment (ISMS)
- [ ] Penetration testing
- [ ] Security documentation

**Deliverable:** Security & compliance report

---

### Phase 7: Testing & Deployment (Weeks 29-32)
**Goals:** Quality assurance, production readiness

- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] End-to-end tests (Cypress/Playwright)
- [ ] Load testing (k6, JMeter)
- [ ] UAT with stakeholders
- [ ] Production deployment setup
- [ ] Monitoring & alerting (Sentry, DataDog)
- [ ] Documentation (API, deployment, operations)

**Deliverable:** Fully tested, production-ready system

---

### Phase 8: Polish & Handoff (Weeks 33-35)
**Goals:** Final refinements, training, documentation

- [ ] Performance optimization
- [ ] UI/UX refinements
- [ ] User training materials
- [ ] Operations manual
- [ ] Final deployment
- [ ] Knowledge transfer

**Deliverable:** Deployed system + training materials

---

## 🔐 Security & Compliance

### Encryption
- **In Transit:** TLS 1.3 (HTTPS)
- **At Rest:** PostgreSQL transparent encryption (Supabase managed)
- **Sensitive Fields:** AES-256 for PII (email, phone, biometric templates)

### Authentication
- JWT tokens with 1-hour expiry (refresh token: 7 days)
- Biometric as MFA (optional)
- API key for third-party integrations

### Data Privacy
- **RA 10173 (Data Privacy Act):** Compliance checklist in PRIVACY.md
- PII redaction in logs & reports
- Right to be forgotten (data deletion)
- Consent management

### Compliance Standards
- **ISO/IEC 25010:** Software quality (functional suitability, performance)
- **ISO/IEC 27001:** Information security management
- **ISO/IEC 27701:** Privacy information management

---

## 📦 Deployment & Hosting

### Architecture
```
┌─────────────────┐
│   React SPA     │  Deployed on Vercel/Netlify
│   (Vite build)  │
└────────┬────────┘
         │ HTTPS
    ┌────▼─────────┐
    │  FastAPI     │  Cloud Run / Railway / Render
    │  Backend     │
    └────┬─────────┘
         │
    ┌────▼────────────────────┐
    │  Supabase              │
    ├────────────────────────┤
    │ • PostgreSQL           │
    │ • Auth & JWT           │
    │ • Storage (blueprints) │
    │ • Realtime (WebSocket) │
    └────────────────────────┘
```

### Environment Configuration
```
# .env (local development)
DATABASE_URL=postgresql://user:pass@localhost/buildtrack
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_API_KEY=xxx
JWT_SECRET=xxx
REDIS_URL=redis://localhost:6379

# Docker-compose: PostgreSQL + Redis + FastAPI
```

---

## 🚀 Getting Started

### 1. Clone & Setup
```bash
git clone <repo-url>
cd buildtrack

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
npm run dev
```

### 2. Database Setup
```bash
# Using Supabase CLI
supabase start

# Run migrations
alembic upgrade head
```

### 3. Run Locally
```bash
docker-compose up -d
npm run dev
```

---

## 📋 Key Files to Create

1. **Backend**
   - `app/main.py` – FastAPI entry point
   - `app/config.py` – Environment & settings
   - `app/db/models.py` – SQLAlchemy ORM
   - `app/api/v1/endpoints/*.py` – API routes
   - `app/services/*.py` – Business logic
   - `requirements.txt` – Python dependencies
   - `Dockerfile` & `docker-compose.yml`

2. **Frontend**
   - `src/pages/` – Page components
   - `src/components/` – Reusable UI components
   - `src/services/api.ts` – API client
   - `src/hooks/` – Custom hooks (offline sync, WebSocket)
   - `src/store/` – Zustand state management
   - `public/service-worker.js` – PWA offline support

3. **Database**
   - `migrations/001_initial_schema.sql` – Schema creation
   - `migrations/seed.sql` – Test data

4. **Documentation**
   - `API.md` – API reference
   - `ARCHITECTURE.md` – System design
   - `DEPLOYMENT.md` – Production setup
   - `PRIVACY.md` – Data privacy & compliance

---

## 💡 Recommendations

1. **Start with FastAPI** (not Flask)
   - Modern async support
   - Built-in validation & docs
   - Better for WebSocket real-time features

2. **Use Supabase for everything**
   - Managed PostgreSQL (no ops overhead)
   - Authentication built-in
   - Real-time subscriptions
   - Storage for files
   - All under single vendor

3. **Implement offline-first from Day 1**
   - Service Workers (Workbox)
   - IndexedDB for local caching
   - Sync queue for pending actions
   - Field devices will have spotty connectivity

4. **Prioritize RBAC early**
   - Middleware-level role checks
   - Scope queries by role (worker sees own data, foreman sees team)
   - Audit every action

5. **Real-time collaboration is a must-have**
   - Multiple foremen checking blueprints
   - Instant QA notifications
   - WebSocket via Socket.io or Supabase Realtime

6. **Biometric integration strategy**
   - Cloud-based (avoid local hardware)
   - Integrate with managed biometric service (AWS Rekognition, Azure Face)
   - Template-only storage (never store raw biometric data)

7. **Testing & Monitoring**
   - Load testing before production (payroll calculations at scale)
   - Monitor API response times & WebSocket latency
   - Log all data mutations for audit trail

---

## 📞 Support & Questions

For architecture decisions, compliance questions, or implementation blockers, refer to the standard tech documentation and the capstone advisor.

**Next Step:** Create the FastAPI project skeleton, set up Supabase, and begin Phase 1 (Foundation).
