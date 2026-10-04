# Practice console

Open **CONSOLE.html**, or select **Practice console** in the original lab to open it in another tab. No installation or AWS account is required. The original learning lab remains available with its own progress.

## Start here

1. Stay signed in as **Lab administrator** while creating resources.
2. Follow the coach's **Users × buckets** path. Create two private buckets with `example.txt`, two users, two groups, and two read policies. The coach provides the exact names.
3. Use **Practice as identity** to switch users. Try reading from both buckets and uploading. Every request shows the evaluated action, resource and policy trace.
4. Change group membership to transfer a user's job (RBAC). Add an explicit Deny and test again.
5. Choose **Assume roles & EC2** in the coach. Create a user-trusted role, grant permission to assume it, and switch role with simulated MFA. Then create an EC2 instance, associate a service role, and grant scoped S3 access.

Use **Free practice** to try your own names and policies. **Request history** keeps the last 100 requests. Restart with the coach's **Restart this practice** button to repeat from an empty account.

## What each operation means

| Console operation | Meaning |
| --- | --- |
| Create user | Create an identity; no permissions are granted automatically. |
| Add user to group | Share that group's attached policies with the user. |
| Create policy | Define rules; they take effect only when attached. |
| Attach policy | Give a user, group or role those permission rules. |
| Create role | Define a trusted caller and a separate set of permissions. |
| Switch role | Obtain a temporary session using the role's permissions. |
| Modify an instance's IAM role | Associate an instance profile so the application can use role credentials. |

The picture summaries show these concepts. They are examples, not diagrams of the current account.

## Deliberate simplifications

This is an independent AWS-console-style training app, not an exact replica or a live AWS connection. The fake account ID is `123456789012`. All storage is in your browser. Reloading restores resources and exercises but returns you to Lab administrator; role sessions last 15 minutes within a tab. Use one console tab at a time because separate tabs do not merge changes.

- IAM and EC2 administration use an instructor shortcut; learner administration permissions and `iam:PassRole` are not evaluated. In AWS, these operations need their own permissions.
- S3 supports bucket-name listing, bucket location, prefix listing, and text object reads/uploads/deletes. Buckets always block public access. Names need only be unique in this practice account. Bucket policies, ACLs, encryption/KMS, versioning and cross-account access are not modelled.
- IAM evaluates the supported identity-policy subset only. SCPs, permissions boundaries, session policies, arbitrary conditions, Identity Center and real authentication are outside this console. Unsupported policy syntax is rejected by the shared engine.
- The user-role exercise uses account-delegation trust restricted to a specific user, plus MFA. That pattern requires caller permission and matching trust. This is not a universal claim that every same-account trust pattern needs a separate caller Allow.
- The EC2 role wizard creates a same-named instance profile. Applications use the role's S3 permissions; the role trusts EC2, not S3. No instance, network, operating system or actual temporary credentials are provisioned.
- The read template includes bucket location and object listing for navigation. The optional bucket-name permission reveals all practice bucket names, but does not grant object access. Read/upload does not grant delete.
- Guided milestones remain checked after completion so you can continue experimenting. Reset clears this console only and never cleans up real AWS resources.

## AWS references

- [Use roles with EC2 applications](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)
- [EC2 roles and instance profiles](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)
- [Use temporary credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html)

For manual practice in your own AWS account, return to the original lab's **In my AWS account** track. Actions in this practice console never apply to AWS.
