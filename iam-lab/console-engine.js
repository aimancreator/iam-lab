(function (root) {
  "use strict";

  const iam = root.IamLab || (typeof require === "function" ? require("./iam-engine.js") : null);
  const account = "123456789012";
  const region = "ap-southeast-1";
  const storageKey = "iam-console-practice-v1";
  const types = ["users", "groups", "policies", "roles", "buckets", "instances"];
  const actions = ["s3:ListAllMyBuckets", "s3:GetBucketLocation", "s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "sts:AssumeRole"];
  const copy = function (value) { return JSON.parse(JSON.stringify(value)); };
  const array = function (value) { return Array.isArray(value) ? value : [value]; };

  function freshState() {
    return { version: 1, mode: "guided", chapter: "access", users: [], groups: [], policies: [], roles: [], buckets: [], instances: [], session: { kind: "admin", name: "Lab administrator" }, history: [], completed: [] };
  }

  function find(state, type, name) {
    return state[type].find(function (item) { return item.name === name; });
  }

  function required(state, type, name) {
    const item = find(state, type, name);
    if (!item) throw new Error("No simulated " + type.slice(0, -1) + " named “" + name + "”.");
    return item;
  }

  function validName(type, name) {
    if (typeof name !== "string") return false;
    if (type === "buckets") return /^(?!xn--|sthree-|amzn-s3-demo-)[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name) && !/(?:-s3alias|--ol-s3|--x-s3|--table-s3|-an)$/.test(name);
    return /^[A-Za-z0-9_+=,.@-]{1,64}$/.test(name);
  }

  function admin(state) {
    if (state.session.kind !== "admin") throw new Error("Return to Lab administrator to change setup. Learner IAM/EC2 administration is outside this simulator.");
  }

  function policyDocument(input) {
    const document = iam.parsePolicy(input);
    array(document.Statement).forEach(function (statement) {
      array(statement.Action).forEach(function (action) {
        const expression = new RegExp("^" + action.replace(/[.+^$()|[\]\\{}]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
        if (!actions.some(function (supported) { return expression.test(supported); })) throw new Error("This practice console supports S3 object/list operations and sts:AssumeRole, not " + action + ".");
      });
    });
    return copy(document);
  }

  function referenceNames(state, type, names) {
    if (!Array.isArray(names)) throw new Error("Choose items from the list.");
    const unique = Array.from(new Set(names));
    unique.forEach(function (name) { required(state, type, name); });
    return unique;
  }

  function create(state, type, input) {
    admin(state);
    if (!types.includes(type)) throw new Error("Unsupported resource type.");
    const name = String(input.name || "").trim();
    if (!validName(type, name)) throw new Error(type === "buckets" ? "Use 3–63 lowercase letters, numbers, or hyphens, starting and ending with a letter or number. Reserved S3 names are excluded. Dotted names are outside this lab." : "Use 1–64 letters, numbers, or _+=,.@- characters.");
    if (state[type].length >= 40) throw new Error("Practice limit: 40 resources of each type.");
    if (state[type].some(function (item) { return item.name.toLowerCase() === name.toLowerCase(); })) throw new Error("That name already exists in this simulated account.");
    let item = { name: name };
    if (["users", "groups", "roles"].includes(type)) item.policies = referenceNames(state, "policies", input.policies || []);
    if (type === "groups") item.members = referenceNames(state, "users", input.members || []);
    if (type === "policies") item.document = policyDocument(input.document);
    if (type === "roles") {
      if (!["user", "ec2"].includes(input.trust)) throw new Error("Choose an IAM user or the EC2 service as the trusted entity.");
      item.trust = input.trust;
      item.trustedUser = input.trust === "user" ? required(state, "users", input.trustedUser).name : "";
      item.profile = input.trust === "ec2" ? name : "";
    }
    if (type === "buckets") item.objects = [];
    if (type === "instances") {
      item.profile = "";
      if (input.profile) {
        const role = required(state, "roles", input.profile);
        if (!role.profile) throw new Error("Choose a role with an EC2 instance profile.");
        item.profile = role.name;
      }
    }
    state[type].push(item);
    return item;
  }

  function attach(state, type, name, policies) {
    admin(state);
    if (!["users", "groups", "roles"].includes(type)) throw new Error("Policies attach to users, groups, or roles here.");
    required(state, type, name).policies = referenceNames(state, "policies", policies);
  }

  function membership(state, name, members) {
    admin(state);
    required(state, "groups", name).members = referenceNames(state, "users", members);
  }

  function editPolicy(state, name, document) {
    admin(state);
    required(state, "policies", name).document = policyDocument(document);
  }

  function associate(state, name, roleName) {
    admin(state);
    const instance = required(state, "instances", name);
    if (roleName && !required(state, "roles", roleName).profile) throw new Error("This role has no EC2 instance profile.");
    instance.profile = roleName || "";
  }

  function editTrust(state, name, trustedUser, trust = "user") {
    admin(state);
    const role = required(state, "roles", name);
    if (!["user", "ec2"].includes(trust)) throw new Error("Choose an IAM user or the EC2 service as the trusted entity.");
    const userName = trust === "user" && trustedUser ? required(state, "users", trustedUser).name : "";
    role.trust = trust;
    role.trustedUser = userName;
    if (trust === "ec2" && !role.profile) role.profile = role.name;
  }

  function remove(state, type, name, confirmation) {
    admin(state);
    if (!types.includes(type)) throw new Error("Unsupported resource type.");
    const item = required(state, type, name);
    if (confirmation !== name) throw new Error("Type the exact resource name to confirm deletion.");
    if (type === "buckets" && item.objects.length) throw new Error("BucketNotEmpty: delete the objects before deleting this bucket.");
    if (type === "groups" && item.members.length) throw new Error("Remove all users from this group first.");
    if (type === "policies" && ["users", "groups", "roles"].some(function (target) { return state[target].some(function (resource) { return resource.policies.includes(name); }); })) throw new Error("Detach this policy from every identity before deleting it.");
    if (type === "roles" && state.instances.some(function (instance) { return instance.profile === name; })) throw new Error("Remove this instance profile from all simulated instances first.");
    if (type === "users") {
      state.groups.forEach(function (group) { group.members = group.members.filter(function (member) { return member !== name; }); });
      state.roles.forEach(function (role) { if (role.trustedUser === name) role.trustedUser = ""; });
    }
    state[type] = state[type].filter(function (resource) { return resource.name !== name; });
  }

  function buildPolicy(kind, bucket, prefix = "", browse = true, roleName = "") {
    if (kind === "assume") {
      if (!validName("roles", roleName)) throw new Error("Choose a role to assume.");
      return iam.assumePolicy(account, roleName);
    }
    if (!validName("buckets", bucket)) throw new Error("Choose or enter a valid practice bucket name.");
    if (/[\x00-\x1f*?$]/.test(prefix) || prefix.length > 128) throw new Error("Use a plain object prefix without wildcards, variables, or control characters.");
    if (!["read", "write", "deny"].includes(kind)) throw new Error("Choose a supported policy template.");
    const bucketArn = "arn:aws:s3:::" + bucket;
    if (kind === "deny") return { Version: "2012-10-17", Statement: [{ Sid: "BlockBucket", Effect: "Deny", Action: "s3:*", Resource: [bucketArn, bucketArn + "/*"] }] };
    const statements = [];
    if (browse) statements.push({ Sid: "SeeBucketNames", Effect: "Allow", Action: "s3:ListAllMyBuckets", Resource: "*" });
    statements.push({ Sid: "BucketLocation", Effect: "Allow", Action: "s3:GetBucketLocation", Resource: bucketArn });
    const listing = { Sid: "ListObjects", Effect: "Allow", Action: "s3:ListBucket", Resource: bucketArn };
    if (prefix) listing.Condition = { StringLike: { "s3:prefix": prefix + "*" } };
    statements.push(listing, { Sid: "ObjectAccess", Effect: "Allow", Action: kind === "write" ? ["s3:GetObject", "s3:PutObject"] : "s3:GetObject", Resource: bucketArn + "/" + prefix + "*" });
    return { Version: "2012-10-17", Statement: statements };
  }

  function policiesFor(state, principal) {
    let sources = [];
    if (principal.kind === "user") {
      const user = required(state, "users", principal.name);
      sources.push({ label: "User " + user.name, policies: user.policies });
      state.groups.filter(function (group) { return group.members.includes(user.name); }).forEach(function (group) { sources.push({ label: "Group " + group.name, policies: group.policies }); });
    } else if (principal.kind === "role") {
      const role = required(state, "roles", principal.name);
      sources.push({ label: "Role " + role.name, policies: role.policies });
    }
    return sources.flatMap(function (source) {
      return source.policies.map(function (name) { return { name: source.label + " / " + name, document: required(state, "policies", name).document }; });
    });
  }

  function authorize(state, principal, request) {
    if (principal.kind === "admin") return { decision: "allowed", trace: [{ source: "Lab administrator (setup shortcut)", sid: "InstructorAccess", effect: "Allow", matches: true, reason: "Simulated setup privilege, not an AWS root sign-in or an evaluated IAM grant." }] };
    if (principal.kind === "role" && principal.expiresAt && principal.expiresAt <= Date.now()) return { decision: "expired", trace: [], reason: "This simulated role session expired. Return to the user and assume the role again." };
    if (!["user", "role"].includes(principal.kind)) return { decision: "noCredentials", trace: [], reason: "No usable simulated credentials." };
    return iam.evaluate(policiesFor(state, principal), request);
  }

  function requestFor(action, bucket, key, prefix) {
    if (!actions.includes(action) || action === "sts:AssumeRole") throw new Error("Choose a supported S3 operation.");
    if (action === "s3:ListAllMyBuckets") return { action: action, resource: "*", context: {} };
    if (!validName("buckets", bucket)) throw new Error("Enter a valid practice bucket name.");
    const objectAction = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"].includes(action);
    if (objectAction && (typeof key !== "string" || !key || key.length > 256 || /[\x00-\x1f]/.test(key))) throw new Error("Enter an object key of 1–256 characters without control characters.");
    return { action: action, resource: "arn:aws:s3:::" + bucket + (objectAction ? "/" + key : ""), context: { "s3:prefix": prefix || "", "s3:delimiter": "" } };
  }

  function record(state, entry) {
    state.history.unshift(Object.assign({ time: new Date().toISOString() }, entry));
    state.history = state.history.slice(0, 100);
  }

  function s3(state, input, principal = state.session) {
    const request = requestFor(input.action, input.bucket, input.key, input.prefix);
    const result = Object.assign(authorize(state, principal, request), { request: request, principal: copy(principal), success: false });
    if (result.decision === "allowed") {
      const bucket = find(state, "buckets", input.bucket);
      if (input.action === "s3:ListAllMyBuckets") {
        result.success = true;
        result.names = state.buckets.map(function (item) { return item.name; });
      } else if (!bucket) result.error = "NoSuchBucket";
      else {
        const object = bucket.objects.find(function (item) { return item.key === input.key; });
        if (input.action === "s3:ListBucket") result.objects = bucket.objects.filter(function (item) { return item.key.startsWith(input.prefix || ""); }).map(function (item) { return { key: item.key, size: item.body.length }; });
        if (input.action === "s3:GetObject") {
          if (object) result.body = object.body;
          else result.error = "NoSuchKey";
        }
        if (input.action === "s3:PutObject") {
          if (typeof input.body !== "string" || input.body.length > 4096) throw new Error("Use at most 4,096 characters of fictional practice text.");
          if (!object && bucket.objects.length >= 60) throw new Error("Practice limit: 60 objects per bucket.");
          if (object) object.body = input.body;
          else bucket.objects.push({ key: input.key, body: input.body });
        }
        if (input.action === "s3:DeleteObject") bucket.objects = bucket.objects.filter(function (item) { return item.key !== input.key; });
        result.success = !result.error;
      }
    }
    record(state, { actor: principal.kind + ":" + principal.name, action: input.action, bucket: input.bucket || "", key: input.key || "", decision: result.decision, success: result.success, error: result.error || "" });
    return result;
  }

  function signIn(state, name) {
    state.session = name ? { kind: "user", name: required(state, "users", name).name } : { kind: "admin", name: "Lab administrator" };
  }

  function trustDocument(role) {
    return role.trust === "ec2" ? iam.ec2TrustPolicy() : iam.trustPolicy(account, role.trustedUser || "REMOVED-USER");
  }

  function assume(state, name, mfa) {
    if (state.session.kind !== "user") throw new Error("First use Practice as identity to select an IAM user. Role chaining is not modelled.");
    const role = required(state, "roles", name);
    const request = { action: "sts:AssumeRole", resource: "arn:aws:iam::" + account + ":role/" + name };
    const permission = authorize(state, state.session, request);
    const checks = [
      { id: "caller", label: "Caller permission: " + state.session.name + " may call sts:AssumeRole on " + name, pass: permission.decision === "allowed", route: "users/" + encodeURIComponent(state.session.name), hint: permission.decision === "explicitDeny" ? "A policy explicitly denies this role assumption. Review the matching Deny in the trace; adding an Allow will not override it." : "As Lab administrator: Policies → Create policy → name it (for example AssumeBucketReader). Expand Start from a template → choose Assume role → select " + name + " → Apply template (replaces draft) → Review and create. Then Users → " + state.session.name + " → Permissions → attach it and Save permissions. The template replaces the default S3 grants with only sts:AssumeRole. Attach it to the user, not to the role." },
      { id: "trust", label: "Role trust: " + name + " trusts " + state.session.name, pass: role.trust === "user" && role.trustedUser === state.session.name, route: "roles/" + encodeURIComponent(name), hint: "As Lab administrator: Roles → " + name + " → Trust relationships → Trusted entity: IAM user (with MFA) → Trusted IAM user: " + state.session.name + " → Save trust. Currently trusts " + (role.trust === "ec2" ? "the EC2 service" : role.trustedUser || "no user") + "." },
      { id: "mfa", label: "Simulated MFA is present", pass: mfa === true, route: "switch-role", hint: "When switching roles manually, check Simulated MFA is present. The objective's with-MFA test supplies it automatically; the without-MFA test deliberately leaves it off." }
    ];
    const result = { decision: checks.every(function (check) { return check.pass; }) ? "allowed" : "implicitDeny", trace: permission.trace, checks: checks, request: request, principal: copy(state.session), success: checks.every(function (check) { return check.pass; }) };
    if (permission.decision === "explicitDeny") result.decision = "explicitDeny";
    record(state, { actor: "user:" + state.session.name, action: "sts:AssumeRole", bucket: "", key: name, decision: result.decision, success: result.success, error: "" });
    if (result.success) state.session = { kind: "role", name: name, sourceUser: state.session.name, expiresAt: Date.now() + 15 * 60 * 1000 };
    return result;
  }

  function ec2Request(state, name, input) {
    admin(state);
    const instance = required(state, "instances", name);
    const role = instance.profile && find(state, "roles", instance.profile);
    if (!role || role.trust !== "ec2" || !role.profile) {
      const result = { decision: "noCredentials", trace: [], reason: "No EC2-trusted role in an associated instance profile. Set the IAM role on the instance first.", principal: { kind: "instance", name: name }, request: requestFor(input.action, input.bucket, input.key, input.prefix), success: false };
      record(state, { actor: "instance:" + name, action: input.action, bucket: input.bucket, key: input.key, decision: result.decision, success: false, error: "" });
      return result;
    }
    const result = s3(state, input, { kind: "role", name: role.name });
    result.instance = name;
    state.history[0].actor = "instance:" + name;
    return result;
  }

  function normalize(input) {
    if (!input || input.version !== 1) throw new Error("Saved practice data uses an unsupported format.");
    const state = freshState();
    ["policies", "users", "groups", "buckets", "roles", "instances"].forEach(function (type) {
      if (!Array.isArray(input[type]) || input[type].length > 40) throw new Error("Saved resource list is invalid.");
      input[type].forEach(function (item) {
        if (!item || !validName(type, item.name)) throw new Error("Saved resource name is invalid.");
        let source = item;
        if (type === "roles" && item.trust === "user" && !item.trustedUser) source = Object.assign({}, item, { trust: "ec2" });
        const restored = create(state, type, source);
        if (type === "roles" && source !== item) Object.assign(restored, { trust: "user", trustedUser: "" });
        if (type === "roles" && item.trust === "user") restored.profile = item.profile === item.name ? item.name : "";
        if (type === "buckets") {
          if (!Array.isArray(item.objects) || item.objects.length > 60) throw new Error("Saved object list is invalid.");
          item.objects.forEach(function (object) {
            requestFor("s3:GetObject", item.name, object.key);
            if (typeof object.body !== "string" || object.body.length > 4096 || restored.objects.some(function (existing) { return existing.key === object.key; })) throw new Error("Saved object is invalid.");
            restored.objects.push({ key: object.key, body: object.body });
          });
        }
      });
    });
    state.mode = input.mode === "free" ? "free" : "guided";
    state.chapter = input.chapter === "roles" ? "roles" : "access";
    const milestones = lessons.flatMap(function (lesson) { return lesson.steps.map(function (step) { return step.id; }); });
    state.completed = Array.isArray(input.completed) ? Array.from(new Set(input.completed.filter(function (id) { return milestones.includes(id); }))) : [];
    state.history = Array.isArray(input.history) ? input.history.slice(0, 100).filter(function (entry) { return entry && typeof entry.actor === "string" && entry.actor.length < 150 && actions.includes(entry.action) && typeof entry.time === "string" && typeof entry.bucket === "string" && typeof entry.key === "string" && ["allowed", "implicitDeny", "explicitDeny", "expired", "noCredentials"].includes(entry.decision); }).map(function (entry) { return { actor: entry.actor, action: entry.action, time: entry.time, bucket: entry.bucket.slice(0, 63), key: entry.key.slice(0, 256), decision: entry.decision, success: entry.success === true, error: typeof entry.error === "string" ? entry.error.slice(0, 40) : "" }; }) : [];
    return state;
  }

  function has(state, type, names) { return names.every(function (name) { return Boolean(find(state, type, name)); }); }
  function attached(state, type, name, policy) { const item = find(state, type, name); return Boolean(item && item.policies.includes(policy)); }
  function seen(state, actor, bucket, decision, action = "s3:GetObject", key = "example.txt") { return state.history.some(function (entry) { return entry.actor === actor && entry.bucket === bucket && entry.key === key && entry.action === action && entry.decision === decision && (decision !== "allowed" || entry.success); }); }
  function groupHas(state, group, user) { const item = find(state, "groups", group); return Boolean(item && item.members.includes(user)); }
  function readPolicyMatches(state, name, bucket, other) {
    const policy = find(state, "policies", name);
    if (!policy) return false;
    const evaluate = function (action, target) { return iam.evaluate([policy], requestFor(action, target, "example.txt", "")).decision; };
    return evaluate("s3:GetObject", bucket) === "allowed" && evaluate("s3:ListBucket", bucket) === "allowed" && evaluate("s3:GetObject", other) === "implicitDeny" && evaluate("s3:PutObject", bucket) === "implicitDeny";
  }

  const lessons = [
    { id: "access", title: "Users × buckets", steps: [
      { id: "buckets", title: "Create two private buckets", route: "s3", hint: "S3 → Create bucket. Create console-bucket-a, then console-bucket-b. Keep Block Public Access enabled.", picture: "matrix", check: function (state) { return has(state, "buckets", ["console-bucket-a", "console-bucket-b"]); } },
      { id: "objects", title: "Upload a practice object to each", route: "s3", hint: "As Lab administrator, open each bucket → Upload. Use the key example.txt and any fictional text. Creating a bucket alone does not create an object.", picture: "request", check: function (state) { return ["console-bucket-a", "console-bucket-b"].every(function (name) { const bucket = find(state, "buckets", name); return bucket && bucket.objects.some(function (object) { return object.key === "example.txt"; }); }); } },
      { id: "users", title: "Create user-a and user-b", route: "users", hint: "IAM → Users → Create user. Create user-a and user-b with no attached permissions. No real passwords or access keys are used.", picture: "user", check: function (state) { return has(state, "users", ["user-a", "user-b"]); } },
      { id: "groups", title: "Give each user a team", route: "groups", hint: "IAM → User groups → Create group. Create team-a with user-a and team-b with user-b. These job-assignment groups illustrate RBAC; they are not assumable IAM roles.", picture: "group", check: function (state) { return groupHas(state, "team-a", "user-a") && groupHas(state, "team-b", "user-b"); } },
      { id: "policies", title: "Author two least-privilege policies", route: "policies", hint: "Create ReadBucketA using Read objects for console-bucket-a, then ReadBucketB for console-bucket-b. Leave prefix empty and bucket-name browsing enabled. Review the generated JSON.", picture: "policy", check: function (state) { return readPolicyMatches(state, "ReadBucketA", "console-bucket-a", "console-bucket-b") && readPolicyMatches(state, "ReadBucketB", "console-bucket-b", "console-bucket-a"); } },
      { id: "attach", title: "Attach the policies to the groups", route: "groups", hint: "Open team-a → Permissions → select ReadBucketA → Save permissions. Repeat with team-b and ReadBucketB. Creating a policy does nothing until you attach it.", picture: "rbac", check: function (state) { return attached(state, "groups", "team-a", "ReadBucketA") && attached(state, "groups", "team-b", "ReadBucketB"); } },
      { id: "test-a", title: "Test user A against both buckets", route: "s3", hint: "Practice as identity → user-a. Open console-bucket-a and open example.txt (allowed). Open console-bucket-b and use Direct object request → GetObject for example.txt (implicit deny). Read the decision trace.", picture: "request", check: function (state) { return seen(state, "user:user-a", "console-bucket-a", "allowed") && seen(state, "user:user-a", "console-bucket-b", "implicitDeny"); } },
      { id: "test-b", title: "Test user B against both buckets", route: "s3", hint: "Practice as identity → user-b. Read example.txt in bucket B (allowed), then directly request it in bucket A (implicit deny). A bucket name is not a permission.", picture: "matrix", check: function (state) { return seen(state, "user:user-b", "console-bucket-b", "allowed") && seen(state, "user:user-b", "console-bucket-a", "implicitDeny"); } },
      { id: "transfer", title: "Transfer user A to team B", route: "groups", hint: "Return to Lab administrator. Remove user-a from team-a, add user-a to team-b, and save both membership lists. Then practise as user-a again: bucket B should now work; bucket A should be denied.", picture: "transfer", check: function (state) { return !groupHas(state, "team-a", "user-a") && groupHas(state, "team-b", "user-a") && seen(state, "user:user-a", "console-bucket-b", "allowed") && seen(state, "user:user-a", "console-bucket-a", "implicitDeny"); } },
      { id: "deny", title: "Make an explicit Deny win", route: "policies", hint: "As administrator, create BlockBucketB with the Explicit deny template for console-bucket-b. Attach it directly to user-a, keeping team-b's Allow. Practise as user-a and directly request example.txt in bucket B: explicit deny wins.", picture: "deny", check: function (state) { return attached(state, "users", "user-a", "BlockBucketB") && seen(state, "user:user-a", "console-bucket-b", "explicitDeny"); } }
    ] },
    { id: "roles", title: "Assume roles & EC2", steps: [
      { id: "role-ready", title: "Prepare a bucket and learner", route: "home", hint: "Reuse the Users × buckets setup, or create console-bucket-a with example.txt, user-b, and ReadBucketA (Read objects for bucket A). Return to Lab administrator.", picture: "assume", check: function (state) { const bucket = find(state, "buckets", "console-bucket-a"); return has(state, "users", ["user-b"]) && has(state, "policies", ["ReadBucketA"]) && bucket && bucket.objects.some(function (object) { return object.key === "example.txt"; }); } },
      { id: "user-role", title: "Create a role trusted by user B", route: "roles", hint: "IAM → Roles → Create role. Choose IAM user → user-b. Attach ReadBucketA and name it bucket-reader. This role uses account delegation restricted to user-b plus MFA.", picture: "assume", check: function (state) { const role = find(state, "roles", "bucket-reader"); return role && role.trust === "user" && role.trustedUser === "user-b" && role.policies.includes("ReadBucketA"); } },
      { id: "caller", title: "Grant permission to assume it", route: "policies", hint: "Create AssumeBucketReader with the Assume role template, choosing bucket-reader. Attach it to user-b. With this lab's account-delegation trust pattern, both caller permission and role trust are required.", picture: "sts", check: function (state) { const user = find(state, "users", "user-b"); return user && authorize(state, { kind: "user", name: "user-b" }, { action: "sts:AssumeRole", resource: "arn:aws:iam::" + account + ":role/bucket-reader" }).decision === "allowed"; } },
      { id: "assumed", title: "Switch role, then read as the role", route: "switch-role", hint: "Practice as identity → user-b. Open Switch role, choose bucket-reader, check simulated MFA, then switch. Read example.txt in console-bucket-a. Your role permissions replace—not add to—user permissions during this session.", picture: "assume", check: function (state) { return seen(state, "user:user-b", "", "allowed", "sts:AssumeRole", "bucket-reader") && seen(state, "role:bucket-reader", "console-bucket-a", "allowed"); } },
      { id: "instance", title: "Start an instance without a role", route: "instances", hint: "Return to Lab administrator → EC2 → Launch simulated instance. Name it demo-web and leave the IAM role empty. Open it and request example.txt in console-bucket-a: no credentials.", picture: "ec2", check: function (state) { return seen(state, "instance:demo-web", "console-bucket-a", "noCredentials"); } },
      { id: "ec2-role", title: "Add an EC2 role, but no S3 policy yet", route: "roles", hint: "Create ec2-reader trusted by the EC2 service, with no permissions. An instance profile is created with it. Open demo-web → Modify IAM role → ec2-reader → Save. Request the object again: credentials now exist, but access is implicitly denied.", picture: "ec2", check: function (state) { const role = find(state, "roles", "ec2-reader"); const instance = find(state, "instances", "demo-web"); return role && role.trust === "ec2" && instance && instance.profile === "ec2-reader" && seen(state, "instance:demo-web", "console-bucket-a", "implicitDeny"); } },
      { id: "ec2-read", title: "Grant only the application's S3 read access", route: "roles", hint: "Attach ReadBucketA to ec2-reader. Return to demo-web and read example.txt from bucket A: allowed. Try PutObject with upload.txt: implicit deny. The role trusts EC2 and grants access to S3; it does not need to trust S3.", picture: "ec2", check: function (state) { return attached(state, "roles", "ec2-reader", "ReadBucketA") && seen(state, "instance:demo-web", "console-bucket-a", "allowed") && seen(state, "instance:demo-web", "console-bucket-a", "implicitDeny", "s3:PutObject", "upload.txt"); } }
    ] }
  ];

  function advance(state) {
    const added = [];
    lessons.forEach(function (lesson) {
      for (const step of lesson.steps) {
        if (state.completed.includes(step.id)) continue;
        if (!step.check(state)) break;
        state.completed.push(step.id);
        added.push(step.title);
      }
    });
    return added;
  }

  const api = { account: account, region: region, storageKey: storageKey, types: types, actions: actions, lessons: lessons, freshState: freshState, normalize: normalize, find: find, create: create, attach: attach, membership: membership, editPolicy: editPolicy, associate: associate, editTrust: editTrust, remove: remove, buildPolicy: buildPolicy, policyDocument: policyDocument, policiesFor: policiesFor, authorize: authorize, requestFor: requestFor, s3: s3, signIn: signIn, trustDocument: trustDocument, assume: assume, ec2Request: ec2Request, advance: advance };
  root.IamConsole = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
