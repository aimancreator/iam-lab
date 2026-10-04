# IAM Field Lab

An interactive beginner lab covering IAM users, groups, policies, restricted S3 access, RBAC job assignments, role trust, temporary role sessions, MFA, and explicit versus implicit deny.

## Start the lab

Open **index.html** in a browser. The lab works locally without installing packages or entering AWS credentials.

For a local web address, run this from the parent AWS workspace:

    python3 -m http.server 8765 --bind 127.0.0.1 --directory iam-lab

Then visit **http://127.0.0.1:8765**. Stop the server with Ctrl+C when finished.

## Practice tracks

**Start with pictures**

Open `VISUAL-GUIDE.html`, or select **Picture guide** in the lab header. It introduces 21 ideas one at a time, with a friendly overview illustration, labelled diagrams, and one-sentence explanations. Every core mission and repository lesson now ends with a **Picture summary**. RBAC sections and scenarios, manual AWS steps, and the EC2/multi-user extensions also include visual recaps.

Use **See the picture summary** to skip straight to the explanation before trying an exercise. On phones, diagrams stack vertically instead of shrinking the labels. Each has descriptive alternative text, a text transcript, and an **Open larger image** link. Pictures show concept examples, not your current simulator decision or live AWS results; use the request tester for those. Your existing progress and AWS configuration are unchanged.

**New: RBAC workshop — about 20 minutes**

Open `index.html#rbac` or select **RBAC workshop**. Assign Reader, Developer, and Auditor responsibilities to two users across development and reports buckets. Six guided experiments cover least privilege, combined group grants, shared-policy changes, job transfers, removal of access, and explicit deny. Predict requests, inspect policy traces, and complete a three-question quiz. The workshop explicitly distinguishes an RBAC job role from an assumable AWS IAM role.

**Matching AWS steps** generates three policies, an exact membership table, and identity-checked CloudShell probes for two new learners and two private buckets. Changes remain local until you manually apply them in AWS. It has separate settings and five manual confirmations; these clear when assignments, policies, or bucket/account settings change. No new access keys or EC2 instances are needed. See `RBAC.md` for the full lesson, safety guidance, scope, and cleanup. The original and repository progress remain separate.

**Repository Lab 01 — IAM & Security Foundations**

Open `index.html#repo` or select **Repository Lab 01**. This six-step course follows [tranttuan96/aws-labs](https://github.com/tranttuan96/aws-labs/tree/main/labs/01-iam): developers group, GetObject-only policy authoring, EC2 service role, CLI STS assumption, layered permission decisions, and Access Analyzer.

Each step has an interactive simulation and matching AWS instructions. Practise missing session tokens and expired credentials, see boundaries/SCPs limit an Allow, and compare external-trust findings without exposing real resources. The AWS guide generates personalized policies and commands, uses learner CloudShell instead of new access keys, and includes cost guardrails and cleanup.

The supplied repository is preserved in `../aws-labs-main`. See `UPSTREAM.md` for source mapping, MIT attribution, and safety updates. This track has separate progress and AWS settings; the original nine missions remain available.

**Simulator — about 25–35 minutes**

1. Create an IAM user with no permissions.
2. Create a group and add the user.
3. Edit and attach a restricted JSON policy.
4. Predict allowed, implicitly denied, and explicitly denied requests.
5. Create a role; configure caller permission, trust, and MFA; assume it.
6. Combine an Allow and a Deny, then remove each to compare outcomes.
7. Complete a six-question challenge with explanations.
8. Give an EC2 application a role, configure service trust and an instance profile, and test restricted S3 requests.
9. Compare two users across three buckets; swap grants, change group membership, and test each action separately.

**Mission 8: EC2 → S3 roles** is available immediately, even if you have not completed the core missions. Open `index.html#ec2`, or select it in the sidebar. Allow about 15 additional minutes. It includes five request experiments and three concept questions. Existing simulator progress is preserved when the lesson is added.

**Mission 9: Users × buckets** is also available immediately at `index.html#matrix`. Allow about 15 minutes. It starts with two simulated users, two individual practice buckets, and a shared bucket. Click any user/bucket cell to run a request and inspect its policy trace, or run all six requests at once. Change direct grants and explicit denies independently for each user and bucket. Six guided experiments cover baseline access, swapped access, group access, removing membership, deny precedence, and upload restrictions.

| Baseline read access | Bucket A | Bucket B | Shared |
| --- | --- | --- | --- |
| matrix-user-a | Allowed | Implicit deny | Allowed through group |
| matrix-user-b | Implicit deny | Allowed | Allowed through group |

Bucket names are labels, not ownership assignments: the AWS account owns these buckets. Choosing “No direct Allow” does not cancel a group Allow. An explicit Deny does. Changing the action to upload or delete can change the result even for the same user and bucket.

The request tester evaluates the policy attached in the simulator. It shows matching statements, missed conditions, and the active identity. Progress is stored in your browser. A page reload returns the simulated session to the user. **Restart simulator** clears all simulator progress and RBAC's now-stale AWS confirmations; AWS settings and the original/repository AWS checklists are kept. It does not change AWS resources.

**In my AWS account — about 45–60 minutes**

Use the second tab for an eight-step console walkthrough plus an optional EC2 extension before cleanup. Supply your AWS account ID and a fresh, globally unique S3 bucket name to generate six labelled policy documents. Complete each step in AWS and check it off in the lab.

The walkthrough includes small sample files, MFA enrolment, exact expected outcomes, role switching, troubleshooting, and cleanup. The checklist records your own confirmation; the page does not connect to AWS.

IAM has no additional charge. The real S3 exercises can incur storage and request charges. Use a practice account, tiny files, and the cleanup instructions. No access keys are needed.

The optional EC2 extension adds a role, an instance profile, a small Amazon Linux instance, and Session Manager terminal access. EC2, EBS, and public IPv4 charges can apply. Its instructions include network prerequisites, commands with allowed and denied outcomes, and separate cleanup.

The independent **multi-user AWS extension** creates two IAM users, one group, three private S3 buckets, and three customer managed policies. Enter three distinct bucket names in its own form; the core lab's account/bucket configuration is not required. Its generated policies reflect your current Mission 9 settings. Copy the individual documents into AWS, attach them to the indicated users/group, and match group membership. Then test with separate signed-in users. Local controls do not modify AWS; AWS policy edits do not update the simulator. This extension includes its own download bundle, six manual confirmations, troubleshooting, and cleanup. It needs no EC2 resources or access keys.

## Attach, associate, assume

| Action | Meaning |
| --- | --- |
| Attach a policy to a role | Define which actions and resources the role's permissions allow. |
| Associate an instance profile with EC2 | Make the role contained in that profile available to the instance. |
| Assume a role | Obtain temporary credentials and act using the role's permissions. |

A user may assume a role when authorized; the role is not attached to that user like a permissions policy. For an EC2 application, AWS supplies temporary role credentials and the SDK or CLI obtains them automatically. The application does not need a separate AssumeRole call for its own attached role.

Mission 8 separates credential setup from authorization. Without the profile and EC2 trust, the simulated application has no usable role credentials. With credentials but no S3 policy, S3 access is implicitly denied. Attaching LabEC2ReadTraining then allows reads and listing under training/, while private reads and uploads remain denied.

The EC2 role trusts `ec2.amazonaws.com` because EC2 uses the role. Its permissions policy names S3 because S3 is the destination. A bucket policy is a separate resource-based policy on S3; this same-account example uses the role policy without a bucket-policy grant.

## What the lab teaches

| Concept | Meaning in this lab |
| --- | --- |
| IAM user | A named identity. Creating it does not grant S3 permission. |
| IAM group | A collection of users that receive its attached policies. It cannot sign in or act as a trusted principal. |
| Policy | Rules for actions, resources, effects, and conditions. |
| Resource ARN | Identifies the bucket, object, or role a rule applies to. |
| Implicit deny | No applicable policy grants the requested access. |
| Explicit deny | An applicable Deny overrides a matching Allow. |
| IAM role | An identity assumed for temporary credentials and its own permissions. |
| RBAC job role | A responsibility represented here by an IAM group and shared policy, not automatically an assumable IAM role. |
| Trust policy | Defines which principals may assume a role and under what conditions. |
| MFA | This role's trust requires the learner to authenticate with an additional factor. |

The learner can read `training/*`. The upload role can read and write only `training/uploads/*`. Both have their own explicit denies on object deletion. Neither may read `private/*`.

Console navigation permissions reveal bucket names and some parent folder names. A visible name does not imply permission to read an object's contents.

The trust policy uses an account principal restricted by `aws:PrincipalArn` and MFA. This particular pattern also requires the user's `sts:AssumeRole` permission. Do not generalize that requirement to every same-account trust configuration.

For normal workforce access, AWS recommends federation/Identity Center and temporary credentials. This lab deliberately includes an IAM user to teach the requested concepts.

## Scope and implementation

The simulator is a teaching model, not AWS's IAM Policy Simulator. It supports identity policies containing `Version`, `Statement`, `Sid`, `Effect`, `Action`, `Resource`, and `StringEquals`/`StringLike` conditions for `s3:prefix` and `s3:delimiter`. Unsupported policy constructs produce an error instead of silently granting access.

It does not evaluate SCPs, RCPs, permissions boundaries, arbitrary resource-based policies, session policies, KMS permissions, resource existence, or every service-specific authorization rule. Role trust is modelled through explicit controls for the lab's user and EC2 patterns. It is not a general trust-policy parser. The local model has no timed credential expiration. Each EC2 experiment models a fresh credential lookup with no cached credentials; existing real sessions may remain valid after profile or trust changes. Network connectivity and IAM propagation are not simulated.

Files:

- `index.html`, `styles.css`: responsive lab interface.
- `visual-summaries.js`, `visual-guide.js`, `VISUAL-GUIDE.html`: shared picture summaries and a picture-first learning guide.
- `assets/visuals/`: one built-in-tool-generated overview illustration and 42 locally generated SVGs (21 diagrams in desktop/phone layouts); provenance and the exact illustration prompt are in `assets/visuals/README.md`.
- `scripts/build-visuals.cjs`: dependency-free generator for the precise SVG diagrams; rerun after editing their topic text.
- `iam-engine.js`: policy builders, matching, deny precedence, and role-assumption checks.
- `app.js`: missions, local progress, feedback, and quiz.
- `ec2-lesson.js`: attach/assume explanation, interactive application-role lesson, and optional EC2 walkthrough.
- `matrix-lesson.js`: multi-user access matrix, configurable grants/denies, experiments, and matching AWS extension.
- `rbac-engine.js`: job-function policies, group assignment model, experiments, and progress checks.
- `rbac-lesson.js`, `rbac-aws.js`, `RBAC.md`: interactive RBAC workshop, generated manual AWS guide, and companion notes.
- `repo-engine.js`, `repo-lesson.js`, `repo-aws.js`: repository-based model, six-step UI, and matching AWS instructions.
- `UPSTREAM.md` and `source/aws-labs/`: source mapping, unchanged IAM README, and MIT attribution.
- `aws-guide.js`: real-account walkthrough and personalized policy documents.
- `AWS-WALKTHROUGH.md`: compact offline reference.
- `samples/`: tiny fictional practice files.

There are no external fonts, scripts, dependencies, analytics, or AWS API calls. Copying uses the browser clipboard API, with manual selection as a fallback.

The existing parent `lab01-group.yaml` is a separate group-only CloudFormation exercise using AWS-managed ReadOnlyAccess. This lab creates a different group and policies scoped to its practice bucket.

## AWS references

Documentation reviewed on 1 October 2026:

- [IAM identities](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction_identity-management.html)
- [Security best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Policy evaluation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [Controlling S3 access with user policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/walkthrough1.html)
- [Account principals and role trust](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html)
- [Granting permission to switch roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_permissions-to-switch.html)
- [Switching roles in the console](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-console.html)
- [MFA conditions](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html)
- [IAM FAQ](https://aws.amazon.com/iam/faqs/)
- [S3 pricing](https://aws.amazon.com/s3/pricing/)

EC2 extension references reviewed on 2 October 2026:

- [IAM roles for EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)
- [Attach a role to an EC2 instance](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/attach-iam-role.html)
- [Temporary credentials from instance metadata](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-metadata-security-credentials.html)
- [Instance profiles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html)
- [Session Manager prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html)
- [SSM instance permissions](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-instance-permissions.html)
- [Amazon Linux 2023 AWS CLI](https://docs.aws.amazon.com/linux/al2023/ug/awscli2.html)
- [AMIs with SSM Agent](https://docs.aws.amazon.com/systems-manager/latest/userguide/ami-preinstalled-agent.html)
- [EC2 pricing](https://aws.amazon.com/ec2/pricing/)

Multi-user extension references reviewed on 2 October 2026:

- [S3 identity-policy examples](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-policies-s3.html)
- [Policy evaluation and explicit deny](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [Attaching and detaching IAM policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_manage-attach-detach.html)
- [S3 bucket naming rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)
