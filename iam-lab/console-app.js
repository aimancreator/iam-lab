(function () {
  "use strict";

  const engine = window.IamConsole;
  const main = document.getElementById("console-main");
  const labels = { users: "Users", groups: "User groups", policies: "Policies", roles: "Roles", buckets: "Buckets", instances: "Instances" };
  const singular = { users: "user", groups: "group", policies: "policy", roles: "role", buckets: "bucket", instances: "simulated instance" };
  const decisions = { allowed: "Allowed", implicitDeny: "Implicit deny", explicitDeny: "Explicit deny", noCredentials: "No credentials", expired: "Session expired" };
  let state = engine.freshState();
  let toastTimer;
  let submitEditor;
  let bucketPrefix = "";
  let objectiveId = "separate-teams";

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function storageWarning(message) {
    const warning = document.getElementById("storage-warning");
    warning.textContent = message;
    warning.hidden = false;
  }

  try {
    const saved = localStorage.getItem(engine.storageKey);
    if (saved) state = engine.normalize(JSON.parse(saved));
  } catch (error) {
    storageWarning("Saved practice could not be restored. This tab starts fresh. " + error.message);
  }

  function save() {
    engine.advance(state);
    try { localStorage.setItem(engine.storageKey, JSON.stringify(state)); }
    catch (error) { storageWarning("Changes work in this tab but cannot be saved. Keep this tab open to keep practising."); }
  }

  function toast(message, error) {
    const status = document.getElementById("console-status");
    clearTimeout(toastTimer);
    status.textContent = message;
    status.className = "toast" + (error ? " error" : "");
    status.hidden = false;
    toastTimer = setTimeout(function () { status.hidden = true; }, 6000);
  }

  function route() {
    const parts = location.hash.slice(1).split("/");
    let name = "";
    try { name = decodeURIComponent(parts.slice(1).join("/")); } catch (error) { name = ""; }
    return { type: parts[0] === "s3" ? "buckets" : parts[0] || "home", name: name };
  }

  function link(type, name) { return "#" + (type === "buckets" ? "s3" : type) + (name ? "/" + encodeURIComponent(name) : ""); }
  function button(action, text, attributes = "") { return '<button type="button" data-action="' + action + '" ' + attributes + '>' + escape(text) + '</button>'; }
  function panel(title, body) { return '<section class="panel"><div class="panel-header"><h2>' + escape(title) + '</h2></div><div class="panel-body">' + body + '</div></section>'; }
  function notice(message, kind = "") { return '<div class="notice ' + kind + '">' + escape(message) + '</div>'; }
  function json(document) { return '<pre>' + escape(JSON.stringify(document, null, 2)) + '</pre>'; }
  function field(title, name, value = "", help = "") { return '<label class="field">' + escape(title) + '<input name="' + name + '" value="' + escape(value) + '"' + (name === "name" ? ' required maxlength="64" autocomplete="off"' : '') + '>' + (help ? '<small>' + escape(help) + '</small>' : '') + '</label>'; }
  function options(items, selected, empty) {
    return (empty == null ? "" : '<option value="">' + escape(empty) + '</option>') + items.map(function (item) {
      return '<option value="' + escape(item.name) + '"' + (selected === item.name ? " selected" : "") + '>' + escape(item.name) + '</option>';
    }).join("");
  }
  function select(title, name, items, selected = "", empty = "Choose…") { return '<label class="field">' + escape(title) + '<select name="' + name + '">' + options(items, selected, empty) + '</select></label>'; }
  function checks(type, name, selected = []) {
    return state[type].length ? '<div class="check-list">' + state[type].map(function (item) {
      return '<label class="check-row"><input type="checkbox" name="' + name + '" value="' + escape(item.name) + '"' + (selected.includes(item.name) ? " checked" : "") + '><span>' + escape(item.name) + '</span></label>';
    }).join("") + '</div>' : notice("No " + labels[type].toLowerCase() + " yet. You can add them later.");
  }
  function heading(title, description, actions = "") {
    return '<div class="breadcrumbs"><a href="#home">Console home</a><span>›</span><span>' + escape(title) + '</span></div><div class="page-heading"><div><h1>' + escape(title) + '</h1><p>' + escape(description) + '</p></div>' + actions + '</div>';
  }
  function table(headers, rows) {
    return '<div class="table-scroll"><table><thead><tr>' + headers.map(function (header) { return '<th scope="col">' + escape(header) + '</th>'; }).join("") + '</tr></thead><tbody>' + rows.map(function (row) { return '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table></div>';
  }
  function resourceLink(type, name) { return '<a href="' + link(type, name) + '">' + escape(name) + '</a>'; }

  function assumptionChecklist(result) {
    if (!result.checks) return "";
    return '<section aria-label="Role assumption requirements"><h3>Three checks before a role session</h3><ul class="trace">' + result.checks.map(function (check) {
      return '<li class="' + (check.pass ? "match" : "deny") + '"><strong>' + (check.pass ? "PASS · " : "NOT MET · ") + escape(check.label) + '</strong>' + (!check.pass ? '<p>' + escape(check.hint) + '</p><a href="#' + escape(check.route) + '">Open ' + (check.id === "caller" ? "user permissions" : check.id === "trust" ? "role trust" : "Switch role") + ' →</a>' : '') + '</li>';
    }).join("") + '</ul>' + (result.pass ? '<p class="help">This request behaved as the objective expects. In the without-MFA test, MFA is deliberately absent and denial is the correct result.</p>' : '') + '</section>';
  }

  function trustFields(role) {
    return '<label class="field">Trusted entity<select name="trust"><option value="ec2"' + (role.trust === "ec2" ? " selected" : "") + '>AWS service: EC2</option><option value="user"' + (role.trust === "user" ? " selected" : "") + '>IAM user (with MFA)</option></select></label><div data-user-trust' + (role.trust === "ec2" ? " hidden" : "") + '>' + select("Trusted IAM user", "trustedUser", state.users, role.trustedUser, "No trusted user") + '<p class="help">This lab requires MFA and caller permission to assume a user-trusted role.</p></div>';
  }

  function renderChrome() {
    const current = route();
    document.getElementById("console-nav").innerHTML = '<div class="nav-title">PRACTICE ACCOUNT</div><a href="#home"' + (current.type === "home" ? ' class="active"' : '') + '>Console home</a><div class="nav-title">IDENTITY & ACCESS</div>' + ["users", "groups", "policies", "roles", "buckets", "instances"].map(function (type) {
      return (type === "buckets" ? '<div class="nav-title">STORAGE & COMPUTE</div>' : '') + '<a href="' + link(type) + '"' + (current.type === type ? ' class="active" aria-current="page"' : '') + '>' + (type === "buckets" ? "S3 buckets" : type === "instances" ? "EC2 instances" : labels[type]) + '<span class="nav-count">' + state[type].length + '</span></a>';
    }).join("") + '<div class="nav-title">EXPERIMENT</div><a href="#objectives"' + (current.type === "objectives" ? ' class="active" aria-current="page"' : '') + '>Objectives & checks</a><a href="#switch-role">Switch role</a><a href="#history">Request history</a>';
    const identity = document.getElementById("identity");
    identity.innerHTML = '<option value="">Lab administrator</option>' + options(state.users, state.session.kind === "user" ? state.session.name : "", null) + (state.session.kind === "role" ? '<option value="__role_session__" selected>Role: ' + escape(state.session.name) + '</option>' : '');
    if (state.session.kind === "admin") identity.value = "";
    renderCoach();
    document.getElementById("coach").insertAdjacentHTML("afterbegin", '<a class="button objective-shortcut" href="#objectives">Check your objectives →</a>');
  }

  function objectivePage() {
    const objective = window.IamObjectives.objectives.find(function (item) { return item.id === objectiveId; });
    const report = window.IamObjectives.grade(state, objectiveId);
    const status = report.status === "pass" ? "Objective met" : report.status === "blocked" ? "Setup needed" : "Not met yet";
    const checksHtml = report.results.map(function (result) {
      const label = result.status === "pass" ? "PASS" : result.status === "blocked" ? "BLOCKED" : "FAIL";
      return '<li class="objective-check ' + result.status + '"><div class="objective-check-title"><span class="pill ' + (result.status === "pass" ? "green" : "orange") + '">' + label + '</span><h3>' + escape(result.title) + '</h3></div><dl class="metadata"><div><dt>Expected</dt><dd>' + escape(result.expected) + '</dd></div><div><dt>Current result</dt><dd>' + escape(result.actual) + '</dd></div></dl>' + assumptionChecklist(result) + (result.status !== "pass" && !result.checks ? '<p>' + escape(result.hint) + '</p><a href="#' + escape(result.route) + '">Open ' + escape(result.route) + ' →</a>' : '') + (result.trace ? '<details><summary>Why this result?</summary>' + (result.request ? '<p><code>' + escape(result.request.action + " · " + result.request.resource) + '</code></p>' : '') + '<ul class="trace">' + (result.trace.length ? result.trace.map(function (entry) { return '<li class="' + (entry.matches ? entry.effect === "Deny" ? "deny" : "match" : "") + '"><strong>' + escape(entry.source + " / " + entry.sid) + '</strong><small>' + escape(entry.effect + ": " + entry.reason) + '</small></li>'; }).join("") : '<li>No applicable policy statements.</li>') + '</ul></details>' : '') + '</li>';
    }).join("");
    return heading("Objectives & checks", "Build the setup yourself, then see whether it meets the requirements.") + panel("Choose your objective", '<label for="objective-choice">Practice scenario</label><select id="objective-choice">' + window.IamObjectives.objectives.map(function (item) { return '<option value="' + item.id + '"' + (item.id === objectiveId ? " selected" : "") + '>' + escape(item.title) + '</option>'; }).join("") + '</select><h2 class="objective-title">' + escape(objective.title) + '</h2><p>' + escape(objective.brief) + '</p><details><summary>Setup hints and required names</summary><p>' + escape(objective.setup) + '</p><p>Each required bucket needs an object named example.txt. Use fictional text.</p></details>') + '<section class="panel" aria-label="Objective results"><div class="panel-header"><div role="status"><h2>' + status + '</h2><span>' + report.passed + ' / ' + report.total + ' checks passed</span></div>' + button("check-objective", "Check again", 'class="primary"') + '</div><div class="panel-body"><p>These results check your current local setup, regardless of the identity selected in the header. Checks do not change resources, sessions, history or guided progress.</p>' + (report.missing.length ? notice("Missing: " + report.missing.join("; "), "warning") : '') + '<ul class="objective-checks">' + checksHtml + '</ul></div></section>' + notice("Scenarios are separate targets: swapping access or adding a Deny can make an earlier objective stop passing. Results are recalculated whenever you open this page or click Check again. Only the listed requests are checked; this is not a full IAM security audit or a check of FakeCloud/live AWS.") + window.IamVisuals.card(objective.picture);
  }

  function renderCoach() {
    const lesson = engine.lessons.find(function (item) { return item.id === state.chapter; });
    const complete = lesson.steps.filter(function (step) { return state.completed.includes(step.id); }).length;
    const next = lesson.steps.find(function (step) { return !state.completed.includes(step.id); });
    document.getElementById("coach").innerHTML = '<p class="coach-label">YOUR PRACTICE COACH</p><div class="segmented">' + button("guided", "Guided", 'aria-pressed="' + (state.mode === "guided") + '"') + button("free", "Free practice", 'aria-pressed="' + (state.mode === "free") + '"') + '</div>' + (state.mode === "free" ? '<h2>Make it your own</h2><p>Create identities and buckets, change one permission, and test again. Inspect Request history to compare outcomes.</p>' + window.IamVisuals.card("overview", { compact: true }) : '<label for="chapter">Learning path</label><select id="chapter">' + engine.lessons.map(function (item) { return '<option value="' + item.id + '"' + (item.id === state.chapter ? ' selected' : '') + '>' + escape(item.title) + '</option>'; }).join("") + '</select><div class="coach-progress"><span>Completed exercises</span><span>' + complete + ' / ' + lesson.steps.length + '</span></div><progress aria-label="Learning path progress" value="' + complete + '" max="' + lesson.steps.length + '"></progress>' + (next ? '<section class="task-card"><span class="eyebrow">YOUR NEXT EXERCISE</span><h2>' + escape(next.title) + '</h2><details open><summary>Show instructions</summary><p>' + escape(next.hint) + '</p></details><a class="button" href="#' + next.route + '">Go to this service →</a></section>' : notice("Path complete! Repeat from an empty account or try the other path.", "success")) + '<ol class="step-list">' + lesson.steps.map(function (step) { const done = state.completed.includes(step.id); return '<li class="' + (done ? "done" : step === next ? "current" : "") + '"><span>' + (done ? "✓" : "○") + '</span>' + escape(step.title) + '</li>'; }).join("") + '</ol>' + window.IamVisuals.card(next ? next.picture : "overview", { compact: true })) + '<p class="coach-note">Completed exercises stay checked until you restart. Setup and progress are separate from your original learning lab.</p>' + button("reset", "Restart this practice");
  }

  function home() {
    return '<section class="hero"><span class="eyebrow">LEARN THE CONSOLE BY USING IT</span><h1>Your first cloud account.<br>Room to make mistakes.</h1><p>Create users, give teams permissions, and discover why an S3 request succeeds or fails. Then let an EC2 application use a role.</p><div class="buttons"><a class="button" href="#s3">Start with S3 →</a><a class="button" href="#users">Explore IAM</a></div></section><div class="service-grid">' + [["users", "IAM", "Who can do what?", "Users, groups, policies and roles"], ["buckets", "S3", "Your practice files", "Private buckets and object requests"], ["instances", "EC2", "Your application identity", "Instance profiles and role permissions"]].map(function (service) { return '<a class="service-card" href="' + link(service[0]) + '"><span class="service-icon">' + service[1] + '</span><h2>' + service[2] + '</h2><p>' + service[3] + '</p><small>Open service →</small></a>'; }).join("") + '</div>' + panel("How to practise", '<ol><li>As <strong>Lab administrator</strong>, build the setup in the coach.</li><li>Use <strong>Practice as identity</strong> to test as a learner.</li><li>Make an S3 request and read the explanation.</li><li>Return to administrator, change one rule, and repeat.</li></ol><p>This is an independent console-style training tool. It does not sign in to AWS or provision resources.</p>') + window.IamVisuals.card("overview");
  }

  function listing(type) {
    let items = state[type];
    let result;
    if (type === "buckets") {
      result = engine.s3(state, { action: "s3:ListAllMyBuckets" });
      save();
      items = result.success ? items : [];
    }
    const description = { users: "Identities start with no permissions. Attach policies directly or through groups.", groups: "Share job permissions with group members: a simple RBAC model.", policies: "Reusable JSON rules. A policy grants nothing until attached.", roles: "Trust decides who can assume a role. Permissions decide what its session can do.", buckets: "All buckets are private. Seeing a name does not grant access to its objects.", instances: "Simulated applications use an EC2 role through an instance profile." };
    return heading(labels[type], description[type], state.session.kind === "admin" ? button("create", "Create " + singular[type], 'class="primary"') : '') + (result && !result.success ? notice("Access denied: your identity cannot list bucket names. You can still try a known bucket using its exact name.", "warning") : '') + panel(labels[type] + " (" + items.length + ")", items.length ? table(["Name", "Configuration"], items.map(function (item) {
      let info = item.policies ? item.policies.length + " attached policies" : "";
      if (type === "groups") info += " · " + item.members.length + " members";
      if (type === "roles") info += " · Trust: " + (item.trust === "ec2" ? "EC2" : item.trustedUser || "No user");
      if (type === "buckets") info = "Block Public Access: enabled";
      if (type === "instances") info = "IAM role: " + (item.profile || "None");
      if (type === "policies") info = "Customer managed · local simulation";
      return [resourceLink(type, item.name), escape(info)];
    })) : '<div class="empty"><h3>No resources to display</h3><p>' + (state.session.kind === "admin" ? "Create your first " + singular[type] + " to begin." : "Use a known bucket name to test access.") + '</p></div>') + (type === "buckets" ? panel("Open a known bucket", '<form data-form="open-bucket" class="inline-form">' + field("Bucket name", "bucket", "", "This navigation does not grant permission.") + '<button type="submit">Open bucket</button></form>') : '');
  }

  function permissions(type, item) {
    return panel("Permissions", '<form data-form="permissions"><p>Select the managed policies attached to this ' + singular[type] + '.</p>' + checks("policies", "policies", item.policies) + '<div class="buttons"><button type="submit">Save permissions</button></div></form>');
  }

  function requestForm(bucket, instance) {
    return '<form data-form="request"' + (instance ? ' data-instance="' + escape(instance) + '"' : '') + '><div class="field-grid">' + field("Bucket name", "bucket", bucket) + '<label class="field">Action<select name="action"><option value="s3:GetObject">GetObject — read</option><option value="s3:PutObject">PutObject — upload</option><option value="s3:DeleteObject">DeleteObject — delete</option><option value="s3:ListBucket">ListBucket — list keys</option><option value="s3:GetBucketLocation">GetBucketLocation — location</option></select></label>' + field("Object key", "key", "example.txt") + field("Listing prefix", "prefix", "", "Used only for ListBucket, for example training/.") + '</div><label class="field">Fictional text for PutObject<textarea name="body" rows="3" maxlength="4096">Hello from the practice console.</textarea></label><button class="primary" type="submit">Send request</button></form>';
  }

  function bucketDetail(name) {
    const result = engine.s3(state, { action: "s3:ListBucket", bucket: name, prefix: bucketPrefix });
    save();
    return heading(name, "S3 / Objects · Private bucket · Block Public Access enabled", button("upload", "Upload", 'class="primary"')) + panel("Objects", '<form class="inline-form" data-form="prefix">' + field("Object prefix", "prefix", bucketPrefix) + '<button type="submit">List objects</button></form>' + (result.success ? (result.objects.length ? table(["Key", "Characters", "Actions"], result.objects.map(function (object) { return [escape(object.key), object.size, button("read-object", "Open", 'data-key="' + escape(object.key) + '"') + " " + button("delete-object", "Delete", 'data-key="' + escape(object.key) + '"')]; })) : notice("No objects match this prefix. Upload fictional text to create an object.")) : notice(result.error || decisions[result.decision] + ": this identity cannot list these objects. A direct GetObject request is evaluated separately.", "warning"))) + panel("Direct object request", requestForm(name)) + (state.session.kind === "admin" && engine.find(state, "buckets", name) ? deletion() : '') + window.IamVisuals.card("readOnly");
  }

  function deletion() { return '<details class="danger-zone"><summary>Delete this resource</summary><p>Only this local practice resource is affected.</p>' + button("delete", "Delete resource", 'class="danger"') + '</details>'; }

  function detail(type, name) {
    if (type === "buckets") return bucketDetail(name);
    const item = engine.find(state, type, name);
    if (!item) return heading("Resource not found", "It may have been deleted. Choose a service from the sidebar.");
    let content = heading(name, labels[type] + " / Details");
    if (item.policies) content += permissions(type, item);
    if (type === "users") content += panel("Group memberships", state.groups.filter(function (group) { return group.members.includes(name); }).map(function (group) { return resourceLink("groups", group.name); }).join(" · ") || "No group memberships. Open User groups to assign a job.");
    if (type === "groups") content += panel("Users in this group", '<form data-form="membership">' + checks("users", "members", item.members) + '<div class="buttons"><button type="submit">Save membership</button></div></form>');
    if (type === "policies") content += panel("Policy document", '<form data-form="policy">' + window.IamPolicyEditor.render(item.document, state) + '<div class="buttons"><button class="primary" type="submit">Save policy</button></div></form>');
    if (type === "roles") content += panel("Trust relationships", '<p>Change who can assume this existing role. Its name and attached permission policies stay the same.</p><form data-form="trust">' + trustFields(item) + notice("Replacing EC2 trust stops new EC2 credential requests in this simulator. Existing instance-profile associations remain; changing trust does not revoke an already-issued user role session. Selecting EC2 creates a same-named profile here if one is missing.") + '<button class="primary" type="submit">Save trust</button></form><h3>Saved trust policy</h3>' + json(engine.trustDocument(item)) + '<p>Instance profile: <code>' + escape(item.profile || "None") + '</code>. A profile association is separate from the trust policy.</p>');
    if (type === "instances") content += panel("Modify IAM role", '<div class="flow"><strong>' + escape(name) + '</strong><span>→ profile →</span><strong>' + escape(item.profile || "No role") + '</strong><span>→</span><strong>S3 permissions</strong></div><form data-form="associate">' + select("IAM role (instance profile)", "profile", state.roles.filter(function (role) { return role.profile; }), item.profile, "No IAM role") + '<button type="submit">Save IAM role</button></form>') + panel("Run a request from this application", requestForm("console-bucket-a", name));
    content += window.IamVisuals.card({ users: "user", groups: "rbac", policies: "policy", roles: "assume", instances: "ec2" }[type]) + deletion();
    return content;
  }

  function renderPage() {
    const current = route();
    if (current.type === "home") main.innerHTML = home();
    else if (current.type === "objectives") main.innerHTML = objectivePage();
    else if (current.type === "history") main.innerHTML = heading("Request history", "The most recent 100 requests in this browser. This is a learning log, not AWS CloudTrail.") + panel("Requests", table(["Identity", "Action", "Target", "Result"], state.history.map(function (entry) { return [escape(entry.actor), escape(entry.action), escape([entry.bucket, entry.key].filter(Boolean).join("/")), escape(entry.error || decisions[entry.decision])]; })));
    else if (current.type === "switch-role") main.innerHTML = heading("Switch role", "Assume means obtain a temporary role session. It does not mean attach a policy.") + panel("Assume an IAM role", notice("Select a user in Practice as identity first. This lab checks caller permission, account-delegation trust and simulated MFA.") + '<form data-form="assume">' + select("Role", "role", state.roles.filter(function (role) { return role.trust === "user"; })) + '<label class="check-row"><input type="checkbox" name="mfa">Simulated MFA is present</label><div class="buttons"><button class="primary" type="submit">Switch role</button></div></form>') + window.IamVisuals.card("assume");
    else if (engine.types.includes(current.type)) {
      if (state.session.kind !== "admin" && current.type !== "buckets") main.innerHTML = heading(labels[current.type], "Return to Lab administrator to inspect or change this setup.") + notice("Learner IAM and EC2 administration are outside this simulator. Use S3 to test the active identity’s permissions.");
      else main.innerHTML = current.name ? detail(current.type, current.name) : listing(current.type);
    } else main.innerHTML = heading("Page not found", "Choose a service from the sidebar.");
    renderChrome();
  }

  function render() {
    try { renderPage(); }
    catch (error) {
      main.innerHTML = heading("Unable to open this view", "Check the resource name or choose another service.") + notice(error.message, "error");
      renderChrome();
    }
  }

  function dialog(id, title, content, footer = "") {
    const target = document.getElementById(id);
    target.innerHTML = '<div class="dialog-header"><h2 id="' + id.replace("-dialog", "-title") + '">' + escape(title) + '</h2>' + button("close", "×", 'aria-label="Close dialog"') + '</div>' + content + footer;
    if (!target.open) target.showModal();
    return target;
  }

  function editor(title, fields, callback, submitText = "Save") {
    submitEditor = callback;
    dialog("editor-dialog", title, '<form id="editor-form"><div class="dialog-body"><div id="editor-error" class="notice error" role="alert" hidden></div>' + fields + '</div><div class="dialog-footer">' + button("close", "Cancel") + '<button class="primary" type="submit">' + escape(submitText) + '</button></div></form>');
  }

  function policyFields() {
    return '<details><summary>Start from a template (optional)</summary><label class="field">Template<select name="template"><option value="read">Read objects</option><option value="write">Read and upload objects</option><option value="deny">Explicit deny</option><option value="assume">Assume role</option></select></label>' + field("Bucket name for S3 template", "bucket", "console-bucket-a") + field("Object prefix (optional)", "prefix") + select("Role for Assume role template", "roleName", state.roles) + '<label class="check-row"><input type="checkbox" name="browse" checked>Allow browsing bucket names</label>' + button("generate-policy", "Apply template (replaces draft)") + '</details>' + window.IamPolicyEditor.render(engine.buildPolicy("read", "console-bucket-a"), state);
  }

  function createResource() {
    const type = route().type;
    let fields = field("Name", "name");
    if (["users", "groups", "roles"].includes(type)) fields += '<h3>Permission policies</h3>' + checks("policies", "policies");
    if (type === "groups") fields += '<h3>Group members</h3>' + checks("users", "members");
    if (type === "policies") fields += policyFields();
    if (type === "roles") fields += trustFields({ trust: "ec2", trustedUser: "" }) + notice("An EC2 role receives a same-named instance profile in this simulator.");
    if (type === "instances") fields += select("IAM role", "profile", state.roles.filter(function (role) { return role.profile; }), "", "No IAM role") + notice("Only the IAM part of launching an instance is simulated. No compute, AMI, network or cost is created.");
    if (type === "buckets") fields += '<label class="check-row"><input type="checkbox" checked disabled>Block all public access (always enabled)</label>' + notice("Use 3–63 lowercase letters, numbers or hyphens. Names are unique only within this browser’s practice account.");
    editor("Create " + singular[type], '<div class="wizard-steps"><strong>1. Configure</strong><span>2. Review and create</span></div>' + fields, function (data) {
      const input = Object.fromEntries(data);
      input.policies = data.getAll("policies");
      input.members = data.getAll("members");
      const preview = engine.normalize(state);
      const item = engine.create(preview, type, input);
      editor("Review " + singular[type], '<div class="wizard-steps"><span>1. Configure</span><strong>2. Review and create</strong></div><p>Review this local practice resource before creating it.</p>' + json(item), function () {
        engine.create(state, type, input);
        save();
        location.hash = link(type, item.name);
        toast("Created " + item.name);
      }, "Create " + singular[type]);
      return false;
    }, "Review");
  }

  function showResult(result) {
    const explanation = result.error ? "Authorization allowed the request, but the operation failed: " + result.error : result.principal.kind === "admin" ? "Lab administrator uses a simulated setup privilege. Switch to a user to test their actual policy grants." : result.reason || { allowed: "A matching Allow grants this request, and no matching explicit Deny blocks it.", implicitDeny: "No applicable Allow grants this request, or a required trust check failed.", explicitDeny: "A matching Deny overrides any Allow.", noCredentials: "The application needs a role in an associated instance profile before it can make authenticated requests.", expired: "Assume the role again to obtain a new simulated session." }[result.decision];
    dialog("result-dialog", "Request result", '<div class="dialog-body"><div class="result-heading"><span class="result-symbol' + (result.success ? '' : ' denied') + '">' + (result.success ? "✓" : "×") + '</span><div><h3>' + escape(result.error || decisions[result.decision]) + '</h3><code>' + escape(result.request.action) + '</code></div></div><p>' + escape(explanation) + '</p><dl class="metadata"><div><dt>Identity</dt><dd>' + escape(result.principal.kind + ":" + result.principal.name) + '</dd></div><div><dt>Resource</dt><dd><code>' + escape(result.request.resource) + '</code></dd></div></dl>' + (result.checks ? '<ul>' + result.checks.map(function (check) { return '<li>' + (check.pass ? "✓ " : "× ") + escape(check.label) + '</li>'; }).join("") + '</ul>' : '') + (result.body !== undefined ? '<h3>Object text</h3><pre>' + escape(result.body) + '</pre>' : '') + (result.objects ? json(result.objects) : '') + '<h3>Policy decision trace</h3><ul class="trace">' + (result.trace.length ? result.trace.map(function (entry) { return '<li class="' + (entry.matches ? entry.effect === "Deny" ? "deny" : "match" : "") + '"><strong>' + escape(entry.source + " / " + entry.sid) + '</strong><small>' + escape(entry.effect + ": " + entry.reason) + '</small></li>'; }).join("") : '<li>No applicable policy statements.</li>') + '</ul></div>');
  }

  function runRequest(input, instance) {
    const result = instance ? engine.ec2Request(state, instance, input) : engine.s3(state, input);
    save();
    render();
    showResult(result);
  }

  function confirmAction(title, fields, callback) {
    editor(title, fields, callback, "Confirm");
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest('a[href="#console-main"]')) { event.preventDefault(); main.focus(); return; }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const current = route();
    try {
      const action = target.dataset.action;
      if (action === "close") target.closest("dialog").close();
      if (action === "create") createResource();
      if (action === "check-objective") { render(); toast("Objective checked against the current setup."); }
      if (action === "guided" || action === "free") { state.mode = action; save(); renderCoach(); }
      if (action === "generate-policy") {
        const form = target.closest("form");
        const data = new FormData(form);
        form.querySelector("[data-policy-editor]").outerHTML = window.IamPolicyEditor.render(engine.buildPolicy(data.get("template"), data.get("bucket"), data.get("prefix"), data.has("browse"), data.get("roleName")), state);
      }
      if (action === "upload") editor("Upload fictional text", field("Object key", "key", "example.txt") + '<label class="field">Object text<textarea name="body" maxlength="4096" rows="5">Hello from my practice bucket.</textarea></label>', function (data) { runRequest({ action: "s3:PutObject", bucket: current.name, key: data.get("key"), body: data.get("body") }); }, "Upload");
      if (action === "read-object") runRequest({ action: "s3:GetObject", bucket: current.name, key: target.dataset.key });
      if (action === "delete-object") confirmAction("Delete object", '<p>Delete <strong>' + escape(target.dataset.key) + '</strong> from this practice bucket?</p>', function () { runRequest({ action: "s3:DeleteObject", bucket: current.name, key: target.dataset.key }); });
      if (action === "delete") confirmAction("Delete " + singular[current.type], field("Type the exact resource name", "confirmation", "", current.name), function (data) { engine.remove(state, current.type, current.name, data.get("confirmation")); save(); location.hash = link(current.type); toast("Resource deleted"); });
      if (action === "reset") confirmAction("Reset practice and start over?", '<p>This removes all users, groups, policies, roles, buckets, objects and instances in this console. It also clears request history and guided progress, and returns you to Lab administrator.</p><p>Your original learning lab keeps its progress. FakeCloud and real AWS resources are unaffected.</p>' + field("Type RESET to start over", "confirmation"), function (data) { if (data.get("confirmation") !== "RESET") throw new Error("Type RESET to confirm."); state = engine.freshState(); bucketPrefix = ""; objectiveId = "separate-teams"; save(); location.hash = "#home"; render(); toast("Practice reset. Your empty account is ready."); });
    } catch (error) { toast(error.message, true); }
  });

  document.addEventListener("submit", function (event) {
    const form = event.target;
    event.preventDefault();
    const data = new FormData(form);
    const current = route();
    try {
      if (form.querySelector("[data-policy-editor]")) data.set("document", JSON.stringify(window.IamPolicyEditor.read(form)));
      if (form.id === "editor-form") {
        if (submitEditor(data) !== false) { document.getElementById("editor-dialog").close(); render(); }
        return;
      }
      if (form.id === "service-search") {
        const query = document.getElementById("service-query").value.toLowerCase();
        const destination = /group/.test(query) ? "groups" : /polic/.test(query) ? "policies" : /role/.test(query) ? "roles" : /s3|bucket/.test(query) ? "buckets" : /ec2|instance/.test(query) ? "instances" : /iam|user/.test(query) ? "users" : "";
        if (!destination) throw new Error("Try IAM users, user groups, policies, roles, S3 or EC2.");
        location.hash = link(destination);
        return;
      }
      const kind = form.dataset.form;
      if (kind === "open-bucket") { location.hash = link("buckets", data.get("bucket").trim()); return; }
      if (kind === "request") { runRequest(Object.fromEntries(data), form.dataset.instance); return; }
      if (kind === "prefix") { bucketPrefix = data.get("prefix"); render(); return; }
      if (kind === "permissions") engine.attach(state, current.type, current.name, data.getAll("policies"));
      if (kind === "membership") engine.membership(state, current.name, data.getAll("members"));
      if (kind === "policy") engine.editPolicy(state, current.name, data.get("document"));
      if (kind === "associate") engine.associate(state, current.name, data.get("profile"));
      if (kind === "trust") engine.editTrust(state, current.name, data.get("trustedUser"), data.get("trust"));
      if (kind === "assume") { const result = engine.assume(state, data.get("role"), data.has("mfa")); save(); render(); showResult(result); return; }
      save(); render(); toast("Saved. Test a request to see the effect.");
    } catch (error) {
      if (form.id === "editor-form") { const message = document.getElementById("editor-error"); message.textContent = error.message; message.hidden = false; }
      else toast(error.message, true);
    }
  });

  document.getElementById("identity").addEventListener("change", function (event) {
    try { engine.signIn(state, event.target.value); save(); render(); toast("Practising as " + state.session.name); }
    catch (error) { toast(error.message, true); }
  });
  document.addEventListener("change", function (event) {
    if (event.target.name === "trust") {
      const userFields = event.target.closest("form").querySelector("[data-user-trust]");
      if (userFields) userFields.hidden = event.target.value !== "user";
    }
  });
  document.getElementById("coach").addEventListener("change", function (event) {
    if (event.target.id === "chapter") { state.chapter = event.target.value; save(); renderCoach(); }
  });
  main.addEventListener("change", function (event) {
    if (event.target.id === "objective-choice") { objectiveId = event.target.value; render(); document.getElementById("objective-choice").focus(); }
  });
  document.getElementById("reset-console").addEventListener("click", function () { document.querySelector('#coach [data-action="reset"]').click(); });
  window.addEventListener("hashchange", function () { bucketPrefix = ""; render(); main.focus(); });
  render();
})();
