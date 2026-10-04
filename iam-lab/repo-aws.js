(function () {
  "use strict";

  const model = window.IamRepoEngine;
  const engine = window.IamLab;

  function valid(config) {
    return Boolean(config && typeof config.account === "string" && /^\d{12}$/.test(config.account) &&
      typeof config.bucket === "string" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) &&
      !/^(xn--|sthree-|amzn-s3-demo-)/.test(config.bucket) && !/(-s3alias|--ol-s3|--x-s3|--table-s3|-an)$/.test(config.bucket) &&
      typeof config.mfaName === "string" && /^[A-Za-z0-9+=,.@_-]{1,64}$/.test(config.mfaName));
  }

  function normalize(input) {
    const config = { account: "", bucket: "", mfaName: "repo-learner", done: [] };
    if (!input || typeof input !== "object") return config;
    if (valid(input)) ["account", "bucket", "mfaName"].forEach(function (field) { config[field] = input[field]; });
    if (Array.isArray(input.done)) config.done = Array.from(new Set(input.done.filter(function (index) { return Number.isInteger(index) && index >= 0 && index < 8; })));
    return config;
  }

  function bundle(config) {
    return {
      RepoReadBucket: model.readPolicy(config.bucket),
      RepoAssumeRole: engine.assumePolicy(config.account, "repo-cli-reader"),
      RepoCliTrust: engine.trustPolicy(config.account, "repo-learner"),
      RepoEC2Trust: engine.ec2TrustPolicy()
    };
  }

  function roleCommands(config) {
    return [
      "set +x",
      "repo_role_experiment() {",
      "  local caller mfa_code role_credentials role_key role_secret role_token",
      "  caller=$(aws sts get-caller-identity --query Arn --output text) || return 1",
      "  if [ \"$caller\" != 'arn:aws:iam::" + config.account + ":user/repo-learner' ]; then",
      "    printf '%s\\n' 'Stop: open CloudShell as repo-learner, not as your administrator.' >&2",
      "    return 1",
      "  fi",
      "  read -r -s -p 'Current MFA code: ' mfa_code",
      "  printf '\\n'",
      "  role_credentials=$(aws sts assume-role \\",
      "    --role-arn 'arn:aws:iam::" + config.account + ":role/repo-cli-reader' \\",
      "    --role-session-name iam-practice --duration-seconds 900 \\",
      "    --serial-number 'arn:aws:iam::" + config.account + ":mfa/" + config.mfaName + "' \\",
      "    --token-code \"$mfa_code\" \\",
      "    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text) || return 1",
      "  read -r role_key role_secret role_token <<< \"$role_credentials\"",
      "  unset role_credentials mfa_code",
      "  (",
      "    export AWS_ACCESS_KEY_ID=\"$role_key\"",
      "    export AWS_SECRET_ACCESS_KEY=\"$role_secret\"",
      "    export AWS_SESSION_TOKEN=\"$role_token\"",
      "    aws sts get-caller-identity",
      "    aws s3api get-object --bucket '" + config.bucket + "' --key example.txt /tmp/repo-role-example.txt || exit 1",
      "    aws s3api put-object --bucket '" + config.bucket + "' --key upload-probe.txt --body /tmp/repo-role-example.txt",
      "  )",
      "}",
      "repo_role_experiment",
      "unset -f repo_role_experiment",
      "aws sts get-caller-identity"
    ].join("\n");
  }

  function previewCommands(config, principal) {
    return [
      "cat > repo-access-preview.json <<'JSON'",
      JSON.stringify(model.previewConfiguration(config.account, principal), null, 2),
      "JSON",
      "ANALYZER_ARN=$(aws accessanalyzer get-analyzer --analyzer-name repo-external-lab --region ap-southeast-1 --query analyzer.arn --output text) &&",
      "PREVIEW_ID=$(aws accessanalyzer create-access-preview --analyzer-arn \"$ANALYZER_ARN\" --configurations file://repo-access-preview.json --region ap-southeast-1 --query id --output text) &&",
      "aws accessanalyzer get-access-preview --analyzer-arn \"$ANALYZER_ARN\" --access-preview-id \"$PREVIEW_ID\" --region ap-southeast-1 --query accessPreview.status --output text"
    ].join("\n");
  }

  function render(config, step, ui) {
    const configured = valid(config);
    const values = configured ? config : { account: "123456789012", bucket: "your-new-unique-repo-bucket", mfaName: "repo-learner" };
    const policies = bundle(values);
    const bucket = ui.escape(values.bucket);
    function link(url, label) { return '<a href="' + ui.escape(url) + '" target="_blank" rel="noopener noreferrer">' + label + ' ↗</a>'; }
    function block(id, label, value) {
      return '<div class="code-block"><div class="panel-title"><h3>' + label + '</h3><button type="button" class="secondary small-button" data-copy="' + id + '"' + (!configured ? " disabled" : "") + '>Copy ' + (typeof value === "string" ? "commands" : "JSON") + '</button></div><pre><code id="' + id + '">' + ui.escape(typeof value === "string" ? value : JSON.stringify(value, null, 2)) + '</code></pre></div>';
    }
    function check(index, label) {
      const picture = index === 0 ? "safety" : index === 7 ? "cleanup" : "";
      return (picture ? window.IamVisuals.card(picture, { compact: true }) : "") + '<label class="check-label"><input type="checkbox" data-repo-aws-check="' + index + '"' + (config.done.includes(index) ? " checked" : "") + '><span>' + label + '</span></label>';
    }
    const setup = '<details class="panel repo-setup"' + (!configured ? " open" : "") + '><summary>Personalize the repository’s AWS lab</summary><p class="lesson-copy">This is a separate set of new resources. Your original nine missions and their AWS settings are unchanged. The simulator does not connect to AWS; these documents and commands are for you to review and use manually.</p><form id="repo-aws-config-form"><div class="repo-config">' +
      '<div class="form-field"><label for="repo-aws-account">Your 12-digit AWS account ID</label><input id="repo-aws-account" type="text" value="' + ui.escape(config.account) + '" pattern="[0-9]{12}" maxlength="12" inputmode="numeric" required></div>' +
      '<div class="form-field"><label for="repo-aws-bucket">New globally unique S3 bucket</label><input id="repo-aws-bucket" type="text" value="' + ui.escape(config.bucket) + '" pattern="[a-z0-9][a-z0-9\\-]{1,61}[a-z0-9]" minlength="3" maxlength="63" required></div>' +
      '<div class="form-field"><label for="repo-aws-mfa">Virtual MFA device name for repo-learner</label><input id="repo-aws-mfa" type="text" value="' + ui.escape(config.mfaName) + '" pattern="[A-Za-z0-9+=,.@_\\-]{1,64}" maxlength="64" required><p class="help">A device name, not a one-time MFA code. Match the device created in step 1.</p></div></div><button class="primary" type="submit">Personalize policies &amp; commands</button></form><p class="help">Copying is disabled for example values. Changing these settings clears only this track’s manual AWS checklist.</p></details>';
    const preflight = '<details class="panel repo-preflight"' + (step === 0 ? " open" : "") + '><summary>Before AWS: Lab 00 safety checks</summary><ul><li>Use a dedicated practice account and an existing administrator, preferably federated through IAM Identity Center. Keep root protected with MFA and do not use root for the exercise.</li><li>Set a budget alert you are comfortable with, confirm delivery, and monitor billing. The source suggests $1 alerts; alerts do not guarantee a hard spending cap. Verify your actual Free Tier plan instead of assuming the repository’s older limits apply.</li><li>Use Singapore (<code>ap-southeast-1</code>) for this exercise. Optional CloudWatch billing metrics use <code>us-east-1</code>. No EC2 instance, NAT gateway, RDS, or load balancer is needed.</li><li>Use only fresh lab resources. If <code>repo-learner</code>, <code>repo-developers</code>, <code>repo-cli-reader</code>, <code>repo-ec2-reader</code>, <code>RepoReadBucket</code>, <code>RepoAssumeRole</code>, or <code>repo-external-lab</code> already exist, stop rather than modifying unrelated resources.</li><li>Never paste passwords, MFA codes, or access keys into this page or chat. This adaptation uses CloudShell’s existing console authentication instead of creating long-lived access keys.</li></ul><p class="help">S3 storage and requests may cost money. External-access analysis is available without an additional analyzer charge; unused/internal analyzers and custom policy checks can incur charges. ' + link("https://aws.amazon.com/iam/access-analyzer/pricing/", "Access Analyzer pricing") + ' · ' + link("https://aws.amazon.com/s3/pricing/", "S3 pricing") + '</p>' + check(0, "I checked account safety, cost alerts, and fresh resource names.") + '</details>';
    const group = ui.panel("AWS 1 / Create the developers group and learner", '<ol><li>As administrator, create a fresh general purpose S3 bucket named <code>' + bucket + '</code> in Singapore’s shared global namespace. Keep Block all public access enabled, ACLs disabled, versioning off, and SSE-S3 encryption. Do not add a bucket policy.</li><li>Upload <a href="samples/example.txt" target="_blank" rel="noopener">example.txt</a> to its root. Use only fictional practice data.</li><li>Create IAM user <code>repo-learner</code> with console access, a strong password, and password change on first sign-in. Keep IAMUserChangePassword if needed. Enrol a virtual MFA device named <code>' + ui.escape(values.mfaName) + '</code> using the administrator session. Do not create access keys.</li><li>Create group <code>repo-developers</code> and add only this learner. The simulator/source call it developers; the live prefix avoids changing an existing team.</li><li>Create the customer managed <code>RepoReadBucket</code> policy from this JSON and attach it to the group. Also attach the AWS managed <code>AWSCloudShellFullAccess</code> to the group for CLI practice. CloudShell access does not grant S3 permissions.</li><li>In a separate browser profile, sign in as repo-learner, complete the password change, and authenticate with MFA. Open CloudShell in Singapore. Keep your administrator in a different profile.</li></ol>' +
      block("repo-aws-group-policy", "RepoReadBucket · attach to repo-developers", policies.RepoReadBucket) +
      '<p class="help">Do not grant AdministratorAccess, AmazonS3FullAccess, or broad ReadOnlyAccess to the learner. ' + link("https://docs.aws.amazon.com/cloudshell/latest/userguide/working-with-aws-cli.html", "CloudShell credentials") + '</p>' + check(1, "The bucket, learner, MFA, group, and managed policy are ready."));
    const policy = ui.panel("AWS 2 / Write and test the least-privilege policy", '<p>In the administrator session, inspect/edit <code>RepoReadBucket</code> → JSON. Explain Effect, Action, and Resource. If you rewrite it, save the new default policy version; do not attach an additional broader policy.</p>' +
      block("repo-aws-read-policy", "Exactly one bucket’s object reads", policies.RepoReadBucket) +
      '<p>Run these individually in the <strong>learner’s CloudShell</strong>. GetCallerIdentity must show <code>arn:aws:iam::' + ui.escape(values.account) + ':user/repo-learner</code>. Stop if it shows your administrator or an assumed role.</p>' +
      block("repo-aws-user-commands", "Learner CLI requests", [
        "aws sts get-caller-identity",
        "aws s3api get-object --bucket '" + values.bucket + "' --key example.txt /tmp/repo-user-example.txt",
        "aws s3api list-objects-v2 --bucket '" + values.bucket + "'",
        "aws s3api put-object --bucket '" + values.bucket + "' --key upload-probe.txt --body /tmp/repo-user-example.txt"
      ].join("\n")) +
      '<div class="table-wrap"><table><thead><tr><th>Request</th><th>Expected</th></tr></thead><tbody><tr><td>GetObject for example.txt</td><td>Allowed</td></tr><tr><td>ListObjectsV2 (requires ListBucket)</td><td>AccessDenied</td></tr><tr><td>PutObject for upload-probe.txt</td><td>AccessDenied</td></tr></tbody></table></div><p class="help">This exact source exercise omits S3 console navigation permissions. Use the known object key with s3api; console listing failures are expected. A missing object or network error is not evidence of an authorization denial.</p>' + check(2, "I tested a successful read and denied list/upload, and can explain the policy."));
    const ec2 = ui.panel("AWS 3 / Prepare an EC2 role without launching EC2", '<ol><li>As administrator, go to IAM → Roles → Create role → AWS service → EC2.</li><li>Attach <code>RepoReadBucket</code>, name the role <code>repo-ec2-reader</code>, and create it. The EC2 role wizard creates an instance profile with the same name.</li><li>Inspect its trust policy. It should name EC2 as the service, not S3. The following JSON is a trust-policy reference, not a managed permissions policy.</li></ol>' +
      block("repo-aws-ec2-trust", "repo-ec2-reader · service trust", policies.RepoEC2Trust) +
      block("repo-aws-profile-check", "Verify as administrator", "aws iam get-role --role-name repo-ec2-reader --query Role.AssumeRolePolicyDocument\naws iam get-instance-profile --instance-profile-name repo-ec2-reader --query 'InstanceProfile.Roles[].RoleName'") +
      '<p>No EC2 instance is required in source Lab 01. The role/profile is ready for the repository’s Lab 03. Creating this profile alone does not make an existing instance use it; an instance needs the profile associated with it.</p>' + check(3, "The EC2 role trusts EC2 and the instance profile contains it."));
    const sts = ui.panel("AWS 4 / Actually call STS AssumeRole", '<ol><li>As administrator, create role <code>repo-cli-reader</code> using Custom trust policy. Paste <code>RepoCliTrust</code> below and attach <code>RepoReadBucket</code> as its permissions.</li><li>Create customer managed policy <code>RepoAssumeRole</code> below; attach it to <code>repo-developers</code>. This exact account-delegation trust pattern needs the caller permission, the matching user ARN, and MFA.</li><li>In the <strong>learner’s CloudShell Bash session</strong>, run the generated function. Enter the current MFA code only into the hidden terminal prompt. Ensure the configured virtual device name matches its actual IAM ARN.</li></ol>' +
      block("repo-aws-cli-trust", "RepoCliTrust · role trust relationship only", policies.RepoCliTrust) +
      block("repo-aws-assume-policy", "RepoAssumeRole · attach to the learner’s group", policies.RepoAssumeRole) +
      block("repo-aws-sts-commands", "Learner only · AssumeRole and use all three credentials", roleCommands(values)) +
      '<p><strong>Expected:</strong> inside the subshell, the ARN contains <code>assumed-role/repo-cli-reader/iam-practice</code>, the download succeeds, and the upload returns <code>AccessDenied</code>. After the subshell, the final identity is <code>user/repo-learner</code> again. If an upload unexpectedly succeeds, inspect other grants and clean up the probe.</p><p class="help">Credentials are captured into local shell variables, never printed or saved to a credentials file. All three fields are exported only inside the subshell. Do not enable shell tracing or AWS CLI debug logging while handling credentials. The requested session lasts 900 seconds; closing a subshell is not server-side revocation.</p>' + check(4, "I assumed the role, checked its ARN, and tested role read/upload behavior."));
    const evaluation = ui.panel("AWS 5 / Compare with IAM Policy Simulator", '<ol><li>In your administrator session, open ' + link("https://policysim.aws.amazon.com/", "IAM Policy Simulator") + '. Select <code>repo-learner</code>.</li><li>Choose Amazon S3 and test GetObject, PutObject, and DeleteObject separately. Set the resource to <code>arn:aws:s3:::' + bucket + '/example.txt</code>.</li><li>Expected: GetObject allowed; PutObject and DeleteObject implicitly denied. Inspect the matched policy/statement, rather than guessing from the color.</li><li>For ListBucket, use the bucket ARN <code>arn:aws:s3:::' + bucket + '</code>, without /* or the object key. Expected: implicit deny.</li><li>Optionally select <code>repo-cli-reader</code> and compare its read-only policy. Successful S3 policy simulation does not prove that its trust policy allows AssumeRole; step 4 tests that separately.</li></ol><p>Keep the permission-boundary and SCP experiments in the local simulation. <strong>Do not attach deny experiments to your administrator, an organization, or a production identity.</strong></p><p class="help">AWS Policy Simulator is an authorization aid, not a live S3 request. Real outcomes can also depend on other policies, resource policies, boundaries, organization controls, encryption, and resource existence.</p>' + check(5, "I compared allowed/denied actions with AWS IAM Policy Simulator."));
    const analyzer = ui.panel("AWS 6 / Review a real finding without exposing resources", '<ol><li>Use the administrator, not the learner. In IAM → Access Analyzer, create an <strong>external access analyzer</strong> named <code>repo-external-lab</code> in Singapore with <strong>this AWS account</strong> as its trust zone. Its API type is ACCOUNT. Wait for Active.</li><li>Do not select unused access, internal access, or paid custom policy checks. Basic external-access analysis is the feature used here.</li><li>Use the administrator’s CloudShell. The following creates an <strong>access preview</strong> for a hypothetical <code>repo-preview-only</code> role. It does not create that role, alter its trust, or change any bucket policy. Do not paste the inner trust JSON into a real role.</li></ol>' +
      block("repo-aws-preview-external", "Proposed external trust · preview only", previewCommands(values, "external")) +
      '<p>Repeat this status command until it reports <code>COMPLETED</code>. If it reports FAILED, inspect <code>accessPreview.statusReason</code> in the full output and fix the configuration; do not treat failure as a clean result.</p>' +
      block("repo-aws-preview-results", "Poll, then list the preview findings", "aws accessanalyzer get-access-preview --analyzer-arn \"$ANALYZER_ARN\" --access-preview-id \"$PREVIEW_ID\" --region ap-southeast-1\naws accessanalyzer list-access-preview-findings --analyzer-arn \"$ANALYZER_ARN\" --access-preview-id \"$PREVIEW_ID\" --region ap-southeast-1") +
      '<p>When completed, review the proposed external principal, sts:AssumeRole action, and role resource. Now replace the hypothetical trust with your learner and make a <strong>new preview</strong>:</p>' +
      block("repo-aws-preview-restricted", "Restricted trust · second preview only", previewCommands(values, "user")) +
      '<p>After the second preview completes, run the results commands again with the new PREVIEW_ID. There should be no proposed external-access grant for this role. A preview is not a live security incident or evidence that the external principal actually accessed your account. Archiving a real finding would not remove its underlying permission.</p><p class="help">' + link("https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-preview-access-apis.html", "Access preview semantics") + ' · ' + link("https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/create-access-preview.html", "CreateAccessPreview configuration") + '</p>' + check(6, "I reviewed the external preview and compared it with a restricted preview."));
    const cleanup = '<details class="panel repo-cleanup"' + (step === 5 ? " open" : "") + '><summary>Finish: clean up this repository track</summary><ol><li>Close the learner’s CloudShell and sign out. In both lab CloudShell sessions remove only the temporary files created here: <code>/tmp/repo-user-example.txt</code>, <code>/tmp/repo-role-example.txt</code>, and <code>repo-access-preview.json</code> as applicable.</li><li>As administrator, empty and delete only <code>' + bucket + '</code>, including any upload probes. If you enabled versioning, remove versions and delete markers as well.</li><li>Detach RepoReadBucket from <code>repo-cli-reader</code> and <code>repo-ec2-reader</code>, then delete both roles. Delete the repo-ec2-reader instance profile too. If you reused it for an EC2 instance, finish that instance’s cleanup first; do not remove a profile still needed by a workload.</li><li>Remove repo-learner from repo-developers, remove its console credentials, deactivate its MFA device, and delete the user. Delete the unused virtual MFA device created for this lesson; remove its authenticator entry and saved password.</li><li>Detach RepoReadBucket, RepoAssumeRole, and AWSCloudShellFullAccess from repo-developers; delete the empty group. Delete only the two customer managed policies RepoReadBucket and RepoAssumeRole. Do not delete AWS managed policies. Trust policies disappear with their roles.</li><li>Delete only the <code>repo-external-lab</code> analyzer you created. The hypothetical preview role was never created, so there is no repo-preview-only role to delete. Leave shared analyzers, unrelated resources, and billing/security guardrails in place.</li><li>Confirm the named lab resources are gone. No instance or access key was required for this track.</li></ol>' + check(7, "I completed cleanup and checked that this track’s resources are gone.") + '</details>';
    return '<div class="callout"><strong>Manual AWS practice—not a live connection.</strong> Use the same six steps as the repository. Simulator success and checked boxes do not verify anything in your account.</div>' + setup + '<p id="repo-aws-count" class="help">' + config.done.length + ' / 8 manual AWS confirmations</p>' + preflight + [group, policy, ec2, sts, evaluation, analyzer][step] + window.IamVisuals.card(window.IamVisuals.repository[step]) + cleanup;
  }

  window.IamRepoAws = { valid: valid, normalize: normalize, bundle: bundle, roleCommands: roleCommands, previewCommands: previewCommands, render: render };
})();
