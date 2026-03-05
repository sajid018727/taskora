import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { rateLimit } from "express-rate-limit";
import { db, initDb } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const uploadsDir = path.join(rootDir, "uploads");
const jwtSecret = process.env.JWT_SECRET || "taskora-dev-secret";
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const githubClientId = process.env.GITHUB_CLIENT_ID || "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || "";
const microsoftClientId = process.env.MICROSOFT_CLIENT_ID || "";
const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
const microsoftTenantId = process.env.MICROSOFT_TENANT_ID || "common";
const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const port = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";
const oauthStateStore = new Map();

initDb();
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(rootDir));
const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts. Please try again later." }
});

const resetLimiter = rateLimit({
  windowMs: Number(process.env.RESET_RATE_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RESET_RATE_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many reset attempts. Please try again later." }
});

const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const mailer = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  : nodemailer.createTransport({ jsonTransport: true });

function parseJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeUser(row) {
  const profile = parseJson(row.profile_json, {});
  const settings = parseJson(row.settings_json, {});
  const displayName = row.display_name || `${row.first_name} ${row.last_name || ""}`.trim();

  return {
    id: row.id,
    firstName: row.first_name,
    middleName: row.middle_name || "",
    lastName: row.last_name || "",
    displayName,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    profile: {
      phone: profile.phone || "",
      gender: profile.gender || "Prefer not to say",
      birthDate: profile.birthDate || "",
      addressLine1: profile.addressLine1 || "",
      addressLine2: profile.addressLine2 || "",
      city: profile.city || "",
      stateRegion: profile.stateRegion || "",
      zipCode: profile.zipCode || "",
      country: profile.country || "",
      residenceCountry: profile.residenceCountry || profile.country || "",
      avatarUrl: profile.avatarUrl || "",
      portfolio: Array.isArray(profile.portfolio) ? profile.portfolio : []
    },
    settings: {
      displayName: settings.displayName || displayName,
      payoutEmail: settings.payoutEmail || row.email,
      payoutAccountNumber: settings.payoutAccountNumber || "",
      phone: settings.phone || profile.phone || ""
    },
    createdAt: row.created_at
  };
}

function publicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    name: user.displayName,
    email: user.email,
    role: user.role,
    profile: user.profile,
    settings: user.settings
  };
}

function postedAgo(dateStr) {
  const created = new Date(dateStr).getTime();
  const now = Date.now();
  const mins = Math.floor((now - created) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parseMoneyValue(input) {
  const num = Number(String(input || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function addContractTransaction(contractId, actorId, action, amount = 0, note = "") {
  const id = `TX${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO contract_transactions (id, contract_id, actor_id, action, amount, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, contractId, actorId, action, Number(amount || 0), String(note || "").trim(), createdAt);
}

function createInvoiceForMilestone(contract, milestone, note = "") {
  const existing = db.prepare("SELECT * FROM invoices WHERE milestone_id=?").get(milestone.id);
  if (existing) return existing;

  const id = `INV${Date.now().toString().slice(-9)}`;
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO invoices (id, contract_id, milestone_id, payer_user_id, payee_user_id, amount, currency, status, note, created_at, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, 'USD', 'paid', ?, ?, ?)
  `).run(
    id,
    contract.id,
    milestone.id,
    contract.client_id,
    contract.freelancer_id,
    Number(milestone.amount || 0),
    String(note || milestone.title || "Milestone payment").trim(),
    createdAt,
    createdAt
  );
  return db.prepare("SELECT * FROM invoices WHERE id=?").get(id);
}

function escapePdfText(v) {
  return String(v || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdf(lines) {
  const contentLines = lines.map((l, i) => `1 0 0 1 50 ${780 - i * 18} Tm (${escapePdfText(l)}) Tj`).join("\n");
  const stream = `BT\n/F1 12 Tf\n${contentLines}\nET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function canAccessContract(user, contract) {
  return (
    user.role === "Admin" ||
    String(contract.client_id) === String(user.id) ||
    String(contract.freelancer_id) === String(user.id)
  );
}

function canAccessDispute(user, dispute, contract) {
  if (user.role === "Admin") return true;
  if (!contract) return false;
  if (String(dispute.opened_by) === String(user.id)) return true;
  if (String(dispute.against_user_id) === String(user.id)) return true;
  return canAccessContract(user, contract);
}

function socialCallbackSuccessHtml(token, user) {
  const safeToken = JSON.stringify(token);
  const safeUser = JSON.stringify(user);
  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taskora Login</title>
</head>
<body>
  <script>
    localStorage.setItem("taskora_token", ${safeToken});
    localStorage.setItem("taskora_user", JSON.stringify(${safeUser}));
    window.location.href = "/pages/dashboard.html";
  </script>
</body>
</html>`;
}

function socialCallbackErrorHtml(message) {
  const safe = String(message || "Social login failed");
  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taskora Login Error</title>
</head>
<body style="font-family:Arial,sans-serif;padding:24px;">
  <h2>Login failed</h2>
  <p>${safe}</p>
  <p><a href="/pages/login.html">Back to login</a></p>
</body>
</html>`;
}

async function findOrCreateSocialUser({ email, firstName, lastName, displayName, role }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("No email found from social provider");

  let row = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(normalizedEmail);
  if (!row) {
    const now = new Date().toISOString();
    const id = `U${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const safeRole = ["Freelancer", "Client", "Admin"].includes(String(role)) ? String(role) : "Freelancer";
    const first = String(firstName || displayName || "Social").trim();
    const last = String(lastName || "User").trim();
    const full = String(displayName || `${first} ${last}`).trim();
    const dummyHash = await bcrypt.hash(`social-oauth-${id}`, 10);

    const profile = {
      phone: "",
      gender: "Prefer not to say",
      birthDate: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      stateRegion: "",
      zipCode: "",
      country: "",
      residenceCountry: ""
    };
    const settings = {
      displayName: full,
      payoutEmail: normalizedEmail,
      payoutAccountNumber: "",
      phone: ""
    };

    db.prepare(`
      INSERT INTO users (id, first_name, middle_name, last_name, display_name, email, password_hash, role, profile_json, settings_json, created_at)
      VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, first, last, full, normalizedEmail, dummyHash, safeRole, JSON.stringify(profile), JSON.stringify(settings), now);

    row = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  }

  return normalizeUser(row);
}

async function verifyGoogleIdToken(idToken) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) {
    throw new Error("Invalid Google token");
  }

  const payload = await res.json();
  if (!payload || payload.aud !== googleClientId) {
    throw new Error("Google audience mismatch");
  }
  if (String(payload.email_verified || "false") !== "true") {
    throw new Error("Google email is not verified");
  }

  return payload;
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function adminRequired(req, res, next) {
  if (req.user?.role !== "Admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

function isClientLike(role) {
  return role === "Client" || role === "Admin";
}

function normalizeThreadPair(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort((a, b) => a.localeCompare(b));
}

function cleanFileName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-90);
}

function extensionFromMime(mimeType) {
  const m = String(mimeType || "").toLowerCase();
  if (m.includes("jpeg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("gif")) return "gif";
  return "bin";
}

function saveBase64Upload({ userId, kind, fileName, mimeType, dataUrl }) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  const base64 = match ? match[2] : raw;
  const mime = (match ? match[1] : mimeType) || "application/octet-stream";
  const buf = Buffer.from(base64, "base64");
  if (!buf.length) throw new Error("Invalid base64 file data");
  if (buf.length > 8 * 1024 * 1024) throw new Error("File too large (max 8MB)");

  const safeKind = String(kind || "other").toLowerCase();
  const safeName = cleanFileName(fileName || "upload");
  const ext = path.extname(safeName).replace(".", "") || extensionFromMime(mime);
  const userDir = path.join(uploadsDir, String(userId));
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  const id = `UP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const outName = `${id}.${ext}`;
  const outPath = path.join(userDir, outName);
  fs.writeFileSync(outPath, buf);
  const url = `/uploads/${encodeURIComponent(String(userId))}/${encodeURIComponent(outName)}`;
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO user_uploads (id, user_id, kind, original_name, mime_type, size_bytes, url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, safeKind, safeName, mime, buf.length, url, createdAt);

  return { id, userId, kind: safeKind, originalName: safeName, mimeType: mime, sizeBytes: buf.length, url, createdAt };
}

const defaultCategories = {
  freelance: ["Web Development", "Design", "Digital Marketing", "Development"],
  micro: ["Data Entry", "Social Tasks", "Testing", "Survey"]
};

async function sendResetEmail(email, token) {
  const from = process.env.MAIL_FROM || "no-reply@taskora.local";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #e3e8ef;border-radius:12px;">
      <h2 style="margin:0 0 12px;color:#0f6f66;">Taskora Password Reset</h2>
      <p style="margin:0 0 12px;color:#223445;">Use this one-time code to reset your password:</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:4px;background:#f4f8fb;padding:14px 18px;border-radius:10px;text-align:center;margin:12px 0;">
        ${token}
      </div>
      <p style="margin:0;color:#546274;">This code expires in 15 minutes. If you did not request this, ignore this email.</p>
    </div>
  `;
  const info = await mailer.sendMail({
    from,
    to: email,
    subject: "Taskora password reset code",
    text: `Your Taskora reset code is ${token}. This code expires in 15 minutes.`,
    html
  });

  if (!hasSmtp) {
    console.log("[MAILER DEV]", info.message?.toString() || info);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "taskora-api", db: "sqlite" });
});

app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) {
    return res.json({ query: "", jobs: [], gigs: [], categories: [], pages: [] });
  }

  const like = `%${q}%`;
  const jobs = db
    .prepare(
      `
      SELECT id, title, category, budget
      FROM jobs
      WHERE lower(title) LIKE ? OR lower(description) LIKE ? OR lower(category) LIKE ?
      ORDER BY datetime(created_at) DESC
      LIMIT 6
    `
    )
    .all(like, like, like)
    .map((r) => ({
      id: r.id,
      type: "job",
      title: r.title,
      subtitle: `${r.category} • ${r.budget}`,
      href: "/pages/jobs.html?q=" + encodeURIComponent(q)
    }));

  const gigs = db
    .prepare(
      `
      SELECT id, title, category, price
      FROM gigs
      WHERE lower(title) LIKE ? OR lower(category) LIKE ? OR lower(seller) LIKE ?
      ORDER BY rowid DESC
      LIMIT 6
    `
    )
    .all(like, like, like)
    .map((r) => ({
      id: r.id,
      type: "gig",
      title: r.title,
      subtitle: `${r.category} • ${r.price}`,
      href: "/pages/gigs.html"
    }));

  const categories = db
    .prepare(
      `
      SELECT id, mode, name
      FROM job_categories
      WHERE lower(name) LIKE ?
      ORDER BY datetime(created_at) DESC
      LIMIT 6
    `
    )
    .all(like)
    .map((r) => ({
      id: r.id,
      type: "category",
      title: r.name,
      subtitle: `${r.mode} category`,
      href: `/pages/jobs.html?mode=${encodeURIComponent(r.mode)}&q=${encodeURIComponent(r.name)}`
    }));

  const pages = [
    { label: "Jobs", href: "/pages/jobs.html", keys: "jobs work freelance micro" },
    { label: "Gigs", href: "/pages/gigs.html", keys: "gigs services offers" },
    { label: "Post Job", href: "/pages/post-job.html", keys: "post hire employer" },
    { label: "Dashboard", href: "/pages/dashboard.html", keys: "dashboard overview stats" },
    { label: "Settings", href: "/pages/settings.html", keys: "settings account security" },
    { label: "Contracts", href: "/pages/contracts.html", keys: "contract escrow milestone project" },
    { label: "Invoices", href: "/pages/invoices.html", keys: "invoice receipt billing payment" },
    { label: "Disputes", href: "/pages/disputes.html", keys: "dispute mediation issue resolution" },
    { label: "Timeline", href: "/pages/timeline.html", keys: "timeline activity updates feed history" },
    { label: "Messages", href: "/pages/messages.html", keys: "messages chat inbox conversation" },
    { label: "Worker Profile", href: "/pages/worker-profile.html", keys: "worker freelancer profile" },
    { label: "Employer Profile", href: "/pages/employer-profile.html", keys: "employer client profile" }
  ]
    .filter((p) => `${p.label} ${p.keys}`.toLowerCase().includes(q))
    .slice(0, 6)
    .map((p, idx) => ({
      id: `P${idx + 1}`,
      type: "page",
      title: p.label,
      subtitle: "Navigation",
      href: p.href
    }));

  return res.json({ query: q, jobs, gigs, categories, pages });
});

app.get("/api/categories", (req, res) => {
  const mode = String(req.query.mode || "").trim().toLowerCase();
  const rows = db
    .prepare("SELECT * FROM job_categories ORDER BY datetime(created_at) ASC")
    .all()
    .map((r) => ({ id: r.id, mode: r.mode, name: r.name, createdBy: r.created_by, createdAt: r.created_at }));

  if (mode === "freelance" || mode === "micro") {
    const fromDb = rows.filter((r) => r.mode === mode).map((r) => r.name);
    const merged = Array.from(new Set([...(defaultCategories[mode] || []), ...fromDb]));
    return res.json(merged);
  }

  const out = {
    freelance: Array.from(new Set([...(defaultCategories.freelance || []), ...rows.filter((r) => r.mode === "freelance").map((r) => r.name)])),
    micro: Array.from(new Set([...(defaultCategories.micro || []), ...rows.filter((r) => r.mode === "micro").map((r) => r.name)]))
  };
  return res.json(out);
});

app.post("/api/categories", authRequired, (req, res) => {
  if (!isClientLike(req.user.role)) {
    return res.status(403).json({ message: "Only Admin/Employer can add categories" });
  }

  const mode = String(req.body?.mode || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  if (!["freelance", "micro"].includes(mode)) {
    return res.status(400).json({ message: "Mode must be freelance or micro" });
  }
  if (!name) {
    return res.status(400).json({ message: "Category name is required" });
  }

  const exists = db
    .prepare("SELECT id FROM job_categories WHERE lower(mode)=lower(?) AND lower(name)=lower(?) LIMIT 1")
    .get(mode, name);
  if (exists) {
    return res.status(409).json({ message: "Category already exists" });
  }

  const id = `CAT${Date.now().toString().slice(-7)}`;
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO job_categories (id, mode, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, mode, name, req.user.email || req.user.id, createdAt);

  return res.status(201).json({ id, mode, name, createdBy: req.user.email || req.user.id, createdAt });
});

app.get("/api/auth/config", (_req, res) => {
  res.json({
    googleEnabled: Boolean(googleClientId),
    googleClientId: googleClientId || "",
    githubEnabled: Boolean(githubClientId && githubClientSecret),
    microsoftEnabled: Boolean(microsoftClientId && microsoftClientSecret)
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    email,
    password,
    role,
    phone,
    gender,
    birthDate,
    addressLine1,
    addressLine2,
    city,
    stateRegion,
    zipCode,
    country,
    residenceCountry
  } = req.body || {};

  const required = [firstName, lastName, email, password, role, gender, birthDate, addressLine1, stateRegion, zipCode, country];
  if (required.some((v) => !String(v || "").trim())) {
    return res.status(400).json({ message: "Please fill all required registration fields" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const exists = db.prepare("SELECT id FROM users WHERE lower(email)=lower(?)").get(String(email));
  if (exists) {
    return res.status(409).json({ message: "Email already exists" });
  }

  const now = new Date().toISOString();
  const id = `U${Date.now().toString().slice(-6)}`;
  const passwordHash = await bcrypt.hash(String(password), 10);
  const displayName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();

  const profile = {
    phone: String(phone || "").trim(),
    gender: String(gender).trim(),
    birthDate: String(birthDate).trim(),
    addressLine1: String(addressLine1).trim(),
    addressLine2: String(addressLine2 || "").trim(),
    city: String(city || "").trim(),
    stateRegion: String(stateRegion).trim(),
    zipCode: String(zipCode).trim(),
    country: String(country).trim(),
    residenceCountry: String(residenceCountry || country).trim()
  };

  const settings = {
    displayName,
    payoutEmail: String(email).trim(),
    payoutAccountNumber: "",
    phone: profile.phone
  };

  db.prepare(`
    INSERT INTO users (id, first_name, middle_name, last_name, display_name, email, password_hash, role, profile_json, settings_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(firstName).trim(),
    String(middleName || "").trim(),
    String(lastName).trim(),
    displayName,
    String(email).trim(),
    passwordHash,
    String(role).trim(),
    JSON.stringify(profile),
    JSON.stringify(settings),
    now
  );

  const user = normalizeUser(db.prepare("SELECT * FROM users WHERE id=?").get(id));
  const token = jwt.sign({ id: user.id, name: user.displayName, email: user.email, role: user.role }, jwtSecret, {
    expiresIn: "7d"
  });

  return res.status(201).json({ token, user: publicUser(user) });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const row = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(String(email));
  if (!row) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const user = normalizeUser(row);
  const matched = await bcrypt.compare(String(password), user.passwordHash);
  if (!matched) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, name: user.displayName, email: user.email, role: user.role }, jwtSecret, {
    expiresIn: "7d"
  });

  return res.json({ token, user: publicUser(user) });
});

app.post("/api/auth/google", authLimiter, async (req, res) => {
  if (!googleClientId) {
    return res.status(400).json({ message: "Google login is not configured on server" });
  }

  const { idToken, role } = req.body || {};
  if (!idToken) {
    return res.status(400).json({ message: "idToken is required" });
  }

  let g;
  try {
    g = await verifyGoogleIdToken(String(idToken));
  } catch (err) {
    return res.status(401).json({ message: err.message || "Google token verification failed" });
  }

  const email = String(g.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ message: "Google account has no email" });

  const user = await findOrCreateSocialUser({
    email,
    firstName: g.given_name || g.name,
    lastName: g.family_name || "User",
    displayName: g.name || "Google User",
    role
  });
  const token = jwt.sign({ id: user.id, name: user.displayName, email: user.email, role: user.role }, jwtSecret, {
    expiresIn: "7d"
  });

  return res.json({ token, user: publicUser(user) });
});

app.get("/api/auth/github/start", (req, res) => {
  if (!githubClientId || !githubClientSecret) {
    return res.status(400).json({ message: "GitHub login is not configured on server" });
  }

  const state = crypto.randomBytes(24).toString("hex");
  oauthStateStore.set(state, { provider: "github", role: String(req.query.role || "Freelancer"), createdAt: Date.now() });

  const callback = `${baseUrl}/api/auth/github/callback`;
  const authUrl =
    "https://github.com/login/oauth/authorize" +
    `?client_id=${encodeURIComponent(githubClientId)}` +
    `&redirect_uri=${encodeURIComponent(callback)}` +
    `&scope=${encodeURIComponent("read:user user:email")}` +
    `&state=${encodeURIComponent(state)}`;

  return res.redirect(authUrl);
});

app.get("/api/auth/github/callback", async (req, res) => {
  const { code, state } = req.query || {};
  const saved = oauthStateStore.get(String(state || ""));
  oauthStateStore.delete(String(state || ""));

  if (!saved || saved.provider !== "github") {
    return res.status(400).send(socialCallbackErrorHtml("Invalid OAuth state for GitHub."));
  }
  if (!code) {
    return res.status(400).send(socialCallbackErrorHtml("GitHub code missing."));
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: githubClientId,
        client_secret: githubClientSecret,
        code: String(code),
        redirect_uri: `${baseUrl}/api/auth/github/callback`
      })
    });
    const tokenOut = await tokenRes.json();
    if (!tokenRes.ok || !tokenOut.access_token) {
      throw new Error(tokenOut.error_description || "Failed to exchange GitHub token");
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenOut.access_token}`, "User-Agent": "taskora-app" }
    });
    const ghUser = await userRes.json();
    if (!userRes.ok) throw new Error("Failed to fetch GitHub profile");

    let email = String(ghUser.email || "").trim().toLowerCase();
    if (!email) {
      const emRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tokenOut.access_token}`, "User-Agent": "taskora-app" }
      });
      const emOut = await emRes.json();
      const primary = Array.isArray(emOut) ? emOut.find((e) => e.primary && e.verified) || emOut.find((e) => e.verified) : null;
      email = String(primary?.email || "").trim().toLowerCase();
    }
    if (!email) throw new Error("GitHub account has no verified email");

    const fullName = String(ghUser.name || ghUser.login || "GitHub User").trim();
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || "User";
    const user = await findOrCreateSocialUser({
      email,
      firstName,
      lastName,
      displayName: fullName,
      role: saved.role
    });
    const token = jwt.sign({ id: user.id, name: user.displayName, email: user.email, role: user.role }, jwtSecret, {
      expiresIn: "7d"
    });

    return res.send(socialCallbackSuccessHtml(token, publicUser(user)));
  } catch (err) {
    return res.status(400).send(socialCallbackErrorHtml(err.message || "GitHub login failed"));
  }
});

app.get("/api/auth/microsoft/start", (req, res) => {
  if (!microsoftClientId || !microsoftClientSecret) {
    return res.status(400).json({ message: "Microsoft login is not configured on server" });
  }

  const state = crypto.randomBytes(24).toString("hex");
  oauthStateStore.set(state, {
    provider: "microsoft",
    role: String(req.query.role || "Freelancer"),
    createdAt: Date.now()
  });

  const callback = `${baseUrl}/api/auth/microsoft/callback`;
  const authUrl =
    `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenantId)}/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(microsoftClientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(callback)}` +
    `&response_mode=query` +
    `&scope=${encodeURIComponent("openid profile email User.Read")}` +
    `&state=${encodeURIComponent(state)}`;

  return res.redirect(authUrl);
});

app.get("/api/auth/microsoft/callback", async (req, res) => {
  const { code, state } = req.query || {};
  const saved = oauthStateStore.get(String(state || ""));
  oauthStateStore.delete(String(state || ""));

  if (!saved || saved.provider !== "microsoft") {
    return res.status(400).send(socialCallbackErrorHtml("Invalid OAuth state for Microsoft."));
  }
  if (!code) {
    return res.status(400).send(socialCallbackErrorHtml("Microsoft code missing."));
  }

  try {
    const callback = `${baseUrl}/api/auth/microsoft/callback`;
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: microsoftClientId,
          client_secret: microsoftClientSecret,
          code: String(code),
          redirect_uri: callback,
          grant_type: "authorization_code",
          scope: "openid profile email User.Read"
        })
      }
    );
    const tokenOut = await tokenRes.json();
    if (!tokenRes.ok || !tokenOut.access_token) {
      throw new Error(tokenOut.error_description || "Failed to exchange Microsoft token");
    }

    const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,givenName,surname,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokenOut.access_token}` }
    });
    const me = await meRes.json();
    if (!meRes.ok) throw new Error("Failed to fetch Microsoft profile");

    const email = String(me.mail || me.userPrincipalName || "").trim().toLowerCase();
    if (!email) throw new Error("Microsoft account has no email");

    const user = await findOrCreateSocialUser({
      email,
      firstName: me.givenName || me.displayName,
      lastName: me.surname || "User",
      displayName: me.displayName || `${me.givenName || ""} ${me.surname || ""}`.trim(),
      role: saved.role
    });
    const token = jwt.sign({ id: user.id, name: user.displayName, email: user.email, role: user.role }, jwtSecret, {
      expiresIn: "7d"
    });

    return res.send(socialCallbackSuccessHtml(token, publicUser(user)));
  } catch (err) {
    return res.status(400).send(socialCallbackErrorHtml(err.message || "Microsoft login failed"));
  }
});

app.post("/api/auth/forgot-password", resetLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const row = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(String(email));
  if (!row) {
    return res.json({ message: "If your email exists, password reset instructions were sent." });
  }

  const user = normalizeUser(row);
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO password_resets (id, user_id, email, token, used, created_at, expires_at, used_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, NULL)
  `).run(`PR${Date.now().toString().slice(-6)}`, user.id, user.email, token, now, expiresAt);

  await sendResetEmail(user.email, token);

  const out = { message: "Reset code sent to your email." };
  if (!isProd && !hasSmtp) out.debugToken = token;
  return res.json(out);
});

app.post("/api/auth/reset-password", resetLimiter, async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ message: "Token and new password are required" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const reset = db
    .prepare("SELECT * FROM password_resets WHERE token=? AND used=0 ORDER BY datetime(created_at) DESC LIMIT 1")
    .get(String(token));
  if (!reset) {
    return res.status(400).json({ message: "Invalid reset token" });
  }
  if (new Date(reset.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ message: "Reset token expired" });
  }

  const newHash = await bcrypt.hash(String(newPassword), 10);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(newHash, reset.user_id);
  db.prepare("UPDATE password_resets SET used=1, used_at=? WHERE id=?").run(new Date().toISOString(), reset.id);
  return res.json({ message: "Password reset successful. Please login." });
});

app.get("/api/jobs", (_req, res) => {
  const q = String(_req.query.q || "").trim().toLowerCase();
  const category = String(_req.query.category || "").trim().toLowerCase();
  const level = String(_req.query.level || "").trim().toLowerCase();
  const type = String(_req.query.type || "").trim().toLowerCase();
  const budgetMin = Number(_req.query.budgetMin || "");
  const budgetMax = Number(_req.query.budgetMax || "");
  const mode = String(_req.query.mode || "").trim().toLowerCase();

  const categoryRows = db.prepare("SELECT mode, name FROM job_categories").all();
  const microCategories = new Set(
    [...(defaultCategories.micro || []), ...categoryRows.filter((r) => r.mode === "micro").map((r) => r.name)].map((v) =>
      String(v).toLowerCase()
    )
  );

  function parseBudgetValue(budgetText) {
    const n = Number(String(budgetText || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function inferMode(categoryName) {
    return microCategories.has(String(categoryName || "").toLowerCase()) ? "micro" : "freelance";
  }

  const rows = db
    .prepare(`
      SELECT j.*, COUNT(b.id) AS bid_count
      FROM jobs j
      LEFT JOIN bids b ON b.job_id = j.id
      GROUP BY j.id
      ORDER BY datetime(j.created_at) DESC
    `)
    .all();

  const out = rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      budget: r.budget,
      category: r.category,
      level: r.level,
      type: r.type,
      description: r.description,
      createdAt: r.created_at,
      postedBy: r.posted_by,
      postedById: r.posted_by_id,
      posted: postedAgo(r.created_at),
      bidCount: Number(r.bid_count || 0),
      mode: inferMode(r.category)
    }))
    .filter((row) => {
      const matchQ =
        !q ||
        row.title.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q);
      const matchCategory = !category || row.category.toLowerCase() === category;
      const matchLevel = !level || row.level.toLowerCase() === level;
      const matchType = !type || row.type.toLowerCase() === type;
      const amount = parseBudgetValue(row.budget);
      const matchMin = !Number.isFinite(budgetMin) || budgetMin <= 0 || amount >= budgetMin;
      const matchMax = !Number.isFinite(budgetMax) || budgetMax <= 0 || amount <= budgetMax;
      const matchMode = !mode || (mode === "micro" || mode === "freelance" ? row.mode === mode : true);
      return matchQ && matchCategory && matchLevel && matchType && matchMin && matchMax && matchMode;
    });
  res.json(out);
});

app.post("/api/jobs", authRequired, (req, res) => {
  if (!isClientLike(req.user.role)) {
    return res.status(403).json({ message: "Only Client/Admin can post jobs" });
  }

  const { title, budget, category, level, type, description } = req.body || {};
  if (!title || !budget || !category || !level || !type || !description) {
    return res.status(400).json({ message: "All job fields are required" });
  }

  const id = `J${Date.now().toString().slice(-6)}`;
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO jobs (id, title, budget, category, level, type, description, created_at, posted_by, posted_by_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, budget, category, level, type, description, createdAt, req.user.name, req.user.id);

  return res.status(201).json({
    id,
    title,
    budget,
    category,
    level,
    type,
    description,
    createdAt,
    posted: "just now",
    postedBy: req.user.name,
    postedById: req.user.id
  });
});

app.get("/api/gigs", (_req, res) => {
  const gigs = db.prepare("SELECT * FROM gigs ORDER BY rowid DESC").all().map((g) => ({
    id: g.id,
    title: g.title,
    price: g.price,
    seller: g.seller,
    rating: g.rating,
    category: g.category,
    delivery: g.delivery
  }));
  res.json(gigs);
});

app.post("/api/bids", authRequired, (req, res) => {
  const { jobId, coverLetter, amount, deliveryDays } = req.body || {};
  if (!jobId || !coverLetter || !amount || !deliveryDays) {
    return res.status(400).json({ message: "All bid fields are required" });
  }

  const job = db.prepare("SELECT id FROM jobs WHERE id=?").get(jobId);
  if (!job) return res.status(404).json({ message: "Job not found" });

  const exists = db.prepare("SELECT id FROM bids WHERE job_id=? AND user_id=?").get(jobId, req.user.id);
  if (exists) return res.status(409).json({ message: "You already submitted a bid for this job" });

  const bid = {
    id: `B${Date.now().toString().slice(-6)}`,
    jobId,
    userId: req.user.id,
    freelancerName: req.user.name,
    freelancerEmail: req.user.email,
    amount,
    deliveryDays: String(deliveryDays),
    coverLetter,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: null
  };

  db.prepare(`
    INSERT INTO bids (id, job_id, user_id, freelancer_name, freelancer_email, amount, delivery_days, cover_letter, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    bid.id,
    bid.jobId,
    bid.userId,
    bid.freelancerName,
    bid.freelancerEmail,
    bid.amount,
    bid.deliveryDays,
    bid.coverLetter,
    bid.status,
    bid.createdAt,
    bid.updatedAt
  );

  return res.status(201).json(bid);
});

app.get("/api/jobs/:jobId/bids", authRequired, (req, res) => {
  const out = db
    .prepare("SELECT * FROM bids WHERE job_id=? ORDER BY datetime(created_at) DESC")
    .all(req.params.jobId)
    .map((b) => ({
      id: b.id,
      jobId: b.job_id,
      userId: b.user_id,
      freelancerName: b.freelancer_name,
      freelancerEmail: b.freelancer_email,
      amount: b.amount,
      deliveryDays: b.delivery_days,
      coverLetter: b.cover_letter,
      status: b.status,
      createdAt: b.created_at,
      updatedAt: b.updated_at
    }));
  res.json(out);
});

app.get("/api/my-bids", authRequired, (req, res) => {
  const out = db
    .prepare(`
      SELECT b.*, j.title AS job_title, j.budget AS job_budget, j.posted_by AS posted_by
      FROM bids b
      LEFT JOIN jobs j ON j.id = b.job_id
      WHERE b.user_id = ?
      ORDER BY datetime(b.created_at) DESC
    `)
    .all(req.user.id)
    .map((r) => ({
      id: r.id,
      jobId: r.job_id,
      userId: r.user_id,
      freelancerName: r.freelancer_name,
      freelancerEmail: r.freelancer_email,
      amount: r.amount,
      deliveryDays: r.delivery_days,
      coverLetter: r.cover_letter,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      jobTitle: r.job_title || "Unknown Job",
      jobBudget: r.job_budget || "-",
      postedBy: r.posted_by || "-"
    }));
  res.json(out);
});

app.get("/api/client/bids", authRequired, (req, res) => {
  const out = db
    .prepare(`
      SELECT b.*, j.title AS job_title, j.budget AS job_budget
      FROM bids b
      JOIN jobs j ON j.id = b.job_id
      WHERE j.posted_by_id = ? OR j.posted_by = ?
      ORDER BY datetime(b.created_at) DESC
    `)
    .all(req.user.id, req.user.name)
    .map((r) => ({
      id: r.id,
      jobId: r.job_id,
      userId: r.user_id,
      freelancerName: r.freelancer_name,
      freelancerEmail: r.freelancer_email,
      amount: r.amount,
      deliveryDays: r.delivery_days,
      coverLetter: r.cover_letter,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      jobTitle: r.job_title || "Unknown Job",
      jobBudget: r.job_budget || "-"
    }));
  res.json(out);
});

app.patch("/api/bids/:bidId/status", authRequired, (req, res) => {
  const { status } = req.body || {};
  if (!["accepted", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Status must be accepted or rejected" });
  }

  const bid = db.prepare("SELECT * FROM bids WHERE id=?").get(req.params.bidId);
  if (!bid) return res.status(404).json({ message: "Bid not found" });

  const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(bid.job_id);
  if (!job) return res.status(404).json({ message: "Job not found" });

  const isOwner = job.posted_by_id === req.user.id || job.posted_by === req.user.name;
  if (!isOwner) return res.status(403).json({ message: "Only job owner can update bid status" });

  const updatedAt = new Date().toISOString();
  db.prepare("UPDATE bids SET status=?, updated_at=? WHERE id=?").run(status, updatedAt, bid.id);

  return res.json({
    id: bid.id,
    jobId: bid.job_id,
    userId: bid.user_id,
    freelancerName: bid.freelancer_name,
    freelancerEmail: bid.freelancer_email,
    amount: bid.amount,
    deliveryDays: bid.delivery_days,
    coverLetter: bid.cover_letter,
    status,
    createdAt: bid.created_at,
    updatedAt
  });
});

app.post("/api/contracts/from-bid", authRequired, (req, res) => {
  if (!isClientLike(req.user.role)) {
    return res.status(403).json({ message: "Only Client/Admin can create contracts" });
  }

  const bidId = String(req.body?.bidId || "").trim();
  const customTitle = String(req.body?.title || "").trim();
  const customEscrow = Number(req.body?.escrowTotal || "");
  if (!bidId) return res.status(400).json({ message: "bidId is required" });

  const bid = db.prepare("SELECT * FROM bids WHERE id=?").get(bidId);
  if (!bid) return res.status(404).json({ message: "Bid not found" });
  if (String(bid.status) !== "accepted") {
    return res.status(400).json({ message: "Only accepted bid can be converted to contract" });
  }

  const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(bid.job_id);
  if (!job) return res.status(404).json({ message: "Job not found" });

  const isOwner = String(job.posted_by_id) === String(req.user.id) || String(job.posted_by) === String(req.user.name);
  if (!isOwner && req.user.role !== "Admin") {
    return res.status(403).json({ message: "Only job owner can create contract from this bid" });
  }

  const existing = db.prepare("SELECT * FROM contracts WHERE bid_id=?").get(bid.id);
  if (existing) {
    return res.status(409).json({ message: "Contract already exists for this bid", contractId: existing.id });
  }

  const inferredEscrow = parseMoneyValue(bid.amount) || parseMoneyValue(job.budget) || 0;
  const escrowTotal = Number.isFinite(customEscrow) && customEscrow > 0 ? customEscrow : inferredEscrow;
  if (escrowTotal <= 0) {
    return res.status(400).json({ message: "Escrow total is invalid. Provide escrowTotal." });
  }

  const id = `C${Date.now().toString().slice(-8)}`;
  const now = new Date().toISOString();
  const title = customTitle || `${job.title} - Contract`;
  db.prepare(`
    INSERT INTO contracts (id, job_id, bid_id, client_id, freelancer_id, title, escrow_total, escrow_released, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)
  `).run(id, job.id, bid.id, job.posted_by_id || req.user.id, bid.user_id, title, escrowTotal, now, now);

  addContractTransaction(id, req.user.id, "contract_created", escrowTotal, `Created from bid ${bid.id}`);

  return res.status(201).json({
    id,
    jobId: job.id,
    bidId: bid.id,
    title,
    clientId: job.posted_by_id || req.user.id,
    freelancerId: bid.user_id,
    escrowTotal,
    escrowReleased: 0,
    escrowRemaining: escrowTotal,
    status: "active",
    createdAt: now,
    updatedAt: now
  });
});

app.get("/api/contracts/candidates", authRequired, (req, res) => {
  if (!isClientLike(req.user.role)) {
    return res.status(403).json({ message: "Only Client/Admin can view contract candidates" });
  }

  const rows = db
    .prepare(
      `
      SELECT b.*, j.title AS job_title, j.posted_by_id, j.posted_by
      FROM bids b
      JOIN jobs j ON j.id = b.job_id
      WHERE b.status='accepted' AND (j.posted_by_id=? OR j.posted_by=? OR ?='Admin')
      ORDER BY datetime(COALESCE(b.updated_at,b.created_at)) DESC
    `
    )
    .all(req.user.id, req.user.name, req.user.role)
    .filter((r) => !db.prepare("SELECT id FROM contracts WHERE bid_id=? LIMIT 1").get(r.id))
    .map((r) => ({
      bidId: r.id,
      jobId: r.job_id,
      freelancerId: r.user_id,
      freelancerName: r.freelancer_name,
      amount: r.amount,
      deliveryDays: r.delivery_days,
      updatedAt: r.updated_at || r.created_at,
      label: `${r.id} • ${r.job_title} • ${r.freelancer_name} • ${r.amount}`
    }));

  return res.json(rows);
});

app.get("/api/contracts", authRequired, (req, res) => {
  const baseRows = req.user.role === "Admin"
    ? db.prepare("SELECT * FROM contracts ORDER BY datetime(updated_at) DESC").all()
    : db
        .prepare("SELECT * FROM contracts WHERE client_id=? OR freelancer_id=? ORDER BY datetime(updated_at) DESC")
        .all(req.user.id, req.user.id);

  const out = baseRows.map((c) => {
    const job = db.prepare("SELECT title, posted_by FROM jobs WHERE id=?").get(c.job_id);
    const client = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(c.client_id);
    const freelancer = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(c.freelancer_id);
    const milestoneStats = db
      .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved FROM milestones WHERE contract_id=?")
      .get(c.id);
    const escrowTotal = Number(c.escrow_total || 0);
    const escrowReleased = Number(c.escrow_released || 0);

    return {
      id: c.id,
      jobId: c.job_id,
      bidId: c.bid_id,
      title: c.title,
      jobTitle: job?.title || "Job",
      clientId: c.client_id,
      clientName: client?.display_name || "Client",
      clientEmail: client?.email || "",
      freelancerId: c.freelancer_id,
      freelancerName: freelancer?.display_name || "Freelancer",
      freelancerEmail: freelancer?.email || "",
      escrowTotal,
      escrowReleased,
      escrowRemaining: Math.max(0, escrowTotal - escrowReleased),
      status: c.status,
      milestoneTotal: Number(milestoneStats?.total || 0),
      milestoneApproved: Number(milestoneStats?.approved || 0),
      createdAt: c.created_at,
      updatedAt: c.updated_at
    };
  });

  return res.json(out);
});

app.patch("/api/contracts/:contractId/status", authRequired, (req, res) => {
  const status = String(req.body?.status || "").trim().toLowerCase();
  if (!["active", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ message: "Invalid contract status" });
  }

  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  const canManage = req.user.role === "Admin" || String(c.client_id) === String(req.user.id);
  if (!canManage) return res.status(403).json({ message: "Only client/admin can change contract status" });

  if (status === "completed") {
    const pending = db
      .prepare("SELECT COUNT(*) AS n FROM milestones WHERE contract_id=? AND status!='approved'")
      .get(c.id).n;
    if (Number(pending) > 0) {
      return res.status(400).json({ message: "All milestones must be approved before completion" });
    }
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE contracts SET status=?, updated_at=? WHERE id=?").run(status, now, c.id);
  addContractTransaction(c.id, req.user.id, "contract_status_changed", 0, `Status: ${status}`);
  return res.json({ message: "Contract status updated", id: c.id, status, updatedAt: now });
});

app.get("/api/contracts/:contractId/milestones", authRequired, (req, res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  const permitted =
    req.user.role === "Admin" || String(c.client_id) === String(req.user.id) || String(c.freelancer_id) === String(req.user.id);
  if (!permitted) return res.status(403).json({ message: "Access denied" });

  const out = db
    .prepare("SELECT * FROM milestones WHERE contract_id=? ORDER BY datetime(created_at) ASC")
    .all(c.id)
    .map((m) => ({
      id: m.id,
      contractId: m.contract_id,
      title: m.title,
      amount: Number(m.amount || 0),
      dueDate: m.due_date,
      status: m.status,
      proofUrl: m.proof_url || "",
      proofNote: m.proof_note || "",
      submittedAt: m.submitted_at || "",
      createdAt: m.created_at,
      updatedAt: m.updated_at
    }));
  return res.json(out);
});

app.post("/api/contracts/:contractId/milestones", authRequired, (req, res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  const canCreate = req.user.role === "Admin" || String(c.client_id) === String(req.user.id);
  if (!canCreate) return res.status(403).json({ message: "Only client/admin can add milestones" });

  const title = String(req.body?.title || "").trim();
  const amount = Number(req.body?.amount || "");
  const dueDate = String(req.body?.dueDate || "").trim();
  if (!title || !Number.isFinite(amount) || amount <= 0 || !dueDate) {
    return res.status(400).json({ message: "title, amount and dueDate are required" });
  }

  const current = db.prepare("SELECT SUM(amount) AS sum FROM milestones WHERE contract_id=?").get(c.id);
  const used = Number(current?.sum || 0);
  const total = Number(c.escrow_total || 0);
  if (used + amount > total + 0.0001) {
    return res.status(400).json({ message: "Milestone total exceeds escrow amount" });
  }

  const id = `MS${Date.now().toString().slice(-9)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO milestones (id, contract_id, title, amount, due_date, status, proof_url, proof_note, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', '', '', NULL, ?, ?)
  `).run(id, c.id, title, amount, dueDate, now, now);
  db.prepare("UPDATE contracts SET updated_at=? WHERE id=?").run(now, c.id);
  addContractTransaction(c.id, req.user.id, "milestone_added", amount, title);

  return res.status(201).json({
    id,
    contractId: c.id,
    title,
    amount,
    dueDate,
    status: "pending",
    createdAt: now,
    updatedAt: now
  });
});

app.post("/api/contracts/:contractId/milestones/:milestoneId/proof", authRequired, (req, res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  const m = db.prepare("SELECT * FROM milestones WHERE id=? AND contract_id=?").get(req.params.milestoneId, c.id);
  if (!m) return res.status(404).json({ message: "Milestone not found" });
  const isFreelancer = req.user.role === "Admin" || String(c.freelancer_id) === String(req.user.id);
  if (!isFreelancer) return res.status(403).json({ message: "Only freelancer/admin can submit milestone proof" });
  if (String(m.status) === "approved") return res.status(400).json({ message: "Approved milestone cannot be modified" });

  const proofUrl = String(req.body?.proofUrl || "").trim();
  const proofNote = String(req.body?.proofNote || "").trim();
  const markSubmitted = req.body?.markSubmitted !== false;
  if (!proofUrl && !proofNote) {
    return res.status(400).json({ message: "Provide proofUrl or proofNote" });
  }

  const now = new Date().toISOString();
  const nextStatus = markSubmitted ? "submitted" : String(m.status || "pending");
  db.prepare(`
    UPDATE milestones
    SET proof_url=?, proof_note=?, submitted_at=?, status=?, updated_at=?
    WHERE id=?
  `).run(proofUrl, proofNote, now, nextStatus, now, m.id);
  db.prepare("UPDATE contracts SET updated_at=? WHERE id=?").run(now, c.id);
  addContractTransaction(c.id, req.user.id, "milestone_submitted", Number(m.amount || 0), proofNote || "Proof submitted");

  return res.json({
    message: "Milestone proof submitted",
    id: m.id,
    contractId: c.id,
    status: nextStatus,
    proofUrl,
    proofNote,
    submittedAt: now,
    updatedAt: now
  });
});

app.patch("/api/contracts/:contractId/milestones/:milestoneId", authRequired, (req, res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  const m = db.prepare("SELECT * FROM milestones WHERE id=? AND contract_id=?").get(req.params.milestoneId, c.id);
  if (!m) return res.status(404).json({ message: "Milestone not found" });
  const canEdit = req.user.role === "Admin" || String(c.client_id) === String(req.user.id);
  if (!canEdit) return res.status(403).json({ message: "Only client/admin can edit milestones" });
  if (String(m.status) === "approved") {
    return res.status(400).json({ message: "Approved milestone cannot be edited" });
  }

  const title = String(req.body?.title || m.title).trim();
  const dueDate = String(req.body?.dueDate || m.due_date).trim();
  const amount = Number(req.body?.amount ?? m.amount);
  if (!title || !dueDate || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "title, amount and dueDate are required" });
  }

  const others = db
    .prepare("SELECT SUM(amount) AS sum FROM milestones WHERE contract_id=? AND id<>?")
    .get(c.id, m.id);
  const used = Number(others?.sum || 0);
  const total = Number(c.escrow_total || 0);
  if (used + amount > total + 0.0001) {
    return res.status(400).json({ message: "Milestone total exceeds escrow amount" });
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE milestones SET title=?, amount=?, due_date=?, updated_at=? WHERE id=?").run(title, amount, dueDate, now, m.id);
  db.prepare("UPDATE contracts SET updated_at=? WHERE id=?").run(now, c.id);
  addContractTransaction(c.id, req.user.id, "milestone_updated", amount, title);

  return res.json({ message: "Milestone updated", id: m.id, contractId: c.id, title, amount, dueDate, updatedAt: now });
});

app.delete("/api/contracts/:contractId/milestones/:milestoneId", authRequired, (req, res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  const m = db.prepare("SELECT * FROM milestones WHERE id=? AND contract_id=?").get(req.params.milestoneId, c.id);
  if (!m) return res.status(404).json({ message: "Milestone not found" });
  const canDelete = req.user.role === "Admin" || String(c.client_id) === String(req.user.id);
  if (!canDelete) return res.status(403).json({ message: "Only client/admin can delete milestones" });
  if (String(m.status) === "approved") {
    return res.status(400).json({ message: "Approved milestone cannot be deleted" });
  }

  db.prepare("DELETE FROM milestones WHERE id=?").run(m.id);
  const now = new Date().toISOString();
  db.prepare("UPDATE contracts SET updated_at=? WHERE id=?").run(now, c.id);
  addContractTransaction(c.id, req.user.id, "milestone_deleted", Number(m.amount || 0), m.title || "");
  return res.json({ message: "Milestone deleted", id: m.id, contractId: c.id });
});

app.patch("/api/contracts/:contractId/milestones/:milestoneId/status", authRequired, (req, res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  const m = db.prepare("SELECT * FROM milestones WHERE id=? AND contract_id=?").get(req.params.milestoneId, c.id);
  if (!m) return res.status(404).json({ message: "Milestone not found" });

  const status = String(req.body?.status || "").trim().toLowerCase();
  if (!["submitted", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid milestone status" });
  }

  const isFreelancer = String(c.freelancer_id) === String(req.user.id);
  const isClient = String(c.client_id) === String(req.user.id) || req.user.role === "Admin";
  if (status === "submitted" && !isFreelancer) {
    return res.status(403).json({ message: "Only freelancer can submit milestone delivery" });
  }
  if ((status === "approved" || status === "rejected") && !isClient) {
    return res.status(403).json({ message: "Only client/admin can approve or reject milestone" });
  }
  if (status === "approved" && String(m.status) !== "submitted") {
    return res.status(400).json({ message: "Milestone must be submitted before approval" });
  }

  const now = new Date().toISOString();
  if (status === "submitted") {
    const proofUrl = String(req.body?.proofUrl || m.proof_url || "").trim();
    const proofNote = String(req.body?.proofNote || m.proof_note || "").trim();
    db.prepare("UPDATE milestones SET status=?, proof_url=?, proof_note=?, submitted_at=?, updated_at=? WHERE id=?").run(
      status,
      proofUrl,
      proofNote,
      now,
      now,
      m.id
    );
  } else {
    db.prepare("UPDATE milestones SET status=?, updated_at=? WHERE id=?").run(status, now, m.id);
  }

  if (status === "approved") {
    const nextReleased = Number(c.escrow_released || 0) + Number(m.amount || 0);
    db.prepare("UPDATE contracts SET escrow_released=?, updated_at=? WHERE id=?").run(nextReleased, now, c.id);
    addContractTransaction(c.id, req.user.id, "milestone_approved", Number(m.amount || 0), m.title || "");
    const invoice = createInvoiceForMilestone(c, m, `Payment for ${m.title || "milestone"}`);
    addContractTransaction(c.id, req.user.id, "invoice_created", Number(m.amount || 0), invoice.id);
  } else {
    db.prepare("UPDATE contracts SET updated_at=? WHERE id=?").run(now, c.id);
    addContractTransaction(c.id, req.user.id, `milestone_${status}`, Number(m.amount || 0), m.title || "");
  }

  return res.json({ message: "Milestone status updated", id: m.id, contractId: c.id, status, updatedAt: now });
});

app.get("/api/contracts/:contractId/transactions", authRequired, (req, res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  const permitted =
    req.user.role === "Admin" || String(c.client_id) === String(req.user.id) || String(c.freelancer_id) === String(req.user.id);
  if (!permitted) return res.status(403).json({ message: "Access denied" });

  const out = db
    .prepare(
      `
      SELECT t.*, u.display_name AS actor_name, u.email AS actor_email
      FROM contract_transactions t
      LEFT JOIN users u ON u.id = t.actor_id
      WHERE t.contract_id=?
      ORDER BY datetime(t.created_at) DESC
      LIMIT 100
    `
    )
    .all(c.id)
    .map((r) => ({
      id: r.id,
      contractId: r.contract_id,
      actorId: r.actor_id,
      actorName: r.actor_name || "User",
      actorEmail: r.actor_email || "",
      action: r.action,
      amount: Number(r.amount || 0),
      note: r.note || "",
      createdAt: r.created_at
    }));

  return res.json(out);
});

app.post("/api/contracts/:contractId/disputes", authRequired, (req, res) => {
  const contract = db.prepare("SELECT * FROM contracts WHERE id=?").get(req.params.contractId);
  if (!contract) return res.status(404).json({ message: "Contract not found" });
  if (!canAccessContract(req.user, contract)) return res.status(403).json({ message: "Access denied" });
  if (String(contract.status) === "cancelled") {
    return res.status(400).json({ message: "Cannot open dispute on cancelled contract" });
  }

  const existingOpen = db
    .prepare("SELECT id FROM disputes WHERE contract_id=? AND status IN ('open','under_review') ORDER BY datetime(created_at) DESC LIMIT 1")
    .get(contract.id);
  if (existingOpen) {
    return res.status(409).json({ message: "An active dispute already exists for this contract", disputeId: existingOpen.id });
  }

  const reason = String(req.body?.reason || "").trim();
  const description = String(req.body?.description || "").trim();
  if (!reason || !description) {
    return res.status(400).json({ message: "reason and description are required" });
  }

  const againstUserId =
    String(contract.client_id) === String(req.user.id) ? String(contract.freelancer_id) : String(contract.client_id);
  const id = `D${Date.now().toString().slice(-9)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO disputes (id, contract_id, opened_by, against_user_id, reason, description, status, winner_user_id, amount_awarded, resolution_note, resolved_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, 0, '', NULL, ?, ?)
  `).run(id, contract.id, req.user.id, againstUserId, reason, description, now, now);

  const intro = String(req.body?.firstMessage || "").trim();
  if (intro) {
    const mid = `DM${Date.now().toString().slice(-10)}`;
    db.prepare(`
      INSERT INTO dispute_messages (id, dispute_id, sender_id, message, is_admin_note, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(mid, id, req.user.id, intro, now);
  }

  addContractTransaction(contract.id, req.user.id, "dispute_opened", 0, reason);
  return res.status(201).json({
    id,
    contractId: contract.id,
    openedBy: req.user.id,
    againstUserId,
    reason,
    description,
    status: "open",
    createdAt: now,
    updatedAt: now
  });
});

app.get("/api/disputes", authRequired, (req, res) => {
  const rows = req.user.role === "Admin"
    ? db.prepare("SELECT * FROM disputes ORDER BY datetime(updated_at) DESC").all()
    : db
        .prepare("SELECT * FROM disputes WHERE opened_by=? OR against_user_id=? ORDER BY datetime(updated_at) DESC")
        .all(req.user.id, req.user.id);

  const out = rows.map((d) => {
    const c = db.prepare("SELECT id, title, client_id, freelancer_id FROM contracts WHERE id=?").get(d.contract_id);
    const openedBy = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(d.opened_by);
    const against = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(d.against_user_id);
    return {
      id: d.id,
      contractId: d.contract_id,
      contractTitle: c?.title || "Contract",
      openedBy: d.opened_by,
      openedByName: openedBy?.display_name || "User",
      openedByEmail: openedBy?.email || "",
      againstUserId: d.against_user_id,
      againstName: against?.display_name || "User",
      againstEmail: against?.email || "",
      reason: d.reason,
      description: d.description,
      status: d.status,
      winnerUserId: d.winner_user_id || "",
      amountAwarded: Number(d.amount_awarded || 0),
      resolutionNote: d.resolution_note || "",
      resolvedBy: d.resolved_by || "",
      createdAt: d.created_at,
      updatedAt: d.updated_at
    };
  });

  return res.json(out);
});

app.get("/api/disputes/:disputeId", authRequired, (req, res) => {
  const d = db.prepare("SELECT * FROM disputes WHERE id=?").get(req.params.disputeId);
  if (!d) return res.status(404).json({ message: "Dispute not found" });
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(d.contract_id);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  if (!canAccessDispute(req.user, d, c)) return res.status(403).json({ message: "Access denied" });

  const openedBy = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(d.opened_by);
  const against = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(d.against_user_id);
  const messages = db
    .prepare(
      `
      SELECT m.*, u.display_name AS sender_name, u.email AS sender_email
      FROM dispute_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.dispute_id=?
      ORDER BY datetime(m.created_at) ASC
    `
    )
    .all(d.id)
    .map((m) => ({
      id: m.id,
      disputeId: m.dispute_id,
      senderId: m.sender_id,
      senderName: m.sender_name || "User",
      senderEmail: m.sender_email || "",
      message: m.message,
      isAdminNote: Boolean(m.is_admin_note),
      createdAt: m.created_at
    }));

  const evidence = db
    .prepare(
      `
      SELECT id, title, amount, due_date, status, proof_url, proof_note, submitted_at, updated_at
      FROM milestones
      WHERE contract_id=? AND (length(COALESCE(proof_url,''))>0 OR length(COALESCE(proof_note,''))>0)
      ORDER BY datetime(updated_at) DESC
    `
    )
    .all(c.id)
    .map((m) => ({
      milestoneId: m.id,
      title: m.title,
      amount: Number(m.amount || 0),
      dueDate: m.due_date,
      status: m.status,
      proofUrl: m.proof_url || "",
      proofNote: m.proof_note || "",
      submittedAt: m.submitted_at || "",
      updatedAt: m.updated_at
    }));

  return res.json({
    dispute: {
      id: d.id,
      contractId: d.contract_id,
      contractTitle: c.title || "Contract",
      openedBy: d.opened_by,
      openedByName: openedBy?.display_name || "User",
      openedByEmail: openedBy?.email || "",
      againstUserId: d.against_user_id,
      againstName: against?.display_name || "User",
      againstEmail: against?.email || "",
      reason: d.reason,
      description: d.description,
      status: d.status,
      winnerUserId: d.winner_user_id || "",
      amountAwarded: Number(d.amount_awarded || 0),
      resolutionNote: d.resolution_note || "",
      resolvedBy: d.resolved_by || "",
      createdAt: d.created_at,
      updatedAt: d.updated_at
    },
    messages,
    evidence
  });
});

app.post("/api/disputes/:disputeId/messages", authRequired, (req, res) => {
  const d = db.prepare("SELECT * FROM disputes WHERE id=?").get(req.params.disputeId);
  if (!d) return res.status(404).json({ message: "Dispute not found" });
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(d.contract_id);
  if (!c) return res.status(404).json({ message: "Contract not found" });
  if (!canAccessDispute(req.user, d, c)) return res.status(403).json({ message: "Access denied" });

  const message = String(req.body?.message || "").trim();
  const isAdminNote = Boolean(req.body?.isAdminNote) && req.user.role === "Admin";
  if (!message) return res.status(400).json({ message: "message is required" });
  if (message.length > 3000) return res.status(400).json({ message: "Message too long (max 3000 chars)" });

  const id = `DM${Date.now().toString().slice(-10)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO dispute_messages (id, dispute_id, sender_id, message, is_admin_note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, d.id, req.user.id, message, isAdminNote ? 1 : 0, now);
  db.prepare("UPDATE disputes SET updated_at=? WHERE id=?").run(now, d.id);

  return res.status(201).json({
    id,
    disputeId: d.id,
    senderId: req.user.id,
    message,
    isAdminNote,
    createdAt: now
  });
});

app.patch("/api/disputes/:disputeId/status", authRequired, (req, res) => {
  if (req.user.role !== "Admin") {
    return res.status(403).json({ message: "Only admin can mediate disputes" });
  }

  const d = db.prepare("SELECT * FROM disputes WHERE id=?").get(req.params.disputeId);
  if (!d) return res.status(404).json({ message: "Dispute not found" });
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(d.contract_id);
  if (!c) return res.status(404).json({ message: "Contract not found" });

  const status = String(req.body?.status || "").trim().toLowerCase();
  if (!["open", "under_review", "resolved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid dispute status" });
  }

  const winnerUserId = String(req.body?.winnerUserId || "").trim();
  const resolutionNote = String(req.body?.resolutionNote || "").trim();
  const amountAwarded = Number(req.body?.amountAwarded || 0);

  if (status === "resolved") {
    if (!winnerUserId) {
      return res.status(400).json({ message: "winnerUserId is required for resolved status" });
    }
    const validWinner = [String(c.client_id), String(c.freelancer_id)].includes(String(winnerUserId));
    if (!validWinner) return res.status(400).json({ message: "winnerUserId must be contract client or freelancer" });
    if (!Number.isFinite(amountAwarded) || amountAwarded < 0) {
      return res.status(400).json({ message: "amountAwarded must be a non-negative number" });
    }
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE disputes
    SET status=?, winner_user_id=?, amount_awarded=?, resolution_note=?, resolved_by=?, updated_at=?
    WHERE id=?
  `).run(
    status,
    status === "resolved" ? winnerUserId : null,
    status === "resolved" ? amountAwarded : 0,
    resolutionNote,
    req.user.id,
    now,
    d.id
  );

  addContractTransaction(c.id, req.user.id, `dispute_${status}`, amountAwarded || 0, resolutionNote || d.reason);
  return res.json({
    message: "Dispute status updated",
    id: d.id,
    contractId: c.id,
    status,
    winnerUserId: status === "resolved" ? winnerUserId : "",
    amountAwarded: status === "resolved" ? amountAwarded : 0,
    resolutionNote,
    updatedAt: now
  });
});

app.get("/api/invoices", authRequired, (req, res) => {
  const rows = req.user.role === "Admin"
    ? db.prepare("SELECT * FROM invoices ORDER BY datetime(created_at) DESC").all()
    : db
        .prepare("SELECT * FROM invoices WHERE payer_user_id=? OR payee_user_id=? ORDER BY datetime(created_at) DESC")
        .all(req.user.id, req.user.id);

  const out = rows.map((r) => {
    const c = db.prepare("SELECT title FROM contracts WHERE id=?").get(r.contract_id);
    const m = db.prepare("SELECT title FROM milestones WHERE id=?").get(r.milestone_id);
    const payer = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(r.payer_user_id);
    const payee = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(r.payee_user_id);
    return {
      id: r.id,
      contractId: r.contract_id,
      contractTitle: c?.title || "Contract",
      milestoneId: r.milestone_id,
      milestoneTitle: m?.title || "Milestone",
      payerUserId: r.payer_user_id,
      payerName: payer?.display_name || "Payer",
      payerEmail: payer?.email || "",
      payeeUserId: r.payee_user_id,
      payeeName: payee?.display_name || "Payee",
      payeeEmail: payee?.email || "",
      amount: Number(r.amount || 0),
      currency: r.currency || "USD",
      status: r.status,
      note: r.note || "",
      createdAt: r.created_at,
      paidAt: r.paid_at || ""
    };
  });

  return res.json(out);
});

app.get("/api/invoices/:invoiceId", authRequired, (req, res) => {
  const r = db.prepare("SELECT * FROM invoices WHERE id=?").get(req.params.invoiceId);
  if (!r) return res.status(404).json({ message: "Invoice not found" });
  const permitted =
    req.user.role === "Admin" || String(r.payer_user_id) === String(req.user.id) || String(r.payee_user_id) === String(req.user.id);
  if (!permitted) return res.status(403).json({ message: "Access denied" });

  const c = db.prepare("SELECT title FROM contracts WHERE id=?").get(r.contract_id);
  const m = db.prepare("SELECT title FROM milestones WHERE id=?").get(r.milestone_id);
  const payer = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(r.payer_user_id);
  const payee = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(r.payee_user_id);

  return res.json({
    id: r.id,
    contractId: r.contract_id,
    contractTitle: c?.title || "Contract",
    milestoneId: r.milestone_id,
    milestoneTitle: m?.title || "Milestone",
    payerUserId: r.payer_user_id,
    payerName: payer?.display_name || "Payer",
    payerEmail: payer?.email || "",
    payeeUserId: r.payee_user_id,
    payeeName: payee?.display_name || "Payee",
    payeeEmail: payee?.email || "",
    amount: Number(r.amount || 0),
    currency: r.currency || "USD",
    status: r.status,
    note: r.note || "",
    createdAt: r.created_at,
    paidAt: r.paid_at || ""
  });
});

app.get("/api/invoices/:invoiceId/pdf", authRequired, (req, res) => {
  const r = db.prepare("SELECT * FROM invoices WHERE id=?").get(req.params.invoiceId);
  if (!r) return res.status(404).json({ message: "Invoice not found" });
  const permitted =
    req.user.role === "Admin" || String(r.payer_user_id) === String(req.user.id) || String(r.payee_user_id) === String(req.user.id);
  if (!permitted) return res.status(403).json({ message: "Access denied" });

  const c = db.prepare("SELECT title FROM contracts WHERE id=?").get(r.contract_id);
  const m = db.prepare("SELECT title FROM milestones WHERE id=?").get(r.milestone_id);
  const payer = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(r.payer_user_id);
  const payee = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(r.payee_user_id);
  const lines = [
    "TASKORA INVOICE",
    `Invoice ID: ${r.id}`,
    `Date: ${new Date(r.created_at).toISOString()}`,
    `Status: ${r.status}`,
    `Contract: ${c?.title || r.contract_id}`,
    `Milestone: ${m?.title || r.milestone_id}`,
    `Payer: ${payer?.display_name || "-"} (${payer?.email || "-"})`,
    `Payee: ${payee?.display_name || "-"} (${payee?.email || "-"})`,
    `Amount: ${Number(r.amount || 0).toFixed(2)} ${r.currency || "USD"}`,
    `Note: ${r.note || ""}`
  ];
  const pdf = buildSimplePdf(lines);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=\"${r.id}.pdf\"`);
  return res.send(pdf);
});

app.get("/api/timeline", authRequired, (req, res) => {
  const limit = Math.min(100, Math.max(10, Number(req.query.limit || 40)));
  const role = req.user.role;
  const uid = req.user.id;

  const contractScope = role === "Admin"
    ? db.prepare("SELECT id FROM contracts").all().map((r) => r.id)
    : db
        .prepare("SELECT id FROM contracts WHERE client_id=? OR freelancer_id=?")
        .all(uid, uid)
        .map((r) => r.id);
  const contractIdSet = new Set(contractScope);

  const txRows = contractScope.length
    ? db
        .prepare(
          `
          SELECT t.*, u.display_name AS actor_name
          FROM contract_transactions t
          LEFT JOIN users u ON u.id = t.actor_id
          ORDER BY datetime(t.created_at) DESC
          LIMIT 300
        `
        )
        .all()
        .filter((r) => contractIdSet.has(r.contract_id))
        .map((r) => ({
          id: `tx_${r.id}`,
          type: "contract_event",
          title: r.action,
          message: `${r.actor_name || "User"} • ${r.note || ""}`.trim(),
          amount: Number(r.amount || 0),
          contractId: r.contract_id,
          createdAt: r.created_at
        }))
    : [];

  const disputeRows = role === "Admin"
    ? db.prepare("SELECT * FROM disputes ORDER BY datetime(updated_at) DESC LIMIT 200").all()
    : db
        .prepare("SELECT * FROM disputes WHERE opened_by=? OR against_user_id=? ORDER BY datetime(updated_at) DESC LIMIT 200")
        .all(uid, uid);
  const disputes = disputeRows.map((d) => ({
    id: `d_${d.id}`,
    type: "dispute",
    title: `Dispute ${d.status}`,
    message: `${d.reason} • ${d.description}`,
    amount: Number(d.amount_awarded || 0),
    contractId: d.contract_id,
    createdAt: d.updated_at || d.created_at
  }));

  const invoiceRows = role === "Admin"
    ? db.prepare("SELECT * FROM invoices ORDER BY datetime(created_at) DESC LIMIT 200").all()
    : db
        .prepare("SELECT * FROM invoices WHERE payer_user_id=? OR payee_user_id=? ORDER BY datetime(created_at) DESC LIMIT 200")
        .all(uid, uid);
  const invoices = invoiceRows.map((r) => ({
    id: `inv_${r.id}`,
    type: "invoice",
    title: `Invoice ${r.status}`,
    message: `${r.id} • ${r.note || ""}`.trim(),
    amount: Number(r.amount || 0),
    contractId: r.contract_id,
    createdAt: r.paid_at || r.created_at
  }));

  const all = txRows.concat(disputes, invoices);
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json(all.slice(0, limit));
});

app.get("/api/payments/methods", authRequired, (req, res) => {
  const methods = db
    .prepare("SELECT * FROM payment_methods WHERE user_id=? ORDER BY is_default DESC, datetime(created_at) DESC")
    .all(req.user.id)
    .map((m) => ({
      id: m.id,
      userId: m.user_id,
      type: m.type,
      provider: m.provider,
      accountName: m.account_name,
      accountEmail: m.account_email,
      accountLast4: m.account_last4,
      country: m.country,
      currency: m.currency,
      isDefault: Boolean(m.is_default),
      createdAt: m.created_at
    }));
  res.json(methods);
});

app.post("/api/payments/methods", authRequired, (req, res) => {
  const { type, provider, accountName, accountNumber, accountEmail, country, currency, isDefault } = req.body || {};
  const required = [type, provider, accountName, accountNumber, accountEmail, country, currency];
  if (required.some((v) => !String(v || "").trim())) {
    return res.status(400).json({ message: "All payment method fields are required" });
  }

  if (isDefault) {
    db.prepare("UPDATE payment_methods SET is_default=0 WHERE user_id=?").run(req.user.id);
  }

  const safe = String(accountNumber).replace(/\s+/g, "");
  const method = {
    id: `PM${Date.now().toString().slice(-6)}`,
    userId: req.user.id,
    type: String(type).trim(),
    provider: String(provider).trim(),
    accountName: String(accountName).trim(),
    accountEmail: String(accountEmail).trim(),
    accountLast4: safe.slice(-4),
    country: String(country).trim(),
    currency: String(currency).trim(),
    isDefault: Boolean(isDefault),
    createdAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO payment_methods (id, user_id, type, provider, account_name, account_email, account_last4, country, currency, is_default, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    method.id,
    method.userId,
    method.type,
    method.provider,
    method.accountName,
    method.accountEmail,
    method.accountLast4,
    method.country,
    method.currency,
    method.isDefault ? 1 : 0,
    method.createdAt
  );

  res.status(201).json(method);
});

app.patch("/api/payments/methods/:methodId/default", authRequired, (req, res) => {
  const target = db.prepare("SELECT * FROM payment_methods WHERE id=? AND user_id=?").get(req.params.methodId, req.user.id);
  if (!target) return res.status(404).json({ message: "Payment method not found" });

  db.prepare("UPDATE payment_methods SET is_default=0 WHERE user_id=?").run(req.user.id);
  db.prepare("UPDATE payment_methods SET is_default=1 WHERE id=?").run(target.id);
  return res.json({ message: "Default payment method updated" });
});

app.delete("/api/payments/methods/:methodId", authRequired, (req, res) => {
  const target = db.prepare("SELECT * FROM payment_methods WHERE id=? AND user_id=?").get(req.params.methodId, req.user.id);
  if (!target) return res.status(404).json({ message: "Payment method not found" });

  db.prepare("DELETE FROM payment_methods WHERE id=?").run(target.id);

  const hasDefault = db.prepare("SELECT id FROM payment_methods WHERE user_id=? AND is_default=1 LIMIT 1").get(req.user.id);
  if (!hasDefault) {
    const first = db.prepare("SELECT id FROM payment_methods WHERE user_id=? ORDER BY datetime(created_at) DESC LIMIT 1").get(req.user.id);
    if (first) db.prepare("UPDATE payment_methods SET is_default=1 WHERE id=?").run(first.id);
  }

  return res.json({ message: "Payment method removed" });
});

app.get("/api/me/settings", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!row) return res.status(404).json({ message: "User not found" });
  const user = normalizeUser(row);
  return res.json(user.settings);
});

app.get("/api/me/profile", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!row) return res.status(404).json({ message: "User not found" });
  const user = normalizeUser(row);
  return res.json(user.profile || {});
});

app.patch("/api/me/profile", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!row) return res.status(404).json({ message: "User not found" });
  const user = normalizeUser(row);
  const current = user.profile || {};

  const next = {
    ...current,
    avatarUrl: String(req.body?.avatarUrl || current.avatarUrl || "").trim(),
    portfolio: Array.isArray(req.body?.portfolio) ? req.body.portfolio.slice(0, 24) : current.portfolio || []
  };

  db.prepare("UPDATE users SET profile_json=? WHERE id=?").run(JSON.stringify(next), req.user.id);
  return res.json({ message: "Profile updated", profile: next });
});

app.post("/api/uploads/base64", authRequired, (req, res) => {
  const { kind, fileName, mimeType, dataUrl } = req.body || {};
  if (!dataUrl || !fileName) {
    return res.status(400).json({ message: "fileName and dataUrl are required" });
  }
  try {
    const out = saveBase64Upload({
      userId: req.user.id,
      kind,
      fileName,
      mimeType,
      dataUrl
    });
    return res.status(201).json(out);
  } catch (err) {
    return res.status(400).json({ message: err.message || "Upload failed" });
  }
});

app.get("/api/uploads", authRequired, (req, res) => {
  const kind = String(req.query.kind || "").trim().toLowerCase();
  const rows = db
    .prepare(
      kind
        ? "SELECT * FROM user_uploads WHERE user_id=? AND lower(kind)=? ORDER BY datetime(created_at) DESC"
        : "SELECT * FROM user_uploads WHERE user_id=? ORDER BY datetime(created_at) DESC"
    )
    .all(...(kind ? [req.user.id, kind] : [req.user.id]))
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      originalName: r.original_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      url: r.url,
      createdAt: r.created_at
    }));
  return res.json(rows);
});

app.patch("/api/me/settings", authRequired, (req, res) => {
  const { displayName, payoutEmail, payoutAccountNumber, phone } = req.body || {};
  const row = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!row) return res.status(404).json({ message: "User not found" });

  const user = normalizeUser(row);
  const next = {
    displayName: String(displayName || user.settings.displayName || user.displayName).trim(),
    payoutEmail: String(payoutEmail || user.settings.payoutEmail || user.email).trim(),
    payoutAccountNumber: String(payoutAccountNumber || user.settings.payoutAccountNumber || "").trim(),
    phone: String(phone || user.settings.phone || user.profile.phone || "").trim()
  };

  db.prepare("UPDATE users SET settings_json=? WHERE id=?").run(JSON.stringify(next), req.user.id);
  return res.json({ message: "Settings updated", settings: next });
});

app.post("/api/kyc/submit", authRequired, (req, res) => {
  const { idType, idNumber, documentCountry, fullName, dateOfBirth, documentFileUrl } = req.body || {};
  const required = [idType, idNumber, documentCountry, fullName, dateOfBirth];
  if (required.some((v) => !String(v || "").trim())) {
    return res.status(400).json({ message: "All KYC fields are required" });
  }

  const row = {
    id: `KYC${Date.now().toString().slice(-6)}`,
    userId: req.user.id,
    idType: String(idType).trim(),
    idNumber: String(idNumber).trim(),
    documentCountry: String(documentCountry).trim(),
    fullName: String(fullName).trim(),
    dateOfBirth: String(dateOfBirth).trim(),
    documentFileUrl: String(documentFileUrl || "").trim(),
    status: "under_review",
    notes: "Submitted successfully. Review pending.",
    createdAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO kyc_submissions (id, user_id, id_type, id_number, document_country, full_name, date_of_birth, document_file_url, status, notes, created_at, updated_at, reviewed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
  `).run(
    row.id,
    row.userId,
    row.idType,
    row.idNumber,
    row.documentCountry,
    row.fullName,
    row.dateOfBirth,
    row.documentFileUrl,
    row.status,
    row.notes,
    row.createdAt
  );

  return res.status(201).json(row);
});

app.get("/api/kyc/status", authRequired, (req, res) => {
  const row = db
    .prepare("SELECT * FROM kyc_submissions WHERE user_id=? ORDER BY datetime(created_at) DESC LIMIT 1")
    .get(req.user.id);
  if (!row) return res.json({ status: "not_submitted" });
  return res.json({
    id: row.id,
    userId: row.user_id,
    idType: row.id_type,
    idNumber: row.id_number,
    documentCountry: row.document_country,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    documentFileUrl: row.document_file_url || "",
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedBy: row.reviewed_by
  });
});

app.get("/api/admin/overview", authRequired, adminRequired, (_req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const jobs = db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n;
  const bids = db.prepare("SELECT COUNT(*) AS n FROM bids").get().n;
  const paymentMethods = db.prepare("SELECT COUNT(*) AS n FROM payment_methods").get().n;
  const pendingKyc = db.prepare("SELECT COUNT(*) AS n FROM kyc_submissions WHERE status='under_review'").get().n;
  const verifiedKyc = db.prepare("SELECT COUNT(*) AS n FROM kyc_submissions WHERE status='approved'").get().n;

  res.json({ users, jobs, bids, paymentMethods, pendingKyc, verifiedKyc });
});

app.get("/api/admin/kyc", authRequired, adminRequired, (_req, res) => {
  const out = db
    .prepare(`
      SELECT k.*, u.email AS user_email, u.role AS user_role
      FROM kyc_submissions k
      LEFT JOIN users u ON u.id = k.user_id
      ORDER BY datetime(k.created_at) DESC
    `)
    .all()
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      idType: r.id_type,
      idNumber: r.id_number,
      documentCountry: r.document_country,
      fullName: r.full_name,
      dateOfBirth: r.date_of_birth,
      documentFileUrl: r.document_file_url || "",
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      reviewedBy: r.reviewed_by,
      userEmail: r.user_email || "-",
      userRole: r.user_role || "-"
    }));
  res.json(out);
});

app.patch("/api/admin/kyc/:kycId/status", authRequired, adminRequired, (req, res) => {
  const { status, notes } = req.body || {};
  if (!["approved", "rejected", "under_review"].includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  const row = db.prepare("SELECT * FROM kyc_submissions WHERE id=?").get(req.params.kycId);
  if (!row) return res.status(404).json({ message: "KYC record not found" });

  const updatedAt = new Date().toISOString();
  db.prepare("UPDATE kyc_submissions SET status=?, notes=?, updated_at=?, reviewed_by=? WHERE id=?").run(
    status,
    String(notes || row.notes || "").trim(),
    updatedAt,
    req.user.email,
    row.id
  );

  const out = db.prepare("SELECT * FROM kyc_submissions WHERE id=?").get(row.id);
  return res.json({
    message: "KYC status updated",
    kyc: {
      id: out.id,
      userId: out.user_id,
      idType: out.id_type,
      idNumber: out.id_number,
      documentCountry: out.document_country,
      fullName: out.full_name,
      dateOfBirth: out.date_of_birth,
      documentFileUrl: out.document_file_url || "",
      status: out.status,
      notes: out.notes,
      createdAt: out.created_at,
      updatedAt: out.updated_at,
      reviewedBy: out.reviewed_by
    }
  });
});

app.get("/api/messages/threads", authRequired, (req, res) => {
  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.user_a_id,
        t.user_b_id,
        t.updated_at,
        u.id AS other_id,
        u.display_name AS other_name,
        u.email AS other_email,
        u.role AS other_role
      FROM message_threads t
      JOIN users u ON u.id = CASE WHEN t.user_a_id = ? THEN t.user_b_id ELSE t.user_a_id END
      WHERE t.user_a_id = ? OR t.user_b_id = ?
      ORDER BY datetime(t.updated_at) DESC
    `
    )
    .all(req.user.id, req.user.id, req.user.id);

  const out = rows.map((r) => {
    const last = db
      .prepare("SELECT content, created_at FROM messages WHERE thread_id=? ORDER BY datetime(created_at) DESC LIMIT 1")
      .get(r.id);
    const unread = db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE thread_id=? AND receiver_id=? AND read_at IS NULL")
      .get(r.id, req.user.id).n;
    return {
      id: r.id,
      otherUser: {
        id: r.other_id,
        name: r.other_name || "User",
        email: r.other_email,
        role: r.other_role
      },
      updatedAt: r.updated_at,
      lastMessage: last?.content || "",
      lastMessageAt: last?.created_at || r.updated_at,
      unreadCount: Number(unread || 0)
    };
  });

  return res.json(out);
});

app.post("/api/messages/threads", authRequired, (req, res) => {
  const participantEmail = String(req.body?.participantEmail || "").trim().toLowerCase();
  if (!participantEmail) {
    return res.status(400).json({ message: "participantEmail is required" });
  }

  const other = db.prepare("SELECT id, display_name, email, role FROM users WHERE lower(email)=lower(?)").get(participantEmail);
  if (!other) {
    return res.status(404).json({ message: "User not found by this email" });
  }
  if (String(other.id) === String(req.user.id)) {
    return res.status(400).json({ message: "You cannot start a chat with yourself" });
  }

  const [a, b] = normalizeThreadPair(req.user.id, other.id);
  let thread = db.prepare("SELECT * FROM message_threads WHERE user_a_id=? AND user_b_id=?").get(a, b);
  if (!thread) {
    const now = new Date().toISOString();
    const id = `T${Date.now().toString().slice(-8)}`;
    db.prepare("INSERT INTO message_threads (id, user_a_id, user_b_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      a,
      b,
      now,
      now
    );
    thread = db.prepare("SELECT * FROM message_threads WHERE id=?").get(id);
  }

  return res.status(201).json({
    id: thread.id,
    otherUser: {
      id: other.id,
      name: other.display_name || "User",
      email: other.email,
      role: other.role
    },
    updatedAt: thread.updated_at
  });
});

app.get("/api/messages/threads/:threadId", authRequired, (req, res) => {
  const thread = db
    .prepare("SELECT * FROM message_threads WHERE id=? AND (user_a_id=? OR user_b_id=?)")
    .get(req.params.threadId, req.user.id, req.user.id);
  if (!thread) {
    return res.status(404).json({ message: "Thread not found" });
  }

  const otherId = String(thread.user_a_id) === String(req.user.id) ? thread.user_b_id : thread.user_a_id;
  const other = db.prepare("SELECT id, display_name, email, role FROM users WHERE id=?").get(otherId);

  const now = new Date().toISOString();
  db.prepare("UPDATE messages SET read_at=? WHERE thread_id=? AND receiver_id=? AND read_at IS NULL").run(now, thread.id, req.user.id);

  const messages = db
    .prepare("SELECT * FROM messages WHERE thread_id=? ORDER BY datetime(created_at) ASC LIMIT 200")
    .all(thread.id)
    .map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      senderId: m.sender_id,
      receiverId: m.receiver_id,
      content: m.content,
      createdAt: m.created_at,
      readAt: m.read_at,
      isMine: String(m.sender_id) === String(req.user.id)
    }));

  return res.json({
    thread: {
      id: thread.id,
      otherUser: {
        id: other?.id || otherId,
        name: other?.display_name || "User",
        email: other?.email || "",
        role: other?.role || ""
      },
      updatedAt: thread.updated_at
    },
    messages
  });
});

app.post("/api/messages/threads/:threadId", authRequired, (req, res) => {
  const content = String(req.body?.content || "").trim();
  if (!content) {
    return res.status(400).json({ message: "Message content is required" });
  }
  if (content.length > 2000) {
    return res.status(400).json({ message: "Message is too long (max 2000 chars)" });
  }

  const thread = db
    .prepare("SELECT * FROM message_threads WHERE id=? AND (user_a_id=? OR user_b_id=?)")
    .get(req.params.threadId, req.user.id, req.user.id);
  if (!thread) {
    return res.status(404).json({ message: "Thread not found" });
  }

  const receiverId = String(thread.user_a_id) === String(req.user.id) ? thread.user_b_id : thread.user_a_id;
  const id = `M${Date.now().toString().slice(-10)}`;
  const now = new Date().toISOString();

  db.prepare("INSERT INTO messages (id, thread_id, sender_id, receiver_id, content, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, NULL)").run(
    id,
    thread.id,
    req.user.id,
    receiverId,
    content,
    now
  );
  db.prepare("UPDATE message_threads SET updated_at=? WHERE id=?").run(now, thread.id);

  return res.status(201).json({
    id,
    threadId: thread.id,
    senderId: req.user.id,
    receiverId,
    content,
    createdAt: now,
    readAt: null,
    isMine: true
  });
});

app.get("/api/notifications", authRequired, (req, res) => {
  const role = req.user.role;
  const items = [];

  if (role === "Client" || role === "Admin") {
    const clientBids = db
      .prepare(`
        SELECT b.id, b.created_at, j.title AS job_title, b.freelancer_name
        FROM bids b
        JOIN jobs j ON j.id = b.job_id
        WHERE j.posted_by_id = ? OR j.posted_by = ?
        ORDER BY datetime(b.created_at) DESC
        LIMIT 6
      `)
      .all(req.user.id, req.user.name);

    for (const b of clientBids) {
      items.push({
        id: `N_BID_${b.id}`,
        type: "proposal",
        message: `New proposal from ${b.freelancer_name} on "${b.job_title}"`,
        createdAt: b.created_at
      });
    }
  }

  if (role === "Freelancer" || role === "Admin") {
    const myBidUpdates = db
      .prepare(`
        SELECT b.id, b.status, b.updated_at, j.title AS job_title
        FROM bids b
        LEFT JOIN jobs j ON j.id = b.job_id
        WHERE b.user_id = ? AND b.status IN ('accepted','rejected')
        ORDER BY datetime(COALESCE(b.updated_at, b.created_at)) DESC
        LIMIT 6
      `)
      .all(req.user.id);

    for (const b of myBidUpdates) {
      items.push({
        id: `N_STATUS_${b.id}`,
        type: "bid_status",
        message: `Your proposal for "${b.job_title || "Job"}" was ${b.status}`,
        createdAt: b.updated_at || null
      });
    }
  }

  const kyc = db
    .prepare("SELECT id, status, updated_at, created_at FROM kyc_submissions WHERE user_id=? ORDER BY datetime(created_at) DESC LIMIT 1")
    .get(req.user.id);
  if (kyc) {
    items.push({
      id: `N_KYC_${kyc.id}`,
      type: "kyc",
      message: `KYC status: ${kyc.status}`,
      createdAt: kyc.updated_at || kyc.created_at
    });
  }

  if (role === "Admin") {
    const pending = db.prepare("SELECT COUNT(*) AS n FROM kyc_submissions WHERE status='under_review'").get().n;
    items.push({
      id: "N_ADMIN_PENDING_KYC",
      type: "admin",
      message: `${pending} KYC submission(s) pending review`,
      createdAt: new Date().toISOString()
    });
  }

  items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return res.json(items.slice(0, 8));
});

app.get("/api/dashboard", (_req, res) => {
  const totalJobs = db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n;
  const totalGigs = db.prepare("SELECT COUNT(*) AS n FROM gigs").get().n;
  const totalBids = db.prepare("SELECT COUNT(*) AS n FROM bids").get().n;
  const totalPaymentMethods = db.prepare("SELECT COUNT(*) AS n FROM payment_methods").get().n;

  const top = db
    .prepare("SELECT category, COUNT(*) AS n FROM jobs GROUP BY category ORDER BY n DESC LIMIT 1")
    .get();

  const recentJobs = db
    .prepare("SELECT * FROM jobs ORDER BY datetime(created_at) DESC LIMIT 5")
    .all()
    .map((j) => ({
      id: j.id,
      title: j.title,
      budget: j.budget,
      category: j.category,
      level: j.level,
      type: j.type,
      description: j.description,
      createdAt: j.created_at,
      postedBy: j.posted_by,
      postedById: j.posted_by_id,
      posted: postedAgo(j.created_at)
    }));

  res.json({
    totalJobs,
    totalGigs,
    totalBids,
    totalPaymentMethods,
    topCategory: top?.category || "-",
    recentJobs
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Taskora server running on http://localhost:${port}`);
});


