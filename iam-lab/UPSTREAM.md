# Repository-based IAM track

## Source and attribution

- Repository: [Tuan Tran's aws-labs](https://github.com/tranttuan96/aws-labs).
- Primary source: [Lab 01 — IAM & Security Foundations](https://github.com/tranttuan96/aws-labs/blob/main/labs/01-iam/README.md).
- Supporting reading: `labs/00-account-setup/README.md`, `docs/00-cost-guardrails.md`, and the IAM section of `docs/interview-prep.md`.
- License: MIT, copyright 2026 Tuan Tran. The original notice is retained in `source/aws-labs/LICENSE` and the full repository copy.
- Imported on 2 October 2026 from the user-provided `~/Downloads/aws-labs-main` into `../aws-labs-main`. The supplied repository remains unchanged. No repository scripts, infrastructure, or package installation commands were executed.
- This is a supplied ZIP snapshot, not a Git clone. It contains no Git commit metadata, so no commit or “latest revision” is claimed.
- SHA-256 of the source IAM README: `f59235e8a2457ce49e630f681380d6689c3a5bbd2fb6b7682047628a13ec1b4a`.
- An unchanged copy of that README is available offline at `source/aws-labs/01-iam.md`.

## Start

Open `index.html#repo` or select **Repository Lab 01**. Follow the six numbered steps in **Interactive simulation**, then use **Matching AWS steps** for the corresponding real-account exercise.

The IAM track is adapted here. Lab 02 is available in the sibling folder at `../vpc-lab/index.html`; see `../vpc-lab/VPC-GUIDE.md` for its source mapping and corrections. The remaining repository labs are reference material, not implemented interactive courses.

## Source-to-exercise map

| Original Lab 01 task | Interactive adaptation | Matching AWS practice |
| --- | --- | --- |
| Create developers group, attach a managed policy, add a user | Create the group; toggle membership and attachment; inspect a request | Secondary repo-learner, repo-developers group, scoped customer managed policy |
| Write GetObject permission for one bucket | Editable JSON with semantic scope checks and feedback | Inspect/edit RepoReadBucket; test a known-object read and denied list/upload |
| Create an EC2-trusted role | Separate trust, instance profile, credentials, and S3 permission | Create role/profile without launching an instance |
| Assume a role through CLI | Simulated STS credentials, session token, role identity, read/upload tests, manual expiry | Real AssumeRole in learner CloudShell; credentials scoped to a subshell |
| Predict allow/deny with Policy Simulator | Identity grants/denies, a simplified boundary, and a member-account SCP limit | Test the dedicated learner in AWS IAM Policy Simulator |
| Enable Access Analyzer and review a finding | Preview external trust, restrict the proposal, compare findings | External account analyzer plus CreateAccessPreview; no role or public bucket deployed by the preview |

The source's success criteria are represented by JSON authoring, user/role explanations, CLI session tests, and prediction checks. The final review covers its IAM interview topics. The existing nine missions, including the EC2 and multi-user/bucket playgrounds, remain available with their existing progress.

## Intentional safety changes

- Keep a separate administrator, preferably federated, and a narrowly permissioned learner. Do not give the learner account-wide administrator access.
- Use authenticated CloudShell instead of storing long-lived IAM access keys. AWSCloudShellFullAccess enables the shell; it does not grant S3 access.
- The live group is repo-developers to avoid changing an existing developers group. The simulation retains the source name.
- Follow the source's exact GetObject-only scope. Do not add console navigation, upload, or delete permissions; use a known object key with s3api.
- Require MFA for the human role's account-delegation trust pattern. The shell checks the caller ARN, captures credentials without printing them, and exports all three fields only in a subshell.
- Keep boundary/SCP experiments local. Do not apply experimental denies to an administrator or organization.
- Keep external-account trust in an access preview. Never deploy that proposed trust or disable S3 Block Public Access to manufacture a finding.
- Choose external-access analysis, not paid unused/internal analyzers or custom policy checks.
- Do not promise zero cost or repeat older Free Tier entitlements. Confirm current account pricing and clean up. Alerts are not a guaranteed spending cap. This track requires no EC2 instance.

## Model and storage limits

- The page runs no CLI commands and makes no AWS API calls. Mock credentials are deliberately unusable.
- Reloading drops the simulated issued role session but keeps earned progress. Simulated expiry is manual; real STS credentials have an actual expiration time.
- EC2 experiments model a fresh credential lookup without cached credentials.
- Boundary/SCP examples are an identity-policy-only intersection model. Resource-policy principal/session exceptions, organization inheritance, management-account exceptions, and RCPs are outside its scope.
- Local Access Analyzer supports only three predefined trust cases; it is not an arbitrary-policy analyzer.
- AWS checkboxes are manual confirmations, not verification of cloud state.

Repository simulation uses browser key `iam-field-lab-repo-v1`. Its AWS configuration/checklist uses `iam-field-lab-repo-v1-aws`. Existing storage keys are unchanged. **Restart simulator** resets both simulation tracks while keeping all AWS settings/checklists; it never deletes cloud resources.

## Official verification

AWS documentation reviewed on 2 October 2026:

- [Policy evaluation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [CloudShell credentials](https://docs.aws.amazon.com/cloudshell/latest/userguide/working-with-aws-cli.html)
- [AWSCloudShellFullAccess](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSCloudShellFullAccess.html)
- [STS AssumeRole and MFA](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)
- [CLI role credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-role.html)
- [Access preview semantics](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-preview-access-apis.html)
- [CreateAccessPreview](https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/create-access-preview.html)
- [GetAccessPreview](https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/get-access-preview.html)
- [ListAccessPreviewFindings](https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/list-access-preview-findings.html)
- [Access Analyzer pricing](https://aws.amazon.com/iam/access-analyzer/pricing/)
