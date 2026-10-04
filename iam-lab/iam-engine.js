(function (root) {
  "use strict";

  const defaults = Object.freeze({
    account: "123456789012", bucket: "iam-field-lab-demo",
    user: "lab-learner", group: "lab-readers", role: "lab-uploader"
  });

  function documentWith(statements) {
    return { Version: "2012-10-17", Statement: statements };
  }

  function navigationStatements(bucket, parents) {
    return [
      { Sid: "ConsoleBucketNames", Effect: "Allow", Action: "s3:ListAllMyBuckets", Resource: "*" },
      { Sid: "LabBucketLocation", Effect: "Allow", Action: "s3:GetBucketLocation", Resource: "arn:aws:s3:::" + bucket },
      {
        Sid: "BrowseParentFolders", Effect: "Allow", Action: "s3:ListBucket", Resource: "arn:aws:s3:::" + bucket,
        Condition: { StringEquals: { "s3:prefix": parents, "s3:delimiter": "/" } }
      }
    ];
  }

  function protectObjects(bucket) {
    return {
      Sid: "ProtectLabObjects", Effect: "Deny", Action: ["s3:DeleteObject", "s3:DeleteObjectVersion"],
      Resource: "arn:aws:s3:::" + bucket + "/*"
    };
  }

  function readerPolicy(bucket = defaults.bucket) {
    return documentWith(navigationStatements(bucket, [""]).concat([
      {
        Sid: "ListTraining", Effect: "Allow", Action: "s3:ListBucket", Resource: "arn:aws:s3:::" + bucket,
        Condition: { StringLike: { "s3:prefix": "training/*" } }
      },
      { Sid: "ReadTraining", Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::" + bucket + "/training/*" },
      protectObjects(bucket)
    ]));
  }

  function uploadPolicy(bucket = defaults.bucket) {
    return documentWith(navigationStatements(bucket, ["", "training/"]).concat([
      {
        Sid: "ListUploads", Effect: "Allow", Action: "s3:ListBucket", Resource: "arn:aws:s3:::" + bucket,
        Condition: { StringLike: { "s3:prefix": "training/uploads/*" } }
      },
      {
        Sid: "ReadWriteUploads", Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject"],
        Resource: "arn:aws:s3:::" + bucket + "/training/uploads/*"
      },
      protectObjects(bucket)
    ]));
  }

  function assumePolicy(account = defaults.account, role = defaults.role) {
    return documentWith([{
      Sid: "AssumeLabUploader", Effect: "Allow", Action: "sts:AssumeRole",
      Resource: "arn:aws:iam::" + account + ":role/" + role
    }]);
  }

  function trustPolicy(account = defaults.account, user = defaults.user) {
    return documentWith([{
      Sid: "TrustLabLearnerWithMFA", Effect: "Allow", Principal: { AWS: "arn:aws:iam::" + account + ":root" },
      Action: "sts:AssumeRole",
      Condition: {
        ArnEquals: { "aws:PrincipalArn": "arn:aws:iam::" + account + ":user/" + user },
        Bool: { "aws:MultiFactorAuthPresent": "true" }
      }
    }]);
  }

  function deletePolicy(bucket = defaults.bucket) {
    return documentWith([{
      Sid: "ExtraDeleteAllow", Effect: "Allow", Action: "s3:DeleteObject",
      Resource: "arn:aws:s3:::" + bucket + "/training/uploads/*"
    }]);
  }

  function ec2ReadPolicy(bucket = defaults.bucket) {
    return documentWith([
      {
        Sid: "ListTraining", Effect: "Allow", Action: "s3:ListBucket", Resource: "arn:aws:s3:::" + bucket,
        Condition: { StringLike: { "s3:prefix": "training/*" } }
      },
      { Sid: "ReadTraining", Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::" + bucket + "/training/*" }
    ]);
  }

  function ec2TrustPolicy(service = "ec2.amazonaws.com") {
    return documentWith([{
      Sid: "TrustService", Effect: "Allow", Principal: { Service: service }, Action: "sts:AssumeRole"
    }]);
  }

  function freshEc2State() {
    return {
      roleCreated: false, trustedService: "", policyAttached: false, profileCreated: false,
      associated: false, request: "read", tested: [], answers: {}, graded: false
    };
  }

  function ec2Request(state, request) {
    const checks = [
      { label: "The lab-ec2-reader role exists", pass: state.roleCreated === true },
      { label: "Its trust policy permits the EC2 service", pass: state.trustedService === "ec2.amazonaws.com" },
      { label: "An instance profile contains this role", pass: state.profileCreated === true },
      { label: "That instance profile is associated with EC2", pass: state.associated === true }
    ];
    if (!checks.every(function (check) { return check.pass; })) {
      return { phase: "credentials", decision: "noCredentials", checks: checks };
    }
    const policies = state.policyAttached ? [{ name: "lab-ec2-reader / LabEC2ReadTraining", document: ec2ReadPolicy() }] : [];
    return Object.assign(evaluate(policies, request), {
      phase: "authorization", checks: checks,
      principal: "arn:aws:sts::" + defaults.account + ":assumed-role/lab-ec2-reader/i-demo"
    });
  }

  const matrixBuckets = Object.freeze({ a: "iam-matrix-demo-a", b: "iam-matrix-demo-b", shared: "iam-matrix-demo-shared" });
  const matrixActions = Object.freeze(["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]);

  function freshMatrixState() {
    return {
      grants: { a: { a: "read", b: "none", shared: "none" }, b: { a: "none", b: "read", shared: "none" } },
      denies: { a: { a: false, b: false, shared: false }, b: { a: false, b: false, shared: false } },
      members: { a: true, b: true }, user: "a", bucket: "a", action: "s3:GetObject", tested: []
    };
  }

  function normalizeMatrixState(input) {
    const state = freshMatrixState();
    if (!isObject(input)) return state;
    ["a", "b"].forEach(function (user) {
      Object.keys(matrixBuckets).forEach(function (bucket) {
        const grant = input.grants && input.grants[user] && input.grants[user][bucket];
        if (["none", "read", "write"].includes(grant)) state.grants[user][bucket] = grant;
        state.denies[user][bucket] = Boolean(input.denies && input.denies[user] && input.denies[user][bucket] === true);
      });
      if (input.members && typeof input.members[user] === "boolean") state.members[user] = input.members[user];
    });
    if (["a", "b"].includes(input.user)) state.user = input.user;
    if (Object.keys(matrixBuckets).includes(input.bucket)) state.bucket = input.bucket;
    if (matrixActions.includes(input.action)) state.action = input.action;
    if (Array.isArray(input.tested)) state.tested = input.tested.filter(function (item) { return typeof item === "string"; });
    return state;
  }

  function matrixGrantStatements(bucket, mode, label) {
    if (mode === "none") return [];
    const bucketArn = "arn:aws:s3:::" + bucket;
    return [
      { Sid: "Browse" + label, Effect: "Allow", Action: ["s3:ListBucket", "s3:GetBucketLocation"], Resource: bucketArn },
      { Sid: "Objects" + label, Effect: "Allow", Action: mode === "write" ? ["s3:GetObject", "s3:PutObject"] : "s3:GetObject", Resource: bucketArn + "/*" }
    ];
  }

  function matrixUserPolicy(state, user, buckets = matrixBuckets) {
    const statements = [{ Sid: "ConsoleBucketNames", Effect: "Allow", Action: "s3:ListAllMyBuckets", Resource: "*" }];
    Object.keys(matrixBuckets).forEach(function (bucket) {
      statements.push.apply(statements, matrixGrantStatements(buckets[bucket], state.grants[user][bucket], bucket.toUpperCase()));
      if (state.denies[user][bucket]) statements.push({
        Sid: "Block" + bucket.toUpperCase(), Effect: "Deny", Action: "s3:*",
        Resource: ["arn:aws:s3:::" + buckets[bucket], "arn:aws:s3:::" + buckets[bucket] + "/*"]
      });
    });
    return documentWith(statements);
  }

  function matrixGroupPolicy(buckets = matrixBuckets) {
    return documentWith(matrixGrantStatements(buckets.shared, "read", "Shared"));
  }

  function matrixPolicies(state, user, buckets = matrixBuckets) {
    const policies = [{ name: "matrix-user-" + user + " / MatrixUser" + user.toUpperCase(), document: matrixUserPolicy(state, user, buckets) }];
    if (state.members[user]) policies.push({ name: "matrix-shared-readers / MatrixSharedRead", document: matrixGroupPolicy(buckets) });
    return policies;
  }

  function matrixRequest(state, user, bucket, action, buckets = matrixBuckets) {
    const request = { action: action, resource: "arn:aws:s3:::" + buckets[bucket] + (action === "s3:ListBucket" ? "" : "/example.txt") };
    return Object.assign(evaluate(matrixPolicies(state, user, buckets), request), { request: request, user: "matrix-user-" + user });
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [value];
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function validStringSet(value) {
    return asArray(value).length > 0 && asArray(value).every(function (item) { return typeof item === "string" && item.length > 0; });
  }

  function parsePolicy(input) {
    const document = typeof input === "string" ? JSON.parse(input) : input;
    if (!isObject(document)) throw new Error("A policy must be a JSON object.");
    const unknownTop = Object.keys(document).filter(function (key) { return !["Version", "Statement", "Id"].includes(key); });
    if (unknownTop.length) throw new Error("Unsupported policy field: " + unknownTop.join(", "));
    if (document.Version !== "2012-10-17") throw new Error('Use Version "2012-10-17". This is the policy language version.');
    const statements = asArray(document.Statement);
    if (!statements.length || statements.length > 30) throw new Error("Use between 1 and 30 statements in this teaching simulator.");
    const seenSids = new Set();
    statements.forEach(function (statement, index) {
      const label = "Statement " + (index + 1);
      if (!isObject(statement)) throw new Error(label + " must be an object.");
      const unknown = Object.keys(statement).filter(function (key) { return !["Sid", "Effect", "Action", "Resource", "Condition"].includes(key); });
      if (unknown.length) throw new Error(label + ": this identity-policy simulator does not support " + unknown.join(", ") + ".");
      if (statement.Sid !== undefined) {
        if (typeof statement.Sid !== "string" || !/^[A-Za-z0-9]+$/.test(statement.Sid)) throw new Error(label + ": Sid must contain letters and numbers only.");
        if (seenSids.has(statement.Sid)) throw new Error(label + ": Sid must be unique.");
        seenSids.add(statement.Sid);
      }
      if (!["Allow", "Deny"].includes(statement.Effect)) throw new Error(label + ': Effect must be "Allow" or "Deny".');
      if (!validStringSet(statement.Action) || !validStringSet(statement.Resource)) throw new Error(label + ": Action and Resource must be nonempty strings or arrays of strings.");
      if (!asArray(statement.Action).every(function (action) { return action === "*" || /^[a-z0-9-]+:[A-Za-z0-9*?]+$/i.test(action); })) throw new Error(label + ": use service:Action syntax.");
      if (!asArray(statement.Resource).every(function (resource) { return resource === "*" || resource.startsWith("arn:aws:"); })) throw new Error(label + ": use an arn:aws: resource or *.");
      if (asArray(statement.Resource).some(function (resource) { return resource.includes("$" + "{"); })) throw new Error("Policy variables are outside this simulator's supported subset.");
      if (statement.Condition !== undefined) {
        if (!isObject(statement.Condition) || !Object.keys(statement.Condition).length) throw new Error(label + ": Condition must be a nonempty object.");
        Object.entries(statement.Condition).forEach(function (entry) {
          const operator = entry[0];
          const conditions = entry[1];
          if (!["StringLike", "StringEquals"].includes(operator)) throw new Error("Supported conditions: StringLike and StringEquals. Role trust uses a separate guided check.");
          if (!isObject(conditions) || !Object.keys(conditions).length) throw new Error("Condition operators need a nonempty object.");
          Object.entries(conditions).forEach(function (condition) {
            if (!["s3:prefix", "s3:delimiter"].includes(condition[0])) throw new Error("Supported context keys: s3:prefix and s3:delimiter.");
            const values = asArray(condition[1]);
            if (!values.length || !values.every(function (value) { return typeof value === "string"; })) throw new Error("Condition values must be strings or nonempty arrays of strings.");
          });
        });
      }
    });
    return document;
  }

  function wildcard(pattern, value, insensitive = false) {
    const escaped = pattern.replace(/[.+^$()|[\]\\{}]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp("^" + escaped + "$", insensitive ? "i" : "").test(value);
  }

  function conditionMatches(condition, context) {
    if (!condition) return true;
    return Object.entries(condition).every(function (entry) {
      return Object.entries(entry[1]).every(function (item) {
        if (!Object.prototype.hasOwnProperty.call(context, item[0])) return false;
        return asArray(item[1]).some(function (expected) {
          return entry[0] === "StringLike" ? wildcard(expected, String(context[item[0]])) : expected === String(context[item[0]]);
        });
      });
    });
  }

  function evaluate(policies, request) {
    const trace = [];
    policies.forEach(function (policy, policyIndex) {
      const parsed = parsePolicy(policy.document || policy);
      asArray(parsed.Statement).forEach(function (statement, statementIndex) {
        const actionMatches = asArray(statement.Action).some(function (action) { return wildcard(action, request.action, true); });
        const resourceMatches = asArray(statement.Resource).some(function (resource) { return wildcard(resource, request.resource); });
        const conditionsMatch = conditionMatches(statement.Condition, request.context || {});
        trace.push({
          source: policy.name || "Policy " + (policyIndex + 1),
          sid: statement.Sid || "Statement" + (statementIndex + 1),
          effect: statement.Effect,
          matches: actionMatches && resourceMatches && conditionsMatch,
          reason: !actionMatches ? "Action does not match" : !resourceMatches ? "Resource does not match" : !conditionsMatch ? "Condition does not match" : "Action, resource, and conditions match"
        });
      });
    });
    const denies = trace.filter(function (entry) { return entry.matches && entry.effect === "Deny"; });
    const allows = trace.filter(function (entry) { return entry.matches && entry.effect === "Allow"; });
    return { decision: denies.length ? "explicitDeny" : allows.length ? "allowed" : "implicitDeny", trace: trace, allows: allows, denies: denies };
  }

  function userPolicies(state) {
    const policies = [];
    if (state.user && state.group && state.member && state.reader) policies.push({ name: state.group + " / LabReadTraining", document: state.reader });
    if (state.user && state.group && state.member && state.callerPermission && state.role) {
      policies.push({ name: state.group + " / LabAssumeUploader", document: assumePolicy(defaults.account, state.role) });
    }
    return policies;
  }

  function assumeRole(state) {
    const checks = [
      { label: "The IAM user and role exist", pass: Boolean(state.user && state.role) },
      { label: "The user's group allows sts:AssumeRole on this role", pass: Boolean(state.role) && evaluate(userPolicies(state), { action: "sts:AssumeRole", resource: "arn:aws:iam::" + defaults.account + ":role/" + state.role }).decision === "allowed" },
      { label: "The role trust policy matches this user's ARN", pass: Boolean(state.trust && state.user) },
      { label: "The user authenticated with MFA", pass: Boolean(state.mfa) }
    ];
    return { allowed: checks.every(function (check) { return check.pass; }), checks: checks };
  }

  function freshState() {
    return {
      version: 1, step: 0, completed: [], user: "", group: "", member: false, reader: null,
      role: "", trust: false, callerPermission: false, mfa: false, session: "user",
      tested: [], roleTested: [], denyTested: [], answers: {}, graded: false, ec2: freshEc2State(), matrix: freshMatrixState()
    };
  }

  root.IamLab = { defaults: defaults, readerPolicy: readerPolicy, uploadPolicy: uploadPolicy, assumePolicy: assumePolicy, trustPolicy: trustPolicy, deletePolicy: deletePolicy, ec2ReadPolicy: ec2ReadPolicy, ec2TrustPolicy: ec2TrustPolicy, freshEc2State: freshEc2State, ec2Request: ec2Request, parsePolicy: parsePolicy, evaluate: evaluate, userPolicies: userPolicies, assumeRole: assumeRole, freshState: freshState };
  Object.assign(root.IamLab, { matrixBuckets: matrixBuckets, matrixActions: matrixActions, freshMatrixState: freshMatrixState, normalizeMatrixState: normalizeMatrixState, matrixUserPolicy: matrixUserPolicy, matrixGroupPolicy: matrixGroupPolicy, matrixPolicies: matrixPolicies, matrixRequest: matrixRequest });
  if (typeof module !== "undefined" && module.exports) module.exports = root.IamLab;
})(typeof globalThis === "undefined" ? this : globalThis);
