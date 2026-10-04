(function (root) {
  "use strict";

  const engine = root.IamLab || require("./iam-engine.js");
  const defaults = Object.freeze({ account: "123456789012", bucket: "my-lab-bucket", user: "repo-learner", role: "repo-cli-reader" });
  const commands = Object.freeze({
    user: "aws sts get-caller-identity",
    assume: "aws sts assume-role --role-arn arn:aws:iam::123456789012:role/repo-cli-reader --role-session-name iam-practice --duration-seconds 900 --serial-number arn:aws:iam::123456789012:mfa/repo-learner --token-code <MFA-CODE>",
    identity: "aws sts get-caller-identity",
    read: "aws s3api get-object --bucket my-lab-bucket --key example.txt /tmp/repo-example.txt",
    upload: "aws s3api put-object --bucket my-lab-bucket --key upload.txt --body /tmp/repo-example.txt"
  });

  function policy(statements) {
    return { Version: "2012-10-17", Statement: statements };
  }

  function readPolicy(bucket = defaults.bucket) {
    return policy([{ Sid: "ReadOneBucket", Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::" + bucket + "/*" }]);
  }

  function freshState() {
    return {
      version: 1, step: 0, live: false, completed: [], group: false, member: false, managed: false,
      draft: JSON.stringify(policy([{ Effect: "Allow", Action: ["s3:TODO"], Resource: "arn:aws:s3:::TODO/*" }]), null, 2),
      reader: null, ec2: { role: false, trust: "", profile: false, policy: false, tested: [] },
      cli: { role: false, trust: false, caller: false, mfa: false, token: false, issued: false, expired: false, command: "user", tested: [] },
      evaluation: { allow: true, deny: false, boundary: "none", scp: "allow", prediction: "", tested: [] },
      analyzer: { enabled: false, principal: "external", tested: [] }
    };
  }

  function strings(value) {
    return Array.isArray(value) ? Array.from(new Set(value.filter(function (item) { return typeof item === "string"; }))) : [];
  }

  function normalize(input) {
    const state = freshState();
    if (!input || input.version !== 1) return state;
    if (Number.isInteger(input.step) && input.step >= 0 && input.step < 6) state.step = input.step;
    state.live = input.live === true;
    state.completed = Array.isArray(input.completed) ? Array.from(new Set(input.completed.filter(function (step) { return Number.isInteger(step) && step >= 0 && step < 6; }))) : [];
    ["group", "member", "managed"].forEach(function (field) { state[field] = input[field] === true; });
    if (typeof input.draft === "string" && input.draft.length <= 20000) state.draft = input.draft;
    try { if (input.reader) state.reader = checkReadPolicy(input.reader); } catch (error) { state.reader = null; }
    ["ec2", "cli", "evaluation", "analyzer"].forEach(function (section) {
      const saved = input[section] || {};
      Object.keys(state[section]).forEach(function (field) {
        if (typeof state[section][field] === "boolean" && typeof saved[field] === "boolean") state[section][field] = saved[field];
      });
      state[section].tested = strings(saved.tested);
    });
    if (input.ec2 && ["", "ec2.amazonaws.com", "s3.amazonaws.com"].includes(input.ec2.trust)) state.ec2.trust = input.ec2.trust;
    if (input.cli && Object.prototype.hasOwnProperty.call(commands, input.cli.command)) state.cli.command = input.cli.command;
    if (input.evaluation) {
      if (["none", "read", "noS3"].includes(input.evaluation.boundary)) state.evaluation.boundary = input.evaluation.boundary;
      if (["allow", "deny"].includes(input.evaluation.scp)) state.evaluation.scp = input.evaluation.scp;
      if (["", "allowed", "implicitDeny", "explicitDeny"].includes(input.evaluation.prediction)) state.evaluation.prediction = input.evaluation.prediction;
    }
    if (input.analyzer && ["external", "account", "user"].includes(input.analyzer.principal)) state.analyzer.principal = input.analyzer.principal;
    state.cli.issued = false;
    state.cli.expired = false;
    return state;
  }

  function checkReadPolicy(input) {
    const document = engine.parsePolicy(input);
    const statements = Array.isArray(document.Statement) ? document.Statement : [document.Statement];
    const grants = statements.filter(function (statement) { return statement.Effect === "Allow"; });
    if (!grants.length || grants.some(function (statement) {
      const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
      const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
      return actions.some(function (action) { return action !== "s3:GetObject"; }) ||
        resources.some(function (resource) { return resource !== "arn:aws:s3:::" + defaults.bucket + "/*"; }) || statement.Condition;
    })) throw new Error("Grant only s3:GetObject on arn:aws:s3:::my-lab-bucket/*. No broader actions, other resources, or conditions are needed for this exercise.");
    const checks = [
      ["s3:GetObject", "arn:aws:s3:::my-lab-bucket/example.txt", "allowed"],
      ["s3:GetObject", "arn:aws:s3:::my-lab-bucket/folder/another.txt", "allowed"],
      ["s3:GetObject", "arn:aws:s3:::other-bucket/example.txt", "implicitDeny"],
      ["s3:ListBucket", "arn:aws:s3:::my-lab-bucket", "implicitDeny"],
      ["s3:PutObject", "arn:aws:s3:::my-lab-bucket/example.txt", "implicitDeny"]
    ];
    if (!checks.every(function (check) { return engine.evaluate([document], { action: check[0], resource: check[1] }).decision === check[2]; })) throw new Error("The policy must allow reads throughout this bucket and leave listing, uploads, and other buckets ungranted.");
    return document;
  }

  function mark(list, item) {
    if (!list.includes(item)) list.push(item);
  }

  function updateCompletion(state) {
    if (state.group && state.member && state.managed) mark(state.completed, 0);
    if (state.group && state.reader) mark(state.completed, 1);
    if (["noCredentials", "implicitDeny", "allowed"].every(function (result) { return state.ec2.tested.includes(result); })) mark(state.completed, 2);
    if (["assume", "identity", "read", "upload"].every(function (command) { return state.cli.tested.includes(command); })) mark(state.completed, 3);
    if (["allowed", "implicit", "deny", "boundary", "scp"].every(function (test) { return state.evaluation.tested.includes(test); })) mark(state.completed, 4);
    if (["external", "restricted"].every(function (test) { return state.analyzer.tested.includes(test); })) mark(state.completed, 5);
  }

  function ec2Request(state) {
    if (!state.role || state.trust !== "ec2.amazonaws.com" || !state.profile) return { decision: "noCredentials", message: "No usable role credentials. Create the role, trust EC2, and make its instance profile available to the simulated instance." };
    const result = engine.evaluate(state.policy ? [{ name: "repo-ec2-reader / RepoReadBucket", document: readPolicy() }] : [], { action: "s3:GetObject", resource: "arn:aws:s3:::my-lab-bucket/example.txt" });
    result.message = result.decision === "allowed" ? "The EC2 role credentials identify the application; the attached S3 policy allows this read." : "The application has role credentials, but no S3 Allow. Credentials establish identity, not permission.";
    return result;
  }

  function runCli(state, command) {
    const userArn = "arn:aws:iam::" + defaults.account + ":user/" + defaults.user;
    const roleArn = "arn:aws:sts::" + defaults.account + ":assumed-role/" + defaults.role + "/iam-practice";
    if (command === "user") return { ok: true, output: JSON.stringify({ Account: defaults.account, Arn: userArn }, null, 2), message: "This command uses the original user identity, not the role." };
    if (command === "assume") {
      if (!state.role || !state.trust || !state.caller || !state.mfa) return { ok: false, output: "AccessDenied: AssumeRole requirements are not satisfied (simulation).", message: "Check role creation, caller permission, matching trust, and MFA. The role's S3 policy does not authorize the assumption." };
      state.issued = true;
      state.expired = false;
      mark(state.tested, "assume");
      return { ok: true, output: JSON.stringify({ Credentials: { AccessKeyId: "SIMULATED-NOT-A-REAL-KEY", SecretAccessKey: "SIMULATED-NOT-A-SECRET", SessionToken: "SIMULATED-SESSION-TOKEN", Expiration: "15 minutes after issuance (teaching example)" }, AssumedRoleUser: { Arn: roleArn } }, null, 2), message: "STS issued a three-part temporary credential set. These displayed values are deliberately unusable. Enable the session-token checkbox before making a role request." };
    }
    if (!["identity", "read", "upload"].includes(command)) return { ok: false, output: "Unsupported command.", message: "This is a preset-only simulator, not a real shell." };
    if (!state.issued) return { ok: false, output: "No role credentials (simulation).", message: "First run AssumeRole successfully." };
    if (state.expired) return { ok: false, output: "ExpiredToken (simulation).", message: "Request a new role session. This lab expires credentials only when you press Expire session; real credentials have an expiry time." };
    if (!state.token) return { ok: false, output: "Missing session token (simulation).", message: "Temporary credentials need the access key ID, secret access key, AND session token. Two fields are not enough." };
    mark(state.tested, command);
    if (command === "identity") return { ok: true, output: JSON.stringify({ Account: defaults.account, Arn: roleArn }, null, 2), message: "The assumed-role ARN confirms the active identity. The user's group permissions are not added to this role session." };
    const request = { action: command === "read" ? "s3:GetObject" : "s3:PutObject", resource: "arn:aws:s3:::my-lab-bucket/" + (command === "read" ? "example.txt" : "upload.txt") };
    const result = engine.evaluate([{ name: "repo-cli-reader / RepoReadBucket", document: readPolicy() }], request);
    return { ok: result.decision === "allowed", output: command === "read" ? "GetObject allowed. example.txt would be downloaded (simulation)." : "AccessDenied: PutObject has no matching Allow (simulation).", message: command === "read" ? "The role can read this bucket's objects." : "A role session is not automatically more powerful. This read-only role cannot upload.", result: result };
  }

  function evaluateLayers(settings) {
    const request = { action: "s3:GetObject", resource: "arn:aws:s3:::my-lab-bucket/example.txt" };
    const identityPolicies = settings.allow ? [{ name: "Identity Allow", document: readPolicy() }] : [];
    if (settings.deny) identityPolicies.push({ name: "Identity Deny", document: policy([{ Effect: "Deny", Action: "s3:GetObject", Resource: request.resource }]) });
    const identity = engine.evaluate(identityPolicies, request);
    const boundary = settings.boundary === "none" ? null : engine.evaluate([settings.boundary === "read" ? readPolicy() : policy([{ Effect: "Allow", Action: "ec2:DescribeInstances", Resource: "*" }])], request);
    const organization = engine.evaluate([policy([{ Effect: settings.scp === "deny" ? "Deny" : "Allow", Action: "*", Resource: "*" }])], request);
    const layers = [{ name: "Identity policy", result: identity }, { name: "Permissions boundary", result: boundary }, { name: "Organization SCP (model)", result: organization }];
    let decision = "allowed";
    let reason = "The identity grants access; each applicable limit permits it, and no explicit Deny matches.";
    if (layers.some(function (layer) { return layer.result && layer.result.decision === "explicitDeny"; })) {
      decision = "explicitDeny";
      reason = "A matching explicit Deny in an applicable layer overrides the identity's Allow.";
    } else if (layers.some(function (layer) { return layer.result && layer.result.decision === "implicitDeny"; })) {
      decision = "implicitDeny";
      reason = identity.decision === "implicitDeny" ? "The identity has no matching Allow. A boundary or SCP cannot grant that missing permission." : "The permissions boundary has no Allow for this read. The identity's Allow cannot exceed that boundary.";
    }
    return { decision: decision, reason: reason, layers: layers };
  }

  function recordEvaluation(settings, result) {
    if (settings.prediction !== result.decision) return;
    if (result.decision === "allowed") mark(settings.tested, "allowed");
    if (!settings.allow && !settings.deny && settings.boundary === "none" && settings.scp === "allow") mark(settings.tested, "implicit");
    if (settings.deny && settings.scp === "allow") mark(settings.tested, "deny");
    if (settings.allow && !settings.deny && settings.boundary === "noS3" && settings.scp === "allow") mark(settings.tested, "boundary");
    if (settings.allow && !settings.deny && settings.boundary === "none" && settings.scp === "deny") mark(settings.tested, "scp");
  }

  function previewTrust(account = defaults.account, principal = "external") {
    const outsideAccount = account === "111122223333" ? "444455556666" : "111122223333";
    const trusted = principal === "external" ? "arn:aws:iam::" + outsideAccount + ":root" : principal === "user" ? "arn:aws:iam::" + account + ":user/repo-learner" : "arn:aws:iam::" + account + ":root";
    return policy([{ Effect: "Allow", Principal: { AWS: trusted }, Action: "sts:AssumeRole" }]);
  }

  function previewConfiguration(account, principal) {
    return { ["arn:aws:iam::" + account + ":role/repo-preview-only"]: { iamRole: { trustPolicy: JSON.stringify(previewTrust(account, principal)) } } };
  }

  root.IamRepoEngine = { defaults: defaults, commands: commands, freshState: freshState, normalize: normalize, readPolicy: readPolicy, checkReadPolicy: checkReadPolicy, mark: mark, updateCompletion: updateCompletion, ec2Request: ec2Request, runCli: runCli, evaluateLayers: evaluateLayers, recordEvaluation: recordEvaluation, previewTrust: previewTrust, previewConfiguration: previewConfiguration };
  if (typeof module !== "undefined" && module.exports) module.exports = root.IamRepoEngine;
})(typeof globalThis === "undefined" ? this : globalThis);
