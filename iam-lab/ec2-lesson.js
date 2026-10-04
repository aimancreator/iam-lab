(function () {
  "use strict";

  const engine = window.IamLab;
  const questions = [
    {
      question: "What does it mean to assume a role?",
      options: ["Attach a JSON policy to an identity.", "Obtain temporary credentials and act using the role's permissions.", "Permanently add a user to the role."],
      answer: 1,
      explanation: "Assumption creates a role session with temporary credentials. Attaching a permissions policy defines what that session may do."
    },
    {
      question: "Your application runs on EC2 and reads S3. Which service should this role trust?",
      options: ["ec2.amazonaws.com", "s3.amazonaws.com", "The lab-readers IAM group"],
      answer: 0,
      explanation: "EC2 uses the role. S3 is the resource being accessed. The trust policy names the caller; the permissions policy names the S3 actions and resources."
    },
    {
      question: "An administrator launches an EC2 instance whose role has no S3 permissions. Does the application inherit that administrator's S3 access?",
      options: ["Yes, because the administrator launched it.", "Yes, if the instance has an instance profile.", "No. Requests using the instance role credentials use that role's permissions."],
      answer: 2,
      explanation: "Launching an instance does not transfer the administrator's permissions to the application. Having credentials establishes identity; an applicable policy must still grant access."
    }
  ];
  const requests = [
    { id: "read", label: "Download training/welcome.txt", action: "s3:GetObject", key: "training/welcome.txt" },
    { id: "private", label: "Download private/notes.txt", action: "s3:GetObject", key: "private/notes.txt" },
    { id: "upload", label: "Upload training/uploads/ec2-note.txt", action: "s3:PutObject", key: "training/uploads/ec2-note.txt" },
    { id: "list", label: "List training/", action: "s3:ListBucket", key: "", prefix: "training/" }
  ];
  const experiments = [
    { id: "credentials", label: "Before setup: no usable role credentials" },
    { id: "policy", label: "Role credentials, no S3 policy: implicit deny" },
    { id: "read", label: "Attach the policy: training download allowed" },
    { id: "private", label: "Private download: implicit deny" },
    { id: "upload", label: "Upload: implicit deny" }
  ];

  function ready(state) {
    return experiments.every(function (experiment) { return state.tested.includes(experiment.id); }) &&
      state.graded && questions.every(function (question, index) { return String(state.answers[index]) === String(question.answer); });
  }

  function terminology() {
    return '<div class="table-wrap"><table><thead><tr><th>Word</th><th>What you do</th><th>What it changes</th></tr></thead><tbody>' +
      '<tr><td>Attach</td><td>Attach an S3 permissions policy to an IAM role.</td><td>Defines which S3 requests the role may make.</td></tr>' +
      '<tr><td>Associate</td><td>Associate an instance profile containing the role with EC2.</td><td>Makes the role available to the instance.</td></tr>' +
      '<tr><td>Assume</td><td>An allowed user or service assumes the role.</td><td>Obtains temporary credentials for a role session.</td></tr>' +
      '</tbody></table></div><p class="help">An IAM user may assume a role when authorized; you do not add the user to the role as if it were a group. For EC2, AWS handles the role credentials, and the application’s SDK or CLI retrieves them automatically.</p>';
  }

  function render(state, ui, completed, feedback) {
    const escape = ui.escape;
    const gate = engine.ec2Request(state, { action: "s3:GetObject", resource: "arn:aws:s3:::iam-field-lab-demo/training/welcome.txt" });
    const credentialsReady = gate.phase === "authorization";
    const disabledRole = state.roleCreated ? "" : " disabled";
    const selectedRequest = requests.find(function (request) { return request.id === state.request; }) || requests[0];
    const configuration = [
      '<div class="ec2-step"><h3>1. Create the role</h3><p class="help">Role name: <code>lab-ec2-reader</code>. It begins with no S3 permissions.</p><button type="button" class="secondary" data-ec2-create' + (state.roleCreated ? " disabled" : "") + '>' + (state.roleCreated ? "Role created ✓" : "Create EC2 lab role") + '</button></div>',
      '<div class="ec2-step"><h3>2. Choose who may assume it</h3><label for="ec2-trust">Trusted service</label><select id="ec2-trust"' + disabledRole + '><option value="">No trusted service yet</option><option value="ec2.amazonaws.com"' + (state.trustedService === "ec2.amazonaws.com" ? " selected" : "") + '>Amazon EC2</option><option value="s3.amazonaws.com"' + (state.trustedService === "s3.amazonaws.com" ? " selected" : "") + '>Amazon S3</option></select><p class="help">Which service needs to use this role: the caller or the destination?</p></div>',
      '<div class="ec2-step"><h3>3. Make the role available to EC2</h3><p class="help">The instance profile is a container for the role. In the EC2 role wizard, AWS creates it for you; here you can see both steps.</p><button type="button" class="secondary" data-ec2-profile' + (!state.roleCreated || state.profileCreated ? " disabled" : "") + '>' + (state.profileCreated ? "Profile contains role ✓" : "Create profile containing this role") + '</button><div class="button-row"><label class="check-label"><input id="ec2-associated" type="checkbox"' + (state.associated ? " checked" : "") + (!state.profileCreated ? " disabled" : "") + '><span>Associate the profile with training-web-server</span></label></div></div>',
      '<div class="ec2-step"><h3>4. Attach the S3 permissions</h3><p class="help">First run a request with this unchecked. Role credentials alone do not grant S3 access.</p><label class="check-label"><input id="ec2-policy" type="checkbox"' + (state.policyAttached ? " checked" : "") + disabledRole + '><span>Attach <strong>LabEC2ReadTraining</strong> to the role</span></label></div>'
    ].join("");
    const flow = '<div class="ec2-flow" aria-label="EC2 obtains role credentials through an associated instance profile; its role policy determines S3 access">' +
      '<div class="map-node active"><b>EC2 APPLICATION</b><span>training-web-server</span></div>' +
      '<div class="map-node ' + (state.associated ? "active" : "") + '"><b>INSTANCE PROFILE</b><span>' + (state.associated ? "Role associated →" : "Not associated") + '</span></div>' +
      '<div class="map-node ' + (credentialsReady ? "active" : "") + '"><b>ROLE SESSION</b><span>' + (credentialsReady ? "Credentials available" : "Credentials unavailable") + '</span></div></div>' +
      '<p class="help">S3 policy attached: <strong>' + (state.policyAttached ? "yes — scoped training reads" : "no — no S3 permissions") + '</strong>.</p>';
    const playground = flow + '<form id="ec2-request-form"><div class="form-field"><label for="ec2-request">Application request to S3</label><select id="ec2-request">' + requests.map(function (request) {
      return '<option value="' + request.id + '"' + (selectedRequest.id === request.id ? " selected" : "") + '>' + escape(request.label) + '</option>';
    }).join("") + '</select></div><div class="form-field"><label for="ec2-prediction">Your prediction</label><select id="ec2-prediction" required><option value="">Choose an outcome…</option><option value="noCredentials">No usable role credentials</option><option value="implicitDeny">Implicit deny from S3</option><option value="allowed">Allowed</option></select></div><button class="primary" type="submit">Run as the EC2 application →</button></form><div id="ec2-result" aria-live="polite">' + feedback + '</div>';
    const quiz = '<form id="ec2-quiz-form">' + questions.map(function (question, index) {
      return '<fieldset class="quiz-question"><legend>' + (index + 1) + ". " + escape(question.question) + "</legend>" + question.options.map(function (option, optionIndex) {
        const chosen = String(state.answers[index]) === String(optionIndex);
        return '<label class="check-label"><input type="radio" name="ec2-answer-' + index + '" data-ec2-question="' + index + '" value="' + optionIndex + '"' + (chosen ? " checked" : "") + ' required><span>' + escape(option) + '</span></label>';
      }).join("") + (state.graded ? '<p class="quiz-feedback">' + (String(state.answers[index]) === String(question.answer) ? "✓ " : "Try again. ") + escape(question.explanation) + '</p>' : "") + '</fieldset>';
    }).join("") + '<button type="submit" class="primary">Check the three concepts</button></form>' + (state.graded && !completed ? ui.callout("Complete all five request experiments and answer all three questions correctly to finish this mission.") : "");
    const documents = '<details><summary>Inspect the EC2 role policies</summary><p><strong>Trust:</strong> which service may assume the role?</p>' + (state.trustedService ? '<pre><code>' + escape(JSON.stringify(engine.ec2TrustPolicy(state.trustedService), null, 2)) + '</code></pre>' : '<p>Select a trusted service to see its trust policy.</p>') + '<p><strong>Permissions:</strong> what may its session do after assuming it?</p><pre><code>' + escape(JSON.stringify(engine.ec2ReadPolicy(), null, 2)) + '</code></pre></details>';
    return '<section class="panel ec2-terms"><h2>Attach, associate, assume</h2>' + terminology() + '</section><div class="lab-grid"><div>' +
      ui.panel("08 / Configure the application role", configuration + documents) +
      ui.panel("Test the application’s identity", playground) +
      ui.panel("Check your understanding", quiz) +
      (completed ? '<div class="completion"><h2>EC2 role lesson complete.</h2><p>You separated trust, credentials, and permission. The application uses temporary role credentials to read only its allowed S3 prefix.</p><div class="button-row"><button type="button" class="secondary" data-open-aws-ec2>Try this in AWS ↗</button></div></div>' : "") +
      '</div><aside class="side-notes">' +
      ui.panel("Five experiments", '<p class="lesson-copy">Predict each outcome correctly. You can change the settings and retry at any time.</p>' + ui.checklist(experiments, state.tested) + '<ol class="ec2-steps"><li>Run a download before creating anything.</li><li>Create the role, trust EC2, create the profile, and associate it. Leave the S3 policy unchecked. Run the download again.</li><li>Attach the policy. Test training download, private download, and upload.</li></ol>') +
      ui.panel("Who uses the role?", ui.concept("U", "A user", "An authorized user switches roles or calls AssumeRole to receive temporary credentials.") + ui.concept("E", "An EC2 application", "AWS provides the associated role’s temporary credentials. The SDK or CLI uses them automatically; the application does not need to call AssumeRole for this same role.") + '<p class="help">The administrator may need iam:PassRole to assign a role to EC2. Passing a role to a service and assuming that role yourself are different permissions.</p>') +
      ui.panel("And the S3 bucket policy?", '<p class="lesson-copy">A role permissions policy describes what the role may access. A <strong>bucket policy</strong> is attached to S3 and identifies which principals may access that resource.</p><p class="help">Our same-account example uses the role policy and no bucket-policy grant. Other applicable controls can still restrict live AWS access.</p><p class="help">Each local request starts with no cached credentials. Real existing sessions may survive profile or trust changes until expiry; detaching a role is not a guaranteed immediate revocation. Credential rotation, propagation, network access, and expiry are outside this model.</p>') +
      '</aside></div>';
  }

  function renderAws(config, ui) {
    const configured = Boolean(config.account && config.bucket);
    const bucket = configured ? config.bucket : "your-unique-lab-bucket";
    const account = configured ? config.account : "123456789012";
    function command(id, title, text) {
      return '<div class="code-block"><div class="panel-title"><h3>' + title + '</h3><button type="button" class="secondary small-button" data-copy="' + id + '"' + (configured ? "" : " disabled") + '>Copy command</button></div><pre><code id="' + id + '">' + ui.escape(text) + '</code></pre></div>';
    }
    return '<details id="aws-ec2-extension" class="panel aws-step aws-extension"><summary>EC2 extension / Let an application read S3 <small id="aws-ec2-status">' + (config.ec2Done ? "✓ checked" : "optional · before cleanup") + '</small></summary>' +
      '<p>Use the bucket and objects from step 1, in the same AWS account. This extends the lesson to a real application role. Allow another 20–30 minutes. EC2, EBS, and public IPv4 usage can incur charges; check your account’s pricing and clean up when finished. ' + ui.link("https://aws.amazon.com/ec2/pricing/", "EC2 pricing") + '</p>' +
      terminology() +
      '<h3>1. Create the role and attach permissions</h3><ol><li>As administrator, create the customer managed policy <code>LabEC2ReadTraining</code> from the JSON below.</li><li>In <strong>IAM → Roles → Create role</strong>, select <strong>AWS service → EC2</strong>. Attach <code>LabEC2ReadTraining</code> and the AWS managed <code>AmazonSSMManagedInstanceCore</code> policy. The latter lets Systems Manager provide the terminal connection; it does not grant reads from your lab bucket.</li><li>Name the role <code>lab-ec2-reader</code>. This console workflow also creates an instance profile with the same name. Check the role’s trust relationship: its service principal should be <code>ec2.amazonaws.com</code>. The generated trust document below is a reference for that relationship.</li></ol>' +
      ui.codeBlock("aws-ec2-read-json", "LabEC2ReadTraining · attach to the EC2 role", engine.ec2ReadPolicy(bucket), configured) +
      ui.codeBlock("aws-ec2-trust-json", "LabEC2Trust · role trust relationship", engine.ec2TrustPolicy(), configured) +
      '<h3>2. Launch a small practice instance</h3><ol><li>Open EC2 in the bucket’s region. Launch one instance named <code>IAMFieldLabEC2</code> using the <strong>standard Amazon Linux 2023 AMI</strong> and a small compatible instance type whose displayed pricing fits your account. The standard AMI includes SSM Agent and AWS CLI v2.</li><li>For this Session Manager connection, proceed without an SSH key pair. Use a public subnet with a route to an internet gateway, auto-assign a public IPv4 address, and use a new lab security group with <strong>no inbound rules</strong> and outbound HTTPS (TCP 443). This provides access to SSM and S3; a public IP alone is insufficient without the route. A default VPC’s public subnet can provide this setup. If none exists, use your administrator’s approved network with SSM and S3 connectivity.</li><li>Under <strong>Advanced details → IAM instance profile</strong>, choose <code>lab-ec2-reader</code>. Keep instance metadata enabled and require <strong>IMDSv2</strong>. Use a small root EBS volume with Delete on termination enabled, then launch.</li><li>Once running and registered with Systems Manager, choose <strong>Connect → Session Manager → Connect</strong>. If it is unavailable, check the role, SSM policy, agent, region, and outbound network route. The administrator doing this needs the relevant EC2 and Session Manager permissions plus <code>iam:PassRole</code> for this role.</li></ol>' +
      '<p class="help">For a dedicated existing test instance, associate the profile through EC2 → Instances → select instance → Actions → Security → Modify IAM role. An instance can have one instance profile at a time; do not replace a role used by another workload.</p>' +
      '<h3>3. Verify identity, then test S3</h3><p>Run these commands <strong>inside the instance’s Session Manager terminal</strong>. Use a fresh instance without saved AWS credentials or credential environment variables. Set the region below to the region of your bucket; the example uses Singapore.</p>' +
      command("aws-ec2-identity-command", "Set the region and verify the caller", "export AWS_DEFAULT_REGION=ap-southeast-1\naws sts get-caller-identity") +
      '<p class="command-note">The returned ARN should look like <code>arn:aws:sts::' + ui.escape(account) + ':assumed-role/lab-ec2-reader/i-...</code>. That is a <strong>role session</strong>. No IAM user access keys or <code>aws configure</code> are needed.</p>' +
      command("aws-ec2-read-command", "Allowed · download the training object", "aws s3api get-object --bucket " + bucket + " --key training/welcome.txt /tmp/iam-lab-welcome.txt") +
      command("aws-ec2-list-command", "Allowed · list the training prefix", "aws s3api list-objects-v2 --bucket " + bucket + " --prefix training/") +
      command("aws-ec2-private-command", "Denied · download a private object", "aws s3api get-object --bucket " + bucket + " --key private/notes.txt /tmp/iam-lab-private.txt") +
      command("aws-ec2-upload-command", "Denied · upload the downloaded test file", "aws s3api put-object --bucket " + bucket + " --key training/uploads/ec2-note.txt --body /tmp/iam-lab-welcome.txt") +
      '<p>The first download and listing should succeed. The private download and upload should return <code>AccessDenied</code>, because the role has no matching Allow. Listing uses the bucket ARN and prefix condition; reading uses an object ARN. Existing bucket policies, organization controls, KMS settings, or other credentials can change live results.</p>' +
      '<details><summary>Why not trust S3? Why not use a user?</summary><p>EC2 is the service that needs the role. S3 receives the resulting requests, so the S3 actions belong in the permissions policy. The trust policy permits EC2 to assume the role. Your application gets temporary credentials through the SDK/CLI credential chain; it does not need its own IAM user or a separate AssumeRole call for this attached role.</p></details>' +
      '<h3>4. Clean up this extension first</h3><ol><li>End the terminal session. As administrator, terminate <code>IAMFieldLabEC2</code> and wait for termination. Confirm its lab EBS volume was deleted. Delete any retained volume and the security group created only for this exercise once unused.</li><li>Detach <code>LabEC2ReadTraining</code> and <code>AmazonSSMManagedInstanceCore</code> from <code>lab-ec2-reader</code>. Delete the role and its same-named instance profile; the IAM console normally removes both together. Verify the instance profile is gone.</li><li>Delete the customer managed <code>LabEC2ReadTraining</code> policy. Keep the AWS managed SSM policy. Continue with the core lab’s bucket, learner, and group cleanup in step 8.</li></ol>' +
      '<p class="help">' + ui.link("https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html", "EC2 roles") + ' · ' + ui.link("https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-metadata-security-credentials.html", "Automatic temporary credentials") + ' · ' + ui.link("https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html", "Session Manager prerequisites") + ' · ' + ui.link("https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-instance-permissions.html", "SSM instance permissions") + '</p>' +
      window.IamVisuals.card("ec2", { compact: true }) + '<div class="complete-step"><label class="check-label"><input type="checkbox" data-aws-ec2' + (config.ec2Done ? " checked" : "") + '><span>I completed the EC2 tests and cleaned up its resources in AWS.</span></label></div></details>';
  }

  window.IamEc2Lesson = { questions: questions, requests: requests, ready: ready, terminology: terminology, render: render, renderAws: renderAws };
})();
