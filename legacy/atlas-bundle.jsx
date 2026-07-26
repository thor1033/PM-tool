
// ======== store.jsx ========
/* ============================================================
   STORE — multi-project state, persistence, file storage, seed
   Exposes window.Store
   v2: root { version, activeId, projects[] }; each project holds
       the full working set (tasks, risks, … businessCase).
   ============================================================ */
(function () {
  const KEY = "atlas.pm.v2";
  const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9);
  const D = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // ---------- shared taxonomy ----------
  function defaultTaxonomy() {
    return {
      tags: [],
      phases: [],
      categories: [],
    };
  }

  function blankBusinessCase() {
    return {
      purpose: "", problem: "",
      perspOurs: "", perspUsers: "", perspStakeholders: "", worsening: "", opportunities: "",
      outcomes: [],
      effProcess: "", effSystem: "", effBehaviour: "", effLeadership: "",
      financial: [
        { label: "Programme cost (one-off)", value: "", note: "" },
        { label: "Annual run cost", value: "", note: "" },
        { label: "Annual saving", value: "", note: "" },
        { label: "Payback period", value: "", note: "" },
      ],
      justification: "", effective: "",
    };
  }
  function blankScope() { return { inScope: [], outScope: [] }; }
  function blankChangePlan() { return { groups: [] }; }

  // ---------- fully-seeded sample project (Helios) ----------
  function heliosData() {
    const tax = {
      tags: [
        { id: "tg_fe", label: "Frontend", color: "blue" },
        { id: "tg_be", label: "Backend", color: "indigo" },
        { id: "tg_infra", label: "Infra", color: "teal" },
        { id: "tg_sec", label: "Security", color: "red" },
        { id: "tg_ux", label: "UX", color: "pink" },
        { id: "tg_data", label: "Data", color: "amber" },
        { id: "tg_docs", label: "Docs", color: "green" },
      ],
      phases: [
        { id: "ph_disc", label: "Discovery", color: "teal" },
        { id: "ph_design", label: "Design", color: "pink" },
        { id: "ph_build", label: "Build", color: "blue" },
        { id: "ph_launch", label: "Launch", color: "amber" },
      ],
      categories: [],
    };
    const T = {}; // friendly handles for cross-links
    const mk = (key, o) => { const id = uid("t"); T[key] = id; return { id, tags: [], priority: "med", assignees: [], desc: "", phase: null, category: null, start: "", end: "", deps: [], ...o }; };
    const tasks = [
      mk("interviews", { title: "Stakeholder discovery interviews", status: "done", tags: ["tg_ux"], phase: "ph_disc", category: "ct_enable", priority: "med", assignees: ["Maya Rossi"], start: D(2026, 1, 6), end: D(2026, 1, 17), desc: "Run interviews with department leads to map current pain points and system usage." }),
      mk("audit", { title: "Audit legacy data schema", status: "done", tags: ["tg_data", "tg_be"], phase: "ph_disc", category: "ct_migr", priority: "high", assignees: ["Dev Patel"], start: D(2026, 1, 13), end: D(2026, 1, 28), desc: "Document the existing schema, identify orphaned tables and PII fields requiring special handling." }),
      mk("arch", { title: "Define target architecture", status: "inprogress", tags: ["tg_infra", "tg_be"], phase: "ph_design", category: "ct_plat", priority: "high", assignees: ["Dev Patel"], start: D(2026, 2, 2), end: D(2026, 2, 20), desc: "Produce the reference architecture covering services, data flow and the cloud landing zone." }),
      mk("ds", { title: "Design system & component library", status: "inprogress", tags: ["tg_ux", "tg_fe"], phase: "ph_design", category: "ct_plat", priority: "med", assignees: ["Maya Rossi"], start: D(2026, 2, 9), end: D(2026, 3, 6), desc: "Establish tokens, core components and accessibility baseline for the new portal." }),
      mk("threat", { title: "Security & threat model review", status: "inprogress", tags: ["tg_sec"], phase: "ph_design", category: "ct_compl", priority: "high", assignees: ["Sam Kaur"], start: D(2026, 2, 23), end: D(2026, 3, 6), desc: "Threat-model the proposed architecture; produce a register of controls and residual risks." }),
      mk("auth", { title: "Build authentication service", status: "backlog", tags: ["tg_be", "tg_sec"], phase: "ph_build", category: "ct_plat", priority: "high", assignees: ["Dev Patel"], start: D(2026, 3, 9), end: D(2026, 3, 27), desc: "SSO + role-based access, session handling and audit logging." }),
      mk("migrate", { title: "Migrate customer records", status: "backlog", tags: ["tg_data"], phase: "ph_build", category: "ct_migr", priority: "high", assignees: ["Dev Patel"], start: D(2026, 3, 16), end: D(2026, 4, 10), desc: "ETL pipeline with validation, dry-run and rollback plan for the customer dataset." }),
      mk("portal", { title: "Portal frontend — core flows", status: "backlog", tags: ["tg_fe", "tg_ux"], phase: "ph_build", category: "ct_plat", priority: "med", assignees: ["Lina Meyer"], start: D(2026, 3, 23), end: D(2026, 4, 24), desc: "Implement dashboard, search and record-detail flows against the new API." }),
      mk("landing", { title: "Provision production landing zone", status: "backlog", tags: ["tg_infra"], phase: "ph_build", category: "ct_plat", priority: "med", assignees: ["Sam Kaur"], start: D(2026, 4, 6), end: D(2026, 4, 20), desc: "IaC for networking, monitoring and the CI/CD release pipeline." }),
      mk("uat", { title: "User acceptance testing", status: "backlog", tags: ["tg_ux", "tg_docs"], phase: "ph_launch", category: "ct_enable", priority: "med", assignees: ["Maya Rossi"], start: D(2026, 4, 27), end: D(2026, 5, 8), desc: "Coordinate UAT with pilot departments, triage findings and sign-off." }),
      mk("cutover", { title: "Cutover & go-live runbook", status: "backlog", tags: ["tg_infra", "tg_docs"], phase: "ph_launch", category: "ct_migr", priority: "high", assignees: ["Sam Kaur"], start: D(2026, 5, 11), end: D(2026, 5, 22), desc: "Final cutover plan, comms, rollback criteria and hypercare schedule." }),
      mk("training", { title: "Training & enablement materials", status: "backlog", tags: ["tg_docs"], phase: "ph_launch", category: "ct_enable", priority: "low", assignees: ["Lina Meyer"], start: D(2026, 5, 4), end: D(2026, 5, 20), desc: "Quick-start guides, recorded walkthroughs and an admin handbook." }),
    ];
    const dep = (k, ...ds) => { const t = tasks.find((x) => x.id === T[k]); t.deps = ds; };
    dep("arch", { id: uid("d"), type: "task", refId: T.audit }, { id: uid("d"), type: "task", refId: T.interviews });
    dep("auth", { id: uid("d"), type: "task", refId: T.arch }, { id: uid("d"), type: "external", label: "Identity-provider licence", scope: "Vendor — Oktagon Inc." });
    dep("migrate", { id: uid("d"), type: "task", refId: T.audit });
    dep("portal", { id: uid("d"), type: "task", refId: T.auth }, { id: uid("d"), type: "task", refId: T.ds });
    dep("landing", { id: uid("d"), type: "external", label: "Cloud account approval", scope: "Finance Office" });
    dep("uat", { id: uid("d"), type: "task", refId: T.portal }, { id: uid("d"), type: "external", label: "Pilot users released", scope: "Other project — CRM Sunset" });

    const milestones = [
      { id: uid("ms"), title: "Discovery sign-off", type: "milestone", date: D(2026, 1, 30), category: "ct_enable", note: "Steering committee confirms discovery findings and greenlights Design." },
      { id: uid("ms"), title: "Architecture gate", type: "gate", date: D(2026, 2, 24), category: "ct_plat", note: "Go/no-go: target architecture must pass security and cost review before Build starts." },
      { id: uid("ms"), title: "Migration dry-run pass", type: "milestone", date: D(2026, 4, 6), category: "ct_migr", note: "ETL pipeline completes a full dry-run with < 2 % exception rate." },
      { id: uid("ms"), title: "UAT gate", type: "gate", date: D(2026, 5, 9), category: "ct_enable", note: "Go/no-go: UAT findings must be triaged and critical issues resolved before cutover planning." },
      { id: uid("ms"), title: "Go-live", type: "milestone", date: D(2026, 5, 25), category: "ct_plat", note: "Production cutover and hypercare begin." },
    ];

    const risks = [
      { id: uid("r"), title: "Legacy data quality worse than expected", likelihood: "high", impact: "high", mitigation: "Early profiling sprint; phased migration with validation gates and a rollback snapshot.", owner: "Dev Patel", status: "open", taskIds: [T.audit, T.migrate] },
      { id: uid("r"), title: "Key user availability during UAT", likelihood: "med", impact: "high", mitigation: "Book UAT windows now; secure backfill cover with department leads in writing.", owner: "Maya Rossi", status: "open", taskIds: [T.uat] },
      { id: uid("r"), title: "Compliance sign-off delays go-live", likelihood: "med", impact: "high", mitigation: "Engage Compliance from Design phase; maintain a live controls register.", owner: "Sam Kaur", status: "monitoring", taskIds: [T.threat] },
      { id: uid("r"), title: "Scope creep from adjacent teams", likelihood: "high", impact: "med", mitigation: "Strict change-control board; park requests in a phase-2 backlog.", owner: "Marcus L.", status: "open", taskIds: [] },
      { id: uid("r"), title: "Cloud cost overrun", likelihood: "low", impact: "med", mitigation: "Budget alerts and right-sizing review at end of Build phase.", owner: "Sam Kaur", status: "monitoring", taskIds: [] },
    ];
    const stakeholders = [
      { id: uid("s"), name: "Helen Vos", title: "VP, Operations", role: "Executive Sponsor", responsibility: "Owns the business case, unblocks funding and resolves cross-department conflicts.", influence: "high", interest: "high", contact: "h.vos@company.example" },
      { id: uid("s"), name: "Marcus Lindqvist", title: "Head of IT", role: "Project Owner", responsibility: "Accountable for delivery, scope and the technical decision record.", influence: "high", interest: "high", contact: "m.lindqvist@company.example" },
      { id: uid("s"), name: "Priya Nadar", title: "Compliance Lead", role: "Advisor", responsibility: "Signs off on data handling, retention and regulatory controls.", influence: "med", interest: "high", contact: "p.nadar@company.example" },
      { id: uid("s"), name: "Tom Berger", title: "Customer Service Lead", role: "Key User", responsibility: "Represents frontline users; coordinates UAT and adoption in the call centre.", influence: "med", interest: "high", contact: "t.berger@company.example" },
      { id: uid("s"), name: "Finance Office", title: "Budget Control", role: "Gatekeeper", responsibility: "Approves spend against milestones and tracks benefit realisation.", influence: "med", interest: "med", contact: "finance@company.example" },
    ];
    const findings = [
      { id: uid("f"), title: "62% of support tickets stem from manual data entry", category: "ct_enable", summary: "Process analysis of 1,200 tickets shows the majority are caused by duplicate or mistyped records in the legacy system. Automation here yields the largest support reduction.", source: "Support analytics, Q4" },
      { id: uid("f"), title: "Three shadow spreadsheets hold authoritative data", category: "ct_migr", summary: "Critical pricing and entitlement data lives outside the system of record. These must be ingested or the migration will lose authoritative state.", source: "Discovery interviews" },
      { id: uid("f"), title: "No single sign-on across tools", category: "ct_compl", summary: "Users maintain 4–6 separate logins. SSO is both a security win and the most requested usability improvement.", source: "User survey, n=84" },
      { id: uid("f"), title: "Peak load is 4× average at month-end", category: "ct_plat", summary: "Reporting and reconciliation create predictable spikes. Target architecture must autoscale to avoid the current month-end slowdowns.", source: "Infra telemetry" },
    ];
    const org = [
      { id: "o_sponsor", name: "Helen Vos", role: "Executive Sponsor", parent: null, note: "Steering committee chair", accent: "purple" },
      { id: "o_owner", name: "Marcus Lindqvist", role: "Project Owner", parent: "o_sponsor", note: "Single point of accountability", accent: "indigo" },
      { id: "o_pm", name: "You", role: "Project Manager", parent: "o_owner", note: "Day-to-day delivery & this tool", accent: "blue" },
      { id: "o_tech", name: "Dev Patel", role: "Tech Lead", parent: "o_pm", note: "Architecture & backend", accent: "teal" },
      { id: "o_design", name: "Maya Rossi", role: "Design Lead", parent: "o_pm", note: "UX & enablement", accent: "pink" },
      { id: "o_infra", name: "Sam Kaur", role: "Infra & Security", parent: "o_tech", note: "Landing zone, CI/CD, controls", accent: "green" },
      { id: "o_fe", name: "Lina Meyer", role: "Frontend Engineer", parent: "o_tech", note: "Portal & components", accent: "amber" },
    ];
    const products = [
      { id: uid("p"), name: "Discovery Report", type: "pdf", fileId: null, taskIds: [T.interviews], phase: "ph_disc", date: D(2026, 1, 20), note: "Synthesis of interviews and current-state analysis.", placeholder: true },
      { id: uid("p"), name: "Target Architecture Diagram", type: "image", fileId: null, taskIds: [T.arch], phase: "ph_design", date: D(2026, 2, 22), note: "Reference architecture, v0.9.", placeholder: true },
      { id: "PROD_MIGPLAN", name: "Migration Plan.xlsx", type: "excel", fileId: null, taskIds: [T.audit, T.migrate], phase: "ph_design", date: D(2026, 2, 28), note: "Table-by-table mapping and sequencing.", placeholder: true },
    ];
    const businessCase = {
      purpose: "Replace the end-of-life legacy customer platform with a secure, scalable portal that consolidates fragmented tools into a single system of record.",
      problem: "The current platform is unsupported, has no single sign-on, and depends on manual data entry that drives the majority of support tickets. Authoritative data lives in uncontrolled spreadsheets, creating compliance and continuity risk.",
      perspOurs: "For IT, the legacy platform is an unsupported continuity and compliance liability that absorbs a disproportionate share of the support budget.",
      perspUsers: "Frontline users juggle four to six separate logins and re-key data by hand — slow, error-prone and the top source of frustration in surveys.",
      perspStakeholders: "Compliance cannot evidence current data-retention controls, while Operations sees month-end slowdowns erode service levels.",
      worsening: "Every quarter more authoritative data drifts into uncontrolled spreadsheets, and the unsupported platform steadily raises the probability of an unplanned outage.",
      opportunities: "Consolidating the tools behind single sign-on is the most requested usability win and unlocks the automation that removes the largest category of support tickets.",
      outcomes: [
        "Reduce data-entry support tickets by 50% within two quarters of go-live.",
        "Achieve single sign-on across all customer-facing tools.",
        "Bring all authoritative data under a governed system of record.",
        "Eliminate month-end performance degradation through autoscaling.",
      ],
      effProcess: "Manual data-entry steps are replaced by validated intake. A new data-governance procedure (QMS / Cortex document) defines ownership, retention and the change-control path.",
      effSystem: "A new portal with SSO, a governed system of record, a validated migration pipeline and autoscaling infrastructure — plus a reusable component library and admin templates.",
      effBehaviour: "Frontline users work from a single portal and trust it as the source of truth; admins manage access and data through governed workflows instead of spreadsheets.",
      effLeadership: "Data-ownership accountability is set at department-lead level, the steering committee governs scope, and all key users complete enablement training before go-live.",
      financial: [
        { label: "Programme cost (one-off)", value: "€480,000", note: "Build, migration, licensing" },
        { label: "Annual run cost", value: "€120,000", note: "Cloud + support, replaces €165k legacy" },
        { label: "Annual saving", value: "€210,000", note: "Support effort + legacy retirement" },
        { label: "Payback period", value: "~2.4 years", note: "Excluding risk-avoidance value" },
      ],
      justification: "Beyond the direct saving, the legacy platform is a continuity and compliance liability: it is unsupported and cannot meet current data-retention obligations. Doing nothing increases the probability of an unplanned outage and a regulatory finding. The proposed programme is the lowest-risk path that also delivers measurable efficiency gains.",
      effective: "Delivery is phased — Discovery, Design, Build, Launch — with a go/no-go gate at the end of each phase. Benefits are tracked against the four target outcomes, reviewed monthly by the steering committee with the Finance Office validating realised savings.",
    };
    const scope = {
      inScope: [
        "Migration of the customer records dataset to the new system of record",
        "Single sign-on across all customer-facing tools",
        "New portal core flows: dashboard, search and record detail",
        "Production landing zone, monitoring and CI/CD pipeline",
        "UAT with pilot departments and go-live",
      ],
      outScope: [
        "Finance / ERP integration (deferred to phase 2)",
        "Native mobile applications",
        "Archive data older than seven years",
        "External partner portals",
        "Decommissioning of unrelated legacy systems",
      ],
    };
    const assessment = [
      { id: uid("as"), area: "Identity & access", asIs: "4–6 separate logins per user; no single sign-on.", toBe: "One single sign-on across every customer-facing tool." },
      { id: uid("as"), area: "Data ownership", asIs: "Authoritative data spread across uncontrolled spreadsheets.", toBe: "One governed system of record with clear ownership." },
      { id: uid("as"), area: "Support load", asIs: "Majority of tickets caused by manual data entry.", toBe: "50% fewer data-entry tickets via validated intake." },
      { id: uid("as"), area: "Performance", asIs: "Month-end slowdowns at ~4× average load.", toBe: "Autoscaling removes month-end degradation." },
      { id: uid("as"), area: "Platform support", asIs: "Legacy platform end-of-life and unsupported.", toBe: "Supported, patched cloud platform." },
    ];
    const commPlan = [
      { id: uid("cm"), audience: "All platform users", purpose: "Explain what is changing and how to work the new way.", messages: ["Users move from the legacy task planner to the new portal", "What the new flow looks like day-to-day", "Where to find support material and who to ask"], channels: ["Email", "Intranet"], timing: "Before go-live (≤ 1 week)", owner: "Maya Rossi", deliverables: ["Launch email (drafted — needs sponsor input)", "Quick-start guide"] },
      { id: uid("cm"), audience: "All employees", purpose: "Inform everyone that the new system reduces request processing time.", messages: ["A new platform is live", "The benefit — faster, more reliable service", "Where to find it (via the portal)", "Where support material lives"], channels: ["Intranet article", "Info screens"], timing: "Launch week", owner: "Lina Meyer", deliverables: ["Intranet article (done)", "Portal guide link", "Info-screen slide (sent)"] },
      { id: uid("cm"), audience: "Leadership team", purpose: "Ensure leaders actively and visibly champion the change.", messages: ["The change and its benefit (faster processing)", "Why we are doing it now", "Where to find it", "Where support material lives"], channels: ["Email", "Monthly leadership meeting"], timing: "Launch week", owner: "Marcus Lindqvist", deliverables: ["Approved comms", "Leadership update deck"] },
      { id: uid("cm"), audience: "Senior management", purpose: "Inform of the change and ownership of processing-time delays.", messages: ["Summary of discovery findings", "Executive summary of what changes", "A tool that lets us set and track KPIs", "One-page summary of the new process"], channels: ["Email", "Meeting"], timing: "Post-launch, at the general meeting", owner: "Helen Vos", deliverables: ["Presented slides"] },
    ];
    const changePlan = { groups: [
      { id: uid("cg"), label: "Delivery team", accent: "indigo", rows: [
        { id: uid("cr"), component: "Training package", description: "WHY the change, today vs. tomorrow, roles & responsibilities, how to use the new portal, retiring the old planner, practical exercises with dashboards and task types.", deliverables: ["Slide deck (why + how)", "User guides (new workflow)", "Training material"], owner: "Maya Rossi" },
        { id: uid("cr"), component: "New-joiner package", description: "Page on the portal with all flows and training for new employees' onboarding.", deliverables: ["User onboarding page"], owner: "Lina Meyer" },
        { id: uid("cr"), component: "Management follow-up", description: "Managers reinforce new behaviour through routines & KPIs, communication discipline and dashboards to secure team readiness.", deliverables: ["Check-in meeting plan", "Behaviour reinforcement guidance", "Dashboard usage guide"], owner: "Sam Kaur" },
        { id: uid("cr"), component: "Post-go-live support", description: "Monthly feedback review → fix → roll out, plus refresher training.", deliverables: ["Feedback analysis", "Continuous improvement log", "Ownership map (who handles what)"], owner: "Maya Rossi" },
      ] },
      { id: uid("cg"), label: "Organisation-wide", accent: "teal", rows: [
        { id: uid("cr"), component: "All-staff communication", description: "Inform the organisation of the new system and ways of working.", deliverables: ["Change announcement (intranet news)", "User-friendly portal for easy adoption"], owner: "Lina Meyer" },
        { id: uid("cr"), component: "Stakeholder communication", description: "Department managers, SMEs and requesters — organisation-wide messaging.", deliverables: ["Change announcement (email, webinars)", "Stakeholder-specific message packs", "Change timeline"], owner: "Marcus Lindqvist" },
        { id: uid("cr"), component: "Feedback loop", description: "Mechanism for reporting issues and proposing improvements.", deliverables: ["Feedback form / template", "'You said → we did' updates"], owner: "Maya Rossi" },
      ] },
    ] };
    const members = [
      { id: "mem_you", name: "You", role: "Project Manager", email: "", color: "blue" },
      { id: "mem_marcus", name: "Marcus Lindqvist", role: "Project Owner", email: "m.lindqvist@company.example", color: "indigo" },
      { id: "mem_helen", name: "Helen Vos", role: "Executive Sponsor", email: "h.vos@company.example", color: "purple" },
      { id: "mem_dev", name: "Dev Patel", role: "Tech Lead", email: "d.patel@company.example", color: "teal" },
      { id: "mem_maya", name: "Maya Rossi", role: "Design Lead", email: "m.rossi@company.example", color: "pink" },
      { id: "mem_sam", name: "Sam Kaur", role: "Infra & Security", email: "s.kaur@company.example", color: "green" },
      { id: "mem_lina", name: "Lina Meyer", role: "Frontend Engineer", email: "l.meyer@company.example", color: "amber" },
      { id: "mem_priya", name: "Priya Nadar", role: "Compliance Lead", email: "p.nadar@company.example", color: "red" },
      { id: "mem_tom", name: "Tom Berger", role: "Customer Service Lead", email: "t.berger@company.example", color: "blue" },
    ];
    const glossary = [
      { id: "gl_sso", term: "SSO", definition: "Single sign-on — one login that authenticates the user across all customer-facing tools." },
      { id: "gl_etl", term: "ETL", definition: "Extract, Transform, Load — the pipeline that moves data from the legacy system into the new system of record." },
      { id: "gl_uat", term: "UAT", definition: "User Acceptance Testing — pilot users exercise the system end-to-end and sign off before go-live." },
      { id: "gl_cicd", term: "CI/CD", definition: "Continuous Integration and Continuous Deployment — the automated build, test and release pipeline." },
      { id: "gl_qms", term: "QMS", definition: "Quality Management System — the controlled set of procedures that govern how we work." },
      { id: "gl_cortex", term: "Cortex", definition: "The internal document management system where governed procedures and policies live." },
      { id: "gl_hypercare", term: "hypercare", definition: "The intensive support window immediately after go-live where the project team is on standby to triage issues fast." },
      { id: "gl_landingzone", term: "landing zone", definition: "A pre-configured, governed cloud environment (networking, identity, monitoring) ready to host workloads." },
    ];
    return { meta: { project: "Helios Platform Modernisation", code: "PRJ-2026-014" }, tasks, members, stakeholders, risks, findings, org, products, businessCase, scope, assessment, commPlan, changePlan, milestones, glossary, ...tax };
  }

  // ---------- a lighter second sample ----------
  function intranetData() {
    const tax = defaultTaxonomy();
    const t = (o) => ({ id: uid("t"), tags: [], priority: "med", assignees: [], desc: "", phase: null, category: null, start: "", end: "", deps: [], ...o });
    const tasks = [
      t({ title: "Content audit of current intranet", status: "done", phase: "ph_disc", category: "ct_enable", assignees: ["Noah Frank"], start: D(2026, 2, 2), end: D(2026, 2, 13), tags: ["tg_docs"] }),
      t({ title: "Information architecture workshop", status: "inprogress", phase: "ph_design", category: "ct_plat", assignees: ["Aïsha Bello"], start: D(2026, 2, 16), end: D(2026, 2, 27), tags: ["tg_ux"], priority: "high" }),
      t({ title: "Search relevance tuning", status: "backlog", phase: "ph_build", category: "ct_plat", assignees: ["Noah Frank"], start: D(2026, 3, 9), end: D(2026, 3, 20), tags: ["tg_be"] }),
      t({ title: "Editor onboarding guide", status: "backlog", phase: "ph_launch", category: "ct_enable", assignees: ["Aïsha Bello"], start: D(2026, 3, 23), end: D(2026, 4, 3), tags: ["tg_docs"], priority: "low" }),
    ];
    const org = [
      { id: "o_owner", name: "Aïsha Bello", role: "Project Owner", parent: null, note: "Comms & internal tooling", accent: "indigo" },
      { id: "o_eng", name: "Noah Frank", role: "Engineer", parent: "o_owner", note: "Build & search", accent: "teal" },
    ];
    const risks = [
      { id: uid("r"), title: "Low editor adoption after launch", likelihood: "med", impact: "med", mitigation: "Champions programme and office hours in first month.", owner: "Aïsha Bello", status: "open", taskIds: [tasks[3].id] },
    ];
    const members = [
      { id: "mem_aisha", name: "Aïsha Bello", role: "Content Lead", email: "", color: "teal" },
    ];
    return { meta: { project: "Intranet Refresh", code: "PRJ-2026-021" }, tasks, members, stakeholders: [], risks, findings: [], org, products: [], businessCase: blankBusinessCase(), scope: blankScope(), assessment: [], commPlan: [], changePlan: blankChangePlan(), milestones: [], ...tax };
  }

  function makeProject(color, data, ageDays = 0, parentId = null) {
    return { id: uid("prj"), color, parentId, createdAt: Date.now() - ageDays * 86400000, updatedAt: Date.now() - Math.floor(ageDays / 2) * 86400000, ...data };
  }

  // a lightweight subproject under Helios, to demonstrate grouping
  function migrationData() {
    const tax = defaultTaxonomy();
    const t = (o) => ({ id: uid("t"), tags: [], priority: "med", assignees: [], desc: "", phase: null, category: null, start: "", end: "", deps: [], ...o });
    const tasks = [
      t({ title: "Profile legacy data quality", status: "done", phase: "ph_disc", category: "ct_migr", assignees: ["Dev Patel"], start: D(2026, 2, 2), end: D(2026, 2, 13), tags: ["tg_data"], priority: "high" }),
      t({ title: "Build ETL mapping spec", status: "inprogress", phase: "ph_design", category: "ct_migr", assignees: ["Dev Patel", "Lina Meyer"], start: D(2026, 2, 16), end: D(2026, 3, 6), tags: ["tg_data", "tg_be"], priority: "high" }),
      t({ title: "Dry-run migration in staging", status: "backlog", phase: "ph_build", category: "ct_migr", assignees: ["Dev Patel"], start: D(2026, 3, 9), end: D(2026, 3, 27), tags: ["tg_data"], priority: "med" }),
      t({ title: "Reconciliation & sign-off report", status: "backlog", phase: "ph_launch", category: "ct_compl", assignees: ["Sam Kaur"], start: D(2026, 3, 30), end: D(2026, 4, 10), tags: ["tg_docs"], priority: "med" }),
    ];
    const risks = [
      { id: uid("r"), title: "Source data exceeds validation tolerance", likelihood: "high", impact: "high", mitigation: "Tighten cleansing rules; gate cutover on a <2% exception rate.", owner: "Dev Patel", status: "open", taskIds: [tasks[0].id, tasks[2].id] },
    ];
    const org = [
      { id: "o_lead", name: "Dev Patel", role: "Migration Lead", parent: null, note: "Owns the data workstream", accent: "teal" },
      { id: "o_eng", name: "Lina Meyer", role: "Data Engineer", parent: "o_lead", note: "ETL & validation", accent: "amber" },
    ];
    return { meta: { project: "Customer Data Migration", code: "" }, tasks, members: [{ id: "mem_dev2", name: "Dev Patel", role: "Migration Lead", email: "", color: "teal" }, { id: "mem_lina2", name: "Lina Meyer", role: "Data Engineer", email: "", color: "amber" }], stakeholders: [], risks, findings: [], org, products: [], businessCase: blankBusinessCase(), scope: blankScope(), assessment: [], commPlan: [], changePlan: blankChangePlan(), milestones: [], ...tax };
  }

  function seedRoot() {
    const p1 = makeProject("purple", heliosData(), 48);
    const p2 = makeProject("teal", intranetData(), 12);
    const p3 = makeProject("indigo", migrationData(), 20, null);
    p3.parentId = p1.id;
    return { version: 2, activeId: null, projects: [p1, p3, p2] };
  }

  function blankProject(name, code, color, parentId = null) {
    const tax = defaultTaxonomy();
    return makeProject(color || "indigo", {
      meta: { project: name || "Untitled project", code: code || "" },
      tasks: [], members: [], stakeholders: [], risks: [], findings: [], products: [],
      org: [{ id: "o_owner", name: "Project Owner", role: "Project Owner", parent: null, note: "Single point of accountability", accent: "indigo" }],
      businessCase: blankBusinessCase(), scope: blankScope(), assessment: [], commPlan: [], changePlan: blankChangePlan(), milestones: [], ...tax,
    }, 0, parentId);
  }

  // ---------- persistence ----------
  function normalize(root) {
    root.projects = (root.projects || []).map((p) => ({
      ...p,
      scope: p.scope && Array.isArray(p.scope.inScope) ? p.scope : { inScope: [], outScope: [] },
      assessment: Array.isArray(p.assessment) ? p.assessment : [],
      commPlan: Array.isArray(p.commPlan) ? p.commPlan : [],
      changePlan: p.changePlan && Array.isArray(p.changePlan.groups) ? p.changePlan : { groups: [] },
      milestones: Array.isArray(p.milestones) ? p.milestones : [],
      glossary: Array.isArray(p.glossary) ? p.glossary : [],
      members: Array.isArray(p.members) && p.members.length ? p.members
        : (() => {
            // backfill from org names + stakeholders + assignees so the canonical list is complete
            const seen = new Map();
            const accents = ["blue", "indigo", "teal", "green", "amber", "red", "pink", "purple"];
            let i = 0;
            const addPerson = (name, role) => {
              const key = (name || "").trim(); if (!key || seen.has(key)) return;
              seen.set(key, { id: "mem_" + Math.random().toString(36).slice(2, 9), name: key, role: role || "", email: "", color: accents[i++ % accents.length] });
            };
            (p.org || []).forEach((o) => addPerson(o.name, o.role));
            (p.stakeholders || []).forEach((st) => addPerson(st.name, st.role));
            (p.tasks || []).forEach((t) => (Array.isArray(t.assignees) ? t.assignees : (t.assignee ? [t.assignee] : [])).forEach((n) => addPerson(n, "")));
            return [...seen.values()];
          })(),
      businessCase: { ...blankBusinessCase(), ...(p.businessCase || {}) },
    }));
    return root;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const r = JSON.parse(raw); if (r && r.version === 2) return normalize(r); }
    } catch (e) { console.warn("load failed", e); }
    const s = seedRoot();
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }

  let root = load();
  const listeners = new Set();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(root)); } catch (e) { console.warn("persist failed (quota?)", e); } }
  function emit() { listeners.forEach((l) => l()); }

  function active() { return root.projects.find((p) => p.id === root.activeId) || null; }

  // ----- per-project state API (used by all views) -----
  function getState() { return active(); }
  function setState(updater) {
    const proj = active(); if (!proj) return;
    const next = typeof updater === "function" ? updater(proj) : { ...proj, ...updater };
    next.updatedAt = Date.now();
    root = { ...root, rev: (root.rev || 0) + 1, savedAt: Date.now(), projects: root.projects.map((p) => (p.id === proj.id ? next : p)) };
    persist(); emit();
  }
  function update(key, fn) { setState((s) => ({ ...s, [key]: fn(s[key]) })); }
  function add(key, item) { update(key, (arr) => [...arr, item]); }
  function patch(key, id, changes) { update(key, (arr) => arr.map((x) => (x.id === id ? { ...x, ...changes } : x))); }
  function remove(key, id) { update(key, (arr) => arr.filter((x) => x.id !== id)); }

  // ----- root / project-management API -----
  function getRoot() { return root; }
  function setRoot(next) { root = { ...next, rev: (next.rev != null ? next.rev : (root.rev || 0) + 1), savedAt: next.savedAt || Date.now() }; persist(); emit(); }
  const projects = {
    list: () => root.projects,
    open: (id) => setRoot({ ...root, activeId: id }),
    close: () => setRoot({ ...root, activeId: null }),
    create: (name, code, color, parentId) => {
      const p = blankProject(name, code, color, parentId || null);
      setRoot({ ...root, projects: [...root.projects, p], activeId: p.id });
      return p.id;
    },
    rename: (id, name, code) => setRoot({ ...root, projects: root.projects.map((p) => p.id === id ? { ...p, meta: { ...p.meta, project: name ?? p.meta.project, code: code ?? p.meta.code }, updatedAt: Date.now() } : p) }),
    setColor: (id, color) => setRoot({ ...root, projects: root.projects.map((p) => p.id === id ? { ...p, color } : p) }),
    setParent: (id, parentId) => setRoot({ ...root, projects: root.projects.map((p) => p.id === id ? { ...p, parentId: parentId || null, updatedAt: Date.now() } : p) }),
    remove: (id) => setRoot({ ...root, projects: root.projects.filter((p) => p.id !== id).map((p) => p.parentId === id ? { ...p, parentId: null } : p), activeId: root.activeId === id ? null : root.activeId }),
  };

  function resetAll() { root = seedRoot(); persist(); emit(); }

  // ----- sync helpers -----
  function importRoot(next) {
    if (!next || next.version !== 2 || !Array.isArray(next.projects)) throw new Error("Not a valid Atlas workspace file.");
    root = { version: 2, activeId: null, projects: next.projects, rev: next.rev || 0, savedAt: next.savedAt || Date.now() };
    persist(); emit();
  }
  function touch() { root = { ...root, rev: (root.rev || 0) + 1, savedAt: Date.now() }; persist(); }

  // ---------- React hooks ----------
  function useStore(selector) {
    const sel = selector || ((s) => s);
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => { listeners.add(force); return () => listeners.delete(force); }, []);
    return sel(active());
  }
  function useRoot() {
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => { listeners.add(force); return () => listeners.delete(force); }, []);
    return root;
  }

  // ---------- IndexedDB file store ----------
  const DB_NAME = "atlas.files";
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function putFile(id, blob) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction("files", "readwrite"); tx.objectStore("files").put(blob, id); tx.oncomplete = () => res(id); tx.onerror = () => rej(tx.error); }); }
  async function getFile(id) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction("files", "readonly"); const rq = tx.objectStore("files").get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }
  async function delFile(id) { const d = await db(); return new Promise((res) => { const tx = d.transaction("files", "readwrite"); tx.objectStore("files").delete(id); tx.oncomplete = () => res(); }); }
  async function allFiles() { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction("files", "readonly"); const st = tx.objectStore("files"); const out = {}; const cur = st.openCursor(); cur.onsuccess = (e) => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; cur.onerror = () => rej(cur.error); }); }

  window.Store = {
    uid, getState, setState, update, add, patch, remove, useStore, useRoot, getRoot, setRoot,
    projects, resetAll, importRoot, touch,
    files: { put: putFile, get: getFile, del: delFile, all: allFiles },
  };
})();


// ======== icons.jsx ========
/* ============================================================
   ICONS + shared small UI components
   Exposes window.Icon, window.UI
   ============================================================ */

const Icon = (function () {
  const S = (p, props = {}) =>
    React.createElement(
      "svg",
      { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", ...props },
      p
    );
  const P = (d, k) => React.createElement("path", { d, key: k });
  const L = (x1, y1, x2, y2, k) => React.createElement("line", { x1, y1, x2, y2, key: k });
  const C = (cx, cy, r, k) => React.createElement("circle", { cx, cy, r, key: k });
  const R = (x, y, w, h, rx, k) => React.createElement("rect", { x, y, width: w, height: h, rx, key: k });

  const paths = {
    home: () => [P("M3 10.5 12 3l9 7.5", "a"), P("M5 9.5V21h14V9.5", "b")],
    board: () => [R(3, 3, 18, 18, 2, "a"), L(9, 3, 9, 21, "b"), L(15, 3, 15, 21, "c")],
    list: () => [L(8, 6, 21, 6, "a"), L(8, 12, 21, 12, "b"), L(8, 18, 21, 18, "c"), C(3.5, 6, 0.6, "d"), C(3.5, 12, 0.6, "e"), C(3.5, 18, 0.6, "f")],
    timeline: () => [L(3, 7, 14, 7, "a"), L(8, 12, 20, 12, "b"), L(5, 17, 16, 17, "c")],
    users: () => [C(9, 8, 3.2, "a"), P("M3.5 20a5.5 5.5 0 0 1 11 0", "b"), P("M16 5.2a3.2 3.2 0 0 1 0 5.8", "c"), P("M17 14.5a5.5 5.5 0 0 1 3.5 5.5", "d")],
    shield: () => [P("M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Z", "a"), P("M9 12l2 2 4-4", "b")],
    bulb: () => [P("M9 18h6", "a"), P("M10 21h4", "b"), P("M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.2-1 2.5H9c0-1.3-.2-1.8-1-2.5A6 6 0 0 1 12 3Z", "c")],
    org: () => [R(9, 3, 6, 4, 1, "a"), R(3, 17, 6, 4, 1, "b"), R(15, 17, 6, 4, 1, "c"), P("M12 7v4M6 17v-3h12v3", "d")],
    box: () => [P("M21 8 12 3 3 8l9 5 9-5Z", "a"), P("M3 8v8l9 5 9-5V8", "b"), L(12, 13, 12, 21, "c")],
    doc: () => [P("M14 3H6v18h12V7l-4-4Z", "a"), P("M14 3v4h4", "b")],
    plus: () => [L(12, 5, 12, 19, "a"), L(5, 12, 19, 12, "b")],
    x: () => [L(6, 6, 18, 18, "a"), L(18, 6, 6, 18, "b")],
    filter: () => [P("M3 5h18l-7 8v6l-4-2v-4L3 5Z", "a")],
    search: () => [C(11, 11, 7, "a"), L(20, 20, 16, 16, "b")],
    trash: () => [P("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13", "a")],
    edit: () => [P("M4 20h4L19 9l-4-4L4 16v4Z", "a"), L(14, 6, 18, 10, "b")],
    check: () => [P("M5 12l4 4 10-10", "a")],
    chevR: () => [P("M9 6l6 6-6 6", "a")],
    chevD: () => [P("M6 9l6 6 6-6", "a")],
    drag: () => [C(9, 6, 0.8, "a"), C(15, 6, 0.8, "b"), C(9, 12, 0.8, "c"), C(15, 12, 0.8, "d"), C(9, 18, 0.8, "e"), C(15, 18, 0.8, "f")],
    upload: () => [P("M12 16V4", "a"), P("M7 9l5-5 5 5", "b"), P("M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3", "c")],
    print: () => [P("M6 9V3h12v6", "a"), P("M6 18H4v-6h16v6h-2", "b"), R(8, 14, 8, 6, 1, "c")],
    link: () => [P("M9 15l6-6", "a"), P("M11 7l1-1a3.5 3.5 0 0 1 5 5l-1 1", "b"), P("M13 17l-1 1a3.5 3.5 0 0 1-5-5l1-1", "c")],
    calendar: () => [R(3, 5, 18, 16, 2, "a"), L(3, 9, 21, 9, "b"), L(8, 3, 8, 6, "c"), L(16, 3, 16, 6, "d")],
    flag: () => [P("M5 21V4M5 4h11l-2 4 2 4H5", "a")],
    dot: () => [C(12, 12, 3, "a")],
    arrowR: () => [L(5, 12, 19, 12, "a"), P("M13 6l6 6-6 6", "b")],
    layers: () => [P("M12 3 3 8l9 5 9-5-9-5Z", "a"), P("M3 13l9 5 9-5", "b")],
    tag: () => [P("M3 11V4h7l11 11-7 7L3 11Z", "a"), C(7.5, 7.5, 1.2, "b")],
    reset: () => [P("M4 12a8 8 0 1 1 2.3 5.6", "a"), P("M4 20v-5h5", "b")],
    file: () => [P("M14 3H6v18h12V7l-4-4Z", "a"), P("M14 3v4h4", "b")],
    image: () => [R(3, 4, 18, 16, 2, "a"), C(8.5, 9.5, 1.5, "b"), P("M21 16l-5-5L5 20", "c")],
    sheet: () => [R(4, 3, 16, 18, 2, "a"), L(4, 9, 20, 9, "b"), L(4, 15, 20, 15, "c"), L(12, 3, 12, 21, "d")],
    slides: () => [R(3, 4, 18, 12, 2, "a"), L(12, 16, 12, 20, "b"), L(8, 20, 16, 20, "c")],
    menu: () => [L(4, 7, 20, 7, "a"), L(4, 12, 20, 12, "b"), L(4, 17, 20, 17, "c")],
    warn: () => [P("M12 4 2 20h20L12 4Z", "a"), L(12, 10, 12, 14, "b"), C(12, 17, 0.6, "c")],
    target: () => [C(12, 12, 8, "a"), C(12, 12, 4, "b"), C(12, 12, 0.7, "c")],
    coin: () => [C(12, 12, 8, "a"), P("M12 8v8M9.5 10a2 2 0 0 1 4 0c0 2.5-4 1.5-4 4a2 2 0 0 0 4 0", "b")],
    scope: () => [P("M3 8V5a2 2 0 0 1 2-2h3", "a"), P("M16 3h3a2 2 0 0 1 2 2v3", "b"), P("M21 16v3a2 2 0 0 1-2 2h-3", "c"), P("M8 21H5a2 2 0 0 1-2-2v-3", "d"), C(12, 12, 2.4, "e")],
    swap: () => [P("M7 4 4 7l3 3", "a"), P("M4 7h13", "b"), P("M17 20l3-3-3-3", "c"), P("M20 17H7", "d")],
    comms: () => [P("M4 5h16v10H9l-4 4v-4H4V5Z", "a"), L(8, 9, 16, 9, "b"), L(8, 12, 13, 12, "c")],
  };

  return function Icon({ name, size = 18, ...rest }) {
    const fn = paths[name];
    if (!fn) return null;
    return S(fn(), { width: size, height: size, ...rest });
  };
})();

/* ---------- shared UI bits ---------- */
const UI = (function () {
  const { useState, useRef, useEffect } = React;

  function Modal({ children, onClose, narrow }) {
    useEffect(() => {
      const h = (e) => e.key === "Escape" && onClose();
      window.addEventListener("keydown", h);
      return () => window.removeEventListener("keydown", h);
    }, [onClose]);
    return (
      <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className={"modal" + (narrow ? " narrow" : "")}>{children}</div>
      </div>
    );
  }

  function Chip({ label, color, dot, solid, onRemove }) {
    return (
      <span className={"chip tag-" + (color || "indigo") + (solid ? " solid" : "")}>
        {dot && <span className="chip-dot" />}
        {label}
        {onRemove && (
          <span className="chip-x" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <Icon name="x" size={11} />
          </span>
        )}
      </span>
    );
  }

  // inline editable text — pencil icon on hover
  function Editable({ value, onChange, tag = "div", placeholder, className, multiline, noPencil, ...rest }) {
    const ref = useRef(null);
    const Tag = tag;
    const inner = (
      <Tag
        ref={ref}
        className={(className || "") + " editable-field"}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-ph={placeholder}
        onBlur={(e) => onChange(e.currentTarget.textContent)}
        onKeyDown={(e) => {
          if (!multiline && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        }}
        {...rest}
      >
        {value}
      </Tag>
    );
    if (noPencil || tag === "span") return inner;
    return (
      <div className="editable-wrap">
        {inner}
        <span className="editable-pencil no-print"><Icon name="edit" size={12} /></span>
      </div>
    );
  }

  // multi-select dropdown for tags
  function TagPicker({ options, selected, onToggle, placeholder = "Add…" }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, []);
    return (
      <div className="tagpicker" ref={ref}>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => !o)}>
          <Icon name="plus" size={13} /> {placeholder}
        </button>
        {open && (
          <div className="tagpicker-menu panel">
            {options.map((o) => (
              <button key={o.id} className={"tagpicker-opt" + (selected.includes(o.id) ? " on" : "")} onClick={() => onToggle(o.id)}>
                <span className="chip-dot" style={{ background: "var(--t-" + o.color + ")" }} />
                <span className="grow">{o.label}</span>
                {selected.includes(o.id) && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function Confirm({ title, body, confirmLabel = "Delete", onConfirm, onClose }) {
    return (
      <Modal narrow onClose={onClose}>
        <div className="modal-bd">
          <div className="card-hd" style={{ marginBottom: 6 }}>{title}</div>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{body}</p>
        </div>
        <div className="modal-ft">
          <button className="btn btn-ghost grow" onClick={onClose}>Cancel</button>
          <button className="btn btn-dark btn-danger" onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </button>
        </div>
      </Modal>
    );
  }

  return { Modal, Chip, Editable, TagPicker, Confirm };
})();

Object.assign(window, { Icon, UI });


// ======== kanban.jsx ========
/* ============================================================
   KANBAN BOARD + CARD DETAIL MODAL + FILTER BAR
   Exposes window.Kanban, window.CardModal
   ============================================================ */
const { useState: useK, useMemo: useKM } = React;

const COLUMNS = [
  { id: "backlog", title: "Backlog", color: "var(--hue-backlog)" },
  { id: "inprogress", title: "In Progress", color: "var(--hue-progress)" },
  { id: "done", title: "Done", color: "var(--hue-done)" },
];
const PRIO = { high: { c: "var(--t-red)", label: "High" }, med: { c: "var(--t-amber)", label: "Med" }, low: { c: "var(--t-green)", label: "Low" } };

function initials(name) {
  if (!name) return "?";
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function tagById(tags, id) { return tags.find((t) => t.id === id); }
function assigneesOf(t) { return Array.isArray(t.assignees) ? t.assignees : (t.assignee ? [t.assignee] : []); }

/* resolve a dependency to a display descriptor */
function resolveDep(dep, tasks, products) {
  if (dep.type === "task") {
    const t = tasks.find((x) => x.id === dep.refId);
    return { icon: "board", name: t ? t.title : "(removed task)", status: t?.status, blocked: t && t.status !== "done", scope: "Task", external: false };
  }
  if (dep.type === "deliverable") {
    const p = products.find((x) => x.id === dep.refId);
    return { icon: "box", name: p ? p.name : "(removed deliverable)", scope: "Deliverable", external: false };
  }
  return { icon: "link", name: dep.label || "External dependency", scope: dep.scope || "External", external: true };
}

/* Dependency editor inside the card modal */
function DepEditor({ task, tasks, products, set }) {
  const [open, setOpen] = useK(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const deps = task.deps || [];
  const addDep = (d) => { set({ deps: [...deps, { id: Store.uid("d"), ...d }] }); setOpen(false); };
  const rmDep = (id) => set({ deps: deps.filter((x) => x.id !== id) });
  const patchDep = (id, c) => set({ deps: deps.map((x) => (x.id === id ? { ...x, ...c } : x)) });
  const otherTasks = tasks.filter((x) => x.id !== task.id && !deps.some((d) => d.type === "task" && d.refId === x.id));
  // detect if adding a task as a dep would create a conflict (this task starts before that task ends)
  const wouldConflict = (otherId) => {
    const other = tasks.find((x) => x.id === otherId);
    if (!other || other.status === "done") return false;
    return task.start && other.end && new Date(task.start) < new Date(other.end);
  };
  const freeProducts = products.filter((p) => !deps.some((d) => d.type === "deliverable" && d.refId === p.id));

  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <div className="field-label" style={{ margin: 0 }}>Depends on</div>
        <div className="tagpicker" ref={ref}>
          <button className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => !o)}><Icon name="plus" size={13} /> Add</button>
          {open && (
            <div className="tagpicker-menu panel" style={{ right: 0, left: "auto", minWidth: 240 }}>
              <div className="dep-menu-label">Within this project · tasks</div>
              {otherTasks.length === 0 && <div className="dep-menu-empty">No other tasks</div>}
              {otherTasks.map((t) => {
                const conflict = wouldConflict(t.id);
                return (
                  <button key={t.id} className="tagpicker-opt" onClick={() => {
                    if (conflict && !confirm(`“${task.title}” starts before “${t.title}” ends. Add this dependency anyway?`)) return;
                    addDep({ type: "task", refId: t.id });
                  }}>
                    <span className={"status-dot s-" + t.status} style={{ margin: 0 }} />
                    <span className="grow">{t.title}</span>
                    {conflict && <span className="dep-menu-warn" title="This task starts before that one ends">⚠</span>}
                  </button>
                );
              })}
              <div className="dep-menu-label">Outside the project</div>
              <button className="tagpicker-opt" onClick={() => addDep({ type: "external", label: "New external dependency", scope: "" })}>
                <Icon name="link" size={14} /><span className="grow">External dependency…</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {deps.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No dependencies</span>}
      <div className="dep-list">
        {deps.map((d) => {
          const r = resolveDep(d, tasks, products, task);
          return (
            <div key={d.id} className={"dep-item" + (r.external ? " ext" : "") + (r.blocked ? " blocked" : "") + (r.violated ? " violated" : "")}>
              <span className="dep-ico"><Icon name={r.icon} size={14} /></span>
              {d.type === "external" ? (
                <span className="grow" style={{ minWidth: 0 }}>
                  <UI.Editable className="dep-name" value={d.label} onChange={(v) => patchDep(d.id, { label: v || "External dependency" })} placeholder="What is needed?" />
                  <UI.Editable className="dep-scope mono" value={d.scope} onChange={(v) => patchDep(d.id, { scope: v })} placeholder="source / owner…" />
                </span>
              ) : (
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="dep-name">{r.name}</span>
                  <span className="dep-scope mono">{r.scope}{r.violated ? " · starts before predecessor ends" : r.blocked ? " · blocking" : r.status === "done" ? " · cleared" : ""}</span>
                </span>
              )}
              {r.violated && <span className="dep-flag" style={{ color: "var(--t-red)" }} title="Logical conflict">⚠</span>}
              {r.blocked && !r.violated && <span className="dep-flag" title="Not yet done">●</span>}
              <button className="chip-x" onClick={() => rmDep(d.id)}><Icon name="x" size={12} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Link a task to the risks it remediates */
function RiskLinker({ task, risks }) {
  const [open, setOpen] = useK(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const linked = risks.filter((r) => (r.taskIds || []).includes(task.id));
  const toggle = (risk) => {
    const cur = risk.taskIds || [];
    Store.patch("risks", risk.id, { taskIds: cur.includes(task.id) ? cur.filter((x) => x !== task.id) : [...cur, task.id] });
  };
  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <div className="field-label" style={{ margin: 0 }}>Remediates risk</div>
        <div className="tagpicker" ref={ref}>
          <button className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => !o)}><Icon name="shield" size={13} /> Link</button>
          {open && (
            <div className="tagpicker-menu panel" style={{ right: 0, left: "auto", minWidth: 240 }}>
              {risks.length === 0 && <div className="dep-menu-empty">No risks in this project</div>}
              {risks.map((r) => (
                <button key={r.id} className={"tagpicker-opt" + ((r.taskIds || []).includes(task.id) ? " on" : "")} onClick={() => toggle(r)}>
                  <span className="risk-score sm" style={{ width: 20, height: 20, fontSize: 11, background: scoreColor(r.likelihood, r.impact) }}>{LVL[r.likelihood] * LVL[r.impact]}</span>
                  <span className="grow">{r.title}</span>
                  {(r.taskIds || []).includes(task.id) && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {linked.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Not linked to a risk</span>}
      <div className="dep-list">
        {linked.map((r) => (
          <div key={r.id} className="dep-item risk">
            <span className="dep-ico" style={{ color: scoreColor(r.likelihood, r.impact) }}><Icon name="shield" size={14} /></span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="dep-name">{r.title}</span>
              <span className="dep-scope mono">{task.status === "done" ? "this action complete" : "remediation in progress"}</span>
            </span>
            <button className="chip-x" onClick={() => Store.patch("risks", r.id, { taskIds: (r.taskIds || []).filter((x) => x !== task.id) })}><Icon name="x" size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Multiple assignees — chips + add-by-name with suggestions */
function AssigneePicker({ value, onChange }) {
  const s = Store.getState();
  const [text, setText] = useK("");
  const [open, setOpen] = useK(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const members = s.members || [];
  const known = [...new Set([
    ...members.map((m) => m.name),
    ...(s.tasks || []).flatMap((t) => assigneesOf(t)),
  ])].filter(Boolean);
  const add = (n) => {
    const name = (n || "").trim();
    if (name && !value.includes(name)) {
      onChange([...value, name]);
      // keep the canonical member list complete
      if (!members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        const colors = ["blue", "indigo", "teal", "green", "amber", "red", "pink", "purple"];
        Store.add("members", { id: Store.uid("mem"), name, role: "", email: "", color: colors[members.length % colors.length] });
      }
    }
    setText(""); setOpen(false);
  };
  const remove = (n) => onChange(value.filter((x) => x !== n));
  const suggestions = known.filter((n) => !value.includes(n) && n.toLowerCase().includes(text.toLowerCase()));

  return (
    <div className="assignee-wrap" ref={ref}>
      <div className="assignee-chips">
        {value.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No one assigned</span>}
        {value.map((n) => (
          <span key={n} className="assignee-chip"><span className="avatar" style={{ width: 18, height: 18, fontSize: 8 }}>{initials(n)}</span>{n}
            <span className="chip-x" onClick={() => remove(n)}><Icon name="x" size={11} /></span>
          </span>
        ))}
      </div>
      <div className="assignee-add">
        <input className="input" style={{ padding: "6px 9px", fontSize: 13 }} value={text} placeholder="Add a person…"
          onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); } }} />
        {open && (text || suggestions.length > 0) && (
          <div className="tagpicker-menu panel" style={{ minWidth: "100%" }}>
            {text.trim() && !known.some((n) => n.toLowerCase() === text.trim().toLowerCase()) && (
              <button className="tagpicker-opt" onClick={() => add(text)}><Icon name="plus" size={13} /><span className="grow">Add “{text.trim()}”</span></button>
            )}
            {suggestions.slice(0, 6).map((n) => (
              <button key={n} className="tagpicker-opt" onClick={() => add(n)}>
                <span className="avatar" style={{ width: 18, height: 18, fontSize: 8 }}>{initials(n)}</span><span className="grow">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Card detail modal ---------------- */
function CardModal({ task, onClose }) {
  const { tags, phases, categories, products, risks, tasks } = Store.useStore();
  const t = Store.getState().tasks.find((x) => x.id === task.id) || task;
  const set = (changes) => Store.patch("tasks", t.id, changes);
  const toggleArr = (key, id) => {
    const cur = t[key] || [];
    set({ [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const linked = products.filter((p) => (p.taskIds || []).includes(t.id));

  return (
    <UI.Modal onClose={onClose}>
      <div className="modal-hd">
        <UI.Editable className="cm-title" tag="div" value={t.title} multiline
          onChange={(v) => set({ title: v || "Untitled task" })} placeholder="Task title" />
        <button className="btn btn-icon btn-ghost no-print" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        <div className="cm-grid">
          <div>
            <div className="cm-section">
              <div className="field-label">Description</div>
              <UI.Editable className="input" tag="div" value={t.desc} multiline
                style={{ minHeight: 90, lineHeight: 1.55 }}
                onChange={(v) => set({ desc: v })} placeholder="Add a description…" />
            </div>
            <div className="cm-section">
              <div className="between" style={{ marginBottom: 8 }}>
                <div className="field-label" style={{ margin: 0 }}>Tags</div>
                <UI.TagPicker options={tags} selected={t.tags || []} onToggle={(id) => toggleArr("tags", id)} placeholder="Tag" />
              </div>
              <div className="wrap">
                {(t.tags || []).length === 0 && <span className="muted" style={{ fontSize: 13 }}>No tags yet</span>}
                {(t.tags || []).map((id) => {
                  const tg = tagById(tags, id); if (!tg) return null;
                  return <UI.Chip key={id} label={tg.label} color={tg.color} dot onRemove={() => toggleArr("tags", id)} />;
                })}
              </div>
            </div>
            <div className="cm-section">
              <DepEditor task={t} tasks={tasks} products={products} set={set} />
            </div>
            <div className="cm-section">
              <RiskLinker task={t} risks={risks} />
            </div>
            {linked.length > 0 && (
              <div className="cm-section">
                <div className="field-label">Linked deliverables</div>
                {linked.map((p) => (
                  <div className="linked-prod" key={p.id}>
                    <Icon name={p.type === "excel" ? "sheet" : p.type === "image" ? "image" : p.type === "slides" ? "slides" : "doc"} size={15} />
                    <span className="grow">{p.name}</span>
                    <Icon name="link" size={13} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="cm-side">
            <div className="cm-side-block">
              <div className="field-label">Status</div>
              <div className="statusseg">
                {COLUMNS.map((c) => (
                  <button key={c.id} className={t.status === c.id ? "on" : ""} onClick={() => set({ status: c.id })}>{c.title}</button>
                ))}
              </div>
            </div>
            <div className="cm-side-block">
              <div className="field-label">Priority</div>
              <div className="statusseg prioseg">
                {Object.entries(PRIO).map(([k, v]) => (
                  <button key={k} className={t.priority === k ? "on" : ""} style={{ "--prio-c": v.c }} onClick={() => set({ priority: k })}>{v.label}</button>
                ))}
              </div>
            </div>
            <div className="cm-side-block">
              <div className="field-label">Assignees</div>
              <AssigneePicker value={assigneesOf(t)} onChange={(v) => set({ assignees: v, assignee: undefined })} />
            </div>
            <div className="cm-side-block">
              <div className="field-label">Details</div>
              <div className="meta-row">
                <span className="meta-k">Phase</span>
                <PickInline options={phases} value={t.phase} onChange={(v) => set({ phase: v })} />
              </div>
              <div className="meta-row">
                <span className="meta-k">Category</span>
                <PickInline options={categories} value={t.category} onChange={(v) => set({ category: v })} />
              </div>
              <div className="meta-row">
                <span className="meta-k">Start</span>
                <input className="datemini" type="date" value={t.start || ""} onChange={(e) => set({ start: e.target.value })} />
              </div>
              <div className="meta-row">
                <span className="meta-k">End</span>
                <input className="datemini" type="date" value={t.end || ""} onChange={(e) => set({ end: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-ft no-print">
        <button className="btn btn-ghost btn-danger" onClick={() => { Store.remove("tasks", t.id); onClose(); }}>
          <Icon name="trash" size={15} /> Delete
        </button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </UI.Modal>
  );
}

// inline color-coded picker (phase/category)
function PickInline({ options, value, onChange }) {
  const [open, setOpen] = useK(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = options.find((o) => o.id === value);
  return (
    <div className="tagpicker" ref={ref}>
      <button className="pick-trigger" onClick={() => setOpen((o) => !o)}>
        {cur ? <UI.Chip label={cur.label} color={cur.color} dot /> : <span className="muted">Set…</span>}
      </button>
      {open && (
        <div className="tagpicker-menu panel" style={{ minWidth: 180 }}>
          <button className="tagpicker-opt" onClick={() => { onChange(null); setOpen(false); }}>
            <span className="chip-dot" style={{ background: "var(--ink-ghost)" }} /><span className="grow">None</span>
          </button>
          {options.map((o) => (
            <button key={o.id} className={"tagpicker-opt" + (value === o.id ? " on" : "")} onClick={() => { onChange(o.id); setOpen(false); }}>
              <span className="chip-dot" style={{ background: "var(--t-" + o.color + ")" }} />
              <span className="grow">{o.label}</span>
              {value === o.id && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Kanban card ---------------- */
function KCard({ task, tags, onOpen, onDragStart, onDragEnd, dragging }) {
  const cardTags = (task.tags || []).map((id) => tagById(tags, id)).filter(Boolean);
  return (
    <div
      className={"kcard" + (dragging ? " dragging" : "")}
      style={{ "--prio": PRIO[task.priority]?.c || "var(--line-strong)" }}
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onDoubleClick={() => onOpen(task)}
      title="Double-click to open"
    >
      <div className="kcard-title">{task.title}</div>
      {cardTags.length > 0 && (
        <div className="kcard-tags">
          {cardTags.map((tg) => <UI.Chip key={tg.id} label={tg.label} color={tg.color} dot />)}
        </div>
      )}
      <div className="kcard-foot">
        {(() => {
          const who = assigneesOf(task);
          if (!who.length) return <span className="muted" style={{ fontSize: 12 }}>Unassigned</span>;
          return (<>
            <span className="avatar-stack">{who.slice(0, 3).map((n, i) => <span key={i} className="avatar" title={n}>{initials(n)}</span>)}</span>
            <span className="muted" style={{ fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who.length === 1 ? who[0] : who.length + " people"}</span>
          </>);
        })()}
        <span className="prio-tick" style={{ color: PRIO[task.priority]?.c }}>{PRIO[task.priority]?.label}</span>
      </div>
    </div>
  );
}

/* ---------------- Board ---------------- */
function Kanban() {
  const s = Store.useStore();
  const { tasks, tags, phases, categories } = s;
  const [open, setOpen] = useK(null);
  const [drag, setDrag] = useK(null);
  const [over, setOver] = useK(null);
  const [q, setQ] = useK("");
  const [fTags, setFTags] = useK([]);
  const [fPhase, setFPhase] = useK([]);
  const [fCat, setFCat] = useK([]);

  const filtered = useKM(() => {
    return tasks.filter((t) => {
      if (q && !(t.title + " " + (t.desc || "") + " " + assigneesOf(t).join(" ")).toLowerCase().includes(q.toLowerCase())) return false;
      if (fTags.length && !fTags.every((id) => (t.tags || []).includes(id))) return false;
      if (fPhase.length && !fPhase.includes(t.phase)) return false;
      if (fCat.length && !fCat.includes(t.category)) return false;
      return true;
    });
  }, [tasks, q, fTags, fPhase, fCat]);

  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const anyFilter = q || fTags.length || fPhase.length || fCat.length;

  const onDrop = (status) => {
    if (drag) Store.patch("tasks", drag.id, { status });
    setDrag(null); setOver(null);
  };
  const addTask = (status) => {
    const id = Store.uid("t");
    Store.add("tasks", { id, title: "New task", status, tags: [], priority: "med", assignees: [], desc: "", phase: null, category: null, start: "", end: "", deps: [] });
    setOpen({ id });
  };

  return (
    <>
      <div className="filterbar no-print">
        <div className="search-box">
          <Icon name="search" size={15} />
          <input placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="filter-pills">
          {tags.map((tg) => (
            <button key={tg.id} className={"fpill" + (fTags.includes(tg.id) ? " on" : "")} style={{ "--t-var": "var(--t-" + tg.color + ")" }} onClick={() => toggle(fTags, setFTags, tg.id)}>
              <span className="chip-dot" style={{ background: "var(--t-" + tg.color + ")" }} />{tg.label}
            </button>
          ))}
        </div>
        <div className="grow" />
        {anyFilter && (
          <button className="btn btn-sm btn-ghost" onClick={() => { setQ(""); setFTags([]); setFPhase([]); setFCat([]); }}>
            <Icon name="x" size={13} /> Clear
          </button>
        )}
        <FilterMenu phases={phases} categories={categories} fPhase={fPhase} setFPhase={setFPhase} fCat={fCat} setFCat={setFCat} />
      </div>

      <div className="view-scroll">
        <div className="kanban">
          {COLUMNS.map((col) => {
            const items = filtered.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                className={"kcol" + (over === col.id ? " drop" : "")}
                onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }}
                onDrop={() => onDrop(col.id)}
              >
                <div className="kcol-hd">
                  <span className="kcol-dot" style={{ background: col.color }} />
                  <span className="kcol-title">{col.title}</span>
                  <span className="kcol-count">{items.length}</span>
                </div>
                <div className="kcol-body">
                  {items.map((t) => (
                    <KCard key={t.id} task={t} tags={tags} onOpen={setOpen}
                      dragging={drag?.id === t.id}
                      onDragStart={(e, task) => { setDrag(task); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDrag(null); setOver(null); }} />
                  ))}
                  {items.length === 0 && over !== col.id && <div style={{ height: 4 }} />}
                  <button className="kadd" onClick={() => addTask(col.id)}>
                    <Icon name="plus" size={14} /> Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && <CardModal task={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function FilterMenu({ phases, categories, fPhase, setFPhase, fCat, setFCat }) {
  const [open, setOpen] = useK(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const n = fPhase.length + fCat.length;
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  return (
    <div className="tagpicker" ref={ref}>
      <button className={"btn btn-sm" + (n ? " btn-primary" : "")} onClick={() => setOpen((o) => !o)}>
        <Icon name="filter" size={14} /> Filter{n ? ` · ${n}` : ""}
      </button>
      {open && (
        <div className="tagpicker-menu panel" style={{ right: 0, left: "auto", minWidth: 200, padding: 12 }}>
          <div className="field-label">Phase</div>
          <div className="wrap" style={{ marginBottom: 14 }}>
            {phases.map((p) => (
              <button key={p.id} className={"fpill" + (fPhase.includes(p.id) ? " on" : "")} style={{ "--t-var": "var(--t-" + p.color + ")" }} onClick={() => toggle(fPhase, setFPhase, p.id)}>
                <span className="chip-dot" style={{ background: "var(--t-" + p.color + ")" }} />{p.label}
              </button>
            ))}
          </div>
          <div className="field-label">Category</div>
          <div className="wrap">
            {categories.map((c) => (
              <button key={c.id} className={"fpill" + (fCat.includes(c.id) ? " on" : "")} style={{ "--t-var": "var(--t-" + c.color + ")" }} onClick={() => toggle(fCat, setFCat, c.id)}>
                <span className="chip-dot" style={{ background: "var(--t-" + c.color + ")" }} />{c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Kanban, CardModal, PickInline, COLUMNS, PRIO, initials, tagById, resolveDep, assigneesOf });


// ======== actions.jsx ========
/* ============================================================
   ACTION LIST + DRAG/DROP TIMELINE
   Grouped by CATEGORY · milestones & gates
   Exposes window.Actions
   ============================================================ */
const { useState: useA, useRef: useAR, useMemo: useAM } = React;

const DAY = 86400000;
const fmtD = (s) => { if (!s) return "—"; const d = new Date(s); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
const toISO = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);

function Actions() {
  const [mode, setMode] = useA(localStorage.getItem("atlas.actions.mode") || "list");
  const [showTax, setShowTax] = useA(false);
  const setM = (m) => { setMode(m); localStorage.setItem("atlas.actions.mode", m); };
  return (
    <>
      <div className="filterbar no-print" style={{ justifyContent: "space-between" }}>
        <div className="seg-toggle">
          <button className={mode === "list" ? "on" : ""} onClick={() => setM("list")}><Icon name="list" size={15} /> Action list</button>
          <button className={mode === "timeline" ? "on" : ""} onClick={() => setM("timeline")}><Icon name="timeline" size={15} /> Timeline</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowTax(true)} title="Edit categories, tags & phases"><Icon name="tag" size={14} /> Edit categories</button>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {mode === "timeline" ? "Drag bars to move · drag edges to resize · ◆ milestone · ┃ gate" : "Grouped by category · click a row to open"}
          </div>
        </div>
      </div>
      <div className="view-scroll">
        {mode === "list" ? <ActionList /> : <Timeline />}
      </div>
      {showTax && <TaxonomyEditor onClose={() => setShowTax(false)} />}
    </>
  );
}

/* ============================================================
   ACTION LIST — grouped by category
   ============================================================ */
function ActionList() {
  const { tasks, phases, categories, tags, milestones } = Store.useStore();
  const [open, setOpen] = useA(null);
  const [msEdit, setMsEdit] = useA(null);

  const groups = useAM(() => {
    const g = categories.map((c) => ({
      cat: c,
      items: tasks.filter((t) => t.category === c.id),
      ms: milestones.filter((m) => m.category === c.id),
    }));
    const un = tasks.filter((t) => !t.category || !categories.find((c) => c.id === t.category));
    const unMs = milestones.filter((m) => !m.category || !categories.find((c) => c.id === m.category));
    if (un.length || unMs.length) g.push({ cat: null, items: un, ms: unMs });
    return g;
  }, [tasks, categories, milestones]);

  const addTo = (catId) => {
    const id = Store.uid("t");
    Store.add("tasks", { id, title: "New action", status: "backlog", tags: [], priority: "med", assignees: [], desc: "", phase: null, category: catId, start: "", end: "", deps: [] });
    setOpen({ id });
  };
  const addMs = (catId) => {
    const id = Store.uid("ms");
    Store.add("milestones", { id, title: "New milestone", type: "milestone", date: toISO(new Date()), category: catId || null, note: "" });
    setMsEdit(id);
  };

  return (
    <div className="view-pad view-wide">
      {/* tasks grouped by category, milestones pinned at top */}
      {groups.map((g) => (
        <div key={g.cat?.id || "un"} className="act-group">
          <div className="act-group-hd">
            <span className="kcol-dot" style={{ background: g.cat ? "var(--t-" + g.cat.color + ")" : "var(--ink-ghost)" }} />
            <span className="act-group-title">{g.cat ? g.cat.label : "Uncategorised"}</span>
            <span className="kcol-count">{g.items.length} {g.items.length === 1 ? "action" : "actions"}{g.ms.length ? " · " + g.ms.length + " marker" + (g.ms.length === 1 ? "" : "s") : ""}</span>
            <div className="grow" />
            <button className="btn btn-sm btn-ghost" onClick={() => addMs(g.cat?.id)}><Icon name="flag" size={13} /> Milestone</button>
            <button className="btn btn-sm btn-ghost" onClick={() => addTo(g.cat?.id)}><Icon name="plus" size={13} /> Add</button>
          </div>
          {/* milestones/gates pinned at top */}
          {g.ms.length > 0 && (
            <div className="ms-pinned">
              {g.ms.map((ms) => (
                <div key={ms.id} className={"ms-pin " + ms.type} onClick={() => setMsEdit(ms.id)}>
                  <span className={ms.type === "gate" ? "ms-gate-icon" : "ms-mile-icon"}>{ms.type === "gate" ? "┃" : "◆"}</span>
                  <span className="ms-pin-title">{ms.title}</span>
                  <span className={"ms-type-chip " + ms.type}>{ms.type === "gate" ? "Gate" : "Milestone"}</span>
                  <span className="muted mono" style={{ fontSize: 11 }}>{fmtD(ms.date)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="act-table">
            <div className="act-head">
              <div>Action</div><div>Phase</div><div>Tags</div><div>Owner</div><div>Dates</div><div>Status</div>
            </div>
            {g.items.length === 0 && <div className="act-empty">No actions in this category yet.</div>}
            {g.items.map((t) => {
              const ph = phases.find((p) => p.id === t.phase);
              return (
                <div key={t.id} className="act-row" onClick={() => setOpen(t)}>
                  <div className="act-cell-title">
                    <span className="prio-pip" style={{ background: PRIO[t.priority]?.c }} />
                    {t.title}
                  </div>
                  <div>{ph ? <UI.Chip label={ph.label} color={ph.color} dot /> : <span className="muted">—</span>}</div>
                  <div className="wrap">
                    {(t.tags || []).slice(0, 3).map((id) => { const tg = tags.find((x) => x.id === id); return tg ? <UI.Chip key={id} label={tg.label} color={tg.color} /> : null; })}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>{assigneesOf(t).length ? (assigneesOf(t).length === 1 ? assigneesOf(t)[0] : assigneesOf(t).length + " people") : "—"}</div>
                  <div className="muted mono" style={{ fontSize: 12 }}>{fmtD(t.start)} → {fmtD(t.end)}</div>
                  <div><span className={"status-dot s-" + t.status} />{COLUMNS.find((c) => c.id === t.status)?.title}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {open && <CardModal task={open} onClose={() => setOpen(null)} />}
      {msEdit && <MilestoneModal id={msEdit} onClose={() => setMsEdit(null)} />}
    </div>
  );
}

/* ============================================================
   MILESTONE/GATE MODAL
   ============================================================ */
function MilestoneModal({ id, onClose }) {
  const { categories } = Store.useStore();
  const ms = Store.getState().milestones.find((x) => x.id === id);
  if (!ms) return null;
  const set = (c) => Store.patch("milestones", id, c);
  return (
    <UI.Modal narrow onClose={onClose}>
      <div className="modal-hd">
        <span className={ms.type === "gate" ? "ms-gate-icon big" : "ms-mile-icon big"}>{ms.type === "gate" ? "┃" : "◆"}</span>
        <div className="grow">
          <UI.Editable className="cm-title" style={{ fontSize: 20 }} multiline value={ms.title} onChange={(v) => set({ title: v || "Untitled" })} placeholder="Name" />
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        <div className="row" style={{ gap: 16, marginBottom: 18 }}>
          <div className="grow">
            <div className="field-label">Type</div>
            <div className="statusseg" style={{ maxWidth: 220 }}>
              <button className={ms.type === "milestone" ? "on" : ""} onClick={() => set({ type: "milestone" })}>◆ Milestone</button>
              <button className={ms.type === "gate" ? "on" : ""} onClick={() => set({ type: "gate" })}>┃ Gate</button>
            </div>
          </div>
          <div>
            <div className="field-label">Date</div>
            <input className="datemini" type="date" value={ms.date || ""} onChange={(e) => set({ date: e.target.value })} />
          </div>
        </div>
        <div className="field-label">Category</div>
        <PickInline options={categories} value={ms.category} onChange={(v) => set({ category: v })} />
        <div style={{ marginTop: 16 }}>
          <div className="field-label">Note</div>
          <UI.Editable className="input" tag="div" multiline value={ms.note} style={{ minHeight: 60, lineHeight: 1.5 }} onChange={(v) => set({ note: v })} placeholder="What does this mark?" />
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn btn-ghost btn-danger" onClick={() => { Store.remove("milestones", id); onClose(); }}><Icon name="trash" size={15} /> Delete</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </UI.Modal>
  );
}

/* ============================================================
   TIMELINE (Gantt) — grouped by category + milestones & gates
   ============================================================ */
function Timeline() {
  const { tasks, categories, milestones } = Store.useStore();
  const [open, setOpen] = useA(null);
  const [msEdit, setMsEdit] = useA(null);
  const scrollRef = useAR(null);
  const DAYW = 13;

  const dated = tasks.filter((t) => t.start && t.end);
  const datedMs = milestones.filter((m) => m.date);
  const allDates = [...dated.map((t) => [t.start, t.end]).flat(), ...datedMs.map((m) => m.date)];

  const range = useAM(() => {
    if (!allDates.length) { const now = new Date(); return { min: now, max: new Date(+now + 60 * DAY) }; }
    let min = Infinity, max = -Infinity;
    allDates.forEach((d) => { const v = +new Date(d); if (v < min) min = v; if (v > max) max = v; });
    min -= 4 * DAY; max += 8 * DAY;
    return { min: new Date(min), max: new Date(max) };
  }, [tasks, milestones]);

  const totalDays = Math.max(1, daysBetween(range.min, range.max));
  const totalW = totalDays * DAYW;

  const months = useAM(() => {
    const out = []; const d = new Date(range.min); d.setDate(1);
    while (d < range.max) {
      const start = new Date(Math.max(+d, +range.min));
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const end = new Date(Math.min(+next, +range.max));
      out.push({ label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), left: daysBetween(range.min, start) * DAYW, width: daysBetween(start, end) * DAYW });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }, [range]);

  const todayLeft = (() => { const now = new Date(); if (now < range.min || now > range.max) return null; return daysBetween(range.min, now) * DAYW; })();

  const groups = categories.map((c) => ({ cat: c, items: dated.filter((t) => t.category === c.id) }))
    .concat([{ cat: null, items: dated.filter((t) => !t.category || !categories.find((c) => c.id === t.category)) }])
    .filter((g) => g.items.length);

  /* drag */
  const dragRef = useAR(null);
  const onBarDown = (e, task, kind) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { task, kind, startX: e.clientX, start0: new Date(task.start), end0: new Date(task.end), moved: false };
    document.body.style.cursor = kind === "move" ? "grabbing" : "ew-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const onMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const deltaDays = Math.round((e.clientX - d.startX) / DAYW);
    if (deltaDays !== 0) d.moved = true;
    let s = new Date(d.start0), en = new Date(d.end0);
    if (d.kind === "move") { s = new Date(+d.start0 + deltaDays * DAY); en = new Date(+d.end0 + deltaDays * DAY); }
    else if (d.kind === "l") { s = new Date(Math.min(+d.start0 + deltaDays * DAY, +d.end0 - DAY)); }
    else if (d.kind === "r") { en = new Date(Math.max(+d.end0 + deltaDays * DAY, +d.start0 + DAY)); }
    const el = document.getElementById("bar-" + d.task.id);
    if (el) { el.style.left = daysBetween(range.min, s) * DAYW + "px"; el.style.width = Math.max(DAYW, daysBetween(s, en) * DAYW) + "px"; }
    d.preview = { start: toISO(s), end: toISO(en) };
  };
  const onUp = () => {
    const d = dragRef.current;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.body.style.cursor = "";
    if (d && d.moved && d.preview) Store.patch("tasks", d.task.id, d.preview);
    dragRef.current = null;
  };

  if (!dated.length && !datedMs.length) {
    return <div className="view-pad view-wide"><div className="empty"><div className="serif">No dated actions yet</div>Add start and end dates to actions to see them on the timeline.</div></div>;
  }

  // compute layout for every rendered task so we can draw dependency arrows on top
  const taskLayout = new Map();
  let yCursor = 38; // header row height
  groups.forEach((g) => {
    yCursor += 34; // phase row
    g.items.forEach((t) => {
      const barLeft = daysBetween(range.min, t.start) * DAYW;
      const barWidth = Math.max(DAYW, daysBetween(t.start, t.end) * DAYW);
      taskLayout.set(t.id, { rowY: yCursor + 21, barLeft, barWidth });
      yCursor += 42;
    });
  });
  const depLines = [];
  tasks.forEach((t) => {
    if (!t.start || !t.end || !taskLayout.has(t.id)) return;
    (t.deps || []).forEach((d) => {
      if (d.type !== "task") return;
      const pred = tasks.find((x) => x.id === d.refId);
      if (!pred || !pred.start || !pred.end || !taskLayout.has(pred.id)) return;
      const pL = taskLayout.get(pred.id);
      const dL = taskLayout.get(t.id);
      const violated = pred.status !== "done" && new Date(t.start) < new Date(pred.end);
      depLines.push({
        key: d.id || (pred.id + "-" + t.id),
        from: { x: pL.barLeft + pL.barWidth, y: pL.rowY },
        to:   { x: dL.barLeft, y: dL.rowY },
        violated,
        title: pred.title + " → " + t.title + (violated ? " (overlaps)" : ""),
      });
    });
  });

  return (
    <div className="view-pad">
      <div className="gantt panel" ref={scrollRef}>
        <div className="gantt-inner" style={{ width: totalW + 260 }}>
          {/* dependency arrows overlay — positioned over the track area */}
          {depLines.length > 0 && (
            <svg className="gantt-deps" style={{ left: 260, width: totalW, height: yCursor + 20 }}>
              <defs>
                <marker id="gd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                </marker>
                <marker id="gd-arrow-bad" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--t-red)" />
                </marker>
              </defs>
              {depLines.map((line) => {
                const stub = 12;
                const arrowEndX = line.to.x - 4;
                const path = line.to.x >= line.from.x + stub * 2
                  ? `M${line.from.x},${line.from.y} h${stub} V${line.to.y} H${arrowEndX}`
                  : `M${line.from.x},${line.from.y} h${stub} V${line.to.y - 14} H${line.to.x - 8} V${line.to.y}`;
                return (
                  <path key={line.key} d={path}
                    className={"gantt-dep" + (line.violated ? " violated" : "")}
                    markerEnd={line.violated ? "url(#gd-arrow-bad)" : "url(#gd-arrow)"}>
                    <title>{line.title}</title>
                  </path>
                );
              })}
            </svg>
          )}
          {/* header */}
          <div className="gantt-row gantt-header">
            <div className="gantt-label gantt-corner">Category / Action</div>
            <div className="gantt-track" style={{ width: totalW }}>
              {months.map((m, i) => <div key={i} className="gantt-month" style={{ left: m.left, width: m.width }}>{m.label}</div>)}
              {todayLeft != null && <div className="gantt-today" style={{ left: todayLeft }}><span>Today</span></div>}
              {/* milestones & gates in header track */}
              {datedMs.map((ms) => {
                const left = daysBetween(range.min, ms.date) * DAYW;
                const cat = categories.find((c) => c.id === ms.category);
                if (ms.type === "gate") {
                  return <div key={ms.id} className="gantt-gate" style={{ left }} title={ms.title + " (gate) — " + fmtD(ms.date)} onClick={() => setMsEdit(ms.id)} />;
                }
                return <div key={ms.id} className="gantt-milestone" style={{ left, "--ms-c": cat ? "var(--t-" + cat.color + ")" : "var(--accent)" }} title={ms.title + " — " + fmtD(ms.date)} onClick={() => setMsEdit(ms.id)}>◆</div>;
              })}
            </div>
          </div>
          {/* rows by category */}
          {groups.map((g) => (
            <React.Fragment key={g.cat?.id || "un"}>
              <div className="gantt-row gantt-phaserow">
                <div className="gantt-label">
                  <span className="kcol-dot" style={{ background: g.cat ? "var(--t-" + g.cat.color + ")" : "var(--ink-ghost)" }} />
                  <strong>{g.cat ? g.cat.label : "Uncategorised"}</strong>
                </div>
                <div className="gantt-track" style={{ width: totalW }}>
                  {todayLeft != null && <div className="gantt-todayline" style={{ left: todayLeft }} />}
                  {/* gate lines extend through all rows */}
                  {datedMs.filter((ms) => ms.type === "gate").map((ms) => {
                    const left = daysBetween(range.min, ms.date) * DAYW;
                    return <div key={ms.id} className="gantt-gateline" style={{ left }} />;
                  })}
                  {/* milestone markers */}
                  {datedMs.filter((ms) => ms.type === "milestone").map((ms) => {
                    const left = daysBetween(range.min, ms.date) * DAYW;
                    return <div key={ms.id} className="gantt-msline" style={{ left }} />;
                  })}
                </div>
              </div>
              {g.items.map((t) => {
                const left = daysBetween(range.min, t.start) * DAYW;
                const width = Math.max(DAYW, daysBetween(t.start, t.end) * DAYW);
                const cat = categories.find((c) => c.id === t.category);
                const color = cat ? "var(--t-" + cat.color + ")" : "var(--accent)";
                return (
                  <div className="gantt-row" key={t.id}>
                    <div className="gantt-label gantt-tasklabel" onClick={() => setOpen(t)} title={t.title}>{t.title}</div>
                    <div className="gantt-track" style={{ width: totalW }}>
                      {todayLeft != null && <div className="gantt-todayline" style={{ left: todayLeft }} />}
                      {datedMs.filter((ms) => ms.type === "gate").map((ms) => <div key={ms.id} className="gantt-gateline" style={{ left: daysBetween(range.min, ms.date) * DAYW }} />)}
                      {datedMs.filter((ms) => ms.type === "milestone").map((ms) => <div key={ms.id} className="gantt-msline" style={{ left: daysBetween(range.min, ms.date) * DAYW }} />)}
                      <div id={"bar-" + t.id} className={"gantt-bar" + (t.status === "done" ? " done" : "")}
                        style={{ left, width, "--bar-c": color }}
                        onPointerDown={(e) => onBarDown(e, t, "move")}
                        onDoubleClick={() => setOpen(t)} title={t.title + " · " + fmtD(t.start) + " → " + fmtD(t.end)}>
                        <span className="gantt-handle l" onPointerDown={(e) => onBarDown(e, t, "l")} />
                        <span className="gantt-bar-label">{t.title}</span>
                        <span className="gantt-handle r" onPointerDown={(e) => onBarDown(e, t, "r")} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      {open && <CardModal task={open} onClose={() => setOpen(null)} />}
      {msEdit && <MilestoneModal id={msEdit} onClose={() => setMsEdit(null)} />}
    </div>
  );
}

Object.assign(window, { Actions });


// ======== stakeholders.jsx ========
/* ============================================================
   PROJECT MEMBERS — canonical people list
   Feeds the org chart, task assignees and the personal view.
   Exposes window.Members (+ legacy Stakeholders alias, Seg)
   ============================================================ */
const { useState: useS } = React;

const MEMBER_COLORS = ["blue", "indigo", "teal", "green", "amber", "red", "pink", "purple"];

// where a member's name is referenced across the project
function memberUsage(s, name) {
  const taskCount = (s.tasks || []).filter((t) => assigneesOf(t).includes(name)).length;
  const inOrg = (s.org || []).some((o) => o.name === name);
  return { taskCount, inOrg };
}

function Members() {
  const s = Store.useStore();
  const members = s.members || [];
  const [del, setDel] = useS(null);

  const add = () => {
    const id = Store.uid("mem");
    Store.add("members", { id, name: "New member", role: "", email: "", color: MEMBER_COLORS[members.length % MEMBER_COLORS.length] });
  };
  const patch = (id, c) => Store.patch("members", id, c);
  const removeMember = (m) => {
    Store.remove("members", m.id);
    setDel(null);
  };

  return (
    <div className="view-scroll">
      <div className="view-pad view-wide">
        <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <p className="muted" style={{ margin: 0, maxWidth: 580, fontSize: 14, lineHeight: 1.55 }}>
            Everyone working on the project. This is the master list — members appear in task assignees, the roles &amp; org chart, and the personal view on the front page.
          </p>
          <button className="btn btn-primary no-print" onClick={add}><Icon name="plus" size={15} /> Add member</button>
        </div>

        <div className="mem-grid">
          {members.map((m) => {
            const use = memberUsage(s, m.name);
            return (
              <div key={m.id} className="mem-card panel">
                <div className="mem-card-top">
                  <span className="avatar mem-avatar" style={{ background: "var(--t-" + (m.color || "indigo") + ")" }}>{initials(m.name)}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <UI.Editable className="mem-name" value={m.name} onChange={(v) => patch(m.id, { name: v || "Unnamed" })} placeholder="Full name" />
                    <UI.Editable className="mem-role" value={m.role} onChange={(v) => patch(m.id, { role: v })} placeholder="Role on the project" />
                  </div>
                  <button className="btn btn-icon btn-ghost btn-danger no-print mem-del" title="Remove member" onClick={() => setDel(m)}><Icon name="trash" size={14} /></button>
                </div>
                <div className="mem-colorpick no-print">
                  {MEMBER_COLORS.map((c) => (
                    <button key={c} className={"mem-swatch" + (m.color === c ? " on" : "")} style={{ background: "var(--t-" + c + ")" }} onClick={() => patch(m.id, { color: c })} />
                  ))}
                </div>
                <div className="mem-email">
                  <Icon name="users" size={13} />
                  <UI.Editable className="mono" value={m.email} onChange={(v) => patch(m.id, { email: v })} placeholder="email@company.example" />
                </div>
                <div className="mem-foot">
                  <span className="mem-stat"><b>{use.taskCount}</b> task{use.taskCount === 1 ? "" : "s"}</span>
                  <span className={"mem-stat" + (use.inOrg ? " on" : "")}>{use.inOrg ? "In org chart" : "Not in org chart"}</span>
                </div>
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="empty" style={{ gridColumn: "1/-1" }}>
              <div className="serif">No members yet</div>Add the people working on this project.
            </div>
          )}
        </div>
      </div>
      {del && (
        <UI.Confirm
          title="Remove member?"
          body={`Remove ${del.name} from the project's member list? This won't unassign them from tasks they're already on.`}
          confirmLabel="Remove"
          onConfirm={() => removeMember(del)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  );
}

// keep Seg available (used by risks modal)
function Seg({ value, options, onChange }) {
  return (
    <div className="statusseg">
      {Object.entries(options).map(([k, v]) => (
        <button key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{v}</button>
      ))}
    </div>
  );
}

Object.assign(window, { Members, Stakeholders: Members, Seg });


// ======== risks.jsx ========
/* ============================================================
   RISKS & MITIGATION — register + heatmap + task remediation
   Exposes window.Risks + remediation helpers
   ============================================================ */
const { useState: useR } = React;

const LVL = { low: 1, med: 2, high: 3 };
const LVL_LABEL = { low: "Low", med: "Medium", high: "High" };
const RISK_STATUS = { open: { label: "Open", c: "var(--t-red)" }, monitoring: { label: "Monitoring", c: "var(--t-amber)" }, closed: { label: "Closed", c: "var(--t-green)" } };
const scoreColor = (l, i) => { const s = LVL[l] * LVL[i]; if (s >= 6) return "var(--t-red)"; if (s >= 3) return "var(--t-amber)"; return "var(--t-green)"; };

// remediation state from linked tasks
function remediation(risk, tasks) {
  const ids = risk.taskIds || [];
  const linked = tasks.filter((t) => ids.includes(t.id));
  if (!linked.length) return { state: "none", done: 0, total: 0, linked };
  const done = linked.filter((t) => t.status === "done").length;
  const active = linked.some((t) => t.status === "inprogress");
  let state = "planned";
  if (done === linked.length) state = "remediated";
  else if (done > 0 || active) state = "progress";
  return { state, done, total: linked.length, linked };
}
const REMED = {
  none: { label: "No actions", c: "var(--ink-faint)" },
  planned: { label: "Remediation planned", c: "var(--t-indigo)" },
  progress: { label: "Remediating", c: "var(--t-amber)" },
  remediated: { label: "Remediated", c: "var(--t-green)" },
};

function Risks() {
  const { risks, tasks } = Store.useStore();
  const [open, setOpen] = useR(null);
  const [del, setDel] = useR(null);
  const add = () => { const id = Store.uid("r"); Store.add("risks", { id, title: "New risk", likelihood: "med", impact: "med", mitigation: "", owner: "", status: "open", taskIds: [] }); setOpen(id); };
  const sorted = [...risks].sort((a, b) => LVL[b.likelihood] * LVL[b.impact] - LVL[a.likelihood] * LVL[a.impact]);

  return (
    <div className="view-scroll">
      <div className="view-pad view-wide">
        <div className="between" style={{ marginBottom: 18 }}>
          <p className="muted" style={{ margin: 0, maxWidth: 520, fontSize: 14, lineHeight: 1.55 }}>
            Active risk register, ordered by exposure. Link <b>remediation actions</b> to a risk and it's marked remediated once those tasks are done.
          </p>
          <button className="btn btn-primary no-print" onClick={add}><Icon name="plus" size={15} /> Add risk</button>
        </div>

        <div className="risk-layout">
          <div className="risk-list">
            {sorted.map((r) => {
              const rem = remediation(r, tasks);
              return (
                <div key={r.id} className="risk-card panel" onClick={() => setOpen(r.id)}>
                  <div className="risk-score" style={{ background: scoreColor(r.likelihood, r.impact) }}>{LVL[r.likelihood] * LVL[r.impact]}</div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="risk-title">{r.title}</div>
                    <p className="risk-mit">{r.mitigation || "No mitigation yet."}</p>
                    <div className="risk-meta">
                      <span className="chip" style={{ "--chip-c": RISK_STATUS[r.status]?.c }}><span className="chip-dot" />{RISK_STATUS[r.status]?.label}</span>
                      <span className="mono muted" style={{ fontSize: 11.5 }}>L:{LVL_LABEL[r.likelihood]} · I:{LVL_LABEL[r.impact]}</span>
                      {r.owner && <span className="muted" style={{ fontSize: 12.5 }}><Icon name="users" size={12} style={{ verticalAlign: -2 }} /> {r.owner}</span>}
                    </div>
                    {rem.state !== "none" && (
                      <div className="remed-row">
                        <span className="remed-chip" style={{ "--rc": REMED[rem.state].c }}>
                          {rem.state === "remediated" ? <Icon name="check" size={12} /> : <Icon name="shield" size={12} />}
                          {REMED[rem.state].label}
                        </span>
                        <div className="remed-bar"><div className="remed-fill" style={{ width: (rem.done / rem.total * 100) + "%", background: REMED[rem.state].c }} /></div>
                        <span className="mono muted" style={{ fontSize: 11 }}>{rem.done}/{rem.total} done</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="risk-side">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Likelihood × Impact</div>
            <Heatmap risks={risks} onOpen={setOpen} />
            <div className="heat-legend">
              <span><i style={{ background: "var(--t-green)" }} /> Low</span>
              <span><i style={{ background: "var(--t-amber)" }} /> Medium</span>
              <span><i style={{ background: "var(--t-red)" }} /> High</span>
            </div>
          </div>
        </div>
      </div>
      {open && <RiskModal id={open} onClose={() => setOpen(null)} onDelete={() => { setDel(open); setOpen(null); }} />}
      {del && <UI.Confirm title="Delete risk?" body="This removes the risk from the register." onConfirm={() => Store.remove("risks", del)} onClose={() => setDel(null)} />}
    </div>
  );
}

function Heatmap({ risks, onOpen }) {
  const cells = [];
  for (let imp = 3; imp >= 1; imp--) {
    for (let lik = 1; lik <= 3; lik++) {
      const here = risks.filter((r) => LVL[r.likelihood] === lik && LVL[r.impact] === imp);
      const lk = Object.keys(LVL).find((k) => LVL[k] === lik), ik = Object.keys(LVL).find((k) => LVL[k] === imp);
      cells.push(
        <div key={lik + "-" + imp} className="heat-cell" style={{ background: "color-mix(in oklch, " + scoreColor(lk, ik) + " 16%, var(--panel))" }}>
          {here.map((r) => (<span key={r.id} className="heat-dot" style={{ background: scoreColor(r.likelihood, r.impact) }} title={r.title} onClick={() => onOpen(r.id)} />))}
        </div>
      );
    }
  }
  return (<div className="heat"><div className="heat-ylabel">Impact →</div><div className="heat-grid">{cells}</div><div className="heat-xlabel">Likelihood →</div></div>);
}

function RiskModal({ id, onClose, onDelete }) {
  const { tasks } = Store.useStore();
  const r = Store.getState().risks.find((x) => x.id === id);
  if (!r) return null;
  const set = (c) => Store.patch("risks", id, c);
  const rem = remediation(r, tasks);
  const toggleTask = (tid) => { const cur = r.taskIds || []; set({ taskIds: cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid] }); };
  const linkedIds = r.taskIds || [];

  return (
    <UI.Modal onClose={onClose}>
      <div className="modal-hd">
        <UI.Editable className="cm-title" style={{ fontSize: 20 }} multiline value={r.title} onChange={(v) => set({ title: v || "Untitled risk" })} placeholder="Risk title" />
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        <div className="cm-grid">
          <div>
            <div className="cm-section">
              <div className="field-label">Mitigation plan</div>
              <UI.Editable className="input" tag="div" multiline value={r.mitigation} style={{ minHeight: 80, lineHeight: 1.55 }} onChange={(v) => set({ mitigation: v })} placeholder="How will this be prevented or contained?" />
            </div>
            <div className="cm-section">
              <div className="between" style={{ marginBottom: 8 }}>
                <div className="field-label" style={{ margin: 0 }}>Remediation actions</div>
                {rem.state !== "none" && <span className="remed-chip" style={{ "--rc": REMED[rem.state].c }}>{rem.state === "remediated" ? <Icon name="check" size={12} /> : <Icon name="shield" size={12} />}{REMED[rem.state].label}</span>}
              </div>
              <p className="muted" style={{ fontSize: 12.5, margin: "0 0 8px", lineHeight: 1.5 }}>Tie this risk to the tasks that actively reduce it. It becomes <b>Remediated</b> when all linked tasks are Done.</p>
              <div className="prod-tasklist">
                {tasks.length === 0 && <div className="act-empty">No tasks in this project yet.</div>}
                {tasks.map((t) => (
                  <button key={t.id} className={"prod-taskopt" + (linkedIds.includes(t.id) ? " on" : "")} onClick={() => toggleTask(t.id)}>
                    <span className={"checkbox" + (linkedIds.includes(t.id) ? " on" : "")}>{linkedIds.includes(t.id) && <Icon name="check" size={11} />}</span>
                    <span className="grow" style={{ textAlign: "left" }}>{t.title}</span>
                    <span className={"status-dot s-" + t.status} title={t.status} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="cm-side">
            <div><div className="field-label">Likelihood</div><Seg value={r.likelihood} options={LVL_LABEL} onChange={(v) => set({ likelihood: v })} /></div>
            <div><div className="field-label">Impact</div><Seg value={r.impact} options={LVL_LABEL} onChange={(v) => set({ impact: v })} /></div>
            <div><div className="field-label">Exposure</div>
              <div className="risk-expo" style={{ background: scoreColor(r.likelihood, r.impact) }}>{LVL[r.likelihood] * LVL[r.impact]}<span>/ 9</span></div>
            </div>
            <div><div className="field-label">Status</div>
              <div className="statusseg" style={{ flexWrap: "wrap" }}>{Object.entries(RISK_STATUS).map(([k, v]) => (<button key={k} className={r.status === k ? "on" : ""} style={{ "--prio-c": v.c, flex: "1 0 30%" }} onClick={() => set({ status: k })}>{v.label}</button>))}</div>
            </div>
            <div><div className="field-label">Owner</div><UI.Editable className="input" value={r.owner} onChange={(v) => set({ owner: v })} placeholder="Who owns this?" /></div>
          </div>
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn btn-ghost btn-danger" onClick={onDelete}><Icon name="trash" size={15} /> Delete</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </UI.Modal>
  );
}

Object.assign(window, { Risks, LVL, LVL_LABEL, RISK_STATUS, scoreColor, remediation, REMED });


// ======== preanalysis.jsx ========
/* ============================================================
   PRE-ANALYSIS — early research findings
   Exposes window.PreAnalysis
   ============================================================ */
const { useState: useP } = React;

function PreAnalysis() {
  const { findings, categories } = Store.useStore();
  const [filter, setFilter] = useP(null);
  const [del, setDel] = useP(null);

  const add = () => {
    Store.add("findings", { id: Store.uid("f"), title: "New finding", summary: "", category: null, source: "" });
  };
  const shown = filter ? findings.filter((f) => f.category === filter) : findings;

  return (
    <div className="view-scroll">
      <div className="view-pad view-wide">
        <section className="prean-asis">
          <div className="between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 className="scope-h serif" style={{ margin: "0 0 3px" }}>As-is assessment</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, maxWidth: 560 }}>
                Capture the current state for each area you're studying. The <b>to-be</b> target is added later on the Scope page and in the Business case — they share this same table.
              </p>
            </div>
          </div>
          <AssessmentTable mode="asis" />
        </section>

        <div className="prean-divider" />

        <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 className="scope-h serif" style={{ margin: "0 0 3px" }}>Findings</h2>
            <p className="muted" style={{ margin: 0, maxWidth: 520, fontSize: 13.5, lineHeight: 1.5 }}>
              Evidence gathered during discovery. These findings shaped the scope, the architecture and the business case.
            </p>
          </div>
          <button className="btn btn-primary no-print" onClick={add}><Icon name="plus" size={15} /> Add finding</button>
        </div>

        <div className="filter-pills no-print" style={{ marginBottom: 20 }}>
          <button className={"fpill" + (!filter ? " on" : "")} style={{ "--t-var": "var(--accent)" }} onClick={() => setFilter(null)}>All</button>
          {categories.map((c) => (
            <button key={c.id} className={"fpill" + (filter === c.id ? " on" : "")} style={{ "--t-var": "var(--t-" + c.color + ")" }} onClick={() => setFilter(filter === c.id ? null : c.id)}>
              <span className="chip-dot" style={{ background: "var(--t-" + c.color + ")" }} />{c.label}
            </button>
          ))}
        </div>

        <div className="find-grid">
          {shown.map((f, i) => {
            const cat = categories.find((c) => c.id === f.category);
            return (
              <article key={f.id} className="find-card panel">
                <div className="find-num mono">{String(i + 1).padStart(2, "0")}</div>
                <div className="find-body">
                  <div className="find-cat-row">
                    <PickInline options={categories} value={f.category} onChange={(v) => Store.patch("findings", f.id, { category: v })} />
                    <button className="btn btn-icon btn-ghost btn-danger no-print" style={{ marginLeft: "auto" }} onClick={() => setDel(f.id)}><Icon name="trash" size={14} /></button>
                  </div>
                  <UI.Editable className="find-title serif" multiline value={f.title} onChange={(v) => Store.patch("findings", f.id, { title: v || "Untitled finding" })} placeholder="Finding headline" />
                  <UI.Editable className="find-summary" tag="div" multiline value={f.summary} onChange={(v) => Store.patch("findings", f.id, { summary: v })} placeholder="What did the research show, and why does it matter?" />
                  <div className="find-source">
                    <Icon name="search" size={13} />
                    <UI.Editable tag="span" className="mono" value={f.source} onChange={(v) => Store.patch("findings", f.id, { source: v })} placeholder="source" />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {shown.length === 0 && <div className="empty"><div className="serif">No findings here</div>Try a different category or add one.</div>}
      </div>
      {del && <UI.Confirm title="Delete finding?" body="This removes the research finding." onConfirm={() => Store.remove("findings", del)} onClose={() => setDel(null)} />}
    </div>
  );
}

Object.assign(window, { PreAnalysis });


// ======== orgchart.jsx ========
/* ============================================================
   ORG CHART — free-positioned roles, drag-to-connect lines,
   floating (unattached) roles. Exposes window.OrgChart
   ============================================================ */
const { useState: useO, useRef: useOR, useMemo: useOM, useEffect: useOE } = React;

const NODEW = 192, NODEH = 96, HGAP = 48, VGAP = 96, GRID = 96;
const ORG_ACCENTS = ["purple", "indigo", "blue", "teal", "green", "amber", "pink", "red"];

/* tidy-tree fallback positions for nodes that have never been placed */
function autoLayout(nodes) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots = [];
  nodes.forEach((n) => { if (n.parent && byId[n.parent]) byId[n.parent].children.push(byId[n.id]); else roots.push(byId[n.id]); });
  let leaf = 0;
  const place = (node, depth) => {
    node.depth = depth;
    if (!node.children.length) { node.ax = leaf * (NODEW + HGAP); leaf++; }
    else { node.children.forEach((c) => place(c, depth + 1)); node.ax = (node.children[0].ax + node.children[node.children.length - 1].ax) / 2; }
    node.ay = depth * (NODEH + VGAP);
  };
  roots.forEach((r) => { place(r, 0); leaf += 1; });
  return byId;
}

function descendantsOf(nodes, id) {
  const out = new Set([id]); let added = true;
  while (added) { added = false; nodes.forEach((n) => { if (n.parent && out.has(n.parent) && !out.has(n.id)) { out.add(n.id); added = true; } }); }
  return out;
}

function OrgChart() {
  const { org, members } = Store.useStore();
  const wrapRef = useOR(null);
  const [del, setDel] = useO(null);
  const [showMemberMenu, setShowMemberMenu] = useO(false);
  const [live, setLive] = useO(null);       // {id,x,y} while moving
  const [link, setLink] = useO(null);        // {id, x, y, target} while connecting
  const PAD = 40;

  // one-time: give every node a concrete position (tidy tree) so dragging is predictable
  useOE(() => {
    if (org.length && org.some((n) => n.x == null || n.y == null)) {
      const byId = autoLayout(org);
      Store.setState((s) => ({ ...s, org: s.org.map((n) => {
        if (n.x != null && n.y != null) return n;
        const ax = byId[n.id].ax || 0, ay = byId[n.id].ay || 0;
        return { ...n, x: Math.round(ax / GRID) * GRID, y: Math.round(ay / GRID) * GRID };
      }) }));
    }
  }, [org]);

  const posOf = (n) => (live && live.id === n.id ? { x: live.x, y: live.y } : { x: n.x || 0, y: n.y || 0 });
  const bounds = useOM(() => {
    let w = 600, h = 360;
    org.forEach((n) => { const p = posOf(n); w = Math.max(w, p.x + NODEW); h = Math.max(h, p.y + NODEH); });
    return { w: w + PAD * 2, h: h + PAD * 2 };
  }, [org, live]);

  const canvasXY = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left + wrapRef.current.scrollLeft - PAD, y: e.clientY - r.top + wrapRef.current.scrollTop - PAD };
  };

  /* ---- move a card freely ---- */
  const moveRef = useOR(null);
  const startMove = (e, n) => {
    e.preventDefault(); e.stopPropagation();
    const c = canvasXY(e); const p = posOf(n);
    moveRef.current = { id: n.id, ox: c.x - p.x, oy: c.y - p.y, moved: false };
    setLive({ id: n.id, x: p.x, y: p.y });
    window.addEventListener("pointermove", onMoveMove);
    window.addEventListener("pointerup", onMoveUp);
  };
  const onMoveMove = (e) => {
    const m = moveRef.current; if (!m) return;
    const c = canvasXY(e);
    m.moved = true;
    // snap live preview to the grid so it feels firm while dragging
    m.lastX = Math.max(0, Math.round((c.x - m.ox) / GRID) * GRID);
    m.lastY = Math.max(0, Math.round((c.y - m.oy) / GRID) * GRID);
    setLive({ id: m.id, x: m.lastX, y: m.lastY });
  };
  const onMoveUp = () => {
    window.removeEventListener("pointermove", onMoveMove);
    window.removeEventListener("pointerup", onMoveUp);
    const m = moveRef.current; moveRef.current = null;
    if (m && m.moved && m.lastX != null) {
      const gx = Math.max(0, Math.round(m.lastX / GRID) * GRID);
      const gy = Math.max(0, Math.round(m.lastY / GRID) * GRID);
      Store.patch("org", m.id, { x: gx, y: gy });
    }
    setLive(null);
  };

  /* ---- drag-to-connect a reporting line ---- */
  const linkRef = useOR(null);
  const startLink = (e, n) => {
    e.preventDefault(); e.stopPropagation();
    const c = canvasXY(e);
    linkRef.current = { id: n.id, blocked: descendantsOf(org, n.id) };
    setLink({ id: n.id, x: c.x, y: c.y, target: null });
    window.addEventListener("pointermove", onLinkMove);
    window.addEventListener("pointerup", onLinkUp);
  };
  const onLinkMove = (e) => {
    const l = linkRef.current; if (!l) return;
    const c = canvasXY(e);
    let target = null;
    for (const n of org) {
      if (l.blocked.has(n.id)) continue;
      const p = posOf(n);
      if (c.x >= p.x && c.x <= p.x + NODEW && c.y >= p.y && c.y <= p.y + NODEH) { target = n.id; break; }
    }
    l.target = target;
    setLink({ id: l.id, x: c.x, y: c.y, target });
  };
  const onLinkUp = () => {
    window.removeEventListener("pointermove", onLinkMove);
    window.removeEventListener("pointerup", onLinkUp);
    const l = linkRef.current; linkRef.current = null;
    if (l) Store.patch("org", l.id, { parent: l.target || null });  // target → attach, empty → float
    setLink(null);
  };

  const addRole = (parentId) => {
    const id = Store.uid("o");
    let x, y;
    if (parentId) {
      // place directly below the parent, snapped to grid
      const parent = org.find((n) => n.id === parentId);
      if (parent) {
        const parentX = Math.round((parent.x || 0) / GRID) * GRID;
        const parentY = Math.round((parent.y || 0) / GRID) * GRID;
        const childYRaw = parentY + NODEH + VGAP;
        const childY = Math.round(childYRaw / GRID) * GRID;
        // find an x slot that's free at this y: try centered first, then walk outward
        const siblings = org.filter((n) => n.parent === parentId);
        const taken = new Set(siblings.map((s) => Math.round((s.x || 0) / GRID) * GRID));
        const step = Math.ceil((NODEW + HGAP) / GRID) * GRID;
        const candidates = [parentX];
        for (let i = 1; i < 16; i++) { candidates.push(parentX + i * step); candidates.push(parentX - i * step); }
        const slot = candidates.find((c) => !taken.has(c) && c >= 0) ?? parentX;
        x = slot; y = childY;
      } else {
        x = 0; y = 0;
      }
    } else {
      // floating role: drop at scroll position, snapped
      const sxRaw = (wrapRef.current?.scrollLeft || 0) + 30;
      const syRaw = (wrapRef.current?.scrollTop || 0) + 30;
      x = Math.max(0, Math.round(sxRaw / GRID) * GRID);
      y = Math.max(0, Math.round(syRaw / GRID) * GRID);
    }
    Store.add("org", { id, name: "New role", role: "", parent: parentId || null, note: "", accent: ORG_ACCENTS[org.length % ORG_ACCENTS.length], x, y });
  };
  const removeNode = (id) => {
    const node = org.find((n) => n.id === id);
    Store.setState((s) => ({ ...s, org: s.org.filter((n) => n.id !== id).map((n) => n.parent === id ? { ...n, parent: node.parent } : n) }));
  };
  const addMemberNode = (m) => {
    const id = Store.uid("o");
    const sx = (wrapRef.current?.scrollLeft || 0) + 30, sy = (wrapRef.current?.scrollTop || 0) + 30;
    Store.add("org", { id, name: m.name, role: m.role || "", parent: null, note: "", accent: m.color || ORG_ACCENTS[org.length % ORG_ACCENTS.length], x: sx, y: sy });
    setShowMemberMenu(false);
  };

  // shared horizontal trunk per parent: each parent's children share one horizontal line
  // drawn at a fixed offset below the parent's bottom edge.
  const TRUNK_OFFSET = 36;
  const connPoint = (n, which) => { const p = posOf(n); return which === "bottom" ? { x: p.x + NODEW / 2, y: p.y + NODEH } : { x: p.x + NODEW / 2, y: p.y }; };
  // build per-parent trunk paths (one combined SVG path each)
  const trunkPaths = useOM(() => {
    const byParent = new Map();
    org.forEach((n) => {
      if (!n.parent) return;
      const p = org.find((x) => x.id === n.parent); if (!p) return;
      if (!byParent.has(p.id)) byParent.set(p.id, { parent: p, children: [] });
      byParent.get(p.id).children.push(n);
    });
    const paths = [];
    byParent.forEach(({ parent, children }) => {
      const a = connPoint(parent, "bottom");
      const trunkY = a.y + TRUNK_OFFSET;
      const stemX = a.x;
      const childPoints = children.map((c) => connPoint(c, "top"));
      const leftX = Math.min(stemX, ...childPoints.map((p) => p.x));
      const rightX = Math.max(stemX, ...childPoints.map((p) => p.x));
      let d = `M${stemX + PAD},${a.y + PAD} V${trunkY + PAD}`;
      if (leftX !== rightX) d += ` M${leftX + PAD},${trunkY + PAD} H${rightX + PAD}`;
      childPoints.forEach((cp) => { d += ` M${cp.x + PAD},${trunkY + PAD} V${cp.y + PAD}`; });
      paths.push({ key: parent.id, d, color: "var(--t-" + (parent.accent || "indigo") + ")" });
    });
    return paths;
  }, [org, live, PAD]);

  return (
    <div className="view-scroll">
      <div className="view-pad">
        <div className="between" style={{ marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <p className="muted" style={{ margin: 0, maxWidth: 600, fontSize: 14, lineHeight: 1.55 }}>
            Drag the <b>move grip</b> to place any role anywhere. Drag the <b>link handle</b> onto another role to set who it reports to — or drop it on empty space to leave it <b>floating</b> (reports to no one). Click text to edit.
          </p>
          <div className="row no-print" style={{ gap: 8 }}>
            <div className="tagpicker" style={{ position: "relative" }}>
              <button className="btn" onClick={() => setShowMemberMenu((v) => !v)}><Icon name="users" size={15} /> Add member</button>
              {showMemberMenu && (
                <div className="tagpicker-menu panel" style={{ right: 0, left: "auto", minWidth: 220, maxHeight: 320, overflowY: "auto" }}>
                  <div className="dep-menu-label">Members not yet on the chart</div>
                  {(members || []).filter((m) => !org.some((o) => o.name === m.name)).map((m) => (
                    <button key={m.id} className="tagpicker-opt" onClick={() => addMemberNode(m)}>
                      <span className="avatar" style={{ width: 20, height: 20, fontSize: 9, background: "var(--t-" + (m.color || "indigo") + ")" }}>{initials(m.name)}</span>
                      <span className="grow">{m.name}{m.role ? " · " + m.role : ""}</span>
                    </button>
                  ))}
                  {(members || []).filter((m) => !org.some((o) => o.name === m.name)).length === 0 && <div className="dep-menu-empty">Everyone is already on the chart.</div>}
                </div>
              )}
            </div>
            <button className="btn" onClick={() => addRole(null)}><Icon name="plus" size={15} /> Add floating role</button>
          </div>
        </div>

        <div className="org-wrap panel" ref={wrapRef}>
          <div className="org-canvas org-grid" style={{ width: bounds.w, height: bounds.h }}>
            <svg className="org-lines" width={bounds.w} height={bounds.h}>
              {trunkPaths.map((p) => <path key={p.key} d={p.d} className="org-line" stroke={p.color} />)}
              {link && (() => {
                const src = org.find((x) => x.id === link.id); if (!src) return null;
                const a = connPoint(src, "bottom");
                const b = { x: link.x - NODEW / 2, y: link.y };
                const trunkY = a.y + TRUNK_OFFSET;
                return <path d={`M${a.x + PAD},${a.y + PAD} V${trunkY + PAD} H${b.x + PAD} V${b.y + PAD}`} className="org-line live" />;
              })()}
            </svg>
            {org.map((n) => {
              const p = posOf(n);
              const floating = !n.parent && !org.some((c) => c.parent === n.id);
              return (
                <div key={n.id}
                  className={"org-node" + (link?.target === n.id ? " target" : "") + (live?.id === n.id ? " moving" : "") + (floating ? " floating" : "")}
                  style={{ left: p.x + PAD, top: p.y + PAD, width: NODEW, "--node-c": "var(--t-" + (n.accent || "indigo") + ")" }}>
                  <div className="org-node-bar" />
                  <div className="org-node-hd">
                    <span className="org-grip" onPointerDown={(e) => startMove(e, n)} title="Drag to move"><Icon name="drag" size={15} /></span>
                    {floating && <span className="org-float-tag mono">floating</span>}
                    <div className="org-actions no-print">
                      <button className="org-act" title="Add report under this role" onClick={() => addRole(n.id)}><Icon name="plus" size={13} /></button>
                      <button className="org-act" title="Remove" onClick={() => setDel(n.id)}><Icon name="x" size={13} /></button>
                    </div>
                  </div>
                  <UI.Editable className="org-name" value={n.name} onChange={(v) => Store.patch("org", n.id, { name: v || "Unnamed" })} placeholder="Name" />
                  <UI.Editable className="org-role" value={n.role} onChange={(v) => Store.patch("org", n.id, { role: v })} placeholder="Role" />
                  <UI.Editable className="org-note" value={n.note} onChange={(v) => Store.patch("org", n.id, { note: v })} placeholder="responsibility…" />
                  <span className="org-link no-print" onPointerDown={(e) => startLink(e, n)} title="Drag onto a role to set who this reports to (or drop on empty to float)">
                    <Icon name="link" size={13} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {del && <UI.Confirm title="Remove this role?" body="Any direct reports move up to this role's manager (or become floating)." confirmLabel="Remove" onConfirm={() => removeNode(del)} onClose={() => setDel(null)} />}
    </div>
  );
}

Object.assign(window, { OrgChart });


// ======== catalogue.jsx ========
/* ============================================================
   PRODUCT CATALOGUE — local uploads + external shared-drive links
   Exposes window.Catalogue
   ============================================================ */
const { useState: useC, useEffect: useCE, useRef: useCR } = React;

const TYPE_FROM = (file) => {
  const n = (file.name || "").toLowerCase(), t = file.type || "";
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (/\.(xlsx|xls|csv)$/.test(n) || t.includes("spreadsheet")) return "excel";
  if (/\.(pptx|ppt|key)$/.test(n) || t.includes("presentation")) return "slides";
  if (/\.(docx|doc|txt|md|rtf)$/.test(n) || t.includes("word")) return "doc";
  return "doc";
};
const TYPE_ICON = { image: "image", pdf: "doc", excel: "sheet", slides: "slides", doc: "file" };
const TYPE_LABEL = { image: "Image", pdf: "PDF", excel: "Spreadsheet", slides: "Presentation", doc: "Document" };
const fmtBytes = (b) => !b ? "" : b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB";

function FileThumb({ product }) {
  const [url, setUrl] = useC(null);
  useCE(() => {
    let u;
    if (product.fileId && product.type === "image") {
      Store.files.get(product.fileId).then((blob) => { if (blob) { u = URL.createObjectURL(blob); setUrl(u); } });
    }
    return () => u && URL.revokeObjectURL(u);
  }, [product.fileId, product.type]);
  if (url) return <div className="cat-thumb img" style={{ backgroundImage: `url(${url})` }} />;
  const isExt = !!product.externalUrl;
  return (
    <div className={"cat-thumb t-" + product.type}>
      <Icon name={TYPE_ICON[product.type] || "file"} size={30} />
      {product.placeholder && <span className="cat-thumb-ph mono">placeholder</span>}
      {isExt && <span className="cat-thumb-ext mono"><Icon name="link" size={10} /> shared drive</span>}
    </div>
  );
}

function Catalogue() {
  const { products } = Store.useStore();
  const [open, setOpen] = useC(null);
  const [over, setOver] = useC(false);
  const [busy, setBusy] = useC(false);
  const [showAddLink, setShowAddLink] = useC(false);
  const inputRef = useCR(null);

  const ingest = async (files) => {
    setBusy(true);
    for (const file of files) {
      if (file.size > 30 * 1048576) { alert(`"${file.name}" is larger than 30 MB and was skipped.`); continue; }
      const fileId = Store.uid("file");
      try {
        await Store.files.put(fileId, file);
        Store.add("products", {
          id: Store.uid("p"), name: file.name, type: TYPE_FROM(file), fileId,
          size: file.size, taskIds: [], phase: null, date: new Date().toISOString().slice(0, 10), note: "", externalUrl: "",
        });
      } catch (e) { alert("Could not store file (browser storage may be full)."); }
    }
    setBusy(false);
  };
  const onDrop = (e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) ingest([...e.dataTransfer.files]); };

  return (
    <div className="view-scroll">
      <div className="view-pad view-wide">
        <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <p className="muted" style={{ margin: 0, maxWidth: 560, fontSize: 14, lineHeight: 1.55 }}>
            Every deliverable produced by the project. Upload files locally, or <b>link to your shared drive</b> (SharePoint, OneDrive, Google Drive) so the whole team can access them.
          </p>
          <div className="row no-print" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setShowAddLink(true)}><Icon name="link" size={15} /> Link from drive</button>
            <button className="btn btn-primary" onClick={() => inputRef.current.click()}><Icon name="upload" size={15} /> Upload file</button>
          </div>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { ingest([...e.target.files]); e.target.value = ""; }} />
        </div>

        <div className={"cat-drop no-print" + (over ? " over" : "")}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
          onDrop={onDrop} onClick={() => inputRef.current.click()}>
          <Icon name={busy ? "reset" : "upload"} size={22} className={busy ? "spin" : ""} />
          <div><b>{busy ? "Storing…" : "Drop files here"}</b> <span className="muted">or click to browse — PDF, Excel, slides, images (≤30 MB, stored locally)</span></div>
        </div>

        <div className="cat-grid">
          {products.map((p) => (
            <div key={p.id} className="cat-card panel" onClick={() => setOpen(p.id)}>
              <FileThumb product={p} />
              <div className="cat-body">
                <div className="cat-name">{p.name}</div>
                <div className="cat-meta">
                  <span className="chip" style={{ "--chip-c": "var(--t-" + ({ image: "pink", pdf: "red", excel: "green", slides: "amber", doc: "blue" }[p.type] || "blue") + ")" }}>{TYPE_LABEL[p.type]}</span>
                  {p.externalUrl && <span className="chip" style={{ "--chip-c": "var(--t-teal)" }}><Icon name="link" size={10} /> Drive</span>}
                  {p.size && !p.externalUrl ? <span className="muted mono" style={{ fontSize: 11 }}>{fmtBytes(p.size)}</span> : null}
                </div>
                <div className="cat-links">
                  <Icon name="link" size={12} />
                  <span className="muted" style={{ fontSize: 12 }}>{(p.taskIds || []).length} linked action{(p.taskIds || []).length === 1 ? "" : "s"}</span>
                </div>
              </div>
            </div>
          ))}
          {products.length === 0 && <div className="empty" style={{ gridColumn: "1/-1" }}><div className="serif">No deliverables yet</div>Upload a file or link one from your shared drive.</div>}
        </div>
      </div>
      {open && <ProductModal id={open} onClose={() => setOpen(null)} />}
      {showAddLink && <AddLinkModal onClose={() => setShowAddLink(false)} />}
    </div>
  );
}

/* ---------- Add external link modal ---------- */
function AddLinkModal({ onClose }) {
  const [name, setName] = useC("");
  const [url, setUrl] = useC("");
  const [type, setType] = useC("doc");
  const submit = () => {
    Store.add("products", {
      id: Store.uid("p"), name: name.trim() || "Untitled", type,
      fileId: null, size: 0, taskIds: [], phase: null,
      date: new Date().toISOString().slice(0, 10), note: "",
      externalUrl: url.trim(),
    });
    onClose();
  };
  return (
    <UI.Modal narrow onClose={onClose}>
      <div className="modal-hd">
        <div className="grow">
          <div className="cm-title" style={{ fontSize: 20 }}>Link from shared drive</div>
          <div className="muted" style={{ fontSize: 13 }}>Paste a URL from SharePoint, OneDrive, Google Drive, or any web link. The file stays on the drive — Atlas just links to it.</div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        <div className="field-label">File name</div>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Migration Plan v2.xlsx" style={{ marginBottom: 14 }} />
        <div className="field-label">Shared drive URL</div>
        <input className="input mono" style={{ fontSize: 13, marginBottom: 14 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://company.sharepoint.com/…" />
        <div className="field-label">Type</div>
        <div className="wrap">
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <button key={k} className={"fpill" + (type === k ? " on" : "")} style={{ "--t-var": "var(--t-" + ({ image: "pink", pdf: "red", excel: "green", slides: "amber", doc: "blue" }[k] || "blue") + ")" }} onClick={() => setType(k)}>
              <Icon name={TYPE_ICON[k]} size={13} /> {v}
            </button>
          ))}
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn btn-primary" disabled={!url.trim()} onClick={submit}><Icon name="link" size={15} /> Add link</button>
      </div>
    </UI.Modal>
  );
}

/* ---------- Product modal (updated for external links) ---------- */
function ProductModal({ id, onClose }) {
  const { tasks, phases } = Store.useStore();
  const p = Store.getState().products.find((x) => x.id === id);
  const [dlUrl, setDlUrl] = useC(null);
  useCE(() => {
    let u;
    if (p && p.fileId) Store.files.get(p.fileId).then((b) => { if (b) { u = URL.createObjectURL(b); setDlUrl(u); } });
    return () => u && URL.revokeObjectURL(u);
  }, [p?.fileId]);
  if (!p) return null;
  const set = (c) => Store.patch("products", id, c);
  const toggleTask = (tid) => { const cur = p.taskIds || []; set({ taskIds: cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid] }); };
  const isExt = !!p.externalUrl;

  return (
    <UI.Modal onClose={onClose}>
      <div className="modal-hd">
        <div className={"cat-thumb t-" + p.type} style={{ width: 52, height: 52, flex: "0 0 52px", borderRadius: 10 }}>
          <Icon name={TYPE_ICON[p.type] || "file"} size={24} />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <UI.Editable className="cm-title" style={{ fontSize: 20 }} multiline value={p.name} onChange={(v) => set({ name: v || "Untitled" })} placeholder="File name" />
          <div className="muted mono" style={{ fontSize: 12 }}>
            {TYPE_LABEL[p.type]}
            {p.size && !isExt ? " · " + fmtBytes(p.size) : ""}
            {isExt ? " · shared drive link" : ""}
            {p.placeholder ? " · sample placeholder" : ""}
          </div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        {p.type === "image" && dlUrl && <img src={dlUrl} className="cat-preview" alt={p.name} />}

        {isExt && (
          <div style={{ marginBottom: 18 }}>
            <div className="field-label">Shared drive URL</div>
            <div className="cat-exturl">
              <Icon name="link" size={14} />
              <input className="input mono" style={{ fontSize: 12, flex: 1 }} value={p.externalUrl} onChange={(e) => set({ externalUrl: e.target.value })} placeholder="https://…" />
              <a className="btn btn-sm" href={p.externalUrl} target="_blank" rel="noopener noreferrer"><Icon name="arrowR" size={13} /> Open</a>
            </div>
          </div>
        )}

        <div className="field-label">Notes</div>
        <UI.Editable className="input" tag="div" multiline value={p.note} style={{ minHeight: 60, lineHeight: 1.5, marginBottom: 18 }} onChange={(v) => set({ note: v })} placeholder="What is this deliverable?" />
        <div className="row" style={{ gap: 16, marginBottom: 18 }}>
          <div className="grow"><div className="field-label">Phase</div><PickInline options={phases} value={p.phase} onChange={(v) => set({ phase: v })} /></div>
          <div><div className="field-label">Date</div><input className="datemini" type="date" value={p.date || ""} onChange={(e) => set({ date: e.target.value })} /></div>
        </div>
        <div className="field-label">Linked actions</div>
        <div className="prod-tasklist">
          {tasks.map((t) => (
            <button key={t.id} className={"prod-taskopt" + ((p.taskIds || []).includes(t.id) ? " on" : "")} onClick={() => toggleTask(t.id)}>
              <span className={"checkbox" + ((p.taskIds || []).includes(t.id) ? " on" : "")}>{(p.taskIds || []).includes(t.id) && <Icon name="check" size={11} />}</span>
              <span className="grow" style={{ textAlign: "left" }}>{t.title}</span>
              <span className={"status-dot s-" + t.status} />
            </button>
          ))}
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn btn-ghost btn-danger" onClick={() => { if (p.fileId) Store.files.del(p.fileId); Store.remove("products", id); onClose(); }}><Icon name="trash" size={15} /> Delete</button>
        <div className="grow" />
        {isExt && <a className="btn" href={p.externalUrl} target="_blank" rel="noopener noreferrer"><Icon name="arrowR" size={13} /> Open in drive</a>}
        {dlUrl && !isExt && <a className="btn" href={dlUrl} download={p.name}><Icon name="upload" size={15} style={{ transform: "rotate(180deg)" }} /> Download</a>}
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </UI.Modal>
  );
}

Object.assign(window, { Catalogue });


// ======== businesscase.jsx ========
/* ============================================================
   BUSINESS CASE — structured, printable, OPTIONAL sections
   User chooses which sections appear; numbering is dynamic.
   Exposes window.BusinessCase
   ============================================================ */
const { useState: useBC, useMemo: useBCM } = React;

const BC_SECTIONS = [
  { id: "situation", label: "Situation, challenges & opportunities" },
  { id: "risks", label: "Key risks" },
  { id: "outcomes", label: "Desired outcome & effects" },
  { id: "scope", label: "Scope" },
  { id: "asis", label: "As-is / To-be" },
  { id: "financial", label: "Financial justification" },
];
const ALL_IDS = BC_SECTIONS.map((s) => s.id);

function BusinessCase({ go }) {
  const s = Store.useStore();
  const bc = s.businessCase;
  const set = (c) => Store.setState((st) => ({ ...st, businessCase: { ...st.businessCase, ...c } }));
  const setList = (key, i, v) => set({ [key]: bc[key].map((x, idx) => (idx === i ? v : x)) });
  const addOutcome = () => set({ outcomes: [...(bc.outcomes || []), "New intended outcome"] });
  const removeOutcome = (i) => set({ outcomes: bc.outcomes.filter((_, idx) => idx !== i) });

  // which sections are active — stored alongside the BC
  const active = Array.isArray(bc._sections) ? bc._sections : ALL_IDS;
  const setActive = (ids) => set({ _sections: ids });
  const isOn = (id) => active.includes(id);
  const toggle = (id) => {
    if (isOn(id)) setActive(active.filter((x) => x !== id));
    else {
      // insert in canonical order
      const next = ALL_IDS.filter((x) => active.includes(x) || x === id);
      setActive(next);
    }
  };

  // dynamic numbering for active sections
  const num = useBCM(() => {
    const m = {}; let n = 1;
    ALL_IDS.forEach((id) => { if (active.includes(id)) { m[id] = n++; } });
    return m;
  }, [active]);

  const inactive = BC_SECTIONS.filter((s) => !isOn(s.id));

  const Persp = ({ k, label }) => (
    <div className="bc-persp">
      <div className="bc-persp-label">{label}</div>
      <UI.Editable className="bc-persp-text" tag="div" multiline value={bc[k]} onChange={(v) => set({ [k]: v })} placeholder="…" />
    </div>
  );
  const Effect = ({ k, label, hint }) => (
    <div className="bc-effect">
      <div className="bc-effect-hd">{label}</div>
      <div className="bc-effect-hint">{hint}</div>
      <UI.Editable className="bc-effect-text" tag="div" multiline value={bc[k]} onChange={(v) => set({ [k]: v })} placeholder="…" />
    </div>
  );
  const SectionRemove = ({ id }) => (
    <button className="btn btn-icon btn-ghost btn-danger no-print bc-remove" title="Remove this section" onClick={() => toggle(id)}><Icon name="x" size={15} /></button>
  );

  return (
    <div className="view-scroll">
      <div className="bc-doc">
        <header className="bc-head">
          <div className="bc-eyebrow eyebrow">Business Case</div>
          <UI.Editable className="bc-title serif" multiline value={s.meta?.project} onChange={(v) => Store.setState((st) => ({ ...st, meta: { ...st.meta, project: v } }))} />
          <div className="bc-byline mono">Prepared for the steering committee · Confidential</div>
        </header>

        {isOn("situation") && (
          <section className="bc-section">
            <div className="bc-section-hd">
              <h2 className="bc-h2 serif">{num.situation} · Situation, challenges & opportunities</h2>
              <SectionRemove id="situation" />
            </div>
            <div className="bc-why">Why are we doing this? Why does it matter?</div>
            <UI.Editable className="bc-lead" tag="p" multiline value={bc.purpose} onChange={(v) => set({ purpose: v })} placeholder="Summarise the core reason this project exists." />
            <div className="bc-sub">Seen from each perspective</div>
            <div className="bc-persp-grid">
              <Persp k="perspOurs" label="Ours" />
              <Persp k="perspUsers" label="Users" />
              <Persp k="perspStakeholders" label="Other stakeholders" />
            </div>
            <div className="bc-twocol">
              <div>
                <div className="bc-sub"><Icon name="warn" size={14} /> Situations that create or worsen it</div>
                <UI.Editable className="bc-body" tag="p" multiline value={bc.worsening} onChange={(v) => set({ worsening: v })} placeholder="What makes the challenge harder or more urgent?" />
              </div>
              <div>
                <div className="bc-sub"><Icon name="bulb" size={14} /> Opportunities we can leverage</div>
                <UI.Editable className="bc-body" tag="p" multiline value={bc.opportunities} onChange={(v) => set({ opportunities: v })} placeholder="What can we take advantage of?" />
              </div>
            </div>
          </section>
        )}

        {isOn("risks") && (
          <section className="bc-section">
            <div className="bc-section-hd">
              <h2 className="bc-h2 serif">{num.risks} · Project key risks</h2>
              <SectionRemove id="risks" />
            </div>
            <p className="bc-why" style={{ marginBottom: 14 }}>Pulled live from the Risks & mitigation register.</p>
            <RisksEmbed go={go} />
          </section>
        )}

        {isOn("outcomes") && (
          <section className="bc-section">
            <div className="bc-section-hd">
              <h2 className="bc-h2 serif">{num.outcomes} · Desired outcome & effects</h2>
              <SectionRemove id="outcomes" />
            </div>
            <div className="bc-why">What does good look like? What tangible changes should we observe if this succeeds?</div>
            <ul className="bc-outcomes">
              {(bc.outcomes || []).map((o, i) => (
                <li key={i}>
                  <span className="bc-bullet"><Icon name="target" size={15} /></span>
                  <UI.Editable tag="span" className="grow" multiline value={o} onChange={(v) => setList("outcomes", i, v)} />
                  <button className="btn btn-icon btn-ghost btn-danger no-print" onClick={() => removeOutcome(i)}><Icon name="x" size={13} /></button>
                </li>
              ))}
            </ul>
            <button className="btn btn-sm btn-ghost no-print" onClick={addOutcome}><Icon name="plus" size={13} /> Add outcome / KPI</button>
            <div className="bc-effects">
              <Effect k="effProcess" label="Process" hint="What process changes are needed? New process, QMS / Cortex document?" />
              <Effect k="effSystem" label="System" hint="What system changes or functionalities? Which tools & templates?" />
              <Effect k="effBehaviour" label="Behaviour" hint="What should target users & key roles do, or be able to do?" />
              <Effect k="effLeadership" label="Leadership & Organisation" hint="Changes to leadership, structure, roles & training to succeed." />
            </div>
          </section>
        )}

        {isOn("scope") && (
          <section className="bc-section">
            <div className="bc-section-hd">
              <h2 className="bc-h2 serif">{num.scope} · Scope</h2>
              <SectionRemove id="scope" />
            </div>
            <div className="bc-why">What's within the boundary, and what's explicitly outside?</div>
            <ScopeBoundaries compact />
            <button className="btn btn-sm no-print" style={{ marginTop: 12 }} onClick={() => go && go("scope")}><Icon name="scope" size={14} /> Open the Scope page</button>
          </section>
        )}

        {isOn("asis") && (
          <section className="bc-section">
            <div className="bc-section-hd">
              <h2 className="bc-h2 serif">{num.asis} · As-is / To-be</h2>
              <SectionRemove id="asis" />
            </div>
            <div className="bc-why">Where we are today, and the target state once delivered. Tied to the scope above.</div>
            <AssessmentTable mode="full" />
          </section>
        )}

        {isOn("financial") && (
          <section className="bc-section">
            <div className="bc-section-hd">
              <h2 className="bc-h2 serif">{num.financial} · Financial justification</h2>
              <SectionRemove id="financial" />
            </div>
            <div className="bc-fin">
              {bc.financial.map((f, i) => (
                <div key={i} className="bc-fin-cell">
                  <div className="bc-fin-label">{f.label}</div>
                  <UI.Editable className="bc-fin-value serif" value={f.value} onChange={(v) => setList("financial", i, { ...f, value: v })} placeholder="—" />
                  <div className="bc-fin-note muted">{f.note}</div>
                </div>
              ))}
            </div>
            <UI.Editable className="bc-body" tag="p" multiline value={bc.justification} style={{ marginTop: 18 }} onChange={(v) => set({ justification: v })} placeholder="Why is this the right investment?" />
          </section>
        )}

        {/* add-section bar for inactive ones */}
        {inactive.length > 0 && (
          <div className="bc-add-bar no-print">
            <div className="bc-add-label">Add a section</div>
            <div className="bc-add-pills">
              {inactive.map((sec) => (
                <button key={sec.id} className="bc-add-pill" onClick={() => toggle(sec.id)}>
                  <Icon name="plus" size={13} /> {sec.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <footer className="bc-foot no-print">
          <button className="btn btn-dark" onClick={() => window.print()}><Icon name="print" size={15} /> Print / Save as PDF</button>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { BusinessCase });


// ======== scope.jsx ========
/* ============================================================
   SCOPE — boundaries + shared As-is/To-be assessment
   Exposes window.ScopePage, window.ScopeBoundaries,
           window.AssessmentTable, window.RisksEmbed
   ============================================================ */
const { useState: useSc } = React;

/* ---------- scope boundaries (in / out) ---------- */
function ScopeBoundaries({ compact }) {
  const s = Store.useStore();
  const scope = s.scope || { inScope: [], outScope: [] };
  const setScope = (c) => Store.setState((st) => ({ ...st, scope: { ...(st.scope || { inScope: [], outScope: [] }), ...c } }));
  const addItem = (key) => setScope({ [key]: [...(scope[key] || []), "New item"] });
  const setItem = (key, i, v) => setScope({ [key]: scope[key].map((x, idx) => (idx === i ? v : x)) });
  const rmItem = (key, i) => setScope({ [key]: scope[key].filter((_, idx) => idx !== i) });

  const Col = ({ side, label, icon, items }) => (
    <div className={"scope-col " + side}>
      <div className="scope-col-hd">
        <span className="scope-col-ico"><Icon name={icon} size={15} /></span>
        <span className="scope-col-label">{label}</span>
        <span className="scope-col-n mono">{items.length}</span>
      </div>
      <div className="scope-items">
        {items.length === 0 && <div className="scope-empty">Nothing listed yet.</div>}
        {items.map((it, i) => (
          <div className="scope-item" key={i}>
            <span className="scope-bullet" />
            <UI.Editable className="scope-item-text" tag="div" multiline value={it} onChange={(v) => setItem(side === "in" ? "inScope" : "outScope", i, v)} placeholder="Describe a boundary item…" />
            <button className="chip-x no-print" onClick={() => rmItem(side === "in" ? "inScope" : "outScope", i)}><Icon name="x" size={12} /></button>
          </div>
        ))}
        <button className="scope-add no-print" onClick={() => addItem(side === "in" ? "inScope" : "outScope")}><Icon name="plus" size={13} /> Add</button>
      </div>
    </div>
  );

  return (
    <div className={"scope-grid" + (compact ? " compact" : "")}>
      <Col side="in" label="In scope" icon="check" items={scope.inScope || []} />
      <Col side="out" label="Out of scope" icon="x" items={scope.outScope || []} />
    </div>
  );
}

/* ---------- shared As-is / To-be assessment ---------- */
function AssessmentTable({ mode = "full", title }) {
  const s = Store.useStore();
  const rows = s.assessment || [];
  const setRows = (fn) => Store.setState((st) => ({ ...st, assessment: fn(st.assessment || []) }));
  const add = () => setRows((r) => [...r, { id: Store.uid("as"), area: "New area", asIs: "", toBe: "" }]);
  const patch = (id, c) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...c } : x)));
  const rm = (id) => setRows((r) => r.filter((x) => x.id !== id));
  const full = mode === "full";

  return (
    <div className="asis">
      <div className={"asis-head" + (full ? " full" : "")}>
        <div className="asis-h">Area</div>
        <div className="asis-h">As-is <span className="asis-h-sub">today</span></div>
        {full && <div className="asis-h tobe">To-be <span className="asis-h-sub">target</span></div>}
        <div />
      </div>
      {rows.length === 0 && <div className="asis-empty">No assessment areas yet. Add the dimensions you want to compare current vs. target state.</div>}
      {rows.map((row) => (
        <div className={"asis-row" + (full ? " full" : "")} key={row.id}>
          <div className="asis-area">
            <span className="asis-area-bar" />
            <UI.Editable className="asis-area-text" tag="div" multiline value={row.area} onChange={(v) => patch(row.id, { area: v || "Area" })} placeholder="Area" />
          </div>
          <UI.Editable className="asis-cell asis-cell-now" tag="div" multiline value={row.asIs} onChange={(v) => patch(row.id, { asIs: v })} placeholder="How is it today?" />
          {full && (
            <div className="asis-cell-wrap">
              <span className="asis-arrow no-print"><Icon name="arrowR" size={14} /></span>
              <UI.Editable className="asis-cell asis-cell-tobe" tag="div" multiline value={row.toBe} onChange={(v) => patch(row.id, { toBe: v })} placeholder="What should it become?" />
            </div>
          )}
          <button className="chip-x asis-del no-print" onClick={() => rm(row.id)}><Icon name="trash" size={13} /></button>
        </div>
      ))}
      <button className="btn btn-sm btn-ghost no-print" style={{ marginTop: 10 }} onClick={add}><Icon name="plus" size={13} /> Add area</button>
    </div>
  );
}

/* ---------- risks embedded read-only (for business case) ---------- */
function RisksEmbed({ go }) {
  const { risks, tasks } = Store.useStore();
  const sorted = [...risks].sort((a, b) => LVL[b.likelihood] * LVL[b.impact] - LVL[a.likelihood] * LVL[a.impact]);
  if (!risks.length) return <p className="bc-body muted">No risks captured yet. Add them on the Risks & mitigation page and they'll appear here.</p>;
  return (
    <div className="bc-risks">
      {sorted.map((r) => {
        const rem = remediation(r, tasks);
        return (
          <div key={r.id} className="bc-risk">
            <span className="risk-score sm" style={{ background: scoreColor(r.likelihood, r.impact) }}>{LVL[r.likelihood] * LVL[r.impact]}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="bc-risk-title">{r.title}</div>
              <div className="bc-risk-mit">{r.mitigation || "No mitigation recorded."}</div>
            </div>
            <div className="bc-risk-meta">
              <span className="chip" style={{ "--chip-c": RISK_STATUS[r.status]?.c }}><span className="chip-dot" />{RISK_STATUS[r.status]?.label}</span>
              {rem.state !== "none" && <span className="mono" style={{ fontSize: 10.5, color: REMED[rem.state].c }}>{REMED[rem.state].label}</span>}
            </div>
          </div>
        );
      })}
      {go && <button className="btn btn-sm no-print" style={{ marginTop: 12 }} onClick={() => go("risks")}><Icon name="shield" size={14} /> Manage risks</button>}
    </div>
  );
}

/* ---------- Scope page ---------- */
function ScopePage({ go }) {
  return (
    <div className="view-scroll">
      <div className="view-pad view-wide">
        <p className="muted" style={{ margin: "0 0 22px", maxWidth: 620, fontSize: 14, lineHeight: 1.55 }}>
          Define the boundary of the work, then map where things are today (<b>as-is</b>) against where they need to be (<b>to-be</b>). This drives the business case and keeps the team aligned on what's in and out.
        </p>

        <section className="scope-section">
          <div className="scope-section-hd">
            <h2 className="scope-h serif">Boundaries</h2>
            <span className="muted" style={{ fontSize: 13 }}>What's inside the project, and what's explicitly not.</span>
          </div>
          <ScopeBoundaries />
        </section>

        <section className="scope-section">
          <div className="scope-section-hd">
            <h2 className="scope-h serif">As-is / To-be assessment</h2>
            <span className="muted" style={{ fontSize: 13 }}>Shared with Pre-analysis (as-is) and the Business case.</span>
          </div>
          <AssessmentTable mode="full" />
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { ScopePage, ScopeBoundaries, AssessmentTable, RisksEmbed });


// ======== plans.jsx ========
/* ============================================================
   PLANS — Communication plan + Change management plan
   Exposes window.CommPlan, window.ChangePlan
   ============================================================ */
const { useState: usePl } = React;

/* shared: editable bulleted cell (array of strings) */
function BulletCell({ items, onChange, placeholder = "Add…", accent }) {
  const list = items || [];
  const set = (i, v) => onChange(list.map((x, idx) => (idx === i ? v : x)));
  const add = () => onChange([...list, ""]);
  const rm = (i) => onChange(list.filter((_, idx) => idx !== i));
  return (
    <div className="bullets">
      {list.map((it, i) => (
        <div className="bullet-row" key={i}>
          <span className="bullet-dot" style={accent ? { background: accent } : null} />
          <UI.Editable className="bullet-text" tag="div" multiline value={it} onChange={(v) => set(i, v)} placeholder={placeholder} />
          <button className="chip-x no-print" onClick={() => rm(i)}><Icon name="x" size={11} /></button>
        </div>
      ))}
      <button className="bullet-add no-print" onClick={add}><Icon name="plus" size={12} /> Add</button>
    </div>
  );
}

/* ============================================================
   COMMUNICATION PLAN
   ============================================================ */
const COMM_COLS = [
  { key: "audience", label: "Audience", w: "120px", kind: "text" },
  { key: "purpose", label: "Purpose of communication", w: "1.3fr", kind: "text" },
  { key: "messages", label: "Key messages", w: "2fr", kind: "bullets" },
  { key: "channels", label: "Channel(s)", w: "120px", kind: "bullets" },
  { key: "timing", label: "Timing", w: "130px", kind: "text" },
  { key: "owner", label: "Owner", w: "100px", kind: "text" },
  { key: "deliverables", label: "Deliverables", w: "1.5fr", kind: "bullets" },
];

function CommPlan() {
  const { commPlan } = Store.useStore();
  const [del, setDel] = usePl(null);
  const rows = commPlan || [];
  const cols = COMM_COLS.map((c) => c.w).join(" ") + " 34px";

  const addRow = () => Store.setState((st) => ({ ...st, commPlan: [...(st.commPlan || []), { id: Store.uid("cm"), audience: "New audience", purpose: "", messages: [], channels: [], timing: "", owner: "", deliverables: [] }] }));
  const patch = (id, c) => Store.setState((st) => ({ ...st, commPlan: st.commPlan.map((r) => (r.id === id ? { ...r, ...c } : r)) }));
  const remove = (id) => Store.setState((st) => ({ ...st, commPlan: st.commPlan.filter((r) => r.id !== id) }));

  return (
    <div className="view-scroll">
      <div className="view-pad">
        <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <p className="muted" style={{ margin: 0, maxWidth: 620, fontSize: 14, lineHeight: 1.55 }}>
            Who needs to hear what, through which channel and when — and who owns each message. One row per audience.
          </p>
          <button className="btn btn-primary no-print" onClick={addRow}><Icon name="plus" size={15} /> Add audience</button>
        </div>

        <div className="plan-table">
          <div className="plan-head" style={{ gridTemplateColumns: cols }}>
            {COMM_COLS.map((c) => <div key={c.key}>{c.label}</div>)}
            <div />
          </div>
          {rows.length === 0 && <div className="plan-empty">No audiences yet. Add the first one to start the plan.</div>}
          {rows.map((r) => (
            <div className="plan-row" style={{ gridTemplateColumns: cols }} key={r.id}>
              {COMM_COLS.map((c) => (
                <div className={"plan-cell" + (c.key === "audience" ? " plan-cell-key" : "")} key={c.key}>
                  {c.kind === "bullets"
                    ? <BulletCell items={r[c.key]} onChange={(v) => patch(r.id, { [c.key]: v })} />
                    : <UI.Editable className="plan-text" tag="div" multiline value={r[c.key]} onChange={(v) => patch(r.id, { [c.key]: v })} placeholder="…" />}
                </div>
              ))}
              <button className="chip-x plan-del no-print" onClick={() => setDel(r.id)}><Icon name="trash" size={13} /></button>
            </div>
          ))}
        </div>
      </div>
      {del && <UI.Confirm title="Remove audience row?" body="This deletes the communication-plan row." onConfirm={() => remove(del)} onClose={() => setDel(null)} />}
    </div>
  );
}

/* ============================================================
   CHANGE MANAGEMENT PLAN — grouped tables
   ============================================================ */
const CHG_COLS = "150px 1.6fr 1.5fr 110px 34px";
const CHG_ACCENTS = ["indigo", "teal", "purple", "amber", "green", "blue", "pink", "red"];

function ChangePlan() {
  const { changePlan } = Store.useStore();
  const groups = (changePlan && changePlan.groups) || [];
  const [del, setDel] = usePl(null);

  const setGroups = (fn) => Store.setState((st) => ({ ...st, changePlan: { ...(st.changePlan || {}), groups: fn((st.changePlan && st.changePlan.groups) || []) } }));
  const addGroup = () => setGroups((g) => [...g, { id: Store.uid("cg"), label: "New group", accent: CHG_ACCENTS[g.length % CHG_ACCENTS.length], rows: [{ id: Store.uid("cr"), component: "New component", description: "", deliverables: [], owner: "" }] }]);
  const patchGroup = (gid, c) => setGroups((g) => g.map((x) => (x.id === gid ? { ...x, ...c } : x)));
  const rmGroup = (gid) => setGroups((g) => g.filter((x) => x.id !== gid));
  const addRow = (gid) => setGroups((g) => g.map((x) => (x.id === gid ? { ...x, rows: [...x.rows, { id: Store.uid("cr"), component: "New component", description: "", deliverables: [], owner: "" }] } : x)));
  const patchRow = (gid, rid, c) => setGroups((g) => g.map((x) => (x.id === gid ? { ...x, rows: x.rows.map((r) => (r.id === rid ? { ...r, ...c } : r)) } : x)));
  const rmRow = (gid, rid) => setGroups((g) => g.map((x) => (x.id === gid ? { ...x, rows: x.rows.filter((r) => r.id !== rid) } : x)));

  return (
    <div className="view-scroll">
      <div className="view-pad">
        <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <p className="muted" style={{ margin: 0, maxWidth: 620, fontSize: 14, lineHeight: 1.55 }}>
            The activities that move people to the new way of working — grouped by audience. Each component has a description, deliverables and an owner.
          </p>
          <button className="btn btn-primary no-print" onClick={addGroup}><Icon name="plus" size={15} /> Add group</button>
        </div>

        {groups.length === 0 && <div className="empty"><div className="serif">No change groups yet</div>Add a group (e.g. a team or audience) to start the plan.</div>}

        {groups.map((g) => (
          <div className="chg-group" key={g.id} style={{ "--chg-c": "var(--t-" + (g.accent || "indigo") + ")" }}>
            <div className="chg-rail">
              <UI.Editable className="chg-rail-label" tag="div" multiline value={g.label} onChange={(v) => patchGroup(g.id, { label: v || "Group" })} placeholder="Group" />
              <div className="chg-rail-actions no-print">
                <button className="chg-rail-btn" title="Change colour" onClick={() => patchGroup(g.id, { accent: CHG_ACCENTS[(CHG_ACCENTS.indexOf(g.accent) + 1) % CHG_ACCENTS.length] })}><Icon name="tag" size={13} /></button>
                <button className="chg-rail-btn" title="Remove group" onClick={() => setDel({ type: "group", gid: g.id })}><Icon name="trash" size={13} /></button>
              </div>
            </div>
            <div className="chg-table">
              <div className="chg-head" style={{ gridTemplateColumns: CHG_COLS }}>
                <div>Component</div><div>Description</div><div>Deliverables</div><div>Owner</div><div />
              </div>
              {g.rows.map((r) => (
                <div className="chg-row" style={{ gridTemplateColumns: CHG_COLS }} key={r.id}>
                  <div className="plan-cell plan-cell-key"><UI.Editable className="plan-text" tag="div" multiline value={r.component} onChange={(v) => patchRow(g.id, r.id, { component: v })} placeholder="Component" /></div>
                  <div className="plan-cell"><UI.Editable className="plan-text" tag="div" multiline value={r.description} onChange={(v) => patchRow(g.id, r.id, { description: v })} placeholder="What is it?" /></div>
                  <div className="plan-cell"><BulletCell items={r.deliverables} onChange={(v) => patchRow(g.id, r.id, { deliverables: v })} accent={"var(--chg-c)"} /></div>
                  <div className="plan-cell"><UI.Editable className="plan-text" tag="div" multiline value={r.owner} onChange={(v) => patchRow(g.id, r.id, { owner: v })} placeholder="—" /></div>
                  <button className="chip-x plan-del no-print" onClick={() => setDel({ type: "row", gid: g.id, rid: r.id })}><Icon name="trash" size={13} /></button>
                </div>
              ))}
              <button className="chg-addrow no-print" onClick={() => addRow(g.id)}><Icon name="plus" size={13} /> Add component</button>
            </div>
          </div>
        ))}
      </div>
      {del && <UI.Confirm title={del.type === "group" ? "Remove group?" : "Remove component?"} body={del.type === "group" ? "This deletes the group and all its components." : "This deletes the component row."} onConfirm={() => del.type === "group" ? rmGroup(del.gid) : rmRow(del.gid, del.rid)} onClose={() => setDel(null)} />}
    </div>
  );
}

Object.assign(window, { CommPlan, ChangePlan });


// ======== taxonomy.jsx ========
/* ============================================================
   TAXONOMY EDITOR — edit categories, tags, phases
   Exposes window.TaxonomyEditor
   ============================================================ */
const { useState: useTx } = React;

const TAX_COLORS = ["blue", "indigo", "teal", "green", "amber", "red", "pink", "purple"];

function TaxonomyEditor({ onClose }) {
  const s = Store.useStore();
  const [tab, setTab] = useTx("categories");

  const TABS = [
    { id: "categories", label: "Categories", key: "categories", hint: "Group actions by theme (Platform, Migration, etc.)" },
    { id: "tags", label: "Tags", key: "tags", hint: "Label tasks with skills or topics (Frontend, Security, etc.)" },
    { id: "phases", label: "Phases", key: "phases", hint: "Timeline phases (Discovery, Design, Build, Launch)" },
  ];
  const cur = TABS.find((t) => t.id === tab);

  return (
    <UI.Modal onClose={onClose}>
      <div className="modal-hd">
        <div className="ai-spark" style={{ background: "var(--ink)" }}><Icon name="tag" size={17} /></div>
        <div className="grow">
          <div className="cm-title" style={{ fontSize: 21 }}>Edit taxonomy</div>
          <div className="muted" style={{ fontSize: 13 }}>Add, rename, recolour or remove categories, tags and phases.</div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="sync-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="modal-bd">
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 16px" }}>{cur.hint}</p>
        <TaxList storeKey={cur.key} items={s[cur.key] || []} />
      </div>
      <div className="modal-ft">
        <div className="grow" />
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </UI.Modal>
  );
}

function TaxList({ storeKey, items }) {
  const [confirm, setConfirm] = useTx(null);

  const add = () => {
    const id = Store.uid(storeKey.slice(0, 2));
    Store.update(storeKey, (arr) => [...arr, { id, label: "New " + storeKey.slice(0, -1), color: TAX_COLORS[arr.length % TAX_COLORS.length] }]);
  };
  const patch = (id, changes) => {
    Store.update(storeKey, (arr) => arr.map((x) => (x.id === id ? { ...x, ...changes } : x)));
  };
  const remove = (id) => {
    Store.update(storeKey, (arr) => arr.filter((x) => x.id !== id));
    // clean up references in tasks
    if (storeKey === "categories") {
      Store.update("tasks", (arr) => arr.map((t) => t.category === id ? { ...t, category: null } : t));
      Store.update("milestones", (arr) => arr.map((m) => m.category === id ? { ...m, category: null } : m));
    } else if (storeKey === "tags") {
      Store.update("tasks", (arr) => arr.map((t) => ({ ...t, tags: (t.tags || []).filter((x) => x !== id) })));
    } else if (storeKey === "phases") {
      Store.update("tasks", (arr) => arr.map((t) => t.phase === id ? { ...t, phase: null } : t));
    }
    setConfirm(null);
  };
  const moveUp = (i) => {
    if (i === 0) return;
    Store.update(storeKey, (arr) => { const n = [...arr]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
  };
  const moveDown = (i) => {
    Store.update(storeKey, (arr) => { if (i >= arr.length - 1) return arr; const n = [...arr]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
  };

  return (
    <div className="tax-list">
      {items.length === 0 && <div className="tax-empty">No {storeKey} yet. Add one below.</div>}
      {items.map((item, i) => (
        <div key={item.id} className="tax-row">
          <div className="tax-color-pick">
            {TAX_COLORS.map((c) => (
              <button key={c} className={"tax-swatch" + (item.color === c ? " on" : "")} style={{ background: "var(--t-" + c + ")" }} onClick={() => patch(item.id, { color: c })} />
            ))}
          </div>
          <UI.Editable className="tax-name" noPencil value={item.label} onChange={(v) => patch(item.id, { label: v || "Unnamed" })} placeholder="Name" />
          <div className="tax-actions">
            <button className="tax-act" onClick={() => moveUp(i)} disabled={i === 0} title="Move up"><Icon name="chevD" size={13} style={{ transform: "rotate(180deg)" }} /></button>
            <button className="tax-act" onClick={() => moveDown(i)} disabled={i === items.length - 1} title="Move down"><Icon name="chevD" size={13} /></button>
            <button className="tax-act tax-del" onClick={() => setConfirm(item.id)} title="Delete"><Icon name="trash" size={13} /></button>
          </div>
        </div>
      ))}
      <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={add}>
        <Icon name="plus" size={13} /> Add {storeKey.slice(0, -1)}
      </button>
      {confirm && (
        <UI.Confirm
          title={"Delete " + storeKey.slice(0, -1) + "?"}
          body={"Tasks using this " + storeKey.slice(0, -1) + " will become uncategorised. This cannot be undone."}
          confirmLabel="Delete"
          onConfirm={() => remove(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

Object.assign(window, { TaxonomyEditor });


// ======== glossary.jsx ========
/* ============================================================
   GLOSSARY — terms + definitions, with global text highlighting
   Exposes window.Glossary, window.setupGlossaryHighlighter
   ============================================================ */
const { useState: useG } = React;

function Glossary() {
  const s = Store.useStore();
  const terms = s.glossary || [];
  const [q, setQ] = useG("");
  const [del, setDel] = useG(null);
  const [bulk, setBulk] = useG(false);

  const add = () => {
    const id = Store.uid("gl");
    Store.add("glossary", { id, term: "New term", definition: "" });
  };
  const patch = (id, c) => Store.patch("glossary", id, c);

  const sorted = [...terms].sort((a, b) => (a.term || "").localeCompare(b.term || ""));
  const filtered = q
    ? sorted.filter((t) => (t.term + " " + (t.definition || "")).toLowerCase().includes(q.toLowerCase()))
    : sorted;

  return (
    <div className="view-scroll">
      <div className="view-pad view-wide">
        <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <p className="muted" style={{ margin: 0, maxWidth: 600, fontSize: 14, lineHeight: 1.55 }}>
            Project-specific words and their meaning. Every term added here is automatically highlighted everywhere it appears in this project — hover any underlined word to read the definition.
          </p>
          <div className="row no-print" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setBulk(true)}><Icon name="list" size={15} /> Paste list</button>
            <button className="btn btn-primary" onClick={add}><Icon name="plus" size={15} /> Add term</button>
          </div>
        </div>

        <div className="filterbar no-print" style={{ padding: 0, border: "none", background: "transparent", marginBottom: 16 }}>
          <div className="search-box" style={{ minWidth: 260 }}>
            <Icon name="search" size={15} />
            <input placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <div className="gloss-list">
          {filtered.length === 0 && (
            <div className="empty">
              <div className="serif">{q ? "No matches" : "No terms yet"}</div>
              {q ? "Try a different search." : (
                <div>
                  <p style={{ margin: "4px 0 14px" }}>Add the first term to get started — hover-tooltips appear everywhere you use it.</p>
                  <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                    <button className="btn" onClick={() => setBulk(true)}><Icon name="list" size={14} /> Paste a list</button>
                    <button className="btn btn-primary" onClick={add}><Icon name="plus" size={14} /> Add one</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {filtered.map((t) => (
            <div key={t.id} className="gloss-row panel no-gloss">
              <div className="gloss-row-main">
                <UI.Editable className="gloss-term-text serif" value={t.term} onChange={(v) => patch(t.id, { term: v || "(unnamed)" })} placeholder="Term" />
                <UI.Editable className="gloss-def" tag="div" multiline value={t.definition} onChange={(v) => patch(t.id, { definition: v })} placeholder="What does this term mean in this project?" />
              </div>
              <button className="btn btn-icon btn-ghost btn-danger no-print gloss-del" title="Remove" onClick={() => setDel(t)}><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div>
      </div>
      {del && (
        <UI.Confirm
          title="Remove term?"
          body={`Remove "${del.term}" from the glossary?`}
          confirmLabel="Remove"
          onConfirm={() => { Store.remove("glossary", del.id); setDel(null); }}
          onClose={() => setDel(null)}
        />
      )}
      {bulk && <BulkImport onClose={() => setBulk(false)} existing={terms} />}
    </div>
  );
}

/* ============================================================
   BULK IMPORT — paste a comma-separated list of terms
   Accepts:
     term1, term2, term3                   (just terms)
     term: definition, term: definition    (with definitions)
     One per line is fine too — separator can be comma or newline.
   ============================================================ */
function parseBulk(text) {
  if (!text) return [];
  // split on newlines first, then on commas — but only on commas NOT inside a definition.
  // simple heuristic: a "term: definition" entry ends at the next ", " followed by capital letter
  // safer approach: split on newlines OR semicolons OR commas-followed-by-space-and-letter
  const entries = text
    .split(/[\n;]+|,(?=\s*[A-Za-z])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return entries.map((raw) => {
    // first colon, dash or en-dash separates term from definition
    const m = raw.match(/^([^:\u2013\u2014\-]+?)\s*[:\u2013\u2014\-]\s*(.+)$/);
    if (m) return { term: m[1].trim(), definition: m[2].trim() };
    return { term: raw.trim(), definition: "" };
  }).filter((e) => e.term);
}

function BulkImport({ onClose, existing }) {
  const [text, setText] = useG("");
  const [skipDupes, setSkipDupes] = useG(true);
  const parsed = parseBulk(text);
  const knownLower = new Set((existing || []).map((t) => (t.term || "").toLowerCase()));
  const newOnes = parsed.filter((p) => !skipDupes || !knownLower.has(p.term.toLowerCase()));
  const dupeCount = parsed.length - newOnes.length;

  const submit = () => {
    newOnes.forEach((p) => {
      Store.add("glossary", { id: Store.uid("gl"), term: p.term, definition: p.definition });
    });
    onClose();
  };

  return (
    <UI.Modal onClose={onClose}>
      <div className="modal-hd">
        <div className="ai-spark" style={{ background: "var(--ink)" }}><Icon name="list" size={17} /></div>
        <div className="grow">
          <div className="cm-title" style={{ fontSize: 21 }}>Add many terms at once</div>
          <div className="muted" style={{ fontSize: 13 }}>Paste a comma-separated list. Add definitions with <span className="mono">term: definition</span>.</div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        <div className="field-label">Terms</div>
        <textarea
          className="textarea"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"SSO, ETL, UAT, CI/CD\n\nor with definitions, one per line:\nSSO: Single sign-on across all tools\nETL: Extract, Transform, Load pipeline\nhypercare: Intensive support window after go-live"}
          style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.55 }}
          autoFocus
        />
        <label className="sync-check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
          Skip terms that already exist
        </label>
        {parsed.length > 0 && (
          <div className="bulk-preview">
            <div className="bulk-preview-hd">
              Will add <b>{newOnes.length}</b> term{newOnes.length === 1 ? "" : "s"}
              {dupeCount > 0 && <span className="muted"> · {dupeCount} duplicate{dupeCount === 1 ? "" : "s"} skipped</span>}
            </div>
            <div className="bulk-preview-list">
              {newOnes.slice(0, 8).map((p, i) => (
                <div key={i} className="bulk-preview-item">
                  <span className="bulk-preview-term">{p.term}</span>
                  {p.definition && <span className="bulk-preview-def">— {p.definition}</span>}
                </div>
              ))}
              {newOnes.length > 8 && <div className="muted" style={{ fontSize: 12 }}>…and {newOnes.length - 8} more</div>}
            </div>
          </div>
        )}
      </div>
      <div className="modal-ft">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn btn-primary" disabled={newOnes.length === 0} onClick={submit}>
          <Icon name="plus" size={15} /> Add {newOnes.length || ""} term{newOnes.length === 1 ? "" : "s"}
        </button>
      </div>
    </UI.Modal>
  );
}

/* ============================================================
   GLOBAL HIGHLIGHTER — walks the DOM and wraps glossary terms
   ============================================================ */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let glossPending = false;
let glossObserver = null;
let glossTooltipEl = null;
let lastGlossSig = "";

function ensureGlossTooltip() {
  if (glossTooltipEl) return glossTooltipEl;
  const el = document.createElement("div");
  el.className = "gloss-tip";
  el.style.display = "none";
  document.body.appendChild(el);
  glossTooltipEl = el;

  document.addEventListener("pointerover", (e) => {
    const mark = e.target.closest && e.target.closest(".gloss-mark");
    if (!mark) return;
    const def = mark.dataset.glossDef;
    const term = mark.dataset.glossTerm;
    if (!def) return;
    el.innerHTML = '<div class="gloss-tip-term">' + term + '</div><div class="gloss-tip-def">' + def.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</div>";
    el.style.display = "block";
    const r = mark.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    el.style.left = left + "px";
    el.style.top = top + "px";
  });
  document.addEventListener("pointerout", (e) => {
    const mark = e.target.closest && e.target.closest(".gloss-mark");
    if (mark && (!e.relatedTarget || !mark.contains(e.relatedTarget))) {
      el.style.display = "none";
    }
  });
  document.addEventListener("scroll", () => { el.style.display = "none"; }, true);
  return el;
}

function scanAndMark() {
  const state = (Store.getState && Store.getState()) || null;
  if (!state) return;
  const raw = (state.glossary || []).filter((g) => g.term && g.term.trim());
  // sort longest first so multi-word terms win over single-word substrings
  const terms = raw.slice().sort((a, b) => b.term.length - a.term.length);

  // remove existing marks if no terms
  const sig = terms.map((t) => t.term + "::" + (t.definition || "")).join("|");
  if (sig === lastGlossSig && document.querySelector(".gloss-mark")) {
    return; // nothing changed and marks already in place
  }
  lastGlossSig = sig;

  // unwrap any existing marks first (definitions might have changed)
  document.querySelectorAll(".gloss-mark").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });

  if (!terms.length) return;

  const defMap = new Map();
  terms.forEach((t) => defMap.set(t.term.toLowerCase(), t.definition || ""));
  const pattern = new RegExp("\\b(" + terms.map((t) => escapeRegex(t.term)).join("|") + ")\\b", "gi");

  const root = document.getElementById("root");
  if (!root) return;
  const SKIP_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "SCRIPT", "STYLE", "OPTION", "BUTTON"]);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      let el = node.parentElement;
      while (el && el !== root) {
        if (el.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (el.classList) {
          if (el.classList.contains("gloss-mark")) return NodeFilter.FILTER_REJECT;
          if (el.classList.contains("no-gloss")) return NodeFilter.FILTER_REJECT;
          if (el.classList.contains("gloss-tip")) return NodeFilter.FILTER_REJECT;
        }
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      pattern.lastIndex = 0;
      return pattern.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);

  targets.forEach((node) => {
    const text = node.nodeValue;
    pattern.lastIndex = 0;
    const parts = [];
    let last = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      if (m.index > last) parts.push({ t: text.slice(last, m.index), match: false });
      parts.push({ t: m[0], match: true });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ t: text.slice(last), match: false });
    if (parts.length <= 1) return;

    const frag = document.createDocumentFragment();
    parts.forEach((part) => {
      if (part.match) {
        const span = document.createElement("span");
        span.className = "gloss-mark";
        span.dataset.glossTerm = part.t;
        span.dataset.glossDef = defMap.get(part.t.toLowerCase()) || "";
        span.textContent = part.t;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part.t));
      }
    });
    if (node.parentNode) node.parentNode.replaceChild(frag, node);
  });
}

function scheduleScan() {
  if (glossPending) return;
  glossPending = true;
  setTimeout(() => {
    glossPending = false;
    try { scanAndMark(); } catch (e) { /* swallow */ }
  }, 250);
}

function setupGlossaryHighlighter() {
  ensureGlossTooltip();
  // initial scan after first paint
  scheduleScan();
  // observe DOM changes (React rerenders, navigation)
  if (glossObserver) glossObserver.disconnect();
  const root = document.getElementById("root");
  if (!root) return;
  glossObserver = new MutationObserver((mutations) => {
    // ignore mutations that ONLY touched gloss spans
    let real = false;
    for (const m of mutations) {
      if (m.target && m.target.classList && m.target.classList.contains("gloss-mark")) continue;
      real = true;
      break;
    }
    if (real) {
      // force re-evaluation against signature each call
      lastGlossSig = "";
      scheduleScan();
    }
  });
  glossObserver.observe(root, { childList: true, subtree: true, characterData: true });
}

Object.assign(window, { Glossary, setupGlossaryHighlighter });


// ======== kpis.jsx ========
/* ============================================================
   KPIs — project health & workload metrics
   Exposes window.KPIs
   ============================================================ */
const { useState: useKp, useMemo: useKpM } = React;

const DAY_MS = 86400000;
const startOfWeek = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const weekLabel = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function KPIs() {
  const s = Store.useStore();
  const { tasks, members, categories, risks, milestones } = s;

  // ---------- per-category workload ----------
  const byCat = useKpM(() => {
    const map = new Map();
    categories.forEach((c) => map.set(c.id, { ...c, count: 0, days: 0, done: 0, inprogress: 0 }));
    map.set("__none", { id: "__none", label: "Uncategorised", color: "indigo", count: 0, days: 0, done: 0, inprogress: 0 });
    tasks.forEach((t) => {
      const k = t.category || "__none";
      const row = map.get(k); if (!row) return;
      row.count++;
      if (t.status === "done") row.done++;
      if (t.status === "inprogress") row.inprogress++;
      if (t.start && t.end) {
        row.days += Math.max(1, Math.round((new Date(t.end) - new Date(t.start)) / DAY_MS));
      }
    });
    return [...map.values()].filter((r) => r.count > 0).sort((a, b) => b.days - a.days);
  }, [tasks, categories]);

  // ---------- per-person workload ----------
  const byPerson = useKpM(() => {
    const map = new Map();
    (members || []).forEach((m) => map.set(m.name, { name: m.name, color: m.color || "indigo", role: m.role, count: 0, days: 0, done: 0, inprogress: 0 }));
    tasks.forEach((t) => {
      const who = assigneesOf(t);
      const dur = (t.start && t.end) ? Math.max(1, Math.round((new Date(t.end) - new Date(t.start)) / DAY_MS)) : 0;
      who.forEach((name) => {
        if (!map.has(name)) map.set(name, { name, color: "indigo", role: "", count: 0, days: 0, done: 0, inprogress: 0 });
        const row = map.get(name);
        row.count++;
        if (t.status === "done") row.done++;
        if (t.status === "inprogress") row.inprogress++;
        row.days += dur;
      });
    });
    if (map.size === 0) return [];
    return [...map.values()].filter((r) => r.count > 0).sort((a, b) => b.days - a.days);
  }, [tasks, members]);

  // ---------- per-week workload (4 windowed weeks) ----------
  const byWeek = useKpM(() => {
    const dated = tasks.filter((t) => t.start && t.end);
    const now = new Date();
    const currentStart = startOfWeek(now);
    const offsets = [-1, 0, 1, 2];
    const labels = { [-1]: "Last week", 0: "Current week", 1: "Next week", 2: "In 2 weeks" };
    const tones = { [-1]: "last", 0: "current", 1: "next", 2: "in2" };
    return offsets.map((off) => {
      const wkStart = new Date(+currentStart + off * 7 * DAY_MS);
      const wkEnd = new Date(+wkStart + 7 * DAY_MS);
      const active = dated.filter((t) => new Date(t.start) < wkEnd && new Date(t.end) >= wkStart);
      return {
        key: off,
        label: labels[off],
        tone: tones[off],
        range: wkStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " – " + new Date(+wkEnd - DAY_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        load: active.length,
        done: active.filter((t) => t.status === "done").length,
        inprog: active.filter((t) => t.status === "inprogress").length,
        backlog: active.filter((t) => t.status === "backlog").length,
      };
    });
  }, [tasks]);

  // ---------- progress + risk metrics ----------
  const overview = useKpM(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const inprog = tasks.filter((t) => t.status === "inprogress").length;
    const backlog = tasks.filter((t) => t.status === "backlog").length;
    const completionPct = total ? Math.round(done / total * 100) : 0;
    const openRisks = risks.filter((r) => r.status !== "closed").length;
    const highRisks = risks.filter((r) => r.status !== "closed" && r.likelihood === "high" && r.impact === "high").length;
    const now = Date.now();
    const upcomingMs = (milestones || []).filter((m) => m.date && +new Date(m.date) >= now).sort((a, b) => +new Date(a.date) - +new Date(b.date)).slice(0, 4);
    return { total, done, inprog, backlog, completionPct, openRisks, highRisks, upcomingMs };
  }, [tasks, risks, milestones]);

  return (
    <div className="view-scroll">
      <div className="view-pad view-wide">
        <p className="muted" style={{ margin: "0 0 22px", maxWidth: 620, fontSize: 14, lineHeight: 1.55 }}>
          Live indicators on how the project is tracking — workload distribution, completion, and risk exposure. Everything updates as you edit tasks and risks.
        </p>

        {/* Overview tiles */}
        <div className="kpi-tiles kpi-tiles-big">
          <KpiTile label="Completion" big={overview.completionPct + "%"} sub={`${overview.done} of ${overview.total} tasks done`} accent="green" />
          <KpiTile label="In progress" big={String(overview.inprog)} sub={`${overview.backlog} still in backlog`} accent="blue" />
          <KpiTile label="Open risks" big={String(overview.openRisks)} sub={overview.highRisks ? `${overview.highRisks} high-impact` : "none high-impact"} accent={overview.highRisks ? "red" : "amber"} />
        </div>

        {/* Workload per week — 4-bar chart */}
        <section className="kpi-section">
          <div className="kpi-section-hd">
            <h2 className="kpi-h serif">Workload per week</h2>
            <span className="muted" style={{ fontSize: 13 }}>Tasks active in each week.</span>
          </div>
          {(() => {
            const maxLoad = Math.max(1, ...byWeek.map((w) => w.load));
            return (
              <div className="kpi-weekchart panel">
                <div className="kpi-weekchart-bars">
                  {byWeek.map((w) => (
                    <div key={w.key} className="kpi-weekbar-col">
                      <div className="kpi-weekbar-n mono">{w.load}</div>
                      <div className="kpi-weekbar-track">
                        <div className={"kpi-weekbar-fill " + w.tone} style={{ height: (w.load / maxLoad * 100) + "%" }} />
                      </div>
                      <div className="kpi-weekbar-label">{w.label}</div>
                      <div className="kpi-weekbar-range mono">{w.range}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </section>

        <div className="kpi-cols">
          {/* Per category */}
          <section className="kpi-section">
            <div className="kpi-section-hd">
              <h2 className="kpi-h serif">Workload per category</h2>
              <span className="muted" style={{ fontSize: 13 }}>Planned effort by theme.</span>
            </div>
            {byCat.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>No categorised tasks yet.</div>
            ) : (
              <div className="kpi-bars panel">
                {byCat.map((c) => {
                  const maxDays = Math.max(...byCat.map((x) => x.days), 1);
                  const pct = (c.days / maxDays) * 100;
                  const donePct = c.count ? (c.done / c.count) * 100 : 0;
                  return (
                    <div key={c.id} className="kpi-bar-row">
                      <div className="kpi-bar-name">
                        <span className="kcol-dot" style={{ background: "var(--t-" + c.color + ")" }} />
                        {c.label}
                      </div>
                      <div className="kpi-bar-track">
                        <div className="kpi-bar-fill" style={{ width: pct + "%", background: "var(--t-" + c.color + ")" }} />
                        <div className="kpi-bar-done" style={{ width: pct * donePct / 100 + "%" }} />
                      </div>
                      <div className="kpi-bar-stats mono">
                        <b>{c.days}d</b> · {c.count} task{c.count === 1 ? "" : "s"}
                        {c.done > 0 && <span className="muted"> · {Math.round(donePct)}% done</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Per person */}
          <section className="kpi-section">
            <div className="kpi-section-hd">
              <h2 className="kpi-h serif">Workload per person</h2>
              <span className="muted" style={{ fontSize: 13 }}>Days of work assigned, sorted by load.</span>
            </div>
            {byPerson.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>No one is assigned to tasks yet.</div>
            ) : (
              <div className="kpi-bars panel">
                {byPerson.map((p) => {
                  const maxDays = Math.max(...byPerson.map((x) => x.days), 1);
                  const pct = (p.days / maxDays) * 100;
                  return (
                    <div key={p.name} className="kpi-bar-row">
                      <div className="kpi-bar-name">
                        <span className="avatar" style={{ width: 22, height: 22, fontSize: 10, background: "var(--t-" + (p.color || "indigo") + ")" }}>{initials(p.name)}</span>
                        {p.name}
                      </div>
                      <div className="kpi-bar-track">
                        <div className="kpi-bar-fill" style={{ width: pct + "%", background: "var(--t-" + (p.color || "indigo") + ")" }} />
                      </div>
                      <div className="kpi-bar-stats mono">
                        <b>{p.days}d</b> · {p.count} task{p.count === 1 ? "" : "s"}
                        {p.inprogress > 0 && <span style={{ color: "var(--hue-progress)" }}> · {p.inprogress} active</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Upcoming milestones */}
        {overview.upcomingMs.length > 0 && (
          <section className="kpi-section">
            <div className="kpi-section-hd">
              <h2 className="kpi-h serif">Upcoming milestones &amp; gates</h2>
              <span className="muted" style={{ fontSize: 13 }}>Next four checkpoints.</span>
            </div>
            <div className="kpi-ms-list panel">
              {overview.upcomingMs.map((m) => {
                const cat = categories.find((c) => c.id === m.category);
                const days = Math.ceil((+new Date(m.date) - Date.now()) / DAY_MS);
                return (
                  <div key={m.id} className={"kpi-ms " + m.type}>
                    <span className={m.type === "gate" ? "ms-gate-icon" : "ms-mile-icon"}>{m.type === "gate" ? "┃" : "◆"}</span>
                    <div className="grow">
                      <div className="kpi-ms-title">{m.title}</div>
                      {cat && <div className="muted" style={{ fontSize: 12 }}>{cat.label}</div>}
                    </div>
                    <div className="kpi-ms-when mono">
                      <div className="kpi-ms-days">{days === 0 ? "today" : days > 0 ? `in ${days}d` : `${-days}d ago`}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{new Date(m.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function KpiTile({ label, big, sub, accent }) {
  return (
    <div className={"kpi-tile accent-" + (accent || "indigo")}>
      <div className="kpi-tile-label">{label}</div>
      <div className="kpi-tile-big serif">{big}</div>
      <div className="kpi-tile-sub">{sub}</div>
    </div>
  );
}

Object.assign(window, { KPIs });


// ======== intake.jsx ========
/* ============================================================
   INTAKE WIZARD — guided setup for a NEW project.
   Sizes the project, then asks scope + business-case questions
   (many yes/no) and auto-populates the relevant sections.
   Exposes window.IntakeWizard
   ============================================================ */
const { useState: useIn } = React;

const SIZES = [
  { id: "small", label: "Small", blurb: "A few weeks · one team · low risk & budget.", detail: "Light-touch: a clear purpose, a scope and a handful of actions. Most heavy sections stay optional." },
  { id: "medium", label: "Medium", blurb: "1–3 months · a couple of teams · several stakeholders.", detail: "A full business case, scope and as-is/to-be, plus communication and a light change plan." },
  { id: "large", label: "Large", blurb: "3+ months · multiple departments · high risk & budget.", detail: "Formal governance: business case, financials, risks, stakeholder map, change management and steering." },
];

const SIZE_DEFAULTS = {
  small:  { hasProblem: true, fromUsers: false, fromStakeholders: false, hasOpportunities: false, needProcess: false, needSystem: true, needBehaviour: false, needLeadership: false, hasFinancials: false, hasRisks: false },
  medium: { hasProblem: true, fromUsers: true, fromStakeholders: true, hasOpportunities: true, needProcess: true, needSystem: true, needBehaviour: true, needLeadership: false, hasFinancials: true, hasRisks: true },
  large:  { hasProblem: true, fromUsers: true, fromStakeholders: true, hasOpportunities: true, needProcess: true, needSystem: true, needBehaviour: true, needLeadership: true, hasFinancials: true, hasRisks: true },
};

function YN({ value, onChange, label, hint }) {
  return (
    <div className={"yn" + (value ? " on" : "")}>
      <div className="yn-main">
        <div className="yn-label">{label}</div>
        {hint && <div className="yn-hint">{hint}</div>}
      </div>
      <div className="yn-seg">
        <button className={value ? "on" : ""} onClick={() => onChange(true)}>Yes</button>
        <button className={!value ? "on" : ""} onClick={() => onChange(false)}>No</button>
      </div>
    </div>
  );
}

function Reveal({ show, children }) {
  if (!show) return null;
  return <div className="intake-reveal">{children}</div>;
}

function IntakeWizard({ onClose, onDone }) {
  const s = Store.getState();
  const [step, setStep] = useIn(0);
  const [a, setA] = useIn({
    size: "", purpose: "", problem: "",
    usersText: "", stakeText: "", oppText: "",
    outcomes: "", processText: "", systemText: "", behaviourText: "", leadershipText: "",
    costOneOff: "", costRun: "", saving: "", payback: "",
    inScope: "", outScope: "", risksText: "",
    ...SIZE_DEFAULTS.medium,
  });
  const set = (c) => setA((p) => ({ ...p, ...c }));
  const pickSize = (id) => set({ size: id, ...SIZE_DEFAULTS[id] });

  const STEPS = ["Size", "Situation", "Outcome & effects", "Financials", "Scope & risks"];
  const lines = (t) => (t || "").split("\n").map((x) => x.trim()).filter(Boolean);

  const finish = () => {
    Store.setState((st) => ({
      ...st,
      meta: { ...st.meta, size: a.size || "medium" },
      businessCase: {
        ...st.businessCase,
        purpose: a.purpose || st.businessCase.purpose,
        problem: a.hasProblem ? a.problem : "",
        perspUsers: a.fromUsers ? a.usersText : "",
        perspStakeholders: a.fromStakeholders ? a.stakeText : "",
        opportunities: a.hasOpportunities ? a.oppText : "",
        outcomes: lines(a.outcomes).length ? lines(a.outcomes) : st.businessCase.outcomes,
        effProcess: a.needProcess ? a.processText : "",
        effSystem: a.needSystem ? a.systemText : "",
        effBehaviour: a.needBehaviour ? a.behaviourText : "",
        effLeadership: a.needLeadership ? a.leadershipText : "",
        financial: a.hasFinancials
          ? [
              { label: "Programme cost (one-off)", value: a.costOneOff, note: "" },
              { label: "Annual run cost", value: a.costRun, note: "" },
              { label: "Annual saving", value: a.saving, note: "" },
              { label: "Payback period", value: a.payback, note: "" },
            ]
          : st.businessCase.financial,
      },
      scope: { inScope: lines(a.inScope), outScope: lines(a.outScope) },
      risks: a.hasRisks
        ? lines(a.risksText).map((t) => ({ id: Store.uid("r"), title: t, likelihood: "med", impact: "med", mitigation: "", owner: "", status: "open", taskIds: [] }))
        : st.risks,
    }));
    onDone && onDone();
  };

  const canNext = step !== 0 || !!a.size;

  return (
    <UI.Modal onClose={onClose}>
      <div className="modal-hd">
        <div className="ai-spark" style={{ background: "var(--accent)" }}><Icon name="scope" size={17} /></div>
        <div className="grow">
          <div className="cm-title" style={{ fontSize: 21 }}>Set up “{s?.meta?.project || "project"}”</div>
          <div className="muted" style={{ fontSize: 13 }}>Answer what's relevant — skip the rest. We'll fill the sections for you.</div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>

      <div className="intake-steps">
        {STEPS.map((st, i) => (
          <button key={i} className={"intake-step" + (i === step ? " on" : "") + (i < step ? " done" : "")} onClick={() => (i === 0 || a.size) && setStep(i)}>
            <span className="intake-step-n">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="intake-step-l">{st}</span>
          </button>
        ))}
      </div>

      <div className="modal-bd intake-bd">
        {step === 0 && (
          <div>
            <div className="intake-q">How big is this project?</div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 16px" }}>This tailors which sections we ask about — you can change everything later.</p>
            <div className="size-grid">
              {SIZES.map((sz) => (
                <button key={sz.id} className={"size-card" + (a.size === sz.id ? " on" : "")} onClick={() => pickSize(sz.id)}>
                  <div className="size-card-hd"><span className="size-name serif">{sz.label}</span>{a.size === sz.id && <span className="size-check"><Icon name="check" size={13} /></span>}</div>
                  <div className="size-blurb">{sz.blurb}</div>
                  <div className="size-detail">{sz.detail}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="intake-form">
            <div>
              <div className="field-label">Why are we doing this? Why does it matter?</div>
              <textarea className="textarea" rows={2} value={a.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="The core reason this project exists." />
            </div>
            <YN value={a.hasProblem} onChange={(v) => set({ hasProblem: v })} label="Is there a clear problem or pain today?" hint="A situation that creates or worsens the challenge." />
            <Reveal show={a.hasProblem}><textarea className="textarea" rows={2} value={a.problem} onChange={(e) => set({ problem: e.target.value })} placeholder="What is wrong today, and what makes it worse?" /></Reveal>
            <YN value={a.fromUsers} onChange={(v) => set({ fromUsers: v })} label="Does this matter from the users' perspective?" />
            <Reveal show={a.fromUsers}><textarea className="textarea" rows={2} value={a.usersText} onChange={(e) => set({ usersText: e.target.value })} placeholder="How do users experience the challenge?" /></Reveal>
            <YN value={a.fromStakeholders} onChange={(v) => set({ fromStakeholders: v })} label="Are other stakeholders affected?" />
            <Reveal show={a.fromStakeholders}><textarea className="textarea" rows={2} value={a.stakeText} onChange={(e) => set({ stakeText: e.target.value })} placeholder="Compliance, leadership, partners…" /></Reveal>
            <YN value={a.hasOpportunities} onChange={(v) => set({ hasOpportunities: v })} label="Are there opportunities we can leverage?" />
            <Reveal show={a.hasOpportunities}><textarea className="textarea" rows={2} value={a.oppText} onChange={(e) => set({ oppText: e.target.value })} placeholder="What can we take advantage of?" /></Reveal>
          </div>
        )}

        {step === 2 && (
          <div className="intake-form">
            <div>
              <div className="field-label">What does good look like? Outcomes / KPIs <span className="ai-opt">one per line</span></div>
              <textarea className="textarea" rows={3} value={a.outcomes} onChange={(e) => set({ outcomes: e.target.value })} placeholder={"Reduce support tickets by 50%\nSingle sign-on across all tools"} />
            </div>
            <div className="intake-sub">Which kinds of change are needed?</div>
            <YN value={a.needProcess} onChange={(v) => set({ needProcess: v })} label="Process change" hint="New or changed process, QMS / Cortex document." />
            <Reveal show={a.needProcess}><textarea className="textarea" rows={2} value={a.processText} onChange={(e) => set({ processText: e.target.value })} placeholder="What process needs to change?" /></Reveal>
            <YN value={a.needSystem} onChange={(v) => set({ needSystem: v })} label="System change" hint="New tools, functionality or templates." />
            <Reveal show={a.needSystem}><textarea className="textarea" rows={2} value={a.systemText} onChange={(e) => set({ systemText: e.target.value })} placeholder="What system changes are needed?" /></Reveal>
            <YN value={a.needBehaviour} onChange={(v) => set({ needBehaviour: v })} label="Behaviour change" hint="What target users & key roles should do." />
            <Reveal show={a.needBehaviour}><textarea className="textarea" rows={2} value={a.behaviourText} onChange={(e) => set({ behaviourText: e.target.value })} placeholder="What should people do differently?" /></Reveal>
            <YN value={a.needLeadership} onChange={(v) => set({ needLeadership: v })} label="Leadership / organisation change" hint="Structure, roles, responsibilities, training." />
            <Reveal show={a.needLeadership}><textarea className="textarea" rows={2} value={a.leadershipText} onChange={(e) => set({ leadershipText: e.target.value })} placeholder="What needs to change in leadership or org?" /></Reveal>
          </div>
        )}

        {step === 3 && (
          <div className="intake-form">
            <YN value={a.hasFinancials} onChange={(v) => set({ hasFinancials: v })} label="Is there a financial case?" hint="Costs, savings and payback. Not every project needs one." />
            <Reveal show={a.hasFinancials}>
              <div className="intake-fin">
                <div><div className="field-label">Programme cost (one-off)</div><input className="input" value={a.costOneOff} onChange={(e) => set({ costOneOff: e.target.value })} placeholder="€480,000" /></div>
                <div><div className="field-label">Annual run cost</div><input className="input" value={a.costRun} onChange={(e) => set({ costRun: e.target.value })} placeholder="€120,000" /></div>
                <div><div className="field-label">Annual saving</div><input className="input" value={a.saving} onChange={(e) => set({ saving: e.target.value })} placeholder="€210,000" /></div>
                <div><div className="field-label">Payback period</div><input className="input" value={a.payback} onChange={(e) => set({ payback: e.target.value })} placeholder="~2.4 years" /></div>
              </div>
            </Reveal>
            {!a.hasFinancials && <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>No problem — we'll leave the financial section empty. You can add figures any time on the Business case page.</p>}
          </div>
        )}

        {step === 4 && (
          <div className="intake-form">
            <div className="intake-cols">
              <div>
                <div className="field-label">In scope <span className="ai-opt">one per line</span></div>
                <textarea className="textarea" rows={4} value={a.inScope} onChange={(e) => set({ inScope: e.target.value })} placeholder={"Customer records migration\nSingle sign-on\nNew portal core flows"} />
              </div>
              <div>
                <div className="field-label">Out of scope <span className="ai-opt">one per line</span></div>
                <textarea className="textarea" rows={4} value={a.outScope} onChange={(e) => set({ outScope: e.target.value })} placeholder={"Finance / ERP integration\nNative mobile apps\nPartner portals"} />
              </div>
            </div>
            <YN value={a.hasRisks} onChange={(v) => set({ hasRisks: v })} label="Do you already know of any risks?" hint="We'll add them to the risk register to score later." />
            <Reveal show={a.hasRisks}><textarea className="textarea" rows={3} value={a.risksText} onChange={(e) => set({ risksText: e.target.value })} placeholder={"One risk per line, e.g.\nLegacy data quality worse than expected\nKey user availability during UAT"} /></Reveal>
          </div>
        )}
      </div>

      <div className="modal-ft">
        {step > 0 ? <button className="btn btn-ghost" onClick={() => setStep(step - 1)}><Icon name="chevR" size={14} style={{ transform: "rotate(180deg)" }} /> Back</button>
                  : <button className="btn btn-ghost" onClick={onClose}>Cancel</button>}
        <div className="grow" />
        {step < STEPS.length - 1
          ? <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue <Icon name="chevR" size={14} /></button>
          : <button className="btn btn-primary" onClick={finish}><Icon name="check" size={15} /> Create project</button>}
      </div>
    </UI.Modal>
  );
}

Object.assign(window, { IntakeWizard });


// ======== ai.jsx ========
/* ============================================================
   AI SETUP — interview form that fills the whole project
   Uses window.claude.complete (small output cap → several calls)
   Exposes window.AISetup
   ============================================================ */
const { useState: useAI } = React;

const ADAY = 86400000;
const isoAdd = (iso, days) => { const d = new Date(iso); d.setDate(d.getDate() + (days || 0)); return d.toISOString().slice(0, 10); };

function stripJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();
  const first = Math.min(...["{", "["].map((c) => { const i = t.indexOf(c); return i === -1 ? Infinity : i; }));
  if (first === Infinity) return null;
  const open = t[first], close = open === "{" ? "}" : "]";
  const last = t.lastIndexOf(close);
  if (last !== -1) { try { return JSON.parse(t.slice(first, last + 1)); } catch (e) {} }
  // recovery for a response truncated mid-array (output token cap)
  if (open === "[") {
    const lb = t.lastIndexOf("}");
    if (lb > first) {
      const frag = t.slice(first, lb + 1).replace(/,\s*$/, "");
      try { return JSON.parse(frag + "]"); } catch (e) {}
    }
  }
  return null;
}
async function askJSON(prompt) {
  try { const out = await window.claude.complete(prompt); return stripJSON(out); }
  catch (e) { console.warn("AI call failed", e); return null; }
}

const ROLE_SET = ["Executive Sponsor", "Project Owner", "Advisor", "Key User", "Gatekeeper", "Contributor"];
const ORG_ACCENT_POOL = ["purple", "indigo", "blue", "teal", "green", "amber", "pink", "red"];
const pick = (v, allowed, fb) => (allowed.includes(v) ? v : fb);

function AISetup({ onClose }) {
  const s = Store.getState();
  const [stage, setStage] = useAI("form");
  const [steps, setSteps] = useAI([]);
  const [err, setErr] = useAI(null);
  const [f, setF] = useAI({
    name: s?.meta?.project && s.meta.project !== "Untitled project" ? s.meta.project : "",
    summary: s?.businessCase?.purpose || "",
    domain: "IT / software",
    start: new Date().toISOString().slice(0, 7),
    weeks: 16,
    team: "",
    risks: "",
    findings: "",
    budget: "",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const teamNames = f.team.split("\n").map((l) => l.split(/[—–\-:]/)[0].trim()).filter(Boolean);
  const startISO = f.start + "-01";

  const stepDefs = [
    { key: "bc", label: "Writing the business case" },
    { key: "tasks", label: "Planning tasks & timeline" },
    { key: "people", label: "Mapping stakeholders & org" },
    { key: "risks", label: "Identifying risks & findings" },
  ];

  const mark = (key, status) => setSteps((prev) => prev.map((x) => (x.key === key ? { ...x, status } : x)));

  async function run() {
    setStage("running");
    setSteps(stepDefs.map((d) => ({ ...d, status: "pending" })));
    setErr(null);
    if (f.name.trim()) Store.projects.rename(s.id, f.name.trim());

    const tax = `phases=${s.phases.map((p) => p.id + ":" + p.label).join(", ")}; categories=${s.categories.map((c) => c.id + ":" + c.label).join(", ")}; tags=${s.tags.map((t) => t.id + ":" + t.label).join(", ")}`;
    const ctx = `Project "${f.name || "this project"}" — ${f.summary || "(no summary given)"}. Domain: ${f.domain}.`;
    let any = false;

    // 1 — business case
    mark("bc", "active");
    const bc = await askJSON(`${ctx} Budget context: ${f.budget || "not specified"}. Respond with ONLY minified JSON, no markdown, no commentary. Keys: purpose (1 sentence), problem (2 sentences), outcomes (array of exactly 4 short outcome strings), financial (array of exactly 4 objects each {label,value,note}: one-off programme cost, annual run cost, annual saving, payback period — invent plausible figures if none given), justification (2 sentences), effective (2 sentences on phased delivery & benefit tracking).`);
    if (bc && bc.purpose) {
      Store.setState((st) => ({ ...st, businessCase: {
        purpose: bc.purpose || "", problem: bc.problem || "",
        outcomes: Array.isArray(bc.outcomes) ? bc.outcomes.slice(0, 6) : [],
        financial: Array.isArray(bc.financial) && bc.financial.length ? bc.financial.slice(0, 4).map((x) => ({ label: x.label || "", value: x.value || "", note: x.note || "" })) : st.businessCase.financial,
        justification: bc.justification || "", effective: bc.effective || "",
      } }));
      any = true; mark("bc", "done");
    } else mark("bc", "skip");

    // 2 — tasks
    mark("tasks", "active");
    const tk = await askJSON(`${ctx} Team: ${teamNames.length ? teamNames.join(", ") : "invent 3-4 names"}. Ids: ${tax}. Starts ${startISO}, runs ~${f.weeks} weeks. Respond with ONLY minified JSON — an array of exactly 6 task objects, nothing else. Keys per task: t(title, max 6 words), s(status: backlog|inprogress|done — 1 done, 2 inprogress, rest backlog), p(phase id), c(category id), g(array of 0-1 tag id), pr(priority high|med|low), a(array of 1-2 team names), o(offsetDays int from start), d(durationDays int 5-15). Order chronologically. No description field.`);
    if (Array.isArray(tk) && tk.length) {
      const phaseIds = s.phases.map((p) => p.id), catIds = s.categories.map((c) => c.id), tagIds = s.tags.map((t) => t.id);
      const tasks = tk.slice(0, 10).map((t) => {
        const off = Number(t.o) || 0, dur = Math.max(2, Number(t.d) || 10);
        return {
          id: Store.uid("t"), title: t.t || "Untitled task",
          status: pick(t.s, ["backlog", "inprogress", "done"], "backlog"),
          phase: phaseIds.includes(t.p) ? t.p : null,
          category: catIds.includes(t.c) ? t.c : null,
          tags: Array.isArray(t.g) ? t.g.filter((x) => tagIds.includes(x)).slice(0, 3) : [],
          priority: pick(t.pr, ["high", "med", "low"], "med"),
          assignees: Array.isArray(t.a) ? t.a.filter(Boolean).slice(0, 3) : (t.a ? [t.a] : []),
          start: isoAdd(startISO, off), end: isoAdd(startISO, off + dur),
          desc: "", deps: [],
        };
      });
      Store.setState((st) => ({ ...st, tasks }));
      any = true; mark("tasks", "done");
    } else mark("tasks", "skip");

    // 3 — people (stakeholders + org)
    mark("people", "active");
    const pe = await askJSON(`${ctx} Known team: ${teamNames.length ? teamNames.join(", ") : "invent names"}. Respond with ONLY minified JSON with two keys. "stakeholders": array of 3-5 objects {name, title, role (one of ${ROLE_SET.join("|")}), responsibility (1 sentence), influence (high|med|low), interest (high|med|low)}. "org": array of 3-6 objects {name, role, manager} where manager is the exact name of that person's manager, or null for the most senior. Make the org reporting lines consistent (every non-null manager also appears as a name).`);
    if (pe && (Array.isArray(pe.stakeholders) || Array.isArray(pe.org))) {
      if (Array.isArray(pe.stakeholders)) {
        const stake = pe.stakeholders.slice(0, 8).map((p) => ({ id: Store.uid("s"), name: p.name || "Unnamed", title: p.title || "", role: pick(p.role, ROLE_SET, "Contributor"), responsibility: p.responsibility || "", influence: pick(p.influence, ["high", "med", "low"], "med"), interest: pick(p.interest, ["high", "med", "low"], "med"), contact: "" }));
        Store.setState((st) => ({ ...st, stakeholders: stake }));
      }
      if (Array.isArray(pe.org) && pe.org.length) {
        const nameId = {};
        const nodes = pe.org.slice(0, 8).map((o, i) => { const id = Store.uid("o"); nameId[(o.name || "").toLowerCase()] = id; return { id, name: o.name || "Unnamed", role: o.role || "", note: "", accent: ORG_ACCENT_POOL[i % ORG_ACCENT_POOL.length], _mgr: (o.manager || "").toLowerCase() }; });
        nodes.forEach((n) => { n.parent = n._mgr && nameId[n._mgr] && nameId[n._mgr] !== n.id ? nameId[n._mgr] : null; delete n._mgr; });
        if (!nodes.some((n) => n.parent === null)) nodes[0].parent = null;
        Store.setState((st) => ({ ...st, org: nodes }));
      }
      // Generate members from everyone the AI mentioned (org + stakeholders)
      const COL_POOL = ["blue", "indigo", "teal", "green", "amber", "red", "pink", "purple"];
      const memberMap = new Map();
      let cIdx = 0;
      const addMember = (name, role) => {
        const key = (name || "").trim(); if (!key || memberMap.has(key.toLowerCase())) return;
        memberMap.set(key.toLowerCase(), { id: Store.uid("mem"), name: key, role: role || "", email: "", color: COL_POOL[cIdx++ % COL_POOL.length] });
      };
      (pe.org || []).forEach((o) => addMember(o.name, o.role));
      (pe.stakeholders || []).forEach((p) => addMember(p.name, p.role));
      if (memberMap.size) Store.setState((st) => ({ ...st, members: [...memberMap.values()] }));
      any = true; mark("people", "done");
    } else mark("people", "skip");

    // 4 — risks + findings
    mark("risks", "active");
    const rf = await askJSON(`${ctx} ${f.risks ? "Concerns raised: " + f.risks + "." : ""} ${f.findings ? "Early findings: " + f.findings + "." : ""} Team: ${teamNames.join(", ") || "the team"}. Categories ids: ${s.categories.map((c) => c.id + ":" + c.label).join(", ")}. Respond with ONLY minified JSON with two keys. "risks": array of 3-4 {title, likelihood (high|med|low), impact (high|med|low), mitigation (1 sentence), owner (a team name), status (open|monitoring)}. "findings": array of 2-3 {title, summary (1-2 sentences), category (a category id), source (short label)}.`);
    if (rf && (Array.isArray(rf.risks) || Array.isArray(rf.findings))) {
      if (Array.isArray(rf.risks)) {
        const risks = rf.risks.slice(0, 6).map((r) => ({ id: Store.uid("r"), title: r.title || "Risk", likelihood: pick(r.likelihood, ["high", "med", "low"], "med"), impact: pick(r.impact, ["high", "med", "low"], "med"), mitigation: r.mitigation || "", owner: r.owner || "", status: pick(r.status, ["open", "monitoring", "closed"], "open"), taskIds: [] }));
        Store.setState((st) => ({ ...st, risks }));
      }
      if (Array.isArray(rf.findings)) {
        const catIds = s.categories.map((c) => c.id);
        const finds = rf.findings.slice(0, 5).map((x) => ({ id: Store.uid("f"), title: x.title || "Finding", summary: x.summary || "", category: catIds.includes(x.category) ? x.category : null, source: x.source || "" }));
        Store.setState((st) => ({ ...st, findings: finds }));
      }
      any = true; mark("risks", "done");
    } else mark("risks", "skip");

    if (!any) { setErr("The AI didn't return usable data — this can happen under rate limits. You can try again, or close and fill things in manually."); setStage("error"); }
    else setStage("done");
  }

  // ---------- render ----------
  if (stage === "running" || stage === "done" || stage === "error") {
    return (
      <UI.Modal narrow onClose={stage === "running" ? () => {} : onClose}>
        <div className="modal-hd">
          <div className="ai-spark"><Icon name="bulb" size={18} /></div>
          <div className="grow">
            <div className="cm-title" style={{ fontSize: 20 }}>{stage === "done" ? "Project ready" : stage === "error" ? "Hmm." : "Building your project…"}</div>
            <div className="muted" style={{ fontSize: 13 }}>{stage === "running" ? "This takes a few seconds." : stage === "done" ? "Everything below was drafted — edit anything." : ""}</div>
          </div>
        </div>
        <div className="modal-bd">
          <div className="ai-steps">
            {steps.map((st) => (
              <div key={st.key} className={"ai-step " + st.status}>
                <span className="ai-step-ico">
                  {st.status === "done" ? <Icon name="check" size={14} /> : st.status === "active" ? <Icon name="reset" size={14} className="spin" /> : st.status === "skip" ? <Icon name="x" size={13} /> : <span className="ai-dot" />}
                </span>
                <span className="grow">{st.label}</span>
                {st.status === "skip" && <span className="muted" style={{ fontSize: 11 }}>skipped</span>}
              </div>
            ))}
          </div>
          {err && <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 14 }}>{err}</p>}
        </div>
        {stage !== "running" && (
          <div className="modal-ft">
            {stage === "error" && <button className="btn btn-ghost" onClick={() => setStage("form")}>Back</button>}
            <div className="grow" />
            {stage === "done" && <button className="btn btn-ghost" onClick={onClose}>Stay here</button>}
            <button className="btn btn-primary" onClick={() => { onClose(); location.hash = "home"; }}>{stage === "done" ? "Open project" : "Close"}</button>
          </div>
        )}
      </UI.Modal>
    );
  }

  return (
    <UI.Modal onClose={onClose}>
      <div className="modal-hd">
        <div className="ai-spark"><Icon name="bulb" size={18} /></div>
        <div className="grow">
          <div className="cm-title" style={{ fontSize: 21 }}>Set up with AI</div>
          <div className="muted" style={{ fontSize: 13 }}>Answer a few questions and I'll draft the business case, tasks, timeline, people, risks and findings. Edit anything afterwards.</div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        <div className="ai-form">
          <div className="ai-row">
            <div className="grow"><div className="field-label">Project name</div>
              <input className="input" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Helios Platform Modernisation" /></div>
            <div style={{ width: 150 }}><div className="field-label">Kind of project</div>
              <input className="input" value={f.domain} onChange={(e) => set("domain", e.target.value)} placeholder="IT / software" /></div>
          </div>
          <div><div className="field-label">What is this project about?</div>
            <textarea className="textarea" rows={2} value={f.summary} onChange={(e) => set("summary", e.target.value)} placeholder="One or two sentences on the goal and why it matters." /></div>
          <div className="ai-row">
            <div><div className="field-label">Starts</div>
              <input className="input" type="month" value={f.start} onChange={(e) => set("start", e.target.value)} /></div>
            <div style={{ width: 130 }}><div className="field-label">Duration (weeks)</div>
              <input className="input" type="number" min="2" max="104" value={f.weeks} onChange={(e) => set("weeks", e.target.value)} /></div>
            <div className="grow"><div className="field-label">Budget context <span className="ai-opt">optional</span></div>
              <input className="input" value={f.budget} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. ~€500k, payback < 3 yrs" /></div>
          </div>
          <div><div className="field-label">Who's on the team? <span className="ai-opt">one per line — name — role</span></div>
            <textarea className="textarea" rows={3} value={f.team} onChange={(e) => set("team", e.target.value)} placeholder={"Dev Patel — Tech Lead\nMaya Rossi — Design Lead\nSam Kaur — Infra & Security"} /></div>
          <div className="ai-row">
            <div className="grow"><div className="field-label">Known risks / concerns <span className="ai-opt">optional</span></div>
              <textarea className="textarea" rows={2} value={f.risks} onChange={(e) => set("risks", e.target.value)} placeholder="Anything you're worried about." /></div>
            <div className="grow"><div className="field-label">Early findings <span className="ai-opt">optional</span></div>
              <textarea className="textarea" rows={2} value={f.findings} onChange={(e) => set("findings", e.target.value)} placeholder="Research or discovery you've already done." /></div>
          </div>
          <div className="ai-note"><Icon name="warn" size={14} /> This will replace the current contents of this project with AI-drafted material.</div>
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn btn-ghost grow" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={run} disabled={!f.name.trim()}><Icon name="bulb" size={15} /> Generate project</button>
      </div>
    </UI.Modal>
  );
}

Object.assign(window, { AISetup });


// ======== sync.jsx ========
/* ============================================================
   SYNC — npoint.io live sync + backup/transfer
   Data-only sync (no files); catalogue uses shared-drive links.
   Exposes window.SyncPanel, window.SyncBadge, window.SyncToast, window.initSync
   ============================================================ */
const { useState: useSy, useEffect: useSyE, useRef: useSyR } = React;

const SYNC_KEY = "atlas.sync.config";
const blob2dataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
async function dataURL2blob(u) { const r = await fetch(u); return await r.blob(); }

function loadSyncCfg() { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } }
function saveSyncCfg(c) { localStorage.setItem(SYNC_KEY, JSON.stringify(c)); }

/* ---------- workspace build / restore ---------- */
async function buildWorkspace(includeFiles) {
  const root = Store.getRoot();
  const pkg = { atlas: true, version: 2, exportedAt: new Date().toISOString(), root: { version: 2, projects: root.projects, rev: root.rev || 0, savedAt: root.savedAt || Date.now() }, files: {} };
  if (includeFiles) {
    const all = await Store.files.all();
    for (const [id, blob] of Object.entries(all)) {
      try { pkg.files[id] = await blob2dataURL(blob); } catch (e) {}
    }
  }
  return pkg;
}

// Single-project export. Only files referenced by this project's products are included.
async function buildProjectExport(projectId, includeFiles) {
  const root = Store.getRoot();
  const proj = root.projects.find((p) => p.id === projectId);
  if (!proj) throw new Error("Project not found");
  const pkg = { atlas: true, version: 2, singleProject: true, exportedAt: new Date().toISOString(), root: { version: 2, projects: [proj], rev: 0, savedAt: Date.now() }, files: {} };
  if (includeFiles) {
    const all = await Store.files.all();
    const referenced = new Set();
    (proj.products || []).forEach((p) => { if (p.fileId) referenced.add(p.fileId); });
    referenced.add("atlas.hero." + projectId); // cover image
    for (const id of referenced) {
      const blob = all[id];
      if (blob) { try { pkg.files[id] = await blob2dataURL(blob); } catch (e) {} }
    }
  }
  return pkg;
}

async function restoreWorkspace(pkg) {
  const rootData = pkg.root || pkg;
  if (pkg.singleProject && rootData.projects && rootData.projects.length === 1) {
    // merge single project: add or replace by id, keep other projects intact
    const incoming = rootData.projects[0];
    const root = Store.getRoot();
    const existing = root.projects.findIndex((p) => p.id === incoming.id);
    const newProjects = [...root.projects];
    if (existing >= 0) newProjects[existing] = incoming;
    else newProjects.push(incoming);
    Store.importRoot({ version: 2, projects: newProjects, rev: (root.rev || 0) + 1, savedAt: Date.now() });
  } else {
    Store.importRoot(rootData);
  }
  if (pkg.files) {
    for (const [id, durl] of Object.entries(pkg.files)) {
      try { Store.files.put(id, await dataURL2blob(durl)); } catch (e) {}
    }
  }
}

/* ---------- remote helpers ---------- */
async function remotePull(cfg) {
  const res = await fetch(cfg.url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("GET " + res.status);
  const txt = await res.text();
  if (!txt || !txt.trim()) return null;
  const data = JSON.parse(txt);
  return data.root ? data : { root: data };
}
async function remotePush(cfg, pkg) {
  const res = await fetch(cfg.url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pkg) });
  if (!res.ok) throw new Error("PUT " + res.status);
}

/* ---------- npoint.io one-click create ---------- */
async function createNpointBin() {
  const res = await fetch("https://api.npoint.io/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: {} }),
  });
  if (!res.ok) throw new Error("Could not create bin (HTTP " + res.status + ")");
  const json = await res.json();
  // npoint returns something like https://api.npoint.io/abc123
  return "https://api.npoint.io/" + (json.id || json);
}

/* ---------- live sync engine ---------- */
let syncTimer = null, pushDebounce = null, lastPushedRev = -1, lastRemoteSavedAt = 0, unsub = null;
const syncState = { status: "off", msg: "", at: 0, conflict: false, listeners: new Set() };
const toastState = { visible: false, msg: "", listeners: new Set() };

function setSync(status, msg) { syncState.status = status; syncState.msg = msg || ""; syncState.at = Date.now(); syncState.listeners.forEach((l) => l()); }
function showToast(msg) { toastState.visible = true; toastState.msg = msg; toastState.listeners.forEach((l) => l()); setTimeout(() => { toastState.visible = false; toastState.listeners.forEach((l) => l()); }, 4000); }

async function doPull(cfg, { apply } = { apply: true }) {
  const remote = await remotePull(cfg);
  if (!remote || !remote.root) return { changed: false };
  const localAt = Store.getRoot().savedAt || 0;
  const rAt = remote.root.savedAt || 0;
  const rRev = remote.root.rev || 0;
  const localRev = Store.getRoot().rev || 0;

  if (rAt > localAt && rRev !== localRev) {
    // conflict detection: if we have local unsaved changes newer than what we last pushed
    if (localAt > lastRemoteSavedAt && lastPushedRev !== -1 && localRev !== lastPushedRev) {
      syncState.conflict = true;
      setSync("ok", "Conflict — remote is newer but you have local changes");
      showToast("Someone else updated the workspace. Your latest change may overwrite theirs on next save.");
    }
    if (apply) {
      await restoreWorkspace(remote);
      lastPushedRev = Store.getRoot().rev || 0;
      lastRemoteSavedAt = rAt;
      showToast("Workspace updated from the shared endpoint.");
      return { changed: true };
    }
  }
  lastRemoteSavedAt = rAt;
  return { changed: false };
}
async function doPush(cfg) {
  const pkg = await buildWorkspace(false); // never include files in live sync
  await remotePush(cfg, pkg);
  lastPushedRev = Store.getRoot().rev || 0;
  lastRemoteSavedAt = pkg.root.savedAt;
  syncState.conflict = false;
}

function startSync(cfg) {
  stopSync();
  if (!cfg || !cfg.url || !cfg.auto) return;
  setSync("syncing", "Connecting…");
  doPull(cfg).then((r) => { setSync("ok", r.changed ? "Pulled latest" : "Up to date"); })
    .catch((e) => setSync("error", String(e.message || e)));
  syncTimer = setInterval(() => {
    doPull(cfg).then((r) => { if (r.changed) setSync("ok", "Pulled update"); else if (syncState.status !== "error") setSync("ok", "Up to date"); })
      .catch((e) => setSync("error", String(e.message || e)));
  }, Math.max(5, cfg.interval || 10) * 1000);
  unsub = subscribeStore(() => {
    const rev = Store.getRoot().rev || 0;
    if (rev === lastPushedRev) return;
    clearTimeout(pushDebounce);
    pushDebounce = setTimeout(() => {
      setSync("syncing", "Saving…");
      doPush(cfg).then(() => { setSync("ok", "Saved"); showToast("Changes pushed to team."); }).catch((e) => setSync("error", String(e.message || e)));
    }, 1200);
  });
}
function stopSync() {
  clearInterval(syncTimer); syncTimer = null;
  clearTimeout(pushDebounce);
  if (unsub) { unsub(); unsub = null; }
  if (syncState.status !== "off") setSync("off", "");
}

function subscribeStore(fn) {
  let lastRev = Store.getRoot().rev || 0;
  const id = setInterval(() => { const r = Store.getRoot().rev || 0; if (r !== lastRev) { lastRev = r; fn(); } }, 800);
  return () => clearInterval(id);
}

function initSync() {
  const cfg = loadSyncCfg();
  if (cfg.url && cfg.auto) startSync(cfg);
}

/* ---------- Toast ---------- */
function SyncToast() {
  const [, force] = useSy(0);
  useSyE(() => { const l = () => force((x) => x + 1); toastState.listeners.add(l); return () => toastState.listeners.delete(l); }, []);
  if (!toastState.visible) return null;
  return (
    <div className="sync-toast">
      <Icon name="reset" size={14} />
      <span>{toastState.msg}</span>
    </div>
  );
}

/* ---------- Badge ---------- */
function SyncBadge({ onClick }) {
  const [, force] = useSy(0);
  useSyE(() => { const l = () => force((x) => x + 1); syncState.listeners.add(l); return () => syncState.listeners.delete(l); }, []);
  const cfg = loadSyncCfg();
  const live = cfg.url && cfg.auto;
  const map = { off: ["var(--ink-ghost)", "Local only"], ok: ["var(--hue-done)", "Synced"], syncing: ["var(--t-amber)", "Syncing…"], error: ["var(--t-red)", "Sync error"] };
  const [c, label] = live ? map[syncState.status] || map.ok : map.off;
  return (
    <button className="sync-badge" onClick={onClick} title={syncState.msg || label}>
      <span className="sync-dot" style={{ background: c }} />
      <span className="grow" style={{ textAlign: "left" }}>{live ? label : "Backup & sync"}</span>
      <Icon name="reset" size={13} />
    </button>
  );
}

/* ---------- Panel ---------- */
function SyncPanel({ onClose }) {
  const [tab, setTab] = useSy("live");
  const [cfg, setCfg] = useSy(loadSyncCfg());
  const [busy, setBusy] = useSy("");
  const [note, setNote] = useSy(null);
  const [, force] = useSy(0);
  const fileRef = useSyR(null);
  useSyE(() => { const l = () => force((x) => x + 1); syncState.listeners.add(l); return () => syncState.listeners.delete(l); }, []);
  const upd = (c) => { const n = { ...cfg, ...c }; setCfg(n); saveSyncCfg(n); };

  const doExport = async (withFiles) => {
    setBusy("export");
    try {
      const active = Store.getState();
      const pkg = active ? await buildProjectExport(Store.getRoot().activeId, withFiles) : await buildWorkspace(withFiles);
      const filename = active
        ? "atlas-" + (active.meta?.project || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + new Date().toISOString().slice(0, 10) + ".json"
        : "atlas-workspace-" + new Date().toISOString().slice(0, 10) + ".json";
      const blob = new Blob([JSON.stringify(pkg)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote({ ok: true, msg: active ? `Exported “${active.meta?.project}”.` : "Workspace downloaded." });
    } catch (e) { setNote({ ok: false, msg: "Export failed: " + e.message }); }
    setBusy("");
  };
  const doExportWorkspace = async (withFiles) => {
    setBusy("export-all");
    try {
      const pkg = await buildWorkspace(withFiles);
      const blob = new Blob([JSON.stringify(pkg)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "atlas-workspace-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote({ ok: true, msg: "Whole workspace downloaded." });
    } catch (e) { setNote({ ok: false, msg: "Export failed: " + e.message }); }
    setBusy("");
  };
  const doImport = async (file) => {
    setBusy("import");
    try {
      const txt = await file.text(); const pkg = JSON.parse(txt);
      await restoreWorkspace(pkg);
      setNote({ ok: true, msg: "Workspace imported. Everything replaced." });
    } catch (e) { setNote({ ok: false, msg: "Import failed: " + (e.message || "unreadable file") }); }
    setBusy("");
  };

  const doCreateBin = async () => {
    setBusy("create");
    try {
      const url = await createNpointBin();
      upd({ url });
      // immediately push current state so bin isn't empty
      Store.touch();
      await doPush({ ...cfg, url });
      setNote({ ok: true, msg: "Workspace created at npoint.io. Share this URL with your team — anyone with it can sync." });
    } catch (e) { setNote({ ok: false, msg: "Could not create bin: " + e.message }); }
    setBusy("");
  };

  const testConn = async () => {
    setBusy("test");
    try { await remotePull(cfg); setNote({ ok: true, msg: "Connected — endpoint is reachable." }); }
    catch (e) { setNote({ ok: false, msg: "Could not reach endpoint: " + e.message }); }
    setBusy("");
  };
  const toggleLive = (on) => { upd({ auto: on }); if (on) { Store.touch(); startSync({ ...cfg, auto: true }); } else stopSync(); };
  const pushNow = async () => { setBusy("push"); try { Store.touch(); await doPush(cfg); setNote({ ok: true, msg: "Pushed." }); } catch (e) { setNote({ ok: false, msg: "Push failed: " + e.message }); } setBusy(""); };
  const pullNow = async () => { setBusy("pull"); try { const r = await doPull(cfg); setNote({ ok: true, msg: r.changed ? "Pulled latest." : "Already up to date." }); } catch (e) { setNote({ ok: false, msg: "Pull failed: " + e.message }); } setBusy(""); };

  const copyUrl = () => { navigator.clipboard.writeText(cfg.url || ""); setNote({ ok: true, msg: "URL copied to clipboard. Share it with your team." }); };

  // auto-fix common npoint URL mistakes
  const fixUrl = (raw) => {
    let u = (raw || "").trim();
    u = u.replace(/^https?:\/\/(?:www\.)?npoint\.io\/docs\//, "https://api.npoint.io/");
    u = u.replace(/^https?:\/\/npoint\.io\/(?!api)/, "https://api.npoint.io/");
    return u;
  };
  const onUrlChange = (raw) => { const fixed = fixUrl(raw); if (fixed !== raw) setNote({ ok: true, msg: "Auto-corrected to the API URL." }); return fixed; };

  return (
    <UI.Modal onClose={onClose}>
      <div className="modal-hd">
        <div className="ai-spark" style={{ background: "var(--ink)" }}><Icon name="reset" size={17} /></div>
        <div className="grow">
          <div className="cm-title" style={{ fontSize: 21 }}>Backup & sync</div>
          <div className="muted" style={{ fontSize: 13 }}>Keep your team in sync via npoint.io, or export/import workspace files.</div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="sync-tabs">
        <button className={tab === "live" ? "on" : ""} onClick={() => { setTab("live"); setNote(null); }}><Icon name="link" size={15} /> Team sync</button>
        <button className={tab === "backup" ? "on" : ""} onClick={() => { setTab("backup"); setNote(null); }}><Icon name="box" size={15} /> Backup & transfer</button>
      </div>
      <div className="modal-bd">
        {tab === "live" && (
          <div className="col" style={{ gap: 16 }}>
            {!cfg.url && (
              <div className="sync-block" style={{ borderColor: "var(--accent-line)", background: "var(--accent-soft)" }}>
                <div className="sync-block-hd"><Icon name="link" size={16} /><b>Get started — set up a shared workspace</b></div>
                <p className="sync-p">Three quick steps to get your team in sync:</p>
                <ol className="sync-steps-list">
                  <li><b>Open <a href="https://www.npoint.io" target="_blank" rel="noopener noreferrer">npoint.io</a></b> in a new tab</li>
                  <li>Paste <code>{"{}"}</code> into the editor and click <b>Save</b> — you'll get a URL like <code>api.npoint.io/abc123…</code></li>
                  <li>Copy that URL and paste it below</li>
                </ol>
                <p className="sync-p" style={{ fontSize: 12, color: "var(--ink-faint)", margin: "10px 0 0" }}>Project data syncs live. Files (PDFs, images) should be stored on a <b>shared drive</b> (SharePoint, OneDrive, Google Drive) and linked in the Product catalogue.</p>
              </div>
            )}
            {!cfg.url && (
              <div>
                <div className="field-label">Paste your npoint.io URL here</div>
                <input className="input mono" style={{ fontSize: 13 }} value={cfg.url || ""} placeholder="https://api.npoint.io/abc123…" onChange={(e) => upd({ url: onUrlChange(e.target.value) })} />
              </div>
            )}
            {cfg.url && (
              <>
                <div className="sync-block">
                  <div className="between" style={{ marginBottom: 6 }}>
                    <div className="sync-block-hd" style={{ margin: 0 }}><Icon name="link" size={16} /><b>Shared workspace URL</b></div>
                    <button className="btn btn-sm btn-ghost btn-danger" onClick={() => { stopSync(); upd({ url: "", auto: false }); setNote({ ok: true, msg: "Disconnected. You can paste a new URL." }); }}><Icon name="x" size={13} /> Disconnect</button>
                  </div>
                  <div className="sync-url-row">
                    <input className="input mono" style={{ fontSize: 12, flex: 1 }} value={cfg.url} placeholder="https://api.npoint.io/abc123…" onChange={(e) => { stopSync(); upd({ url: onUrlChange(e.target.value), auto: false }); }} />
                    <button className="btn btn-sm" onClick={copyUrl}><Icon name="link" size={13} /> Copy</button>
                  </div>
                  <p className="sync-p" style={{ margin: "8px 0 0" }}>Share this URL with your team. Edit it to switch endpoints, or Disconnect to start fresh.</p>
                </div>
                <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="muted" style={{ fontSize: 12.5 }}>Poll every</span>
                    <input className="datemini" style={{ width: 56 }} type="number" min="3" max="120" value={cfg.interval || 10} onChange={(e) => upd({ interval: Number(e.target.value) })} /><span className="muted" style={{ fontSize: 12.5 }}>s</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
                  <button className="btn btn-sm" disabled={!cfg.url || busy} onClick={testConn}>{busy === "test" ? <Icon name="reset" size={14} className="spin" /> : <Icon name="check" size={14} />} Test</button>
                  <button className="btn btn-sm" disabled={!cfg.url || busy} onClick={pushNow}>Push now</button>
                  <button className="btn btn-sm" disabled={!cfg.url || busy} onClick={pullNow}>Pull now</button>
                </div>
                <label className={"sync-live-toggle" + (cfg.auto ? " on" : "")}>
                  <input type="checkbox" checked={!!cfg.auto} disabled={!cfg.url} onChange={(e) => toggleLive(e.target.checked)} />
                  <span className="sync-live-text">
                    <b>Keep this computer in sync</b>
                    <span className="muted">{cfg.auto ? (syncState.msg || "Live") : "Off — changes stay local"}</span>
                  </span>
                  <span className="sync-dot" style={{ background: cfg.auto ? (syncState.status === "error" ? "var(--t-red)" : "var(--hue-done)") : "var(--ink-ghost)" }} />
                </label>
              </>
            )}
          </div>
        )}
        {tab === "backup" && (
          <div className="col" style={{ gap: 18 }}>
            <div className="sync-block">
              <div className="sync-block-hd"><Icon name="upload" size={16} style={{ transform: "rotate(180deg)" }} /><b>{Store.getState() ? `Export “${Store.getState().meta?.project}”` : "Export this workspace"}</b></div>
              <p className="sync-p">{Store.getState() ? "Download this project as a single file. Re-import it anywhere to restore it as it is now." : "Download every project as a single file. Carry it to another computer and import it there."}</p>
              <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
                <button className="btn btn-primary" disabled={busy === "export"} onClick={() => doExport(true)}>
                  {busy === "export" ? <Icon name="reset" size={15} className="spin" /> : <Icon name="upload" size={15} style={{ transform: "rotate(180deg)" }} />} Export with local files
                </button>
                <button className="btn" disabled={busy === "export"} onClick={() => doExport(false)}>Export data only</button>
              </div>
              {Store.getState() && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                  <p className="sync-p" style={{ marginBottom: 8, fontSize: 12 }}>Need everything?</p>
                  <button className="btn btn-sm" disabled={busy === "export-all"} onClick={() => doExportWorkspace(true)}>
                    {busy === "export-all" ? <Icon name="reset" size={14} className="spin" /> : <Icon name="layers" size={14} />} Export whole workspace
                  </button>
                </div>
              )}
            </div>
            <div className="sync-block">
              <div className="sync-block-hd"><Icon name="upload" size={16} /><b>Import a workspace</b></div>
              <p className="sync-p">Load a workspace file. <b>This replaces everything</b> on this computer.</p>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = ""; }} />
              <button className="btn" disabled={busy === "import"} onClick={() => fileRef.current.click()}>
                {busy === "import" ? <Icon name="reset" size={15} className="spin" /> : <Icon name="upload" size={15} />} Choose file…
              </button>
            </div>
          </div>
        )}
        {note && <div className={"sync-note " + (note.ok ? "ok" : "bad")}><Icon name={note.ok ? "check" : "warn"} size={14} /> {note.msg}</div>}
      </div>
      <div className="modal-ft">
        <span className="muted" style={{ fontSize: 12 }}>Data syncs live. Files should live on your shared drive.</span>
        <div className="grow" />
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </UI.Modal>
  );
}

Object.assign(window, { SyncPanel, SyncBadge, SyncToast, initSync, restoreWorkspace, buildWorkspace, buildProjectExport });


// ======== projects.jsx ========
/* ============================================================
   PROJECTS LANDING — programs, subprojects, create, sync
   Exposes window.ProjectsHome
   ============================================================ */
const { useState: usePj, useRef: usePjR, useEffect: usePjE } = React;

const PRJ_COLORS = ["purple", "indigo", "blue", "teal", "green", "amber", "pink", "red"];

function projStats(p) {
  const tasks = p.tasks || [];
  const done = tasks.filter((t) => t.status === "done").length;
  const active = tasks.filter((t) => t.status === "inprogress").length;
  const openRisks = (p.risks || []).filter((r) => r.status !== "closed").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return { total: tasks.length, done, active, openRisks, pct };
}
function relTime(ts) {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return d + " days ago";
  return Math.floor(d / 30) + " mo ago";
}

function ProjectCard({ p, projects, onOpen, onDelete, sub }) {
  const s = projStats(p);
  const [menu, setMenu] = usePj(false);
  const ref = usePjR(null);
  usePjE(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setMenu(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  // candidate parents: any top-level project that isn't this one and isn't this one's child
  const childIds = new Set(projects.filter((x) => x.parentId === p.id).map((x) => x.id));
  const parents = projects.filter((x) => x.id !== p.id && !childIds.has(x.id) && !x.parentId);

  return (
    <article className={"pj-card" + (sub ? " sub" : "")} onClick={() => onOpen(p.id)}>
      <div className="pj-card-bar" style={{ background: "var(--t-" + (p.color || "indigo") + ")" }} />
      <div className="pj-card-top">
        <span className="pj-code mono">{relTime(p.createdAt) === "today" ? "New" : ""}</span>
        <div className="pj-card-actions no-print" ref={ref}>
          <button className="pj-menu-btn" title="Group / move" onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}><Icon name="layers" size={14} /></button>
          <button className="pj-del" title="Delete project" onClick={(e) => { e.stopPropagation(); onDelete(p); }}><Icon name="trash" size={14} /></button>
          {menu && (
            <div className="tagpicker-menu panel" style={{ right: 0, left: "auto", minWidth: 210 }} onClick={(e) => e.stopPropagation()}>
              <div className="dep-menu-label">Group under a major project</div>
              {p.parentId && <button className="tagpicker-opt" onClick={() => { Store.projects.setParent(p.id, null); setMenu(false); }}><Icon name="x" size={13} /><span className="grow">Make top-level</span></button>}
              {parents.length === 0 && !p.parentId && <div className="dep-menu-empty">No other top-level projects to nest under yet.</div>}
              {parents.map((par) => (
                <button key={par.id} className={"tagpicker-opt" + (p.parentId === par.id ? " on" : "")} onClick={() => { Store.projects.setParent(p.id, par.id); setMenu(false); }}>
                  <span className="chip-dot" style={{ background: "var(--t-" + (par.color || "indigo") + ")" }} />
                  <span className="grow">{par.meta?.project}</span>
                  {p.parentId === par.id && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <h2 className="pj-name serif">{p.meta?.project}</h2>
      <div className="pj-progress">
        <div className="pj-progress-track"><div className="pj-progress-fill" style={{ width: s.pct + "%", background: "var(--t-" + (p.color || "indigo") + ")" }} /></div>
        <span className="pj-progress-pct mono">{s.pct}%</span>
      </div>
      <div className="pj-statline">
        <span><b>{s.active}</b> active</span><span className="pj-dot-sep" />
        <span><b>{s.total}</b> tasks</span><span className="pj-dot-sep" />
        <span className={s.openRisks ? "pj-risk" : ""}><b>{s.openRisks}</b> risks</span>
      </div>
      <div className="pj-card-foot">
        <div className="pj-faces">
          {[...new Set((p.tasks || []).filter((t) => t.status === "inprogress").flatMap((t) => assigneesOf(t)))].slice(0, 4).map((n, i) => (
            <span key={i} className="avatar pj-face" style={{ background: "var(--t-" + PRJ_COLORS[i % PRJ_COLORS.length] + ")" }} title={n}>{initials(n)}</span>
          ))}
          {s.active === 0 && <span className="muted" style={{ fontSize: 12 }}>No one assigned yet</span>}
        </div>
        <span className="pj-updated muted">Updated {relTime(p.updatedAt)}</span>
      </div>
      <span className="pj-open">Open <Icon name="arrowR" size={14} /></span>
    </article>
  );
}

function ProjectsHome() {
  const root = Store.useRoot();
  const [create, setCreate] = usePj(false);
  const [ai, setAi] = usePj(false);
  const [intake, setIntake] = usePj(false);
  const [del, setDel] = usePj(null);
  const [sync, setSync] = usePj(false);
  const [importing, setImporting] = usePj(false);
  const [importNote, setImportNote] = usePj(null);
  const importInputRef = usePjR(null);

  const handleImport = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportNote(null);
    try {
      const txt = await file.text();
      const pkg = JSON.parse(txt);
      await window.restoreWorkspace(pkg);
      setImportNote({ ok: true, msg: `Imported — ${pkg.root?.projects?.length || "?"} project(s) restored.` });
    } catch (e) {
      setImportNote({ ok: false, msg: "Import failed: " + (e.message || "unreadable file") });
    }
    setImporting(false);
  };
  const projects = root.projects;

  const open = (id) => { Store.projects.open(id); location.hash = "home"; };
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const childrenOf = (id) => projects.filter((p) => p.parentId === id);
  // top-level = no parent, OR parent missing
  const tops = projects.filter((p) => !p.parentId || !byId[p.parentId]);
  const programs = tops.filter((p) => childrenOf(p.id).length > 0);
  const standalone = tops.filter((p) => childrenOf(p.id).length === 0);

  const allTasks = projects.flatMap((p) => p.tasks || []);
  const totalActive = allTasks.filter((t) => t.status === "inprogress").length;
  const totalRisks = projects.flatMap((p) => p.risks || []).filter((r) => r.status !== "closed").length;

  const cardProps = { projects, onOpen: open, onDelete: setDel };

  return (
    <div className="pj-root">
      <div className="pj-wrap">
        <header className="pj-head">
          <div className="between" style={{ marginBottom: 28 }}>
            <div className="brand" style={{ padding: 0 }}>
              <div className="brand-mark" style={{ width: 40, height: 40 }}><Icon name="layers" size={22} /></div>
              <div>
                <div className="brand-name" style={{ fontSize: 24 }}>Atlas</div>
                <div className="brand-sub">Project portfolio</div>
              </div>
            </div>
            <button className="btn no-print" onClick={() => setSync(true)}><Icon name="reset" size={15} /> Backup & sync</button>
          </div>
          <div className="pj-hero">
            <div>
              <h1 className="pj-title serif">Your projects</h1>
              <p className="pj-lead">Every initiative in one place — group related work under a major project, then open any one to manage its board, plan, people, risks and deliverables.</p>
            </div>
            <div className="pj-rollup">
              <div className="pj-roll"><span className="pj-roll-n serif">{projects.length}</span><span className="pj-roll-l">projects</span></div>
              <div className="pj-roll"><span className="pj-roll-n serif">{totalActive}</span><span className="pj-roll-l">active tasks</span></div>
              <div className="pj-roll"><span className="pj-roll-n serif" style={{ color: totalRisks ? "var(--t-red)" : "inherit" }}>{totalRisks}</span><span className="pj-roll-l">open risks</span></div>
            </div>
          </div>
        </header>

        {programs.map((prog) => {
          const kids = childrenOf(prog.id);
          const rolled = [prog, ...kids];
          const tot = rolled.reduce((a, p) => a + (p.tasks || []).length, 0);
          const dn = rolled.reduce((a, p) => a + (p.tasks || []).filter((t) => t.status === "done").length, 0);
          return (
            <section key={prog.id} className="pj-program" style={{ "--prog-c": "var(--t-" + (prog.color || "indigo") + ")" }}>
              <div className="pj-program-hd">
                <span className="pj-program-mark"><Icon name="layers" size={15} /></span>
                <div>
                  <div className="pj-program-name serif">{prog.meta?.project}</div>
                  <div className="pj-program-sub">Program · {kids.length} subproject{kids.length === 1 ? "" : "s"} · {tot ? Math.round(dn / tot * 100) : 0}% complete overall</div>
                </div>
              </div>
              <div className="pj-grid">
                <ProjectCard p={prog} {...cardProps} />
                {kids.map((k) => <ProjectCard key={k.id} p={k} {...cardProps} sub />)}
              </div>
            </section>
          );
        })}

        {standalone.length > 0 && (
          <section className="pj-program plain">
            {programs.length > 0 && <div className="pj-section-label eyebrow">Other projects</div>}
            <div className="pj-grid">
              {standalone.map((p) => <ProjectCard key={p.id} p={p} {...cardProps} />)}
            </div>
          </section>
        )}

        <div className="pj-grid" style={{ marginTop: standalone.length > 0 || programs.length > 0 ? 0 : 20 }}>
          <button className="pj-new" onClick={() => setCreate(true)}>
            <span className="pj-new-icon"><Icon name="plus" size={26} /></span>
            <span className="pj-new-label serif">New project</span>
            <span className="pj-new-sub">Blank, guided setup, or AI</span>
          </button>
          <button className="pj-new pj-import" onClick={() => importInputRef.current.click()} disabled={importing}>
            <span className="pj-new-icon">{importing ? <Icon name="reset" size={26} className="spin" /> : <Icon name="upload" size={26} />}</span>
            <span className="pj-new-label serif">{importing ? "Importing…" : "Import workspace"}</span>
            <span className="pj-new-sub">Load a previously exported file</span>
          </button>
          <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value = ""; }} />
        </div>
        {importNote && (
          <div className={"sync-note " + (importNote.ok ? "ok" : "bad")} style={{ marginTop: 14, maxWidth: 600 }}>
            <Icon name={importNote.ok ? "check" : "warn"} size={14} /> {importNote.msg}
          </div>
        )}

        {projects.length === 0 && (
          <div className="empty" style={{ marginTop: 20 }}>
            <div className="serif">No projects yet</div>
            Create your first project to get started.
          </div>
        )}
      </div>

      {create && <CreateProject projects={projects} onClose={() => setCreate(false)} onAI={() => { setCreate(false); setAi(true); }} onGuided={() => { setCreate(false); setIntake(true); }} />}
      {ai && <AISetup onClose={() => { setAi(false); }} />}
      {intake && <IntakeWizard onClose={() => { setIntake(false); location.hash = "home"; }} onDone={() => { setIntake(false); location.hash = "home"; }} />}
      {sync && <SyncPanel onClose={() => setSync(false)} />}
      {del && <UI.Confirm title="Delete project?" body={childrenOf(del.id).length ? `"${del.meta?.project}" will be deleted. Its ${childrenOf(del.id).length} subproject(s) become top-level projects.` : `"${del.meta?.project}" and all its tasks, risks and deliverables will be permanently removed.`} confirmLabel="Delete project" onConfirm={() => Store.projects.remove(del.id)} onClose={() => setDel(null)} />}
    </div>
  );
}

function CreateProject({ onClose, onAI, onGuided, projects }) {
  const [name, setName] = usePj("");
  const [color, setColor] = usePj("indigo");
  const [parent, setParent] = usePj("");
  const [method, setMethod] = usePj("guided");
  const tops = (projects || []).filter((p) => !p.parentId);
  const create = () => Store.projects.create(name.trim() || "Untitled project", "", color, parent || null);
  const go = () => {
    create();
    if (method === "guided") onGuided();
    else if (method === "ai") onAI();
    else { location.hash = "home"; onClose(); }
  };
  const METHODS = [
    { id: "guided", icon: "scope", label: "Guided setup", sub: "Answer a few questions — we fill the sections", tag: "Recommended" },
    { id: "ai", icon: "bulb", label: "Set up with AI", sub: "Let AI draft the whole project" },
    { id: "blank", icon: "plus", label: "Blank project", sub: "Start from an empty board" },
  ];
  return (
    <UI.Modal narrow onClose={onClose}>
      <div className="modal-hd">
        <div className="grow">
          <div className="cm-title" style={{ fontSize: 21 }}>New project</div>
          <div className="muted" style={{ fontSize: 13 }}>Name it, then choose how to set it up.</div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        <div className="field-label">Project name</div>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data Warehouse Consolidation"
          onKeyDown={(e) => e.key === "Enter" && go()} style={{ marginBottom: 16 }} />
        <div className="row" style={{ gap: 12, marginBottom: 16, alignItems: "flex-start" }}>
          <div className="grow">
            <div className="field-label">Part of <span className="ai-opt">optional</span></div>
            <select className="select" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">— Top-level project —</option>
              {tops.map((p) => <option key={p.id} value={p.id}>{p.meta?.project}</option>)}
            </select>
          </div>
          <div>
            <div className="field-label">Colour</div>
            <div className="wrap" style={{ maxWidth: 150 }}>
              {PRJ_COLORS.map((c) => (
                <button key={c} className={"pj-swatch sm" + (color === c ? " on" : "")} style={{ background: "var(--t-" + c + ")" }} onClick={() => setColor(c)}>
                  {color === c && <Icon name="check" size={12} />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="field-label">How do you want to set it up?</div>
        <div className="method-list">
          {METHODS.map((m) => (
            <button key={m.id} className={"method-card" + (method === m.id ? " on" : "")} onClick={() => setMethod(m.id)}>
              <span className="method-ico"><Icon name={m.icon} size={17} /></span>
              <span className="method-text">
                <span className="method-label">{m.label}{m.tag && <span className="method-tag">{m.tag}</span>}</span>
                <span className="method-sub">{m.sub}</span>
              </span>
              <span className={"method-radio" + (method === m.id ? " on" : "")}>{method === m.id && <Icon name="check" size={12} />}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={go}>{method === "blank" ? "Create project" : "Continue"} <Icon name="chevR" size={14} /></button>
      </div>
    </UI.Modal>
  );
}

Object.assign(window, { ProjectsHome });


// ======== dashboard.jsx ========
/* ============================================================
   DASHBOARD — project front page
   View switcher (project / per-person) · tasks · risks · deps
   Exposes window.Dashboard
   ============================================================ */
const { useState: useD, useMemo: useDM } = React;

const STATUS_ORDER = [
{ id: "inprogress", label: "In progress" },
{ id: "backlog", label: "To do" },
{ id: "done", label: "Done" }];


function Dashboard({ go }) {
  const s = Store.useStore();
  const { tasks, risks, products, phases, stakeholders, members } = s;
  const [openTask, setOpenTask] = useD(null);
  const [showAI, setShowAI] = useD(false);

  const VKEY = "atlas.view." + s.id;
  const [who, setWho] = useD(() => {
    const saved = localStorage.getItem(VKEY) || "";
    return saved;
  });
  const phaseOf = (id) => phases.find((p) => p.id === id);

  const people = useDM(() => {
    const set = new Set();
    (members || []).forEach((m) => m.name && m.name !== "You" && set.add(m.name));
    tasks.forEach((t) => assigneesOf(t).forEach((n) => n && set.add(n)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks, members]);

  // if saved person no longer exists, fall back to project view
  const personal = who && people.includes(who);
  const changeWho = (v) => {
    setWho(v);
    if (v) localStorage.setItem(VKEY, v);else localStorage.removeItem(VKEY);
  };

  const viewTasks = personal ? tasks.filter((t) => assigneesOf(t).includes(who)) : tasks;
  const myIds = useDM(() => new Set(viewTasks.map((t) => t.id)), [viewTasks]);
  const viewRisks = personal ? risks.filter((r) => (r.taskIds || []).some((id) => myIds.has(id))) : risks;
  const viewProducts = personal ? products.filter((p) => (p.taskIds || []).some((id) => myIds.has(id))) : products;

  const done = viewTasks.filter((t) => t.status === "done").length;
  const active = viewTasks.filter((t) => t.status === "inprogress");
  const openRisks = viewRisks.filter((r) => r.status !== "closed").length;

  // project view: group active by person
  const byPerson = useDM(() => {
    const out = [];const idx = {};
    active.forEach((t) => {
      const keys = assigneesOf(t).length ? assigneesOf(t) : ["\u2014 Unassigned"];
      keys.forEach((n) => {if (idx[n] == null) {idx[n] = out.length;out.push({ name: n, tasks: [] });}out[idx[n]].tasks.push(t);});
    });
    out.sort((a, b) => (a.name.startsWith("\u2014") ? 1 : 0) - (b.name.startsWith("\u2014") ? 1 : 0) || b.tasks.length - a.tasks.length);
    return out;
  }, [active]);

  // personal view: group all my tasks by status
  const byStatus = useDM(() => STATUS_ORDER.map((st) => ({ ...st, tasks: viewTasks.filter((t) => t.status === st.id) })).filter((g) => g.tasks.length), [viewTasks]);

  const depTasks = viewTasks.filter((t) => (t.deps || []).length && t.status !== "done");
  let blockedCount = 0,extCount = 0;
  depTasks.forEach((t) => (t.deps || []).forEach((d) => {const r = resolveDep(d, tasks, products);if (r.external) extCount++;else if (r.blocked) blockedCount++;}));

  const topRisks = [...viewRisks].sort((a, b) => LVL[b.likelihood] * LVL[b.impact] - LVL[a.likelihood] * LVL[a.impact]).slice(0, 5);
  const firstName = personal ? who.split(/\s+/)[0] : "";

  return (
    <div className="view-scroll">
      <div className="dash">
        <section className="dash-hero">
          <div className="dash-hero-main">
            <div className="eyebrow" style={{ marginBottom: 14 }}>{personal ? "Personal view" : "Project overview"}</div>
            <UI.Editable className="dash-title serif" tag="h1" value={s.meta?.project} onChange={(v) => Store.setState((st) => ({ ...st, meta: { ...st.meta, project: v || "Untitled" } }))} placeholder="Project name" />
            {!personal && <UI.Editable className="dash-lead" tag="p" multiline value={s.businessCase?.purpose || ""} onChange={(v) => Store.setState((st) => ({ ...st, businessCase: { ...st.businessCase, purpose: v } }))} placeholder="Add a business purpose to summarise this project here." />}
            {personal && <p className="dash-lead">Showing only {who}'s tasks and the risks on work they're assigned to.</p>}
            <div className="row" style={{ gap: 10, marginTop: 24, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => go("business")}><Icon name="doc" size={15} /> Read the business case</button>
              <button className="btn" onClick={() => go("kanban")}><Icon name="board" size={15} /> Open the board</button>
              <button className="btn" onClick={() => setShowAI(true)}><Icon name="bulb" size={15} /> Fill with AI</button>
            </div>
          </div>
          <div className="dash-right">
            <HeroImage projectId={s.id} />
            <div className="dash-viewbox no-print">
            <div className="dash-viewbox-label">View</div>
            <div className="dash-viewselect" style={{ fontFamily: "system-ui" }}>
              {personal && <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{initials(who)}</span>}
              {!personal && <span className="dash-viewglobe"><Icon name="users" size={16} /></span>}
              <select value={personal ? who : ""} onChange={(e) => changeWho(e.target.value)}>
                <option value="">Project view — everything</option>
                {people.length > 0 && <option disabled>──────────</option>}
                {people.map((p) => <option key={p} value={p}>{p} — personal</option>)}
              </select>
              <Icon name="chevD" size={15} />
            </div>
            <div className="dash-viewhint">{personal ? "Only this person's work" : "Everyone's work"}</div>
            </div>
          </div>
        </section>

        <section className="dash-stats">
          <Stat n={active.length} label="In progress" icon="board" />
          <Stat n={done} label="Completed" icon="check" />
          <Stat n={blockedCount + extCount} label="Dependencies" icon="link" accent={blockedCount > 0} />
          <Stat n={openRisks} label={personal ? "Their risks" : "Open risks"} icon="shield" accent={openRisks > 0} />
          <Stat n={viewProducts.length} label="Deliverables" icon="box" />
        </section>

        <div className="dash-cols">
          <section className="dash-panel">
            <div className="dash-panel-hd">
              <span className="card-hd">{personal ? `${firstName}'s tasks` : "In progress now"}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => go(personal ? "actions" : "kanban")}>{personal ? "Actions" : "Board"} <Icon name="arrowR" size={13} /></button>
            </div>

            {!personal &&
            <div className="active-people">
                {active.length === 0 && <div className="dash-empty">Nothing in progress. Move a card into <b>In&nbsp;Progress</b> to see who's working on what.</div>}
                {byPerson.map((grp) =>
              <div key={grp.name} className="person-group">
                    <div className="person-hd">
                      <span className="avatar" style={{ background: grp.name.startsWith("\u2014") ? "var(--ink-ghost)" : "var(--ink)" }}>{grp.name.startsWith("\u2014") ? "?" : initials(grp.name)}</span>
                      <span className="person-name">{grp.name.startsWith("\u2014") ? "Unassigned" : grp.name}</span>
                      <span className="person-count">{grp.tasks.length}</span>
                    </div>
                    <div className="person-tasks">
                      {grp.tasks.map((t) => <TaskLine key={t.id} t={t} ph={phaseOf(t.phase)} onOpen={setOpenTask} />)}
                    </div>
                  </div>
              )}
              </div>
            }

            {personal &&
            <div className="active-people">
                {viewTasks.length === 0 && <div className="dash-empty">{who} isn't assigned to any tasks yet. Assign them on a task card.</div>}
                {byStatus.map((g) =>
              <div key={g.id} className="person-group">
                    <div className="person-hd">
                      <span className={"status-dot s-" + g.id} style={{ width: 10, height: 10, margin: 0 }} />
                      <span className="person-name">{g.label}</span>
                      <span className="person-count">{g.tasks.length}</span>
                    </div>
                    <div className="person-tasks">
                      {g.tasks.map((t) => <TaskLine key={t.id} t={t} ph={phaseOf(t.phase)} onOpen={setOpenTask} />)}
                    </div>
                  </div>
              )}
              </div>
            }
          </section>

          <section className="dash-panel">
            <div className="dash-panel-hd">
              <span className="card-hd">{personal ? `${firstName}'s risks` : "Top risks"}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => go("risks")}>All risks <Icon name="arrowR" size={13} /></button>
            </div>
            <div className="dash-risks">
              {topRisks.length === 0 && <div className="dash-empty">{personal ? "No risks linked to their tasks." : "No risks captured yet."}</div>}
              {topRisks.map((r) => {
                const rem = remediation(r, tasks);
                return (
                  <div key={r.id} className="dash-risk" onClick={() => go("risks")}>
                    <span className="risk-score sm" style={{ background: scoreColor(r.likelihood, r.impact) }}>{LVL[r.likelihood] * LVL[r.impact]}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="dash-risk-title">{r.title}</span>
                      {rem.state !== "none" && <span className="dash-risk-rem" style={{ color: REMED[rem.state].c }}>{REMED[rem.state].label} · {rem.done}/{rem.total}</span>}
                    </span>
                  </div>);

              })}
            </div>
          </section>
        </div>

        <section className="dash-panel" style={{ marginBottom: 30 }}>
          <div className="dash-panel-hd">
            <span className="card-hd">Dependencies & blockers</span>
            <span className="dep-summary">
              {blockedCount > 0 && <span className="dep-pill blocked"><span className="dep-flag">●</span> {blockedCount} blocking</span>}
              {extCount > 0 && <span className="dep-pill ext"><Icon name="link" size={12} /> {extCount} external</span>}
              {blockedCount + extCount === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No open dependencies</span>}
            </span>
          </div>
          {depTasks.length === 0 && <div className="dash-empty">{personal ? "None of their tasks have open dependencies." : "No open dependencies. Add them on any task card."}</div>}
          <div className="dep-grid">
            {depTasks.map((t) =>
            <div key={t.id} className="dep-card" onClick={() => setOpenTask(t)}>
                <div className="dep-card-task"><span className={"status-dot s-" + t.status} />{t.title}</div>
                <div className="dep-card-needs">
                  {(t.deps || []).map((d) => {
                  const r = resolveDep(d, tasks, products);
                  return <span key={d.id} className={"dep-need" + (r.external ? " ext" : r.blocked ? " blocked" : " ok")} title={r.scope}><Icon name={r.icon} size={11} />{r.name}{r.external && r.scope ? ` (${r.scope})` : ""}</span>;
                })}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
      {openTask && <CardModal task={openTask} onClose={() => setOpenTask(null)} />}
      {showAI && <AISetup onClose={() => setShowAI(false)} />}
    </div>);

}

function TaskLine({ t, ph, onOpen }) {
  return (
    <div className="person-task" onClick={() => onOpen(t)}>
      <span className="prio-pip" style={{ background: PRIO[t.priority]?.c }} />
      <span className="person-task-title">{t.title}</span>
      {ph && <span className="person-task-phase">{ph.label}</span>}
    </div>);

}

function Stat({ n, label, icon, accent }) {
  return (
    <div className={"stat" + (accent ? " accent" : "")}>
      <span className="stat-icon"><Icon name={icon} size={17} /></span>
      <span className="stat-n serif">{n}</span>
      <span className="stat-label">{label}</span>
    </div>);

}

function HeroImage({ projectId }) {
  const KEY = "atlas.hero." + projectId;
  const [url, setUrl] = React.useState(null);
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    let u;
    Store.files.get(KEY).then((blob) => {
      if (blob) { u = URL.createObjectURL(blob); setUrl(u); }
    });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [projectId]);
  const onFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    await Store.files.put(KEY, file);
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(file));
  };
  const onDrop = (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); };
  const remove = async () => { await Store.files.del(KEY); if (url) URL.revokeObjectURL(url); setUrl(null); };

  if (url) {
    return (
      <div className="hero-img-wrap">
        <img src={url} className="hero-img" alt="Project cover" />
        <div className="hero-img-actions no-print">
          <button className="btn btn-sm btn-ghost" onClick={() => inputRef.current.click()}><Icon name="edit" size={13} /> Change</button>
          <button className="btn btn-sm btn-ghost btn-danger" onClick={remove}><Icon name="trash" size={13} /></button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
      </div>
    );
  }
  return (
    <div className="hero-img-drop no-print" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current.click()}>
      <Icon name="image" size={22} />
      <span>Add a cover image</span>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}

Object.assign(window, { Dashboard });

// ======== app.jsx ========
/* ============================================================
   APP SHELL — projects landing + per-project sidebar & routing
   ============================================================ */
const { useState: useApp } = React;

// sections that can be toggled on/off per project
const TOGGLEABLE = {
  comms: "Communication plan",
  change: "Change management",
  scope: "Scope",
  business: "Business case",
  preanalysis: "Pre-analysis",
  catalogue: "Product catalogue",
  org: "Roles & org chart"
};
const DEFAULT_ON = ["comms", "change", "scope", "business", "preanalysis", "catalogue", "org"];

const NAV = [
{ group: "Overview", items: [
  { id: "home", label: "Front page", icon: "home" },
  { id: "scope", label: "Scope", icon: "scope" },
  { id: "business", label: "Business case", icon: "doc" }]
},
{ group: "Delivery", items: [
  { id: "kanban", label: "Kanban board", icon: "board", count: (s) => s.tasks.length },
  { id: "actions", label: "Action list & timeline", icon: "timeline", count: (s) => s.tasks.length },
  { id: "catalogue", label: "Product catalogue", icon: "box", count: (s) => s.products.length }]
},
{ group: "People", items: [
  { id: "members", label: "Project members", icon: "users", count: (s) => (s.members || []).length },
  { id: "org", label: "Roles & org chart", icon: "org" }]
},
{ group: "Change & comms", items: [
  { id: "comms", label: "Communication plan", icon: "comms", count: (s) => (s.commPlan || []).length },
  { id: "change", label: "Change management", icon: "swap", count: (s) => (s.changePlan && s.changePlan.groups || []).reduce((a, g) => a + g.rows.length, 0) }]
},
{ group: "Insight", items: [
  { id: "preanalysis", label: "Pre-analysis", icon: "bulb", count: (s) => s.findings.length },
  { id: "risks", label: "Risks & mitigation", icon: "shield", count: (s) => s.risks.length },
  { id: "kpis", label: "KPIs & progress", icon: "target", count: null },
  { id: "glossary", label: "Glossary", icon: "tag", count: (s) => (s.glossary || []).length }]
}];


const TITLES = {
  home: ["Front page", "Project overview & quick links"],
  scope: ["Scope", "Boundaries and as-is / to-be"],
  business: ["Business case", "Purpose, outcomes & justification"],
  kanban: ["Kanban board", "Backlog → In progress → Done"],
  actions: ["Actions & timeline", "Plan of work by phase"],
  catalogue: ["Product catalogue", "Deliverables produced by the project"],
  members: ["Project members", "Everyone working on the project"],
  org: ["Roles & responsibilities", "Reporting structure"],
  comms: ["Communication plan", "Who hears what, when and how"],
  change: ["Change management plan", "Activities that embed the change"],
  preanalysis: ["Pre-analysis", "Early research findings"],
  risks: ["Risks & mitigation", "What could go wrong, and the plan"],
  kpis: ["KPIs & progress", "Live workload and project-health metrics"],
  glossary: ["Glossary", "Terms used in this project — highlighted everywhere they appear"]
};

function App() {
  const root = Store.useRoot();
  const [view, setView] = useApp(() => location.hash.slice(1) || "home");
  const [showSync, setShowSync] = useApp(false);
  const [showSections, setShowSections] = useApp(false);
  React.useEffect(() => {
    const h = () => setView(location.hash.slice(1) || "home");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  React.useEffect(() => {if (window.initSync) window.initSync();}, []);
  React.useEffect(() => {if (window.setupGlossaryHighlighter) window.setupGlossaryHighlighter();}, []);
  const go = (v) => {location.hash = v;setView(v);};

  const s = root.activeId ? Store.getState() : null;
  const enabledSections = (s && Array.isArray(s._enabledSections)) ? s._enabledSections : DEFAULT_ON;
  const isSectionOn = (id) => !TOGGLEABLE[id] || enabledSections.includes(id);

  // if current view is toggled off, redirect home
  React.useEffect(() => {
    if (s && TOGGLEABLE[view] && !isSectionOn(view)) go("home");
  }, [enabledSections, view, !!s]);

  // top-level: no active project, or explicit projects route → landing
  if (!root.activeId || view === "projects" || !s) {
    return <ProjectsHome />;
  }

  const [title, sub] = TITLES[view] || ["", ""];
  const parent = s.parentId ? root.projects.find((p) => p.id === s.parentId) : null;

  const toggleSection = (id) => {
    const next = enabledSections.includes(id) ? enabledSections.filter((x) => x !== id) : [...enabledSections, id];
    Store.setState((st) => ({ ...st, _enabledSections: next }));
  };

  const Views = {
    home: window.Dashboard, business: window.BusinessCase, kanban: window.Kanban,
    actions: window.Actions, catalogue: window.Catalogue, members: window.Members, stakeholders: window.Members,
    org: window.OrgChart, preanalysis: window.PreAnalysis, risks: window.Risks, scope: window.ScopePage,
    comms: window.CommPlan, change: window.ChangePlan, glossary: window.Glossary, kpis: window.KPIs
  };
  const Current = Views[view] || (() => <div className="view-pad">Not found</div>);

  return (
    <div className="app">
      <aside className="sidebar no-print">
        <button className="proj-switch" onClick={() => { Store.projects.close(); go("projects"); }}>
          <span className="proj-switch-mark" style={{ background: "var(--t-" + (s.color || "indigo") + ")" }}>{(s.meta?.project || "P")[0]}</span>
          <span className="proj-switch-text">
            <span className="proj-switch-name">{s.meta?.project}</span>
            <span className="proj-switch-code mono">{parent ? "↗ " + parent.meta?.project : "View portfolio"}</span>
          </span>
          <span className="proj-switch-ico"><Icon name="chevD" size={15} /></span>
        </button>
        <button className="all-proj no-print" onClick={() => { Store.projects.close(); go("projects"); }}><Icon name="layers" size={14} /> All projects</button>

        {NAV.map((grp) => {
          const visibleItems = grp.items.filter((it) => isSectionOn(it.id));
          if (!visibleItems.length) return null;
          return (
            <div className="nav-group" key={grp.group}>
              <div className="nav-label">{grp.group}</div>
              {visibleItems.map((it) =>
              <button key={it.id} className={"nav-item" + (view === it.id ? " active" : "")} onClick={() => go(it.id)}>
                  <Icon name={it.icon} />
                  <span className="grow" style={{ textAlign: "left" }}>{it.label}</span>
                  {it.count && <span className="nav-count">{it.count(s)}</span>}
                </button>
              )}
            </div>);

        })}
        <div className="sidebar-foot">
          <button className="sync-badge" onClick={() => setShowSections(true)}>
            <span className="sync-dot" style={{ background: "var(--accent)" }} />
            <span className="grow" style={{ textAlign: "left" }}>add or remove
sections</span>
            <Icon name="layers" size={13} />
          </button>
          <SyncBadge onClick={() => setShowSync(true)} />
        </div>
      </aside>

      <main className="main">
        <header className="topbar no-print">
          <h1>{title}</h1>
          <span className="topbar-sub">{sub}</span>
          <div className="topbar-actions">
            <button className="btn" onClick={() => window.print()} title="Print this view to PDF"><Icon name="print" size={15} /> Print / PDF</button>
          </div>
        </header>
        <div className="print-head print-only">
          <div className="print-head-l">
            <span className="print-brand">Atlas</span>
            <span className="print-proj">{parent ? parent.meta?.project + " / " : ""}{s.meta?.project}</span>
          </div>
          <div className="print-head-r">
            <span className="print-view">{title}</span>
            <span className="print-date">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
        </div>
        <Current go={go} />
      </main>
      <SyncToast />
      {showSync && <SyncPanel onClose={() => setShowSync(false)} />}
      {showSections && <SectionsModal enabled={enabledSections} onToggle={toggleSection} onClose={() => setShowSections(false)} />}
    </div>);
}

function SectionsModal({ enabled, onToggle, onClose }) {
  return (
    <UI.Modal narrow onClose={onClose}>
      <div className="modal-hd">
        <div className="grow">
          <div className="cm-title" style={{ fontSize: 21 }}>Customise sections</div>
          <div className="muted" style={{ fontSize: 13 }}>Turn off sections that aren't relevant to this project. They stay hidden from the sidebar — turn them back on any time.</div>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-bd">
        <div className="sections-list">
          {Object.entries(TOGGLEABLE).map(([id, label]) => {
            const on = enabled.includes(id);
            return (
              <label key={id} className={"section-toggle" + (on ? " on" : "")}>
                <input type="checkbox" checked={on} onChange={() => onToggle(id)} />
                <Icon name={NAV.flatMap((g) => g.items).find((i) => i.id === id)?.icon || "doc"} size={16} />
                <span className="grow">{label}</span>
                {!on && <span className="section-off-label">Hidden</span>}
              </label>);

          })}
        </div>
      </div>
      <div className="modal-ft">
        <span className="muted" style={{ fontSize: 12 }}>Changes apply immediately to this project only.</span>
        <div className="grow" />
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </UI.Modal>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
