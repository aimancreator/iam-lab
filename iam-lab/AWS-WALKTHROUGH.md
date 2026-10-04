# AWS account walkthrough

For the separate **RBAC workshop**, open `index.html#rbac` and select **Matching AWS steps**. It has two learners, three job-function groups, two private buckets, generated policies that mirror the local assignments, and its own cleanup. See `RBAC.md`. Local changes never update AWS automatically.

For the separate **tranttuan96/aws-labs Lab 01** adaptation, open `index.html#repo` and select **Matching AWS steps**. It has its own configuration and six-step workflow, including CLI AssumeRole, IAM Policy Simulator, and non-deploying Access Analyzer previews. See `UPSTREAM.md` for the source mapping and safety changes. The original walkthrough below remains available.

Use the **In my AWS account** tab in `index.html` for the full interactive checklist and personalized JSON documents. This is a companion reference.

You perform these actions in AWS. The local lab does not create, inspect, or delete cloud resources.

## Prepare

Use a practice AWS account and an existing administrator identity, preferably through IAM Identity Center. You need IAM and S3 setup and cleanup permissions. Keep the administrator session in one browser profile and the learner in another.

In the lab page, enter your 12-digit account ID and a new, globally unique bucket name. The examples target the commercial `aws` partition.

Create a general purpose S3 bucket with public access blocked, ACLs disabled, versioning off, and SSE-S3 encryption. Use tiny fictional files:

    YOUR-LAB-BUCKET/
      training/welcome.txt
      training/uploads/starter.txt
      private/notes.txt

The sample files are in `samples/`. Create the folders in S3, then upload the files into the corresponding folders. IAM has no additional charge, but S3 storage and requests may incur charges. Clean up when finished.

## Create the user and group

1. As administrator, create `lab-learner` in IAM. Enable console access and require a password change at first sign-in. Keep its credentials in your password manager.
2. AWS may add the managed `IAMUserChangePassword` policy for the password reset; it does not grant S3 access. If your account needs additional self-password-change setup, have the administrator complete it before the first sign-in.
3. As administrator, enrol an MFA device under the user's Security credentials.
4. In the separate learner browser profile, sign in, change the initial password, and authenticate using MFA. Create no access keys.
5. In the administrator session, create `lab-readers` and add `lab-learner` as a member.

A group has no credentials. Membership alone grants no access until a policy is attached.

## Attach the reader policy

In the lab page, copy the generated **LabReadTraining** document. Create a customer managed policy with that name under IAM → Policies → Create policy → JSON. Attach it to `lab-readers`.

The policy allows S3 console navigation, root folder listing, listing the `training/` prefix, and reading objects under `training/*`. It explicitly denies deleting any object or object version in the lab bucket.

The console navigation permissions expose bucket names and parent folder names. They do not allow reading the private objects.

## Verify restrictions

As the learner:

| Request | Expected |
| --- | --- |
| Download `training/welcome.txt` | Allowed |
| Open/list `private/` | Denied by the list-prefix condition |
| Upload into `training/uploads/` | Implicit deny: no upload allow |
| Delete `training/uploads/starter.txt` | Explicit deny |

For a precise `GetObject` test against `private/notes.txt`, use the administrator's [AWS IAM Policy Simulator](https://policysim.aws.amazon.com/). Select the learner, Amazon S3, GetObject, and the exact object ARN. It should be denied. The training object ARN should be allowed.

For ListBucket simulations, use the bucket ARN and provide `s3:prefix` and `s3:delimiter` context. Policy simulation does not access real S3 objects and does not establish that role trust works.

## Create the role

Use the three remaining documents from the local lab page:

1. **LabUploadTraining**: create a customer managed policy. It allows reading and uploading only under `training/uploads/*`, supplies navigation/listing permissions, and explicitly denies deletion.
2. **LabUploaderTrust**: paste this under IAM → Roles → Create role → Custom trust policy. Attach LabUploadTraining and name the role `lab-uploader`. The trust document is stored on the role, not created as a managed permissions policy.
3. **LabAssumeUploader**: create this customer managed policy and attach it to `lab-readers`. It allows `sts:AssumeRole` only on the new role's ARN.

The role trust uses your account principal (`arn:aws:iam::ACCOUNT_ID:root`), then narrows the caller to the learner's ARN and requires MFA. Here, `:root` represents delegation to the account, not just the root user. This pattern needs the caller permission as well as trust.

## Assume and compare

In the learner's MFA-authenticated console session, open the identity menu and select Switch role. With multi-session support, use Add session → Switch role. Enter your account ID and `lab-uploader`.

Verify that the identity menu shows the role.

| Request as the role | Expected |
| --- | --- |
| Upload a tiny `notes.txt` into `training/uploads/` | Allowed |
| Download `training/uploads/starter.txt` | Allowed |
| Download `training/welcome.txt` | Implicit deny |
| Delete `training/uploads/notes.txt` | Explicit deny |

Switch back to the learner. The learner can read welcome.txt again and can no longer upload.

The role's permissions replace the user's permissions for that session. A group deny is not automatically inherited by a role, which is why the role has its own deletion deny.

If assumption fails, verify the exact trust ARN, caller policy attachment, membership, and MFA sign-in. Enrolling MFA does not retroactively make an existing sign-in MFA-authenticated; sign out and sign back in.

## Troubleshooting

- IAM changes can take time to propagate. Refresh and verify the active identity.
- Policy resource names must exactly match the bucket and object keys.
- Other attached policies can add permissions; use fresh lab identities.
- SCPs, permissions boundaries, bucket policies, KMS encryption, and service-specific rules can affect live results beyond the local teaching model.
- S3 consoles may show warnings for optional panels requiring additional permissions. Evaluate the specific file operations in this lab.
- Existing assumed-role sessions may remain valid after changing the caller's group membership. Switch back before testing a new assumption.

## Optional: EC2 application role, before cleanup

Use Mission 8 for a local simulation first. The AWS account tab includes the full optional EC2 checklist immediately before the core cleanup.

1. Generate the policies in the lab page. Create the customer managed policy **LabEC2ReadTraining** from its JSON.
2. As administrator, create an IAM role with **AWS service → EC2** as the trusted entity. Attach LabEC2ReadTraining and **AmazonSSMManagedInstanceCore**, then name it `lab-ec2-reader`. The SSM policy supports the terminal connection; it does not grant access to your lab S3 files.
3. The console creates a same-named instance profile containing this role. Verify that the trust policy permits `ec2.amazonaws.com`. The generated **LabEC2Trust** document shows this policy; it is a role trust relationship, not a managed permissions policy.
4. Launch a dedicated small EC2 instance named `IAMFieldLabEC2`, using the standard Amazon Linux 2023 AMI in the bucket's region. Check the displayed price. EC2, EBS, and public IPv4 usage can incur charges.
5. For Session Manager, use a subnet with connectivity to SSM and S3. The guide's simple setup uses a public subnet with an internet-gateway route, an assigned public IPv4 address, no inbound security-group rules, and outbound HTTPS on port 443. If that network is unavailable, use your administrator's approved equivalent.
6. Under Advanced details, select the `lab-ec2-reader` instance profile. Require IMDSv2 and keep metadata enabled. Use a small root EBS volume with Delete on termination enabled. SSH keys and inbound SSH are unnecessary for Session Manager.
7. Once the instance is running and registered with Systems Manager, choose Connect → Session Manager. The administrator needs EC2/Session Manager permissions and `iam:PassRole` for the role. A missing agent, role permission, or network route can prevent connection.

Inside the fresh instance's terminal, set the bucket and region to your actual values:

    export IAM_LAB_BUCKET=YOUR-LAB-BUCKET
    export AWS_DEFAULT_REGION=ap-southeast-1
    aws sts get-caller-identity

Expect an ARN containing `assumed-role/lab-ec2-reader/`. The SDK/CLI obtains temporary credentials for the associated role automatically. Do not configure IAM user access keys.

These should succeed:

    aws s3api get-object --bucket "$IAM_LAB_BUCKET" --key training/welcome.txt /tmp/iam-lab-welcome.txt
    aws s3api list-objects-v2 --bucket "$IAM_LAB_BUCKET" --prefix training/

These should return AccessDenied:

    aws s3api get-object --bucket "$IAM_LAB_BUCKET" --key private/notes.txt /tmp/iam-lab-private.txt
    aws s3api put-object --bucket "$IAM_LAB_BUCKET" --key training/uploads/ec2-note.txt --body /tmp/iam-lab-welcome.txt

The role allows training reads and listing, but has no Allow for private reads or uploads. Listing uses the bucket ARN and a prefix condition; reading uses an object ARN. Other policies and account controls can change live results.

**Attach** means attach the permissions policy to the role. **Associate** means make the instance profile available to EC2. **Assume** means obtain temporary role credentials. EC2 is the trusted service because it needs the role; S3 is the destination named in the permissions policy. Launching an instance as an administrator does not transfer that administrator's permissions to its applications.

Clean up the extension first:

1. End the terminal session. Terminate IAMFieldLabEC2 and wait for termination.
2. Verify the root EBS volume was deleted. Delete any volume retained from this lab and its unused lab-only security group.
3. Detach the two policies from lab-ec2-reader, then delete that role and its same-named instance profile. The IAM console normally deletes both together; verify the profile is gone.
4. Delete the customer managed LabEC2ReadTraining policy. Keep the AWS managed SSM policy.
5. Continue with the original lab cleanup below.

## Cleanup as administrator

1. Switch back and sign out of the learner session.
2. Empty and delete only the lab bucket. If versioning was enabled, also remove all versions and delete markers.
3. Deactivate the learner's MFA, remove its lab sign-in credentials, and delete `lab-learner`. Remove the unused virtual MFA device and its local authenticator entry if applicable.
4. Detach LabReadTraining and LabAssumeUploader, then delete the empty `lab-readers` group.
5. Detach LabUploadTraining and delete `lab-uploader`.
6. Delete the three customer managed policies. The trust document disappears with its role. Do not delete AWS managed policies.
7. Remove saved lab passwords and confirm the named resources are gone.

Resetting the local simulator does not clean up AWS.

See `README.md` for links to the official AWS documentation.

## Independent extension: two users × three buckets

Open `index.html#matrix`, then **Open AWS multi-user lab**. This lesson needs no core resources, EC2 instance, or role. The page is a local simulator and policy generator, not a live AWS connection.

1. Use an existing administrator in a practice account. In the extension's form, enter three distinct, globally unique bucket names: A, B, and Shared. Create them as general purpose buckets in the shared global namespace, in the same region. Keep public access blocked, ACLs disabled, versioning off, and SSE-S3 encryption. Add no bucket policies. Upload `samples/example.txt` to the root of each bucket.
2. Create fresh console IAM users `matrix-user-a` and `matrix-user-b` with strong passwords, first-sign-in password changes, and MFA. Keep IAMUserChangePassword if needed; grant no broad S3 or administrator policies. Create no access keys. Use separate browser profiles for administrator, A, and B; confirm the active identity before every request.
3. Create group `matrix-shared-readers` with both users. In the local extension choose **Own buckets**. Create the three generated customer managed policies: attach `MatrixUserA` directly to A, `MatrixUserB` directly to B, and `MatrixSharedRead` to the group. Paste each individual JSON document, not the complete download bundle.
4. In each user's S3 session, try opening all three buckets and downloading `example.txt`. Baseline results:

| User | Bucket A | Bucket B | Shared |
| --- | --- | --- | --- |
| A | Read/list allowed | Denied | Read/list allowed via group |
| B | Denied | Read/list allowed | Read/list allowed via group |

Both users can see bucket names through ListAllMyBuckets; this does not grant access to contents. Neither can upload or delete in the baseline. A denied bucket listing stops console navigation before the file request.

5. Choose **Swap A ↔ B**, then edit both user policies in AWS and save the new default versions. A now reads B but not A; B reads A but not B. The buckets belong to the account, not to the similarly named users.
6. Restore **Own buckets** and apply it in AWS. Remove A from the shared-readers group. A loses Shared access; B keeps it. Uncheck A's membership in the simulator to compare. If a direct user policy also grants Shared access, removing group membership alone will not remove that access.
7. Choose **Deny shared**, update the AWS user policies, and put A back in the group. A's explicit Deny overrides the group's Allow on Shared; B remains allowed.
8. Choose **Upload contrast** and apply both user policies. A can upload a tiny `upload-probe.txt` into B's bucket; B can read B but cannot upload. Both lack DeleteObject permission.

Use Mission 9's individual grant and deny controls for custom combinations, then return to the AWS extension for matching JSON and group membership. Always replace the intended policy version instead of keeping old grants in additional policies. Allow for IAM propagation. Existing policies, resource policies, boundaries, SCPs/RCPs, KMS, missing objects, or an unexpected active identity may change real results.

For exact action/resource authorization checks, use the administrator's [AWS IAM Policy Simulator](https://policysim.aws.amazon.com/): select the user and S3 action. GetObject uses `arn:aws:s3:::BUCKET-NAME/example.txt`; ListBucket uses `arn:aws:s3:::BUCKET-NAME`. Policy simulation does not perform a live S3 request.

**Cleanup:** sign out of A and B. As administrator, empty and delete only the three new buckets, including probe files. Remove the users from the group, detach their policies, remove console credentials, deactivate MFA, and delete the users. Remove unused virtual MFA devices and local password/authenticator entries. Detach the group policy; delete the group and all three customer managed policies. Leave AWS managed policies intact. Verify the extension's resources are gone.

The six checkboxes in this extension are your manual confirmations, not AWS verification. Its bucket settings and checklist are separate from the original lab. Restarting the simulator never deletes AWS resources.
