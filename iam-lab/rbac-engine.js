(function (root) {
  "use strict";

  const engine = root.IamLab || require("./iam-engine.js");
  const users = ["alice", "bob"];
  const roles = ["reader", "developer", "auditor"];
  const buckets = { dev: "rbac-demo-development", reports: "rbac-demo-reports" };
  const names = { reader: "Reader", developer: "Developer", auditor: "Auditor" };
  const groups = { reader: "rbac-readers", developer: "rbac-developers", auditor: "rbac-auditors" };
  const policyNames = { reader: "RbacReadDevelopment", developer: "RbacDevelop", auditor: "RbacReadReports" };
  const actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"];
  const experiments = [
    { id: "reader", title: "1 · Least privilege", hint: "As Alice, predict a development read and upload. Reader grants reads, not uploads.", checks: ["reader-read", "reader-upload"] },
    { id: "combined", title: "2 · Combine job roles", hint: "Add Alice to Developer while keeping Reader. Predict her development upload. Does read-only mean an explicit Deny?", checks: ["combined"] },
    { id: "shared", title: "3 · Change one policy", hint: "Both users are Developers. Turn off Developer uploads, then predict a development upload as Alice and as Bob. One policy edit affects both members.", checks: ["shared-alice", "shared-bob"] },
    { id: "transfer", title: "4 · Change jobs", hint: "Move Alice from Reader/Developer to Auditor only. Predict reads from development and reports. Remove old access rather than just adding the new job.", checks: ["transfer-dev", "transfer-reports"] },
    { id: "offboard", title: "5 · Remove access", hint: "Remove all three of Alice’s job assignments. Predict reads from both buckets. This withdraws this lab’s S3 grants, not her identity or every possible AWS permission.", checks: ["offboard-dev", "offboard-reports"] },
    { id: "deny", title: "6 · Deny wins", hint: "Keep Developer uploads enabled, then enable the upload freeze. Predict Alice’s development upload: an applicable explicit Deny overrides the Allow.", checks: ["deny"] }
  ];
  const questions = [
    { title: "Alice belongs to Reader and Developer. Developer allows uploads; no Deny applies. Can she upload?", options: ["No, Reader overrides Developer.", "Yes, applicable group Allows combine.", "Only if Developer was assigned most recently."], answer: "1", explanation: "A read-only policy omits an upload Allow; it is not an explicit Deny. Another group can supply the Allow." },
    { title: "You rename a group from Readers to Administrators but change no policies. What happens?", options: ["Its permissions stay the same.", "Its members become administrators.", "Its members receive temporary role credentials."], answer: "0", explanation: "Names describe responsibilities. Policy rules grant or deny access; a powerful-sounding name grants nothing." },
    { title: "How does an RBAC job role differ from an AWS IAM role?", options: ["They are always the same AWS object.", "A group assumes its job role automatically.", "A job role is a responsibility; an IAM role is an assumable identity."], answer: "2", explanation: "Here job roles are implemented using IAM groups plus policies. IAM roles are separate identities used through temporary sessions; groups cannot assume them." }
  ];

  function freshState() {
    return {
      version: 1, live: false, scenario: "reader", user: "alice", bucket: "dev", action: "s3:GetObject", prediction: "",
      members: { alice: { reader: true, developer: false, auditor: false }, bob: { reader: false, developer: true, auditor: false } },
      developerWrite: true, freeze: false, tested: [], answers: {}, graded: false
    };
  }

  function normalize(input) {
    const state = freshState();
    if (!input || input.version !== 1) return state;
    ["live", "developerWrite", "freeze", "graded"].forEach(function (field) { if (typeof input[field] === "boolean") state[field] = input[field]; });
    users.forEach(function (user) {
      roles.forEach(function (role) {
        const value = input.members && input.members[user] && input.members[user][role];
        if (typeof value === "boolean") state.members[user][role] = value;
      });
    });
    if (users.includes(input.user)) state.user = input.user;
    if (Object.keys(buckets).includes(input.bucket)) state.bucket = input.bucket;
    if (actions.includes(input.action)) state.action = input.action;
    if (["", "allowed", "implicitDeny", "explicitDeny"].includes(input.prediction)) state.prediction = input.prediction;
    if (experiments.some(function (experiment) { return experiment.id === input.scenario; })) state.scenario = input.scenario;
    const knownChecks = experiments.flatMap(function (experiment) { return experiment.checks; });
    if (Array.isArray(input.tested)) state.tested = Array.from(new Set(input.tested.filter(function (test) { return knownChecks.includes(test); })));
    questions.forEach(function (question, index) {
      if (input.answers && ["0", "1", "2"].includes(input.answers[index])) state.answers[index] = input.answers[index];
    });
    return state;
  }

  function groupPolicy(state, role, resources = buckets) {
    if (!roles.includes(role)) throw new Error("Unknown RBAC job role.");
    const bucket = role === "auditor" ? resources.reports : resources.dev;
    const statements = [{
      Sid: "Read" + (role === "auditor" ? "Reports" : "Development"), Effect: "Allow",
      Action: "s3:GetObject", Resource: "arn:aws:s3:::" + bucket + "/*"
    }];
    if (role === "developer" && state.developerWrite) statements.push({ Sid: "UploadDevelopment", Effect: "Allow", Action: "s3:PutObject", Resource: "arn:aws:s3:::" + bucket + "/*" });
    if (role === "developer" && state.freeze) statements.push({ Sid: "FreezeDevelopmentUploads", Effect: "Deny", Action: "s3:PutObject", Resource: "arn:aws:s3:::" + bucket + "/*" });
    return { Version: "2012-10-17", Statement: statements };
  }

  function policies(state, user, resources = buckets) {
    if (!users.includes(user)) throw new Error("Unknown RBAC learner.");
    return roles.filter(function (role) { return state.members[user][role]; }).map(function (role) {
      return { name: groups[role] + " / " + policyNames[role], document: groupPolicy(state, role, resources) };
    });
  }

  function request(state, user = state.user, bucket = state.bucket, action = state.action, resources = buckets) {
    if (!Object.keys(buckets).includes(bucket) || !actions.includes(action)) throw new Error("Unsupported RBAC request.");
    const operation = { action: action, resource: "arn:aws:s3:::" + resources[bucket] + "/example.txt" };
    return Object.assign(engine.evaluate(policies(state, user, resources), operation), { request: operation, user: "rbac-" + user });
  }

  function assignmentKey(state) {
    return JSON.stringify({ members: state.members, developerWrite: state.developerWrite, freeze: state.freeze });
  }

  function scenario(state, id) {
    if (!experiments.some(function (experiment) { return experiment.id === id; })) return state;
    const next = freshState();
    next.live = state.live;
    next.scenario = id;
    next.tested = state.tested.slice();
    next.answers = Object.assign({}, state.answers);
    next.graded = state.graded;
    if (["shared", "transfer", "offboard", "deny"].includes(id)) next.members.alice.developer = true;
    if (id === "offboard") next.members.alice.auditor = true;
    if (["combined", "shared", "deny"].includes(id)) next.action = "s3:PutObject";
    return next;
  }

  function record(state, result) {
    if (state.prediction !== result.decision) return;
    const alice = state.members.alice;
    let check = "";
    if (state.scenario === "reader" && state.user === "alice" && alice.reader && !alice.developer && !alice.auditor && state.bucket === "dev") {
      if (state.action === "s3:GetObject" && result.decision === "allowed") check = "reader-read";
      if (state.action === "s3:PutObject" && result.decision === "implicitDeny") check = "reader-upload";
    }
    if (state.scenario === "combined" && state.user === "alice" && alice.reader && alice.developer && state.bucket === "dev" && state.action === "s3:PutObject" && result.decision === "allowed") check = "combined";
    if (state.scenario === "shared" && alice.developer && state.members.bob.developer && !state.developerWrite && !state.freeze && state.bucket === "dev" && state.action === "s3:PutObject" && result.decision === "implicitDeny") check = "shared-" + state.user;
    if (state.scenario === "transfer" && state.user === "alice" && !alice.reader && !alice.developer && alice.auditor && state.action === "s3:GetObject" && result.decision === (state.bucket === "dev" ? "implicitDeny" : "allowed")) check = "transfer-" + state.bucket;
    if (state.scenario === "offboard" && state.user === "alice" && roles.every(function (role) { return !alice[role]; }) && state.action === "s3:GetObject" && result.decision === "implicitDeny") check = "offboard-" + state.bucket;
    if (state.scenario === "deny" && state.user === "alice" && alice.developer && state.developerWrite && state.freeze && state.bucket === "dev" && state.action === "s3:PutObject" && result.decision === "explicitDeny") check = "deny";
    if (check && !state.tested.includes(check)) state.tested.push(check);
  }

  function completed(state) {
    const result = experiments.filter(function (experiment) { return experiment.checks.every(function (check) { return state.tested.includes(check); }); }).map(function (experiment) { return experiment.id; });
    if (state.graded && questions.every(function (question, index) { return state.answers[index] === question.answer; })) result.push("quiz");
    return result;
  }

  function validConfig(config) {
    function validBucket(bucket) {
      return typeof bucket === "string" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) && !/^(xn--|sthree-|amzn-s3-demo-)/.test(bucket) && !/(-s3alias|--ol-s3|--x-s3|--table-s3|-an)$/.test(bucket);
    }
    return Boolean(config && typeof config.account === "string" && /^\d{12}$/.test(config.account) && validBucket(config.dev) && validBucket(config.reports) && config.dev !== config.reports);
  }

  function normalizeConfig(input) {
    const config = { account: "", dev: "", reports: "", done: [], assignment: "" };
    if (!validConfig(input)) return config;
    ["account", "dev", "reports"].forEach(function (field) { config[field] = input[field]; });
    if (Array.isArray(input.done)) config.done = Array.from(new Set(input.done.filter(function (index) { return Number.isInteger(index) && index >= 0 && index < 5; })));
    if (typeof input.assignment === "string") config.assignment = input.assignment;
    return config;
  }

  root.IamRbacEngine = { users: users, roles: roles, buckets: buckets, names: names, groups: groups, policyNames: policyNames, actions: actions, experiments: experiments, questions: questions, freshState: freshState, normalize: normalize, groupPolicy: groupPolicy, policies: policies, request: request, assignmentKey: assignmentKey, scenario: scenario, record: record, completed: completed, validConfig: validConfig, normalizeConfig: normalizeConfig };
  if (typeof module !== "undefined" && module.exports) module.exports = root.IamRbacEngine;
})(typeof globalThis === "undefined" ? this : globalThis);
