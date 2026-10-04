(function () {
  "use strict";

  const model = window.IamRbacEngine;
  const storageKey = "iam-field-lab-rbac-v1";
  let state = load(storageKey, model.normalize);
  let aws = load(storageKey + "-aws", model.normalizeConfig);
  let feedback = "";
  let ui;
  if (aws.assignment !== model.assignmentKey(state)) aws.done = [];

  function load(key, normalize) {
    try { return normalize(JSON.parse(localStorage.getItem(key))); }
    catch (error) { return normalize(null); }
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(storageKey + "-aws", JSON.stringify(aws));
      return true;
    } catch (error) { return false; }
  }

  function select(field, title, options, current) {
    return '<div class="form-field"><label for="rbac-' + field + '">' + title + '</label><select id="rbac-' + field + '" data-rbac-field="' + field + '"' + (field === "prediction" ? " required" : "") + '>' + options.map(function (option) {
      return '<option value="' + ui.escape(option[0]) + '"' + (option[0] === current ? " selected" : "") + '>' + ui.escape(option[1]) + '</option>';
    }).join("") + '</select></div>';
  }

  function toggle(field, title) {
    return '<label class="check-label"><input id="rbac-' + field + '" type="checkbox" data-rbac-field="' + field + '"' + (state[field] ? " checked" : "") + '><span>' + title + '</span></label>';
  }

  function introduction() {
    return ui.panel("IAM is the system. RBAC is an access strategy.", '<p class="lesson-copy"><strong>Identity and Access Management (IAM)</strong> handles identities and permissions. <strong>Role-Based Access Control (RBAC)</strong> organizes permissions around responsibilities: Reader, Developer, or Auditor. Assign the job, not a separate S3 policy to every person.</p><div class="rbac-flow" aria-label="A user gets a job assignment through a group and receives that group’s policy permissions"><span>User<br><strong>Alice</strong></span><span aria-hidden="true">→</span><span>Job assignment<br><strong>Developer group</strong></span><span aria-hidden="true">→</span><span>Policy<br><strong>Read / upload development</strong></span></div><p class="help">Here each job role is represented by an IAM group plus an attached customer managed policy. Group names do not grant permissions. All group policies are already attached in this workshop; use the core missions to practise creating them.</p><details><summary>RBAC role ≠ AWS IAM role</summary><p>A job role is a responsibility. An <strong>AWS IAM role</strong> is a separate identity assumed for temporary credentials. IAM groups contain users, not roles, and cannot sign in or assume roles. This workshop makes requests as the user; it does not assume an IAM role.</p><p>The Allows from an IAM user’s groups combine. Do not generalize that to multiple role sessions: using one IAM role’s credentials does not merge all other roles or the original user’s groups.</p><button type="button" class="secondary small-button" data-step="7">Revisit EC2 and assumable IAM roles →</button></details><details><summary>How does this map to a real workplace?</summary><p>For workforce access, prefer federation and temporary credentials. With IAM Identity Center, assign a job-scoped permission set to a directory group for an AWS account. Identity Center provisions the corresponding IAM role; a user chooses the role/session to use. Its groups are not IAM user groups. This lab uses IAM users only to make the requested group mechanics visible.</p><p>For sensitive work, review conflicting job assignments. Merely naming one group Developers and another Auditors does not enforce separation of duties. This workshop does not implement a full RBAC hierarchy, approval workflow, or tag-based ABAC.</p></details>');
  }

  function controls() {
    const current = model.experiments.find(function (experiment) { return experiment.id === state.scenario; });
    const completed = model.completed(state);
    const assignments = model.users.map(function (user) {
      return '<fieldset class="matrix-user-controls"><legend>rbac-' + user + '</legend>' + model.roles.map(function (role) {
        return '<label class="check-label"><input id="rbac-member-' + user + '-' + role + '" type="checkbox" data-rbac-user="' + user + '" data-rbac-role="' + role + '"' + (state.members[user][role] ? " checked" : "") + '><span>' + model.names[role] + ' <small>(' + model.groups[role] + ')</small></span></label>';
      }).join("") + '</fieldset>';
    }).join("");
    const definitions = model.roles.map(function (role) {
      const description = role === "reader" ? "Read development objects. No upload Allow." : role === "auditor" ? "Read reports objects only." : "Read development objects" + (state.developerWrite ? " and allow uploads." : "; no upload Allow.") + (state.freeze ? " Explicitly deny development uploads." : "");
      return '<article class="rbac-role-card"><h3>' + model.names[role] + '</h3><p>' + description + '</p><p class="help">Group: <code>' + model.groups[role] + '</code></p><details><summary>Inspect attached policy</summary><pre><code>' + ui.escape(JSON.stringify(model.groupPolicy(state, role), null, 2)) + '</code></pre></details></article>';
    }).join("");
    const conflict = model.users.some(function (user) { return state.members[user].developer && state.members[user].auditor; });
    return ui.panel("1 / Choose an experiment", '<p>Load a starting setup, make the requested change, then predict and run the requests. Loading a scenario does not earn completion or change AWS.</p><div class="button-row rbac-scenarios">' + model.experiments.map(function (experiment) {
      return '<button type="button" class="secondary small-button" data-rbac-scenario="' + experiment.id + '" aria-pressed="' + (experiment.id === state.scenario) + '">' + (completed.includes(experiment.id) ? "✓ " : "") + experiment.title + '</button>';
    }).join("") + '</div>' + ui.callout('<strong>' + current.title + '</strong><br>' + current.hint) + '<p class="help">Correct request checks for this scenario: ' + current.checks.filter(function (check) { return state.tested.includes(check); }).length + ' / ' + current.checks.length + '. Earned experiment progress is kept when you load another setup.</p>') +
      ui.panel("2 / Assign the job roles", '<div class="matrix-controls">' + assignments + '</div>' + (conflict ? ui.callout("<strong>Access review:</strong> a learner holds both Developer and Auditor. IAM does not automatically forbid this combination; decide whether your organization should separate these responsibilities. This is a warning, not a simulated Deny.") : "") + '<p class="help">The two buckets belong to the simulated AWS account, not to Alice or Bob. Access follows policy rules and assignments.</p>') +
      ui.panel("3 / Define permissions once per job", '<div class="rbac-roles">' + definitions + '</div><div class="rbac-policy-controls">' + toggle("developerWrite", "Developer policy: allow uploads to development") + toggle("freeze", "Developer policy: explicitly deny development uploads (upload freeze)") + '</div><p class="help">Both switches edit one policy shared by every Developer. Disabling an Allow is different from adding a Deny. No job in this workshop grants DeleteObject or ListBucket.</p>');
  }

  function requestForm() {
    const assignments = model.roles.filter(function (role) { return state.members[state.user][role]; }).map(function (role) { return model.names[role]; });
    return ui.panel("4 / Predict, request, explain", '<p>Active identity: <strong>rbac-' + state.user + '</strong>. Job assignments: <strong>' + (assignments.join(" + ") || "none") + '</strong>. This is an IAM-user request, not a role session.</p><form id="rbac-request-form"><div class="request-grid">' + select("user", "Who makes the request?", model.users.map(function (user) { return [user, "rbac-" + user]; }), state.user) + select("bucket", "Which bucket?", [["dev", "Development"], ["reports", "Reports"]], state.bucket) + select("action", "Action on example.txt", [["s3:GetObject", "Read — GetObject"], ["s3:PutObject", "Upload — PutObject"], ["s3:DeleteObject", "Delete — DeleteObject"]], state.action) + select("prediction", "Your prediction", [["", "Choose an outcome"], ["allowed", "Allowed"], ["implicitDeny", "Implicit deny"], ["explicitDeny", "Explicit deny"]], state.prediction) + '</div><button type="submit" class="primary">Test RBAC access →</button></form><div id="rbac-feedback" aria-live="polite">' + feedback + '</div><p class="help">The trace names each contributing group and policy. No matching Allow means implicit deny; any matching explicit Deny wins. Removing one membership may leave another group’s Allow.</p>');
  }

  function quiz() {
    return ui.panel("5 / Check your understanding", '<form id="rbac-quiz-form">' + model.questions.map(function (question, index) {
      const correct = state.answers[index] === question.answer;
      return '<fieldset class="quiz-question"><legend>' + (index + 1) + '. ' + question.title + '</legend>' + question.options.map(function (option, choice) {
        return '<label class="check-label"><input id="rbac-answer-' + index + '-' + choice + '" type="radio" name="rbac-answer-' + index + '" data-rbac-answer="' + index + '" value="' + choice + '"' + (state.answers[index] === String(choice) ? " checked" : "") + ' required><span>' + option + '</span></label>';
      }).join("") + (state.graded ? '<p class="quiz-feedback"><strong>' + (correct ? "Correct. " : "Try again. ") + question.explanation + '</p>' : "") + '</fieldset>';
    }).join("") + '<button type="submit" class="primary">Check RBAC answers</button></form>');
  }

  function render(helpers) {
    ui = window.IamVisuals.withPanels(helpers, {
      "IAM is the system. RBAC is an access strategy.": "rbac",
      "1 / Choose an experiment": window.IamVisuals.rbacCases[state.scenario],
      "2 / Assign the job roles": "group",
      "3 / Define permissions once per job": "shared",
      "4 / Predict, request, explain": "request",
      "5 / Check your understanding": "overview"
    });
    const completed = model.completed(state);
    const header = '<div class="eyebrow">RBAC WORKSHOP · ABOUT 20 MINUTES</div><h1>Give permissions to the job.</h1><p class="intro">Two users. Three job roles. Two buckets. Assign responsibilities, change a shared policy, and see exactly why a request is allowed or denied.</p><div class="repo-progress-row"><span id="rbac-progress-label">' + completed.length + ' / 7 RBAC milestones complete</span><progress id="rbac-progress" value="' + completed.length + '" max="7" aria-label="RBAC workshop progress"></progress></div><div class="repo-mode-row" role="group" aria-label="RBAC practice mode"><button type="button" class="secondary" data-rbac-live="false" aria-pressed="' + !state.live + '">Interactive simulation</button><button type="button" class="secondary" data-rbac-live="true" aria-pressed="' + state.live + '">Matching AWS steps ↗</button></div>';
    const sources = '<p class="help">AWS references: <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction_attribute-based-access-control.html#intro-abac-compare-rbac" target="_blank" rel="noopener noreferrer">RBAC and job functions</a> · <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_groups.html" target="_blank" rel="noopener noreferrer">IAM groups</a> · <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html" target="_blank" rel="noopener noreferrer">Policy evaluation</a> · <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html" target="_blank" rel="noopener noreferrer">Workforce best practices</a> · <a href="https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html" target="_blank" rel="noopener noreferrer">Identity Center permission sets</a>. <a href="RBAC.md" target="_blank" rel="noopener">Workshop notes</a>.</p>';
    if (state.live) return header + window.IamVisuals.jump() + '<div id="rbac-feedback" aria-live="polite">' + feedback + '</div>' + window.IamRbacAws.render(aws, state, ui) + sources;
    return header + window.IamVisuals.jump() + introduction() + controls() + requestForm() + ui.panel("Your six experiments", ui.checklist(model.experiments.map(function (experiment) { return { id: experiment.id, label: experiment.title }; }), completed)) + quiz() +
      (completed.length === 7 ? '<div class="completion"><h2>RBAC workshop complete.</h2><p>You connected job assignments to policy decisions. Next, use Matching AWS steps to test the same setup manually in a sandbox account.</p></div>' : "") +
      '<p class="limits">Local identity-policy model only. No real credentials, AWS API calls, role-session activation, group nesting, role hierarchy, resource policies, organizational controls, or automatic separation-of-duties enforcement. Existing original and repository progress are separate.</p>' + sources;
  }

  function handle(event, callbacks) {
    const target = event.target;
    const before = model.assignmentKey(state);
    let handled = false;
    let focusId = "";
    let message = "RBAC experiment saved locally. AWS is unchanged.";
    if (event.type === "click") {
      const button = target.closest("button");
      if (!button || button.disabled) return false;
      if (button.dataset.rbacLive !== undefined) {
        state.live = button.dataset.rbacLive === "true";
        feedback = "";
        handled = true;
      }
      if (button.dataset.rbacScenario) {
        state = model.scenario(state, button.dataset.rbacScenario);
        feedback = "";
        handled = true;
      }
    }
    if (event.type === "change") {
      if (target.dataset.rbacUser && model.users.includes(target.dataset.rbacUser) && model.roles.includes(target.dataset.rbacRole)) {
        state.members[target.dataset.rbacUser][target.dataset.rbacRole] = target.checked;
        handled = true;
      }
      if (target.dataset.rbacField) {
        const field = target.dataset.rbacField;
        if (["developerWrite", "freeze"].includes(field)) state[field] = target.checked;
        else if ((field === "user" && model.users.includes(target.value)) || (field === "bucket" && Object.keys(model.buckets).includes(target.value)) || (field === "action" && model.actions.includes(target.value)) || (field === "prediction" && ["", "allowed", "implicitDeny", "explicitDeny"].includes(target.value))) state[field] = target.value;
        else return false;
        handled = true;
      }
      if (target.dataset.rbacAnswer !== undefined) {
        const index = Number(target.dataset.rbacAnswer);
        if (Number.isInteger(index) && index >= 0 && index < model.questions.length && ["0", "1", "2"].includes(target.value)) {
          state.answers[index] = target.value;
          state.graded = false;
          handled = true;
        }
      }
      if (target.dataset.rbacAwsCheck !== undefined) {
        const index = Number(target.dataset.rbacAwsCheck);
        if (!model.validConfig(aws) || !Number.isInteger(index) || index < 0 || index >= 5) return false;
        aws.done = aws.done.filter(function (value) { return value !== index; });
        if (target.checked) aws.done.push(index);
        aws.assignment = model.assignmentKey(state);
        const saved = save();
        document.getElementById("rbac-aws-count").textContent = aws.done.length + " / 5 manual AWS confirmations";
        callbacks.announce(saved ? "Your confirmation was saved locally; no AWS verification was performed." : "Storage unavailable. This confirmation lasts only for this page.");
        return true;
      }
      if (handled) {
        feedback = "";
        focusId = target.id;
        if (target.dataset.rbacField !== "prediction" && target.dataset.rbacAnswer === undefined) state.prediction = "";
      }
    }
    if (event.type === "submit" && target.id === "rbac-request-form") {
      if (!state.prediction) feedback = ui.callout("Choose a prediction before running the request.", "error");
      else {
        const result = model.request(state);
        model.record(state, result);
        feedback = ui.resultHtml(result, state.prediction);
        message = "RBAC result: " + result.decision + ". " + (state.prediction === result.decision ? "Correct prediction." : "Review the matching policies and try again.");
      }
      handled = true;
    }
    if (event.type === "submit" && target.id === "rbac-quiz-form") {
      if (model.questions.every(function (question, index) { return Object.prototype.hasOwnProperty.call(state.answers, index); })) {
        state.graded = true;
        message = "RBAC answers checked. Review each explanation.";
      } else {
        feedback = ui.callout("Answer all three RBAC questions before checking.", "error");
        message = "Answer all three RBAC questions before checking.";
      }
      handled = true;
    }
    if (event.type === "submit" && target.id === "rbac-aws-config-form") {
      const values = { account: document.getElementById("rbac-aws-account").value.trim(), dev: document.getElementById("rbac-aws-dev").value.trim(), reports: document.getElementById("rbac-aws-reports").value.trim() };
      if (!model.validConfig(values)) feedback = ui.callout("Use a 12-digit account ID and two different valid, new bucket names. Reserved AWS prefixes and suffixes are not allowed.", "error");
      else {
        const changed = ["account", "dev", "reports"].some(function (field) { return aws[field] !== values[field]; });
        aws = Object.assign(values, { done: changed ? [] : aws.done, assignment: model.assignmentKey(state) });
        feedback = ui.callout("RBAC guide personalized. No AWS resources have been created or changed.", "success");
      }
      handled = true;
    }
    if (!handled) return false;
    if (event.type === "submit") event.preventDefault();
    if (before !== model.assignmentKey(state)) {
      aws.done = [];
      aws.assignment = model.assignmentKey(state);
    }
    const saved = save();
    callbacks.render();
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
    if (event.type === "click" && target.closest("[data-rbac-live]")) document.getElementById("main").focus();
    if (event.type === "click" && target.closest("[data-rbac-scenario]")) document.querySelector('[data-rbac-scenario="' + state.scenario + '"]').focus();
    callbacks.announce(saved ? message : "Storage unavailable. RBAC progress lasts only for this page.");
    return true;
  }

  function reset() {
    state = model.freshState();
    feedback = "";
    aws.done = [];
    aws.assignment = model.assignmentKey(state);
    save();
  }

  window.IamRbacLesson = { render: render, handle: handle, reset: reset };
})();
