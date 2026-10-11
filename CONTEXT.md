# Heardsy Feedback

Heardsy collects feedback for application teams. Public feedback supports community participation; private feedback is submitted by application users or visitors and reviewed by the receiving application's authorized team.

## Language

**Application**:
The product or site that embeds a Heardsy widget and decides who may submit through it.
_Avoid_: Heardsy workspace when referring to the application's customer workspaces

**Heardsy workspace**:
The destination that owns one application's feedback and its receiving team in Heardsy. Each application uses its own Heardsy workspace.
_Avoid_: Application workspace

**Reporter**:
A person who submits private feedback, whether a logged-in application user or a visitor. Reporter identity is separate from a Heardsy dashboard account.
_Avoid_: Heardsy member when referring to a reporter

**Reporter contact details**:
The required name and email supplied with a private feedback submission. They may be prefilled by the consuming app and edited by the reporter, so they are not identity independently verified by Heardsy.
_Avoid_: Verified identity

**Application workspace**:
A customer or tenant workspace inside the consuming application. Its identifier is one possible item of optional submission metadata, independently of the receiving Heardsy workspace.
_Avoid_: Heardsy workspace

**Submission metadata**:
Optional context deliberately supplied by the consuming application with a report, such as a customer workspace identifier, plan, or app version. Each application chooses its own context; it is distinct from the reporter's contact fields and the receiving Heardsy workspace.
_Avoid_: Widget settings, required workspace ID

**Widget appearance**:
The private widget's visible wording, logo, colors, size, and placement.
_Avoid_: Submission metadata, team access permissions

**Widget size preset**:
Small, Medium, or Large sizing for the feedback panel, fitted to the available screen.
_Avoid_: Arbitrary panel dimensions, individual input sizing

**Appearance override**:
An installation-specific appearance choice supplied by the consuming app that takes precedence over a saved dashboard default.
_Avoid_: Permission override

**Workspace admin**:
A person authorized to manage a Heardsy workspace and its receiving team.
_Avoid_: Application admin when referring to Heardsy permissions

**Teammate**:
A person explicitly authorized by a workspace admin to read that workspace's private feedback, add internal notes, change its status, and customize private widget text and appearance.
_Avoid_: Public board member when referring to private feedback access

**Assignee**:
The optional authorized teammate responsible for handling a private feedback report. Other authorized reviewers retain access to the report.
_Avoid_: Owner when referring only to responsibility for an individual report

**Internal note**:
A team's discussion or update attached to private feedback and visible to its authorized reviewers.
_Avoid_: Reporter reply

**Closing feedback**:
Marking a report closed while keeping its submitted information and history available to authorized reviewers.
_Avoid_: Deletion

**Public Feedback Widget**:
The existing widget for public feedback board participation, roadmap, and changelog content.
_Avoid_: Private Feedback Widget

**Private Feedback Widget**:
A separate widget for application users or visitors to submit feedback without a Heardsy login. Its submissions are readable only by the receiving workspace's authorized team within Heardsy; the consuming app decides whether its own login is required to submit.
_Avoid_: Anonymous widget, public feedback board

**Private feedback**:
A bug report or feature request received through the Private Feedback Widget, with reporter contact information and optional attachments, reviewed by the receiving workspace's authorized team.
_Avoid_: Public board post

**Original submission**:
The reporter's title, message, and contact details as received, preserved alongside the team's subsequent notes and workflow updates.
_Avoid_: Editable team summary
