# RBAC workshop

Open `index.html#rbac`, or select **RBAC workshop**. Allow about 20 minutes for the simulation. **Matching AWS steps** provides a separate, manual real-account exercise with personalized policies, identity-checked CLI probes, and cleanup. The page never connects to AWS.

## IAM and RBAC

IAM manages identities and access. Role-Based Access Control organizes permissions by responsibilities rather than assigning unrelated grants to each person.

In this workshop:

**IAM user → job-function group → attached policy → permitted S3 requests**

An RBAC job role is not necessarily an AWS IAM role. Here a job is implemented with an IAM group and a customer managed policy. An AWS IAM role is a separate assumable identity that supplies temporary credentials. Groups cannot sign in, contain IAM roles, or assume roles.

## Permission definitions

| Job role | IAM group | Customer managed policy | Permission |
| --- | --- | --- | --- |
| Reader | rbac-readers | RbacReadDevelopment | GetObject in development |
| Developer | rbac-developers | RbacDevelop | GetObject in development; optional PutObject Allow and optional PutObject Deny |
| Auditor | rbac-auditors | RbacReadReports | GetObject in reports |

The simulated users are `rbac-alice` and `rbac-bob`. Initially Alice is a Reader and Bob is a Developer. The two buckets belong to the account, not to either user. No group grants DeleteObject, ListBucket, or S3 console navigation.

The Developer switches edit one shared policy. They do not add per-user S3 grants. A group name alone does not authorize requests.

## Six interactive experiments

Load a scenario to set its starting assignments. Make the requested changes, select a user, bucket and action, predict the result, and run the request. Correct predictions under the required configuration earn checks; simply loading a scenario does not.

1. **Least privilege:** Alice remains a Reader. A development read is allowed; an upload is implicitly denied.
2. **Combined jobs:** add Developer to Alice while keeping Reader. Her development upload is allowed. A read-only policy omits an upload grant; it does not forbid a grant from another group.
3. **Shared policy:** both users are Developers. Disable Developer uploads, then test an upload as each user. Both are implicitly denied because their shared policy no longer grants PutObject.
4. **Job transfer:** remove Alice from Reader and Developer, then add Auditor. Her development read is denied; her reports read is allowed. Adding a new job without removing the old ones would accumulate access.
5. **Access removal:** remove all three of Alice's assignments. Reads from both buckets are implicitly denied. This removes only the modeled group grants, not her identity or all possible real-world access.
6. **Explicit deny:** retain the Developer upload Allow and enable the upload freeze. Alice's development upload is explicitly denied despite its matching Allow.

The trace identifies the matching group, policy, and statement. All six experiments plus a three-question concept quiz produce **7 milestones**. Progress is independent of the original nine missions and the six-step repository track.

## Manual AWS practice

Use a sandbox account and an existing administrator, preferably federated. Keep administrator and learner browser profiles separate. Secure root and learners with MFA; use no new access keys. Budget alerts are not a spending cap, and S3 storage/requests can cost money. Do not assume Free Tier eligibility.

The in-app guide creates only these new lab resources:

- Two IAM users: `rbac-alice` and `rbac-bob`, at the default IAM path.
- Three groups and three customer managed policies listed above.
- Two distinct, globally unique, private general purpose S3 buckets: development and reports.

If any fixed IAM name already exists, do not overwrite or repurpose it. Use an isolated environment. Use the commercial AWS partition and Singapore (`ap-southeast-1`) for both buckets and CloudShell.

Keep bucket public access blocked, ACLs disabled, versioning off, and SSE-S3 enabled. Add no bucket policy. Put the supplied `samples/example.txt` at the root of both buckets. Use only fictional data.

Set up console access, first-login password changes, and MFA for both learners. Attach `AWSCloudShellFullAccess` directly to each user only for CLI practice; it does not provide S3 grants. Keep `IAMUserChangePassword` if needed. All S3 grants must come from the three job groups. Do not add broad S3 or administrator policies to overcome an expected denial.

The generated policies and membership table reflect the **current simulator configuration**. Apply them manually in AWS. For policy edits, save the new version as default; remove obsolete group memberships as well as adding new ones.

Run the matching generated probes from each learner's CloudShell Bash session. The function checks the exact user ARN before making S3 requests. It reads `example.txt`, attempts uploads of fictional `upload-probe.txt`, and attempts to delete only the development probe, which should be denied. Check the displayed expectations. An allowed upload can create or overwrite that lab probe; use only the new practice buckets.

Implicit and explicit denies may both appear as `AccessDenied`. A missing object or network problem is not proof of an authorization denial. Verify identity, current policies, memberships, propagation, and other applicable controls if results differ. Never widen permissions merely to make a test pass.

Repeat the six experiments by returning to the simulator, changing its assignments/policy, and then manually reapplying the updated guide in AWS. The five manual confirmations are local notes, not account verification. Configuration or permission changes clear them; selecting another request does not.

### Cleanup

Follow the in-app cleanup before leaving:

1. Remove the three `/tmp/rbac-*.txt` files created by the probes from the learner CloudShell sessions and sign out.
2. As administrator, empty and delete only the two new buckets, including probes and any versions/delete markers if you enabled versioning.
3. Remove learner group memberships and attached policies, console credentials, and MFA associations; delete only the two lab users. Remove their unused virtual MFA devices, saved passwords, and authenticator entries.
4. Detach the three customer managed policies, delete the three empty groups, then delete those policies and any nondefault policy versions if prompted. Do not delete AWS managed policies.
5. Verify lab resources are gone. Leave existing administrators, shared resources, other lab tracks, budgets, and security guardrails intact.

## Important limits

- This is an identity-policy RBAC teaching model, not a complete RBAC standard implementation or AWS authorization engine.
- The union of an IAM user's group grants does not mean different IAM role sessions combine. A request using role credentials uses that role session, not all the user's groups and other roles.
- Removing group memberships does not automatically disable sign-in, remove other grants, or revoke existing role sessions. Full workforce offboarding is broader.
- Developer and Auditor memberships may trigger an access-review warning, but the application does not silently enforce separation of duties. IAM does not infer such a constraint from group names.
- Group nesting, role hierarchies, approval workflows, ABAC, arbitrary resource policies, boundaries, organization controls, encryption, resource existence, and IAM propagation are not simulated here.
- Normal workforce access should use federation and temporary credentials. IAM Identity Center permission sets can map directory groups to scoped account access through provisioned IAM roles. Those groups are not IAM user groups; this workshop does not deploy Identity Center.

## Local data

`iam-field-lab-rbac-v1` stores simulated assignments, policy switches, experiment checks, and quiz answers. `iam-field-lab-rbac-v1-aws` stores the account ID, bucket names, and manual confirmations. No credentials are requested or stored.

**Restart simulator** resets RBAC progress and assignments, clears its now-stale AWS confirmations, and retains its account/bucket settings. It preserves the original and repository AWS checklists. No reset performs AWS cleanup.

## Sources

AWS documentation checked 3 October 2026:

- [RBAC job functions and comparison with ABAC](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction_attribute-based-access-control.html)
- [IAM groups and shared permissions](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_groups.html)
- [IAM identities](https://docs.aws.amazon.com/IAM/latest/UserGuide/id.html)
- [Policy evaluation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [Workforce IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [IAM Identity Center permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html)

This is an additional workshop, not another task claimed to be present in the supplied repository's Lab 01. The supplied repository and its six-step adaptation remain unchanged.
