(function () {
  "use strict";

  const model = window.IamRepoEngine;
  const engine = window.IamLab;
  const storageKey = "iam-field-lab-repo-v1";
  const titles = ["Group & managed policy", "Least-privilege JSON", "EC2 service role", "STS & CLI credentials", "Policy evaluation", "Access Analyzer"];
  const labels = { allowed: "Allowed", implicitDeny: "Implicit deny", explicitDeny: "Explicit deny", noCredentials: "No usable credentials" };
  const fieldPaths = ["member", "managed", "ec2.trust", "ec2.profile", "ec2.policy", "cli.trust", "cli.caller", "cli.mfa", "cli.token", "cli.command", "evaluation.allow", "evaluation.deny", "evaluation.boundary", "evaluation.scp", "evaluation.prediction", "analyzer.principal"];
  let state = loadState();
  let aws = loadAws();
  let feedback = null;
  let ui;

  function loadState() {
    try { return model.normalize(JSON.parse(localStorage.getItem(storageKey))); }
    catch (error) { return model.freshState(); }
  }

  function loadAws() {
    try { return window.IamRepoAws.normalize(JSON.parse(localStorage.getItem(storageKey + "-aws"))); }
    catch (error) { return window.IamRepoAws.normalize(null); }
  }

  function save(announce) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(storageKey + "-aws", JSON.stringify(aws));
    } catch (error) {
      if (announce) announce("Storage unavailable. Repository-lab progress lasts only for this page.");
    }
  }

  function checkbox(path, label, checked, disabled) {
    return '<label class="check-label"><input id="repo-' + path.replace(".", "-") + '" type="checkbox" data-repo-field="' + path + '"' + (checked ? " checked" : "") + (disabled ? " disabled" : "") + '><span>' + label + '</span></label>';
  }

  function select(path, label, choices, current, disabled) {
    const id = "repo-" + path.replace(".", "-");
    return '<div class="form-field"><label for="' + id + '">' + label + '</label><select id="' + id + '" data-repo-field="' + path + '"' + (disabled ? " disabled" : "") + '>' + choices.map(function (choice) {
      return '<option value="' + choice[0] + '"' + (choice[0] === current ? " selected" : "") + '>' + ui.escape(choice[1]) + '</option>';
    }).join("") + '</select></div>';
  }

  function code(value) {
    return '<pre><code>' + ui.escape(typeof value === "string" ? value : JSON.stringify(value, null, 2)) + '</code></pre>';
  }

  function action(name, text, disabled) {
    return '<button type="button" class="secondary" data-repo-action="' + name + '"' + (disabled ? " disabled" : "") + '>' + text + '</button>';
  }

  function renderFeedback() {
    if (!feedback) return "";
    return '<div id="repo-feedback" class="result ' + (feedback.ok === false ? "denied" : "") + '" aria-live="polite"><h3>' + ui.escape(feedback.title || (feedback.ok === false ? "Check the result" : "Experiment result")) + '</h3><p>' + ui.escape(feedback.message || "") + '</p>' + (feedback.output ? code(feedback.output) : "") + (feedback.result && feedback.result.trace ? ui.resultHtml(feedback.result) : "") + '</div>';
  }

  function groupLesson() {
    const content = '<p class="lesson-copy">The repository starts after account setup. Your simulated secondary user, <code>repo-learner</code>, already exists. Now create its <code>developers</code> group; keep your administrator separate.</p>' +
      action("group", state.group ? "developers created ✓" : "Create developers group", state.group) +
      '<div class="button-row"></div>' + checkbox("member", "Add repo-learner to developers", state.member, !state.group) +
      checkbox("managed", "Attach the customer managed RepoReadBucket policy to developers", state.managed, !state.group) +
      '<p class="help">This managed example allows only GetObject on the practice bucket. It is not AmazonS3FullAccess or account-wide ReadOnlyAccess.</p>' +
      '<div class="button-row">' + action("group-test", "Test the user’s GetObject request") + '</div>' + renderFeedback() +
      '<details><summary>Inspect the managed example</summary>' + code(model.readPolicy()) + '</details>';
    return ui.panel("1 / Share permissions through a group", content) + ui.panel("Managed is not the same as AWS managed", '<p class="lesson-copy">A <strong>customer managed policy</strong> is reusable and maintained in your account. An <strong>AWS managed policy</strong> is maintained by AWS. An <strong>inline policy</strong> is embedded in one identity. All are permission rules; attachment and group membership decide which user receives them.</p>' + ui.callout("Remove membership or detach the policy and retest. A group cannot sign in or assume a role."));
  }

  function policyLesson() {
    return ui.panel("2 / Write the repository’s scoped read policy", '<p class="lesson-copy">Replace the TODO values. Allow only <code>s3:GetObject</code> on <code>arn:aws:s3:::my-lab-bucket/*</code>. Unlike the older console-navigation lab, this exercise intentionally does <strong>not</strong> allow listing bucket names or listing files.</p><form id="repo-policy-form"><label for="repo-policy-editor">Your customer managed policy JSON</label><textarea id="repo-policy-editor" class="code-editor" spellcheck="false" maxlength="20000">' + ui.escape(state.draft) + '</textarea><div class="button-row"><button type="submit" class="primary"' + (!state.group ? " disabled" : "") + '>Check &amp; attach my policy</button>' + action("solution", "Load working example") + '</div></form>' + (!state.group ? ui.callout("Create the developers group in step 1 first.") : "") + renderFeedback()) +
      ui.panel("Explain the fields", '<dl class="policy-anatomy"><dt>Version</dt><dd>The policy language version, not today’s date.</dd><dt>Effect</dt><dd>Allow grants a matching request; Deny overrides a grant.</dd><dt>Action</dt><dd>GetObject reads a known object. It does not list, upload, or delete.</dd><dt>Resource</dt><dd>The object ARN ends in /* to cover objects in one bucket.</dd><dt>Condition</dt><dd>Optional additional requirements. None are needed here.</dd></dl><p class="help">The policy checker validates resource/action scope as well as sample outcomes, so a wildcard Allow cannot pass by accident.</p>');
  }

  function ec2Lesson() {
    return ui.panel("3 / Create an EC2 service role", '<p class="lesson-copy">Run a read before setup, after credentials are available, and after adding permission. This models an EC2 application without launching an instance.</p>' +
      action("ec2-role", state.ec2.role ? "repo-ec2-reader created ✓" : "Create repo-ec2-reader", state.ec2.role) +
      '<div class="button-row"></div>' + select("ec2.trust", "Which service needs to use the role?", [["", "No trusted service"], ["ec2.amazonaws.com", "EC2 — the caller"], ["s3.amazonaws.com", "S3 — the destination"]], state.ec2.trust, !state.ec2.role) +
      checkbox("ec2.profile", "Put the role in an instance profile and associate it with the simulated EC2 instance", state.ec2.profile, !state.ec2.role) +
      checkbox("ec2.policy", "Attach RepoReadBucket to this role", state.ec2.policy, !state.ec2.role) +
      '<div class="button-row">' + action("ec2-test", "Run the application’s GetObject") + '</div>' + renderFeedback() +
      ui.checklist([{ id: "noCredentials", label: "Without credential setup: no usable credentials" }, { id: "implicitDeny", label: "Credentials but no S3 policy: implicit deny" }, { id: "allowed", label: "Credentials and read policy: allowed" }], state.ec2.tested)) +
      ui.panel("Attach, associate, assume", window.IamEc2Lesson.terminology() + '<p class="help">This local model starts each EC2 request without cached credentials. Real sessions can remain valid after trust/profile changes. The repository’s live Lab 01 creates the role/profile only; launching EC2 belongs to Lab 03.</p><button type="button" class="text-button" data-step="7">Open the existing detailed EC2 playground →</button>');
  }

  function cliLesson() {
    const commandOptions = [["user", "1 · Who am I? Original user"], ["assume", "2 · Call STS AssumeRole"], ["identity", "3 · Who am I? Role credentials"], ["read", "4 · Read with role credentials"], ["upload", "5 · Upload with role credentials"]];
    return ui.panel("4 / Request and use a temporary session", '<p class="lesson-copy">This is a <strong>preset-only CLI simulation</strong>. It runs no shell commands and accepts no real keys or MFA codes. The role has its own read-only policy.</p>' +
      action("cli-role", state.cli.role ? "repo-cli-reader created ✓" : "Create repo-cli-reader with read permission", state.cli.role) +
      '<div class="button-row"></div>' + checkbox("cli.trust", "Role trust delegates to this account, restricted to repo-learner", state.cli.trust, !state.cli.role) +
      checkbox("cli.caller", "The user’s group allows sts:AssumeRole on this role", state.cli.caller, !state.cli.role) +
      checkbox("cli.mfa", "Simulate a valid MFA-authenticated assumption", state.cli.mfa, !state.cli.role) +
      select("cli.command", "CLI experiment", commandOptions, state.cli.command) + code(model.commands[state.cli.command]) +
      '<div class="button-row">' + action("cli-run", "Run simulated command") + action("expire", "Expire simulated session", !state.cli.issued || state.cli.expired) + '</div>' +
      '<p class="help">Role credential set: <strong>' + (state.cli.expired ? "expired" : state.cli.issued ? "issued" : "not issued") + '</strong>. Changing trust or caller permission affects future assumptions; it does not erase an already-issued session in this model.</p>' +
      checkbox("cli.token", "For role commands, supply ALL THREE temporary fields: access key ID, secret access key, and session token", state.cli.token) +
      renderFeedback() + ui.checklist([{ id: "assume", label: "AssumeRole succeeds" }, { id: "identity", label: "GetCallerIdentity shows an assumed-role ARN" }, { id: "read", label: "Role can GetObject" }, { id: "upload", label: "Role cannot PutObject" }], state.cli.tested)) +
      ui.panel("Temporary does not mean unrestricted", '<p class="lesson-copy">AssumeRole returns credentials; attaching a policy defines permission. A role session does not combine the user’s group permissions with the role’s permissions. Try forgetting the session token or expiring the session, then obtain fresh credentials.</p><p class="help">The matching AWS guide uses a separate learner CloudShell and a subshell for role credentials, so you do not need to create or paste long-lived access keys.</p>');
  }

  function evaluationLesson() {
    const checks = [{ id: "allowed", label: "Identity Allow → allowed" }, { id: "implicit", label: "No identity Allow → implicit deny" }, { id: "deny", label: "Identity Deny overrides Allow" }, { id: "boundary", label: "Boundary without S3 permission limits the Allow" }, { id: "scp", label: "Organization explicit Deny overrides the Allow" }];
    const presets = [["allowed", "Allow"], ["implicit", "No Allow"], ["deny", "Explicit Deny"], ["boundary", "Boundary limit"], ["scp", "SCP limit"]];
    const layerResult = feedback && feedback.layers ? '<div class="table-wrap"><table><thead><tr><th>Layer</th><th>Decision for this read</th></tr></thead><tbody>' + feedback.layers.map(function (layer) { return '<tr><td>' + layer.name + '</td><td>' + (layer.result ? labels[layer.result.decision] : "Not attached") + '</td></tr>'; }).join("") + '</tbody></table></div>' : "";
    return ui.panel("5 / Predict the complete decision", '<p class="lesson-copy">An isolated identity-policy example for <code>GetObject</code> on <code>my-lab-bucket/example.txt</code>. Select a preset, predict the outcome, and inspect the layers.</p><div class="button-row">' + presets.map(function (preset) { return '<button type="button" class="secondary small-button" data-repo-evaluation="' + preset[0] + '">' + preset[1] + '</button>'; }).join("") + '</div><div class="button-row"></div>' +
      checkbox("evaluation.allow", "Identity policy allows this read", state.evaluation.allow) +
      checkbox("evaluation.deny", "Identity policy explicitly denies this read", state.evaluation.deny) +
      select("evaluation.boundary", "Permissions boundary", [["none", "Not attached"], ["read", "Includes the read permission"], ["noS3", "Only EC2 DescribeInstances — no S3 Allow"]], state.evaluation.boundary) +
      select("evaluation.scp", "Simplified member-account organization limit", [["allow", "Permits the operation"], ["deny", "Explicitly denies the operation"]], state.evaluation.scp) +
      '<form id="repo-evaluation-form">' + select("evaluation.prediction", "Your prediction", [["", "Choose an outcome"], ["allowed", "Allowed"], ["implicitDeny", "Implicit deny"], ["explicitDeny", "Explicit deny"]], state.evaluation.prediction) + '<button class="primary" type="submit">Evaluate the layers</button></form>' + renderFeedback() + layerResult + ui.checklist(checks, state.evaluation.tested)) +
      ui.panel("Limits are not grants", '<p class="lesson-copy">A <strong>permissions boundary</strong> limits a user or role. An <strong>SCP</strong> constrains applicable principals in organization member accounts; it does not grant permissions and is not a policy on one S3 bucket.</p>' + ui.callout("Do not apply these experimental limits to your real administrator or organization. The AWS exercise tests the lab user in IAM Policy Simulator instead.") + '<p class="help">This model covers an identity grant plus optional ceilings. Resource-policy principal/session exceptions, SCP inheritance across organization levels, management-account exceptions, RCPs, and service-specific rules are not simulated.</p>');
  }

  function analyzerLesson() {
    return ui.panel("6 / Review a safe external-access preview", '<p class="lesson-copy">Policy Simulator asks whether a request is authorized. <strong>Access Analyzer external-access analysis</strong> asks which supported resources have policies granting access outside the selected account or organization.</p>' +
      action("analyzer-enable", state.analyzer.enabled ? "Local account analyzer enabled ✓" : "Simulate enabling an account analyzer", state.analyzer.enabled) +
      '<div class="button-row"></div>' + select("analyzer.principal", "Proposed role trust — never applied to AWS", [["external", "Another account: 111122223333"], ["account", "This account: 123456789012"], ["user", "Only this account’s repo-learner"]], state.analyzer.principal) +
      code(model.previewTrust(model.defaults.account, state.analyzer.principal)) +
      '<div class="button-row">' + action("analyze", "Preview external access", !state.analyzer.enabled) + action("restrict", "Restrict preview to our learner", !state.analyzer.enabled) + '</div>' + renderFeedback() +
      ui.checklist([{ id: "external", label: "Review the proposed external-account trust finding" }, { id: "restricted", label: "Restrict the proposed trust and confirm the external finding disappears" }], state.analyzer.tested)) +
      ui.panel("A finding needs a decision", '<p class="lesson-copy">Review the principal, action, resource, and intended sharing. A finding identifies a resource-policy grant beyond the trust zone; it is not proof that someone used it or that every other authorization check succeeds. If access is unintended, change the permission and analyze again. <strong>Archiving a finding does not revoke access.</strong></p><p class="help">This is a small predefined trust-policy exercise, not AWS’s analyzer. The real guide uses CreateAccessPreview to examine a hypothetical role without creating it or making a bucket public.</p>');
  }

  function render(helpers) {
    ui = helpers;
    const navigation = '<nav class="repo-step-nav" aria-label="Repository Lab 01 steps">' + titles.map(function (title, index) {
      return '<button type="button" class="secondary small-button" data-repo-step="' + index + '"' + (state.step === index ? ' aria-current="step"' : "") + '>' + (state.completed.includes(index) ? "✓ " : String(index + 1) + " · ") + title + '</button>';
    }).join("") + '</nav>';
    const source = '<p class="help">Adapted from <a href="https://github.com/tranttuan96/aws-labs/blob/main/labs/01-iam/README.md" target="_blank" rel="noopener noreferrer">tranttuan96/aws-labs · Lab 01</a> by Tuan Tran. <a href="source/aws-labs/01-iam.md" target="_blank" rel="noopener">Read the supplied source</a> · <a href="UPSTREAM.md" target="_blank" rel="noopener">Adaptation notes</a> · <a href="source/aws-labs/LICENSE" target="_blank" rel="noopener">MIT license</a>.</p>';
    const header = '<div class="eyebrow">REPOSITORY TRACK · LAB 01</div><h1>IAM &amp; security foundations.</h1><p class="intro">The repository’s six hands-on tasks, now interactive: groups, scoped JSON, an EC2 role, CLI role assumption, policy evaluation, and Access Analyzer.</p>' + source +
      '<div class="repo-progress-row"><span id="repo-progress-label">' + state.completed.length + ' / 6 simulated steps complete</span><progress id="repo-progress" value="' + state.completed.length + '" max="6" aria-label="Repository simulator progress"></progress></div>' +
      navigation + '<div class="repo-mode-row" role="group" aria-label="Repository practice mode"><button type="button" class="secondary" data-repo-live="false" aria-pressed="' + !state.live + '">Interactive simulation</button><button type="button" class="secondary" data-repo-live="true" aria-pressed="' + state.live + '">Matching AWS steps ↗</button></div>';
    if (state.live) return header + window.IamVisuals.jump() + window.IamRepoAws.render(aws, state.step, ui) + renderFeedback();
    const lesson = [groupLesson, policyLesson, ec2Lesson, cliLesson, evaluationLesson, analyzerLesson][state.step]();
    const next = state.step < 5 ? '<div class="next-row"><p>Work in order, or revisit any step. Progress is separate from your original nine missions.</p><button type="button" class="primary" data-repo-step="' + (state.step + 1) + '">Next repository step →</button></div>' : "";
    return header + window.IamVisuals.jump() + '<div class="meta-row"><span class="chip live">LOCAL SIMULATION ONLY</span><span class="chip">No real credentials or AWS API calls</span></div>' + lesson + window.IamVisuals.card(window.IamVisuals.repository[state.step]) + next +
      (state.completed.length === 6 ? '<div class="completion"><h2>Lab 01 simulation complete.</h2><p>You practised every hands-on topic in the source. Use the matching AWS steps to verify real behavior; completing this simulator does not verify AWS resources.</p></div>' : "") +
      '<details class="panel repo-interview"><summary>Review the repository’s interview topics</summary><p><strong>User vs role:</strong> an IAM user is a persistent identity; a role session uses temporary credentials. Neither receives S3 access merely by existing.</p><p><strong>Cross-account access:</strong> an authorized caller can assume a role trusted by the other account, or use an appropriate resource-policy grant with the required caller-side permission. This is different from our same-account A/B bucket playground.</p><p><strong>EC2:</strong> use instance-profile role credentials, not embedded access keys.</p><p><strong>Boundary vs SCP:</strong> both constrain permissions; neither is an Allow grant by itself.</p><button type="button" class="text-button" data-step="8">Revisit the two-user / three-bucket playground →</button></details>';
  }

  function setField(path, value) {
    if (!fieldPaths.includes(path)) return;
    const parts = path.split(".");
    if (parts.length === 1) state[parts[0]] = value;
    else state[parts[0]][parts[1]] = value;
  }

  function handle(event, callbacks) {
    const target = event.target;
    let handled = false;
    let message = "";
    let focusId = "";
    if (event.type === "input" && target.id === "repo-policy-editor") {
      state.draft = target.value.slice(0, 20000);
      save(callbacks.announce);
      return true;
    }
    if (event.type === "change" && target.dataset.repoField) {
      setField(target.dataset.repoField, target.type === "checkbox" ? target.checked : target.value);
      feedback = null;
      focusId = target.id;
      handled = true;
    }
    if (event.type === "change" && target.dataset.repoAwsCheck !== undefined) {
      const index = Number(target.dataset.repoAwsCheck);
      aws.done = aws.done.filter(function (item) { return item !== index; });
      if (target.checked && index >= 0 && index < 8) aws.done.push(index);
      save(callbacks.announce);
      document.getElementById("repo-aws-count").textContent = aws.done.length + " / 8 manual AWS confirmations";
      callbacks.announce("Your confirmation was saved locally; no AWS verification was performed.");
      return true;
    }
    if (event.type === "submit" && target.id === "repo-policy-form") {
      event.preventDefault();
      state.draft = document.getElementById("repo-policy-editor").value;
      try {
        if (!state.group) throw new Error("Create the developers group in step 1 first.");
        state.reader = model.checkReadPolicy(state.draft);
        state.managed = true;
        feedback = { ok: true, title: "Scoped policy attached", message: "GetObject works in this bucket. Listing, upload, and reads in another bucket remain ungranted." };
      } catch (error) { feedback = { ok: false, title: "Refine your policy", message: error.message }; }
      handled = true;
    }
    if (event.type === "submit" && target.id === "repo-evaluation-form") {
      event.preventDefault();
      const result = model.evaluateLayers(state.evaluation);
      if (!state.evaluation.prediction) feedback = { ok: false, message: "Choose a prediction first." };
      else {
        model.recordEvaluation(state.evaluation, result);
        feedback = { ok: state.evaluation.prediction === result.decision, title: labels[result.decision], message: (state.evaluation.prediction === result.decision ? "Correct prediction. " : "Compare your prediction with the layers. ") + result.reason, layers: result.layers };
      }
      handled = true;
    }
    if (event.type === "submit" && target.id === "repo-aws-config-form") {
      event.preventDefault();
      const values = { account: document.getElementById("repo-aws-account").value.trim(), bucket: document.getElementById("repo-aws-bucket").value.trim(), mfaName: document.getElementById("repo-aws-mfa").value.trim() };
      if (!window.IamRepoAws.valid(values)) {
        feedback = { ok: false, message: "Enter a 12-digit account ID, a valid new bucket name, and a valid virtual MFA device name (letters, digits, or +=,.@_-; up to 64 characters)." };
      } else {
        const changed = ["account", "bucket", "mfaName"].some(function (field) { return aws[field] !== values[field]; });
        aws = Object.assign(values, { done: changed ? [] : aws.done });
        feedback = { ok: true, message: "Live instructions personalized. Nothing has been created or changed in AWS." };
      }
      handled = true;
    }
    if (event.type === "click") {
      const button = target.closest("button");
      if (!button || button.disabled) return false;
      if (button.dataset.repoStep !== undefined) {
        const step = Number(button.dataset.repoStep);
        if (Number.isInteger(step) && step >= 0 && step < 6) state.step = step;
        feedback = null;
        handled = true;
      }
      if (button.dataset.repoLive !== undefined) {
        state.live = button.dataset.repoLive === "true";
        feedback = null;
        handled = true;
      }
      if (button.dataset.repoEvaluation) {
        const preset = button.dataset.repoEvaluation;
        Object.assign(state.evaluation, { allow: preset !== "implicit", deny: preset === "deny", boundary: preset === "boundary" ? "noS3" : "none", scp: preset === "scp" ? "deny" : "allow", prediction: "" });
        feedback = null;
        handled = true;
      }
      const actionName = button.dataset.repoAction;
      if (actionName) {
        handled = true;
        feedback = null;
        if (actionName === "group") state.group = true;
        if (actionName === "group-test") {
          const policies = state.group && state.member && state.managed ? [{ name: "developers / RepoReadBucket", document: state.reader || model.readPolicy() }] : [];
          const result = engine.evaluate(policies, { action: "s3:GetObject", resource: "arn:aws:s3:::my-lab-bucket/example.txt" });
          feedback = { ok: result.decision === "allowed", title: labels[result.decision], message: "The group contributes permission only when the user is a member and the policy is attached.", result: result };
        }
        if (actionName === "solution") state.draft = JSON.stringify(model.readPolicy(), null, 2);
        if (actionName === "ec2-role") state.ec2.role = true;
        if (actionName === "ec2-test") {
          const result = model.ec2Request(state.ec2);
          model.mark(state.ec2.tested, result.decision);
          feedback = { ok: result.decision === "allowed", title: labels[result.decision], message: result.message, result: result };
        }
        if (actionName === "cli-role") state.cli.role = true;
        if (actionName === "cli-run") feedback = Object.assign({ title: "CLI simulation" }, model.runCli(state.cli, state.cli.command));
        if (actionName === "expire" && state.cli.issued) {
          state.cli.expired = true;
          feedback = { ok: false, message: "This simulated session is now expired. Try a role command, then call AssumeRole again." };
        }
        if (actionName === "analyzer-enable") state.analyzer.enabled = true;
        if (actionName === "restrict") state.analyzer.principal = "user";
        if (["analyze", "restrict"].includes(actionName) && state.analyzer.enabled) {
          const external = state.analyzer.principal === "external";
          model.mark(state.analyzer.tested, external ? "external" : "restricted");
          feedback = { ok: !external, title: external ? "Preview finding: external account trusted" : "No external-access finding in this preview", message: external ? "The proposed role trust grants sts:AssumeRole to account 111122223333, outside account 123456789012. Review whether that sharing is intended; the caller's permissions and other controls still matter. No policy was deployed." : "The proposed trust is now within the account's trust zone. This does not prove every permission is least-privilege or that a role can access S3. No AWS policy was changed." };
        }
        message = "Local repository experiment saved.";
      }
    }
    if (!handled) return false;
    model.updateCompletion(state);
    save(callbacks.announce);
    callbacks.render();
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
    else if (event.type === "click" && target.closest("[data-repo-step], [data-repo-live]")) document.getElementById("main").focus();
    if (message) callbacks.announce(message);
    return true;
  }

  function reset() {
    state = model.freshState();
    feedback = null;
    save();
  }

  window.IamRepoLesson = { render: render, handle: handle, reset: reset };
})();
