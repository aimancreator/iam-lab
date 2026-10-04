# Practice console

Open **CONSOLE.html**, or select **Practice console** in the original lab to open it in another tab. No installation or AWS account is required. The original learning lab remains available with its own progress.

## Start here

1. Stay signed in as **Lab administrator** while creating resources.
2. Follow the coach's **Users × buckets** path. Create two private buckets with `example.txt`, two users, two groups, and two read policies. The coach provides the exact names.
3. Use **Practice as identity** to switch users. Try reading from both buckets and uploading. Every request shows the evaluated action, resource and policy trace.
4. Change group membership to transfer a user's job (RBAC). Add an explicit Deny and test again.
5. Choose **Assume roles & EC2** in the coach. Create a user-trusted role, grant permission to assume it, and switch role with simulated MFA. Then create an EC2 instance, associate a service role, and grant scoped S3 access.

Use **Free practice** to try your own names and policies. **Request history** keeps the last 100 requests. Restart with the coach's **Restart this practice** button to repeat from an empty account.

You can also select **Reset practice** in the top header from any page, including Objectives & checks. Type `RESET` and confirm to clear this console's resources, objects, history and guided progress, then return to an empty administrator account. Cancel keeps everything. This does not reset the original learning lab or change FakeCloud/real AWS resources.

## Objectives & checks

Open **Objectives & checks** in the console sidebar or **Check your objectives** in the coach. Choose a scenario to see a task brief, optional setup hints, and automatic results:

1. Separate teams: each user reads only their team's bucket.
2. Cross access: user A reads bucket B, and user B reads bucket A.
3. Job transfer: user A joins team B and loses old bucket A access.
4. Explicit deny: user A is denied despite a group Allow, while user B keeps access.
5. Temporary role: user B needs the role and MFA to read bucket A.
6. Application role: demo-web uses an EC2-trusted instance profile for read-only bucket A access.

Each check shows **PASS**, **FAIL**, or **BLOCKED**, the expected result, the actual result, and a repair hint where needed. Missing resources or `example.txt` objects block evaluation instead of being mistaken for permission denials. Expand **Why this result?** to read the policy trace. Select **Check again** after experimenting.

Role-assumption objectives also show three requirements directly: caller permission, role trust and simulated MFA. Each unmet requirement includes instructions and a link. A with-MFA objective supplies MFA automatically, so its failure usually points to trust or caller permissions. The without-MFA test deliberately omits MFA; denial is the expected result. To create a caller policy, use **Start from a template → Assume role → choose the role → Apply template (replaces draft)**, then attach the saved policy to the user. This avoids accidentally retaining the new-policy form's default S3 grants.

Results evaluate current configuration rather than past successful requests. They do not change the active session, objects, history or completed exercises. Scenarios are separate targets, so later exercises may intentionally undo earlier objectives. Checks cover only the listed requests against the two named buckets; they are not an exhaustive security audit. They check this local simulator only, not FakeCloud or your AWS account.

## What each operation means

**Visual policy editor:** both Create policy and existing policy pages open in Visual mode. Tick actions such as Read files, Upload or Delete, choose Allow or Explicitly deny, and enter/select a bucket. Use Add Deny block to block deletion separately from an Allow block. You can remove blocks, select STS assume role permissions, preview generated JSON, or switch to JSON. Unsupported visual shapes are preserved as advanced blocks instead of silently dropping conditions or resources. Save policy applies changes; editing controls alone does not. Prefix-restricted listing uses its own block so its condition does not affect object actions.

| Console operation | Meaning |
| --- | --- |
| Create user | Create an identity; no permissions are granted automatically. |
| Add user to group | Share that group's attached policies with the user. |
| Create policy | Define rules; they take effect only when attached. |
| Attach policy | Give a user, group or role those permission rules. |
| Create role | Define a trusted caller and a separate set of permissions. |
| Edit role trust | On the existing role, change Trusted entity and Trusted IAM user, then Save trust. No deletion/recreation is needed. |
| Switch role | Obtain a temporary session using the role's permissions. |
| Modify an instance's IAM role | Associate an instance profile so the application can use role credentials. |

The picture summaries show these concepts. They are examples, not diagrams of the current account.

## Deliberate simplifications

This is an independent AWS-console-style training app, not an exact replica or a live AWS connection. The fake account ID is `123456789012`. All storage is in your browser. Reloading restores resources and exercises but returns you to Lab administrator; role sessions last 15 minutes within a tab. Use one console tab at a time because separate tabs do not merge changes.

- IAM and EC2 administration use an instructor shortcut; learner administration permissions and `iam:PassRole` are not evaluated. In AWS, these operations need their own permissions.
- S3 supports bucket-name listing, bucket location, prefix listing, and text object reads/uploads/deletes. Buckets always block public access. Names need only be unique in this practice account. Bucket policies, ACLs, encryption/KMS, versioning and cross-account access are not modelled.
- IAM evaluates the supported identity-policy subset only. SCPs, permissions boundaries, session policies, arbitrary conditions, Identity Center and real authentication are outside this console. Unsupported policy syntax is rejected by the shared engine.
- The user-role exercise uses account-delegation trust restricted to a specific user, plus MFA. That pattern requires caller permission and matching trust. This is not a universal claim that every same-account trust pattern needs a separate caller Allow.
- The EC2 role wizard creates a same-named instance profile. Editing trust to EC2 also creates one if missing, as a simulator convenience. Editing trust away from EC2 preserves that profile and any instance associations, but subsequent simulated EC2 credential requests fail until EC2 trust is restored. These associations survive reload. Existing simulated user role sessions retain their lifetime; editing trust is not session revocation. Applications use the role's S3 permissions; the role trusts EC2, not S3. No instance, network, operating system or actual temporary credentials are provisioned.
- The read template includes bucket location and object listing for navigation. The optional bucket-name permission reveals all practice bucket names, but does not grant object access. Read/upload does not grant delete.
- Guided milestones remain checked after completion so you can continue experimenting. Reset clears this console only and never cleans up real AWS resources.

## AWS references

- [Use roles with EC2 applications](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)
- [EC2 roles and instance profiles](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)
- [Use temporary credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html)

For manual practice in your own AWS account, return to the original lab's **In my AWS account** track. Actions in this practice console never apply to AWS.
