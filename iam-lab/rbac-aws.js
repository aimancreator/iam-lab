(function () {
  "use strict";

  const model = window.IamRbacEngine;
  const labels = { allowed: "Allowed", implicitDeny: "Implicit deny", explicitDeny: "Explicit deny" };

  function commands(config, user) {
    if (!model.validConfig(config) || !model.users.includes(user)) throw new Error("Configure the RBAC account, two buckets, and learner first.");
    return [
      "rbac_probe() {",
      "  local caller",
      "  caller=$(aws sts get-caller-identity --query Arn --output text) || return 1",
      "  if [ \"$caller\" != 'arn:aws:iam::" + config.account + ":user/rbac-" + user + "' ]; then",
      "    printf '%s\\n' 'Stop: open CloudShell as rbac-" + user + ", not as your administrator or a role.' >&2",
      "    return 1",
      "  fi",
      "  printf '%s\\n' 'Fictional RBAC practice data' > /tmp/rbac-upload.txt",
      "  printf '%s\\n' '1. Read development'",
      "  aws s3api get-object --bucket '" + config.dev + "' --key example.txt /tmp/rbac-development.txt",
      "  printf '%s\\n' '2. Read reports'",
      "  aws s3api get-object --bucket '" + config.reports + "' --key example.txt /tmp/rbac-reports.txt",
      "  printf '%s\\n' '3. Upload development probe'",
      "  aws s3api put-object --bucket '" + config.dev + "' --key upload-probe.txt --body /tmp/rbac-upload.txt",
      "  printf '%s\\n' '4. Upload reports probe'",
      "  aws s3api put-object --bucket '" + config.reports + "' --key upload-probe.txt --body /tmp/rbac-upload.txt",
      "  printf '%s\\n' '5. Delete development probe (expected AccessDenied)'",
      "  aws s3api delete-object --bucket '" + config.dev + "' --key upload-probe.txt",
      "}",
      "rbac_probe",
      "unset -f rbac_probe"
    ].join("\n");
  }

  function render(config, state, ui) {
    ui = window.IamVisuals.withPanels(ui, {
      "1 / Prepare safely": "safety",
      "2 / Apply this simulator configuration manually": "rbac",
      "3 / Test each real identity": "request",
      "4 / Repeat the six RBAC experiments": window.IamVisuals.rbacCases[state.scenario],
      "5 / Clean up only this RBAC lab": "cleanup"
    });
    const configured = model.validConfig(config);
    const values = configured ? config : { account: "123456789012", dev: "your-new-rbac-development-bucket", reports: "your-new-rbac-reports-bucket" };
    function codeBlock(id, title, value) {
      return '<div class="code-block"><div class="panel-title"><h3>' + title + '</h3><button type="button" class="secondary small-button" data-copy="' + id + '"' + (!configured ? " disabled" : "") + '>Copy ' + (typeof value === "string" ? "commands" : "JSON") + '</button></div><pre><code id="' + id + '">' + ui.escape(typeof value === "string" ? value : JSON.stringify(value, null, 2)) + '</code></pre></div>';
    }
    function confirmation(index, title) {
      return '<label class="check-label"><input type="checkbox" data-rbac-aws-check="' + index + '"' + (config.done.includes(index) ? " checked" : "") + (!configured ? " disabled" : "") + '><span>' + title + '</span></label>';
    }
    const setup = ui.panel("Personalize a separate practice environment", '<p>Two new IAM users, three job-function groups, three customer managed policies, and two new private S3 buckets. This does not reuse or modify the original lab or Repository Lab 01.</p><form id="rbac-aws-config-form"><div class="rbac-config"><div class="form-field"><label for="rbac-aws-account">12-digit AWS account ID</label><input id="rbac-aws-account" inputmode="numeric" maxlength="12" required pattern="[0-9]{12}" value="' + ui.escape(config.account) + '"></div><div class="form-field"><label for="rbac-aws-dev">New development bucket name</label><input id="rbac-aws-dev" required maxlength="63" value="' + ui.escape(config.dev) + '"></div><div class="form-field"><label for="rbac-aws-reports">New reports bucket name</label><input id="rbac-aws-reports" required maxlength="63" value="' + ui.escape(config.reports) + '"></div></div><button class="primary" type="submit">Personalize RBAC steps</button></form><p class="help">Use distinct, globally unique names: 3–63 lowercase letters, digits, or hyphens; start/end with a letter or digit. Reserved AWS prefixes and suffixes are rejected. Commercial aws partition; use Singapore (ap-southeast-1) for both buckets and CloudShell. Never enter passwords, keys, or MFA codes here.</p>');
    const preflight = ui.panel("1 / Prepare safely", '<ol><li>Use a sandbox account with your existing administrator, preferably federated through IAM Identity Center. Keep root protected with MFA and do not use root for the exercise. Keep the administrator in a separate browser profile.</li><li>Check billing and budget alerts. Alerts are not a spending cap. S3 storage and requests may cost money; Free Tier eligibility is not guaranteed. Use tiny fictional files and clean up afterward. No EC2 instance or access key is needed.</li><li>If any rbac- user/group or Rbac policy named here already exists, stop and inspect it. Do not overwrite or delete existing team resources. Use an isolated account if these names conflict.</li><li>Create the two configured general purpose buckets in the shared global namespace. Block all public access, disable ACLs, keep versioning off, and use SSE-S3. Add no bucket policies. Upload <a href="samples/example.txt" target="_blank" rel="noopener">example.txt</a> to the root of each bucket.</li><li>As administrator, create <code>rbac-alice</code> and <code>rbac-bob</code>, at the default IAM path, with console access and password change on first sign-in. Enrol MFA for both. Retain IAMUserChangePassword if needed; create no access keys.</li><li>For CLI testing only, attach AWS managed <code>AWSCloudShellFullAccess</code> directly to each learner. It grants CloudShell access, not S3 access. All S3 grants in this exercise must come from the three job-function groups below.</li></ol>' + confirmation(0, "I prepared only new lab resources, secured the learners, and checked costs."));
    const assignmentRows = model.users.map(function (user) {
      const assigned = model.roles.filter(function (role) { return state.members[user][role]; }).map(function (role) { return model.groups[role]; });
      return '<tr><th scope="row">rbac-' + user + '</th><td>' + (assigned.length ? assigned.map(ui.escape).join(', ') : '<strong>None of the three S3 groups</strong>') + '</td></tr>';
    }).join("");
    const policies = ui.panel("2 / Apply this simulator configuration manually", '<p>Create the groups and customer managed policies below; attach each policy only to its matching group. For later changes, edit that existing policy and save its new version as the default. Do not add a broad policy to make a denied request succeed.</p><p><strong>These documents reflect your current local controls:</strong> Developer uploads ' + (state.developerWrite ? "enabled" : "disabled") + '; upload freeze ' + (state.freeze ? "enabled" : "disabled") + '. The freeze is narrowly scoped to PutObject in the new development bucket, not account-wide.</p>' + model.roles.map(function (role) {
      return codeBlock("rbac-aws-policy-" + role, model.policyNames[role] + " → " + model.groups[role], model.groupPolicy(state, role, values));
    }).join("") + '<div class="table-wrap"><table><caption>Set the real memberships to match this table. Remove old S3 group memberships that are no longer listed.</caption><thead><tr><th>User</th><th>Required memberships</th></tr></thead><tbody>' + assignmentRows + '</tbody></table></div><p class="help">Naming a group Developers grants nothing by itself. The attached policy is the permission definition. No direct S3 grants, AdministratorAccess, AmazonS3FullAccess, broad ReadOnlyAccess, resource-policy grants, or unrelated group memberships belong on these learners.</p>' + confirmation(1, "I applied all three policy documents and both users’ exact memberships."));
    const tests = [["Read development", "dev", "s3:GetObject"], ["Read reports", "reports", "s3:GetObject"], ["Upload development", "dev", "s3:PutObject"], ["Upload reports", "reports", "s3:PutObject"], ["Delete development probe", "dev", "s3:DeleteObject"]];
    const expectationRows = tests.map(function (test) {
      return '<tr><th scope="row">' + test[0] + '</th>' + model.users.map(function (user) { return '<td>' + labels[model.request(state, user, test[1], test[2], values).decision] + '</td>'; }).join("") + '</tr>';
    }).join("");
    const testing = ui.panel("3 / Test each real identity", '<p>Sign in as each learner using separate browser profiles, complete the first-login password change, authenticate with MFA, and open CloudShell Bash in Singapore. Use the matching function below. It stops before S3 requests unless the caller ARN is exactly the configured learner in your account.</p><p>The upload commands can create/overwrite only the fictional <code>upload-probe.txt</code> in your new lab buckets. No policy grants DeleteObject, so the delete probe should fail; the administrator cleans up later.</p>' + model.users.map(function (user) {
      return codeBlock("rbac-aws-commands-" + user, "Run only as rbac-" + user, commands(values, user));
    }).join("") + '<div class="table-wrap"><table><caption>Expected authorization with the current policies and memberships</caption><thead><tr><th>Request</th><th>rbac-alice</th><th>rbac-bob</th></tr></thead><tbody>' + expectationRows + '</tbody></table></div><p class="help">Implicit and explicit denies both usually appear as AccessDenied in the CLI. Use the policy trace locally to explain the difference. Missing files or network errors are not authorization evidence. These policies intentionally omit ListBucket and console navigation; read the known example.txt key with s3api instead.</p><p class="help">If the actual outcome differs, confirm the caller ARN, current default policy versions, group memberships, and IAM propagation. Other AWS policies, organization controls, KMS encryption, or different resource settings can change results. Stop and investigate unexpected access rather than widening permissions.</p>' + confirmation(2, "I tested Alice and Bob separately and compared their actual results."));
    const experiment = ui.panel("4 / Repeat the six RBAC experiments", '<ol><li>Return to <strong>Interactive simulation</strong>. Load each scenario, make the requested assignment/policy edits, and predict the requests.</li><li>Come back here. Reapply the generated JSON and memberships in AWS; local changes do not update AWS automatically.</li><li>Retest in each learner’s CloudShell. Observe a read-only job, combined jobs, one shared-policy change affecting both users, job transfer, S3 access removal, and explicit Deny.</li></ol><p><strong>Important:</strong> removing all three S3 groups does not delete the IAM user, disable sign-in, remove CloudShell access, or revoke already-issued role sessions. It only removes these group grants. Full organizational offboarding is broader than this exercise.</p><p class="help">The five confirmations are reset when assignments, policy switches, or AWS configuration change so they describe the current setup. Request selections and predictions do not reset them.</p>' + confirmation(3, "I repeated the access-change experiments and explained the differences."));
    const cleanup = ui.panel("5 / Clean up only this RBAC lab", '<ol><li>Sign out of both learner sessions. Remove the lab files <code>/tmp/rbac-upload.txt</code>, <code>/tmp/rbac-development.txt</code>, and <code>/tmp/rbac-reports.txt</code> from their CloudShell sessions when finished.</li><li>As administrator, empty and delete only <code>' + ui.escape(values.dev) + '</code> and <code>' + ui.escape(values.reports) + '</code>, including upload probes. If you enabled versioning, delete versions and delete markers too.</li><li>Remove the learners from rbac-readers, rbac-developers, and rbac-auditors. Detach their CloudShell/password policies, remove console credentials, deactivate their MFA devices, and delete only rbac-alice and rbac-bob. Delete their now-unused virtual MFA devices; remove saved lab passwords and authenticator entries.</li><li>Detach the three Rbac customer managed policies from their groups, delete the empty groups, then delete those policies and their nondefault versions if prompted. Do not delete AWS managed policies or unrelated resources.</li><li>Verify this lab’s resources are gone. Leave existing administrators, billing alerts, security controls, the other lab tracks, and shared resources intact.</li></ol>' + confirmation(4, "I completed cleanup and checked that the RBAC lab resources are gone."));
    return ui.callout("<strong>Manual AWS practice, not a live connection.</strong> The page never contacts AWS. Copying a policy, changing a checkbox, or completing the simulator does not verify or alter your account.") + setup + '<p id="rbac-aws-count" class="help">' + config.done.length + ' / 5 manual AWS confirmations</p>' + preflight + policies + testing + experiment + cleanup;
  }

  window.IamRbacAws = { commands: commands, render: render };
})();
