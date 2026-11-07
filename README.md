# AISMP: AI Smart Municipality Platform

CSC 599 Capstone, Lebanese American University
Ali Rida & Reina Harake. Supervisor: Dr. Ibrahim El Bitar

> **Student prototype.** This is a university project. It uses the Municipality of Beirut's name, crest and public contact details for realism, but it is **not** an official municipal service and is not affiliated with the municipality. The website says so in its footer.

Citizens report problems (roads, street lighting, electricity, water, waste, noise, illegal construction, parking, stray animals, parks and public spaces) in **English, French, Arabic or Arabizi**. The AI classifies each complaint, predicts how urgent it is and routes it to the right municipal team, then the citizen follows it until it is resolved. The whole website works in English, Arabic (right-to-left) and French.

| Tier | Folder | Tech |
|---|---|---|
| Presentation | `frontend/` | React 19 + Vite, served by nginx |
| Application | `backend/` | Node.js + Express, MySQL, JWT, role-based access |
| AI service | `ml-service/` | Python FastAPI + scikit-learn |
| Data | `database/` | MySQL 8 |

## Run it

Needs Docker Desktop (running).

```bash
cp .env.example .env        # change JWT_SECRET before any real deployment
docker compose up --build
```

The first build takes about 15 minutes (it trains the AI models inside the image). Later builds are cached: editing the API or the chatbot rules retrains nothing, and editing the chatbot's example phrases (`ml-service/training/intents_*.py`) retrains only the chatbot model. Then open:

- **Website: http://localhost:3000**
- API health: http://localhost:5000/api/health
- AI service test page: http://localhost:8000/docs

Stop with Ctrl+C. Start again later with `docker compose up`.
**Reset all data** (needed once after updating from an older version of this project, because the database schema changed): `docker compose down -v`, then `docker compose up --build`.
**Updating an existing database instead** (keeps your data): run the new files in `database/migrations/` once, e.g. `docker compose exec -T db mysql -uaismp -paismp_pass aismp < database/migrations/006_password_resets.sql`.

### Demo accounts (password `Password123`)

| Role | Email | Language |
|---|---|---|
| Admin | admin@aismp.lb | English |
| Employees | roads@, electricity@, water@, waste@, services@, police@aismp.lb | English |
| Citizens | nour@example.com, rami@example.com | English |
| Citizen | layla@example.com | Arabic |
| Citizen | claire@example.com | French |

Each user's language is saved in their profile: the site opens in it and their notifications are written in it. The EN / ع / FR switch changes it.

### Developing the website without Docker

```bash
docker compose up db ml-service backend     # everything except the website
cd frontend && npm install && npm run dev   # http://localhost:5173, /api is proxied to :5000
```

### Tests

With the stack running:

```bash
cd backend && npm install && API_URL=http://localhost:5000 npm test
```

No Node.js on your computer? Run them in a throwaway container instead (Windows Git Bash: prefix with `MSYS_NO_PATHCONV=1`):

```bash
docker run --rm -e API_URL=http://host.docker.internal:5000 -v "$PWD/backend/test:/t:ro" -w /t node:22-alpine node --test api.e2e.test.js
```

19 end-to-end tests: auth, the AI pipeline in all four languages, evidence uploads, role-based access, the full complaint workflow, document requests, admin, dashboards, notifications in each user's language, the chatbot (small talk, private status lookups, problem → offer → submission), the public contact details, and the forgot-password flow.

The tests make many deliberately failed logins, so running them several times within 15 minutes trips the login rate limit (`429`). Restart the backend (`docker compose restart backend`) to reset it.

## What each role can do

- **Citizen:** register with first and last name, email, Lebanese phone number, a copy of their national ID (JPG, PNG, WEBP or PDF) and the password typed twice (all required; only admins can open the ID copy, from Staff & users); report a problem in Beirut (text, district, address, location on a map of Beirut, photos/PDF) and see how the AI read it; follow each complaint's timeline; request documents; get notifications; earn points and levels (see Points and levels below).
- **Employee:** their team's complaint queue sorted by urgency; move complaints through the workflow (taking a complaint moves it to "Assigned" to them); correct the AI's category or urgency; process document requests; team dashboard.
- **Admin:** everything above for all teams; assign complaints to a team or employee (with each employee's open workload); full dashboard (daily trend, categories, urgency, recurring problems by area, team performance, how often the AI was corrected); create and disable staff accounts.
- **Public:** a transparency page with anonymized statistics; the municipality's address, phone and opening hours at the bottom of the home page.
- **Everyone:** the **municipality assistant** (chat bubble, bottom corner of every page); a show/hide button on every password field; **Forgot password?** on the login page (see below).

## Look and feel

The design follows the Municipality of Beirut's crest (`frontend/public/beirut-shield.png`): red bands on white for the institution (buttons, header stripe, chat), the gold of the tower for accents (points, levels), the navy of the sea for data and links, and the cedar green only for "resolved / done". A red-white-red band runs across the top of every page. Critical complaints use a separate wine-crimson badge with a "!" so they never look like ordinary brand red. Colours are tokens at the top of `frontend/src/styles.css`.

## Contact details

The municipality's address, phone, map link and opening hours live in **one file**, `backend/src/config/municipality.json`. The chatbot answers from it (with **Open in Google Maps** and **Call** buttons), and the home page reads it from `GET /api/municipality`. Edit that file and restart the backend.

## Forgot password

1. **Forgot password?** on the login page → the user enters their email.
2. The backend emails a one-time link (`/reset-password?token=…`), valid for **1 hour**, in the user's language. The answer is the same whether or not the email has an account, so the form can't be used to discover accounts. Only a SHA-256 hash of the token is stored (`password_resets` table); a new request cancels older links; at most 5 requests per 15 minutes.
3. The link opens a page to type the new password twice.

**Email setup.** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` and `APP_URL` (the website's public address) in `.env`. Without `SMTP_HOST`, no email is sent: the link is printed in the backend log (`docker compose logs backend`), and a **development** server also shows it on screen so the feature can be demonstrated.

> **Before hosting this anywhere public:** the backend image runs with `NODE_ENV=development`, which shows reset links on screen when no email server is set. That would let anyone reset anyone's password. Configure SMTP **and** set `NODE_ENV=production` (which also requires a real `JWT_SECRET`).

## How a complaint flows

1. Citizen submits (`POST /api/complaints`, optional evidence files).
2. Backend → `ml-service /classify` → category, confidence per category, language (en / fr / ar / arabizi / mixed).
3. Backend counts similar complaints in the same area (last 30 days) → historical feature.
4. Backend → `ml-service /prioritize` → Critical / High / Medium / Low.
5. Auto-routed to the team for that category; citizen notified; staff notified if High or Critical.
6. Workflow: `submitted → under_review → assigned → in_progress → resolved` (or `rejected`, which needs a note). Every change is stored in `complaint_status_history`.
7. Resolved → the citizen earns 10 points. Rejected as a false or abusive report (staff tick a box) → the citizen loses 15 points (never below 0); ordinary rejections (duplicate, not the municipality's job) cost nothing.

### Beirut only

The platform serves the Municipality of Beirut. Every complaint must name one of Beirut's 12 districts: Achrafieh, Ain el-Mreisseh, Bachoura, Mazraa, Medawar, Minet el-Hosn, Mousseitbeh, Port (Marfaa), Ras Beirut, Rmeil, Saifi, Zuqaq al-Blat. A map location is optional. The map only covers Beirut, and points outside the city boundary are refused, both in the form and by the API (`400`). The chatbot asks for the district before filing (or picks it up from the message, e.g. "bel ashrafiye"), and refuses complaints that name a place outside Beirut (Jounieh, Dahiyeh, Bourj Hammoud ...). Districts, the boundary and the outside-place list are in `backend/src/config/beirut.js` (mirrored in `frontend/src/beirut.js`). The boundary is a hand-simplified outline; replace it with the official GeoJSON for production. Map tiles come from OpenStreetMap.

### Points and levels

| Level | Points | What it gives |
|---|---|---|
| Newcomer | 0 | – |
| Active Neighbour | 30 | Badge on the profile |
| Trusted Reporter | 100 | Badge + **fast track**: new complaints skip the "Submitted" step and go straight to "Under review" for the responsible team (logged in the timeline as "trusted reporter") |
| Neighbourhood Guardian | 250 | Badge + fast track |

Because false reports cost points, the fast track cannot be earned by spamming. Rules live in `backend/src/utils/constants.js` (`POINTS`, `LEVELS`). Material rewards (fee discounts, vouchers) would need a decision by the municipality and are left as future work.

If the AI service is down, complaints are still accepted with `category_source = 'fallback'`. Staff corrections are stored with `source = 'manual'` and become labelled data for retraining.

## AI models (proposal §3.5)

**Dataset** (`ml-service/training/generate_dataset.py`, French part in `training/data_fr.py`, extra categories and Arabizi material in `training/data_more.py`): 18,600 labelled complaints in 11 categories (roads, street lighting, electricity, water, waste, noise, illegal construction, parking, stray animals, parks & public spaces, other), split between English, French, Lebanese Arabic and Arabizi, with category, priority, similar-complaint count and evidence flag. Built from hand-written situations plus category vocabulary inserted into generic sentence frames, with realistic noise: Arabizi written the way different people write it (3/a/nothing for ع, ch for sh, msh/mish/mesh, "el" glued to the noun, stretched letters, French/English words such as trottoir, poteau, fuite, chantier), French without accents, typos, missing punctuation and ~8% label disagreement. The data is synthetic because Lebanese municipalities do not publish complaint records; real complaints can be added with `--extra real.csv`.

**Evaluation** (`ml-service/training/train_all.py`): train/test split **by template**, so test sentences use patterns never seen in training; model selection by 5-fold GroupKFold cross-validation; macro-averaged metrics. In addition, `ml-service/data/arabizi_realistic.csv` holds 88 hand-written Arabizi complaints (free spelling, code-switching) that are never used for training ("Real Arabizi" column).

Language detection (rule-based): **98.7%** accuracy (EN 100%, FR 100%, AR 100%, Arabizi 95.6%).

| Category model (11 classes) | Accuracy | F1 | F1 EN | F1 FR | F1 AR | F1 Arabizi | Real Arabizi |
|---|---|---|---|---|---|---|---|
| Keyword baseline | 0.721 | 0.725 | 0.737 | 0.722 | 0.731 | 0.704 | 0.670 |
| Naive Bayes | 0.902 | 0.901 | 0.889 | 0.902 | 0.881 | 0.923 | 0.932 |
| **Linear SVM (selected)** | **0.947** | **0.947** | 0.972 | 0.968 | 0.892 | 0.958 | 0.898 |
| Logistic Regression | 0.935 | 0.934 | 0.939 | 0.951 | 0.899 | 0.947 | 0.909 |

The deployed model (retrained on all data) classifies 79 of the 88 hand-written Arabizi complaints correctly; the misses are listed in `reports/RESULTS.md` and are mostly genuinely ambiguous (dogs tearing garbage bags, construction noise at 5am, stairs closed off to make a private parking).

| Priority model | Accuracy | F1 | Within one level | Critical recall |
|---|---|---|---|---|
| Rule baseline | 0.283 | 0.239 | 0.742 | 0.051 |
| **Logistic Regression (selected)** | 0.653 | **0.658** | 0.946 | 0.711 |
| Linear SVM | 0.644 | 0.648 | 0.948 | 0.712 |
| Random Forest | 0.634 | 0.630 | 0.938 | 0.564 |

End to end (priority computed from the predicted category, as in production): F1 0.659, within one level 0.949.

Features: TF-IDF word 1–2-grams + character 2–5-grams (typos, French accents, Arabic prefixes) + an **Arabizi spelling key** channel that maps every Latin word to its consonant skeleton (kahraba / kahrba / ka7raba → `khrb`, zbele / zbeleh / zbale → `zbl`), so spellings never seen in training still match. The priority model adds category, similar complaints in the same area and whether evidence was attached. Full report with confusion matrices: `ml-service/reports/RESULTS.md`.

Retrain locally:

```bash
cd ml-service
pip install -r requirements-train.txt
python -m training.generate_dataset
python -m training.train_all
python -m training.train_intent      # chatbot intents
```

## AI chatbot assistant (proposal §3.7)

A chat bubble on every page. It understands English, Arabic, Arabizi and French, and answers in the user's site language.

| Ask it… | It does |
|---|---|
| "shu sar bi shakwete?", "où en est ma plainte n°12" | Shows your own complaints with live status (never other people's) |
| Describes a problem: "el may 3am ttouf 3al tari2" | Classifies it with the complaint models, shows category and urgency, offers **Submit this complaint** (one click) or **Edit in the full form** (prefilled) |
| "is my certificate ready?" | Status of your document requests |
| "how do I get a residence certificate?" | Lists the documents you can request online |
| "how do I report a problem?", "what can you do?" | Explains how the platform works |
| "how many points do I have?" | Explains points and shows yours |
| "I forgot my password", "change language" | Account help (points to **Forgot password?**) |
| "opening hours?", "phone number", "where is the municipality?" | Address, phone and hours, with **Open in Google Maps** and **Call** buttons (edit `backend/src/config/municipality.json`) |
| "hi", "merci", "yalla bye" | Small talk |

How it works: `ml-service /intent` decides what the person wants: a trained **Linear SVM** intent classifier (12 intents) plus a phrase list for small talk. It also extracts complaint numbers, including Arabic digits (رقم ٤). Then `backend /api/chat` runs the matching workflow with the user's real data. Filing a complaint needs at least 60% confidence and always a confirmation click. Visitors can ask general questions; personal data needs a login.

**Intent classifier results** (`ml-service/reports/INTENT_RESULTS.md`): 3,796 training sentences, 5-fold cross-validation grouped by original sentence or sentence frame (test sentences never seen in training).

| Model | Accuracy | Macro F1 | F1 EN | F1 FR | F1 AR | F1 Arabizi |
|---|---|---|---|---|---|---|
| **Linear SVM (selected)** | **0.893** | **0.821** | 0.894 | 0.829 | 0.736 | 0.804 |
| Logistic Regression | 0.891 | 0.817 | 0.908 | 0.816 | 0.734 | 0.790 |
| Naive Bayes | 0.880 | 0.801 | 0.883 | 0.792 | 0.718 | 0.771 |

On the 9 task intents (everything except greeting / thanks / goodbye) the model reaches macro F1 **0.928**. Small talk is the weak point of the model alone (very short phrases), which is why it is handled by the phrase list in the deployed assistant.

## API reference

All routes are under `/api`. Auth: `Authorization: Bearer <token>`.

| Method | Route | Who | Purpose |
|---|---|---|---|
| POST | /auth/register | public | Citizen sign-up (`language`: en / ar / fr) |
| POST | /auth/login | public | Get JWT |
| GET / PATCH | /auth/me | any | Current user / update name, phone, language |
| POST | /auth/change-password | any | Change password |
| POST | /auth/forgot-password | public | `{ email }`: emails a one-time reset link (same answer for unknown emails) |
| POST | /auth/reset-password | public | `{ token, password, password_confirm }`: set a new password from the link |
| GET | /municipality | public | Contact details (address, phone, map link, opening hours) |
| POST | /complaints | citizen | Submit (JSON or multipart with `evidence` files) |
| GET | /complaints | any (scoped) | List; filters `status, category, priority, area, department_id, assigned_to_me, q, sort, page, limit` |
| GET | /complaints/:id | any (scoped) | Detail + history + attachments |
| GET | /complaints/:id/attachments/:attId | any (scoped) | Download evidence |
| PATCH | /complaints/:id/status | employee, admin | Move through workflow |
| PATCH | /complaints/:id/assign | admin | Assign team / employee |
| PATCH | /complaints/:id/classification | employee, admin | Correct AI category / priority |
| POST | /requests | citizen | Request a document |
| GET | /requests, /requests/:id | any (scoped) | List / detail |
| PATCH | /requests/:id/status | employee, admin | `submitted → under_review → approved → ready` / `rejected` |
| GET | /departments | any | Teams |
| GET | /departments/:id/employees | employee, admin | Employees + open workload |
| POST | /departments | admin | Create |
| GET / POST | /users | admin | List / create employee or admin |
| PATCH | /users/:id | admin | Activate/deactivate, change team |
| GET | /notifications | any | Mine (+ unread count), in my language |
| PATCH | /notifications/:id/read, /notifications/read-all | any | Mark read |
| GET | /dashboard/stats?days=30 | employee (own team), admin | Totals, breakdowns, daily trend, hotspots, AI correction stats |
| GET | /dashboard/public | public | Anonymized transparency statistics |
| POST | /chat | anyone (more with login) | Assistant: `{ message, lang }`, or `{ action: "submit_complaint", text }` to file a proposed complaint |

"Scoped" = citizens see only their own items, employees see their team's complaints, admins see everything.

## Security (proposal §3.8)

bcrypt password hashing (cost 12), JWT sessions, role-based access checked on every route, zod input validation, parameterized SQL only, helmet headers, rate limiting on failed logins and on reset requests, single-use password reset links that expire after 1 hour (only their hash is stored), upload type/size limits with random file names, evidence served only through authorized routes.

## Database

`database/schema.sql` implements the ER diagram: `users`, `employees`, `departments`, `complaints`, `complaint_status_history`, `requests`, `notifications`, plus `complaint_attachments` (Upload Evidence use case), `users.points` (gamification), `users.language` and `password_resets` (forgot password). `database/migrations/` holds changes for databases created with an older schema.

## Next steps

- Predictive "high-risk zones" model on top of the dashboard hotspots.
- Retraining loop: export staff corrections and retrain with `--extra`.
- Collect real complaints to complement the synthetic dataset.
