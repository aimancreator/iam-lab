(function () {
  "use strict";

  const engine = window.IamLab;
  const users = ["a", "b"];
  const buckets = Object.keys(engine.matrixBuckets);
  const bucketLabels = { a: "Bucket A", b: "Bucket B", shared: "Shared bucket" };
  const decisions = { allowed: "Allowed", implicitDeny: "Implicit deny", explicitDeny: "Explicit deny" };
  const actionLabels = { "s3:GetObject": "Read a file", "s3:PutObject": "Upload a file", "s3:ListBucket": "List files", "s3:DeleteObject": "Delete a file" };
  const experiments = [
    { id: "own", label: "Own buckets: run all reads. A reads A; B reads B; cross-access is denied.", tokens: ["own-aa", "own-ab", "own-ba", "own-bb"] },
    { id: "swap", label: "Swap A ↔ B: run all reads. Cross-access works; the old access disappears.", tokens: ["swap-aa", "swap-ab", "swap-ba", "swap-bb"] },
    { id: "group", label: "Own buckets: run A → Shared. The group grants the read.", tokens: ["group"] },
    { id: "remove", label: "Uncheck A’s group membership; run A → Shared again. No Allow remains.", tokens: ["remove"] },
    { id: "deny", label: "Deny shared: run A → Shared. The user’s Deny beats the group’s Allow.", tokens: ["deny"] },
    { id: "write", label: "Upload contrast: run all uploads. A can upload to B; B can only read B.", tokens: ["write-a", "write-b"] }
  ];
  const recipes = [
    { id: "own", label: "1 · Own buckets" }, { id: "swap", label: "2 · Swap A ↔ B" },
    { id: "deny", label: "3 · Deny shared" }, { id: "write", label: "4 · Upload contrast" }
  ];

  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]; });
  }

  function applyRecipe(state, recipe) {
    if (!recipes.some(function (item) { return item.id === recipe; })) return state;
    const next = engine.freshMatrixState();
    next.tested = state.tested.slice();
    if (recipe === "swap") {
      next.grants.a = { a: "none", b: "read", shared: "none" };
      next.grants.b = { a: "read", b: "none", shared: "none" };
    }
    if (recipe === "deny") {
      next.denies.a.shared = true;
      next.bucket = "shared";
    }
    if (recipe === "write") {
      next.grants.a.b = "write";
      next.bucket = "b";
      next.action = "s3:PutObject";
    }
    return next;
  }

  function record(state, user, bucket, action, result) {
    function mark(token) {
      if (!state.tested.includes(token)) state.tested.push(token);
    }
    const other = user === "a" ? "b" : "a";
    if (action === "s3:GetObject" && bucket !== "shared" && !state.denies[user].a && !state.denies[user].b) {
      if (state.grants[user][user] === "read" && state.grants[user][other] === "none") mark("own-" + user + bucket);
      if (state.grants[user][user] === "none" && state.grants[user][other] === "read") mark("swap-" + user + bucket);
    }
    if (action === "s3:GetObject" && user === "a" && bucket === "shared" && state.grants.a.shared === "none") {
      if (state.members.a && result.decision === "allowed") mark("group");
      if (!state.members.a && result.decision === "implicitDeny") mark("remove");
      if (state.members.a && result.decision === "explicitDeny") mark("deny");
    }
    if (action === "s3:PutObject" && bucket === "b") {
      if (user === "a" && state.grants.a.b === "write" && result.decision === "allowed") mark("write-a");
      if (user === "b" && state.grants.b.b === "read" && result.decision === "implicitDeny") mark("write-b");
    }
  }

  function finishedExperiments(state) {
    return experiments.filter(function (experiment) {
      return experiment.tokens.every(function (token) { return state.tested.includes(token); });
    });
  }

  function ready(state) {
    return finishedExperiments(state).length === experiments.length;
  }

  function recipeButtons() {
    return '<div class="button-row matrix-recipes">' + recipes.map(function (recipe) {
      return '<button type="button" class="secondary small-button" data-matrix-recipe="' + recipe.id + '">' + escape(recipe.label) + '</button>';
    }).join("") + '</div>';
  }

  function resultTable(state, names, interactive, action) {
    const selectedAction = action || state.action;
    return '<div class="table-wrap"><table class="access-matrix"><caption>' + escape(actionLabels[selectedAction]) + ' · ' + escape(selectedAction) + ' · ' + (interactive ? "calculated locally" : "expected after applying these policies in AWS") + '</caption><thead><tr><th scope="col">Requesting user</th>' + buckets.map(function (bucket) {
      return '<th scope="col">' + bucketLabels[bucket] + '<span class="matrix-bucket-name">' + escape(names[bucket]) + '</span></th>';
    }).join("") + '</tr></thead><tbody>' + users.map(function (user) {
      return '<tr><th scope="row">User ' + user.toUpperCase() + '<span class="matrix-bucket-name">matrix-user-' + user + '</span></th>' + buckets.map(function (bucket) {
        const result = engine.matrixRequest(state, user, bucket, selectedAction, names);
        const status = '<span class="matrix-decision ' + result.decision + '">' + (result.decision === "allowed" ? "✓ " : "⊘ ") + decisions[result.decision] + '</span>';
        return '<td>' + (interactive ? '<button type="button" class="matrix-cell" data-matrix-user="' + user + '" data-matrix-bucket="' + bucket + '" aria-label="Run ' + escape(selectedAction) + ' as User ' + user.toUpperCase() + ' on ' + bucketLabels[bucket] + ': ' + decisions[result.decision] + '">' + status + '<small>Run &amp; explain →</small></button>' : status) + '</td>';
      }).join("") + '</tr>';
    }).join("") + '</tbody></table></div>';
  }

  function controls(state) {
    return users.map(function (user) {
      return '<fieldset class="matrix-user-controls"><legend>User ' + user.toUpperCase() + ' · matrix-user-' + user + '</legend><label class="check-label"><input id="matrix-member-' + user + '" type="checkbox" data-matrix-member="' + user + '"' + (state.members[user] ? " checked" : "") + '><span>Member of <strong>matrix-shared-readers</strong></span></label>' + buckets.map(function (bucket) {
        const controlId = "matrix-grant-" + user + "-" + bucket;
        return '<div class="matrix-grant"><label for="' + controlId + '">' + bucketLabels[bucket] + ' · direct user grant</label><select id="' + controlId + '" data-matrix-grant="' + user + '" data-matrix-bucket="' + bucket + '">' + [["none", "No direct Allow"], ["read", "Read + list"], ["write", "Read + list + upload"]].map(function (option) {
          return '<option value="' + option[0] + '"' + (state.grants[user][bucket] === option[0] ? " selected" : "") + '>' + option[1] + '</option>';
        }).join("") + '</select><label class="check-label"><input id="matrix-deny-' + user + '-' + bucket + '" type="checkbox" data-matrix-deny="' + user + '" data-matrix-bucket="' + bucket + '"' + (state.denies[user][bucket] ? " checked" : "") + '><span>Explicitly deny this bucket’s operations</span></label></div>';
      }).join("") + '</fieldset>';
    }).join("");
  }

  function render(state, ui, completed, feedback) {
    const playground = '<p class="lesson-copy">Two pre-created local IAM users, three private buckets, one shared-readers group. Choose an action; every cell is a separate request. Click a cell to see <strong>whose policy</strong> allows or denies it.</p>' +
      recipeButtons() + '<p class="help">Presets replace only this playground’s permissions; earned checks are kept. They do not change AWS.</p>' +
      '<div class="form-field"><label for="matrix-action">Action to compare across all users and buckets</label><select id="matrix-action">' + engine.matrixActions.map(function (action) {
        return '<option value="' + action + '"' + (state.action === action ? " selected" : "") + '>' + actionLabels[action] + ' · ' + action + '</option>';
      }).join("") + '</select></div>' + resultTable(state, engine.matrixBuckets, true) +
      '<button type="button" class="primary" data-matrix-run-all>Run all 6 requests</button><p class="help">Each file request targets example.txt. This simulator checks authorization only: it does not upload, delete, or store objects.</p>' +
      '<div id="matrix-feedback" aria-live="polite">' + (feedback || ui.callout("Start with Own buckets → Run all 6 requests. Then swap the permissions and compare.")) + '</div>';
    const configuration = '<p class="lesson-copy">The group always allows <strong>read + list on the Shared bucket</strong>. Direct user grants below combine with that group policy. No direct Allow is not a Deny; another attached policy may still allow the request.</p><div class="matrix-controls">' + controls(state) + '</div>' +
      ui.callout("An explicit Deny here blocks S3 operations on that bucket and its objects—even if a group allows them. Nothing in this lab grants deletion.") +
      '<details><summary>Inspect the actual generated policies</summary>' + users.map(function (user) {
        return '<h3>MatrixUser' + user.toUpperCase() + ' · attached directly to matrix-user-' + user + '</h3><pre><code>' + escape(JSON.stringify(engine.matrixUserPolicy(state, user), null, 2)) + '</code></pre>';
      }).join("") + '<h3>MatrixSharedRead · attached to matrix-shared-readers</h3><pre><code>' + escape(JSON.stringify(engine.matrixGroupPolicy(), null, 2)) + '</code></pre></details>';
    const progress = ui.checklist(experiments, finishedExperiments(state).map(function (experiment) { return experiment.id; }));
    const explanation = ui.concept("1", "Bucket names do not assign owners", "These buckets belong to the AWS account—not to User A or User B. “A” and “B” are labels. Policies determine access.") +
      ui.concept("2", "User + group permissions combine", "A user can read a bucket through a direct policy, a group policy, or both. Removing one source does not remove access granted by another.") +
      ui.concept("3", "Actions are independent", "ListBucket uses a bucket ARN. GetObject, PutObject, and DeleteObject use object ARNs. Being allowed to read does not imply being allowed to upload.") +
      ui.concept("4", "This is same-account access", "No bucket policy is needed for these identity-policy grants in this setup. Cross-account sharing and additional real AWS controls are outside this model.");
    return '<div class="lab-grid"><div>' + ui.panel("01 / Who can access what?", playground, "2 users × 3 buckets") + ui.panel("02 / Change the permissions", configuration) +
      '</div><aside class="side-notes">' + ui.panel("Six guided experiments", progress + '<p class="help">Progress: ' + finishedExperiments(state).length + ' / 6 experiments. Changing a setting updates the preview; run the request to earn a check.</p>') +
      ui.panel("Why the result changes", explanation) +
      ui.panel("Try it in real AWS", '<p class="lesson-copy">Use the matching two-user, three-bucket walkthrough. It generates policies from these settings and explains how to test separate signed-in users.</p><button class="secondary" type="button" data-open-aws-matrix>Open AWS multi-user lab →</button><p class="help">The page never connects to your AWS account.</p>') +
      '</aside></div>' + (completed ? '<div class="completion"><div class="eyebrow">CROSS-ACCESS COMPLETE</div><h2>Permissions—not names—decide access.</h2><p>Keep experimenting with any user, bucket, action, and policy combination.</p></div>' : '');
  }

  function validNames(config) {
    if (!config || !buckets.every(function (bucket) {
      const name = config[bucket];
      return typeof name === "string" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name) &&
        !/^(xn--|sthree-|amzn-s3-demo-)/.test(name) && !/(-s3alias|--ol-s3|--x-s3|--table-s3|-an)$/.test(name);
    })) return false;
    return new Set(buckets.map(function (bucket) { return config[bucket]; })).size === buckets.length;
  }

  function bundle(state, names) {
    return { MatrixUserA: engine.matrixUserPolicy(state, "a", names), MatrixUserB: engine.matrixUserPolicy(state, "b", names), MatrixSharedRead: engine.matrixGroupPolicy(names) };
  }

  function awsCheck(config, index, label) {
    return window.IamVisuals.card(["safety", "group", "policy", "matrix", "deny", "cleanup"][index], { compact: true }) + '<label class="check-label"><input type="checkbox" data-aws-matrix-step="' + index + '"' + (config.done.includes(index) ? " checked" : "") + '><span>' + label + '</span></label>';
  }

  function renderAws(config, state, ui) {
    const configured = validNames(config);
    const names = configured ? config : { a: "your-unique-bucket-a", b: "your-unique-bucket-b", shared: "your-unique-bucket-shared" };
    const documents = bundle(state, names);
    const setup = '<h3>1 / Choose three new practice buckets</h3><p>This independent extension does not require the core bucket, EC2, or a role. Use one practice account and an existing administrator session. S3 storage and requests may incur charges; use tiny files and clean up. Do not reuse production buckets or identities.</p><form id="aws-matrix-config-form"><div class="matrix-aws-config">' + buckets.map(function (bucket) {
      return '<div class="form-field"><label for="aws-matrix-' + bucket + '">' + bucketLabels[bucket] + ' · globally unique name</label><input type="text" id="aws-matrix-' + bucket + '" value="' + escape(config[bucket] || "") + '" placeholder="' + escape(names[bucket]) + '" pattern="[a-z0-9][a-z0-9\\-]{1,61}[a-z0-9]" minlength="3" maxlength="63" required autocomplete="off"></div>';
    }).join("") + '</div><button type="submit" class="primary">Generate multi-user policies</button><p id="aws-matrix-config-error" class="help" role="alert"></p></form><p class="help">Use three different names. AWS checks global availability and naming rules. Example JSON cannot be copied until you save valid names. Saving different names clears only this extension’s checklist.</p>' +
      '<ol><li>As administrator, create these three <strong>general purpose S3 buckets in the shared global namespace</strong>, all in the same region: ' + buckets.map(function (bucket) { return '<code>' + escape(names[bucket]) + '</code>'; }).join(", ") + '.</li><li>Keep Block all public access on, ACLs disabled (Bucket owner enforced), versioning off, and use <strong>SSE-S3</strong> encryption. Do not add bucket policies or use KMS for this lesson.</li><li>Upload a tiny <code>example.txt</code> to the root of each bucket. You can use ' + ui.link("samples/example.txt", "this sample") + '. Optionally change the text to identify each bucket.</li></ol>' + awsCheck(config, 0, "I created the three private buckets and example.txt files.");
    const identities = '<h3>2 / Create two users and a group</h3><ol><li>As administrator, create IAM users <code>matrix-user-a</code> and <code>matrix-user-b</code> with console access. If these names already exist, stop and use a clean practice account; do not modify existing identities. Give each a strong password and require a password change at first sign-in. Keep IAMUserChangePassword if the console adds it; it does not grant S3 access.</li><li>Use each user’s Security credentials page to enrol MFA with your authenticator. Create <strong>no access keys</strong>. Never enter AWS passwords or MFA codes into this page.</li><li>Create the user group <code>matrix-shared-readers</code>. Initially add both users. Do not add AdministratorAccess, AmazonS3FullAccess, or ReadOnlyAccess.</li><li>Use <strong>three separate browser profiles</strong>: administrator, User A, and User B. Private windows in the same browser may share a session, so verify the active user in the account menu before every test. Complete first sign-in password changes and authenticate with MFA.</li></ol><p>A group distributes permissions; you do not sign in as the group. The buckets belong to the account, not to either IAM user. IAM users are used for this learning exercise; prefer Identity Center and temporary credentials for routine workforce access.</p>' + awsCheck(config, 1, "Both users, MFA, isolated sessions, and the group are ready.");
    const membership = users.map(function (user) {
      return '<li><code>matrix-user-' + user + '</code>: <strong>' + (state.members[user] ? "member" : "not a member") + '</strong> of <code>matrix-shared-readers</code>.</li>';
    }).join("");
    const policies = '<h3>3 / Apply the current simulator configuration</h3><p><strong>For your first run, choose Own buckets below.</strong> These buttons change the local simulator and generated JSON only. Every change must be applied separately in AWS; nothing is synchronized automatically.</p>' + recipeButtons() +
      '<ol><li>Open IAM → Policies → Create policy → JSON. Create a customer managed policy named <code>MatrixUserA</code> from the first document. Attach it directly to <code>matrix-user-a</code> using Users → Permissions → Add permissions → Attach policies directly.</li><li>Create <code>MatrixUserB</code> from the second document and attach it directly to <code>matrix-user-b</code> only. When changing experiments, <strong>edit these same policies and save the new default versions</strong>; do not leave earlier grants in extra attached policies. If the version limit is reached, remove an old non-default version of the lab policy when prompted.</li><li>Create the customer managed policy <code>MatrixSharedRead</code> from the third document, and attach it to <code>matrix-shared-readers</code>. Set group membership to match this snapshot:</li></ol><ul>' + membership + '</ul>' +
      ui.codeBlock("aws-matrix-a-json", "MatrixUserA · attach directly to matrix-user-a", documents.MatrixUserA, configured) +
      ui.codeBlock("aws-matrix-b-json", "MatrixUserB · attach directly to matrix-user-b", documents.MatrixUserB, configured) +
      ui.codeBlock("aws-matrix-group-json", "MatrixSharedRead · managed policy on the group", documents.MatrixSharedRead, configured) +
      '<button type="button" class="secondary" data-matrix-download' + (!configured ? " disabled" : "") + '>Download three-policy reference bundle</button><p class="help">Copy each individual document into IAM, not the whole reference bundle. This extension’s bundle is separate from the core/EC2 bundle.</p>' +
      awsCheck(config, 2, "I applied the individual policies and matching group membership in AWS.");
    const test = '<h3>4 / Test the baseline, then compare changes</h3><p>With <strong>Own buckets</strong> applied: User A can list/download from A but not B; User B can list/download from B but not A; both can read Shared. Neither can upload or delete. In each user’s S3 console, try opening each bucket and downloading <code>example.txt</code>.</p>' +
      '<p><strong>Current configuration:</strong> the table below predicts reads after you apply the JSON and group membership shown above. It may differ from the baseline if you have changed settings.</p>' +
      resultTable(state, names, false, "s3:GetObject") +
      '<p>Both users can see bucket names because their policies allow <code>ListAllMyBuckets</code>. Seeing a name is not permission to list its contents or download a file. An unauthorized bucket may fail at the listing step, before GetObject runs.</p>' +
      '<p>For an exact authorization check, use the administrator’s ' + ui.link("https://policysim.aws.amazon.com/", "IAM Policy Simulator") + ': choose the relevant IAM user, S3, and GetObject; supply <code>arn:aws:s3:::BUCKET-NAME/example.txt</code>. For ListBucket use <code>arn:aws:s3:::BUCKET-NAME</code>, without the slash or object key. The AWS policy simulator does not perform a live download or prove that the object exists.</p>' +
      awsCheck(config, 3, "I tested A → A/B/Shared and B → A/B/Shared in separate user sessions.");
    const changes = '<h3>5 / Change one thing, test again</h3><ol><li><strong>Swap A ↔ B:</strong> select that preset and replace both user policies in AWS. Now A reads B but not A; B reads A but not B. Shared reads still work. The bucket labels have no authorization meaning.</li><li><strong>Group removal:</strong> choose Own buckets and apply those policies. Remove A from the shared-readers group in AWS. A loses Shared access; B keeps it. In the local mission, uncheck A’s membership and test the same request. If you directly grant A access to Shared, that separate Allow still works without group membership.</li><li><strong>Explicit deny:</strong> choose Deny shared, restore A’s group membership in AWS, and update the user policies. A is denied Shared despite its group’s Allow; B is still allowed. An AWS error might simply say Access denied; inspect the policy statements to understand the reason.</li><li><strong>Upload contrast:</strong> choose that preset and replace both user policies. In B’s bucket, A can upload a tiny <code>upload-probe.txt</code>; B can read the bucket but cannot upload. Leave tags, ACLs, and encryption options unchanged. Both still lack deletion permission.</li></ol><p>Use <button type="button" class="text-button" data-step="8">Mission 9’s permission controls</button> for custom combinations, then return here to copy the updated documents. A local setting never changes real AWS access.</p>' +
      '<details><summary>Troubleshoot an unexpected result</summary><p>Allow time for IAM propagation and retry a fresh request. Check the actual signed-in user—not your administrator or a switched role—the exact bucket/object names, both attached user policies, and group membership. Other user/group policies may add access. Bucket policies, SCPs/RCPs, permissions boundaries, KMS, missing objects, and other AWS rules can change real results. This same-account lesson assumes no additional grants or restrictions; it does not model cross-account sharing. Some S3 console panels need permissions intentionally not granted here.</p></details>' +
      awsCheck(config, 4, "I tested swapped access, group removal, explicit deny, and upload contrast.");
    const cleanup = '<h3>6 / Clean up as administrator</h3><ol><li>Sign out of both lab users. In the administrator session, empty and delete <strong>only the three named practice buckets</strong>, including uploaded probes. If versioning was enabled, remove all versions and delete markers too. Lab users cannot perform this cleanup.</li><li>Remove both users from the group; detach MatrixUserA and MatrixUserB from their respective users; remove their console sign-in credentials and deactivate their MFA devices. Delete <code>matrix-user-a</code> and <code>matrix-user-b</code>. Delete unused virtual MFA devices created for this lab and remove their authenticator entries only after deactivation.</li><li>Detach <code>MatrixSharedRead</code>, delete the empty <code>matrix-shared-readers</code> group, and delete the three customer managed policies <code>MatrixUserA</code>, <code>MatrixUserB</code>, and <code>MatrixSharedRead</code>. Leave AWS managed policies intact. Remove saved lab passwords.</li><li>Verify the two users, group, three custom policies, and three buckets are gone. This extension uses no EC2 instance or role, so it creates no EC2 resources to remove.</li></ol>' +
      awsCheck(config, 5, "I removed this extension’s AWS resources and credentials.");
    const references = '<p class="help">Official guidance: ' + ui.link("https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-policies-s3.html", "S3 identity-policy examples") + ' · ' + ui.link("https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html", "Policy evaluation") + ' · ' + ui.link("https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html", "Bucket naming") + '.</p>';
    return '<details id="aws-matrix-extension" class="panel aws-step aws-extension"><summary>Multi-user extension / Who can access which bucket?</summary><div class="callout"><strong>Manual AWS walkthrough, not a live connection.</strong> Three new buckets, two new IAM users, one group. This extension has its own configuration and checklist; no core missions are required. No public bucket policies or access keys are needed.</div><p id="aws-matrix-count">' + config.done.length + ' / 6 confirmations · saved locally, not verified in AWS</p>' + setup + identities + policies + test + changes + cleanup + references + '</details>';
  }

  window.IamMatrixLesson = { render: render, renderAws: renderAws, applyRecipe: applyRecipe, record: record, ready: ready, validNames: validNames, bundle: bundle, resultTable: resultTable, experiments: experiments };
})();
