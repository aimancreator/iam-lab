(function (root) {
  "use strict";

  const engine = root.IamConsole || (typeof require === "function" ? require("./console-engine.js") : null);
  const bucketA = "console-bucket-a";
  const bucketB = "console-bucket-b";
  const key = "example.txt";
  const decisionLabels = { allowed: "Allowed", implicitDeny: "Implicit deny", explicitDeny: "Explicit deny", noCredentials: "No credentials", expired: "Expired" };

  function member(state, groupName, userName) {
    const group = engine.find(state, "groups", groupName);
    return Boolean(group && group.members.includes(userName));
  }

  function assignment(groupName, userName, expected) {
    return {
      title: userName + (expected ? " belongs to " : " does not belong to ") + groupName,
      expected: expected ? "Member" : "Not a member",
      route: "groups",
      hint: "As Lab administrator, open " + groupName + " and save its membership list.",
      run: function (state) {
        const actual = member(state, groupName, userName);
        return { pass: actual === expected, actual: actual ? "Member" : "Not a member" };
      }
    };
  }

  function access(kind, name, bucket, action, expected) {
    return {
      title: name + " → " + bucket + " → " + action.replace("s3:", ""),
      expected: expected === "denied" ? "Denied (implicit or explicit)" : decisionLabels[expected],
      route: kind === "user" ? "groups" : "roles",
      hint: expected === "allowed" ? "Grant this action on the matching resource through the user's groups/direct policies or the role's policies." : "Review all attached policies. A read policy does not cancel another policy's write Allow; remove the extra grant or use an appropriate Deny.",
      run: function (state) {
        const request = engine.requestFor(action, bucket, key, "");
        const result = engine.authorize(state, { kind: kind, name: name }, request);
        return { pass: expected === "denied" ? ["implicitDeny", "explicitDeny"].includes(result.decision) : result.decision === expected, actual: decisionLabels[result.decision], trace: result.trace, request: request };
      }
    };
  }

  function roleAssumption(mfa, expected) {
    return {
      title: "user-b assumes bucket-reader " + (mfa ? "with MFA" : "without MFA"),
      expected: expected ? "Role session obtained" : "Assumption denied",
      route: "roles",
      hint: "Trust user-b in bucket-reader, grant user-b sts:AssumeRole on that role, and keep the lab's MFA requirement.",
      run: function (state) {
        const sandbox = JSON.parse(JSON.stringify(state));
        engine.signIn(sandbox, "user-b");
        const result = engine.assume(sandbox, "bucket-reader", mfa);
        const failed = result.checks.filter(function (check) { return !check.pass; });
        const repair = failed.find(function (check) { return check.id === "trust"; }) || failed[0];
        return { pass: result.success === expected, actual: result.success ? "Role session obtained" : "Assumption denied — " + failed.map(function (check) { return { caller: "caller permission missing or denied", trust: "role does not trust user-b", mfa: "MFA absent" }[check.id]; }).join("; "), trace: result.trace, checks: result.checks, hint: repair && repair.hint, route: repair && repair.route };
      }
    };
  }

  function groupRead(groupName, userName, bucket) {
    return {
      title: groupName + " itself grants reads from " + bucket,
      expected: "Read allowed through this group", route: "groups",
      hint: "Attach the read policy to " + groupName + ". A direct user grant does not fulfil the group-permission requirement.",
      run: function (state) {
        const sandbox = JSON.parse(JSON.stringify(state));
        engine.find(sandbox, "users", userName).policies = [];
        sandbox.groups.forEach(function (group) {
          if (group.name !== groupName) group.members = group.members.filter(function (name) { return name !== userName; });
        });
        const result = engine.authorize(sandbox, { kind: "user", name: userName }, engine.requestFor("s3:GetObject", bucket, key));
        const pass = result.decision === "allowed";
        return { pass: pass, actual: pass ? "Read allowed through this group" : "Group alone does not grant this read", trace: result.trace };
      }
    };
  }

  function readOnlyChecks(kind, name, ownBucket, otherBucket) {
    return [access(kind, name, ownBucket, "s3:GetObject", "allowed"), access(kind, name, ownBucket, "s3:ListBucket", "allowed"), access(kind, name, otherBucket, "s3:GetObject", "denied"), access(kind, name, ownBucket, "s3:PutObject", "denied"), access(kind, name, ownBucket, "s3:DeleteObject", "denied")];
  }

  const common = { users: ["user-a", "user-b"], groups: ["team-a", "team-b"], buckets: [bucketA, bucketB] };
  const objectives = [
    {
      id: "separate-teams", title: "Give each team read-only access to its own bucket", picture: "rbac",
      brief: "You administer two teams. User A should read bucket A, and user B should read bucket B. Neither user should read the other bucket, upload, or delete files in their own bucket.",
      setup: "Create user-a, user-b, team-a, team-b, console-bucket-a and console-bucket-b. Put example.txt in both buckets. Use the Read objects policy template and attach the policies to the matching groups.",
      requires: common,
      checks: [assignment("team-a", "user-a", true), assignment("team-b", "user-b", true), groupRead("team-a", "user-a", bucketA), groupRead("team-b", "user-b", bucketB)].concat(readOnlyChecks("user", "user-a", bucketA, bucketB), readOnlyChecks("user", "user-b", bucketB, bucketA))
    },
    {
      id: "cross-access", title: "Give user A access to bucket B and user B access to bucket A", picture: "matrix",
      brief: "Swap the teams' bucket access. The user's name must not decide which bucket they can read. Keep both users read-only.",
      setup: "Use the same users and buckets. Keep user-a in team-a and user-b in team-b; change the group policies so team-a reads bucket B and team-b reads bucket A.",
      requires: common,
      checks: [assignment("team-a", "user-a", true), assignment("team-b", "user-b", true), groupRead("team-a", "user-a", bucketB), groupRead("team-b", "user-b", bucketA)].concat(readOnlyChecks("user", "user-a", bucketB, bucketA), readOnlyChecks("user", "user-b", bucketA, bucketB))
    },
    {
      id: "job-transfer", title: "Transfer user A to team B and remove old access", picture: "transfer",
      brief: "User A has changed jobs. They must inherit team B's read-only bucket B access and lose bucket A access. User B should keep working normally.",
      setup: "Start with team-a reading bucket A and team-b reading bucket B. Remove user-a from team-a and add them to team-b. Remove any leftover direct grants that still allow bucket A.",
      requires: common,
      checks: [assignment("team-a", "user-a", false), assignment("team-b", "user-a", true), assignment("team-b", "user-b", true), groupRead("team-b", "user-a", bucketB)].concat(readOnlyChecks("user", "user-a", bucketB, bucketA), readOnlyChecks("user", "user-b", bucketB, bucketA))
    },
    {
      id: "deny-wins", title: "Block a read even when a group allows it", picture: "deny",
      brief: "Keep team B's read Allow, but explicitly deny user A access to bucket B. User B must still be able to read it.",
      setup: "Put both users in team-b and grant that group read access to bucket B. Attach an explicit Deny for bucket B directly to user-a.",
      requires: common,
      checks: [assignment("team-b", "user-a", true), assignment("team-b", "user-b", true), {
        title: "team-b retains a matching read Allow", expected: "Matching Allow present", route: "groups", hint: "Attach a policy allowing s3:GetObject on console-bucket-b/* to team-b; do not remove its Allow to produce the denial.",
        run: function (state) {
          const result = engine.authorize(state, { kind: "user", name: "user-a" }, engine.requestFor("s3:GetObject", bucketB, key));
          const pass = result.trace.some(function (entry) { return entry.source.startsWith("Group team-b / ") && entry.matches && entry.effect === "Allow"; });
          return { pass: pass, actual: pass ? "Matching Allow present" : "No matching group Allow", trace: result.trace };
        }
      }, access("user", "user-a", bucketB, "s3:GetObject", "explicitDeny"), access("user", "user-b", bucketB, "s3:GetObject", "allowed")]
    },
    {
      id: "temporary-role", title: "Let user B read bucket A only through a role", picture: "assume",
      brief: "User B cannot read bucket A directly. With MFA, they can assume bucket-reader and read it. The role must not allow writes or reads from bucket B.",
      setup: "Create bucket-reader trusted by user-b, with read access to bucket A. Grant user-b sts:AssumeRole on bucket-reader. Keep user-b's direct/group permissions from granting bucket A reads.",
      requires: { users: ["user-b"], roles: ["bucket-reader"], buckets: [bucketA, bucketB] },
      checks: [access("user", "user-b", bucketA, "s3:GetObject", "denied"), roleAssumption(true, true), roleAssumption(false, false)].concat(readOnlyChecks("role", "bucket-reader", bucketA, bucketB))
    },
    {
      id: "application-role", title: "Give an EC2 application read-only access to bucket A", picture: "ec2",
      brief: "The demo-web application should use ec2-reader through an instance profile. It must read bucket A, but cannot upload, delete, or read bucket B.",
      setup: "Create an EC2-trusted role named ec2-reader with read access to bucket A. Create demo-web and choose ec2-reader under Modify IAM role.",
      requires: { roles: ["ec2-reader"], instances: ["demo-web"], buckets: [bucketA, bucketB] },
      checks: [{
        title: "demo-web uses the EC2-trusted ec2-reader profile", expected: "EC2 trust and profile associated", route: "instances", hint: "Use an EC2-trusted role and select its instance profile on demo-web.",
        run: function (state) {
          const role = engine.find(state, "roles", "ec2-reader");
          const instance = engine.find(state, "instances", "demo-web");
          const pass = role.trust === "ec2" && role.profile === role.name && instance.profile === role.name;
          return { pass: pass, actual: pass ? "EC2 trust and profile associated" : "Trust or profile association is missing" };
        }
      }].concat(readOnlyChecks("role", "ec2-reader", bucketA, bucketB))
    }
  ];

  function grade(state, id) {
    const objective = objectives.find(function (item) { return item.id === id; });
    if (!objective) throw new Error("Unknown objective.");
    const missing = [];
    Object.entries(objective.requires).forEach(function (entry) {
      entry[1].forEach(function (name) {
        if (!engine.find(state, entry[0], name)) missing.push(entry[0] + ": " + name);
      });
    });
    objective.requires.buckets.forEach(function (name) {
      const bucket = engine.find(state, "buckets", name);
      if (bucket && !bucket.objects.some(function (object) { return object.key === key; })) missing.push("object: " + name + "/" + key);
    });
    const results = objective.checks.map(function (check) {
      if (missing.length) return { title: check.title, expected: check.expected, actual: "Create the missing resources first", status: "blocked", hint: check.hint, route: check.route };
      const result = check.run(state);
      return Object.assign({}, result, { title: check.title, expected: check.expected, status: result.pass ? "pass" : "fail", hint: result.hint || check.hint, route: result.route || check.route });
    });
    const passed = results.filter(function (result) { return result.status === "pass"; }).length;
    return { id: id, status: missing.length ? "blocked" : passed === results.length ? "pass" : "fail", passed: passed, total: results.length, missing: missing, results: results };
  }

  const api = { objectives: objectives, grade: grade };
  root.IamObjectives = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
