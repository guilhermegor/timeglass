# Releasing 1.0.0

1.0.0 is the moment this library promises its public API. Until then the 0.x rules apply: a
breaking change is a MINOR bump, a feature or fix is a PATCH. From 1.0.0 on, full semver
applies. Two things must be true at that moment and are easy to get wrong by hand: the
backlog is done, and the docs describe the code that actually ships.

## The path

1. Open the **Cut 1.0.0** issue from the issue template. It is created `state:blocked`, blocked by
   every other open issue.
2. Implement the backlog. An issue that will not make 1.0.0 gets the `post-1.0` label, set by
   the owner (create it once with `gh label create post-1.0`), so it is deferred on the record rather than dropped.
3. Work the issue's checklist: the docs audit, runnable examples, the 1.x supported-versions
   table in `SECURITY.md`, then the rehearsal and publish.
4. After the release, switch the documented version policy to full semver.

## The release gate

The release workflow runs `bin/check_release_gate.py` before it publishes. It applies only
when the requested MAJOR is at least 1 and the latest published version is 0.x. In that case
it lists the open issues and fails while any lacks the `post-1.0` label, naming each one.

- Pull requests are not counted, and neither is the **Cut 1.0.0** issue itself.
- The issues are read through the GitHub REST API with the workflow token, read-only.
- If the API cannot be read, the gate fails closed: it blocks the release rather than guess.
- Every other bump, such as 0.4.0 to 0.5.0 or 1.0.0 to 1.0.1, is untouched.
- A first publish counts as coming from 0.0.0, so a project whose first release is 1.0.0 is gated too.

To pass, implement each named issue or label it `post-1.0`, then re-run the workflow.
