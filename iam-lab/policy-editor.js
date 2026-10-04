(function (root) {
  "use strict";

  const engine = root.IamConsole || (typeof require === "function" ? require("./console-engine.js") : null);
  const list = function (value) { return Array.isArray(value) ? value : [value]; };
  const actions = [
    ["s3:GetObject", "Read files"], ["s3:PutObject", "Upload / overwrite files"],
    ["s3:DeleteObject", "Delete files"], ["s3:ListBucket", "List file names"],
    ["s3:GetBucketLocation", "Read bucket location"], ["s3:*", "All S3 actions (broad access)"]
  ];

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]; });
  }

  function decode(statement) {
    const selected = list(statement.Action);
    const resources = list(statement.Resource);
    const base = { effect: statement.Effect, actions: selected, bucket: "", prefix: "", role: "", scope: "s3" };
    if (selected.length === 1 && selected[0] === "s3:ListAllMyBuckets" && resources.length === 1 && resources[0] === "*" && !statement.Condition) return Object.assign(base, { scope: "browse" });
    if (selected.length === 1 && selected[0] === "sts:AssumeRole" && resources.length === 1 && !statement.Condition) {
      const match = resources[0].match(new RegExp("^arn:aws:iam::" + engine.account + ":role/([A-Za-z0-9_+=,.@-]{1,64})$"));
      return match ? Object.assign(base, { scope: "role", role: match[1] }) : null;
    }
    if (!selected.every(function (action) { return actions.some(function (entry) { return entry[0] === action; }); })) return null;
    const parsed = resources.map(function (resource) { return resource.match(/^arn:aws:s3:::([a-z0-9][a-z0-9-]{1,61}[a-z0-9])(?:\/([^*?$]*?)\*)?$/); });
    if (parsed.some(function (match) { return !match; }) || !parsed.every(function (match) { return match[1] === parsed[0][1]; })) return null;
    base.bucket = parsed[0][1];
    const prefixes = parsed.filter(function (match) { return match[2] !== undefined; }).map(function (match) { return match[2]; });
    if (new Set(prefixes).size > 1) return null;
    base.prefix = prefixes[0] || "";
    if (statement.Condition) {
      const condition = statement.Condition;
      if (selected.length !== 1 || selected[0] !== "s3:ListBucket" || Object.keys(condition).length !== 1 || !condition.StringLike || Object.keys(condition.StringLike).length !== 1) return null;
      const prefix = condition.StringLike["s3:prefix"];
      if (typeof prefix !== "string" || !prefix.endsWith("*") || /[*?$]/.test(prefix.slice(0, -1))) return null;
      base.prefix = prefix.slice(0, -1);
    }
    try {
      const rebuilt = encode(base, statement);
      if (JSON.stringify(list(rebuilt.Resource).sort()) !== JSON.stringify(resources.slice().sort())) return null;
      if (JSON.stringify(rebuilt.Condition) !== JSON.stringify(statement.Condition)) return null;
    } catch (error) { return null; }
    return base;
  }

  function encode(model, original = {}) {
    const statement = { Effect: model.effect };
    if (original.Sid !== undefined) statement.Sid = original.Sid;
    if (model.scope === "browse") {
      statement.Action = "s3:ListAllMyBuckets";
      statement.Resource = "*";
    } else if (model.scope === "role") {
      if (!/^[A-Za-z0-9_+=,.@-]{1,64}$/.test(model.role)) throw new Error("Choose or enter the role name for this permission block.");
      statement.Action = "sts:AssumeRole";
      statement.Resource = "arn:aws:iam::" + engine.account + ":role/" + model.role;
    } else {
      if (!model.actions.length) throw new Error("Choose at least one S3 action, or remove this permission block.");
      engine.buildPolicy("read", model.bucket, model.prefix, false);
      if (!model.actions.every(function (action) { return actions.some(function (entry) { return entry[0] === action; }); })) throw new Error("Unsupported visual action.");
      if (model.prefix && model.actions.includes("s3:ListBucket") && model.actions.length > 1) throw new Error("For prefix-restricted listing, use a separate List file names block. This keeps the prefix condition from affecting other actions.");
      if (model.prefix && model.actions.includes("s3:*")) throw new Error("Choose individual actions to restrict access to a prefix.");
      const bucketArn = "arn:aws:s3:::" + model.bucket;
      const resources = [];
      if (model.actions.some(function (action) { return ["s3:ListBucket", "s3:GetBucketLocation", "s3:*"].includes(action); })) resources.push(bucketArn);
      if (model.actions.some(function (action) { return ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:*"].includes(action); })) resources.push(bucketArn + "/" + model.prefix + "*");
      statement.Action = model.actions.length === 1 ? model.actions[0] : model.actions;
      statement.Resource = resources.length === 1 ? resources[0] : resources;
      if (model.prefix && model.actions.includes("s3:ListBucket")) statement.Condition = { StringLike: { "s3:prefix": model.prefix + "*" } };
    }
    engine.policyDocument({ Version: "2012-10-17", Statement: [statement] });
    return statement;
  }

  function selectOptions(values, current) {
    return values.map(function (value) { return '<option value="' + escape(value[0]) + '"' + (value[0] === current ? " selected" : "") + '>' + escape(value[1]) + '</option>'; }).join("");
  }

  function block(statement, index) {
    const model = decode(statement);
    const heading = '<div class="permission-heading"><h3>Permission block ' + (index + 1) + (statement.Sid ? ' · ' + escape(statement.Sid) : '') + '</h3><button type="button" data-policy-action="remove" data-index="' + index + '">Remove block</button></div>';
    if (!model) return '<section class="permission-block" data-index="' + index + '" data-advanced="true">' + heading + '<p class="notice warning">Advanced rule: preserved unchanged. Use JSON to edit its actions, resources or conditions, or remove this block explicitly.</p><pre>' + escape(JSON.stringify(statement, null, 2)) + '</pre></section>';
    return '<section class="permission-block" data-index="' + index + '">' + heading + '<div class="field-grid"><label class="field">Permission type<select data-policy-field="scope">' + selectOptions([["s3", "S3 bucket / objects"], ["browse", "S3 account bucket names"], ["role", "STS assume role"]], model.scope) + '</select></label><label class="field">Effect<select data-policy-field="effect">' + selectOptions([["Allow", "Allow these actions"], ["Deny", "Explicitly deny these actions"]], model.effect) + '</select></label></div>' + (model.scope === "s3" ? '<fieldset class="permission-actions"><legend>Actions</legend>' + actions.map(function (action) { return '<label class="check-row"><input type="checkbox" data-policy-field="action" value="' + action[0] + '"' + (model.actions.includes(action[0]) ? ' checked' : '') + '><span>' + action[1] + '<small>' + action[0] + '</small></span></label>'; }).join("") + '</fieldset><div class="field-grid"><label class="field">Bucket name<input data-policy-field="bucket" list="policy-bucket-options" value="' + escape(model.bucket) + '"></label><label class="field">Object prefix (optional)<input data-policy-field="prefix" value="' + escape(model.prefix) + '"><small>For example training/; blank means all objects in this bucket. Use a separate block for prefix-restricted listing.</small></label></div>' : model.scope === "role" ? '<label class="field">Role name<input data-policy-field="role" list="policy-role-options" value="' + escape(model.role) + '"><small>This grants permission to request a role session. The role must also trust the caller.</small></label>' : '<p>This permission applies to <code>*</code> to list all bucket names in the account. It does not grant access to files.</p>') + '</section>';
  }

  function blocks(document) { return list(document.Statement).map(block).join(""); }

  function render(document, state) {
    return '<div data-policy-editor data-mode="visual"><div class="segmented policy-modes"><button type="button" data-policy-action="visual" aria-pressed="true">Visual</button><button type="button" data-policy-action="json" aria-pressed="false">JSON</button></div><p class="help">Select actions and their scope. Changes take effect only after saving. An unchecked Allow is not an explicit Deny.</p><div data-policy-error class="notice error" role="alert" hidden></div><datalist id="policy-bucket-options">' + state.buckets.map(function (bucket) { return '<option value="' + escape(bucket.name) + '"></option>'; }).join("") + '</datalist><datalist id="policy-role-options">' + state.roles.map(function (role) { return '<option value="' + escape(role.name) + '"></option>'; }).join("") + '</datalist><div data-policy-visual><div data-policy-blocks>' + blocks(document) + '</div><div class="buttons"><button type="button" data-policy-action="add-allow">+ Add Allow block</button><button type="button" data-policy-action="add-deny">+ Add Deny block</button></div><details class="policy-preview"><summary>Preview generated JSON</summary><pre data-policy-preview>' + escape(JSON.stringify(document, null, 2)) + '</pre></details></div><label class="field" data-policy-json hidden>Policy JSON<textarea name="document" rows="18">' + escape(JSON.stringify(document, null, 2)) + '</textarea><small>Switch back to Visual to validate and show your changes. Advanced rules remain intact.</small></label></div>';
  }

  function readModel(element) {
    const value = function (name) { const field = element.querySelector('[data-policy-field="' + name + '"]'); return field ? field.value.trim() : ""; };
    return { scope: value("scope"), effect: value("effect"), bucket: value("bucket"), prefix: value("prefix"), role: value("role"), actions: Array.from(element.querySelectorAll('[data-policy-field="action"]:checked')).map(function (field) { return field.value; }) };
  }

  function read(container, omitIndex) {
    const editor = container.matches && container.matches("[data-policy-editor]") ? container : container.querySelector("[data-policy-editor]");
    const document = engine.policyDocument(editor.querySelector('[name="document"]').value);
    if (editor.dataset.mode === "json") return document;
    document.Statement = list(document.Statement).map(function (statement, index) {
      if (index === omitIndex) return null;
      const element = editor.querySelector('.permission-block[data-index="' + index + '"]');
      if (element.dataset.advanced) return statement;
      const model = readModel(element);
      const original = decode(statement);
      return ["scope", "effect", "bucket", "prefix", "role", "actions"].every(function (key) { return JSON.stringify(model[key]) === JSON.stringify(original[key]); }) ? statement : encode(model, statement);
    }).filter(function (statement) { return statement !== null; });
    return engine.policyDocument(document);
  }

  function update(editor, document, redraw) {
    const text = JSON.stringify(document, null, 2);
    editor.querySelector('[name="document"]').value = text;
    editor.querySelector("[data-policy-preview]").textContent = text;
    if (redraw) editor.querySelector("[data-policy-blocks]").innerHTML = blocks(document);
    editor.querySelector("[data-policy-error]").hidden = true;
  }

  function errorMessage(editor, error) {
    const message = editor.querySelector("[data-policy-error]");
    message.textContent = error.message;
    message.hidden = false;
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", function (event) {
      const target = event.target.closest("[data-policy-action]");
      if (!target) return;
      const editor = target.closest("[data-policy-editor]");
      try {
        const action = target.dataset.policyAction;
        let policy;
        if (action === "remove") {
          policy = engine.policyDocument(editor.querySelector('[name="document"]').value);
          const statements = list(policy.Statement);
          if (statements.length === 1) throw new Error("Keep at least one permission block. To remove this policy's access completely, detach it from its users, groups or roles.");
          update(editor, read(editor, Number(target.dataset.index)), true);
          return;
        }
        policy = read(editor);
        if (action === "visual" || action === "json") {
          update(editor, policy, true);
          editor.dataset.mode = action;
          editor.querySelector("[data-policy-visual]").hidden = action !== "visual";
          editor.querySelector("[data-policy-json]").hidden = action !== "json";
          editor.querySelectorAll("[data-policy-action=visual], [data-policy-action=json]").forEach(function (control) { control.setAttribute("aria-pressed", String(control.dataset.policyAction === action)); });
        } else {
          if (list(policy.Statement).length >= 30) throw new Error("This simulator supports up to 30 permission blocks.");
          const effect = action === "add-deny" ? "Deny" : "Allow";
          const bucketOption = editor.querySelector("#policy-bucket-options option");
          const statement = encode({ scope: "s3", effect: effect, bucket: bucketOption ? bucketOption.value : "console-bucket-a", prefix: "", actions: [effect === "Deny" ? "s3:DeleteObject" : "s3:GetObject"] });
          policy.Statement = list(policy.Statement).concat([statement]);
          update(editor, policy, true);
          editor.querySelector(".permission-block:last-child select").focus();
        }
      } catch (error) { errorMessage(editor, error); }
    });
    document.addEventListener("change", function (event) {
      const editor = event.target.closest("[data-policy-editor]");
      if (!editor || !event.target.matches("[data-policy-field]")) return;
      try {
        if (event.target.dataset.policyField === "scope") {
          const element = event.target.closest(".permission-block");
          const policy = engine.policyDocument(editor.querySelector('[name="document"]').value);
          const model = readModel(element);
          model.bucket = model.bucket || "console-bucket-a";
          model.role = model.role || (editor.querySelector("#policy-role-options option") || {}).value || "bucket-reader";
          model.prefix = "";
          model.actions = ["s3:GetObject"];
          policy.Statement = list(policy.Statement);
          policy.Statement[Number(element.dataset.index)] = encode(model, policy.Statement[Number(element.dataset.index)]);
          update(editor, policy, true);
        } else update(editor, read(editor), false);
      } catch (error) { errorMessage(editor, error); }
    });
  }

  const api = { decode: decode, encode: encode, render: render, read: read };
  root.IamPolicyEditor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
