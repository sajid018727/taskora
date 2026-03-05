import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = path.join(__dirname, "data", "taskora.sqlite");
const legacyJson = path.join(__dirname, "data", "db.json");

export const db = new Database(dbFile);

function createTables() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      middle_name TEXT DEFAULT '',
      last_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      budget TEXT NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      posted_by TEXT NOT NULL,
      posted_by_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_categories (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gigs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      price TEXT NOT NULL,
      seller TEXT NOT NULL,
      rating REAL NOT NULL,
      category TEXT NOT NULL,
      delivery TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      freelancer_name TEXT NOT NULL,
      freelancer_email TEXT NOT NULL,
      amount TEXT NOT NULL,
      delivery_days TEXT NOT NULL,
      cover_letter TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      bid_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      freelancer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      escrow_total REAL NOT NULL,
      escrow_released REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(bid_id)
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL,
      proof_url TEXT,
      proof_note TEXT,
      submitted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contract_transactions (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      payer_user_id TEXT NOT NULL,
      payee_user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      paid_at TEXT,
      UNIQUE(milestone_id)
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      opened_by TEXT NOT NULL,
      against_user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      winner_user_id TEXT,
      amount_awarded REAL NOT NULL,
      resolution_note TEXT NOT NULL,
      resolved_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dispute_messages (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      message TEXT NOT NULL,
      is_admin_note INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_threads (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL,
      user_b_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_a_id, user_b_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_email TEXT NOT NULL,
      account_last4 TEXT NOT NULL,
      country TEXT NOT NULL,
      currency TEXT NOT NULL,
      is_default INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kyc_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      id_type TEXT NOT NULL,
      id_number TEXT NOT NULL,
      document_country TEXT NOT NULL,
      full_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      reviewed_by TEXT
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      used INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
  `);

  // Lightweight runtime migration for older DB files
  try {
    db.prepare("ALTER TABLE kyc_submissions ADD COLUMN document_file_url TEXT").run();
  } catch {
    // column already exists
  }
  try {
    db.prepare("ALTER TABLE milestones ADD COLUMN proof_url TEXT").run();
  } catch {
    // column already exists
  }
  try {
    db.prepare("ALTER TABLE milestones ADD COLUMN proof_note TEXT").run();
  } catch {
    // column already exists
  }
  try {
    db.prepare("ALTER TABLE milestones ADD COLUMN submitted_at TEXT").run();
  } catch {
    // column already exists
  }
}

function seedFromLegacyJson() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return;
  if (!fs.existsSync(legacyJson)) return;

  const raw = fs.readFileSync(legacyJson, "utf8");
  const src = JSON.parse(raw);

  const insertUser = db.prepare(`
    INSERT INTO users (id, first_name, middle_name, last_name, display_name, email, password_hash, role, profile_json, settings_json, created_at)
    VALUES (@id, @first_name, @middle_name, @last_name, @display_name, @email, @password_hash, @role, @profile_json, @settings_json, @created_at)
  `);

  const insertJob = db.prepare(`
    INSERT INTO jobs (id, title, budget, category, level, type, description, created_at, posted_by, posted_by_id)
    VALUES (@id, @title, @budget, @category, @level, @type, @description, @created_at, @posted_by, @posted_by_id)
  `);

  const insertGig = db.prepare(`
    INSERT INTO gigs (id, title, price, seller, rating, category, delivery)
    VALUES (@id, @title, @price, @seller, @rating, @category, @delivery)
  `);

  const insertBid = db.prepare(`
    INSERT INTO bids (id, job_id, user_id, freelancer_name, freelancer_email, amount, delivery_days, cover_letter, status, created_at, updated_at)
    VALUES (@id, @job_id, @user_id, @freelancer_name, @freelancer_email, @amount, @delivery_days, @cover_letter, @status, @created_at, @updated_at)
  `);

  const insertPm = db.prepare(`
    INSERT INTO payment_methods (id, user_id, type, provider, account_name, account_email, account_last4, country, currency, is_default, created_at)
    VALUES (@id, @user_id, @type, @provider, @account_name, @account_email, @account_last4, @country, @currency, @is_default, @created_at)
  `);

  const insertKyc = db.prepare(`
    INSERT INTO kyc_submissions (id, user_id, id_type, id_number, document_country, full_name, date_of_birth, status, notes, created_at, updated_at, reviewed_by)
    VALUES (@id, @user_id, @id_type, @id_number, @document_country, @full_name, @date_of_birth, @status, @notes, @created_at, @updated_at, @reviewed_by)
  `);

  const insertReset = db.prepare(`
    INSERT INTO password_resets (id, user_id, email, token, used, created_at, expires_at, used_at)
    VALUES (@id, @user_id, @email, @token, @used, @created_at, @expires_at, @used_at)
  `);

  const tx = db.transaction(() => {
    for (const user of src.users || []) {
      insertUser.run({
        id: user.id,
        first_name: user.firstName || "User",
        middle_name: user.middleName || "",
        last_name: user.lastName || "",
        display_name: user.displayName || `${user.firstName || "User"} ${user.lastName || ""}`.trim(),
        email: user.email,
        password_hash: user.passwordHash,
        role: user.role || "Freelancer",
        profile_json: JSON.stringify(user.profile || {}),
        settings_json: JSON.stringify(user.settings || {}),
        created_at: user.createdAt || new Date().toISOString()
      });
    }

    for (const job of src.jobs || []) {
      insertJob.run({
        id: job.id,
        title: job.title,
        budget: job.budget,
        category: job.category,
        level: job.level,
        type: job.type,
        description: job.description,
        created_at: job.createdAt || new Date().toISOString(),
        posted_by: job.postedBy || "Unknown",
        posted_by_id: job.postedById || ""
      });
    }

    for (const gig of src.gigs || []) {
      insertGig.run({
        id: gig.id,
        title: gig.title,
        price: gig.price,
        seller: gig.seller,
        rating: Number(gig.rating || 0),
        category: gig.category,
        delivery: gig.delivery
      });
    }

    for (const bid of src.bids || []) {
      insertBid.run({
        id: bid.id,
        job_id: bid.jobId,
        user_id: bid.userId,
        freelancer_name: bid.freelancerName,
        freelancer_email: bid.freelancerEmail,
        amount: bid.amount,
        delivery_days: String(bid.deliveryDays || ""),
        cover_letter: bid.coverLetter,
        status: bid.status || "pending",
        created_at: bid.createdAt || new Date().toISOString(),
        updated_at: bid.updatedAt || null
      });
    }

    for (const pm of src.paymentMethods || []) {
      insertPm.run({
        id: pm.id,
        user_id: pm.userId,
        type: pm.type,
        provider: pm.provider,
        account_name: pm.accountName,
        account_email: pm.accountEmail || "",
        account_last4: pm.accountLast4 || "",
        country: pm.country,
        currency: pm.currency,
        is_default: pm.isDefault ? 1 : 0,
        created_at: pm.createdAt || new Date().toISOString()
      });
    }

    for (const kyc of src.kycSubmissions || []) {
      insertKyc.run({
        id: kyc.id,
        user_id: kyc.userId,
        id_type: kyc.idType,
        id_number: kyc.idNumber,
        document_country: kyc.documentCountry,
        full_name: kyc.fullName,
        date_of_birth: kyc.dateOfBirth,
        status: kyc.status || "under_review",
        notes: kyc.notes || "",
        created_at: kyc.createdAt || new Date().toISOString(),
        updated_at: kyc.updatedAt || null,
        reviewed_by: kyc.reviewedBy || null
      });
    }

    for (const pr of src.passwordResets || []) {
      insertReset.run({
        id: pr.id,
        user_id: pr.userId,
        email: pr.email,
        token: pr.token,
        used: pr.used ? 1 : 0,
        created_at: pr.createdAt,
        expires_at: pr.expiresAt,
        used_at: pr.usedAt || null
      });
    }
  });

  tx();
}

export function initDb() {
  createTables();
  seedFromLegacyJson();
}
