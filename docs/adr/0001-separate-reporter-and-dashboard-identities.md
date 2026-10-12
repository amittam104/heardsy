# Keep reporter identity separate from Heardsy dashboard accounts

The Private Feedback Widget accepts feedback without asking reporters to log into Heardsy or create a Heardsy account; the consuming application may require its own login or accept visitors. Workspace admins and authorized teammates use Heardsy accounts to review private feedback. Requiring the existing public-board account flow for reporters would introduce the extra login the user explicitly rejected and mix the submission and review identities; this boundary applies to both app-authenticated and visitor submissions.
