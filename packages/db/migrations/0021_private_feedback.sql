ALTER TABLE `membership` ADD `private_access` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `membership` ADD `notify_private_feedback` integer;
--> statement-breakpoint
ALTER TABLE `invite` ADD `private_access` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `private_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`reporter_name` text NOT NULL,
	`reporter_email` text NOT NULL,
	`metadata` text,
	`images` text DEFAULT '[]' NOT NULL,
	`images_size` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`assignee_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`status_changed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_feedback_submission_idx` ON `private_feedback` (`workspace_id`,`submission_id`);
--> statement-breakpoint
CREATE INDEX `private_feedback_created_idx` ON `private_feedback` (`workspace_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `private_feedback_status_idx` ON `private_feedback` (`workspace_id`,`status`);
--> statement-breakpoint
CREATE INDEX `private_feedback_assignee_idx` ON `private_feedback` (`assignee_id`);
--> statement-breakpoint
CREATE TABLE `private_feedback_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feedback_id` text NOT NULL,
	`actor_id` text,
	`type` text NOT NULL,
	`body` text,
	`from_value` text,
	`to_value` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `private_feedback`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `private_feedback_activity_feedback_idx` ON `private_feedback_activity` (`feedback_id`);
--> statement-breakpoint
CREATE TABLE `private_widget` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`settings` text,
	`origins` text,
	`logo_id` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
