(function () {
  const page = document.body.dataset.page;
  const API = "/api";
  const protectedPages = new Set([
    "dashboard",
    "my-bids",
    "client-bids",
    "payments",
    "contracts",
    "invoices",
    "disputes",
    "timeline",
    "settings",
    "kyc",
    "messages",
    "post-job",
    "worker-profile",
    "employer-profile",
    "admin-kyc"
  ]);

  const defaults = {
    jobs: [
      {
        id: "J1001",
        title: "Build Marketing Landing Page",
        category: "Design",
        mode: "freelance",
        level: "Intermediate",
        type: "Fixed",
        posted: "2h ago",
        description: "Need a clean responsive landing page with CTA sections.",
        budget: "$250",
        bidCount: 3
      },
      {
        id: "J1002",
        title: "WordPress Speed Optimization",
        category: "Development",
        mode: "freelance",
        level: "Expert",
        type: "Fixed",
        posted: "5h ago",
        description: "Improve Core Web Vitals and optimize plugins.",
        budget: "$180",
        bidCount: 5
      },
      {
        id: "J1003",
        title: "Quick Product Data Entry",
        category: "Data Entry",
        mode: "micro",
        level: "Beginner",
        type: "Remote",
        posted: "1h ago",
        description: "Fill 120 product rows in spreadsheet from provided source links.",
        budget: "$20",
        bidCount: 6
      },
      {
        id: "J1004",
        title: "Social Follow and Feedback Task",
        category: "Social Tasks",
        mode: "micro",
        level: "Beginner",
        type: "Remote",
        posted: "45m ago",
        description: "Follow page and submit short feedback screenshot.",
        budget: "$8",
        bidCount: 11
      }
    ],
    gigs: [
      {
        id: "G1001",
        title: "I will design modern UI screens",
        seller: "Samira",
        rating: "4.9",
        delivery: "3 days",
        category: "Design",
        price: "$60"
      },
      {
        id: "G1002",
        title: "I will build Node.js REST API",
        seller: "Rahim",
        rating: "4.8",
        delivery: "4 days",
        category: "Development",
        price: "$120"
      }
    ],
    jobCategories: {
      freelance: ["Web Development", "Design", "Digital Marketing", "Development"],
      micro: ["Data Entry", "Social Tasks", "Testing", "Survey"]
    },
    myBids: [
      {
        id: "B1001",
        jobTitle: "Landing Page Design",
        postedBy: "Acme Client",
        jobBudget: "$250",
        coverLetter: "I can deliver this in 3 days with responsive layout.",
        amount: "$220",
        deliveryDays: "3",
        status: "pending"
      }
    ],
    clientBids: [
      {
        id: "CB1001",
        jobTitle: "React Dashboard UI",
        freelancerName: "Samira Khan",
        freelancerEmail: "samira@example.com",
        coverLetter: "Experienced with admin dashboards and charts.",
        amount: "$480",
        deliveryDays: "5",
        status: "pending"
      }
    ],
    paymentMethods: [],
    settings: {
      displayName: "Demo User",
      phone: "",
      payoutEmail: "",
      payoutAccountNumber: "",
      resetEmail: "",
      twoFactorEnabled: false,
      passkeyEnabled: false,
      phoneVerified: false
    },
    kycStatus: { status: "not_submitted" },
    adminKyc: [
      {
        id: "KYC1001",
        fullName: "Rahim Uddin",
        userEmail: "rahim@example.com",
        userRole: "Freelancer",
        idType: "Passport",
        idNumber: "P1234567",
        documentCountry: "Bangladesh",
        status: "under_review",
        createdAt: new Date().toISOString()
      }
    ]
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getToken() {
    return localStorage.getItem("taskora_token") || "";
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("taskora_user") || "null");
    } catch {
      return null;
    }
  }

  function clearAuth() {
    localStorage.removeItem("taskora_token");
    localStorage.removeItem("taskora_user");
  }

  function isLoggedIn() {
    const token = getToken();
    const user = getUser();
    const tokenLooksJwt = token.split(".").length === 3;
    const userLooksValid = Boolean(user && user.id && user.email);
    return Boolean(tokenLooksJwt && userLooksValid);
  }

  function enforceAuthConsistency() {
    if (getToken() && !isLoggedIn()) {
      clearAuth();
    }
  }

  const state = {
    jobs: read("taskora_jobs", defaults.jobs),
    gigs: read("taskora_gigs", defaults.gigs),
    jobCategories: read("taskora_job_categories", defaults.jobCategories),
    myBids: read("taskora_my_bids", defaults.myBids),
    clientBids: read("taskora_client_bids", defaults.clientBids),
    paymentMethods: read("taskora_payment_methods", defaults.paymentMethods),
    settings: read("taskora_settings", defaults.settings),
    kycStatus: read("taskora_kyc_status", defaults.kycStatus),
    adminKyc: read("taskora_admin_kyc", defaults.adminKyc)
  };

  function persist() {
    write("taskora_jobs", state.jobs);
    write("taskora_gigs", state.gigs);
    write("taskora_job_categories", state.jobCategories);
    write("taskora_my_bids", state.myBids);
    write("taskora_client_bids", state.clientBids);
    write("taskora_payment_methods", state.paymentMethods);
    write("taskora_settings", state.settings);
    write("taskora_kyc_status", state.kycStatus);
    write("taskora_admin_kyc", state.adminKyc);
  }

  function getCurrentRole() {
    const user = getUser();
    return String(user?.role || "").trim();
  }

  function canManageCategories() {
    const role = getCurrentRole();
    return role === "Admin" || role === "Client";
  }

  function linkForPage(name) {
    const inPages = window.location.pathname.toLowerCase().includes("/pages/");
    return inPages ? name : `pages/${name}`;
  }

  function applyRoleBasedMenu() {
    const role = getCurrentRole();
    const panels = document.querySelectorAll(".menu-panel");
    if (!panels.length) return;

    const guest = [
      { label: "Jobs", href: linkForPage("jobs.html") },
      { label: "Gigs", href: linkForPage("gigs.html") },
      { label: "Dashboard", href: linkForPage("dashboard.html") }
    ];

    const worker = [
      { label: "Jobs", href: linkForPage("jobs.html") },
      { label: "Gigs", href: linkForPage("gigs.html") },
      { label: "Contracts", href: linkForPage("contracts.html") },
      { label: "Invoices", href: linkForPage("invoices.html") },
      { label: "Disputes", href: linkForPage("disputes.html") },
      { label: "Timeline", href: linkForPage("timeline.html") },
      { label: "Messages", href: linkForPage("messages.html") },
      { label: "Worker Profile", href: linkForPage("worker-profile.html") },
      { label: "Dashboard", href: linkForPage("dashboard.html") },
      { label: "My Proposals", href: linkForPage("my-bids.html") },
      { label: "Payments", href: linkForPage("payments.html") },
      { label: "KYC", href: linkForPage("kyc.html") },
      { label: "Settings", href: linkForPage("settings.html") }
    ];

    const employer = [
      { label: "Jobs", href: linkForPage("jobs.html") },
      { label: "Gigs", href: linkForPage("gigs.html") },
      { label: "Contracts", href: linkForPage("contracts.html") },
      { label: "Invoices", href: linkForPage("invoices.html") },
      { label: "Disputes", href: linkForPage("disputes.html") },
      { label: "Timeline", href: linkForPage("timeline.html") },
      { label: "Messages", href: linkForPage("messages.html") },
      { label: "Employer Profile", href: linkForPage("employer-profile.html") },
      { label: "Post Job", href: linkForPage("post-job.html") },
      { label: "Dashboard", href: linkForPage("dashboard.html") },
      { label: "Received Proposals", href: linkForPage("client-bids.html") },
      { label: "Payments", href: linkForPage("payments.html") },
      { label: "KYC", href: linkForPage("kyc.html") },
      { label: "Settings", href: linkForPage("settings.html") }
    ];

    const admin = [
      { label: "Jobs", href: linkForPage("jobs.html") },
      { label: "Gigs", href: linkForPage("gigs.html") },
      { label: "Contracts", href: linkForPage("contracts.html") },
      { label: "Invoices", href: linkForPage("invoices.html") },
      { label: "Disputes", href: linkForPage("disputes.html") },
      { label: "Timeline", href: linkForPage("timeline.html") },
      { label: "Messages", href: linkForPage("messages.html") },
      { label: "Worker Profile", href: linkForPage("worker-profile.html") },
      { label: "Employer Profile", href: linkForPage("employer-profile.html") },
      { label: "Post Job", href: linkForPage("post-job.html") },
      { label: "Dashboard", href: linkForPage("dashboard.html") },
      { label: "My Proposals", href: linkForPage("my-bids.html") },
      { label: "Received Proposals", href: linkForPage("client-bids.html") },
      { label: "Payments", href: linkForPage("payments.html") },
      { label: "KYC", href: linkForPage("kyc.html") },
      { label: "Settings", href: linkForPage("settings.html") },
      { label: "Admin Panel", href: linkForPage("admin-kyc.html") }
    ];

    const selected = role === "Admin" ? admin : role === "Client" ? employer : role === "Freelancer" ? worker : guest;
    const html = selected.map((item) => `<a href="${item.href}">${item.label}</a>`).join("");
    panels.forEach((panel) => {
      panel.innerHTML = html;
    });
  }

  function initTopUtilities() {
    const shell = document.querySelector(".topbar-shell");
    const nav = document.querySelector(".nav-quick");
    if (!shell || !nav || shell.dataset.enhanced === "1") return;
    shell.dataset.enhanced = "1";

    const middle = document.createElement("div");
    middle.className = "mid-tools";
    middle.innerHTML = `
      <div class="mid-search">
        <input id="globalSearchInput" type="search" placeholder="Search jobs, gigs, pages..." />
        <div id="globalSearchResults" class="search-results" style="display:none;"></div>
      </div>
    `;
    shell.insertBefore(middle, nav);

    const notifWrap = document.createElement("div");
    notifWrap.className = "top-notif";
    notifWrap.innerHTML = `
      <button id="notifBtn" class="notif-btn" type="button" aria-label="Notifications">
        <span class="notif-logo">N</span>
        <span id="notifCount" class="notif-count" style="display:none;">0</span>
      </button>
      <div id="notifPanel" class="notif-panel" style="display:none;"></div>
    `;
    nav.appendChild(notifWrap);

    if (isLoggedIn()) {
      const logoutBtn = document.createElement("button");
      logoutBtn.type = "button";
      logoutBtn.className = "nav-logout";
      logoutBtn.textContent = "Logout";
      logoutBtn.addEventListener("click", () => {
        clearAuth();
        window.location.href = linkForPage("login.html");
      });
      nav.appendChild(logoutBtn);
    }

    const searchInput = document.getElementById("globalSearchInput");
    const searchResults = document.getElementById("globalSearchResults");
    const notifBtn = document.getElementById("notifBtn");
    const notifCount = document.getElementById("notifCount");
    const notifPanel = document.getElementById("notifPanel");
    let searchTimer = null;
    let currentSearchRows = [];
    let prevNotifIds = new Set();
    let pollTimer = null;

    function notifSeenKey() {
      const u = getUser();
      return `taskora_seen_notifications_${u?.id || "guest"}`;
    }

    function readSeenNotifications() {
      const list = read(notifSeenKey(), []);
      return new Set(Array.isArray(list) ? list : []);
    }

    function writeSeenNotifications(ids) {
      write(notifSeenKey(), Array.from(ids));
    }

    function setNotifCount(count) {
      if (!notifCount) return;
      if (!count) {
        notifCount.style.display = "none";
        notifCount.textContent = "0";
        return;
      }
      notifCount.style.display = "inline-flex";
      notifCount.textContent = String(count > 99 ? "99+" : count);
    }

    function renderTimeText(dateValue) {
      if (!dateValue) return "";
      const ts = new Date(dateValue).getTime();
      if (!Number.isFinite(ts)) return "";
      const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
      if (sec < 60) return `${sec}s ago`;
      const min = Math.floor(sec / 60);
      if (min < 60) return `${min}m ago`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr}h ago`;
      const day = Math.floor(hr / 24);
      return `${day}d ago`;
    }

    async function loadNotifications(options = {}) {
      if (!notifPanel) return;
      const markSeen = Boolean(options.markSeen);
      const seen = readSeenNotifications();

      try {
        const rows = isLoggedIn() ? await authedApi("/notifications") : [];
        if (rows.length) {
          const newIds = rows.map((n) => n.id).filter(Boolean);
          const unseen = newIds.filter((id) => !seen.has(id));
          setNotifCount(unseen.length);

          notifPanel.innerHTML = rows
            .map((n) => {
              const fresh = !seen.has(n.id) && prevNotifIds.size > 0 && !prevNotifIds.has(n.id);
              const isUnseen = !seen.has(n.id);
              const cls = `notif-item${fresh ? " new" : ""}${isUnseen ? " unseen" : ""}`;
              const when = renderTimeText(n.createdAt);
              return `<div class="${cls}" data-notif-id="${n.id}"><div>${n.message}</div>${when ? `<small>${when}</small>` : ""}</div>`;
            })
            .join("");

          prevNotifIds = new Set(newIds);
          if (markSeen) {
            newIds.forEach((id) => seen.add(id));
            writeSeenNotifications(seen);
            setNotifCount(0);
            const unseenEls = notifPanel.querySelectorAll(".notif-item.unseen");
            unseenEls.forEach((el) => el.classList.remove("unseen"));
          }
          return;
        }
      } catch {
        // fallback to local summary
      }

      const fallback = [
        `${state.clientBids.length} proposal(s) received`,
        `${state.myBids.filter((b) => b.status === "accepted").length} proposal(s) accepted`,
        `${state.jobs.length} total job post(s) available`
      ];
      notifPanel.innerHTML = fallback.map((n) => `<div class="notif-item">${n}</div>`).join("");
      setNotifCount(0);
    }
    loadNotifications();

    if (isLoggedIn()) {
      pollTimer = setInterval(() => {
        loadNotifications();
      }, 15000);

      window.addEventListener("focus", () => {
        loadNotifications();
      });
    }

    function hideSearchResults() {
      if (!searchResults) return;
      searchResults.style.display = "none";
      searchResults.innerHTML = "";
      currentSearchRows = [];
    }

    function renderSearchResults(rows) {
      if (!searchResults) return;
      searchResults.innerHTML = "";
      currentSearchRows = rows.slice();
      if (!rows.length) {
        hideSearchResults();
        return;
      }

      rows.forEach((row) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-result-item";

        const title = document.createElement("strong");
        title.textContent = row.title;

        const subtitle = document.createElement("small");
        subtitle.textContent = `${row.type.toUpperCase()} • ${row.subtitle}`;

        button.appendChild(title);
        button.appendChild(subtitle);
        button.addEventListener("click", () => {
          window.location.href = row.href;
        });
        searchResults.appendChild(button);
      });
      searchResults.style.display = "block";
    }

    async function doGlobalSearch(raw) {
      const q = String(raw || "").trim();
      if (q.length < 2) {
        hideSearchResults();
        return;
      }
      const out = await tryApi(`/search?q=${encodeURIComponent(q)}`);
      if (!out) {
        hideSearchResults();
        return;
      }
      const rows = []
        .concat(out.jobs || [])
        .concat(out.gigs || [])
        .concat(out.categories || [])
        .concat(out.pages || [])
        .slice(0, 10);
      renderSearchResults(rows);
    }

    searchInput?.addEventListener("input", () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        doGlobalSearch(searchInput.value);
      }, 220);
    });

    searchInput?.addEventListener("focus", () => {
      if (searchInput.value.trim().length >= 2) {
        doGlobalSearch(searchInput.value);
      }
    });

    searchInput?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (currentSearchRows.length) {
        window.location.href = currentSearchRows[0].href;
        return;
      }
      const q = searchInput.value.trim();
      if (q.length >= 2) {
        window.location.href = `${linkForPage("jobs.html")}?q=${encodeURIComponent(q)}`;
      }
    });

    notifBtn?.addEventListener("click", () => {
      if (!notifPanel) return;
      const open = notifPanel.style.display === "none";
      notifPanel.style.display = open ? "block" : "none";
      if (open) loadNotifications({ markSeen: true });
    });

    document.addEventListener("click", (e) => {
      if (!notifPanel || !notifBtn) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".top-notif")) notifPanel.style.display = "none";
      if (!target.closest(".mid-search")) hideSearchResults();
    });

    window.addEventListener("beforeunload", () => {
      if (pollTimer) clearInterval(pollTimer);
    });
  }

  function categoriesForMode(mode) {
    return (state.jobCategories[String(mode)] || []).slice();
  }

  async function syncJobCategoriesFromApi() {
    try {
      const all = await tryApi("/categories");
      if (all?.freelance && all?.micro) {
        state.jobCategories.freelance = all.freelance;
        state.jobCategories.micro = all.micro;
        persist();
        return true;
      }
    } catch {
      // keep local fallback
    }
    return false;
  }

  function addCategoryToMode(mode, rawName) {
    const key = String(mode) === "micro" ? "micro" : "freelance";
    const names = String(rawName || "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return { ok: false, message: "Category name is required." };

    const existing = (state.jobCategories[key] || []).map((c) => c.toLowerCase());
    const added = [];
    const skipped = [];

    names.forEach((name) => {
      if (existing.includes(name.toLowerCase()) || added.map((a) => a.toLowerCase()).includes(name.toLowerCase())) {
        skipped.push(name);
      } else {
        added.push(name);
      }
    });

    if (!added.length) return { ok: false, message: "All entered categories already exist." };

    state.jobCategories[key] = (state.jobCategories[key] || []).concat(added);
    persist();
    const msg = skipped.length
      ? `${added.length} category added to ${key}. Skipped duplicate: ${skipped.join(", ")}`
      : `${added.length} category added to ${key}.`;
    return { ok: true, message: msg };
  }

  async function tryApi(path) {
    try {
      const res = await fetch(`${API}${path}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function authedApi(path, options = {}) {
    const token = getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.message || "Request failed");
    return out;
  }

  function showNotice(el, text, isError) {
    if (!el) return;
    el.style.display = "block";
    el.classList.toggle("error", Boolean(isError));
    el.textContent = text;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read selected file"));
      reader.readAsDataURL(file);
    });
  }

  function getCountryList() {
    try {
      if (typeof Intl !== "undefined" && Intl.DisplayNames && Intl.supportedValuesOf) {
        const display = new Intl.DisplayNames(["en"], { type: "region" });
        return Intl.supportedValuesOf("region")
          .map((code) => display.of(code))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
      }
    } catch {
      // fall through to fallback list
    }

    return [
      "Bangladesh",
      "India",
      "Pakistan",
      "United States",
      "United Kingdom",
      "Canada",
      "Australia",
      "Saudi Arabia",
      "United Arab Emirates",
      "Malaysia",
      "Singapore"
    ];
  }

  function populateCountrySelects(root) {
    const scope = root || document;
    const selects = scope.querySelectorAll(".country-select");
    if (!selects.length) return;
    const countries = getCountryList();

    selects.forEach((sel) => {
      if (sel.dataset.filled === "1") return;
      const first = sel.querySelector("option[value='']");
      const keep = first ? first.outerHTML : '<option value="">Select country</option>';
      sel.innerHTML = keep + countries.map((name) => `<option value="${name}">${name}</option>`).join("");
      sel.dataset.filled = "1";
    });
  }

  function statusBadge(status) {
    const safe = status || "pending";
    return `<span class="tag status ${safe}">${safe.toUpperCase()}</span>`;
  }

  function cardJob(job, withBidForm) {
    const bidForm = withBidForm
      ? `
      <form class="bid-form" data-job-id="${job.id}">
        <input name="amount" type="text" placeholder="Your bid amount" />
        <input name="deliveryDays" type="number" min="1" placeholder="Delivery days" />
        <textarea name="coverLetter" rows="3" placeholder="Short proposal message"></textarea>
        <button class="btn btn-brand" type="submit">Send Proposal</button>
        <div class="notice bid-notice"></div>
      </form>`
      : "";

    return `
      <article class="card reveal-card">
        <h3>${job.title}</h3>
        <p class="meta">${job.category} • ${job.level} • ${job.type} • ${job.posted}</p>
        <p>${job.description}</p>
        <p><span class="tag">Mode: ${String(job.mode || "freelance").toUpperCase()}</span><span class="tag">Budget: ${job.budget}</span><span class="tag">ID: ${job.id}</span><span class="tag">Bids: ${job.bidCount || 0}</span></p>
        ${bidForm}
      </article>`;
  }

  function cardGig(gig) {
    return `
      <article class="card reveal-card">
        <h3>${gig.title}</h3>
        <p class="meta">Seller: ${gig.seller} • Rating ${gig.rating} • ${gig.delivery}</p>
        <p><span class="tag">${gig.category}</span><span class="tag">Starting at ${gig.price}</span></p>
      </article>`;
  }

  function cardMyBid(bid) {
    return `
      <article class="card reveal-card">
        <h3>${bid.jobTitle}</h3>
        <p class="meta">Client: ${bid.postedBy} • Budget: ${bid.jobBudget}</p>
        <p>${bid.coverLetter}</p>
        <p><span class="tag">My Bid: ${bid.amount}</span><span class="tag">Delivery: ${bid.deliveryDays} days</span>${statusBadge(bid.status)}</p>
      </article>`;
  }

  function cardClientBid(bid) {
    const actions = bid.status === "pending"
      ? `<div class="action-row"><button type="button" class="btn btn-brand action-btn" data-action="accepted" data-bid-id="${bid.id}">Accept</button><button type="button" class="btn btn-light action-btn" data-action="rejected" data-bid-id="${bid.id}">Reject</button></div>`
      : "";

    return `
      <article class="card reveal-card">
        <h3>${bid.jobTitle}</h3>
        <p class="meta">Freelancer: ${bid.freelancerName} (${bid.freelancerEmail})</p>
        <p>${bid.coverLetter}</p>
        <p><span class="tag">Bid: ${bid.amount}</span><span class="tag">Delivery: ${bid.deliveryDays} days</span>${statusBadge(bid.status)}</p>
        ${actions}
      </article>`;
  }

  function cardPayment(method) {
    return `
      <article class="card reveal-card">
        <h3>${method.provider}</h3>
        <p class="meta">${method.type} • ${method.country} • ${method.currency}</p>
        <p><span class="tag">${method.accountName}</span><span class="tag">${method.accountEmail}</span><span class="tag">****${method.accountLast4}</span>${method.isDefault ? '<span class="tag status accepted">DEFAULT</span>' : ""}</p>
        <div class="action-row">
          ${method.isDefault ? "" : `<button class="btn btn-light pm-default" data-method-id="${method.id}" type="button">Set Default</button>`}
          <button class="btn btn-light pm-remove" data-method-id="${method.id}" type="button">Remove</button>
        </div>
      </article>`;
  }

  function cardAdminKyc(row) {
    const docLink = row.documentFileUrl
      ? `<a class="btn btn-light" href="${row.documentFileUrl}" target="_blank" rel="noopener">View Document</a>`
      : "";
    return `
      <article class="card reveal-card">
        <h3>${row.fullName}</h3>
        <p class="meta">${row.userEmail} • ${row.userRole}</p>
        <p><span class="tag">${row.idType}</span><span class="tag">${row.idNumber}</span><span class="tag">${row.documentCountry}</span>${statusBadge(row.status)}</p>
        <p class="meta">Submitted: ${new Date(row.createdAt).toLocaleString()}</p>
        <div class="action-row">
          ${docLink}
          <button class="btn btn-brand kyc-action" data-id="${row.id}" data-status="approved" type="button">Approve</button>
          <button class="btn btn-light kyc-action" data-id="${row.id}" data-status="rejected" type="button">Reject</button>
          <button class="btn btn-light kyc-action" data-id="${row.id}" data-status="under_review" type="button">Mark Review</button>
        </div>
      </article>`;
  }

  async function renderHome() {
    const apiJobs = await tryApi("/jobs");
    const apiGigs = await tryApi("/gigs");
    const jobs = (Array.isArray(apiJobs) ? apiJobs : []).concat(state.jobs).slice(0, 8);
    const gigs = (Array.isArray(apiGigs) ? apiGigs : []).concat(state.gigs).slice(0, 8);

    document.getElementById("homeJobs").innerHTML = jobs.slice(0, 3).map((j) => cardJob(j, false)).join("");
    document.getElementById("homeGigs").innerHTML = gigs.slice(0, 3).map(cardGig).join("");
    document.getElementById("totalJobs").textContent = String(jobs.length);
    document.getElementById("totalGigs").textContent = String(gigs.length);
  }

  async function renderJobs() {
    const list = document.getElementById("jobList");
    const filter = document.getElementById("jobCategory");
    const search = document.getElementById("jobSearch");
    const levelFilter = document.getElementById("jobLevel");
    const typeFilter = document.getElementById("jobType");
    const budgetMinInput = document.getElementById("jobBudgetMin");
    const budgetMaxInput = document.getElementById("jobBudgetMax");
    const clearBtn = document.getElementById("jobClearFilters");
    const modeFreelance = document.getElementById("modeFreelance");
    const modeMicro = document.getElementById("modeMicro");
    const manager = document.getElementById("categoryManager");
    const managerMode = document.getElementById("categoryMode");
    const managerName = document.getElementById("newCategoryName");
    const managerBtn = document.getElementById("addCategoryBtn");
    const managerNotice = document.getElementById("categoryNotice");
    const apiJobs = await tryApi("/jobs");
    const jobMap = new Map();
    state.jobs.concat(Array.isArray(apiJobs) ? apiJobs : []).forEach((job) => {
      if (!job?.id) return;
      jobMap.set(job.id, job);
    });
    const jobs = Array.from(jobMap.values());
    const params = new URLSearchParams(window.location.search);
    let activeMode = params.get("mode") === "micro" ? "micro" : "freelance";
    const presetQuery = String(params.get("q") || "").trim();
    const presetLevel = String(params.get("level") || "").trim();
    const presetType = String(params.get("type") || "").trim();
    const presetMin = String(params.get("budgetMin") || "").trim();
    const presetMax = String(params.get("budgetMax") || "").trim();

    function inferMode(job) {
      if (job.mode) return String(job.mode).toLowerCase();
      return categoriesForMode("micro").includes(job.category) ? "micro" : "freelance";
    }

    function refillCategories() {
      const options = ['<option value="all">All Categories</option>']
        .concat(categoriesForMode(activeMode).map((c) => `<option value="${c}">${c}</option>`))
        .join("");
      filter.innerHTML = options;
    }

    function parseBudgetValue(budgetText) {
      const n = Number(String(budgetText || "").replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }

    function paint() {
      const q = search.value.trim().toLowerCase();
      const cat = filter.value;
      const level = levelFilter?.value || "all";
      const type = typeFilter?.value || "all";
      const min = Number(budgetMinInput?.value || "");
      const max = Number(budgetMaxInput?.value || "");
      const out = jobs.filter((job) => {
        const matchMode = inferMode(job) === activeMode;
        const matchCat = cat === "all" || job.category === cat;
        const matchLevel = level === "all" || job.level === level;
        const matchType = type === "all" || job.type === type;
        const matchQ = !q || job.title.toLowerCase().includes(q) || job.description.toLowerCase().includes(q);
        const amount = parseBudgetValue(job.budget);
        const matchMin = !Number.isFinite(min) || min <= 0 || amount >= min;
        const matchMax = !Number.isFinite(max) || max <= 0 || amount <= max;
        return matchMode && matchCat && matchLevel && matchType && matchQ && matchMin && matchMax;
      });
      list.innerHTML = out.length ? out.map((job) => cardJob(job, true)).join("") : "<p>No jobs found for this filter.</p>";
    }

    list.addEventListener("submit", (e) => {
      const form = e.target;
      if (!form.classList.contains("bid-form")) return;
      e.preventDefault();
      const notice = form.querySelector(".bid-notice");
      const data = new FormData(form);
      const payload = {
        amount: String(data.get("amount") || "").trim(),
        deliveryDays: String(data.get("deliveryDays") || "").trim(),
        coverLetter: String(data.get("coverLetter") || "").trim()
      };

      if (Object.values(payload).some((v) => !v)) {
        showNotice(notice, "Fill all proposal fields.", true);
        return;
      }

      state.myBids.unshift({
        id: `B${Date.now()}`,
        jobTitle: "Selected Job",
        postedBy: "Client",
        jobBudget: payload.amount,
        coverLetter: payload.coverLetter,
        amount: payload.amount,
        deliveryDays: payload.deliveryDays,
        status: "pending"
      });
      persist();
      form.reset();
      showNotice(notice, "Proposal sent successfully.", false);
    });

    filter.addEventListener("change", paint);
    search.addEventListener("input", paint);
    levelFilter?.addEventListener("change", paint);
    typeFilter?.addEventListener("change", paint);
    budgetMinInput?.addEventListener("input", paint);
    budgetMaxInput?.addEventListener("input", paint);
    clearBtn?.addEventListener("click", () => {
      if (search) search.value = "";
      if (filter) filter.value = "all";
      if (levelFilter) levelFilter.value = "all";
      if (typeFilter) typeFilter.value = "all";
      if (budgetMinInput) budgetMinInput.value = "";
      if (budgetMaxInput) budgetMaxInput.value = "";
      paint();
    });

    modeFreelance?.addEventListener("click", () => {
      activeMode = "freelance";
      modeFreelance.classList.add("active");
      modeMicro?.classList.remove("active");
      refillCategories();
      paint();
    });

    modeMicro?.addEventListener("click", () => {
      activeMode = "micro";
      modeMicro.classList.add("active");
      modeFreelance?.classList.remove("active");
      refillCategories();
      paint();
    });

    if (manager) {
      manager.style.display = canManageCategories() ? "block" : "none";
      managerBtn?.addEventListener("click", async () => {
        if (!canManageCategories()) {
          showNotice(managerNotice, "Only Admin/Employer can add categories.", true);
          return;
        }
        const mode = managerMode?.value || "freelance";
        const raw = managerName?.value || "";
        const names = String(raw)
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!names.length) {
          showNotice(managerNotice, "Category name is required.", true);
          return;
        }

        let addedCount = 0;
        for (const name of names) {
          try {
            await authedApi("/categories", { method: "POST", body: JSON.stringify({ mode, name }) });
            addedCount += 1;
          } catch {
            // ignore individual failure, fallback below
          }
        }

        if (!addedCount) {
          const out = addCategoryToMode(mode, raw);
          showNotice(managerNotice, out.message, !out.ok);
        } else {
          await syncJobCategoriesFromApi();
          showNotice(managerNotice, `${addedCount} categories added.`, false);
        }

        if (managerName) managerName.value = "";
        refillCategories();
        paint();
      });
    }

    await syncJobCategoriesFromApi();
    if (search && presetQuery) search.value = presetQuery;
    if (levelFilter && presetLevel) levelFilter.value = presetLevel;
    if (typeFilter && presetType) typeFilter.value = presetType;
    if (budgetMinInput && presetMin) budgetMinInput.value = presetMin;
    if (budgetMaxInput && presetMax) budgetMaxInput.value = presetMax;
    if (activeMode === "micro") {
      modeMicro?.classList.add("active");
      modeFreelance?.classList.remove("active");
    } else {
      modeFreelance?.classList.add("active");
      modeMicro?.classList.remove("active");
    }
    refillCategories();
    paint();
  }

  function renderGigs() {
    const list = document.getElementById("gigList");
    const filter = document.getElementById("gigCategory");
    const gigs = state.gigs.slice();

    function paint() {
      const cat = filter.value;
      const out = gigs.filter((gig) => cat === "all" || gig.category === cat);
      list.innerHTML = out.length ? out.map(cardGig).join("") : "<p>No gigs in this category.</p>";
    }

    filter.addEventListener("change", paint);
    paint();
  }

  function initPostJob() {
    const form = document.getElementById("postJobForm");
    const notice = document.getElementById("postNotice");
    const modeSelect = document.getElementById("postJobMode");
    const categorySelect = document.getElementById("postJobCategory");
    const manager = document.getElementById("postCategoryManager");
    const managerMode = document.getElementById("postCategoryMode");
    const managerName = document.getElementById("postNewCategoryName");
    const managerBtn = document.getElementById("postAddCategoryBtn");
    const managerNotice = document.getElementById("postCategoryNotice");

    function refillPostCategories() {
      const mode = modeSelect?.value || "freelance";
      const options = ['<option value="">Select category</option>']
        .concat(categoriesForMode(mode).map((c) => `<option value="${c}">${c}</option>`))
        .join("");
      if (categorySelect) categorySelect.innerHTML = options;
    }

    modeSelect?.addEventListener("change", refillPostCategories);
    syncJobCategoriesFromApi().finally(refillPostCategories);

    if (manager) {
      manager.style.display = canManageCategories() ? "block" : "none";
      managerBtn?.addEventListener("click", async () => {
        if (!canManageCategories()) {
          showNotice(managerNotice, "Only Admin/Employer can add categories.", true);
          return;
        }
        const mode = managerMode?.value || "freelance";
        const raw = managerName?.value || "";
        const names = String(raw)
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!names.length) {
          showNotice(managerNotice, "Category name is required.", true);
          return;
        }

        let addedCount = 0;
        for (const name of names) {
          try {
            await authedApi("/categories", { method: "POST", body: JSON.stringify({ mode, name }) });
            addedCount += 1;
          } catch {
            // ignore individual failure, fallback below
          }
        }

        if (!addedCount) {
          const out = addCategoryToMode(mode, raw);
          showNotice(managerNotice, out.message, !out.ok);
        } else {
          await syncJobCategoriesFromApi();
          showNotice(managerNotice, `${addedCount} categories added.`, false);
        }
        if (managerName) managerName.value = "";
        refillPostCategories();
      });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const payload = {
        title: String(data.get("title") || "").trim(),
        budget: String(data.get("budget") || "").trim(),
        category: String(data.get("category") || ""),
        mode: String(data.get("mode") || "freelance"),
        level: String(data.get("level") || ""),
        type: String(data.get("type") || ""),
        description: String(data.get("description") || "").trim()
      };

      if (Object.values(payload).some((v) => !v)) {
        showNotice(notice, "Please fill all fields before posting.", true);
        return;
      }

      state.jobs.unshift({ id: `J${Date.now()}`, posted: "just now", bidCount: 0, ...payload });
      persist();
      form.reset();
      refillPostCategories();
      showNotice(notice, "Job posted successfully.", false);
    });
  }

  function renderDashboard() {
    document.getElementById("dbJobs").textContent = String(state.jobs.length);
    document.getElementById("dbGigs").textContent = String(state.gigs.length);
    document.getElementById("dbBids").textContent = String(state.myBids.length + state.clientBids.length);
    document.getElementById("dbPm").textContent = String(state.paymentMethods.length);
    document.getElementById("dbTopCat").textContent = state.jobs[0]?.category || "General";
    document.getElementById("recentJobs").innerHTML = state.jobs.slice(0, 4).map((j) => cardJob(j, false)).join("");
  }

  function renderMyBids() {
    const list = document.getElementById("myBidList");
    list.innerHTML = state.myBids.length ? state.myBids.map(cardMyBid).join("") : "<p>You have not submitted any proposals yet.</p>";
  }

  function renderClientBids() {
    const list = document.getElementById("clientBidList");
    const notice = document.getElementById("clientBidNotice");

    function paint() {
      list.innerHTML = state.clientBids.length ? state.clientBids.map(cardClientBid).join("") : "<p>No proposals received yet.</p>";
    }

    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".action-btn");
      if (!btn) return;
      const id = btn.dataset.bidId;
      const status = btn.dataset.action;
      state.clientBids = state.clientBids.map((b) => (String(b.id) === String(id) ? { ...b, status } : b));
      persist();
      paint();
      showNotice(notice, `Proposal ${status}.`, false);
    });

    paint();
  }

  function renderPayments() {
    const list = document.getElementById("paymentList");
    const notice = document.getElementById("paymentNotice");
    const form = document.getElementById("paymentMethodForm");

    function paint() {
      list.innerHTML = state.paymentMethods.length ? state.paymentMethods.map(cardPayment).join("") : "<p>No payment method added yet.</p>";
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const row = {
        id: `PM${Date.now()}`,
        type: String(data.get("type") || "").trim(),
        provider: String(data.get("provider") || "").trim(),
        accountName: String(data.get("accountName") || "").trim(),
        accountNumber: String(data.get("accountNumber") || "").trim(),
        accountEmail: String(data.get("accountEmail") || "").trim(),
        accountLast4: String(data.get("accountNumber") || "0000").slice(-4),
        country: String(data.get("country") || "").trim(),
        currency: String(data.get("currency") || "").trim(),
        isDefault: Boolean(data.get("isDefault"))
      };

      if (row.isDefault) {
        state.paymentMethods = state.paymentMethods.map((m) => ({ ...m, isDefault: false }));
      }
      state.paymentMethods.push(row);
      persist();
      form.reset();
      paint();
      showNotice(notice, "Payment method added.", false);
    });

    list.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".pm-remove");
      const defaultBtn = e.target.closest(".pm-default");
      if (removeBtn) {
        state.paymentMethods = state.paymentMethods.filter((m) => String(m.id) !== String(removeBtn.dataset.methodId));
        persist();
        paint();
      }
      if (defaultBtn) {
        state.paymentMethods = state.paymentMethods.map((m) => ({ ...m, isDefault: String(m.id) === String(defaultBtn.dataset.methodId) }));
        persist();
        paint();
      }
    });

    paint();
  }

  function renderSettings() {
    const form = document.getElementById("settingsForm");
    const notice = document.getElementById("settingsNotice");
    const resetPasswordBtn = document.getElementById("resetPasswordBtn");

    form.displayName.value = state.settings.displayName || "";
    form.phone.value = state.settings.phone || "";
    form.payoutEmail.value = state.settings.payoutEmail || "";
    form.payoutAccountNumber.value = state.settings.payoutAccountNumber || "";
    form.resetEmail.value = state.settings.resetEmail || "";
    form.twoFactorEnabled.value = String(Boolean(state.settings.twoFactorEnabled));
    form.passkeyEnabled.value = String(Boolean(state.settings.passkeyEnabled));
    form.securityPhone.value = state.settings.phone || "";

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      state.settings = {
        displayName: String(data.get("displayName") || "").trim(),
        payoutEmail: String(data.get("payoutEmail") || "").trim(),
        payoutAccountNumber: String(data.get("payoutAccountNumber") || "").trim(),
        resetEmail: String(data.get("resetEmail") || "").trim(),
        twoFactorEnabled: String(data.get("twoFactorEnabled") || "false") === "true",
        passkeyEnabled: String(data.get("passkeyEnabled") || "false") === "true",
        phoneVerified: Boolean(state.settings.phoneVerified),
        phone: String(data.get("securityPhone") || data.get("phone") || "").trim()
      };
      persist();
      showNotice(notice, "Settings updated successfully.", false);
    });

    resetPasswordBtn?.addEventListener("click", () => {
      showNotice(notice, "Password reset flow started. Check your reset email.", false);
    });
  }

  async function renderKyc() {
    const form = document.getElementById("kycForm");
    const notice = document.getElementById("kycNotice");
    const statusEl = document.getElementById("kycStatus");
    const fileMeta = document.getElementById("kycFileMeta");

    try {
      const kyc = await authedApi("/kyc/status");
      const kycStatus = String(kyc?.status || "not_submitted");
      state.kycStatus = { status: kycStatus };
      persist();
      statusEl.innerHTML = `<span class="tag status ${kycStatus}">${kycStatus.toUpperCase()}</span>`;
      if (fileMeta && kyc?.documentFileUrl) {
        fileMeta.innerHTML = `Current document: <a href="${kyc.documentFileUrl}" target="_blank" rel="noopener">View file</a>`;
      }
    } catch {
      statusEl.innerHTML = `<span class="tag status ${state.kycStatus.status}">${state.kycStatus.status.toUpperCase()}</span>`;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const file = data.get("documentFile");
      if (!(file instanceof File) || !file.size) {
        showNotice(notice, "Please select your ID document file.", true);
        return;
      }

      try {
        const dataUrl = await fileToDataUrl(file);
        const upload = await authedApi("/uploads/base64", {
          method: "POST",
          body: JSON.stringify({
            kind: "kyc_document",
            fileName: file.name,
            mimeType: file.type,
            dataUrl
          })
        });

        await authedApi("/kyc/submit", {
          method: "POST",
          body: JSON.stringify({
            fullName: String(data.get("fullName") || "").trim(),
            dateOfBirth: String(data.get("dateOfBirth") || "").trim(),
            idType: String(data.get("idType") || "").trim(),
            idNumber: String(data.get("idNumber") || "").trim(),
            documentCountry: String(data.get("documentCountry") || "").trim(),
            documentFileUrl: upload.url
          })
        });

        state.kycStatus = { status: "under_review" };
        persist();
        statusEl.innerHTML = `<span class="tag status under_review">UNDER_REVIEW</span>`;
        if (fileMeta) {
          fileMeta.innerHTML = `Uploaded document: <a href="${upload.url}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a>`;
        }
        showNotice(notice, "KYC submitted with document. Status: under review.", false);
      } catch (err) {
        showNotice(notice, err.message || "KYC submission failed.", true);
      }
    });
  }

  async function renderAdminKyc() {
    const overviewEl = document.getElementById("adminOverview");
    const listEl = document.getElementById("adminKycList");
    const notice = document.getElementById("adminKycNotice");
    let rows = [];
    let totalUsers = 120;

    function paint() {
      const pending = rows.filter((r) => r.status === "pending" || r.status === "under_review").length;
      const approved = rows.filter((r) => r.status === "approved").length;
      overviewEl.innerHTML = `
        <article class="card"><h3>${totalUsers}</h3><p class="meta">Users</p></article>
        <article class="card"><h3>${pending}</h3><p class="meta">Pending KYC</p></article>
        <article class="card"><h3>${approved}</h3><p class="meta">Verified KYC</p></article>`;
      listEl.innerHTML = rows.length ? rows.map(cardAdminKyc).join("") : "<p>No KYC submission found.</p>";
    }

    listEl.addEventListener("click", async (e) => {
      const btn = e.target.closest(".kyc-action");
      if (!btn) return;
      const id = btn.dataset.id;
      const status = btn.dataset.status;
      try {
        await authedApi(`/admin/kyc/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        rows = rows.map((r) => (String(r.id) === String(id) ? { ...r, status } : r));
        state.adminKyc = rows;
        persist();
        paint();
        showNotice(notice, `KYC marked as ${status}.`, false);
      } catch (err) {
        showNotice(notice, err.message || "KYC update failed.", true);
      }
    });

    try {
      const overview = await authedApi("/admin/overview");
      if (overview && Number.isFinite(Number(overview.users))) {
        totalUsers = Number(overview.users);
      }
    } catch {
      totalUsers = 120;
    }

    try {
      const apiRows = await authedApi("/admin/kyc");
      if (Array.isArray(apiRows)) {
        rows = apiRows;
        state.adminKyc = apiRows;
        persist();
      }
    } catch {
      rows = state.adminKyc.slice();
    }

    paint();
  }

  async function renderWorkerProfile() {
    const userName = state.settings.displayName || "Worker";
    const userTitle = document.getElementById("workerTitle");
    const userMeta = document.getElementById("workerMeta");
    const avatarEl = document.getElementById("workerAvatar");
    const avatarForm = document.getElementById("avatarUploadForm");
    const avatarFile = document.getElementById("avatarFile");
    const avatarNotice = document.getElementById("avatarNotice");
    const skillsEl = document.getElementById("workerSkills");
    const statsEl = document.getElementById("workerStats");
    const portfolioEl = document.getElementById("workerPortfolio");
    const portfolioForm = document.getElementById("portfolioForm");
    const portfolioTitle = document.getElementById("portfolioTitle");
    const portfolioDesc = document.getElementById("portfolioDesc");
    const portfolioFile = document.getElementById("portfolioFile");
    const portfolioNotice = document.getElementById("portfolioNotice");
    const portfolioSubmitBtn = portfolioForm?.querySelector('button[type="submit"]');
    const portfolioCancelBtn = document.getElementById("portfolioCancelEdit");
    let editingPortfolioId = "";
    let profile = { avatarUrl: "", portfolio: [] };

    if (userTitle) userTitle.textContent = userName;
    if (userMeta) {
      const country = state.settings.country || "Remote";
      userMeta.textContent = `Top-rated freelancer • ${country}`;
    }

    const skills = ["Web Development", "UI/UX", "WordPress", "API Integration", "SEO Basics"];
    if (skillsEl) skillsEl.innerHTML = skills.map((s) => `<span class="tag">${s}</span>`).join("");

    if (statsEl) {
      const completed = state.myBids.filter((b) => b.status === "accepted").length;
      statsEl.innerHTML = `
        <article class="card"><h3>${completed}</h3><p class="meta">Completed Projects</p></article>
        <article class="card"><h3>${state.myBids.length}</h3><p class="meta">Total Proposals</p></article>
        <article class="card"><h3>4.9</h3><p class="meta">Client Rating</p></article>
      `;
    }

    try {
      profile = await authedApi("/me/profile");
    } catch {
      profile = { avatarUrl: "", portfolio: [] };
    }

    function paintProfileMedia() {
      if (avatarEl) {
        if (profile.avatarUrl) {
          avatarEl.src = profile.avatarUrl;
          avatarEl.style.display = "block";
        } else {
          avatarEl.style.display = "none";
        }
      }

      const items = Array.isArray(profile.portfolio) ? profile.portfolio : [];
      portfolioEl.innerHTML = items.length
        ? items
            .map(
              (i) => `
              <article class="card">
                ${i.imageUrl ? `<a href="${i.imageUrl}" target="_blank" rel="noopener"><img class="portfolio-thumb" src="${i.imageUrl}" alt="${escapeHtml(i.title || "Portfolio")}" /></a>` : ""}
                <h3>${escapeHtml(i.title || "Untitled")}</h3>
                <p class="meta">${escapeHtml(i.desc || "")}</p>
                <div class="action-row">
                  <button class="btn btn-light pf-edit" type="button" data-pf-id="${escapeHtml(i.id || "")}">Edit</button>
                  <button class="btn btn-light pf-delete" type="button" data-pf-id="${escapeHtml(i.id || "")}">Delete</button>
                </div>
              </article>
            `
            )
            .join("")
        : "<p>No portfolio item yet.</p>";
    }

    paintProfileMedia();

    function resetPortfolioForm() {
      editingPortfolioId = "";
      if (portfolioForm) portfolioForm.reset();
      if (portfolioSubmitBtn) portfolioSubmitBtn.textContent = "Add Portfolio Item";
      if (portfolioFile) portfolioFile.required = true;
    }

    avatarForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = avatarFile?.files?.[0];
      if (!file) {
        showNotice(avatarNotice, "Select a photo first.", true);
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        const upload = await authedApi("/uploads/base64", {
          method: "POST",
          body: JSON.stringify({
            kind: "profile_avatar",
            fileName: file.name,
            mimeType: file.type,
            dataUrl
          })
        });
        const out = await authedApi("/me/profile", {
          method: "PATCH",
          body: JSON.stringify({ avatarUrl: upload.url, portfolio: profile.portfolio || [] })
        });
        profile = out.profile || profile;
        paintProfileMedia();
        showNotice(avatarNotice, "Profile photo uploaded.", false);
      } catch (err) {
        showNotice(avatarNotice, err.message || "Photo upload failed.", true);
      }
    });

    portfolioForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = String(portfolioTitle?.value || "").trim();
      const desc = String(portfolioDesc?.value || "").trim();
      const file = portfolioFile?.files?.[0];
      if (!title || !desc) {
        showNotice(portfolioNotice, "Title and description are required.", true);
        return;
      }

      const currentItems = Array.isArray(profile.portfolio) ? profile.portfolio : [];
      const editingItem = editingPortfolioId ? currentItems.find((i) => String(i.id) === String(editingPortfolioId)) : null;
      if (!editingItem && !file) {
        showNotice(portfolioNotice, "File is required for new item.", true);
        return;
      }

      try {
        let imageUrl = editingItem?.imageUrl || "";
        if (file) {
          const dataUrl = await fileToDataUrl(file);
          const upload = await authedApi("/uploads/base64", {
            method: "POST",
            body: JSON.stringify({
              kind: "portfolio_image",
              fileName: file.name,
              mimeType: file.type,
              dataUrl
            })
          });
          imageUrl = upload.url;
        }

        let nextPortfolio = currentItems.slice();
        if (editingItem) {
          nextPortfolio = nextPortfolio.map((i) =>
            String(i.id) === String(editingPortfolioId) ? { ...i, title, desc, imageUrl } : i
          );
        } else {
          nextPortfolio = nextPortfolio.concat([{ id: `PF${Date.now()}`, title, desc, imageUrl }]).slice(-24);
        }

        const out = await authedApi("/me/profile", {
          method: "PATCH",
          body: JSON.stringify({ avatarUrl: profile.avatarUrl || "", portfolio: nextPortfolio })
        });
        profile = out.profile || profile;
        paintProfileMedia();
        resetPortfolioForm();
        showNotice(portfolioNotice, editingItem ? "Portfolio item updated." : "Portfolio item uploaded.", false);
      } catch (err) {
        showNotice(portfolioNotice, err.message || "Portfolio upload failed.", true);
      }
    });

    portfolioCancelBtn?.addEventListener("click", () => {
      resetPortfolioForm();
      showNotice(portfolioNotice, "Edit mode canceled.", false);
    });

    portfolioEl?.addEventListener("click", async (e) => {
      const editBtn = e.target.closest(".pf-edit");
      const deleteBtn = e.target.closest(".pf-delete");
      if (!editBtn && !deleteBtn) return;

      const id = String((editBtn || deleteBtn).dataset.pfId || "");
      const items = Array.isArray(profile.portfolio) ? profile.portfolio : [];
      const item = items.find((i) => String(i.id) === id);
      if (!item) return;

      if (editBtn) {
        editingPortfolioId = id;
        if (portfolioTitle) portfolioTitle.value = item.title || "";
        if (portfolioDesc) portfolioDesc.value = item.desc || "";
        if (portfolioSubmitBtn) portfolioSubmitBtn.textContent = "Update Portfolio Item";
        if (portfolioFile) portfolioFile.required = false;
        showNotice(portfolioNotice, "Editing selected item. Choose new file only if you want to replace image.", false);
        return;
      }

      if (deleteBtn) {
        const ok = window.confirm("Delete this portfolio item?");
        if (!ok) return;
        try {
          const nextPortfolio = items.filter((i) => String(i.id) !== id);
          const out = await authedApi("/me/profile", {
            method: "PATCH",
            body: JSON.stringify({ avatarUrl: profile.avatarUrl || "", portfolio: nextPortfolio })
          });
          profile = out.profile || profile;
          paintProfileMedia();
          if (editingPortfolioId === id) resetPortfolioForm();
          showNotice(portfolioNotice, "Portfolio item deleted.", false);
        } catch (err) {
          showNotice(portfolioNotice, err.message || "Delete failed.", true);
        }
      }
    });

    if (portfolioEl) {
      const items = [
        { title: "Ecommerce Landing Page", desc: "Responsive redesign with conversion-focused sections." },
        { title: "Admin Dashboard UI", desc: "Data-heavy dashboard with clean components and charts." },
        { title: "SEO Optimization Pack", desc: "Technical + on-page SEO for small business websites." }
      ];
      if (!Array.isArray(profile.portfolio) || !profile.portfolio.length) {
        portfolioEl.innerHTML = items
          .map((i) => `<article class="card"><h3>${i.title}</h3><p class="meta">${i.desc}</p></article>`)
          .join("");
      }
    }
  }

  function renderEmployerProfile() {
    const titleEl = document.getElementById("employerTitle");
    const metaEl = document.getElementById("employerMeta");
    const statsEl = document.getElementById("employerStats");
    const projectsEl = document.getElementById("employerProjects");

    const name = state.settings.displayName || "Employer";
    if (titleEl) titleEl.textContent = name;
    if (metaEl) metaEl.textContent = "Hiring company profile • Trusted buyer";

    const postedJobs = state.jobs.length;
    const received = state.clientBids.length;
    const active = state.jobs.filter((j) => (j.bidCount || 0) > 0).length;

    if (statsEl) {
      statsEl.innerHTML = `
        <article class="card"><h3>${postedJobs}</h3><p class="meta">Jobs Posted</p></article>
        <article class="card"><h3>${received}</h3><p class="meta">Proposals Received</p></article>
        <article class="card"><h3>${active}</h3><p class="meta">Active Hiring</p></article>
      `;
    }

    if (projectsEl) {
      const topJobs = state.jobs.slice(0, 4);
      projectsEl.innerHTML = topJobs.length
        ? topJobs
            .map(
              (j) => `
              <article class="card">
                <h3>${j.title}</h3>
                <p class="meta">${j.category} • ${j.type} • ${j.budget}</p>
                <p>${j.description}</p>
              </article>
            `
            )
            .join("")
        : "<p>No projects posted yet.</p>";
    }
  }

  function renderContracts() {
    const role = getCurrentRole();
    const canClientManage = role === "Client" || role === "Admin";
    const canFreelancerSubmit = role === "Freelancer" || role === "Admin";
    const createCard = document.getElementById("createContractCard");
    const createForm = document.getElementById("createContractForm");
    const acceptedBidSelect = document.getElementById("acceptedBidSelect");
    const refreshAcceptedBidsBtn = document.getElementById("refreshAcceptedBids");
    const listEl = document.getElementById("contractList");
    const detailEl = document.getElementById("contractDetail");
    const noticeEl = document.getElementById("contractNotice");
    const pageError = document.getElementById("pageError");
    let contracts = [];
    let activeId = "";
    let editingMilestoneId = "";

    if (createCard) createCard.style.display = canClientManage ? "block" : "none";

    function formatMoney(v) {
      const n = Number(v || 0);
      return `$${n.toFixed(2)}`;
    }

    function findActive() {
      return contracts.find((c) => String(c.id) === String(activeId)) || null;
    }

    async function loadAcceptedBidCandidates() {
      if (!acceptedBidSelect) return;
      acceptedBidSelect.innerHTML = '<option value="">Loading...</option>';
      try {
        const rows = await authedApi("/contracts/candidates");
        const options = ['<option value="">Select accepted bid</option>']
          .concat((rows || []).map((r) => `<option value="${escapeHtml(r.bidId)}">${escapeHtml(r.label)}</option>`))
          .join("");
        acceptedBidSelect.innerHTML = options;
      } catch (err) {
        acceptedBidSelect.innerHTML = '<option value="">Could not load accepted bids</option>';
        showNotice(noticeEl, err.message || "Could not load accepted bids.", true);
      }
    }

    function paintList() {
      if (!listEl) return;
      if (!contracts.length) {
        listEl.innerHTML = "<p class='meta'>No contracts yet.</p>";
        return;
      }
      listEl.innerHTML = contracts
        .map(
          (c) => `
          <button class="contract-item ${String(c.id) === String(activeId) ? "active" : ""}" type="button" data-contract-id="${escapeHtml(c.id)}">
            <strong>${escapeHtml(c.title || c.jobTitle || "Contract")}</strong>
            <p class="meta">${escapeHtml(c.jobTitle || "-")}</p>
            <p><span class="tag">${escapeHtml(c.status)}</span><span class="tag">${formatMoney(c.escrowReleased)} / ${formatMoney(c.escrowTotal)}</span></p>
          </button>
        `
        )
        .join("");
    }

    async function paintDetail() {
      if (!detailEl) return;
      const contract = findActive();
      if (!contract) {
        detailEl.innerHTML = "<p class='meta'>Select a contract to view milestones.</p>";
        return;
      }

      let milestones = [];
      let transactions = [];
      try {
        milestones = await authedApi(`/contracts/${encodeURIComponent(contract.id)}/milestones`);
      } catch (err) {
        showNotice(pageError, err.message || "Failed to load milestones.", true);
      }
      try {
        transactions = await authedApi(`/contracts/${encodeURIComponent(contract.id)}/transactions`);
      } catch {
        transactions = [];
      }

      const milestoneHtml = milestones.length
        ? milestones
            .map((m) => {
              let actions = "";
              if (canFreelancerSubmit && m.status === "pending") {
                actions += `<button class="btn btn-light milestone-action" data-mid="${escapeHtml(m.id)}" data-status="submitted" type="button">Submit Delivery</button>`;
              }
              if (canClientManage && m.status === "submitted") {
                actions += `<button class="btn btn-brand milestone-action" data-mid="${escapeHtml(m.id)}" data-status="approved" type="button">Approve & Release</button>`;
                actions += `<button class="btn btn-light milestone-action" data-mid="${escapeHtml(m.id)}" data-status="rejected" type="button">Reject</button>`;
              }
              if (canClientManage && m.status !== "approved") {
                actions += `<button class="btn btn-light milestone-edit" data-mid="${escapeHtml(m.id)}" type="button">Edit</button>`;
                actions += `<button class="btn btn-light milestone-delete" data-mid="${escapeHtml(m.id)}" type="button">Delete</button>`;
              }
              const proofBlock = m.proofUrl || m.proofNote
                ? `<p class="meta">Proof: ${m.proofUrl ? `<a href="${m.proofUrl}" target="_blank" rel="noopener">View file</a>` : ""} ${m.proofNote ? `• ${escapeHtml(m.proofNote)}` : ""}</p>`
                : "";
              const proofForm =
                canFreelancerSubmit && (m.status === "pending" || m.status === "submitted")
                  ? `
                  <form class="milestone-proof-form controls" data-mid="${escapeHtml(m.id)}" style="margin-top:6px;">
                    <input name="proofFile" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt" />
                    <input name="proofNote" type="text" placeholder="Proof note (optional)" />
                    <button class="btn btn-light" type="submit">Upload Proof</button>
                  </form>
                `
                  : "";
              return `
                <article class="milestone-card">
                  <h4>${escapeHtml(m.title)}</h4>
                  <p class="meta">Due: ${escapeHtml(m.dueDate)} • Amount: ${formatMoney(m.amount)}</p>
                  <p>${statusBadge(m.status)}</p>
                  ${proofBlock}
                  <div class="action-row">${actions}</div>
                  ${proofForm}
                </article>
              `;
            })
            .join("")
        : "<p class='meta'>No milestones yet.</p>";

      const contractActions =
        canClientManage && contract.status !== "completed"
          ? `
          <div class="action-row">
            <button class="btn btn-light contract-status" data-status="active" type="button">Set Active</button>
            <button class="btn btn-brand contract-status" data-status="completed" type="button">Mark Completed</button>
            <button class="btn btn-light contract-status" data-status="cancelled" type="button">Cancel</button>
          </div>
        `
          : "";

      const addMilestoneForm =
        canClientManage && contract.status === "active"
          ? `
          <form id="milestoneForm" class="card" style="margin-top:10px;">
            <h4 style="margin-top:0;">${editingMilestoneId ? "Edit Milestone" : "Add Milestone"}</h4>
            <div class="controls">
              <input name="title" type="text" placeholder="Milestone title" required />
              <input name="amount" type="number" min="1" step="0.01" placeholder="Amount" required />
              <input name="dueDate" type="date" required />
              <button class="btn btn-brand" type="submit">${editingMilestoneId ? "Save Milestone" : "Add Milestone"}</button>
              <button class="btn btn-light" id="milestoneCancelEdit" type="button" ${editingMilestoneId ? "" : "style='display:none;'"}>Cancel Edit</button>
            </div>
          </form>
        `
          : "";

      const txHtml = transactions.length
        ? transactions
            .map(
              (t) => `
              <article class="milestone-card">
                <p><strong>${escapeHtml(t.action)}</strong> • ${escapeHtml(t.actorName || "-")}</p>
                <p class="meta">${formatMoney(t.amount)} ${t.note ? `• ${escapeHtml(t.note)}` : ""}</p>
                <p class="meta">${new Date(t.createdAt).toLocaleString()}</p>
              </article>
            `
            )
            .join("")
        : "<p class='meta'>No transactions yet.</p>";

      detailEl.innerHTML = `
        <article class="card">
          <h3>${escapeHtml(contract.title)}</h3>
          <p class="meta">${escapeHtml(contract.jobTitle || "-")}</p>
          <p><span class="tag">Client: ${escapeHtml(contract.clientName || "-")}</span><span class="tag">Freelancer: ${escapeHtml(contract.freelancerName || "-")}</span>${statusBadge(contract.status)}</p>
          <p><span class="tag">Escrow Total: ${formatMoney(contract.escrowTotal)}</span><span class="tag">Released: ${formatMoney(contract.escrowReleased)}</span><span class="tag">Remaining: ${formatMoney(contract.escrowRemaining)}</span></p>
          ${contractActions}
        </article>
        <section class="section" style="margin-top:10px;">
          <h3>Milestones</h3>
          ${milestoneHtml}
          ${addMilestoneForm}
        </section>
        <section class="section" style="margin-top:10px;">
          <h3>Transaction History</h3>
          ${txHtml}
        </section>
      `;

      if (editingMilestoneId) {
        const m = milestones.find((x) => String(x.id) === String(editingMilestoneId));
        const form = detailEl.querySelector("#milestoneForm");
        if (m && form) {
          form.elements.title.value = m.title || "";
          form.elements.amount.value = String(m.amount || "");
          form.elements.dueDate.value = m.dueDate || "";
        }
      }
    }

    async function refreshContracts() {
      try {
        contracts = await authedApi("/contracts");
        if (!activeId && contracts.length) activeId = contracts[0].id;
        if (activeId && !contracts.find((c) => String(c.id) === String(activeId))) {
          activeId = contracts[0]?.id || "";
        }
        paintList();
        await paintDetail();
      } catch (err) {
        showNotice(pageError, err.message || "Failed to load contracts.", true);
      }
    }

    createForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(createForm);
      const payload = {
        bidId: String(fd.get("bidId") || "").trim(),
        title: String(fd.get("title") || "").trim(),
        escrowTotal: String(fd.get("escrowTotal") || "").trim()
      };
      if (!payload.bidId) {
        showNotice(noticeEl, "Accepted Bid ID is required.", true);
        return;
      }
      try {
        await authedApi("/contracts/from-bid", { method: "POST", body: JSON.stringify(payload) });
        createForm.reset();
        showNotice(noticeEl, "Contract created.", false);
        await loadAcceptedBidCandidates();
        await refreshContracts();
      } catch (err) {
        showNotice(noticeEl, err.message || "Contract creation failed.", true);
      }
    });

    refreshAcceptedBidsBtn?.addEventListener("click", () => {
      loadAcceptedBidCandidates();
    });

    listEl?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".contract-item");
      if (!btn) return;
      const id = String(btn.dataset.contractId || "");
      if (!id) return;
      activeId = id;
      paintList();
      await paintDetail();
    });

    detailEl?.addEventListener("click", async (e) => {
      const contract = findActive();
      if (!contract) return;

      const statusBtn = e.target.closest(".contract-status");
      if (statusBtn) {
        const status = String(statusBtn.dataset.status || "");
        try {
          await authedApi(`/contracts/${encodeURIComponent(contract.id)}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status })
          });
          showNotice(noticeEl, `Contract status updated to ${status}.`, false);
          await refreshContracts();
        } catch (err) {
          showNotice(noticeEl, err.message || "Contract status update failed.", true);
        }
        return;
      }

      const milestoneBtn = e.target.closest(".milestone-action");
      if (milestoneBtn) {
        const mid = String(milestoneBtn.dataset.mid || "");
        const status = String(milestoneBtn.dataset.status || "");
        if (!mid || !status) return;
        try {
          await authedApi(`/contracts/${encodeURIComponent(contract.id)}/milestones/${encodeURIComponent(mid)}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status })
          });
          showNotice(noticeEl, `Milestone marked ${status}.`, false);
          await refreshContracts();
        } catch (err) {
          showNotice(noticeEl, err.message || "Milestone status update failed.", true);
        }
      }

      const milestoneEditBtn = e.target.closest(".milestone-edit");
      if (milestoneEditBtn) {
        editingMilestoneId = String(milestoneEditBtn.dataset.mid || "");
        await paintDetail();
        return;
      }

      const milestoneDeleteBtn = e.target.closest(".milestone-delete");
      if (milestoneDeleteBtn) {
        const mid = String(milestoneDeleteBtn.dataset.mid || "");
        if (!mid) return;
        const ok = window.confirm("Delete this milestone?");
        if (!ok) return;
        try {
          await authedApi(`/contracts/${encodeURIComponent(contract.id)}/milestones/${encodeURIComponent(mid)}`, {
            method: "DELETE"
          });
          if (editingMilestoneId === mid) editingMilestoneId = "";
          showNotice(noticeEl, "Milestone deleted.", false);
          await refreshContracts();
        } catch (err) {
          showNotice(noticeEl, err.message || "Delete failed.", true);
        }
        return;
      }

      if (e.target?.id === "milestoneCancelEdit") {
        editingMilestoneId = "";
        await paintDetail();
      }
    });

    detailEl?.addEventListener("submit", async (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.id !== "milestoneForm") return;
      if (form.classList.contains("milestone-proof-form")) return;
      e.preventDefault();
      const contract = findActive();
      if (!contract) return;
      const fd = new FormData(form);
      const payload = {
        title: String(fd.get("title") || "").trim(),
        amount: Number(fd.get("amount") || ""),
        dueDate: String(fd.get("dueDate") || "").trim()
      };
      if (!payload.title || !Number.isFinite(payload.amount) || payload.amount <= 0 || !payload.dueDate) {
        showNotice(noticeEl, "Title, amount and due date are required.", true);
        return;
      }

      try {
        if (editingMilestoneId) {
          await authedApi(`/contracts/${encodeURIComponent(contract.id)}/milestones/${encodeURIComponent(editingMilestoneId)}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
          showNotice(noticeEl, "Milestone updated.", false);
          editingMilestoneId = "";
        } else {
          await authedApi(`/contracts/${encodeURIComponent(contract.id)}/milestones`, {
            method: "POST",
            body: JSON.stringify(payload)
          });
          showNotice(noticeEl, "Milestone added.", false);
        }
        await refreshContracts();
      } catch (err) {
        showNotice(noticeEl, err.message || "Could not add milestone.", true);
      }
    });

    detailEl?.addEventListener("submit", async (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !form.classList.contains("milestone-proof-form")) return;
      e.preventDefault();
      const contract = findActive();
      if (!contract) return;
      const mid = String(form.dataset.mid || "");
      if (!mid) return;

      const fd = new FormData(form);
      const note = String(fd.get("proofNote") || "").trim();
      const file = form.querySelector('input[name="proofFile"]')?.files?.[0];
      let proofUrl = "";

      try {
        if (file) {
          const dataUrl = await fileToDataUrl(file);
          const upload = await authedApi("/uploads/base64", {
            method: "POST",
            body: JSON.stringify({
              kind: "milestone_proof",
              fileName: file.name,
              mimeType: file.type,
              dataUrl
            })
          });
          proofUrl = upload.url;
        }
        if (!proofUrl && !note) {
          showNotice(noticeEl, "Proof file or note লাগবে.", true);
          return;
        }

        await authedApi(`/contracts/${encodeURIComponent(contract.id)}/milestones/${encodeURIComponent(mid)}/proof`, {
          method: "POST",
          body: JSON.stringify({ proofUrl, proofNote: note, markSubmitted: true })
        });
        showNotice(noticeEl, "Milestone proof submitted.", false);
        await refreshContracts();
      } catch (err) {
        showNotice(noticeEl, err.message || "Proof submit failed.", true);
      }
    });

    Promise.all([refreshContracts(), loadAcceptedBidCandidates()]);
  }

  function renderDisputes() {
    const role = getCurrentRole();
    const isAdmin = role === "Admin";
    const createCard = document.getElementById("createDisputeCard");
    const contractSelect = document.getElementById("disputeContractSelect");
    const createForm = document.getElementById("createDisputeForm");
    const listEl = document.getElementById("disputeList");
    const detailEl = document.getElementById("disputeDetail");
    const noticeEl = document.getElementById("disputeNotice");
    const pageError = document.getElementById("pageError");
    let disputes = [];
    let activeId = "";

    if (createCard) createCard.style.display = isAdmin ? "none" : "block";

    function activeDispute() {
      return disputes.find((d) => String(d.id) === String(activeId)) || null;
    }

    async function loadContractOptions() {
      if (!contractSelect) return;
      contractSelect.innerHTML = '<option value="">Loading contracts...</option>';
      try {
        const rows = await authedApi("/contracts");
        contractSelect.innerHTML =
          '<option value="">Select contract</option>' +
          rows
            .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(`${c.id} • ${c.title} • ${c.status}`)}</option>`)
            .join("");
      } catch {
        contractSelect.innerHTML = '<option value="">Could not load contracts</option>';
      }
    }

    function paintList() {
      if (!listEl) return;
      if (!disputes.length) {
        listEl.innerHTML = "<p class='meta'>No disputes yet.</p>";
        return;
      }
      listEl.innerHTML = disputes
        .map(
          (d) => `
          <button class="contract-item ${String(d.id) === String(activeId) ? "active" : ""}" type="button" data-dispute-id="${escapeHtml(d.id)}">
            <strong>${escapeHtml(d.reason)}</strong>
            <p class="meta">${escapeHtml(d.contractTitle || d.contractId || "-")}</p>
            <p><span class="tag">${escapeHtml(d.status)}</span><span class="tag">${new Date(d.updatedAt).toLocaleDateString()}</span></p>
          </button>
        `
        )
        .join("");
    }

    async function paintDetail() {
      const d = activeDispute();
      if (!detailEl) return;
      if (!d) {
        detailEl.innerHTML = "<p class='meta'>Select a dispute to view detail.</p>";
        return;
      }

      let full = null;
      try {
        full = await authedApi(`/disputes/${encodeURIComponent(d.id)}`);
      } catch (err) {
        showNotice(pageError, err.message || "Failed to load dispute.", true);
        return;
      }
      const dispute = full.dispute || d;
      const messages = Array.isArray(full.messages) ? full.messages : [];
      const evidence = Array.isArray(full.evidence) ? full.evidence : [];
      const messagesHtml = messages.length
        ? messages
            .map(
              (m) => `
              <article class="milestone-card">
                <p><strong>${escapeHtml(m.senderName || "User")}</strong>${m.isAdminNote ? " <span class='tag'>ADMIN NOTE</span>" : ""}</p>
                <p>${escapeHtml(m.message)}</p>
                <p class="meta">${new Date(m.createdAt).toLocaleString()}</p>
              </article>
            `
            )
            .join("")
        : "<p class='meta'>No messages yet.</p>";
      const evidenceHtml = evidence.length
        ? evidence
            .map(
              (ev) => `
              <article class="milestone-card">
                <p><strong>${escapeHtml(ev.title || "Milestone")}</strong> • ${escapeHtml(ev.status || "-")}</p>
                <p class="meta">Amount: $${Number(ev.amount || 0).toFixed(2)} • Due: ${escapeHtml(ev.dueDate || "-")}</p>
                ${ev.proofUrl ? `<p><a href="${ev.proofUrl}" target="_blank" rel="noopener">Open evidence file</a></p>` : ""}
                ${ev.proofNote ? `<p>${escapeHtml(ev.proofNote)}</p>` : ""}
              </article>
            `
            )
            .join("")
        : "<p class='meta'>No evidence submitted yet.</p>";

      const adminForm = isAdmin
        ? `
        <form id="disputeResolveForm" class="card" style="margin-top:10px;">
          <h4 style="margin-top:0;">Mediation Action</h4>
          <div class="controls">
            <select name="status" required>
              <option value="">Select status</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
              <option value="open">Re-open</option>
            </select>
            <input name="winnerUserId" type="text" placeholder="Winner User ID (for resolved)" />
            <input name="amountAwarded" type="number" min="0" step="0.01" placeholder="Amount Awarded" />
            <input name="resolutionNote" type="text" placeholder="Resolution note" />
            <button class="btn btn-brand" type="submit">Apply</button>
          </div>
        </form>
      `
        : "";

      detailEl.innerHTML = `
        <article class="card">
          <h3>${escapeHtml(dispute.reason)}</h3>
          <p class="meta">${escapeHtml(dispute.contractTitle || dispute.contractId || "-")}</p>
          <p><span class="tag">Opened By: ${escapeHtml(dispute.openedByName || dispute.openedBy || "-")}</span><span class="tag">Against: ${escapeHtml(dispute.againstName || dispute.againstUserId || "-")}</span><span class="tag">${escapeHtml(dispute.status)}</span></p>
          <p>${escapeHtml(dispute.description || "")}</p>
          ${
            dispute.status === "resolved"
              ? `<p class="meta">Resolved winner: ${escapeHtml(dispute.winnerUserId || "-")} • Amount: $${Number(dispute.amountAwarded || 0).toFixed(2)}</p>`
              : ""
          }
          ${dispute.resolutionNote ? `<p class="meta">Note: ${escapeHtml(dispute.resolutionNote)}</p>` : ""}
        </article>
        <section class="section" style="margin-top:10px;">
          <h3>Discussion</h3>
          ${messagesHtml}
          <form id="disputeMessageForm" class="controls" style="margin-top:8px;">
            <input name="message" type="text" placeholder="Write reply..." required />
            ${isAdmin ? '<label class="meta"><input type="checkbox" name="isAdminNote" /> Admin Note</label>' : ""}
            <button class="btn btn-brand" type="submit">Send</button>
          </form>
          ${adminForm}
        </section>
        <section class="section" style="margin-top:10px;">
          <h3>Evidence Panel</h3>
          ${evidenceHtml}
        </section>
      `;
    }

    async function refreshDisputes() {
      try {
        disputes = await authedApi("/disputes");
        if (!activeId && disputes.length) activeId = disputes[0].id;
        if (activeId && !disputes.find((d) => String(d.id) === String(activeId))) {
          activeId = disputes[0]?.id || "";
        }
        paintList();
        await paintDetail();
      } catch (err) {
        showNotice(pageError, err.message || "Failed to load disputes.", true);
      }
    }

    createForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(createForm);
      const contractId = String(data.get("contractId") || "").trim();
      const reason = String(data.get("reason") || "").trim();
      const description = String(data.get("description") || "").trim();
      const firstMessage = String(data.get("firstMessage") || "").trim();
      if (!contractId || !reason || !description) {
        showNotice(noticeEl, "Contract, reason and description are required.", true);
        return;
      }
      try {
        await authedApi(`/contracts/${encodeURIComponent(contractId)}/disputes`, {
          method: "POST",
          body: JSON.stringify({ reason, description, firstMessage })
        });
        createForm.reset();
        showNotice(noticeEl, "Dispute opened successfully.", false);
        await refreshDisputes();
      } catch (err) {
        showNotice(noticeEl, err.message || "Could not open dispute.", true);
      }
    });

    listEl?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-dispute-id]");
      if (!btn) return;
      const id = String(btn.dataset.disputeId || "");
      if (!id) return;
      activeId = id;
      paintList();
      await paintDetail();
    });

    detailEl?.addEventListener("submit", async (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      const d = activeDispute();
      if (!d) return;

      if (form.id === "disputeMessageForm") {
        e.preventDefault();
        const fd = new FormData(form);
        const message = String(fd.get("message") || "").trim();
        const isAdminNote = String(fd.get("isAdminNote") || "") === "on";
        if (!message) {
          showNotice(noticeEl, "Message is required.", true);
          return;
        }
        try {
          await authedApi(`/disputes/${encodeURIComponent(d.id)}/messages`, {
            method: "POST",
            body: JSON.stringify({ message, isAdminNote })
          });
          form.reset();
          await refreshDisputes();
        } catch (err) {
          showNotice(noticeEl, err.message || "Message send failed.", true);
        }
        return;
      }

      if (form.id === "disputeResolveForm") {
        e.preventDefault();
        const fd = new FormData(form);
        const payload = {
          status: String(fd.get("status") || "").trim(),
          winnerUserId: String(fd.get("winnerUserId") || "").trim(),
          amountAwarded: Number(fd.get("amountAwarded") || 0),
          resolutionNote: String(fd.get("resolutionNote") || "").trim()
        };
        if (!payload.status) {
          showNotice(noticeEl, "Select status.", true);
          return;
        }
        try {
          await authedApi(`/disputes/${encodeURIComponent(d.id)}/status`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
          showNotice(noticeEl, "Dispute mediation updated.", false);
          await refreshDisputes();
        } catch (err) {
          showNotice(noticeEl, err.message || "Mediation update failed.", true);
        }
      }
    });

    Promise.all([refreshDisputes(), loadContractOptions()]);
  }

  function renderInvoices() {
    const listEl = document.getElementById("invoiceList");
    const detailEl = document.getElementById("invoiceDetail");
    const noticeEl = document.getElementById("invoiceNotice");
    const pageError = document.getElementById("pageError");
    let rows = [];
    let activeId = "";

    function activeInvoice() {
      return rows.find((r) => String(r.id) === String(activeId)) || null;
    }

    function money(v, ccy) {
      return `${Number(v || 0).toFixed(2)} ${ccy || "USD"}`;
    }

    function paintList() {
      if (!listEl) return;
      if (!rows.length) {
        listEl.innerHTML = "<p class='meta'>No invoices yet.</p>";
        return;
      }
      listEl.innerHTML = rows
        .map(
          (r) => `
          <button class="contract-item ${String(r.id) === String(activeId) ? "active" : ""}" type="button" data-invoice-id="${escapeHtml(r.id)}">
            <strong>${escapeHtml(r.id)}</strong>
            <p class="meta">${escapeHtml(r.contractTitle || r.contractId || "-")}</p>
            <p><span class="tag">${escapeHtml(r.status)}</span><span class="tag">${escapeHtml(money(r.amount, r.currency))}</span></p>
          </button>
        `
        )
        .join("");
    }

    async function paintDetail() {
      const inv = activeInvoice();
      if (!detailEl) return;
      if (!inv) {
        detailEl.innerHTML = "<p class='meta'>Select invoice to view detail.</p>";
        return;
      }
      try {
        const d = await authedApi(`/invoices/${encodeURIComponent(inv.id)}`);
        detailEl.innerHTML = `
          <article class="card">
            <h3>${escapeHtml(d.id)}</h3>
            <p class="meta">${escapeHtml(d.contractTitle || d.contractId || "-")} • ${escapeHtml(d.milestoneTitle || d.milestoneId || "-")}</p>
            <p><span class="tag">Payer: ${escapeHtml(d.payerName || "-")}</span><span class="tag">Payee: ${escapeHtml(d.payeeName || "-")}</span><span class="tag">${escapeHtml(d.status)}</span></p>
            <p><span class="tag">Amount: ${escapeHtml(money(d.amount, d.currency))}</span><span class="tag">Created: ${new Date(d.createdAt).toLocaleString()}</span>${d.paidAt ? `<span class="tag">Paid: ${new Date(d.paidAt).toLocaleString()}</span>` : ""}</p>
            <p>${escapeHtml(d.note || "")}</p>
            <div class="action-row">
              <a class="btn btn-brand" href="/api/invoices/${encodeURIComponent(d.id)}/pdf" target="_blank" rel="noopener">Download PDF</a>
            </div>
          </article>
        `;
      } catch (err) {
        showNotice(pageError, err.message || "Failed to load invoice detail.", true);
      }
    }

    async function refresh() {
      try {
        rows = await authedApi("/invoices");
        if (!activeId && rows.length) activeId = rows[0].id;
        if (activeId && !rows.find((r) => String(r.id) === String(activeId))) {
          activeId = rows[0]?.id || "";
        }
        paintList();
        await paintDetail();
      } catch (err) {
        showNotice(pageError, err.message || "Failed to load invoices.", true);
      }
    }

    listEl?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-invoice-id]");
      if (!btn) return;
      activeId = String(btn.dataset.invoiceId || "");
      paintList();
      await paintDetail();
    });

    refresh();
    showNotice(noticeEl, "Invoices synced.", false);
  }

  function renderTimeline() {
    const listEl = document.getElementById("timelineList");
    const typeFilter = document.getElementById("timelineType");
    const qInput = document.getElementById("timelineSearch");
    const reloadBtn = document.getElementById("timelineReload");
    const noticeEl = document.getElementById("timelineNotice");
    const pageError = document.getElementById("pageError");
    let items = [];

    function amountText(item) {
      const v = Number(item.amount || 0);
      return v > 0 ? `$${v.toFixed(2)}` : "-";
    }

    function paint() {
      const t = String(typeFilter?.value || "all");
      const q = String(qInput?.value || "").trim().toLowerCase();
      const out = items.filter((i) => {
        const matchType = t === "all" || i.type === t;
        const text = `${i.title} ${i.message} ${i.contractId}`.toLowerCase();
        const matchQ = !q || text.includes(q);
        return matchType && matchQ;
      });
      listEl.innerHTML = out.length
        ? out
            .map(
              (i) => `
              <article class="milestone-card">
                <p><strong>${escapeHtml(i.title || "-")}</strong> <span class="tag">${escapeHtml(i.type || "-")}</span></p>
                <p>${escapeHtml(i.message || "-")}</p>
                <p class="meta">Contract: ${escapeHtml(i.contractId || "-")} • Amount: ${escapeHtml(amountText(i))} • ${new Date(i.createdAt).toLocaleString()}</p>
              </article>
            `
            )
            .join("")
        : "<p class='meta'>No activity found for this filter.</p>";
    }

    async function refresh() {
      try {
        items = await authedApi("/timeline?limit=80");
        paint();
        showNotice(noticeEl, "Timeline updated.", false);
      } catch (err) {
        showNotice(pageError, err.message || "Failed to load timeline.", true);
      }
    }

    typeFilter?.addEventListener("change", paint);
    qInput?.addEventListener("input", paint);
    reloadBtn?.addEventListener("click", refresh);
    refresh();
  }

  function renderMessages() {
    const threadList = document.getElementById("threadList");
    const chatTitle = document.getElementById("chatTitle");
    const chatSub = document.getElementById("chatSub");
    const chatMessages = document.getElementById("chatMessages");
    const msgForm = document.getElementById("messageForm");
    const msgInput = document.getElementById("messageInput");
    const msgNotice = document.getElementById("messageNotice");
    const startForm = document.getElementById("startChatForm");
    const startNotice = document.getElementById("startChatNotice");
    const pageError = document.getElementById("pageError");
    let threads = [];
    let currentThreadId = "";

    function messageTime(value) {
      if (!value) return "";
      const t = new Date(value).getTime();
      if (!Number.isFinite(t)) return "";
      const sec = Math.max(1, Math.floor((Date.now() - t) / 1000));
      if (sec < 60) return `${sec}s`;
      const min = Math.floor(sec / 60);
      if (min < 60) return `${min}m`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr}h`;
      return `${Math.floor(hr / 24)}d`;
    }

    function paintThreads() {
      if (!threadList) return;
      if (!threads.length) {
        threadList.innerHTML = "<p class='meta'>No conversation yet.</p>";
        return;
      }
      threadList.innerHTML = threads
        .map((t) => {
          const active = t.id === currentThreadId ? "active" : "";
          const unread = Number(t.unreadCount || 0);
          return `
            <button class="thread-item ${active}" data-thread-id="${escapeHtml(t.id)}" type="button">
              <strong>${escapeHtml(t.otherUser?.name || "User")}</strong>
              <small>${escapeHtml(t.otherUser?.email || "")}</small>
              <p>${escapeHtml(t.lastMessage || "No message yet")}</p>
              <span>${escapeHtml(messageTime(t.lastMessageAt || t.updatedAt))}${unread ? ` • ${unread} new` : ""}</span>
            </button>
          `;
        })
        .join("");
    }

    async function loadThreadMessages(threadId) {
      if (!threadId) return;
      try {
        const out = await authedApi(`/messages/threads/${encodeURIComponent(threadId)}`);
        currentThreadId = threadId;
        chatTitle.textContent = out.thread?.otherUser?.name || "Conversation";
        chatSub.textContent = out.thread?.otherUser?.email || "";
        const rows = Array.isArray(out.messages) ? out.messages : [];
        chatMessages.innerHTML = rows.length
          ? rows
              .map(
                (m) => `
                  <div class="chat-bubble ${m.isMine ? "mine" : "other"}">
                    <p>${escapeHtml(m.content)}</p>
                    <small>${escapeHtml(messageTime(m.createdAt))}</small>
                  </div>
                `
              )
              .join("")
          : "<p class='meta'>No messages yet. Say hello.</p>";
        chatMessages.scrollTop = chatMessages.scrollHeight;
        await loadThreads();
        showNotice(msgNotice, "", false);
        msgNotice.style.display = "none";
      } catch (err) {
        showNotice(msgNotice, err.message || "Failed to load messages.", true);
      }
    }

    async function loadThreads() {
      try {
        threads = await authedApi("/messages/threads");
        const ids = threads.map((t) => t.id);
        if (currentThreadId && !ids.includes(currentThreadId)) {
          currentThreadId = "";
        }
        if (!currentThreadId && threads.length) {
          currentThreadId = threads[0].id;
        }
        paintThreads();
      } catch (err) {
        showNotice(pageError, err.message || "Failed to load conversations.", true);
      }
    }

    threadList?.addEventListener("click", (e) => {
      const btn = e.target.closest(".thread-item");
      if (!btn) return;
      const threadId = String(btn.dataset.threadId || "");
      if (!threadId) return;
      loadThreadMessages(threadId);
    });

    startForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(startForm);
      const participantEmail = String(data.get("participantEmail") || "").trim();
      if (!participantEmail) {
        showNotice(startNotice, "Enter user email to start chat.", true);
        return;
      }
      try {
        const out = await authedApi("/messages/threads", {
          method: "POST",
          body: JSON.stringify({ participantEmail })
        });
        showNotice(startNotice, "Conversation ready.", false);
        startForm.reset();
        await loadThreads();
        await loadThreadMessages(out.id);
      } catch (err) {
        showNotice(startNotice, err.message || "Could not start chat.", true);
      }
    });

    msgForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentThreadId) {
        showNotice(msgNotice, "Pick a conversation first.", true);
        return;
      }
      const content = String(msgInput?.value || "").trim();
      if (!content) {
        showNotice(msgNotice, "Type a message.", true);
        return;
      }
      try {
        await authedApi(`/messages/threads/${encodeURIComponent(currentThreadId)}`, {
          method: "POST",
          body: JSON.stringify({ content })
        });
        if (msgInput) msgInput.value = "";
        await loadThreadMessages(currentThreadId);
      } catch (err) {
        showNotice(msgNotice, err.message || "Message send failed.", true);
      }
    });

    loadThreads().then(() => {
      if (currentThreadId) {
        loadThreadMessages(currentThreadId);
      }
    });

    setInterval(() => {
      if (!document.hidden) {
        loadThreads().then(() => {
          if (currentThreadId) loadThreadMessages(currentThreadId);
        });
      }
    }, 12000);
  }

  function initLogin() {
    const form = document.getElementById("loginForm");
    const notice = document.getElementById("loginNotice");
    const emailInput = form.querySelector('input[name="email"]');
    if (emailInput) emailInput.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const payload = {
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || "")
      };
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email);

      if (!payload.email || !payload.password) {
        showNotice(notice, "Email and password are required.", true);
        return;
      }
      if (!emailOk) {
        showNotice(notice, "Please enter a valid email address.", true);
        return;
      }
      if (payload.password.length < 6) {
        showNotice(notice, "Password must be at least 6 characters.", true);
        return;
      }

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) {
          showNotice(notice, out.message || "Login failed.", true);
          return;
        }

        localStorage.setItem("taskora_token", out.token || "");
        localStorage.setItem("taskora_user", JSON.stringify(out.user || {}));
        showNotice(notice, "Login successful. Redirecting...", false);
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 500);
      } catch {
        showNotice(notice, "Server unavailable. Please try again.", true);
      }
    });
  }

  function initSignup() {
    const form = document.getElementById("signupForm");
    const notice = document.getElementById("signupNotice");
    populateCountrySelects(form);
    const emailInput = form.querySelector('input[name="email"]');
    if (emailInput) emailInput.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const payload = {
        firstName: String(data.get("firstName") || "").trim(),
        middleName: String(data.get("middleName") || "").trim(),
        lastName: String(data.get("lastName") || "").trim(),
        role: String(data.get("role") || "").trim(),
        gender: String(data.get("gender") || "").trim(),
        birthDate: String(data.get("birthDate") || "").trim(),
        email: String(data.get("email") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        password: String(data.get("password") || ""),
        zipCode: String(data.get("zipCode") || "").trim(),
        addressLine1: String(data.get("addressLine1") || "").trim(),
        addressLine2: String(data.get("addressLine2") || "").trim(),
        city: String(data.get("city") || "").trim(),
        stateRegion: String(data.get("stateRegion") || "").trim(),
        country: String(data.get("country") || "").trim(),
        residenceCountry: String(data.get("residenceCountry") || "").trim()
      };
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email);
      const roleOk = ["Client", "Freelancer", "Admin"].includes(payload.role);
      const phoneOk = !payload.phone || /^[+0-9()\\-\\s]{7,20}$/.test(payload.phone);

      if (
        !payload.firstName ||
        !payload.lastName ||
        !payload.role ||
        !payload.gender ||
        !payload.birthDate ||
        !payload.email ||
        !payload.password ||
        !payload.zipCode ||
        !payload.addressLine1 ||
        !payload.stateRegion ||
        !payload.country ||
        !payload.residenceCountry
      ) {
        showNotice(notice, "Please fill all required fields.", true);
        return;
      }
      if (!emailOk) {
        showNotice(notice, "Please enter a valid email address.", true);
        return;
      }
      if (payload.password.length < 6) {
        showNotice(notice, "Password must be at least 6 characters.", true);
        return;
      }
      if (!roleOk) {
        showNotice(notice, "Invalid role selected.", true);
        return;
      }
      if (!phoneOk) {
        showNotice(notice, "Phone number format is invalid.", true);
        return;
      }

      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) {
          showNotice(notice, out.message || "Signup failed.", true);
          return;
        }

        localStorage.setItem("taskora_token", out.token || "");
        localStorage.setItem("taskora_user", JSON.stringify(out.user || {}));
        showNotice(notice, "Account created successfully. Redirecting...", false);
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 500);
      } catch {
        showNotice(notice, "Server unavailable. Please try again.", true);
      }
    });
  }

  function initForgotPassword() {
    const forgot = document.getElementById("forgotForm");
    const reset = document.getElementById("resetForm");
    const forgotNotice = document.getElementById("forgotNotice");
    const resetNotice = document.getElementById("resetNotice");

    forgot.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(forgot);
      const payload = { email: String(data.get("email") || "").trim() };
      if (!payload.email) {
        showNotice(forgotNotice, "Email is required.", true);
        return;
      }

      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) {
          showNotice(forgotNotice, out.message || "Failed to send reset code.", true);
          return;
        }
        const msg = out.debugToken ? `${out.message} Code: ${out.debugToken}` : out.message || "Reset code sent.";
        showNotice(forgotNotice, msg, false);
      } catch {
        showNotice(forgotNotice, "Server unavailable. Please try again.", true);
      }
    });

    reset.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(reset);
      const payload = {
        token: String(data.get("token") || "").trim(),
        newPassword: String(data.get("newPassword") || "")
      };
      if (!payload.token || !payload.newPassword) {
        showNotice(resetNotice, "Token and new password are required.", true);
        return;
      }
      if (payload.newPassword.length < 6) {
        showNotice(resetNotice, "Password must be at least 6 characters.", true);
        return;
      }

      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) {
          showNotice(resetNotice, out.message || "Password reset failed.", true);
          return;
        }
        showNotice(resetNotice, out.message || "Password reset successful. Please login.", false);
        reset.reset();
      } catch {
        showNotice(resetNotice, "Server unavailable. Please try again.", true);
      }
    });
  }

  enforceAuthConsistency();
  applyRoleBasedMenu();
  initTopUtilities();

  if (protectedPages.has(page) && !isLoggedIn()) {
    window.location.href = linkForPage("login.html");
  }
  if (page === "admin-kyc" && getCurrentRole() !== "Admin") {
    window.location.href = linkForPage("dashboard.html");
  }

  if (page === "home") renderHome();
  if (page === "jobs") renderJobs();
  if (page === "gigs") renderGigs();
  if (page === "post-job") initPostJob();
  if (page === "dashboard") renderDashboard();
  if (page === "my-bids") renderMyBids();
  if (page === "client-bids") renderClientBids();
  if (page === "payments") renderPayments();
  if (page === "contracts") renderContracts();
  if (page === "invoices") renderInvoices();
  if (page === "disputes") renderDisputes();
  if (page === "timeline") renderTimeline();
  if (page === "settings") renderSettings();
  if (page === "kyc") renderKyc();
  if (page === "messages") renderMessages();
  if (page === "admin-kyc") renderAdminKyc();
  if (page === "worker-profile") renderWorkerProfile();
  if (page === "employer-profile") renderEmployerProfile();
  if (page === "login") initLogin();
  if (page === "signup") initSignup();
  if (page === "forgot-password") initForgotPassword();
})();
