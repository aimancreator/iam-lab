(function () {
  "use strict";

  const engine = window.IamLab;
  const storageKey = "iam-field-lab-v1";
  const main = document.getElementById("main");
  const missions = [
    ["Create an IAM user", "Give your learner an identity.", "An IAM user is an identity in your AWS account. Start with a new user, then decide exactly what that identity can do."],
    ["Build an IAM group", "Give permissions to a team.", "A group collects IAM users. Attach a policy once, and every member receives those permissions."],
    ["Write a scoped policy", "Make least privilege concrete.", "Your learner needs to read training files. Write a policy that grants that access, keeps private files out of reach, and blocks deletion."],
    ["Test restricted access", "Predict. Request. Understand.", "Be the permission engine: predict each result, send the request, and inspect the statement that allows or denies it."],
    ["Create & assume a role", "Borrow a different set of permissions.", "Your learner sometimes needs to upload a file. A role provides temporary permissions for that task, with a trust policy controlling who may use it."],
    ["Explore explicit deny", "What happens when policies disagree?", "Combine an Allow and a Deny for the same request. Change one piece at a time and see which rule wins."],
    ["Core IAM challenge", "Prove you understand the model.", "Connect the pieces: identities, shared permissions, scoped resources, trust, and temporary sessions."],
    ["EC2 → S3 roles", "Give an application its own permissions.", "Attach a policy, associate an instance profile, and see an EC2 application use temporary role credentials. This mission is available at any point in your training."],
    ["Users × buckets", "Who can access which bucket?", "Try User A on Bucket B and User B on Bucket A. Swap grants, change group membership, and compare read, upload, list, and delete requests. This playground is available immediately."]
  ];
  const quiz = [
    { question: "You create a new IAM user with no policies. Can that user read your private S3 objects?", options: ["Yes, users inherit the account owner's permissions.", "No. There is no Allow for that request.", "Only if the user knows the bucket name."], answer: 1, explanation: "In this lab there are no resource policies granting access. A new user has no permissions by default, so the request is implicitly denied." },
    { question: "Two policies apply to an action: one Allow and one explicit Deny. What wins?", options: ["The most recently attached policy.", "Allow, because the user needs it.", "The explicit Deny."], answer: 2, explanation: "A matching explicit Deny overrides a matching Allow. Removing a Deny still does not grant access; an Allow must remain." },
    { question: "Which ARN scopes GetObject to files under the training/ prefix?", options: ["arn:aws:s3:::iam-field-lab-demo", "arn:aws:s3:::iam-field-lab-demo/training/*", "arn:aws:iam::123456789012:group/lab-readers"], answer: 1, explanation: "GetObject uses an object ARN. ListBucket uses the bucket ARN and a prefix condition. A group ARN is not an S3 resource." },
    { question: "After assuming lab-uploader, can you use all your user's permissions plus all the role's permissions?", options: ["No. Requests with role credentials use the role's permissions.", "Yes. Role permissions are always added to user permissions.", "Yes, but only during the first hour."], answer: 0, explanation: "The active role session uses the role's permissions. Switching back restores the user's permissions. The user's group policies are not carried into the role session." },
    { question: "With this lab's account-principal trust policy, what is needed to assume the role?", options: ["Only the user's group membership.", "Caller permission, a matching trust condition, and MFA.", "Only the role's S3 upload policy."], answer: 1, explanation: "Our trust policy delegates to the account, limits the caller to the learner's ARN, and requires MFA. The caller also needs sts:AssumeRole on this role. The role's S3 policy controls what happens after assumption." },
    { question: "Can an IAM group sign in or be named as a role's trusted principal?", options: ["Yes, if the group contains an administrator.", "Yes, groups receive temporary credentials.", "No. A group is a collection of users, not an authenticated principal."], answer: 2, explanation: "Users, role sessions, and services can act as principals. A user group distributes permissions and has no sign-in credentials." }
  ];
  const presets = [
    { id: "read", label: "Read training file", action: "s3:GetObject", key: "training/welcome.txt", expected: "allowed" },
    { id: "private", label: "Read private file", action: "s3:GetObject", key: "private/notes.txt", expected: "implicitDeny" },
    { id: "upload", label: "Upload a file", action: "s3:PutObject", key: "training/uploads/notes.txt", expected: "implicitDeny" },
    { id: "delete", label: "Delete a file", action: "s3:DeleteObject", key: "training/welcome.txt", expected: "explicitDeny" },
    { id: "list", label: "List training/", action: "s3:ListBucket", key: "", prefix: "training/", expected: "allowed" },
    { id: "list-private", label: "List private/", action: "s3:ListBucket", key: "", prefix: "private/", expected: "implicitDeny" }
  ];
  let state = loadState();
  let mode = "simulator";
  let lastResult = "";
  let ec2Feedback = "";
  let matrixFeedback = "";
  let toastTimer;
  let activeRequest = Object.assign({}, presets[0]);
  let denySettings = { extra: true, keep: true };
  let aws = loadAws();

  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]; });
  }

  function json(value) {
    return JSON.stringify(value, null, 2);
  }

  function loadState() {
    try {
      const restored = JSON.parse(localStorage.getItem(storageKey));
      if (!restored || restored.version !== 1) return engine.freshState();
      const result = Object.assign(engine.freshState(), restored);
      if (!Number.isInteger(result.step) || result.step < 0 || result.step >= missions.length) return engine.freshState();
      ["completed", "tested", "roleTested", "denyTested"].forEach(function (key) { if (!Array.isArray(result[key])) throw new Error("Invalid progress"); });
      ["user", "group", "role"].forEach(function (key) { if (typeof result[key] !== "string" || result[key].length > 128) throw new Error("Invalid identity"); });
      if (result.reader) engine.parsePolicy(result.reader);
      if (!result.answers || typeof result.answers !== "object") result.answers = {};
      result.ec2 = Object.assign(engine.freshEc2State(), restored.ec2 || {});
      if (!Array.isArray(result.ec2.tested)) result.ec2.tested = [];
      if (!result.ec2.answers || typeof result.ec2.answers !== "object") result.ec2.answers = {};
      if (!window.IamEc2Lesson.requests.some(function (request) { return request.id === result.ec2.request; })) result.ec2.request = "read";
      result.matrix = engine.normalizeMatrixState(restored.matrix);
      result.session = "user";
      return result;
    } catch (error) {
      return engine.freshState();
    }
  }

  function loadAws() {
    const config = { account: "", bucket: "", done: [], ec2Done: false, matrix: { a: "", b: "", shared: "", done: [] } };
    try {
      const restored = JSON.parse(localStorage.getItem(storageKey + "-aws"));
      if (!restored || typeof restored !== "object") return config;
      if (/^\d{12}$/.test(restored.account) && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(restored.bucket) && Array.isArray(restored.done)) {
        config.account = restored.account;
        config.bucket = restored.bucket;
        config.done = Array.from(new Set(restored.done.filter(function (index) { return Number.isInteger(index) && index >= 0 && index < 8; })));
        config.ec2Done = restored.ec2Done === true;
      }
      if (window.IamMatrixLesson.validNames(restored.matrix)) {
        ["a", "b", "shared"].forEach(function (bucket) { config.matrix[bucket] = restored.matrix[bucket]; });
        if (Array.isArray(restored.matrix.done)) config.matrix.done = Array.from(new Set(restored.matrix.done.filter(function (index) { return Number.isInteger(index) && index >= 0 && index < 6; })));
      }
    } catch (error) {
      return config;
    }
    return config;
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(storageKey + "-aws", JSON.stringify(aws));
    } catch (error) {
      document.getElementById("announcement").textContent = "Browser storage is unavailable. Your progress lasts for this open page.";
    }
  }

  function announce(message) {
    document.getElementById("announcement").textContent = message;
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 3500);
  }

  function complete(index) {
    if (!state.completed.includes(index)) state.completed.push(index);
    save();
  }

  function unlocked(index) {
    return Number.isInteger(index) && index >= 0 && index < missions.length &&
      (index === 0 || index === 7 || index === 8 || state.completed.includes(index - 1));
  }

  function goTo(index) {
    if (!unlocked(index)) return announce("Finish the previous mission to unlock this one.");
    mode = "simulator";
    state.step = index;
    lastResult = "";
    activeRequest = Object.assign({}, presets[0]);
    save();
    render();
    main.focus();
    window.scrollTo(0, 0);
  }

  function renderNav() {
    document.getElementById("mission-nav").innerHTML = missions.map(function (mission, index) {
      const done = state.completed.includes(index);
      return '<button type="button" class="nav-mission ' + (done ? "done" : "") + '" data-step="' + index + '" aria-label="Mission ' + (index + 1) + ": " + escape(mission[0]) + (done ? ", completed" : "") + '"' + (mode === "simulator" && state.step === index ? ' aria-current="step"' : "") + (!unlocked(index) ? ' aria-disabled="true"' : "") + '><span class="nav-number">' + (done ? "✓" : "0" + (index + 1)) + '</span><span class="nav-name">' + escape(mission[0]) + "</span></button>";
    }).join("");
    document.getElementById("progress-label").textContent = state.completed.length + " / " + missions.length;
    document.getElementById("progress").max = missions.length;
    document.getElementById("progress").value = state.completed.length;
    document.getElementById("simulator-mode").setAttribute("aria-pressed", String(mode === "simulator"));
    document.getElementById("aws-mode").setAttribute("aria-pressed", String(mode === "aws"));
    document.getElementById("repo-mode").setAttribute("aria-pressed", String(mode === "repo"));
    document.getElementById("rbac-mode").setAttribute("aria-pressed", String(mode === "rbac"));
  }

  function panel(title, content, label) {
    return '<section class="panel"><div class="panel-title"><h2>' + title + "</h2>" + (label ? "<span>" + label + "</span>" : "") + "</div>" + content + "</section>";
  }

  function concept(number, title, copy) {
    return '<div class="concept-item"><span class="concept-number">' + number + '</span><div><h3>' + title + "</h3><p>" + copy + "</p></div></div>";
  }

  function callout(content, type) {
    return '<div class="callout ' + (type || "") + '">' + content + "</div>";
  }

  function checkbox(id, text, checked) {
    return '<label class="check-label"><input id="' + id + '" type="checkbox"' + (checked ? " checked" : "") + "><span>" + text + "</span></label>";
  }

  function identityMap() {
    return '<div class="identity-map" aria-label="User receives permissions through group membership"><div class="map-node ' + (state.user ? "active" : "") + '"><b>USER</b><span>' + escape(state.user || "Not created") + '</span></div><span class="map-arrow" aria-hidden="true">→</span><div class="map-node ' + (state.member ? "active" : "") + '"><b>GROUP</b><span>' + escape(state.group || "Not created") + '</span></div><span class="map-arrow" aria-hidden="true">→</span><div class="map-node ' + (state.reader ? "active" : "") + '"><b>POLICY</b><span>' + (state.reader ? "Read training" : "Not attached") + "</span></div></div>";
  }

  function nextRow() {
    if (state.step === missions.length - 1) return "";
    return '<div class="next-row"><p>' + (state.completed.includes(state.step) ? "Mission complete. You can keep experimenting." : "Complete the task to unlock the next mission.") + '</p><button type="button" class="primary" data-next' + (!state.completed.includes(state.step) ? " disabled" : "") + ">Next mission →</button></div>";
  }

  function render() {
    renderNav();
    if (mode === "rbac") {
      main.innerHTML = window.IamRbacLesson.render({ escape: escape, panel: panel, concept: concept, callout: callout, checklist: checklist, resultHtml: resultHtml });
      return;
    }
    if (mode === "repo") {
      main.innerHTML = window.IamRepoLesson.render({ escape: escape, panel: panel, concept: concept, callout: callout, checklist: checklist, resultHtml: resultHtml });
      return;
    }
    if (mode === "aws") {
      main.innerHTML = window.IamAwsGuide.render(aws, state.matrix);
      return;
    }
    const mission = missions[state.step];
    const content = [userMission, groupMission, policyMission, restrictionsMission, roleMission, denyMission, quizMission, ec2Mission, matrixMission][state.step]();
    main.innerHTML = '<div class="eyebrow">MISSION 0' + (state.step + 1) + ' / ' + String(missions.length).padStart(2, '0') + '</div><h1>' + mission[1] + '</h1><p class="intro">' + mission[2] + '</p>' + window.IamVisuals.jump() + '<div class="meta-row"><span class="chip live">● LOCAL SIMULATION</span><span class="chip">No AWS account needed</span><span class="chip">Core 25–35 min · Extra lessons ~15 min each</span></div>' + content + window.IamVisuals.card(window.IamVisuals.core[state.step]) + nextRow() + '<p class="limits">Teaching model: identity policies in one account, plus a guided role-trust check. Real AWS also evaluates resource policies, SCPs/RCPs, permission boundaries, session policies, and service-specific rules. This page makes no AWS API calls.</p>';
  }

  function userMission() {
    const form = state.user ? callout('<strong>' + escape(state.user) + '</strong> exists. It has an identity, but no S3 access until you grant it.', "success") + '<p class="lesson-copy">User ARN</p><pre><code>arn:aws:iam::123456789012:user/' + escape(state.user) + "</code></pre>" : '<form id="create-user-form"><div class="form-field"><label for="user-name">IAM user name</label><input id="user-name" type="text" value="lab-learner" maxlength="64" required pattern="[A-Za-z0-9+=,.@_\\-]+" autocomplete="off"><p class="help">Choose a name for this lab identity. No password or access key is needed in the simulator.</p></div><button class="primary" type="submit">Create IAM user →</button></form>';
    return '<div class="lab-grid"><div>' + panel("01 / Create your learner", '<p class="lesson-copy">You are setting up a new team member. Their job: <strong>read training material</strong>, then temporarily use an upload role. Private files stay restricted.</p>' + form + identityMap()) + '</div><aside class="side-notes">' + panel("Know the pieces", concept("U", "User · who you are", "An identity with a name and optional sign-in credentials.") + concept("G", "Group · your team", "A collection of users who share attached policies.") + concept("P", "Policy · what is permitted", "A JSON document defining actions, resources, and conditions.") + concept("R", "Role · temporary permissions", "An identity you assume; it supplies temporary credentials.")) + panel("Before you begin", '<p class="lesson-copy">This lab teaches IAM users because you asked to practise them. For everyday workforce access, AWS recommends <strong>IAM Identity Center and temporary credentials</strong>.</p><p class="help">Use the AWS account tab when you are ready to create real resources.</p>') + "</aside></div>";
  }

  function groupMission() {
    const form = !state.group ? '<form id="create-group-form"><div class="form-field"><label for="group-name">Group name</label><input id="group-name" type="text" value="lab-readers" required maxlength="128" pattern="[A-Za-z0-9+=,.@_\\-]+"></div>' + checkbox("join-on-create", "Add <strong>" + escape(state.user) + "</strong> to this group", true) + '<div class="button-row"><button class="primary" type="submit">Create group</button></div></form>' : '<p class="lesson-copy">Group: <strong>' + escape(state.group) + "</strong></p>" + checkbox("membership", escape(state.user) + " is a member", state.member) + callout("Experiment later: remove membership, revisit the request tester, and watch the group permissions disappear. An existing role session is separate.");
    return '<div class="lab-grid"><div>' + panel("02 / Build the team", '<p class="lesson-copy">Membership alone grants no access. A group needs an attached permissions policy.</p>' + form + identityMap()) + '</div><aside class="side-notes">' + panel("Why use a group?", concept("1", "Manage one policy", "Add or remove team members without copying policy documents onto each user.") + concept("2", "Permissions combine", "A user can belong to several groups. Their allows combine; any applicable explicit deny still wins.") + concept("3", "Groups cannot sign in", "Groups have no credentials, cannot contain roles or other groups, and are not trusted principals.")) + "</aside></div>";
  }

  function starterPolicy() {
    const policy = engine.readerPolicy();
    policy.Statement.find(function (statement) { return statement.Sid === "ReadTraining"; }).Resource = "arn:aws:s3:::" + engine.defaults.bucket + "/TODO/*";
    return policy;
  }

  function policyMission() {
    return '<div class="lab-grid"><div>' + panel("03 / Finish the policy", '<p class="lesson-copy">Replace <code>TODO</code> in the <code>ReadTraining</code> resource with <code>training</code>. Read the other statements, then attach the policy to your group.</p><label for="policy-editor">LabReadTraining · editable JSON</label><textarea id="policy-editor" class="code-editor" spellcheck="false" aria-describedby="policy-help">' + escape(json(state.reader || starterPolicy())) + '</textarea><p class="help" id="policy-help">The checker tests training reads, private reads, uploads, deletion, listing, and access to another bucket.</p><div class="button-row"><button class="primary" type="button" data-attach>Check &amp; attach to group</button><button class="text-button" type="button" data-solution>Load working example</button></div><div id="policy-feedback" aria-live="polite">' + (state.reader ? callout("Policy attached to " + escape(state.group) + ".", "success") : "") + "</div>") + '</div><aside class="side-notes">' + panel("Read the JSON", '<dl class="policy-anatomy"><dt>Version</dt><dd>Policy language version, not today’s date.</dd><dt>Statement</dt><dd>A list of permission rules.</dd><dt>Sid</dt><dd>A label that helps explain a rule.</dd><dt>Effect</dt><dd>Allow or explicitly Deny.</dd><dt>Action</dt><dd>The API operation, such as s3:GetObject.</dd><dt>Resource</dt><dd>The ARN the rule applies to.</dd><dt>Condition</dt><dd>Extra requirements, such as an S3 list prefix.</dd></dl>') + panel("Notice the boundaries", '<p class="lesson-copy"><code>GetObject</code> uses an <strong>object ARN</strong>. <code>ListBucket</code> uses the <strong>bucket ARN</strong> plus a prefix condition.</p>' + callout("Console navigation can reveal bucket names and parent folder names. Seeing a name does not grant access to its contents.") + '<p class="help">The wildcard on ListAllMyBuckets supports console navigation. Object reads are still scoped to training/*.</p>') + "</aside></div>";
  }

  function requestFor(preset) {
    return { action: preset.action, resource: "arn:aws:s3:::" + engine.defaults.bucket + (preset.action === "s3:ListBucket" ? "" : "/" + preset.key), context: preset.action === "s3:ListBucket" ? { "s3:prefix": preset.prefix || "", "s3:delimiter": "/" } : {} };
  }

  function requestPanel(roleMode) {
    const roleActive = roleMode && state.session === "role";
    const actionOptions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"].map(function (action) { return '<option value="' + action + '"' + (activeRequest.action === action ? " selected" : "") + ">" + action + "</option>"; }).join("");
    return '<div class="panel-title"><h2>Request playground</h2><span class="session-tag">' + (roleActive ? "ROLE · " + escape(state.role) : "USER · " + escape(state.user)) + '</span></div><p class="lesson-copy">Choose an example, predict the outcome, then run it. You can also change the object key or prefix.</p><div class="preset-list">' + presets.map(function (preset) { return '<button type="button" class="preset" data-preset="' + preset.id + '">' + preset.label + "</button>"; }).join("") + '</div><form id="request-form"><div class="request-grid"><div class="form-field"><label for="request-action">Action</label><select id="request-action">' + actionOptions + '</select></div><div class="form-field"><label for="prediction">Your prediction</label><select id="prediction" required><option value="">Choose an outcome…</option><option value="allowed">Allowed</option><option value="implicitDeny">Implicit deny</option><option value="explicitDeny">Explicit deny</option></select></div><div class="form-field wide"><label for="request-key">' + (activeRequest.action === "s3:ListBucket" ? "List prefix (delimiter is /)" : "Object key") + '</label><input id="request-key" type="text" value="' + escape(activeRequest.action === "s3:ListBucket" ? activeRequest.prefix || "" : activeRequest.key) + '"><p class="help">Bucket: ' + engine.defaults.bucket + '</p></div></div><div class="button-row"><button type="submit" class="primary">Run request →</button></div></form><div id="request-result" aria-live="polite">' + lastResult + "</div>";
  }

  function checklist(items, completed) {
    return '<ul class="checklist">' + items.map(function (item) { return '<li><span class="check-symbol">' + (completed.includes(item.id) ? "✓" : "○") + "</span><span>" + item.label + "</span></li>"; }).join("") + "</ul>";
  }

  function restrictionsMission() {
    return '<div class="lab-grid"><section class="panel">' + requestPanel(false) + '</section><aside class="side-notes">' + panel("Your four checks", '<p class="lesson-copy">Correctly predict all four. Wrong guesses include an explanation; try again.</p>' + checklist(presets.slice(0, 4), state.tested)) + panel("Decision order", concept("1", "Matching explicit deny?", "The request is denied, even if another rule allows it.") + concept("2", "Matching allow?", "The request is allowed in this simplified identity-policy model.") + concept("3", "Neither?", "The request is implicitly denied. Silence is not permission.") + '<p class="help">Bonus: compare listing training/ with listing private/ to test a Condition.</p>') + "</aside></div>";
  }

  function roleMission() {
    const setup = !state.role ? '<form id="create-role-form"><div class="form-field"><label for="role-name">Role name</label><input id="role-name" type="text" value="lab-uploader" required maxlength="64" pattern="[A-Za-z0-9+=,.@_\\-]+"></div><p class="lesson-copy">Attach <strong>LabUploadTraining</strong>: read and upload only under <code>training/uploads/*</code>, with an explicit deny on deletion.</p><button type="submit" class="primary">Create role &amp; attach permissions</button></form>' : '<p class="lesson-copy"><strong>' + escape(state.role) + '</strong> has its own S3 policy. Configure who may assume it:</p>' + checkbox("caller-permission", "Attach a group policy allowing <code>sts:AssumeRole</code> on this role", state.callerPermission) + checkbox("trust-user", "Configure the role to trust only " + escape(state.user) + " via the account principal", state.trust) + checkbox("mfa-session", "Simulate signing in as the user with MFA", state.mfa) + '<p class="help">These settings control the next assumption attempt. The trust policy requires MFA.</p><div class="button-row"><button class="primary" type="button" data-assume>Assume role</button><button class="secondary" type="button" data-switchback>Switch back to user</button></div><div id="assume-feedback" aria-live="polite"></div>';
    return '<div class="lab-grid"><div>' + panel("05 / Set up temporary access", '<p class="lesson-copy"><strong>Attach</strong> a permissions policy to define what a role can do. <strong>Assume</strong> the role to get temporary credentials and use those permissions. A user is allowed to assume a role; the role is not attached to the user like a group policy.</p>' + setup + '<details><summary>Inspect the three policy documents</summary><p>Caller policy · may this user request the role?</p><pre><code>' + escape(json(engine.assumePolicy(engine.defaults.account, state.role || engine.defaults.role))) + '</code></pre><p>Trust policy · which caller does the role accept?</p><pre><code>' + escape(json(engine.trustPolicy(engine.defaults.account, state.user))) + '</code></pre><p>Role permissions · what may the role session do?</p><pre><code>' + escape(json(engine.uploadPolicy())) + "</code></pre></details>") + (state.role ? '<section class="panel">' + requestPanel(true) + "</section>" : "") + '</div><aside class="side-notes">' + panel("Try both identities", '<p class="lesson-copy">First try assuming the role with missing requirements. Then enable all three, assume it, and predict these requests:</p>' + checklist([{ id: "role-upload", label: "As the role: upload training/uploads/notes.txt → allowed" }, { id: "role-read", label: "As the role: read training/welcome.txt → implicit deny" }], state.roleTested) + callout("Role permissions replace the user's permissions for that session. The role can upload under uploads/, but cannot read welcome.txt outside it.")) + panel("Who trusts whom?", '<p class="lesson-copy">The trust policy’s <code>:root</code> ARN delegates to the <strong>account</strong>. It does not mean “only the root user.” The ARN condition narrows trust to your learner.</p><p class="help">This account-principal pattern needs caller permission. Other same-account trust patterns can behave differently; do not generalize this into a rule for every trust policy.</p><p class="help">Groups cannot be trusted principals. EC2 or Lambda can also assume roles through service-specific trust policies, with AWS delivering temporary credentials.</p>') + "</aside></div>";
  }

  function denyMission() {
    return '<div class="lab-grid"><div>' + panel("06 / Put the rules in conflict", '<p class="lesson-copy">This isolated experiment uses a copy of the original reader policy. It does not change your saved group policy or AWS resources.</p><pre><code>s3:DeleteObject\narn:aws:s3:::iam-field-lab-demo/training/uploads/notes.txt</code></pre><div style="margin-top:20px">' + checkbox("extra-delete", "Add a second policy allowing this deletion", denySettings.extra) + checkbox("keep-deny", "Keep ProtectLabObjects: an explicit deny on deletion", denySettings.keep) + '</div><button type="button" class="primary" data-deny-run>Evaluate these policies →</button><div id="deny-result" aria-live="polite">' + lastResult + "</div>") + '</div><aside class="side-notes">' + panel("Run three experiments", checklist([{ id: "explicitDeny", label: "Allow + explicit deny → explicit deny" }, { id: "allowed", label: "Allow only → allowed" }, { id: "implicitDeny", label: "Neither allow nor deny → implicit deny" }], state.denyTested)) + panel("A useful distinction", '<p class="lesson-copy"><strong>Implicit deny:</strong> no applicable permission grants this request. Adding an Allow can change the result.</p><p class="lesson-copy"><strong>Explicit deny:</strong> a rule actively blocks this request. Another Allow cannot override it.</p><p class="help">A user’s group deny does not automatically carry into an assumed role. Our role has its own deletion deny.</p>') + "</aside></div>";
  }

  function quizMission() {
    const score = quiz.filter(function (question, index) { return Number(state.answers[index]) === question.answer && state.answers[index] !== undefined; }).length;
    return '<div class="lab-grid"><div>' + (state.completed.includes(6) ? '<div class="completion"><div class="label-kicker" style="color:#c6dbb5">CORE IAM COMPLETE</div><h2>You built a permission model.</h2><p>One user. One group. Scoped policies. Restricted files. A role with temporary access. Take the same steps into your AWS account next.</p><div class="button-row"><button class="secondary" type="button" data-open-aws>Open AWS walkthrough ↗</button></div></div>' : "") + panel("07 / Check your understanding", '<form id="quiz-form">' + quiz.map(function (question, index) {
      return '<fieldset class="quiz-question"><legend>' + (index + 1) + ". " + escape(question.question) + "</legend>" + question.options.map(function (option, optionIndex) {
        const selected = Number(state.answers[index]) === optionIndex && state.answers[index] !== undefined;
        return '<label class="check-label ' + (state.graded && selected ? optionIndex === question.answer ? "correct" : "incorrect" : "") + '"><input type="radio" name="quiz-' + index + '" value="' + optionIndex + '"' + (selected ? " checked" : "") + ' required><span>' + escape(option) + "</span></label>";
      }).join("") + (state.graded ? '<p class="quiz-feedback">' + (Number(state.answers[index]) === question.answer ? "✓ " : "Try again. ") + escape(question.explanation) + "</p>" : "") + "</fieldset>";
    }).join("") + '<button class="primary" type="submit">' + (state.graded ? "Check answers again" : "Check my answers") + "</button>" + (state.graded ? '<p class="callout ' + (score === quiz.length ? "success" : "") + '">' + score + " / " + quiz.length + " correct. " + (score === quiz.length ? "Core IAM challenge completed." : "Use the explanations and retry the questions you missed.") + "</p>" : "") + "</form>") + '</div><aside class="side-notes">' + panel("Your mental model", concept("U", "Identity first", "Who is making this request: a user or an assumed role session?") + concept("P", "Permissions next", "Which attached policies apply to that identity?") + concept("R", "Resource scope", "Does the requested action, ARN, and context match?") + concept("D", "Deny wins", "An explicit deny blocks the request. Without any applicable allow, access is implicitly denied.")) + "</aside></div>";
  }

  function ec2Mission() {
    return window.IamEc2Lesson.render(state.ec2, {
      escape: escape, panel: panel, concept: concept, callout: callout, checklist: checklist
    }, state.completed.includes(7), ec2Feedback);
  }

  function runEc2Request() {
    const selected = window.IamEc2Lesson.requests.find(function (request) {
      return request.id === document.getElementById("ec2-request").value;
    });
    const prediction = document.getElementById("ec2-prediction").value;
    state.ec2.request = selected.id;
    const result = engine.ec2Request(state.ec2, requestFor(selected));
    if (result.phase === "credentials") {
      ec2Feedback = '<div class="result denied"><h3>No usable role credentials</h3><p>The application cannot make an authenticated S3 request yet. This is a credential-setup failure, before S3 policy evaluation.</p><p><strong>' +
        (prediction === result.decision ? "✓ Your prediction was correct." : "Review the missing requirement, then try again.") +
        "</strong></p>" + checklist(result.checks.map(function (check, index) {
          return { id: index, label: check.label };
        }), result.checks.flatMap(function (check, index) { return check.pass ? [index] : []; })) + "</div>";
    } else {
      ec2Feedback = '<p class="ec2-principal">Caller: <code>' + escape(result.principal) +
        "</code></p><p class=\"help\">The SDK obtained temporary credentials for the role session. S3 now evaluates the requested action and resource.</p>" + resultHtml(result, prediction);
    }
    function record(id) {
      if (!state.ec2.tested.includes(id)) state.ec2.tested.push(id);
    }
    if (prediction === result.decision) {
      if (result.phase === "credentials") record("credentials");
      if (result.phase === "authorization" && !state.ec2.policyAttached && selected.id === "read" && result.decision === "implicitDeny") record("policy");
      if (state.ec2.policyAttached && selected.id === "read" && result.decision === "allowed") record("read");
      if (state.ec2.policyAttached && ["private", "upload"].includes(selected.id) && result.decision === "implicitDeny") record(selected.id);
    }
    if (window.IamEc2Lesson.ready(state.ec2)) complete(7);
    save();
    render();
    document.getElementById("ec2-prediction").value = prediction;
    announce(prediction === result.decision ? "Correct prediction. EC2 experiment saved." : "Check the explanation and try again.");
  }

  function matrixMission() {
    return window.IamMatrixLesson.render(state.matrix, {
      escape: escape, panel: panel, concept: concept, callout: callout, checklist: checklist
    }, state.completed.includes(8), matrixFeedback);
  }

  function runMatrixRequests(all) {
    const results = [];
    const selectedUsers = all ? ["a", "b"] : [state.matrix.user];
    const selectedBuckets = all ? Object.keys(engine.matrixBuckets) : [state.matrix.bucket];
    selectedUsers.forEach(function (user) {
      selectedBuckets.forEach(function (bucket) {
        const result = engine.matrixRequest(state.matrix, user, bucket, state.matrix.action);
        window.IamMatrixLesson.record(state.matrix, user, bucket, state.matrix.action, result);
        const detail = '<p class="help">Caller: <strong>' + escape(result.user) + '</strong><br>Action: <code>' + escape(result.request.action) + '</code><br>Resource: <code>' + escape(result.request.resource) + '</code></p>' + resultHtml(result);
        const decision = { allowed: "Allowed", implicitDeny: "Implicit deny", explicitDeny: "Explicit deny" }[result.decision];
        results.push(all ? '<details class="matrix-trace"><summary>User ' + user.toUpperCase() + ' → ' + (bucket === "shared" ? "Shared" : "Bucket " + bucket.toUpperCase()) + ' · ' + decision + '</summary>' + detail + '</details>' : detail);
      });
    });
    matrixFeedback = callout(results.length + " local request" + (all ? "s" : "") + " evaluated. " + (all ? "Expand a result to inspect the policies." : "Compare the matching user and group statements.")) + results.join("");
    if (window.IamMatrixLesson.ready(state.matrix)) complete(8);
    save();
    render();
    announce(state.completed.includes(8) ? "Multi-user mission complete. Keep experimenting!" : "Requests evaluated. Experiment checks saved.");
  }

  function openAwsExtension(id) {
    const extension = document.getElementById(id);
    extension.open = true;
    extension.querySelector("summary").focus();
    extension.scrollIntoView({ block: "start" });
  }

  function resultHtml(result, prediction) {
    const labels = { allowed: "Allowed", implicitDeny: "Implicit deny", explicitDeny: "Explicit deny", noCredentials: "No usable role credentials" };
    const explanations = {
      allowed: "An applicable Allow matches, and no applicable explicit Deny matches.",
      implicitDeny: "No Allow matches this action, resource, and context. The request is denied by default.",
      explicitDeny: "A matching Deny blocks this request. Any matching Allow cannot override it."
    };
    const matches = result.trace.filter(function (entry) { return entry.matches; });
    return '<div class="result ' + (result.decision !== "allowed" ? "denied" : "") + '"><h3>' + labels[result.decision] + '</h3><p>' + explanations[result.decision] + '</p>' + (prediction ? '<p><strong>' + (prediction === result.decision ? "✓ Your prediction was correct." : "Your prediction was " + labels[prediction].toLowerCase() + ". Compare the matching rules below, then try again.") + "</strong></p>" : "") + '<ul class="trace">' + (matches.length ? matches.map(function (entry) { return "<li><strong>" + escape(entry.effect + " · " + entry.sid) + "</strong><br>" + escape(entry.source) + "</li>"; }).join("") : "<li>No matching statements.</li>") + '</ul><details><summary>Show every evaluated statement</summary><ul class="trace">' + (result.trace.length ? result.trace.map(function (entry) { return "<li><strong>" + escape(entry.sid) + "</strong> · " + escape(entry.reason) + "</li>"; }).join("") : "<li>No policies apply to this identity.</li>") + "</ul></details></div>";
  }

  function checkAndAttach() {
    const feedback = document.getElementById("policy-feedback");
    try {
      const policyDocument = engine.parsePolicy(document.getElementById("policy-editor").value);
      const checks = presets.map(function (preset) {
        return { label: preset.label, pass: engine.evaluate([policyDocument], requestFor(preset)).decision === preset.expected };
      });
      checks.push({ label: "Read another bucket", pass: engine.evaluate([policyDocument], { action: "s3:GetObject", resource: "arn:aws:s3:::some-other-bucket/training/welcome.txt" }).decision === "implicitDeny" });
      if (!checks.every(function (check) { return check.pass; })) {
        feedback.innerHTML = callout("<strong>Keep refining the policy.</strong>" + checklist(checks.map(function (check, index) { return { id: index, label: check.label + (check.pass ? " · correct" : " · does not meet the mission") }; }), checks.flatMap(function (check, index) { return check.pass ? [index] : []; })), "error");
        return;
      }
      state.reader = policyDocument;
      complete(2);
      render();
      announce("Policy checked and attached to " + state.group + ".");
    } catch (error) {
      feedback.innerHTML = callout("<strong>Policy could not be attached.</strong><br>" + escape(error.message), "error");
    }
  }

  function runRequest() {
    const roleMode = state.step === 4 && state.session === "role";
    const action = document.getElementById("request-action").value;
    const key = document.getElementById("request-key").value;
    const prediction = document.getElementById("prediction").value;
    activeRequest = { action: action, key: action === "s3:ListBucket" ? "" : key, prefix: action === "s3:ListBucket" ? key : "" };
    const request = requestFor(activeRequest);
    const policies = roleMode ? [{ name: state.role + " / LabUploadTraining", document: engine.uploadPolicy() }] : engine.userPolicies(state);
    const result = engine.evaluate(policies, request);
    lastResult = resultHtml(result, prediction);
    if (state.step === 3 && prediction === result.decision) {
      presets.slice(0, 4).forEach(function (preset) {
        if (JSON.stringify(requestFor(preset)) === JSON.stringify(request) && result.decision === preset.expected && !state.tested.includes(preset.id)) state.tested.push(preset.id);
      });
      if (state.tested.length === 4) complete(3);
    }
    if (roleMode && prediction === result.decision) {
      if (action === "s3:PutObject" && key === "training/uploads/notes.txt" && result.decision === "allowed" && !state.roleTested.includes("role-upload")) state.roleTested.push("role-upload");
      if (action === "s3:GetObject" && key === "training/welcome.txt" && result.decision === "implicitDeny" && !state.roleTested.includes("role-read")) state.roleTested.push("role-read");
      if (state.roleTested.length === 2) complete(4);
    }
    save();
    render();
    document.getElementById("prediction").value = prediction;
    document.getElementById("announcement").textContent = result.decision === prediction ? "Correct prediction. " + result.decision : "Check the explanation. The decision is " + result.decision;
  }

  function renderAssumption() {
    const result = engine.assumeRole(state);
    state.session = result.allowed ? "role" : "user";
    lastResult = "";
    save();
    render();
    document.getElementById("assume-feedback").innerHTML = callout("<strong>" + (result.allowed ? "Role assumed. Your next request uses role permissions." : "AssumeRole denied. Fix the missing requirements.") + "</strong>" + checklist(result.checks.map(function (check, index) { return { id: index, label: check.label }; }), result.checks.flatMap(function (check, index) { return check.pass ? [index] : []; })), result.allowed ? "success" : "error");
    announce(result.allowed ? "Role session active." : "Role assumption denied. Check the missing requirements.");
  }

  function evaluateDeny() {
    denySettings = { extra: document.getElementById("extra-delete").checked, keep: document.getElementById("keep-deny").checked };
    const base = engine.readerPolicy();
    if (!denySettings.keep) base.Statement = base.Statement.filter(function (statement) { return statement.Effect !== "Deny"; });
    const policies = [{ name: "Reader policy copy", document: base }];
    if (denySettings.extra) policies.push({ name: "Second policy", document: engine.deletePolicy() });
    const result = engine.evaluate(policies, { action: "s3:DeleteObject", resource: "arn:aws:s3:::iam-field-lab-demo/training/uploads/notes.txt" });
    if (!state.denyTested.includes(result.decision) && (result.decision !== "explicitDeny" || denySettings.extra)) state.denyTested.push(result.decision);
    if (state.denyTested.length === 3) complete(5);
    lastResult = resultHtml(result);
    save();
    render();
    announce("Request result: " + result.decision);
  }

  async function copyCode(id, button) {
    const code = document.getElementById(id);
    const originalLabel = button.textContent;
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = "Copied ✓";
      setTimeout(function () { button.textContent = originalLabel; }, 2000);
    } catch (error) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
      announce("Text selected. Press Command+C or Ctrl+C to copy.");
    }
  }

  function downloadPolicies(matrix) {
    const bundle = matrix ? window.IamMatrixLesson.bundle(state.matrix, aws.matrix) : window.IamAwsGuide.bundle(aws);
    const blob = new Blob([JSON.stringify(bundle, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = matrix ? "iam-multi-user-policy-bundle.json" : "iam-lab-policy-bundle.json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    announce("Downloaded " + Object.keys(bundle).length + " labelled policy documents.");
  }

  document.addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-picture-summary")) {
      const summary = main.querySelector(".visual-summary:not(.visual-summary-compact)") || main.querySelector(".visual-summary");
      if (summary) {
        summary.focus({ preventScroll: true });
        summary.scrollIntoView({ block: "start" });
      }
      return;
    }
    if (window.IamRbacLesson.handle(event, { render: render, announce: announce })) return;
    if (window.IamRepoLesson.handle(event, { render: render, announce: announce })) return;
    if (button.id === "rbac-mode") return openRbacLab();
    if (button.id === "repo-mode") return openRepositoryLab();
    if (button.dataset.step !== undefined) return goTo(Number(button.dataset.step));
    if (button.hasAttribute("data-next")) return goTo(state.step + 1);
    if (button.hasAttribute("data-attach")) return checkAndAttach();
    if (button.hasAttribute("data-solution")) {
      document.getElementById("policy-editor").value = json(engine.readerPolicy());
      return announce("Working example loaded. Read the scoped resource before attaching.");
    }
    if (button.dataset.preset) {
      activeRequest = Object.assign({}, presets.find(function (preset) { return preset.id === button.dataset.preset; }));
      lastResult = "";
      render();
      return document.getElementById("prediction").focus();
    }
    if (button.hasAttribute("data-assume")) return renderAssumption();
    if (button.hasAttribute("data-switchback")) {
      state.session = "user";
      lastResult = "";
      save();
      render();
      return announce("User permissions restored.");
    }
    if (button.hasAttribute("data-deny-run")) return evaluateDeny();
    if (button.dataset.matrixRecipe) {
      state.matrix = window.IamMatrixLesson.applyRecipe(state.matrix, button.dataset.matrixRecipe);
      matrixFeedback = "";
      save();
      render();
      if (mode === "aws") openAwsExtension("aws-matrix-extension");
      return announce("Local preset loaded. AWS resources are unchanged.");
    }
    if (button.dataset.matrixUser) {
      state.matrix.user = button.dataset.matrixUser;
      state.matrix.bucket = button.dataset.matrixBucket;
      return runMatrixRequests(false);
    }
    if (button.hasAttribute("data-matrix-run-all")) return runMatrixRequests(true);
    if (button.hasAttribute("data-ec2-create")) {
      state.ec2.roleCreated = true;
      ec2Feedback = "";
      save();
      render();
      return announce("EC2 role created. Trust and permissions are configured separately.");
    }
    if (button.hasAttribute("data-ec2-profile") && state.ec2.roleCreated) {
      state.ec2.profileCreated = true;
      ec2Feedback = "";
      save();
      render();
      return announce("Instance profile created containing the EC2 role.");
    }
    if (button.id === "aws-mode" || button.hasAttribute("data-open-aws") || button.hasAttribute("data-open-aws-ec2") || button.hasAttribute("data-open-aws-matrix")) {
      mode = "aws";
      render();
      if (button.hasAttribute("data-open-aws-ec2")) {
        return openAwsExtension("aws-ec2-extension");
      }
      if (button.hasAttribute("data-open-aws-matrix")) return openAwsExtension("aws-matrix-extension");
      return main.focus();
    }
    if (button.id === "simulator-mode") {
      mode = "simulator";
      render();
      return main.focus();
    }
    if (button.dataset.copy) return void copyCode(button.dataset.copy, button);
    if (button.hasAttribute("data-download")) return downloadPolicies();
    if (button.hasAttribute("data-matrix-download")) return downloadPolicies(true);
    if (button.id === "restart") return document.getElementById("reset-dialog").showModal();
    if (button.id === "cancel-reset") return document.getElementById("reset-dialog").close();
    if (button.id === "confirm-reset") {
      state = engine.freshState();
      window.IamRepoLesson.reset();
      window.IamRbacLesson.reset();
      mode = "simulator";
      lastResult = "";
      ec2Feedback = "";
      matrixFeedback = "";
      document.getElementById("reset-dialog").close();
      save();
      render();
      announce("Fresh simulator ready.");
    }
  });

  document.addEventListener("submit", function (event) {
    event.preventDefault();
    if (window.IamRbacLesson.handle(event, { render: render, announce: announce })) return;
    if (window.IamRepoLesson.handle(event, { render: render, announce: announce })) return;
    const form = event.target;
    if (form.id === "create-user-form") {
      state.user = document.getElementById("user-name").value.trim();
      complete(0);
      render();
      announce("IAM user created with no permissions.");
    }
    if (form.id === "create-group-form") {
      state.group = document.getElementById("group-name").value.trim();
      state.member = document.getElementById("join-on-create").checked;
      if (state.member) complete(1);
      save();
      render();
      announce("IAM group created.");
    }
    if (form.id === "request-form") runRequest();
    if (form.id === "ec2-request-form") runEc2Request();
    if (form.id === "ec2-quiz-form") {
      const answers = new FormData(form);
      window.IamEc2Lesson.questions.forEach(function (question, index) {
        state.ec2.answers[index] = answers.get("ec2-answer-" + index);
      });
      state.ec2.graded = true;
      if (window.IamEc2Lesson.ready(state.ec2)) complete(7);
      save();
      render();
      announce(state.completed.includes(7) ? "EC2 role mission complete." : "Answers checked. Review the feedback and experiment checklist.");
    }
    if (form.id === "create-role-form") {
      state.role = document.getElementById("role-name").value.trim();
      save();
      render();
      announce("Role created. Configure caller permission and trust.");
    }
    if (form.id === "quiz-form") {
      quiz.forEach(function (question, index) { state.answers[index] = new FormData(form).get("quiz-" + index); });
      state.graded = true;
      const score = quiz.filter(function (question, index) { return Number(state.answers[index]) === question.answer; }).length;
      if (score === quiz.length) complete(6);
      save();
      render();
      announce(score + " of " + quiz.length + " correct.");
    }
    if (form.id === "aws-config-form") {
      aws.account = document.getElementById("aws-account").value.trim();
      aws.bucket = document.getElementById("aws-bucket").value.trim();
      aws.done = [];
      aws.ec2Done = false;
      save();
      render();
      announce("Policies personalized. Follow the AWS console steps below.");
    }
    if (form.id === "aws-matrix-config-form") {
      const next = { done: aws.matrix.done };
      ["a", "b", "shared"].forEach(function (bucket) { next[bucket] = document.getElementById("aws-matrix-" + bucket).value.trim(); });
      if (!window.IamMatrixLesson.validNames(next)) {
        document.getElementById("aws-matrix-config-error").textContent = "Use three different bucket names: 3–63 lowercase letters, digits, or hyphens, with alphanumeric ends and no reserved AWS prefixes or suffixes.";
        return;
      }
      if (["a", "b", "shared"].some(function (bucket) { return next[bucket] !== aws.matrix[bucket]; })) next.done = [];
      aws.matrix = next;
      save();
      render();
      openAwsExtension("aws-matrix-extension");
      announce("Multi-user policies personalized. Copy each policy into AWS manually.");
    }
  });

  document.addEventListener("change", function (event) {
    if (window.IamRbacLesson.handle(event, { render: render, announce: announce })) return;
    if (window.IamRepoLesson.handle(event, { render: render, announce: announce })) return;
    const target = event.target;
    if (target.id === "matrix-action" || target.dataset.matrixGrant || target.dataset.matrixDeny || target.dataset.matrixMember) {
      if (target.id === "matrix-action") state.matrix.action = target.value;
      if (target.dataset.matrixGrant) state.matrix.grants[target.dataset.matrixGrant][target.dataset.matrixBucket] = target.value;
      if (target.dataset.matrixDeny) state.matrix.denies[target.dataset.matrixDeny][target.dataset.matrixBucket] = target.checked;
      if (target.dataset.matrixMember) state.matrix.members[target.dataset.matrixMember] = target.checked;
      matrixFeedback = "";
      save();
      render();
      document.getElementById(target.id).focus();
      document.getElementById("announcement").textContent = "Access matrix recalculated locally. Run a request to inspect the result.";
      return;
    }
    if (target.dataset.awsMatrixStep !== undefined) {
      const index = Number(target.dataset.awsMatrixStep);
      aws.matrix.done = aws.matrix.done.filter(function (item) { return item !== index; });
      if (target.checked) aws.matrix.done.push(index);
      save();
      document.getElementById("aws-matrix-count").textContent = aws.matrix.done.length + " / 6 confirmations · saved locally, not verified in AWS";
      return announce("Your multi-user AWS confirmation was saved locally.");
    }
    const ec2Fields = { "ec2-trust": "trustedService", "ec2-associated": "associated", "ec2-policy": "policyAttached", "ec2-request": "request" };
    if (ec2Fields[target.id]) {
      state.ec2[ec2Fields[target.id]] = target.type === "checkbox" ? target.checked : target.value;
      ec2Feedback = "";
      save();
      render();
      document.getElementById(target.id).focus();
      return;
    }
    if (target.dataset.ec2Question !== undefined) {
      state.ec2.answers[target.dataset.ec2Question] = target.value;
      state.ec2.graded = false;
      save();
    }
    if (target.hasAttribute("data-aws-ec2")) {
      aws.ec2Done = target.checked;
      save();
      document.getElementById("aws-ec2-status").textContent = target.checked ? "✓ checked" : "optional · before cleanup";
      announce("EC2 walkthrough confirmation saved locally.");
    }
    if (target.id === "membership") {
      state.member = target.checked;
      if (state.member) complete(1);
      save();
      render();
      announce(state.member ? "User added to group." : "User removed from group. Group permissions no longer apply to user requests.");
    }
    const roleFields = { "caller-permission": "callerPermission", "trust-user": "trust", "mfa-session": "mfa" };
    if (roleFields[target.id]) {
      state[roleFields[target.id]] = target.checked;
      save();
    }
    if (target.id === "request-action") {
      activeRequest.action = target.value;
      activeRequest.key = document.getElementById("request-key").value;
      if (target.value === "s3:ListBucket") activeRequest.prefix = "training/";
      lastResult = "";
      render();
      document.getElementById("request-action").focus();
    }
    if (target.name && target.name.startsWith("quiz-")) {
      state.answers[target.name.slice(5)] = target.value;
      state.graded = false;
      save();
    }
    if (target.dataset.awsStep !== undefined) {
      const index = Number(target.dataset.awsStep);
      aws.done = aws.done.filter(function (item) { return item !== index; });
      if (target.checked) aws.done.push(index);
      save();
      document.getElementById("aws-count").textContent = aws.done.length + " / 8 steps checked";
      announce("AWS checklist saved locally. This records your confirmation, not an AWS verification.");
    }
  });

  function openRbacLab() {
    mode = "rbac";
    render();
    main.focus();
    window.scrollTo(0, 0);
  }

  function openRepositoryLab() {
    mode = "repo";
    render();
    main.focus();
    window.scrollTo(0, 0);
  }

  document.addEventListener("input", function (event) {
    window.IamRepoLesson.handle(event, { render: render, announce: announce });
  });

  if (window.location.hash === "#rbac") openRbacLab();
  else if (window.location.hash === "#repo") openRepositoryLab();
  else if (window.location.hash === "#matrix") goTo(8);
  else if (window.location.hash === "#ec2") goTo(7);
  else render();
  window.addEventListener("hashchange", function () {
    if (window.location.hash === "#rbac") openRbacLab();
    if (window.location.hash === "#repo") openRepositoryLab();
    if (window.location.hash === "#ec2") goTo(7);
    if (window.location.hash === "#matrix") goTo(8);
  });
})();
