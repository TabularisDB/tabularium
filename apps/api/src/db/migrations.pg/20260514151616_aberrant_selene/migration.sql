CREATE TABLE "plugin_request_claims" (
	"request_id" text,
	"user_id" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "plugin_request_claims_pkey" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "plugin_request_claims" ADD CONSTRAINT "plugin_request_claims_request_id_plugin_requests_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plugin_requests"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plugin_request_claims" ADD CONSTRAINT "plugin_request_claims_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;