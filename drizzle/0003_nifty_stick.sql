CREATE TABLE `accounts` (
	`slot` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`invitation_hash` text,
	`invitation_expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "two_account_slots" CHECK("accounts"."slot" IN (1, 2))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_id_unique` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_invitation_hash_unique` ON `accounts` (`invitation_hash`);--> statement-breakpoint
CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
